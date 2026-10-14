import React, { useMemo, useState } from 'react';
import { Image, View } from 'react-native';
import { router } from 'expo-router';
import { colors, radius, space, themed } from '@/theme';
import { Header, Screen } from '@/components/Screen';
import { Button, Icon, IconButton, T } from '@/components/ui';
import { Ambient, Appear } from '@/components/motion';
import { TrendChart } from '@/components/charts';
import { toast } from '@/components/Dialog';
import { useBody } from '@/stores/body';
import { useProfile } from '@/stores/profile';
import { analyzeBody, BF_LEVEL_LABEL, BF_METHOD_LABEL, bfLevel, combineBodyFat, mergeZones, withoutStrengths, ZONE_LABEL, ZONE_MUSCLES, type BodyZone } from '@/features/progress/body';
import { METRIC_META } from '@/features/progress/metrics';
import { metricSeries } from '@/features/progress/series';
import { PhotoCompare } from '@/features/progress/PhotoCompare';
import { VM_LABEL } from '@/features/training/engine/muscles';
import { getPrefs, withPrefs } from '@/features/training/engine/prefs';
import { applyProfile } from '@/features/profile/applyProfile';
import { GOAL_SHORT } from '@/features/nutrition/targets';
import { analyzeBodyPhotos, latestByPose, photoAnalysisAvailable } from '@/services/bodyPhoto';
import { haptic } from '@/services/haptics';
import { daysBetween, formatDayShort, today } from '@/utils/date';

const fmt = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');
const POSE = { front: 'спереди', side: 'сбоку', back: 'сзади' } as const;
const FOCUS_SETS = 2;

/**
 * Тело: процент жира диапазоном (лучший доступный способ), что подтянуть с акцентом в плане, где запас жира,
 * пропорции и замеры. Фото дополняют замеры (анализ на сервере по нажатию), а без замеров дают оценку сами.
 * Приблизительно и без медицинских выводов.
 */
