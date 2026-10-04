import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { colors, radius, space, themed } from '@/theme';
import { Header, Screen } from '@/components/Screen';
import { Card, EmptyState, Icon, T } from '@/components/ui';
import { TrendChart } from '@/components/charts';
import { useLabs } from '@/stores/labs';
import { useProfile } from '@/stores/profile';
import { BIOMARKER_BY_ID, CATEGORY_LABEL } from '@/features/labs/catalog';
import { interpretResult, markerSeries, rangeOf } from '@/features/labs/analysis';
import { daysBetween, formatDayShort } from '@/utils/date';

const fmt = (x: number) => String(Math.round(x * 100) / 100).replace('.', ',');

/** История одного показателя: график с референсом лаборатории, значения по датам и объяснение без диагнозов */
export default function MarkerScreen() {
  const { marker } = useLocalSearchParams<{ marker: string }>();
  const reports = useLabs((s) => s.reports);
  const sex = useProfile((s) => s.profile?.sex);
  const b = BIOMARKER_BY_ID[marker ?? ''];
  const series = useMemo(() => (marker ? markerSeries(reports, marker) : []), [reports, marker]);
  const entries = useMemo(
    () =>
      [...reports]
        .sort((a, c) => (a.date < c.date ? 1 : -1))
        .flatMap((rep) => rep.results.filter((r) => r.markerId === marker).map((r) => ({ rep, r }))),
    [reports, marker],
  );
  const last = entries[0];
  const interp = last ? interpretResult(last.r, series, sex) : null;
  const range = last ? rangeOf(last.r, sex) : null;
  if (!b) return <Screen><Header title="Показатель" /><EmptyState icon="flask-outline" title="Показатель не найден" /></Screen>;

  const x0 = series[0]?.date;
  const points = series.map((p) => ({ x: x0 ? daysBetween(x0, p.date) : 0, y: p.value }));
  const unit = series[series.length - 1]?.unit ?? b.unit;

  return (
    <Screen>
      <Header title={b.name} subtitle={CATEGORY_LABEL[b.category]} />
      <Card style={{ gap: 8 }}>
        <T v="caption">История · {unit}</T>
        <TrendChart points={points} unit={unit} band={range && range.source !== 'none' ? [range.low, range.high] : undefined} labels={series.length >= 2 ? [formatDayShort(series[0].date), formatDayShort(series[series.length - 1].date)] : undefined} emptyText="Нужно минимум 2 анализа для графика" />
        {range && range.source !== 'none' ? (
          <T v="small" style={{ fontSize: 12 }}>
            Полоса — {range.source === 'lab' ? 'референс вашей лаборатории' : 'общий ориентир (в бланке нет референса)'}: {range.low !== undefined ? fmt(range.low) : '…'} – {range.high !== undefined ? fmt(range.high) : '…'} {unit}
          </T>
        ) : null}
      </Card>

      {interp && interp.findings.length ? (
        <Card tone={interp.findings.some((f) => f.level !== 'info') ? 'warning' : 'default'} style={{ gap: 6, marginTop: space.md }}>
          {interp.findings.map((f) => (
            <View key={f.text} style={{ flexDirection: 'row', gap: 8 }}>
              <Icon name={f.level === 'info' ? 'information-circle-outline' : 'medkit-outline'} size={16} color={f.level === 'urgent' ? colors.danger : f.level === 'doctor' ? colors.warning : colors.textDim} style={{ marginTop: 2 }} />
              <T v="body" style={{ flex: 1, fontSize: 14 }} color={f.level === 'urgent' ? colors.danger : colors.text}>
                {f.text}
              </T>
            </View>
          ))}
        </Card>
      ) : null}

      <T v="caption" style={{ marginTop: space.md, marginBottom: 6 }}>
        Значения
      </T>
      <View style={styles.list}>
        {entries.map(({ rep, r }, i) => (
          <View key={r.id} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <T v="body" style={{ fontSize: 14, fontWeight: '700' }}>
                {formatDayShort(rep.date)}
                {rep.lab ? ` · ${rep.lab}` : ''}
              </T>
              <T v="small" style={{ fontSize: 11 }}>
                {r.refText ? `референс ${r.refText}` : 'без референса'}
                {r.normalized ? ` · в ${r.normalized.unit}: ${fmt(r.normalized.value)}` : ''}
                {r.flag ? ` · отметка ${r.flag}` : ''}
              </T>
            </View>
            <T v="body" style={{ fontWeight: '800', fontVariant: ['tabular-nums'] }}>
              {r.valueText ?? fmt(r.value)} <T v="small">{r.unit}</T>
            </T>
          </View>
        ))}
      </View>
      <T v="small" style={{ fontSize: 11, marginTop: space.md }}>
        Это не диагноз. Отклонение от референса, особенно повторяющееся, — повод обсудить результат с врачом. RYNJI не даёт рекомендаций по препаратам и дозировкам.
      </T>
    </Screen>
  );
}

const styles = themed({
  list: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
});
