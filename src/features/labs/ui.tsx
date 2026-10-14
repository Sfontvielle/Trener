import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { colors, radius, themed } from '@/theme';
import { Icon, T } from '@/components/ui';
import { Tap } from '@/components/motion';
import { Sparkline } from '@/components/charts';
import { formatDayShort } from '@/utils/date';
import type { LabComparison, LabStatus, ReportItem } from './analysis';

/** Общие элементы экранов анализов: цвета статусов, строка показателя с мини-графиком, сводка отчёта */
export const STATUS: Record<LabStatus, { color: string; label: string }> = {
  high: { color: colors.warning, label: 'выше референса' },
  low: { color: colors.warning, label: 'ниже референса' },
  normal: { color: colors.accent, label: 'в пределах референса' },
  unknown: { color: colors.muted, label: 'нет референса' },
};

export const fmtLab = (x: number) => String(Math.round(x * 100) / 100).replace('.', ',');

export const openMarker = (markerId?: string) => markerId && router.push({ pathname: '/labs/[marker]', params: { marker: markerId } });

export type ReportKind = 'worsened' | 'improved' | 'outOfRange' | 'rose' | 'fell' | 'all';

export const KINDS: { key: ReportKind; label: string; color: () => string }[] = [
  { key: 'worsened', label: 'Ухудшилось', color: () => colors.warning },
  { key: 'improved', label: 'Улучшилось', color: () => colors.accent },
  { key: 'outOfRange', label: 'Вне референса', color: () => colors.warning },
  { key: 'rose', label: 'Повысилось', color: () => colors.text },
  { key: 'fell', label: 'Понизилось', color: () => colors.text },
  { key: 'all', label: 'Все', color: () => colors.textDim },
];

export const kindItems = (c: LabComparison, k: ReportKind): ReportItem[] => (k === 'all' ? c.items : c[k]);

/** Строка показателя: статус, название и пояснение, мини-график истории, значение и изменение */
export function LabRow({ item, first }: { item: ReportItem; first?: boolean }) {
  const st = STATUS[item.status];
  const deltaColor = item.verdict === 'worsened' ? colors.warning : item.verdict === 'improved' ? colors.accent : colors.textDim;
  const sub = item.reason ?? (item.prev !== undefined ? `было ${fmtLab(item.prev)}` : item.direction === 'new' ? 'первое измерение' : st.label);
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={`${item.name}: ${fmtLab(item.value)} ${item.unit}, ${item.direction === 'up' || item.direction === 'down' ? `${item.text}, ` : ''}${sub}`}
      disabled={!item.markerId}
      onPress={() => openMarker(item.markerId)}
      scaleTo={0.985}
      style={[styles.row, !first && styles.line]}
    >
      <View style={[styles.dot, { backgroundColor: st.color }]} />
      <View style={{ flex: 1, gap: 2 }}>
        <T v="body" numberOfLines={1} style={{ fontSize: 15, fontWeight: '700' }}>
          {item.name}
        </T>
        <T v="small" numberOfLines={1} style={{ fontSize: 12 }} color={item.verdict === 'worsened' ? colors.warning : colors.textDim}>
          {sub}
        </T>
      </View>
      <Sparkline values={item.series} color={st.color} />
      <View style={{ alignItems: 'flex-end', minWidth: 72 }}>
        <T v="body" style={{ fontWeight: '800', fontVariant: ['tabular-nums'] }}>
          {fmtLab(item.value)} <T v="small">{item.unit}</T>
        </T>
        {item.direction === 'up' || item.direction === 'down' ? (
          <T v="small" style={{ fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] }} color={deltaColor}>
            {item.text}
          </T>
        ) : null}
      </View>
    </Tap>
  );
}

/** Сводка отчёта одной строкой плашек: только ненулевые группы */
export function ReportPills({ c }: { c: LabComparison }) {
  const pills = c.prevDate
    ? ([
        ['worsened', c.worsened.length],
        ['improved', c.improved.length],
        ['outOfRange', c.outOfRange.length],
        ['rose', c.rose.length],
        ['fell', c.fell.length],
      ] as const)
    : ([['outOfRange', c.outOfRange.length]] as const);
  const shown = pills.filter(([, n]) => n > 0);
  if (!shown.length)
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name="checkmark-circle" size={16} color={colors.accent} />
        <T v="small">{c.prevDate ? 'Существенных изменений нет' : `${c.items.length} показателей в пределах референса`}</T>
      </View>
    );
  return (
    <View style={styles.pills}>
      {shown.map(([k, n]) => {
        const kind = KINDS.find((x) => x.key === k)!;
        return (
          <View key={k} style={styles.pill}>
            <T v="small" style={{ fontWeight: '800', fontVariant: ['tabular-nums'] }} color={kind.color()}>
              {n}
            </T>
            <T v="small" color={colors.textDim}>
              {kind.label.toLowerCase()}
            </T>
          </View>
        );
      })}
    </View>
  );
}

export const reportTitle = (c: Pick<LabComparison, 'date' | 'lab'>) => `${formatDayShort(c.date)}${c.lab ? ` · ${c.lab}` : ''}`;

const styles = themed({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  line: { borderTopWidth: 1, borderTopColor: colors.border },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 28, borderRadius: radius.pill, backgroundColor: colors.surface2 },
});
