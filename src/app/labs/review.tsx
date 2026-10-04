import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { colors, radius, space, themed } from '@/theme';
import { Header, Screen } from '@/components/Screen';
import { Banner, Button, Icon, Segmented, T } from '@/components/ui';
import { Field } from '@/components/inputs';
import { toast } from '@/components/Dialog';
import { useLabDraft } from '@/stores/labDraft';
import { useLabs } from '@/stores/labs';
import { BIOMARKER_BY_ID, CATEGORY_LABEL, matchMarker } from '@/features/labs/catalog';
import { normalizeUnit } from '@/features/labs/normalize';
import { draftIssues, emptyRow, reportFromDraft, type DraftRow, type LabDraft } from '@/features/labs/report';
import { haptic } from '@/services/haptics';
import { today } from '@/utils/date';

const toRu = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : iso);
const toIso = (ru: string) => {
  const m = ru.trim().match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ru.trim();
};

/**
 * «Проверьте распознанные данные» — обязательный шаг. Распознанное (OCR, модель, разбор текста) может ошибаться,
 * поэтому ни одно значение не сохраняется как факт без подтверждения. Любое поле можно исправить.
 */
export default function LabReviewScreen() {
  const initial = useLabDraft((s) => s.draft);
  const [d, setD] = useState<LabDraft | null>(initial);
  const [dateText, setDateText] = useState(toRu(initial?.date ?? today()));
  useEffect(() => {
    if (!initial) router.replace('/labs');
  }, [initial]);
  const issues = useMemo(() => (d ? draftIssues({ ...d, date: toIso(dateText) }) : []), [d, dateText]);
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
    const rep = reportFromDraft({ ...d, date: toIso(dateText) });
    useLabs.getState().add(rep);
    useLabDraft.getState().set(null);
    haptic.success();
    toast(`Сохранено: ${rep.results.length} показателей`, 'checkmark-circle');
    if (router.canGoBack()) router.back();
    else router.replace('/labs');
  };

  return (
    <Screen keyboard>
      <Header title="Проверьте распознанные данные" subtitle="Ничего не сохранится без вашего подтверждения" />
      <View style={{ gap: space.md }}>
        {d.source.kind !== 'manual' ? (
          <Banner icon="eye-outline" tone={low ? 'warning' : 'info'} text={`Распознано показателей: ${d.rows.length}. Сверьте с бланком название, значение, единицы и референс${low ? ` — ${low} строк(и) стоит проверить особенно внимательно` : ''}.`} />
        ) : null}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Field label="Дата анализа" value={dateText} onChangeText={setDateText} placeholder="ДД.ММ.ГГГГ" keyboardType="numbers-and-punctuation" style={{ flex: 1 }} testID="lab-date" />
          <Field label="Лаборатория" value={d.lab} onChangeText={(lab) => setD({ ...d, lab })} placeholder="Инвитро, Хеликс…" style={{ flex: 1.3 }} />
        </View>

        {d.rows.map((r, i) => {
          const b = r.markerId ? BIOMARKER_BY_ID[r.markerId] : undefined;
          const unitCanon = normalizeUnit(r.unit);
          return (
            <View key={r.key} style={[styles.row, r.confidence === 'low' && { borderColor: colors.warningLine }]} testID={`lab-row-${i}`}>
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

        <Button title="Добавить показатель" icon="add" variant="secondary" onPress={() => setD({ ...d, rows: [...d.rows, emptyRow(d.rows.length)] })} />

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
  row: { gap: 8, padding: 12, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
});
