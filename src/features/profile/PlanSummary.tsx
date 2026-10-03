import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { CalcStep, NutritionTarget, WorkoutPlan } from '@/types';
import { colors, radius, space, themed } from '@/theme';
import { Card, Icon, T } from '@/components/ui';
import { WEEKDAYS_SHORT } from '@/utils/date';
import { fmtNum } from '@/utils/format';
import { VM_LABEL } from '@/features/training/engine/muscles';
import { SplitCompareButton } from '@/features/training/SplitCompare';
import { BRAND } from '@/config/brand';

export function MacroTiles({ target }: { target: NutritionTarget }) {
  const items = [
    { k: 'Ккал', v: fmtNum(target.kcal), c: colors.text },
    { k: 'Белки', v: `${target.protein} г`, c: colors.protein },
    { k: 'Жиры', v: `${target.fat} г`, c: colors.fat },
    { k: 'Углеводы', v: `${target.carbs} г`, c: colors.carbs },
  ];
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {items.map((it) => (
        <View key={it.k} style={styles.tile}>
          <T v="caption" numberOfLines={1} style={{ fontSize: 10 }}>
            {it.k}
          </T>
          <T v="num" style={{ fontSize: 17, color: it.c }} numberOfLines={1} adjustsFontSizeToFit>
            {it.v}
          </T>
        </View>
      ))}
    </View>
  );
}

