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
import { comparable, healthFlags, labComparison, markerSeries, statusOf } from '@/features/labs/analysis';
import { ReportPills, STATUS, fmtLab, openMarker, reportTitle } from '@/features/labs/ui';
import { Tap } from '@/components/motion';
import { Sparkline } from '@/components/charts';
import { draftFromText, labRecognitionAvailable, manualDraft, pickLabDocuments, pickLabPhotos, recognizeLabFiles, type LabFile } from '@/services/labExtract';
import { formatDayShort, today } from '@/utils/date';
import type { LabResult } from '@/types';
import { afterModalClose } from '@/components/modalGate';

/**
 * Анализы: загрузка (PDF, фото, скриншоты, несколько страниц; любые лаборатории) → проверка → отчёт по загрузке
 * (что выросло / снизилось / вне референса / лучше / хуже), последние значения с мини-графиком динамики,
 * таблица всех анализов и история загрузок. Без диагнозов и назначений.
 */
export default function LabsScreen() {
  const reports = useLabs((s) => s.reports);
  const sex = useProfile((s) => s.profile?.sex);
  const [addOpen, setAddOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

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
  const last = useMemo(() => labComparison(reports, undefined, sex), [reports, sex]);
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

  const openReport = (id: string) => router.push({ pathname: '/labs/report', params: { id } });

  return (
    <Screen>
      <Header title="Анализы" right={<Button title="Добавить" icon="add" size="sm" onPress={() => setAddOpen(true)} />} />
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
          text="PDF, фото бланка, текст или вручную — перед сохранением вы проверите каждое значение."
          action="Добавить анализы"
          onAction={() => setAddOpen(true)}
        />
      ) : null}

      {last ? (
        <Tap accessibilityRole="button" accessibilityLabel={`Отчёт по анализу ${reportTitle(last)}`} onPress={() => openReport(last.reportId)} style={styles.report} testID="lab-changes">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <T v="caption">Последний анализ</T>
              <T v="h3">{reportTitle(last)}</T>
            </View>
            <Icon name="chevron-forward" size={18} color={colors.muted} />
          </View>
          <ReportPills c={last} />
        </Tap>
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
              const series = r.markerId ? markerSeries(reports, r.markerId).map((x) => x.value) : [];
              return (
                <Tap
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={`${b?.name ?? r.name}: ${fmtLab(c.value)} ${c.unit}, ${STATUS[st].label}`}
                  disabled={!r.markerId}
                  onPress={() => openMarker(r.markerId)}
                  scaleTo={0.985}
                  style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
                >
                  <View style={[styles.dot, { backgroundColor: STATUS[st].color }]} />
                  <View style={{ flex: 1 }}>
                    <T v="body" numberOfLines={1} style={{ fontSize: 14, fontWeight: '700' }}>
                      {b?.name ?? r.name}
                    </T>
                    <T v="small" style={{ fontSize: 11 }}>
                      {formatDayShort(date)} · {STATUS[st].label}
                    </T>
                  </View>
                  <Sparkline values={series} color={STATUS[st].color} />
                  <T v="body" style={{ fontWeight: '800', fontVariant: ['tabular-nums'], minWidth: 64, textAlign: 'right' }}>
                    {r.valueText ?? fmtLab(r.value)} <T v="small">{r.unit}</T>
                  </T>
                </Tap>
              );
            })}
          </View>
        </View>
      ))}

      {reports.length ? (
        <View style={{ marginBottom: space.md }}>
          <T v="caption" style={{ marginBottom: 6 }}>
            История загрузок
          </T>
          <View style={styles.list}>
            <Pressable accessibilityRole="button" accessibilityLabel="Таблица всех анализов" onPress={() => router.push('/labs/table')} style={styles.row}>
              <Icon name="grid-outline" size={16} color={colors.accent} />
              <T v="body" style={{ flex: 1, fontSize: 14, fontWeight: '700' }}>
                Таблица всех анализов
              </T>
              <Icon name="chevron-forward" size={14} color={colors.muted} />
            </Pressable>
            {[...reports].reverse().map((rep) => (
              <Pressable
                key={rep.id}
                accessibilityRole="button"
                accessibilityLabel={`Анализ ${reportTitle(rep)}: отчёт`}
                accessibilityHint="Удерживайте, чтобы удалить"
                onPress={() => openReport(rep.id)}
                onLongPress={() => confirm('Удалить анализ?', `${formatDayShort(rep.date)}${rep.lab ? ` · ${rep.lab}` : ''} — ${rep.results.length} показателей`, 'Удалить', () => useLabs.getState().remove(rep.id), true)}
                style={[styles.row, { borderTopWidth: 1, borderTopColor: colors.border }]}
              >
                <Icon name={rep.source.kind === 'pdf' ? 'document-outline' : rep.source.kind === 'image' ? 'image-outline' : 'create-outline'} size={16} color={colors.textDim} />
                <T v="body" style={{ flex: 1, fontSize: 14 }}>
                  {reportTitle(rep)}
                </T>
                <T v="small">{rep.results.length} показ.</T>
                <Icon name="chevron-forward" size={14} color={colors.muted} />
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
  list: { backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  report: { gap: 12, padding: space.lg, borderRadius: radius.xl, backgroundColor: colors.surface, marginBottom: space.lg },
});
