import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { colors, radius, space, themed } from '@/theme';
import { Header, Screen } from '@/components/Screen';
import { Banner, Button, Icon, Segmented, T } from '@/components/ui';
import { Field } from '@/components/inputs';
import { DateField } from '@/components/DateField';
import { toast } from '@/components/Dialog';
import { useLabDraft } from '@/stores/labDraft';
import { useLabs } from '@/stores/labs';
import { BIOMARKER_BY_ID, CATEGORY_LABEL, matchMarker } from '@/features/labs/catalog';
import { normalizeUnit } from '@/features/labs/normalize';
import { draftIssues, emptyRow, reportFromDraft, type DraftRow, type LabDraft } from '@/features/labs/report';
import { haptic } from '@/services/haptics';
import { today } from '@/utils/date';

/**
 * «Проверьте распознанные данные» — обязательный шаг. Распознанное (OCR, модель, разбор текста) может ошибаться,
 * поэтому ни одно значение не сохраняется как факт без подтверждения. Любое поле можно исправить.
 */
export default function LabReviewScreen() {
  const initial = useLabDraft((s) => s.draft);
  const [d, setD] = useState<LabDraft | null>(initial);
  const [date, setDate] = useState(initial?.date ?? today());
  // Уверенно распознанные строки — компактной таблицей; сомнительные и ручной ввод — сразу формой
  const [open, setOpen] = useState<Set<string>>(() => new Set((initial?.rows ?? []).filter((r) => r.confidence === 'low' || initial?.source.kind === 'manual').map((r) => r.key)));
  // Без черновика (открыли напрямую) — к списку; после сохранения уходим в отчёт сами
  const saved = useRef(false);
  useEffect(() => {
    if (!initial && !saved.current) router.replace('/labs');
  }, [initial]);
  const issues = useMemo(() => (d ? draftIssues({ ...d, date }) : []), [d, date]);
  if (!d) return null;

  const update = (key: string, patch: Partial<DraftRow>) =>
    setD({
      ...d,
      rows: d.rows.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        if (patch.name !== undefined) next.markerId = matchMarker(patch.name)?.id;
        return { ...next, confidence: 'high' };
      }),
    });
  const low = d.rows.filter((r) => r.confidence === 'low').length;

  const save = () => {
    const rep = reportFromDraft({ ...d, date });
    saved.current = true;
    useLabs.getState().add(rep);
    useLabDraft.getState().set(null);
    haptic.success();
    toast(`Сохранено: ${rep.results.length} показателей`, 'checkmark-circle');
    // Сразу отчёт по этой загрузке: что изменилось с прошлого анализа
    router.replace({ pathname: '/labs/report', params: { id: rep.id } });
  };

  return (
    <Screen keyboard>
      <Header title="Проверьте распознанные данные" subtitle="Сохранится только после подтверждения" />
      <View style={{ gap: space.md }}>
        {d.source.kind !== 'manual' ? (
          <Banner icon="eye-outline" tone={low ? 'warning' : 'info'} text={`Распознано: ${d.rows.length}. Сверьте с бланком — нажмите на строку, чтобы исправить${low ? `; ${low} отмечены для проверки` : ''}.`} />
        ) : null}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <DateField label="Дата анализа" value={date} onChange={setDate} testID="lab-date" />
          <Field label="Лаборатория" value={d.lab} onChangeText={(lab) => setD({ ...d, lab })} placeholder="Инвитро, Хеликс…" style={{ flex: 1.3 }} />
        </View>

        <View style={styles.table}>
          {d.rows.map((r, i) => {
            const b = r.markerId ? BIOMARKER_BY_ID[r.markerId] : undefined;
            const unitCanon = normalizeUnit(r.unit);
            if (!open.has(r.key))
              return (
                <Pressable
                  key={r.key}
                  accessibilityRole="button"
                  accessibilityLabel={`Изменить: ${r.name || `строка ${i + 1}`}`}
                  onPress={() => setOpen(new Set([...open, r.key]))}
                  style={[styles.line, i > 0 && styles.sep]}
                  testID={`lab-row-${i}`}
                >
                  <Icon name={b ? 'checkmark-circle' : 'help-circle-outline'} size={16} color={b ? colors.accent : colors.warning} />
                  <View style={{ flex: 1 }}>
                    <T v="body" numberOfLines={1} style={{ fontSize: 14, fontWeight: '700' }}>
                      {b?.name ?? r.name}
                    </T>
                    <T v="small" numberOfLines={1} style={{ fontSize: 11 }}>
                      {r.refText ? `референс ${r.refText}` : 'без референса'}
                      {r.flag ? ` · ${r.flag === 'H' ? 'H ↑' : 'L ↓'}` : ''}
                    </T>
                  </View>
                  <T v="body" style={{ fontWeight: '800', fontVariant: ['tabular-nums'] }}>
                    {r.valueText} <T v="small">{r.unit}</T>
                  </T>
                  <Icon name="create-outline" size={15} color={colors.muted} />
                </Pressable>
              );
            return (
              <View key={r.key} style={[styles.row, i > 0 && styles.sep, r.confidence === 'low' && { backgroundColor: colors.warningDim }]} testID={`lab-row-${i}`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Icon name={b ? 'checkmark-circle' : 'help-circle-outline'} size={16} color={b ? colors.accent : colors.warning} />
                  <T v="small" style={{ flex: 1, fontSize: 12 }}>
                    {b ? `${b.name} · ${CATEGORY_LABEL[b.category]}${unitCanon && unitCanon !== b.unit && b.units?.[unitCanon] ? ` · пересчёт в ${b.unit}` : ''}` : 'Не сопоставлено с каталогом — сохранится как есть'}
                  </T>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Удалить строку ${r.name || i + 1}`} hitSlop={8} onPress={() => setD({ ...d, rows: d.rows.filter((x) => x.key !== r.key) })}>
                    <Icon name="trash-outline" size={16} color={colors.muted} />
                  </Pressable>
                </View>
                <Field value={r.name} onChangeText={(name) => update(r.key, { name })} placeholder="Показатель (как в бланке)" accessibilityLabel={`Название, строка ${i + 1}`} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Field value={r.valueText} onChangeText={(valueText) => update(r.key, { valueText })} placeholder="Значение" keyboardType="decimal-pad" style={{ flex: 1 }} accessibilityLabel={`Значение, строка ${i + 1}`} />
                  <Field value={r.unit} onChangeText={(unit) => update(r.key, { unit })} placeholder="Ед." style={{ flex: 1 }} accessibilityLabel={`Единицы, строка ${i + 1}`} />
                </View>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <Field value={r.refText} onChangeText={(refText) => update(r.key, { refText })} placeholder="Референс (напр. 40 – 50)" style={{ flex: 1 }} accessibilityLabel={`Референс, строка ${i + 1}`} />
                  <Segmented
                    items={[
                      { key: 'none', label: '—' },
                      { key: 'L', label: 'L ↓' },
                      { key: 'H', label: 'H ↑' },
                    ]}
                    value={r.flag ?? 'none'}
                    onChange={(k) => update(r.key, { flag: k === 'none' ? undefined : (k as 'H' | 'L') })}
                    style={{ width: 150 }}
                  />
                </View>
              </View>
            );
          })}
        </View>

        <Button
          title="Добавить показатель"
          icon="add"
          variant="secondary"
          onPress={() => {
            const row = emptyRow(d.rows.length);
            setOpen(new Set([...open, row.key]));
            setD({ ...d, rows: [...d.rows, row] });
          }}
        />

        {issues.length ? (
          <View style={{ gap: 4 }} testID="lab-issues">
            {issues.slice(0, 5).map((x) => (
              <T key={x} v="small" color={colors.warning}>
                • {x}
              </T>
            ))}
          </View>
        ) : null}
        <Button title="Подтвердить и сохранить" icon="checkmark" size="lg" disabled={issues.length > 0} onPress={save} />
        <Button
          title="Отмена"
          variant="ghost"
          onPress={() => {
            useLabDraft.getState().set(null);
            router.back();
          }}
        />
        <T v="small" style={{ fontSize: 11 }}>
          Сохраняются исходные значение, единица и референс из бланка; пересчёт в другую единицу хранится рядом и делается только когда он однозначен.
        </T>
      </View>
    </Screen>
  );
}

const styles = themed({
  table: { backgroundColor: colors.surface, borderRadius: radius.xl, overflow: 'hidden' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: space.md },
  row: { gap: 8, padding: space.md },
  sep: { borderTopWidth: 1, borderTopColor: colors.border },
});