export function CalcSteps({ steps, title = 'Как посчитано', footer = `Это стартовая точка. Через 2–3 недели ${BRAND} сверит калории с реальным трендом веса и скорректирует их.` }: { steps: CalcStep[]; title?: string; footer?: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable accessibilityRole="button" onPress={() => setOpen(!open)} style={styles.toggle} hitSlop={6}>
        <T v="small" color={colors.accent} style={{ fontWeight: '700' }}>
          {title}
        </T>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.accent} />
      </Pressable>
      {open ? (
        <View style={{ gap: 8, marginTop: 6 }}>
          {steps.map((s, i) => (
            <View key={i} style={styles.step}>
              <View style={{ flex: 1 }}>
                <T v="body" style={{ fontSize: 14 }}>
                  {s.label}
                </T>
                {s.note ? (
                  <T v="small" style={{ fontSize: 12 }}>
                    {s.note}
                  </T>
                ) : null}
              </View>
              <T v="body" style={{ fontWeight: '800', fontSize: 14, maxWidth: '55%', textAlign: 'right' }}>
                {s.value}
              </T>
            </View>
          ))}
          {footer ? (
            <T v="small" style={{ fontSize: 12 }}>
              {footer}
            </T>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function WeekStrip({ plan }: { plan: WorkoutPlan }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {plan.schedule.map((tid, i) => {
        const t = plan.templates.find((x) => x.id === tid);
        return (
          <View key={i} style={[styles.day, t && { backgroundColor: colors.accentDim, borderColor: colors.accentLine }]}>
            <T v="small" style={{ fontSize: 11 }}>
              {WEEKDAYS_SHORT[i]}
            </T>
            <T v="small" color={t ? colors.text : colors.muted} style={{ fontSize: 10, fontWeight: '800' }} numberOfLines={1} adjustsFontSizeToFit>
              {t ? t.name.replace('Всё тело', 'Тело').replace('Конечности', 'Конеч.').replace('Жимовая', 'Жим').replace('Тяговая', 'Тяга') : '—'}
            </T>
          </View>
        );
      })}
    </View>
  );
}

export function PlanOverview({ plan, target }: { plan: WorkoutPlan; target: NutritionTarget }) {
  return (
    <View style={{ gap: space.md }}>
      <Card>
        <T v="caption">Питание в день</T>
        <View style={{ marginTop: 10 }}>
          <MacroTiles target={target} />
        </View>
        <View style={{ marginTop: 10 }}>
          <CalcSteps steps={target.steps} />
        </View>
      </Card>
      <Card>
        <T v="caption">Тренировки</T>
        <T v="h2" style={{ marginTop: 6 }}>
          {plan.splitLabel} · {plan.daysPerWeek}× в неделю
        </T>
        <T v="small">
          {plan.sessionMinutes[0]}–{plan.sessionMinutes[1]} мин · {plan.weeklySetsTarget[0]}–{plan.weeklySetsTarget[1]} рабочих подходов в неделю на группу
        </T>
        <View style={{ marginTop: 12 }}>
          <WeekStrip plan={plan} />
        </View>
        <View style={{ marginTop: 10 }}>
          <CalcSteps steps={plan.rationale} title="Подробный расчёт" footer="План пересчитывается при изменении профиля, предпочтений и ограничений. Упражнения с прогрессом сохраняются." />
        </View>
      </Card>
    </View>
  );
}

const styles = themed({
  tile: { flex: 1, backgroundColor: colors.surface2, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 8, gap: 2 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 32 },
  step: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surface3, overflow: 'hidden' },
  fillBar: { height: 8, borderRadius: 4 },
  mark: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: colors.text, opacity: 0.6 },
  day: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.sm, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, gap: 2 },
});

/** «Почему такой план?»: сплит, недельный объём по группам и что было учтено (ограничения, стиль подходов) */
export function PlanWhy({ plan, onChange }: { plan: WorkoutPlan; onChange: () => void }) {
  const [all, setAll] = useState(false);
  const reasons = plan.splitChoice?.reasons ?? [];
  const vol = (plan.volume ?? []).filter((v) => v.target > 0);
  const notes = plan.notes ?? [];
  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <T v="caption" style={{ flex: 1 }}>
          Почему такой план?
        </T>
        <Pressable accessibilityRole="button" onPress={onChange} hitSlop={8}>
          <T v="small" color={colors.accent} style={{ fontWeight: '800' }}>
            Изменить
          </T>
        </Pressable>
      </View>
      <T v="h3">{plan.splitChoice?.preference === 'auto' || !plan.splitChoice ? `${BRAND} выбрал ${plan.splitLabel}` : plan.splitLabel}</T>
      {reasons.map((r) => (
        <T key={r} v="small">
          • {r}
        </T>
      ))}
      {vol.length ? (
        <View style={{ gap: 6, marginTop: 4 }}>
          <T v="caption">Подходы в неделю: план / цель</T>
          {(all ? vol : vol.slice(0, 6)).map((v) => {
            const pct = Math.min(1.3, v.planned / Math.max(1, v.target));
            const low = pct < 0.75;
            return (
              <View key={v.muscle} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <T v="small" style={{ width: 118, fontSize: 12 }} numberOfLines={1}>
                  {VM_LABEL[v.muscle]}
                </T>
                <View style={styles.track}>
                  <View style={[styles.fillBar, { width: `${(pct / 1.3) * 100}%`, backgroundColor: low ? colors.warning : colors.accent }]} />
                  <View style={[styles.mark, { left: `${(1 / 1.3) * 100}%` }]} />
                </View>
                <T v="small" style={{ width: 44, textAlign: 'right', fontSize: 12, fontVariant: ['tabular-nums'] }} color={colors.text}>
                  {v.planned}/{v.target}
                </T>
              </View>
            );
          })}
          {vol.length > 6 ? (
            <Pressable onPress={() => setAll(!all)} hitSlop={6} accessibilityRole="button">
              <T v="small" color={colors.accent} style={{ fontWeight: '700' }}>
                {all ? 'Свернуть' : `Все группы (${vol.length})`}
              </T>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <SplitCompareButton plan={plan} style={{ marginTop: 4 }} />
      {notes.length ? (
        <View style={{ gap: 4, marginTop: 4 }}>
          <T v="caption">Что учтено</T>
          {notes.map((n) => (
            <T key={n} v="small" style={{ fontSize: 12 }}>
              • {n}
            </T>
          ))}
        </View>
      ) : null}
    </Card>
  );
}
