import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { colors, radius, space, themed } from '@/theme';
import { Header, Screen } from '@/components/Screen';
import { Button, Icon, T } from '@/components/ui';
import { toast } from '@/components/Dialog';
import { useProfile } from '@/stores/profile';
import { useBody } from '@/stores/body';
import { usePlan } from '@/stores/plan';
import { applyProfile } from '@/features/profile/applyProfile';
import { analyzeBody, BF_LEVEL_LABEL, bfLevel, ZONE_LABEL } from '@/features/progress/body';
import { computeNutritionTarget } from '@/features/nutrition/targets';
import { VM_LABEL } from '@/features/training/engine/muscles';
import { getPrefs, withPrefs } from '@/features/training/engine/prefs';
import { ISSUE_TEXT, measureFront, measureSide, scanResult, SITE_LABEL, SCAN_SITES, type ScanResult, type ScanView } from '@/features/body/scan';
import ScanEngine from '@/features/body/ScanEngine';
import { haptic } from '@/services/haptics';
import { today } from '@/utils/date';
import type { UserProfile } from '@/types';

/** Сколько подходов в неделю добавляет акцент на отстающие зоны (как на экране «Тело») */
const FOCUS_SETS = 2;
const fmt = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');

type Step = 'intro' | 'front' | 'side' | 'busy' | 'result' | 'retry';

const SHOT: Record<'front' | 'side', { title: string; tips: string[] }> = {
  front: {
    title: 'Фото 1 — лицом к камере',
    tips: ['Встань прямо, стопы на ширине плеч', 'Руки отведи от тела буквой «А» — между рукой и талией должен быть просвет', 'В кадре весь рост: от макушки до стоп, с запасом'],
  },
  side: {
    title: 'Фото 2 — боком',
    tips: ['Повернись боком к камере', 'Руки вытяни вперёд на уровне плеч', 'Стой ровно, не втягивай живот'],
  },
};

/**
 * Скан тела камерой: два фото (спереди и боком) → силуэт и скелет на устройстве (ScanEngine) → обхваты по силуэту
 * и процент жира по формуле ВМС США — диапазоном (scan.ts). Фото обрабатываются на телефоне и не сохраняются.
 * Результат: замеры в «Тело», калории — по сухой массе (Кэтч — Макардл), акцент тренировок на отстающие зоны.
 */
