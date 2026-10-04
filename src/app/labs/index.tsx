import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { colors, radius, space, themed } from '@/theme';
import { Header, Screen } from '@/components/Screen';
import { Banner, Button, Card, EmptyState, Icon, T } from '@/components/ui';
import { Field } from '@/components/inputs';
import { Sheet } from '@/components/Sheet';
import { confirm, toast } from '@/components/Dialog';
import { useLabs } from '@/stores/labs';
import { useProfile } from '@/stores/profile';
import { useLabDraft } from '@/stores/labDraft';
import { BIOMARKER_BY_ID, CATEGORY_LABEL, CATEGORY_ORDER, type LabCategory } from '@/features/labs/catalog';
import { comparable, compareWithPrevious, healthFlags, statusOf, type LabStatus } from '@/features/labs/analysis';
import { draftFromText, labRecognitionAvailable, manualDraft, pickLabDocuments, pickLabPhotos, recognizeLabFiles, type LabFile } from '@/services/labExtract';
import { formatDayShort, today } from '@/utils/date';
import type { LabResult } from '@/types';
import { afterModalClose } from '@/components/modalGate';

const STATUS: Record<LabStatus, { color: string; label: string }> = {
  high: { color: colors.warning, label: 'выше референса' },
  low: { color: colors.warning, label: 'ниже референса' },
  normal: { color: colors.accent, label: 'в пределах референса' },
  unknown: { color: colors.muted, label: 'нет референса' },
};

const fmt = (x: number) => String(Math.round(x * 100) / 100).replace('.', ',');

/**
 * Анализы: загрузка (PDF, фото, скриншоты, несколько страниц; любые лаборатории), история по показателям,
 * «Что изменилось с прошлого анализа», значимые для здоровья находки. Без диагнозов и назначений.
 */
