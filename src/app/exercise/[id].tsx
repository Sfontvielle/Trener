import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { colors, radius, space } from '@/theme';
import { Header, Screen } from '@/components/Screen';
import { startExercises } from '@/features/training/actions';
import { Banner, Button, Card, EmptyState, Icon, SectionTitle, T } from '@/components/ui';
import { confirm, toast } from '@/components/Dialog';
import { getExercise, CATEGORY_LABEL, EQUIPMENT_LABEL } from '@/data/exercises';
import { useWorkouts } from '@/stores/workouts';
import { useProfile } from '@/stores/profile';
import { ExerciseMedia } from '@/features/exercises/ExerciseMedia';
import { Anatomy } from '@/features/exercises/Anatomy';
import { e1rm, historyFor } from '@/features/training/progression';
import { alternativesFor } from '@/features/training/planGenerator';
import { getPrefs } from '@/features/training/engine/prefs';
import { checkAllowed } from '@/features/training/engine/scoring';
import { prefDislike, prefExclude, prefFavorite, prefInclude } from '@/features/training/prefActions';
import { formatDayShort } from '@/utils/date';
import { fmtWeight } from '@/utils/format';

export default function ExerciseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const customs = useWorkouts((s) => s.customExercises);
  const sessions = useWorkouts((s) => s.sessions);
  const profile = useProfile((s) => s.profile);
  const ex = getExercise(String(id), customs);
  const history = useMemo(() => (ex ? historyFor(ex.id, sessions, 8) : []), [ex, sessions]);
  const alts = useMemo(() => (ex && profile ? alternativesFor(ex.id, profile, customs).slice(0, 5) : []), [ex, profile, customs]);

  if (!ex) {
    return (
      <Screen>
        <Header title="Упражнение" />
        <EmptyState icon="help-circle-outline" title="Упражнение не найдено" text="Возможно, оно было удалено из библиотеки." />
      </Screen>
    );
  }
  const best = history.reduce((m, h) => Math.max(m, ...h.sets.map((s) => e1rm(s.weight, s.reps))), 0);

  return (
    <Screen>
      <Header title={ex.name} subtitle={`${CATEGORY_LABEL[ex.category]} · ${ex.mechanic === 'compound' ? 'базовое' : 'изолирующее'}`} />
      <ExerciseMedia exercise={ex} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.md }}>
        {ex.equipment.map((e) => (
          <View key={e} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.surface2 }}>
            <T v="small" style={{ fontSize: 12, fontWeight: '700' }}>
              {EQUIPMENT_LABEL[e]}
            </T>
          </View>
        ))}
        <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.surface2 }}>
          <T v="small" style={{ fontSize: 12, fontWeight: '700' }}>
            {ex.defaultReps[0]}–{ex.defaultReps[1]} {ex.pattern === 'core' || ex.pattern === 'carry' ? (ex.defaultReps[1] >= 30 ? 'сек/повт' : 'повт') : 'повт'}
          </T>
        </View>
      </View>

      <SectionTitle title="Какие мышцы работают" />
      <Anatomy primary={ex.primary} secondary={ex.secondary} sex={profile?.sex} />

      <SectionTitle title="Как выполнять" />
      <Card style={{ gap: 10 }}>
        {ex.cues.map((c, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.accentDim, alignItems: 'center', justifyContent: 'center' }}>
              <T v="small" color={colors.accent} style={{ fontWeight: '800' }}>
                {i + 1}
              </T>
            </View>
            <T v="body" style={{ flex: 1 }}>
              {c}
            </T>
          </View>
        ))}
      </Card>

      {ex.mistakes.length ? (
        <>
          <SectionTitle title="Частые ошибки" />
          <Card tone="warning" style={{ gap: 8 }}>
            {ex.mistakes.map((m, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
                <Icon name="close-circle" size={18} color={colors.warning} />
                <T v="body" style={{ flex: 1 }}>
                  {m}
                </T>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <SectionTitle title="Твоя история" />
      {history.length ? (
        <Card style={{ gap: 8 }}>
          {best > 0 ? (
            <T v="small">
              Лучший расчётный 1ПМ: <T v="small" color={colors.accent} style={{ fontWeight: '800' }}>{fmtWeight(Math.round(best))} кг</T>
            </T>
          ) : null}
          {history.map((h, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
              <T v="small" style={{ width: 64 }}>
                {formatDayShort(h.date)}
              </T>
              <T v="body" style={{ flex: 1, fontSize: 14 }}>
                {h.sets.map((s) => (s.weight ? `${fmtWeight(s.weight)}×${s.reps}` : `${s.reps}`)).join('  ·  ')}
              </T>
            </View>
          ))}
        </Card>
      ) : (
        <T v="small">Ты ещё не выполнял это упражнение.</T>
      )}

      {profile ? <ExercisePrefButtons id={ex.id} /> : null}

      {alts.length ? (
        <>
          <SectionTitle title="Альтернативы" />
          <View style={{ gap: 8 }}>
            {alts.map((a) => (
              <Pressable key={a.id} onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: a.id } })} style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
                <T v="body" style={{ flex: 1 }} numberOfLines={1}>
                  {a.name}
                </T>
                <Icon name="chevron-forward" size={16} color={colors.muted} />
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

/** Избранное / Не нравится / Не предлагать — сразу перестраивают план */
function ExercisePrefButtons({ id }: { id: string }) {
  const profile = useProfile((s) => s.profile);
  if (!profile) return null;
  const t = getPrefs(profile);
  const excluded = t.excluded.find((e) => e.exerciseId === id);
  const fav = t.preferredExercises.includes(id);
  const dis = t.dislikedExercises.includes(id);
  const blocked = getExercise(id) ? checkAllowed(getExercise(id)!, profile, t) : { ok: true as const };
  return (
    <View style={{ gap: 8, marginTop: space.lg }}>
      {!blocked.ok && !excluded ? <Banner tone="warning" icon="shield-checkmark-outline" text={`Не попадает в план: ${blocked.reason}`} /> : null}
      {excluded ? <Banner tone="warning" icon="ban-outline" text={excluded.reason === 'discomfort' ? 'Исключено из-за дискомфорта — не назначается автоматически.' : 'В списке «Не предлагать».'} /> : null}
      <Button title="Тренировать сейчас" icon="play" onPress={() => startExercises([id])} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button title={fav ? 'В избранном' : 'В избранное'} icon={fav ? 'star' : 'star-outline'} size="sm" variant={fav ? 'primary' : 'secondary'} style={{ flex: 1 }} onPress={() => toast(prefFavorite(id))} />
        <Button title={dis ? 'Не нравится ✓' : 'Не нравится'} icon="thumbs-down-outline" size="sm" variant="secondary" style={{ flex: 1 }} onPress={() => toast(prefDislike(id))} />
      </View>
      <Button
        title={excluded ? 'Вернуть в мои планы' : 'Не предлагать больше'}
        icon={excluded ? 'refresh' : 'ban-outline'}
        variant="outline"
        size="sm"
        onPress={() => (excluded ? toast(prefInclude(id)) : confirm('Не предлагать упражнение?', 'FORM перестроит план и подберёт замену. Вернуть можно здесь или в Профиль → Предпочтения.', 'Не предлагать', () => toast(prefExclude(id))))}
      />
    </View>
  );
}