export default function BodyScan() {
  const profile = useProfile((s) => s.profile);
  const [step, setStep] = useState<Step>('intro');
  const [front, setFront] = useState('');
  const [side, setSide] = useState('');
  const [job, setJob] = useState(0);
  const [res, setRes] = useState<ScanResult | null>(null);
  const [error, setError] = useState('');
  const [focus, setFocus] = useState(true);

  const capture = async (kind: 'front' | 'side', camera: boolean) => {
    try {
      const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return toast('Нет доступа — разреши в Настройках', 'alert-circle');
      const r = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 1 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 1 });
      if (r.canceled || !r.assets?.[0]) return;
      // уменьшаем до 1280 px по высоте: точности хватает, данные в распознавание — сотни килобайт
      const img = await ImageManipulator.manipulate(r.assets[0].uri).resize({ height: 1280 }).renderAsync();
      const out = await img.saveAsync({ base64: true, compress: 0.85, format: SaveFormat.JPEG });
      const uri = `data:image/jpeg;base64,${out.base64}`;
      haptic.tap();
      if (kind === 'front') {
        setFront(uri);
        setStep('side');
      } else {
        setSide(uri);
        setStep('busy');
        setJob(Date.now());
      }
    } catch (e: any) {
      toast(e?.message ?? 'Не удалось получить фото', 'alert-circle');
    }
  };

  const onResult = useCallback(
    async (r: { front: ScanView | null; side: ScanView | null; error?: string }) => {
      if (!profile) return;
      if (r.error) {
        setError(`Распознавание не загрузилось: ${r.error}. Нужен интернет при первом скане — модель скачивается один раз.`);
        setRes(null);
        setStep('retry');
        return;
      }
      const f = r.front ? measureFront(r.front, profile.heightCm, profile.sex) : { issues: ['no_person' as const], scale: 0, level: {}, width: {} };
      const s = r.side ? measureSide(r.side, profile.heightCm, f.level) : { issues: ['no_person' as const], depth: {} };
      const out = scanResult(f, s, profile.sex, profile.heightCm);
      setRes(out);
      setError('');
      setStep(out.bodyFat ? 'result' : 'retry');
      haptic[out.bodyFat ? 'success' : 'warning']?.();
    },
    [profile],
  );

  // Что скан меняет: зоны по пропорциям, калории по сухой массе
  const d = today();
  const weights = useBody((s) => s.weights);
  const weightKg = weights.length ? weights[weights.length - 1].kg : (profile?.weightKg ?? 0);
  // текущая норма (с поправкой по факту) — от неё показываем, на сколько изменит расчёт по сухой массе
  const current = usePlan((s) => s.target?.kcal);
  const preview = useMemo(() => {
    if (!profile || !res?.bodyFat) return null;
    const metrics = SCAN_SITES.filter((k) => res.girths[k]).map((k, i) => ({ id: `scan${i}`, date: d, kind: k, value: res.girths[k]!.value, source: 'scan' as const }));
    const a = analyzeBody({ sex: profile.sex, age: profile.age, heightCm: profile.heightCm, weightKg, metrics, today: d });
    const bf = { ...res.bodyFat, method: 'scan' as const, date: d };
    const before = computeNutritionTarget(profile, { weightKg });
    const after = computeNutritionTarget({ ...profile, bodyFat: bf }, { weightKg });
    const muscles = [...new Set(a.focus.slice(0, 3).flatMap((x) => x.muscles))];
    const from = current ?? before.kcal;
    return { metrics, a, bf, kcalFrom: from, kcalTo: Math.round((from + after.kcal - before.kcal) / 10) * 10, muscles };
  }, [profile, res, d, weightKg, current]);

  const save = () => {
    if (!profile || !preview) return;
    const body = useBody.getState();
    for (const m of preview.metrics) body.addMetric({ date: m.date, kind: m.kind, value: m.value, source: 'scan' });
    let next: UserProfile = { ...profile, bodyFat: preview.bf, updatedAt: Date.now() };
    if (focus && preview.muscles.length) {
      const prefs = getPrefs(next);
      const adj = { ...prefs.volumeAdjust };
      for (const m of preview.muscles) adj[m] = Math.max(adj[m] ?? 0, FOCUS_SETS);
      next = withPrefs(next, { volumeAdjust: adj });
    }
    applyProfile(next);
    haptic.success();
    toast('Скан сохранён: замеры, калории и план обновлены', 'checkmark-circle');
    router.back();
  };

  if (!profile) return null;
  return (
    <Screen>
      <Header title="Скан тела" />
      {step === 'intro' ? (
        <View style={{ gap: space.md }} testID="scan-intro">
          <T v="body">
            Два фото — спереди и боком. По силуэту посчитаем обхваты шеи, груди, талии и бёдер, а по ним — процент жира (формула ВМС США) диапазоном.
            Отстающие зоны — по пропорциям, калории — по сухой массе.
          </T>
          <View style={styles.card}>
            {['Облегающая одежда или бельё — мешковатые вещи искажают силуэт', 'Ровный свет и однотонный фон за спиной', 'Телефон на уровне пояса, в 2–3 м: попроси кого-нибудь снять или поставь телефон и включи таймер'].map((x) => (
              <View key={x} style={styles.tip}>
                <Icon name="checkmark-circle" size={18} color={colors.accent} />
                <T v="callout" color={colors.text} style={{ flex: 1 }}>
                  {x}
                </T>
              </View>
            ))}
          </View>
          <View style={[styles.tip, { paddingHorizontal: 4 }]}>
            <Icon name="lock-closed" size={16} color={colors.textDim} />
            <T v="small" style={{ flex: 1 }}>
              Фото обрабатываются на телефоне и не сохраняются. При первом скане скачивается модель распознавания (нужен интернет).
            </T>
          </View>
          <Button title="Начать" icon="camera" size="lg" onPress={() => setStep('front')} testID="scan-start" />
        </View>
      ) : null}

      {step === 'front' || step === 'side' ? (
        <View style={{ gap: space.md }} testID={`scan-${step}`}>
          <T v="h2">{SHOT[step].title}</T>
          {step === 'side' && front ? <Image source={{ uri: front }} style={styles.thumb} accessibilityLabel="Фото спереди" /> : null}
          <View style={styles.card}>
            {SHOT[step].tips.map((x, i) => (
              <View key={x} style={styles.tip}>
                <T v="callout" style={styles.num}>
                  {i + 1}
                </T>
                <T v="callout" color={colors.text} style={{ flex: 1 }}>
                  {x}
                </T>
              </View>
            ))}
          </View>
          <Button title="Сфотографировать" icon="camera" size="lg" onPress={() => void capture(step, true)} />
          <Button title="Выбрать из галереи" icon="images-outline" variant="secondary" onPress={() => void capture(step, false)} />
        </View>
      ) : null}

      {step === 'busy' ? (
        <View style={{ alignItems: 'center', gap: space.md, paddingVertical: 60 }} testID="scan-busy">
          <ActivityIndicator color={colors.accent} size="large" />
          <T v="body">Распознаём силуэт и считаем обхваты…</T>
          <ScanEngine front={front} side={side} job={job} onResult={onResult} dom={{ style: { width: 1, height: 1, opacity: 0 }, scrollEnabled: false }} />
        </View>
      ) : null}

      {step === 'retry' ? (
        <View style={{ gap: space.md }} testID="scan-retry">
          <T v="h2">Посчитать не получилось</T>
          <T v="body">Числа «на глаз» не показываем — переснимите с учётом подсказок:</T>
          <View style={styles.card}>
            {(error ? [error] : (res?.issues ?? ['no_person']).map((i) => ISSUE_TEXT[i])).map((x) => (
              <View key={x} style={styles.tip}>
                <Icon name="alert-circle" size={18} color={colors.warning} />
                <T v="callout" color={colors.text} style={{ flex: 1 }}>
                  {x}
                </T>
              </View>
            ))}
          </View>
          <Button title="Переснять" icon="camera" size="lg" onPress={() => setStep('front')} />
        </View>
      ) : null}

      {step === 'result' && res?.bodyFat && preview ? (
        <View style={{ gap: space.md }} testID="scan-result">
          <View style={{ gap: 4 }}>
            <T v="caption">Процент жира · оценка по силуэту</T>
            <T v="hero" style={{ fontVariant: ['tabular-nums'] }}>
              {fmt(res.bodyFat.low)}–{fmt(res.bodyFat.high)} %
            </T>
            <T v="bodyDim">
              {BF_LEVEL_LABEL[bfLevel(profile.sex, res.bodyFat.value)]} · формула ВМС США по шее, талии{profile.sex === 'female' ? ' и бёдрам' : ''}, ±5 п.п.
            </T>
          </View>
          <View style={styles.card}>
            {SCAN_SITES.filter((k) => res.girths[k]).map((k) => (
              <View key={k} style={styles.row}>
                <T v="callout" color={colors.text} style={{ flex: 1 }}>
                  {SITE_LABEL[k]}
                </T>
                <T v="callout" color={colors.text} style={{ fontVariant: ['tabular-nums'] }}>
                  {fmt(res.girths[k]!.value)} ± {fmt(res.girths[k]!.error)} см
                </T>
              </View>
            ))}
          </View>
          {preview.a.fatZones.length || preview.a.lagging.length ? (
            <View style={{ gap: 6 }}>
              {preview.a.lagging.map((z) => (
                <T key={`l${z.zone}`} v="callout" color={colors.text}>
                  Подтянуть — {ZONE_LABEL[z.zone].toLowerCase()}: {z.text}
                </T>
              ))}
              {preview.a.fatZones.map((z) => (
                <T key={`f${z.zone}`} v="callout" color={colors.textDim}>
                  Жир уходит последним — {ZONE_LABEL[z.zone].toLowerCase()}: {z.text}
                </T>
              ))}
            </View>
          ) : (
            <T v="callout" color={colors.textDim}>
              Пропорции сбалансированы — без отдельного акцента.
            </T>
          )}
          <View style={styles.card}>
            <T v="callout" color={colors.text}>
              Калории: {preview.kcalFrom} → {preview.kcalTo} ккал в день — основной обмен по сухой массе (формула Кэтча — Макардла).
            </T>
            {preview.muscles.length ? (
              <Button
                title={focus ? `Акцент в плане: +${FOCUS_SETS} подхода — ${preview.muscles.map((m) => VM_LABEL[m].toLowerCase()).join(', ')}` : 'Без акцента в плане'}
                icon={focus ? 'checkbox' : 'square-outline'}
                variant="ghost"
                onPress={() => setFocus(!focus)}
              />
            ) : null}
          </View>
          <Button title="Сохранить" icon="checkmark" size="lg" onPress={save} testID="scan-save" />
          <Button title="Переснять" icon="camera" variant="secondary" onPress={() => setStep('front')} />
          <T v="small">Оценка по силуэту, не медицинское измерение. Для точности повторяйте скан в одинаковых условиях раз в 2–4 недели.</T>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = themed({
  card: { gap: 10, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface2 },
  tip: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  num: { width: 20, color: colors.accent, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumb: { width: 72, height: 120, borderRadius: radius.md, backgroundColor: colors.surface2 },
});
