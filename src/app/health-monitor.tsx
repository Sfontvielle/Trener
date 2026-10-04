import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { colors, radius, space, themed } from '@/theme';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Icon, T } from '@/components/ui';
import { Field, Toggle } from '@/components/inputs';
import { TrendChart } from '@/components/charts';
import { Sheet } from '@/components/Sheet';
import { confirm, toast } from '@/components/Dialog';
import { useEnhanced } from '@/stores/enhanced';
import { useHealth } from '@/stores/health';
import { useLabs } from '@/stores/labs';
import { useBody } from '@/stores/body';
import { useProfile } from '@/stores/profile';
import { BP_LABEL, bpSummary, healthMonitor, rhrTrend, type SignalLevel } from '@/features/health/monitor';
import { daysBetween, formatDayShort, today } from '@/utils/date';
import { haptic } from '@/services/haptics';

const LEVEL_COLOR: Record<SignalLevel, string> = { urgent: colors.danger, doctor: colors.warning, monitor: colors.warning, info: colors.textDim };
const LEVEL_LABEL: Record<SignalLevel, string> = { urgent: 'срочно', doctor: 'обсудить с врачом', monitor: 'наблюдать', info: 'информация' };

const toRu = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const toIso = (ru: string) => {
  const m = ru.trim().match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
};

/**
 * Здоровье: давление, пульс покоя, анализы и (по желанию) режим Enhanced/AAS.
 * Граница безопасности: RYNJI мониторит и сообщает о неблагоприятной динамике, рекомендует медицинскую оценку —
 * и НЕ составляет циклы, не рассчитывает и не советует дозировки, не подбирает препараты, не превращает анализы
 * в инструкцию по корректировке курса и не утверждает, что нормальные анализы делают AAS безопасными.
 */
