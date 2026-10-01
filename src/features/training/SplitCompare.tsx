import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { WorkoutPlan } from '@/types';
import { colors, radius, space, themed } from '@/theme';
import { Button, Icon, T } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import { SPLIT_LABEL } from './engine/split';

/**
 * «Сравнить с другими вариантами» / «Почему не Full Body?».
 * Оценка остаётся внутренней — пользователю показываются плюсы и минусы каждого варианта.
 */
export function SplitCompareButton({ plan, style }: { plan: WorkoutPlan; style?: object }) {
  const [open, setOpen] = useState(false);
  const cands = plan.splitChoice?.candidates ?? [];
  if (cands.length < 2) return null;
  const chosen = plan.split;
  const fb = chosen !== 'fullbody' && cands.some((c) => c.split === 'fullbody');
  return (
    <>
      <Button title={fb ? 'Почему не Full Body?' : 'Сравнить с другими вариантами'} icon="git-compare-outline" size="sm" variant="secondary" onPress={() => setOpen(true)} style={style} />
      <Sheet visible={open} onClose={() => setOpen(false)} title="Варианты программы" subtitle={`${plan.daysPerWeek} дн. в неделю · сравнение под твои параметры`}>
        <View style={{ gap: 10 }}>
          {[...cands].sort((a, b) => (a.split === chosen ? -1 : b.split === chosen ? 1 : b.score - a.score)).map((c) => (
            <Item key={c.split} c={c} chosen={c.split === chosen} />
          ))}
        </View>
      </Sheet>
    </>
  );
}

function Item({ c, chosen }: { c: NonNullable<WorkoutPlan['splitChoice']>['candidates'] extends (infer U)[] | undefined ? U : never; chosen: boolean }) {
  const [more, setMore] = useState(chosen);
  return (
    <Pressable accessibilityRole="button" onPress={() => setMore(!more)} style={[styles.item, chosen && { borderColor: colors.accent }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <T v="h3" style={{ flex: 1 }}>
          {SPLIT_LABEL[c.split]}
        </T>
        {chosen ? (
          <View style={styles.badge}>
            <T v="small" color={colors.onAccent} style={{ fontWeight: '800', fontSize: 11 }}>
              Выбран FORM
            </T>
          </View>
        ) : (
          <Icon name={more ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
        )}
      </View>
      <T v="small" style={{ marginTop: 2 }}>
        ~{c.estMinutes} мин · мышцы ~{String(c.freq).replace('.', ',')}× в неделю
      </T>
      {more ? (
        <View style={{ marginTop: 8, gap: 3 }}>
          {c.pros.map((p) => (
            <T key={p} v="small" color={colors.text}>
              <T v="small" color={colors.accent} style={{ fontWeight: '800' }}>
                +{' '}
              </T>
              {p}
            </T>
          ))}
          {c.cons.map((p) => (
            <T key={p} v="small" color={colors.text}>
              <T v="small" color={colors.warning} style={{ fontWeight: '800' }}>
                −{' '}
              </T>
              {p}
            </T>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = themed({
  item: { padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface2, borderWidth: 1.5, borderColor: colors.border },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.accent },
});
