import React, { useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { colors, radius, space, themed } from '@/theme';
import { Header, Screen } from '@/components/Screen';
import { EmptyState, T } from '@/components/ui';
import { useLabs } from '@/stores/labs';
import { useProfile } from '@/stores/profile';
import { labTable } from '@/features/labs/analysis';
import { BIOMARKER_BY_ID, CATEGORY_LABEL, type LabCategory } from '@/features/labs/catalog';
import { STATUS, openMarker } from '@/features/labs/ui';
import { formatDayShort } from '@/utils/date';

const ROW = 50;
const NAME_W = 136;
const COL_W = 92;

/**
 * Все анализы одной таблицей: показатели по разделам × даты загрузок (новые слева).
 * Колонка названий закреплена, даты листаются вбок. Значения вне референса — цветом и фоном ячейки.
 */
export default function LabTableScreen() {
  const reports = useLabs((s) => s.reports);
  const sex = useProfile((s) => s.profile?.sex);
  const t = useMemo(() => labTable(reports, sex), [reports, sex]);
  // Строки с заголовками разделов: слева — название раздела, справа — пустая полоса той же высоты
  const lines = useMemo(() => {
    const out: ({ kind: 'cat'; label: string } | { kind: 'row'; row: (typeof t.rows)[number] })[] = [];
    let cat: LabCategory | undefined;
    for (const row of t.rows) {
      const c = (row.markerId && BIOMARKER_BY_ID[row.markerId]?.category) || 'other';
      if (c !== cat) out.push({ kind: 'cat', label: CATEGORY_LABEL[c] });
      cat = c;
      out.push({ kind: 'row', row });
    }
    return out;
  }, [t]);

  if (!t.rows.length)
    return (
      <Screen>
        <Header title="Таблица анализов" />
        <EmptyState icon="grid-outline" title="Пока пусто" text="Загрузите анализы — здесь соберутся все показатели по датам." />
      </Screen>
    );

  return (
    <Screen>
      <Header title="Таблица анализов" subtitle={`${t.rows.length} показателей · ${t.columns.length} ${t.columns.length === 1 ? 'анализ' : t.columns.length < 5 ? 'анализа' : 'анализов'}`} />
      <View style={styles.wrap} testID="lab-table">
        <View style={{ width: NAME_W }}>
          <View style={[styles.head, { alignItems: 'flex-start' }]}>
            <T v="caption">Показатель</T>
          </View>
          {lines.map((l, i) =>
            l.kind === 'cat' ? (
              <View key={`c${i}`} style={styles.cat}>
                <T v="caption" numberOfLines={1} color={colors.accent}>
                  {l.label}
                </T>
              </View>
            ) : (
              <Pressable key={l.row.key} accessibilityRole="button" accessibilityLabel={`${l.row.name}, история`} disabled={!l.row.markerId} onPress={() => openMarker(l.row.markerId)} style={styles.name}>
                <T v="body" numberOfLines={1} style={{ fontSize: 14, fontWeight: '700' }}>
                  {l.row.name}
                </T>
                <T v="small" numberOfLines={1} style={{ fontSize: 11 }}>
                  {l.row.unit}
                </T>
              </Pressable>
            ),
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
          <View>
            <View style={{ flexDirection: 'row' }}>
              {t.columns.map((c) => (
                <View key={c.id} style={[styles.head, { width: COL_W }]}>
                  <T v="small" style={{ fontWeight: '800', fontSize: 13 }} color={colors.text}>
                    {formatDayShort(c.date)}
                  </T>
                  <T v="small" numberOfLines={1} style={{ fontSize: 11 }}>
                    {c.lab ?? ' '}
                  </T>
                </View>
              ))}
            </View>
            {lines.map((l, i) =>
              l.kind === 'cat' ? (
                <View key={`c${i}`} style={[styles.cat, { width: COL_W * t.columns.length }]} />
              ) : (
                <View key={l.row.key} style={{ flexDirection: 'row' }}>
                  {l.row.cells.map((cell, ci) => {
                    const off = cell && (cell.status === 'high' || cell.status === 'low');
                    const next = l.row.cells[ci + 1];
                    const arrow = cell && next ? (cell.value > next.value ? '↑' : cell.value < next.value ? '↓' : '') : '';
                    return (
                      <View
                        key={ci}
                        accessible
                        accessibilityLabel={cell ? `${l.row.name}, ${formatDayShort(t.columns[ci].date)}: ${cell.text} ${l.row.unit}, ${STATUS[cell.status].label}` : `${l.row.name}, ${formatDayShort(t.columns[ci].date)}: нет`}
                        style={[styles.cell, { width: COL_W }]}
                      >
                        {cell ? (
                          <View style={[styles.value, off && { backgroundColor: colors.warningDim }]}>
                            <T v="body" style={{ fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] }} color={off ? colors.warning : colors.text}>
                              {cell.text}
                            </T>
                            {arrow ? (
                              <T v="small" style={{ fontSize: 11 }} color={colors.textDim}>
                                {arrow}
                              </T>
                            ) : null}
                          </View>
                        ) : (
                          <T v="small" color={colors.muted}>
                            —
                          </T>
                        )}
                      </View>
                    );
                  })}
                </View>
              ),
            )}
          </View>
        </ScrollView>
      </View>
      <T v="small" style={{ fontSize: 11, marginTop: space.md }}>
        Цветом — значения вне референса лаборатории. Стрелка — изменение к предыдущему анализу. Это не диагноз.
      </T>
    </Screen>
  );
}

const styles = themed({
  wrap: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.xl, paddingVertical: 6, paddingLeft: space.md, overflow: 'hidden' },
  head: { height: 46, justifyContent: 'center', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border },
  cat: { height: 30, justifyContent: 'flex-end', paddingBottom: 4 },
  name: { height: ROW, justifyContent: 'center', borderTopWidth: 1, borderTopColor: colors.border, paddingRight: 8 },
  cell: { height: ROW, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderTopColor: colors.border },
  value: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
});