export default function BodyScreen() {
  const profile = useProfile((s) => s.profile);
  const metrics = useBody((s) => s.metrics);
  const weights = useBody((s) => s.weights);
  const photos = useBody((s) => s.photos);
  const analyses = useBody((s) => s.analyses);
  const [busy, setBusy] = useState(false);
  const d = today();
  const weightKg = weights.length ? weights[weights.length - 1].kg : (profile?.weightKg ?? 0);
  const a = useMemo(() => (profile ? analyzeBody({ sex: profile.sex, age: profile.age, heightCm: profile.heightCm, weightKg, metrics, weights, today: d }) : null), [profile, weightKg, metrics, weights, d]);
  const photo = analyses.length ? analyses[analyses.length - 1] : null;
  const fresh = photo && daysBetween(photo.date, d) <= 60 ? photo : null;
  const bf = a ? combineBodyFat(a.bodyFat, fresh?.bodyFat) : null;
  const level = bf && profile ? bfLevel(profile.sex, bf.value) : a?.level;

  // Что подтянуть: отстающие по замерам + акценты по фото, одним списком
  const improve = useMemo(() => {
    if (!a) return [];
    const z = withoutStrengths(mergeZones(a.lagging, [...(fresh?.lagging ?? []), ...(fresh?.focus ?? [])]), fresh?.strengths);
    return z.map((x) => ({ ...x, muscles: ZONE_MUSCLES[x.zone] ?? [] }));
  }, [a, fresh]);
  const fat = useMemo(() => (a ? mergeZones(a.fatZones, fresh?.fatZones) : []), [a, fresh]);
  const focusMuscles = [...new Set(improve.slice(0, 3).flatMap((x) => x.muscles))];
  const prefs = profile ? getPrefs(profile) : null;
  const focused = !!prefs && focusMuscles.length > 0 && focusMuscles.every((m) => (prefs.volumeAdjust[m] ?? 0) >= FOCUS_SETS);

  const toggleFocus = () => {
    if (!profile || !prefs) return;
    const next = { ...prefs.volumeAdjust };
    for (const m of focusMuscles) next[m] = focused ? Math.max(0, (next[m] ?? 0) - FOCUS_SETS) : Math.max(next[m] ?? 0, FOCUS_SETS);
    applyProfile(withPrefs(profile, { volumeAdjust: next }));
    haptic.success();
    toast(focused ? 'Акцент убран из плана' : `+${FOCUS_SETS} подхода в неделю: ${focusMuscles.map((m) => VM_LABEL[m].toLowerCase()).join(', ')}`, 'checkmark-circle');
  };

  const runPhoto = async () => {
    if (!profile || !a) return;
    setBusy(true);
    try {
      const last = Object.entries(METRIC_META)
        .map(([k, meta]) => {
          const s = metricSeries(metrics, k as keyof typeof METRIC_META);
          return s.length ? `${meta.label.toLowerCase()} ${fmt(s[s.length - 1].value)} ${meta.unit}` : '';
        })
        .filter(Boolean)
        .join(', ');
      const ctx = [
        `Пол: ${profile.sex === 'male' ? 'мужской' : 'женский'}; возраст ${profile.age}; рост ${profile.heightCm} см; вес ${fmt(weightKg)} кг; цель: ${GOAL_SHORT[profile.goal].toLowerCase()}.`,
        last ? `Замеры: ${last}.` : 'Замеров нет.',
        a.bodyFat ? `Оценка процента жира ${BF_METHOD_LABEL[a.bodyFat.method]}: ${fmt(a.bodyFat.low)}–${fmt(a.bodyFat.high)}%.` : '',
      ].join('\n');
      const res = await analyzeBodyPhotos(photos, ctx, d);
      useBody.getState().addAnalysis(res);
      haptic.success();
      toast(res.quality === 'poor' ? res.qualityNote || 'По этим фото оценить не получилось' : 'Анализ фото готов', res.quality === 'poor' ? 'alert-circle' : 'checkmark-circle');
    } catch (e: any) {
      toast(e?.message ?? 'Не удалось проанализировать фото', 'alert-circle');
    } finally {
      setBusy(false);
    }
  };

  const waist = useMemo(() => metricSeries(metrics, 'waist'), [metrics]);
  const tiles = useMemo(
    () =>
      (Object.keys(METRIC_META) as (keyof typeof METRIC_META)[])
        .map((k) => ({ k, s: metricSeries(metrics, k) }))
        .filter((x) => x.s.length)
        .map(({ k, s }) => ({ k, value: s[s.length - 1].value, delta: Math.round((s[s.length - 1].value - s[0].value) * 10) / 10 })),
    [metrics],
  );
  const recent = latestByPose(photos);

  if (!profile || !a) return null;
  return (
    <Screen>
      <Ambient tone="calm" height={380} />
      <Header title="Тело" right={<IconButton name="add" label="Записать замеры и фото" onPress={() => router.push('/measurements')} />} />

      {/* Главное: процент жира диапазоном и что это значит */}
      {bf ? (
        <Appear i={0} style={{ gap: 4 }}>
          <T v="caption">Процент жира · оценка</T>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }} testID="body-fat">
            <T v="hero" style={{ fontVariant: ['tabular-nums'] }}>
              {fmt(bf.low)}–{fmt(bf.high)}
            </T>
            <T v="h3" color={colors.textDim}>
              %
            </T>
          </View>
          <T v="bodyDim">
            {level ? `${BF_LEVEL_LABEL[level]} · ` : ''}
            {BF_METHOD_LABEL[bf.method]}
          </T>
          {a.trend ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }} testID="body-trend">
              <Icon name={a.trend.tone === 'good' ? 'trending-up' : a.trend.tone === 'warn' ? 'alert-circle' : 'remove'} size={15} color={a.trend.tone === 'good' ? colors.accent : a.trend.tone === 'warn' ? colors.warning : colors.textDim} />
              <T v="small" color={colors.text} style={{ flex: 1 }}>
                {a.trend.text}
              </T>
            </View>
          ) : null}
        </Appear>
      ) : null}

      {/* Фото: последние по ракурсам и анализ */}
      <Appear i={1} style={[styles.card, { marginTop: space.xl }]}>
        {recent.length ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {recent.map((p) => (
              <View key={p.id} style={styles.thumb}>
                <Image source={{ uri: p.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" accessibilityLabel={`Фото ${POSE[p.pose]}, ${formatDayShort(p.date)}`} />
                <View style={styles.tag}>
                  <T v="small" color="#fff" style={{ fontSize: 10, fontWeight: '700' }}>
                    {POSE[p.pose]}
                  </T>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <T v="body">Фото спереди и сбоку — и анализ станет точнее: видно, что отстаёт и где запас жира.</T>
        )}
        {fresh && fresh.quality !== 'poor' && fresh.summary ? (
          <T v="body" color={colors.text} testID="body-photo-summary">
            {fresh.summary}
          </T>
        ) : null}
        {fresh?.qualityNote ? <T v="small">{fresh.qualityNote}</T> : null}
        {recent.length && photoAnalysisAvailable() ? (
          <Button title={busy ? 'Анализирую…' : fresh ? 'Обновить анализ фото' : 'Проанализировать фото'} icon="sparkles-outline" size="lg" live={!fresh && !busy} disabled={busy} onPress={runPhoto} />
        ) : (
          <Button title="Добавить фото" icon="camera-outline" variant="secondary" onPress={() => router.push('/measurements')} />
        )}
        {recent.length && !photoAnalysisAvailable() ? <T v="small">Анализ фото работает, когда в сборке подключён сервер RYNJI. Сейчас оценка — по замерам и профилю.</T> : null}
        {recent.length && photoAnalysisAvailable() && !fresh ? <T v="small">Отправятся последние фото каждого ракурса. Анализ хранится только на этом устройстве.</T> : null}
      </Appear>

      {/* Что подтянуть — с акцентом в плане одним нажатием */}
      {improve.length ? (
        <Appear i={2} style={{ marginTop: space.xl }}>
          <T v="caption" style={{ marginBottom: 8 }}>
            Что подтянуть
          </T>
          <View style={styles.list} testID="body-improve">
            {improve.map((z, i) => (
              <ZoneRow key={z.zone} zone={z.zone} text={z.text} sub={z.muscles.length ? `акцент: ${z.muscles.map((m) => VM_LABEL[m].toLowerCase()).join(', ')}` : undefined} first={i === 0} />
            ))}
          </View>
          {focusMuscles.length ? <Button title={focused ? 'Акцент в плане · убрать' : 'Добавить акцент в план'} icon={focused ? 'checkmark' : 'add'} variant={focused ? 'ghost' : 'secondary'} style={{ marginTop: 10 }} onPress={toggleFocus} /> : null}
        </Appear>
      ) : null}

      {fat.length ? (
        <Appear i={3} style={{ marginTop: space.xl }}>
          <T v="caption" style={{ marginBottom: 8 }}>
            Запас жира
          </T>
          <View style={styles.list} testID="body-fat-zones">
            {fat.map((z, i) => (
              <ZoneRow key={z.zone} zone={z.zone} text={z.text} first={i === 0} warn />
            ))}
          </View>
          <T v="small" style={{ marginTop: 8 }}>
            Локально жир не сжигается: он уходит со всего тела при дефиците калорий, а тренировки формируют мышцы под ним.
          </T>
        </Appear>
      ) : null}

      {fresh?.strengths.length ? (
        <View style={{ marginTop: space.xl, gap: 6 }}>
          <T v="caption">Сильные стороны</T>
          <T v="body">{fresh.strengths.join(' · ')}</T>
        </View>
      ) : null}

      {a.ratios.length ? (
        <View style={{ marginTop: space.xl }}>
          <T v="caption" style={{ marginBottom: 8 }}>
            Пропорции
          </T>
          <View style={styles.list}>
            {a.ratios.map((r, i) => (
              <View key={r.key} style={[styles.row, i > 0 && styles.line]} accessible accessibilityLabel={`${r.label}: ${r.value.toFixed(2).replace('.', ',')}, ${r.text}`}>
                <View style={[styles.dot, { backgroundColor: r.ok ? colors.accent : colors.warning }]} />
                <View style={{ flex: 1 }}>
                  <T v="body" style={{ fontSize: 14, fontWeight: '700' }}>
                    {r.label}
                  </T>
                  <T v="small" style={{ fontSize: 12 }}>
                    {r.text}
                  </T>
                </View>
                <T v="body" style={{ fontWeight: '800', fontVariant: ['tabular-nums'] }}>
                  {r.value.toFixed(2).replace('.', ',')}
                </T>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Замеры: талия графиком, остальное плитками */}
      <View style={{ marginTop: space.xl, gap: 10 }}>
        <T v="caption">Замеры</T>
        {waist.length >= 2 ? (
          <View style={styles.card}>
            <T v="small">Талия, см</T>
            <TrendChart points={waist.map((p) => ({ x: daysBetween(waist[0].date, p.date), y: p.value, raw: p.value, date: p.date }))} unit="см" labels={[formatDayShort(waist[0].date), formatDayShort(waist[waist.length - 1].date)]} height={140} />
          </View>
        ) : null}
        {tiles.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {tiles.map((t) => (
              <View key={t.k} style={styles.tile}>
                <T v="small" style={{ fontSize: 12 }}>
                  {METRIC_META[t.k].label}
                </T>
                <T v="num" style={{ fontSize: 18 }}>
                  {fmt(t.value)}
                  <T v="small"> {METRIC_META[t.k].unit}</T>
                </T>
                {t.delta ? (
                  <T v="small" style={{ fontSize: 11 }}>
                    {t.delta > 0 ? '+' : '−'}
                    {fmt(Math.abs(t.delta))} с первого
                  </T>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
        {a.missing.length ? (
          <T v="small">
            Для точности измерь: {a.missing.map((k) => METRIC_META[k].label.toLowerCase()).join(', ')}.
          </T>
        ) : null}
        <Button title="Записать замеры и фото" icon="body-outline" variant="secondary" onPress={() => router.push('/measurements')} />
        <PhotoCompare photos={photos} />
      </View>

      <T v="small" style={{ fontSize: 11, marginTop: space.xl }}>
        Оценка приблизительная: формулы по замерам ошибаются на 3–5 п.п., по фото — тоже. Это ориентир для тренировок, не медицинское заключение.
      </T>
    </Screen>
  );
}

function ZoneRow({ zone, text, sub, first, warn }: { zone: BodyZone; text: string; sub?: string; first?: boolean; warn?: boolean }) {
  return (
    <View style={[styles.row, !first && styles.line]} accessible accessibilityLabel={`${ZONE_LABEL[zone]}: ${text}${sub ? `, ${sub}` : ''}`}>
      <View style={[styles.dot, { backgroundColor: warn ? colors.warning : colors.accent }]} />
      <View style={{ flex: 1, gap: 2 }}>
        <T v="body" style={{ fontSize: 15, fontWeight: '700' }}>
          {ZONE_LABEL[zone]}
        </T>
        <T v="small" style={{ fontSize: 12 }}>
          {text}
        </T>
        {sub ? (
          <T v="small" style={{ fontSize: 12 }} color={colors.accent}>
            {sub}
          </T>
        ) : null}
      </View>
    </View>
  );
}

const styles = themed({
  card: { gap: 12, padding: space.lg, borderRadius: radius.xl, backgroundColor: colors.surface },
  list: { backgroundColor: colors.surface, borderRadius: radius.xl, paddingHorizontal: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  line: { borderTopWidth: 1, borderTopColor: colors.border },
  dot: { width: 8, height: 8, borderRadius: 4 },
  thumb: { flex: 1, aspectRatio: 0.75, maxWidth: 110, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface2 },
  tag: { position: 'absolute', left: 4, bottom: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.55)' },
  tile: { minWidth: '30%', flexGrow: 1, padding: 12, borderRadius: radius.lg, backgroundColor: colors.surface },
});
