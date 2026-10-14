import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { colors, radius, space, themed } from '@/theme';
import { Header, Screen } from '@/components/Screen';
import { Banner, Button, EmptyState, T } from '@/components/ui';
import { Appear, FadeIn, Tap } from '@/components/motion';
import { useLabs } from '@/stores/labs';
import { useProfile } from '@/stores/profile';
import { interpretResult, labComparison, markerSeries, topLevel } from '@/features/labs/analysis';
import { KINDS, LabRow, kindItems, reportTitle, type ReportKind } from '@/features/labs/ui';
import { formatDayShort } from '@/utils/date';

/**
 * Отчёт по загрузке: что повысилось, что понизилось, что вне референса и что стало лучше или хуже
 * относительно референса лаборатории. Плитки сверху — фильтр одного списка (без повторов одного и того же
 * показателя в нескольких блоках). Без диагнозов и без советов по препаратам.
 */
export default function LabReportScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const reports = useLabs((s) => s.reports);
  const sex = useProfile((s) => s.profile?.sex);
  const c = useMemo(() => labComparison(reports, id, sex), [reports, id, sex]);
  const kinds = useMemo(() => (c ? KINDS.filter((k) => (c.prevDate ? true : k.key === 'outOfRange' || k.key === 'all')) : []), [c]);
  const initial: ReportKind = useMemo(() => {
    if (!c) return 'all';
    return (['worsened', 'outOfRange', 'improved', 'rose', 'fell'] as const).find((k) => kinds.some((x) => x.key === k) && c[k].length > 0) ?? 'all';
  }, [c, kinds]);
  const [kind, setKind] = useState<ReportKind | null>(null);
  const sel = kind ?? initial;

  // Пороги с медицинскими основаниями — отдельно и заметно, с советом обсудить с врачом
  const doctor = useMemo(() => {
    if (!c) return [];
    const rep = reports.find((r) => r.id === c.reportId);
    const upto = reports.filter((r) => r.date <= c.date);
    return (rep?.results ?? []).flatMap((r) => {
      const lvl = topLevel(interpretResult(r, r.markerId ? markerSeries(upto, r.markerId) : [], sex).findings);
      return lvl === 'doctor' || lvl === 'urgent' ? [c.items.find((i) => i.resultId === r.id)?.name ?? r.name] : [];
    });
  }, [c, reports, sex]);

  if (!c)
    return (
      <Screen>
        <Header title="Отчёт" />
        <EmptyState icon="flask-outline" title="Анализ не найден" action="К анализам" onAction={() => router.replace('/labs')} />
      </Screen>
    );

  const list = kindItems(c, sel);
  return (
    <Screen>
      <Header title="Отчёт по анализу" subtitle={reportTitle(c)} />
      <View testID="lab-report" style={{ gap: space.lg }}>
        <Appear i={0} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <T v="display">{c.items.length}</T>
            <T v="h3" color={colors.textDim}>
              показателей
            </T>
          </View>
          <T v="bodyDim">{c.prevDate ? `Сравнение с анализом ${formatDayShort(c.prevDate)}` : 'Первый анализ — со следующей загрузкой покажу, что изменилось'}</T>
        </Appear>

        {doctor.length ? <Banner icon="medkit-outline" tone="warning" text={`Стоит обсудить с врачом: ${doctor.join(', ')}`} /> : null}

        <Appear i={1}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: space.lg }} style={{ marginHorizontal: -space.lg }}>
            {kinds.map((k) => {
              const n = kindItems(c, k.key).length;
              const on = sel === k.key;
              return (
                <Tap
                  key={k.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on, disabled: n === 0 }}
                  accessibilityLabel={`${k.label}: ${n}`}
                  disabled={n === 0}
                  onPress={() => setKind(k.key)}
                  style={[styles.tile, on && styles.tileOn, n === 0 && { opacity: 0.45 }]}
                >
                  <T v="h2" style={{ fontVariant: ['tabular-nums'] }} color={n ? k.color() : colors.muted}>
                    {n}
                  </T>
                  <T v="small" numberOfLines={1} color={on ? colors.text : colors.textDim} style={{ fontWeight: '600' }}>
                    {k.label}
                  </T>
                </Tap>
              );
            })}
          </ScrollView>
        </Appear>

        <FadeIn key={sel} from={8}>
          <View style={styles.list} testID="lab-report-list">
            {list.length ? list.map((it, i) => <LabRow key={it.resultId ?? it.name} item={it} first={i === 0} />) : <T v="small" style={{ paddingVertical: 14 }}>Пусто</T>}
          </View>
        </FadeIn>

        {c.prevDate && sel !== 'all' ? (
          <View style={{ gap: 6 }}>
            {c.stable.length ? <T v="small">Без существенных изменений: {c.stable.map((x) => x.name).join(', ')}</T> : null}
            {c.first.length ? <T v="small">Впервые: {c.first.map((x) => x.name).join(', ')}</T> : null}
          </View>
        ) : null}

        <Button title="Таблица всех анализов" icon="grid-outline" variant="secondary" onPress={() => router.push('/labs/table')} />
        <T v="small" style={{ fontSize: 11 }}>
          «Улучшилось» и «ухудшилось» — только про положение относительно референса вашей лаборатории, это не медицинская оценка. Нормальные значения не означают, что приём препаратов безопасен. Решения принимает врач.
        </T>
      </View>
    </Screen>
  );
}

const styles = themed({
  tile: { width: 112, gap: 2, paddingHorizontal: 14, paddingVertical: 12, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: 'transparent' },
  tileOn: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  list: { backgroundColor: colors.surface, borderRadius: radius.xl, paddingHorizontal: space.md },
});