export default function LabsScreen() {
  const reports = useLabs((s) => s.reports);
  const sex = useProfile((s) => s.profile?.sex);
  const [addOpen, setAddOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [allChanges, setAllChanges] = useState(false);

  const latest = useMemo(() => {
    const m = new Map<string, { r: LabResult; date: string }>();
    const sorted = [...reports].sort((a, b) => (a.date < b.date ? -1 : 1));
    for (const rep of sorted) for (const r of rep.results) m.set(r.markerId ?? `name:${r.name}`, { r, date: rep.date });
    const byCat = new Map<LabCategory, { key: string; r: LabResult; date: string }[]>();
    for (const [key, v] of m) {
      const cat = (v.r.markerId && BIOMARKER_BY_ID[v.r.markerId]?.category) || 'other';
      byCat.set(cat, [...(byCat.get(cat) ?? []), { key, ...v }]);
    }
    return byCat;
  }, [reports]);
  const changes = useMemo(() => (reports.length >= 2 ? compareWithPrevious(reports) : null), [reports]);
  const flags = useMemo(() => healthFlags(reports, sex), [reports, sex]);

  const recognize = async (pick: () => Promise<LabFile[] | null>) => {
    setAddOpen(false);
    try {
      const files = await pick();
      if (!files?.length) return;
      setBusy(true);
      const draft = await recognizeLabFiles(files, today());
      useLabDraft.getState().set(draft);
      router.push('/labs/review');
    } catch (e: any) {
      toast(e?.message ?? 'Не удалось распознать файл', 'alert-circle');
    } finally {
      setBusy(false);
    }
  };

  const fromText = () => {
    const d = draftFromText(text, today());
    if (!d.rows.length) {
      toast('Не нашёл показателей в тексте — можно ввести вручную', 'alert-circle');
      return;
    }
    useLabDraft.getState().set(d);
    setPasteOpen(false);
    setText('');
    router.push('/labs/review');
  };

  const significant = changes?.items.filter((c) => c.significant) ?? [];
  const same = changes?.items.filter((c) => !c.significant && c.direction === 'same') ?? [];

  return (
    <Screen>
      <Header title="Анализы" subtitle="Любые лаборатории · история · изменения" right={<Button title="Добавить" icon="add" size="sm" onPress={() => setAddOpen(true)} />} />
      {busy ? <Banner icon="hourglass-outline" text="Распознаю бланк… Это может занять до минуты." /> : null}

      {flags.length ? (
        <Card tone={flags.some((f) => f.level === 'urgent') ? 'danger' : 'warning'} style={{ gap: 8, marginBottom: space.md }} testID="lab-flags">
          <T v="caption" color={colors.warning}>
            Стоит обсудить с врачом
          </T>
          {flags.map((f) => (
            <Pressable key={f.name} accessibilityRole="button" onPress={() => f.markerId && router.push({ pathname: '/labs/[marker]', params: { marker: f.markerId } })} style={{ gap: 2 }}>
              <T v="body" style={{ fontWeight: '800' }} color={f.level === 'urgent' ? colors.danger : colors.text}>
                {f.name}
              </T>
              <T v="small">{f.text}</T>
            </Pressable>
          ))}
        </Card>
      ) : null}

      {!reports.length ? (
        <EmptyState
          icon="flask-outline"
          title="Анализов пока нет"
          text="Загрузите PDF, фото или скриншот бланка (Инвитро, Хеликс и любые другие), вставьте текст или введите значения вручную. Перед сохранением вы проверите каждое значение."
          action="Добавить анализы"
          onAction={() => setAddOpen(true)}
        />
      ) : null}

      {changes && changes.items.length ? (
        <Card style={{ gap: 8, marginBottom: space.md }} testID="lab-changes">
          <T v="caption">Что изменилось с прошлого анализа · {formatDayShort(changes.date!)}</T>
          {significant.length === 0 ? <T v="small">Существенных изменений нет.</T> : null}
          {(allChanges ? significant : significant.slice(0, 6)).map((c) => (
            <Pressable key={c.name} accessibilityRole="button" onPress={() => c.markerId && router.push({ pathname: '/labs/[marker]', params: { marker: c.markerId } })} style={styles.changeRow}>
              <T v="body" style={{ flex: 1, fontSize: 14 }}>
                {c.name}
              </T>
              <T v="body" style={{ fontWeight: '800', fontSize: 14 }} color={c.direction === 'up' ? colors.warning : colors.accent}>
                {c.text}
              </T>
            </Pressable>
          ))}
          {same.length ? (
            <T v="small">
              Без существенных изменений: {same.slice(0, allChanges ? 50 : 4).map((c) => c.name).join(', ')}
              {!allChanges && same.length > 4 ? ` и ещё ${same.length - 4}` : ''}
            </T>
          ) : null}
          {significant.length > 6 || same.length > 4 ? (
            <Pressable accessibilityRole="button" onPress={() => setAllChanges(!allChanges)}>
              <T v="small" color={colors.accent} style={{ fontWeight: '800' }}>
                {allChanges ? 'Свернуть' : 'Показать все'}
              </T>
            </Pressable>
          ) : null}
        </Card>
      ) : null}

      {CATEGORY_ORDER.filter((c) => latest.get(c)?.length).map((cat) => (
        <View key={cat} style={{ marginBottom: space.md }}>
          <T v="caption" style={{ marginBottom: 6 }}>
            {CATEGORY_LABEL[cat]}
          </T>
          <View style={styles.list}>
            {latest.get(cat)!.map(({ key, r, date }, i) => {
              const st = statusOf(r, sex);
              const c = comparable(r);
              const b = r.markerId ? BIOMARKER_BY_ID[r.markerId] : undefined;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={`${b?.name ?? r.name}: ${fmt(c.value)} ${c.unit}, ${STATUS[st].label}`}
                  disabled={!r.markerId}
                  onPress={() => r.markerId && router.push({ pathname: '/labs/[marker]', params: { marker: r.markerId } })}
                  style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
                >
                  <View style={[styles.dot, { backgroundColor: STATUS[st].color }]} />
                  <View style={{ flex: 1 }}>
                    <T v="body" style={{ fontSize: 14, fontWeight: '700' }}>
                      {b?.name ?? r.name}
                    </T>
                    <T v="small" style={{ fontSize: 11 }}>
                      {formatDayShort(date)} · {STATUS[st].label}
                    </T>
                  </View>
                  <T v="body" style={{ fontWeight: '800', fontVariant: ['tabular-nums'] }}>
                    {r.valueText ?? fmt(r.value)} <T v="small">{r.unit}</T>
                  </T>
                  {r.markerId ? <Icon name="chevron-forward" size={14} color={colors.muted} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}

      {reports.length ? (
        <View style={{ marginBottom: space.md }}>
          <T v="caption" style={{ marginBottom: 6 }}>
            Загруженные анализы
          </T>
          <View style={styles.list}>
            {[...reports].reverse().map((rep, i) => (
              <Pressable
                key={rep.id}
                accessibilityRole="button"
                accessibilityHint="Удерживайте, чтобы удалить"
                onLongPress={() => confirm('Удалить анализ?', `${formatDayShort(rep.date)}${rep.lab ? ` · ${rep.lab}` : ''} — ${rep.results.length} показателей`, 'Удалить', () => useLabs.getState().remove(rep.id), true)}
                style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
              >
                <Icon name={rep.source.kind === 'pdf' ? 'document-outline' : rep.source.kind === 'image' ? 'image-outline' : 'create-outline'} size={16} color={colors.textDim} />
                <T v="body" style={{ flex: 1, fontSize: 14 }}>
                  {formatDayShort(rep.date)}
                  {rep.lab ? ` · ${rep.lab}` : ''}
                </T>
                <T v="small">{rep.results.length} показ.</T>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <T v="small" style={{ fontSize: 11 }}>
        RYNJI не ставит диагнозы и не назначает лечение. «Выше/ниже референса» — это сравнение с диапазоном вашей лаборатории, а не диагноз. Решения принимает врач.
      </T>

      <Sheet visible={addOpen} onClose={() => setAddOpen(false)} title="Добавить анализы" subtitle="Перед сохранением вы проверите каждое значение">
        <View style={{ gap: 10 }}>
          {labRecognitionAvailable() ? (
            <>
              <Button title="PDF или изображение из «Файлов»" icon="document-attach-outline" size="lg" onPress={() => recognize(pickLabDocuments)} />
              <Button title="Сфотографировать бланк" icon="camera-outline" variant="secondary" onPress={() => recognize(() => pickLabPhotos(true))} />
              <Button title="Фото или скриншоты из галереи" icon="images-outline" variant="secondary" onPress={() => recognize(() => pickLabPhotos(false))} />
            </>
          ) : (
            <Banner icon="information-circle-outline" text="Распознавание PDF и фото работает, когда в сборке подключён сервер RYNJI. Сейчас: скопируйте текст из PDF или с фото (Live Text: долгое нажатие на текст → «Выбрать все» → «Скопировать») и вставьте его." />
          )}
          <Button
            title="Вставить текст анализов"
            icon="clipboard-outline"
            variant={labRecognitionAvailable() ? 'ghost' : 'primary'}
            onPress={() => {
              setAddOpen(false);
              afterModalClose(() => setPasteOpen(true));
            }}
          />
          <Button
            title="Ввести вручную"
            icon="create-outline"
            variant="ghost"
            onPress={() => {
              setAddOpen(false);
              useLabDraft.getState().set(manualDraft(today()));
              router.push('/labs/review');
            }}
          />
        </View>
      </Sheet>

      <Sheet visible={pasteOpen} onClose={() => setPasteOpen(false)} title="Текст анализов" subtitle="Из PDF, письма лаборатории или Live Text">
        <View style={{ gap: 10 }}>
          <Field placeholder={'Гемоглобин 152 г/л 132 - 173\nАЛТ 52 Ед/л < 41'} value={text} onChangeText={setText} multiline testID="lab-paste" />
          <Button title="Распознать" icon="scan-outline" size="lg" disabled={!text.trim()} onPress={fromText} />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = themed({
  list: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
});