export default function HealthMonitorScreen() {
  const en = useEnhanced();
  const health = useHealth((s) => s.days);
  const labs = useLabs((s) => s.reports);
  const weights = useBody((s) => s.weights);
  const metrics = useBody((s) => s.metrics);
  const sex = useProfile((s) => s.profile?.sex);
  const [bpOpen, setBpOpen] = useState(false);
  const [aasOpen, setAasOpen] = useState(false);
  const [sys, setSys] = useState('');
  const [dia, setDia] = useState('');
  const [pulse, setPulse] = useState('');
  const [aas, setAas] = useState({ substance: '', start: toRu(today()), end: '', dose: '', note: '' });

  const signals = useMemo(() => healthMonitor({ enhanced: en.enabled, bp: en.bp, health, labs, weights, metrics, sex }), [en.enabled, en.bp, health, labs, weights, metrics, sex]);
  const bps = useMemo(() => bpSummary(en.bp), [en.bp]);
  const rhr = useMemo(() => rhrTrend(health), [health]);
  const lastLab = [...labs].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const bpPoints = useMemo(() => {
    const pts = en.bp.slice(-30);
    const x0 = pts[0]?.date;
    return pts.map((p) => ({ x: x0 ? daysBetween(x0, p.date) : 0, y: p.systolic }));
  }, [en.bp]);

  const saveBp = () => {
    const s = parseInt(sys, 10);
    const d = parseInt(dia, 10);
    if (!(s >= 70 && s <= 260 && d >= 40 && d <= 160 && s > d)) {
      toast('Проверьте значения давления', 'alert-circle');
      return;
    }
    en.addBp({ date: today(), systolic: s, diastolic: d, pulse: pulse ? parseInt(pulse, 10) : undefined });
    haptic.success();
    setSys('');
    setDia('');
    setPulse('');
    setBpOpen(false);
  };

  const saveAas = () => {
    const start = toIso(aas.start);
    if (!aas.substance.trim() || !start) {
      toast('Укажите название и дату начала (ДД.ММ.ГГГГ)', 'alert-circle');
      return;
    }
    en.addAas({ substance: aas.substance.trim(), startDate: start, endDate: toIso(aas.end) || undefined, doseNote: aas.dose.trim() || undefined, note: aas.note.trim() || undefined });
    haptic.success();
    setAas({ substance: '', start: toRu(today()), end: '', dose: '', note: '' });
    setAasOpen(false);
  };

  return (
    <Screen keyboard>
      <Header title="Здоровье" subtitle="Давление · пульс · анализы · сигналы" />

      {signals.length ? (
        <View style={{ gap: 8, marginBottom: space.md }} testID="health-signals">
          {signals.map((s) => (
            <Card key={s.id} tone={s.level === 'urgent' ? 'danger' : s.level === 'info' ? 'default' : 'warning'} style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name={s.level === 'urgent' ? 'alert-circle' : 'medkit-outline'} size={16} color={LEVEL_COLOR[s.level]} />
                <T v="body" style={{ flex: 1, fontWeight: '800' }} color={s.level === 'urgent' ? colors.danger : colors.text}>
                  {s.title}
                </T>
                <T v="small" style={{ fontSize: 11 }} color={LEVEL_COLOR[s.level]}>
                  {LEVEL_LABEL[s.level]}
                </T>
              </View>
              <T v="small" color={colors.text}>
                {s.text}
              </T>
              {s.data.length ? <T v="small" style={{ fontSize: 11 }}>На основе: {s.data.join('; ')}</T> : null}
            </Card>
          ))}
        </View>
      ) : (
        <Card style={{ marginBottom: space.md }}>
          <T v="small">Значимых сигналов нет. Это не медицинское заключение — только сравнение ваших данных с порогами и вашей нормой.</T>
        </Card>
      )}

      <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <T v="caption" style={{ flex: 1 }}>
            Артериальное давление
          </T>
          <Button title="Записать" icon="add" size="sm" variant="secondary" onPress={() => setBpOpen(true)} />
        </View>
        {bps ? (
          <>
            <T v="num" style={{ fontSize: 26 }}>
              {bps.systolic}/{bps.diastolic} <T v="small">мм рт. ст.</T>
            </T>
            <T v="small">
              Среднее {bps.n} изм. за 14 дней · {BP_LABEL[bps.category]}
              {bps.deltaSys !== null ? ` · ${bps.deltaSys > 0 ? '+' : ''}${bps.deltaSys} к прошлому месяцу` : ''}
            </T>
            {bpPoints.length >= 2 ? <TrendChart points={bpPoints} unit="мм" height={130} band={[90, 129]} /> : null}
          </>
        ) : (
          <T v="small">Измеряйте утром и вечером в покое, сидя, 2 раза с перерывом в минуту. Решения — по среднему, а не по одному значению.</T>
        )}
      </Card>

      <Card style={{ gap: 6, marginTop: space.md }}>
        <T v="caption">Пульс покоя · Apple Health</T>
        {rhr ? (
          <T v="body">
            {rhr.recent} уд/мин в среднем за неделю · ваша норма ~{rhr.baseline}
            {Math.abs(rhr.delta) >= 3 ? ` (${rhr.delta > 0 ? '+' : ''}${rhr.delta})` : ''}
          </T>
        ) : (
          <T v="small">Нужно ~2 недели данных Apple Health, чтобы сравнивать с вашей нормой.</T>
        )}
      </Card>

      <Card onPress={() => router.push('/labs')} style={{ gap: 4, marginTop: space.md }} accessibilityLabel="Анализы">
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <T v="caption" style={{ flex: 1 }}>
            Анализы
          </T>
          <Icon name="chevron-forward" size={16} color={colors.muted} />
        </View>
        <T v="body">{lastLab ? `Последние: ${formatDayShort(lastLab.date)}${lastLab.lab ? ` · ${lastLab.lab}` : ''} · всего ${labs.length}` : 'Загрузите анализы — PDF, фото или текст'}</T>
      </Card>

      <Card style={{ gap: 8, marginTop: space.md }} testID="enhanced-card">
        <Toggle
          value={en.enabled}
          onChange={en.setEnabled}
          label="Режим Enhanced (AAS)"
          sub="Более внимательный мониторинг здоровья: гематокрит, липиды, печень, давление, пульс, талия"
        />
        <View style={styles.boundary}>
          <T v="small" color={colors.text} style={{ fontWeight: '700' }}>
            Что делает и чего не делает RYNJI
          </T>
          <T v="small">• Хранит вашу историю как личную запись, учитывает её как контекст, показывает тренды показателей и сообщает о неблагоприятной динамике — с рекомендацией медицинской оценки.</T>
          <T v="small">• Не составляет циклы, не рассчитывает и не советует дозировки, не подбирает препараты (в том числе «от побочек») и не даёт инструкций по корректировке курса по анализам.</T>
          <T v="small">• Нормальные анализы не означают, что AAS безопасны. Хороший прогресс в зале — не доказательство, что со здоровьем всё в порядке.</T>
          <T v="small">• Статус Enhanced не добавляет объём тренировок сам по себе: нагрузка определяется вашими фактическими данными.</T>
        </View>
        {en.enabled ? (
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <T v="caption" style={{ flex: 1 }}>
                Моя история
              </T>
              <Button title="Добавить запись" icon="add" size="sm" variant="secondary" onPress={() => setAasOpen(true)} />
            </View>
            {en.aas.length ? (
              [...en.aas].reverse().map((a) => (
                <Pressable
                  key={a.id}
                  accessibilityRole="button"
                  accessibilityHint="Удерживайте, чтобы удалить"
                  onLongPress={() => confirm('Удалить запись?', a.substance, 'Удалить', () => en.removeAas(a.id), true)}
                  style={styles.aas}
                >
                  <View style={styles.rail} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <T v="body" style={{ fontWeight: '800', fontSize: 14 }}>
                      {a.substance}
                    </T>
                    <T v="small" style={{ fontSize: 12 }}>
                      {formatDayShort(a.startDate)} — {a.endDate ? formatDayShort(a.endDate) : 'по н. в.'}
                      {a.doseNote ? ` · ваша запись: ${a.doseNote}` : ''}
                    </T>
                    {a.note ? <T v="small" style={{ fontSize: 12 }}>{a.note}</T> : null}
                  </View>
                </Pressable>
              ))
            ) : (
              <T v="small">Записей нет. История видна только вам и хранится на устройстве.</T>
            )}
          </View>
        ) : null}
      </Card>

      <Sheet visible={bpOpen} onClose={() => setBpOpen(false)} title="Давление" subtitle="В покое, сидя, после 5 минут отдыха">
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Field label="Верхнее" value={sys} onChangeText={setSys} keyboardType="number-pad" placeholder="120" style={{ flex: 1 }} testID="bp-sys" />
            <Field label="Нижнее" value={dia} onChangeText={setDia} keyboardType="number-pad" placeholder="80" style={{ flex: 1 }} testID="bp-dia" />
            <Field label="Пульс" value={pulse} onChangeText={setPulse} keyboardType="number-pad" placeholder="60" style={{ flex: 1 }} />
          </View>
          <Button title="Сохранить" icon="checkmark" size="lg" disabled={!sys || !dia} onPress={saveBp} />
          {en.bp.length ? (
            <View style={{ gap: 4 }}>
              {[...en.bp].reverse().slice(0, 5).map((b) => (
                <Pressable key={b.id} accessibilityRole="button" onLongPress={() => en.removeBp(b.id)} style={{ flexDirection: 'row' }}>
                  <T v="small" style={{ flex: 1 }}>
                    {formatDayShort(b.date)}
                  </T>
                  <T v="small" color={colors.text} style={{ fontWeight: '700' }}>
                    {b.systolic}/{b.diastolic}
                    {b.pulse ? ` · ${b.pulse}` : ''}
                  </T>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </Sheet>

      <Sheet visible={aasOpen} onClose={() => setAasOpen(false)} title="Запись в историю" subtitle="Личная запись — RYNJI её не анализирует и не даёт по ней советов">
        <View style={{ gap: 10 }}>
          <Field label="Вещество" value={aas.substance} onChangeText={(substance) => setAas({ ...aas, substance })} placeholder="Название" />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Field label="Начало" value={aas.start} onChangeText={(start) => setAas({ ...aas, start })} placeholder="ДД.ММ.ГГГГ" keyboardType="numbers-and-punctuation" style={{ flex: 1 }} />
            <Field label="Окончание" value={aas.end} onChangeText={(end) => setAas({ ...aas, end })} placeholder="необязательно" keyboardType="numbers-and-punctuation" style={{ flex: 1 }} />
          </View>
          <Field label="Доза — как записываете вы" value={aas.dose} onChangeText={(dose) => setAas({ ...aas, dose })} placeholder="ваша запись" hint="Только для вашей истории. RYNJI не оценивает и не рекомендует дозировки." />
          <Field label="Заметка" value={aas.note} onChangeText={(note) => setAas({ ...aas, note })} multiline />
          <Button title="Сохранить" icon="checkmark" size="lg" onPress={saveAas} />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = themed({
  boundary: { gap: 4, padding: 12, borderRadius: radius.md, backgroundColor: colors.surface2 },
  aas: { flexDirection: 'row', gap: 10, paddingVertical: 6 },
  rail: { width: 3, borderRadius: 2, backgroundColor: colors.accentLine },
});
