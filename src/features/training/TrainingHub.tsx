import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Sheet } from '@/components/Sheet';
import { Button, Chip, Icon, T, type IconName } from '@/components/ui';
import { colors, radius, space, themed } from '@/theme';
import { useUi } from '@/stores/ui';
import { useWorkouts } from '@/stores/workouts';
import { useTodayWorkout } from '@/hooks/useToday';
import { MODE_LABEL } from './today';
import { FOCUS_LABEL, type GenFocus } from './generator';
import { openCustomBuilder, openGenerated, resumeActive, startTodayPlanned } from './actions';
import { useProfile } from '@/stores/profile';
import { formatDayShort } from '@/utils/date';
import { BRAND } from '@/config/brand';
import { afterModalClose } from '@/components/modalGate';

const MINUTES = [30, 45, 60, 75, 90];

function Row({ icon, title, sub, onPress, accent }: { icon: IconName; title: string; sub: string; onPress: () => void; accent?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, accent && { borderColor: colors.accentLine }, pressed && { opacity: 0.8 }]}>
      <View style={[styles.rowIcon, accent && { backgroundColor: colors.accent }]}>
        <Icon name={icon} size={20} color={accent ? colors.onAccent : colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <T v="h3" numberOfLines={1}>
          {title}
        </T>
        <T v="small" numberOfLines={2}>
          {sub}
        </T>
      </View>
      <Icon name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

/** Центральная кнопка «+»: всё, что связано с началом тренировки */
export function TrainingHub() {
  const open = useUi((s) => s.hubOpen);
  const close = useUi((s) => s.closeHub);
  const active = useWorkouts((s) => s.active);
  const draft = useWorkouts((s) => s.draft);
  const tw = useTodayWorkout();
  const sessionMin = useProfile((s) => s.profile?.sessionMinutes ?? 60);
  const [genOpen, setGenOpen] = useState(false);
  const [minutes, setMinutes] = useState(() => MINUTES.reduce((a, b) => (Math.abs(b - sessionMin) < Math.abs(a - sessionMin) ? b : a), 60));
  const [focus, setFocus] = useState<GenFocus>('auto');

  const run = (fn: () => void) => {
    close();
    setGenOpen(false);
    afterModalClose(fn);
  };
  const doneSets = active ? active.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0) : 0;

  return (
    <Sheet visible={open} onClose={() => { close(); setGenOpen(false); }} title="Тренировка">
      <View style={{ gap: space.sm }}>
        {active ? (
          <Row accent icon="play" title="Продолжить незавершённую" sub={`${active.name} · выполнено подходов: ${doneSets}`} onPress={() => run(resumeActive)} />
        ) : null}

        <View style={styles.today}>
          <T v="caption">Сегодня по плану</T>
          {tw.kind === 'workout' && tw.template ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                <T v="h1" numberOfLines={2} style={{ flexShrink: 1 }}>
                  {tw.template.name}
                </T>
                <T v="small">~{tw.estMinutes} мин</T>
              </View>
              <T v="small" numberOfLines={1}>
                {tw.template.focus} · {tw.totalSets} подходов{tw.mode !== 'normal' ? ` · ${MODE_LABEL[tw.mode]}` : ''}
              </T>
              <Button title="Начать" icon="play" size="lg" onPress={() => run(() => startTodayPlanned())} style={{ marginTop: space.md }} />
            </>
          ) : tw.kind === 'done' ? (
            <T v="body" style={{ marginTop: 4 }}>
              Тренировка на сегодня выполнена ✓{tw.nextWorkout ? ` Следующая — ${tw.nextWorkout.template.name}, ${formatDayShort(tw.nextWorkout.date)}.` : ''}
            </T>
          ) : tw.kind === 'rest' ? (
            <>
              <T v="body" style={{ marginTop: 4 }}>
                День отдыха{tw.reason ? ` — ${tw.reason.toLowerCase()}` : ''}.
              </T>
              {tw.nextWorkout ? (
                <Button
                  title={`Сделать ${tw.nextWorkout.template.name} сегодня`}
                  variant="secondary"
                  size="md"
                  onPress={() => run(() => startTodayPlanned(tw.nextWorkout!.template))}
                  style={{ marginTop: space.md }}
                />
              ) : null}
            </>
          ) : (
            <T v="small">План ещё не создан — заполни профиль.</T>
          )}
        </View>

        {genOpen ? (
          <View style={styles.gen}>
            <T v="h3">Сгенерировать тренировку</T>
            <T v="small">{BRAND} учтёт сплит, готовность, недавно нагруженные мышцы, остаток недельного объёма, ограничения и оборудование.</T>
            <T v="caption" style={{ marginTop: space.sm }}>
              Время
            </T>
            <View style={styles.chips}>
              {MINUTES.map((m) => (
                <Chip key={m} label={`${m} мин`} active={minutes === m} onPress={() => setMinutes(m)} />
              ))}
            </View>
            <T v="caption" style={{ marginTop: space.sm }}>
              Фокус
            </T>
            <View style={styles.chips}>
              {(Object.keys(FOCUS_LABEL) as GenFocus[]).map((f) => (
                <Chip key={f} label={FOCUS_LABEL[f]} active={focus === f} onPress={() => setFocus(f)} />
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: space.md }}>
              <Button title="Отмена" variant="secondary" onPress={() => setGenOpen(false)} style={{ flex: 1 }} />
              <Button title="Сгенерировать" icon="sparkles" onPress={() => run(() => openGenerated(minutes, focus))} style={{ flex: 1.6 }} />
            </View>
          </View>
        ) : (
          <Row
            icon="sparkles"
            title={tw.kind === 'workout' ? 'Сгенерировать другую' : 'Сгенерировать тренировку'}
            sub={tw.kind === 'workout' ? 'Если план сегодня не подходит: другое время или фокус' : 'День твоего сплита с наибольшим недобором объёма'}
            onPress={() => setGenOpen(true)}
          />
        )}
        <Row icon="construct-outline" title="Собрать свою" sub="Выбери упражнения из библиотеки" onPress={() => run(openCustomBuilder)} />
        <Row icon="flash-outline" title="Быстрая тренировка" sub="~30 минут: главное из твоего сплита, короткий отдых" onPress={() => run(() => openGenerated(30, 'auto', true))} />
        <Row icon="library-outline" title="Библиотека упражнений" sub="Техника, альтернативы, избранное и исключения" onPress={() => run(() => router.push({ pathname: '/training', params: { seg: 'library' } }))} />
        {draft && draft.exercises.length > 0 ? (
          <Row icon="document-text-outline" title="Черновик тренировки" sub={`${draft.name} · ${draft.exercises.length} упр.`} onPress={() => run(() => router.push('/workout/builder'))} />
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = themed({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, minHeight: 64 },
  rowIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accentDim, alignItems: 'center', justifyContent: 'center' },
  today: { padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.accentLine },
  gen: { padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
