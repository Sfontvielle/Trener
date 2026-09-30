import type { CoachAction, FoodEntry, FoodProduct, NutritionTarget, ReadinessResult, UserProfile } from '@/types';
import type { TodayWorkout } from '@/features/training/today';
import { MODE_LABEL } from '@/features/training/today';
import { remaining, sumMacros } from '@/features/nutrition/status';
import { suggestMeals } from '@/features/nutrition/suggest';
import type { LocalInsight } from './insights';
import { uid } from '@/utils/id';
import { today } from '@/utils/date';

/**
 * Офлайн-ответ: когда AI недоступен, FORM всё равно отвечает по своим расчётам.
 * Это не «интеллект тренера», а честный fallback на основе программных фактов.
 */
export function offlineAnswer(args: {
  question: string;
  profile: UserProfile;
  target: NutritionTarget | null;
  entries: FoodEntry[];
  recentProducts: FoodProduct[];
  todayW: TodayWorkout;
  readiness?: ReadinessResult;
  insights: LocalInsight[];
}): { text: string; actions: CoachAction[] } {
  const q = args.question.toLowerCase();
  const actions: CoachAction[] = [];
  const food = /(е(сть|шь|м)|поесть|съесть|перекус|ужин|обед|завтрак|белк|калор|кбжу|углев|жир|добрать|питан)/.test(q);
  const train = /(трен|зал|подход|вес|жим|присед|тяга|упражн|нагруз|план)/.test(q);

  if (food && args.target) {
    const todayEntries = args.entries.filter((e) => e.date === today());
    const rem = remaining(args.target, sumMacros(todayEntries));
    const s = suggestMeals({ remaining: rem, profile: args.profile, todayEntries, recentProducts: args.recentProducts });
    const lines = [`Осталось: ${Math.max(0, Math.round(rem.kcal))} ккал, Б ${Math.max(0, Math.round(rem.protein))} / Ж ${Math.max(0, Math.round(rem.fat))} / У ${Math.max(0, Math.round(rem.carbs))}.`];
    lines.push(...s.notes);
    const o = s.options[0];
    if (o) lines.push(`Вариант: ${o.items.map((i) => `${i.product.name.toLowerCase()} ${i.grams} г`).join(' + ')} ≈ ${Math.round(o.total.kcal)} ккал, Б ${Math.round(o.total.protein)} Ж ${Math.round(o.total.fat)} У ${Math.round(o.total.carbs)}.`);
    return { text: lines.join(' '), actions };
  }

  if (train) {
    const t = args.todayW;
    if (t.kind === 'workout' && t.template) {
      let text = `Сегодня ${t.template.name} (${t.template.focus}), ~${t.estMinutes} мин, ${t.totalSets} подходов. Режим: ${MODE_LABEL[t.mode]}.`;
      if (args.readiness) text += ` Готовность ${args.readiness.score}/100 — ${args.readiness.headline.toLowerCase()}.`;
      if (args.readiness && args.readiness.band === 'go') {
        actions.push({ id: uid('act_'), type: 'set_day_mode', label: 'Облегчить сегодня (−15%)', params: { mode: 'reduced', volumeFactor: 0.85, rirDelta: 0, reason: 'Облегчено по запросу' } });
      }
      return { text, actions };
    }
    if (t.kind === 'rest') return { text: `Сегодня по плану отдых.${t.nextWorkout ? ` Следующая тренировка — ${t.nextWorkout.template.name}.` : ''} Если хочется двигаться — прогулка или лёгкая мобильность.`, actions };
    if (t.kind === 'done') return { text: 'Сегодняшняя тренировка уже выполнена. Теперь важны белок, углеводы и сон.', actions };
  }

  const top = args.insights.slice(0, 2).map((i) => i.text);
  return { text: top.length ? top.join(' ') : 'Спроси про питание, тренировку или восстановление — отвечу по твоим данным.', actions };
}
