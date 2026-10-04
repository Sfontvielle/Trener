import type { DailyCheckIn, ISODate, SplitPreference, SplitType, UserProfile, WorkoutPlan, WorkoutSession } from '@/types';
import { addDays, today, weekdayIndex, WEEKDAYS_SHORT } from '@/utils/date';
import { getPrefs } from './engine/prefs';
import { progressStatus } from './engine/scoring';
import { SPLIT_LABEL } from './engine/split';
import { workingSets } from './progression';

/**
 * Адаптация программы по фактическим данным. Программа не «выбирается навсегда»:
 *  • регулярно пропускаются определённые дни → план под реальное число дней / другие дни недели;
 *  • плохое восстановление → меньше дней или меньше объёма;
 *  • застой в большинстве базовых → смена структуры (больше частоты на мышцу);
 *  • программа даётся легко и выполняется полностью → можно добавить объём или день.
 * Ничего не применяется само: возвращается ПРЕДЛОЖЕНИЕ с объяснением, применяет пользователь.
 */
export interface ProgramProposal {
  id: string;
  kind: 'split' | 'days' | 'volume' | 'schedule';
  title: string;
  why: string[];
  /** Почему именно этот формат подходит этому пользователю */
  splitWhy?: string;
  change: { daysPerWeek?: number; split?: SplitPreference; preferredDays?: number[]; volumeDelta?: number };
}

/** Чем каждый формат хорош — в привязке к ситуации пользователя */
export function splitFitText(split: SplitType | SplitPreference, days: number): string {
  switch (split) {
    case 'fullbody':
      return `«${SPLIT_LABEL.fullbody}»: каждая мышца работает в каждой тренировке — при ${days} днях в неделю это ${days}× частоты, и пропуск одного дня не выбивает группу целиком. Лучший вариант при 2–3 тренировках или нестабильном графике.`;
    case 'upper_lower':
      return `«${SPLIT_LABEL.upper_lower}»: каждая мышца 2× в неделю при 4 днях, тренировки короче и объём на мышцу выше, чем во «Всём теле». Подходит, когда стабильно получается 4 дня.`;
    case 'torso_limbs':
      return `«${SPLIT_LABEL.torso_limbs}»: как «Верх / Низ», но руки и ноги в одном дне — удобно, если хочется больше работы на руки при 4 днях.`;
    case 'ppl':
      return `«${SPLIT_LABEL.ppl}»: много объёма на мышцу за сессию при 1× частоте (3 дня) или ~2× (6 дней). Подходит опытным с хорошим восстановлением и стабильным графиком.`;
    case 'ul_ppl':
      return `«${SPLIT_LABEL.ul_ppl}»: 5 дней, каждая мышца ~2× в неделю. Для продвинутых при 5 стабильных тренировках.`;
    case 'bro':
      return `«${SPLIT_LABEL.bro}»: одна-две группы в день, частота 1× — работает при высоком объёме и 5 днях, но пропуск дня выбивает группу на неделю.`;
    default:
      return 'Формат подбирается по твоим дням, опыту, времени и восстановлению.';
  }
}

function weeksOf(sessions: WorkoutSession[], ref: ISODate, n: number): number[] {
  return Array.from({ length: n }, (_, i) => {
    const to = addDays(ref, -7 * i);
    const from = addDays(to, -6);
    return sessions.filter((s) => s.status === 'completed' && s.date >= from && s.date <= to).length;
  });
}

export function analyzeProgram(args: {
  profile: UserProfile;
  plan: WorkoutPlan | null;
  sessions: WorkoutSession[];
  checkins: Record<string, DailyCheckIn>;
  readinessAvg?: number | null;
  ref?: ISODate;
}): ProgramProposal[] {
  const { profile, plan, sessions } = args;
  if (!plan) return [];
  const ref = args.ref ?? today();
  const done = sessions.filter((s) => s.status === 'completed');
  const first = done.map((s) => s.date).sort()[0];
  // Нужна история минимум 3 недели — иначе выводы случайны
  if (!first || first > addDays(ref, -20)) return [];
  const prefs = getPrefs(profile);
  const out: ProgramProposal[] = [];
  const weeks = weeksOf(sessions, ref, 4);
  const avg = weeks.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
  const realDays = Math.max(2, Math.round(avg));
  const planDays = profile.daysPerWeek;

  // 1) Пропуски: стабильно меньше дней, чем в плане
  if (weeks.slice(0, 3).every((w) => w < planDays) && realDays < planDays) {
    const why = [`3 недели подряд: ${weeks.slice(0, 3).reverse().join(' / ')} тренировки при плане ${planDays}.`, 'Когда часть дней выпадает, некоторые мышцы неделями не получают нагрузку.'];
    const toFull = realDays <= 3 && plan.split !== 'fullbody' && prefs.preferredSplit !== 'custom';
    out.push({
      id: `days-${realDays}${toFull ? '-fb' : ''}`,
      kind: toFull ? 'split' : 'days',
      title: toFull ? `${realDays} дня в неделю, формат «${SPLIT_LABEL.fullbody}»` : `План на ${realDays} дн. в неделю`,
      why,
      splitWhy: toFull ? splitFitText('fullbody', realDays) : undefined,
      change: { daysPerWeek: realDays, split: toFull ? 'fullbody' : undefined, preferredDays: [] },
    });
  }

  // 1б) Пропускаются конкретные дни недели — перенести тренировки на дни, когда получается
  if (!out.length) {
    const missedBy: number[] = Array(7).fill(0);
    const doneBy: number[] = Array(7).fill(0);
    for (let d = addDays(ref, -27); d <= ref; d = addDays(d, 1)) {
      const wd = weekdayIndex(d);
      const did = done.some((s) => s.date === d);
      if (did) doneBy[wd]++;
      if (plan.schedule[wd] && !did) missedBy[wd]++;
    }
    const bad = missedBy.map((m, i) => ({ i, m })).filter((x) => x.m >= 3);
    if (bad.length) {
      const sched = plan.schedule.map((t, i) => (t ? i : -1)).filter((i) => i >= 0);
      const keep = sched.filter((i) => !bad.some((b) => b.i === i));
      const free = [0, 1, 2, 3, 4, 5, 6].filter((i) => !sched.includes(i)).sort((a, b) => doneBy[b] - doneBy[a]);
      const moved = [...keep, ...free.slice(0, sched.length - keep.length)].sort();
      if (moved.length === sched.length && moved.join() !== sched.join()) {
        out.push({
          id: `sched-${moved.join('')}`,
          kind: 'schedule',
          title: `Перенести тренировки: ${bad.map((b) => WEEKDAYS_SHORT[b.i]).join(', ')} → ${free.slice(0, bad.length).map((i) => WEEKDAYS_SHORT[i]).join(', ')}`,
          why: [`За 4 недели ${bad.map((b) => `${WEEKDAYS_SHORT[b.i]} пропущен ${b.m} раза`).join('; ')}.`, 'Удобнее тренироваться в дни, когда это реально получается.'],
          change: { preferredDays: moved },
        });
      }
    }
  }

  // 2) Восстановление: стабильно низкая готовность или много «тяжело/отказ»
  const recent = done.filter((s) => s.date > addDays(ref, -14));
  const sets = recent.flatMap((s) => s.exercises.flatMap((we) => workingSets(we.sets)));
  const hardShare = sets.length ? sets.filter((x) => x.feel === 'hard' || x.feel === 'max' || (x.rir !== undefined && x.rir <= 0)).length / sets.length : 0;
  const lowReady = args.readinessAvg !== undefined && args.readinessAvg !== null && args.readinessAvg < 62;
  if ((lowReady || hardShare > 0.5) && sets.length >= 20) {
    const fewer = planDays >= 5;
    out.push({
      id: `recovery-${fewer ? planDays - 1 : 'vol'}`,
      kind: fewer ? 'days' : 'volume',
      title: fewer ? `Сократить до ${planDays - 1} дней` : 'Снизить недельный объём на ~15%',
      why: [lowReady ? `Готовность в среднем ${Math.round(args.readinessAvg!)} из 100 за 2 недели.` : '', hardShare > 0.5 ? `${Math.round(hardShare * 100)}% подходов отмечены как «тяжело/до отказа».` : '', 'Без восстановления прогресс останавливается — меньше, но качественнее.'].filter(Boolean),
      change: fewer ? { daysPerWeek: planDays - 1, preferredDays: [] } : { volumeDelta: -2 },
    });
  }

  // 3) Застой в большинстве основных упражнений плана
  const mainIds = [...new Set(plan.templates.flatMap((t) => t.exercises.slice(0, 2).map((e) => e.exerciseId)))];
  const statuses = mainIds.map((id) => progressStatus(id, sessions)).filter((s) => s.status !== 'new');
  const plateaus = statuses.filter((s) => s.status === 'plateau').length;
  if (statuses.length >= 3 && plateaus / statuses.length >= 0.5 && prefs.preferredSplit !== 'custom') {
    const next: SplitPreference | null = plan.split === 'fullbody' && planDays >= 4 ? 'upper_lower' : (plan.split === 'ppl' || plan.split === 'bro') && planDays >= 4 ? 'upper_lower' : plan.split === 'upper_lower' && planDays >= 5 ? 'ul_ppl' : null;
    if (next) {
      out.push({
        id: `plateau-${next}`,
        kind: 'split',
        title: `Сменить структуру: «${SPLIT_LABEL[next as SplitType]}»`,
        why: [`Застой в ${plateaus} из ${statuses.length} основных упражнений (3+ тренировки без прироста).`, 'Новая структура меняет частоту и распределение объёма — это новый стимул без «перегруза».'],
        splitWhy: splitFitText(next, planDays),
        change: { split: next },
      });
    }
  }

  // 4) Слишком легко: план выполняется полностью, подходы «легко», веса растут
  const easyShare = sets.length ? sets.filter((x) => x.feel === 'easy' || (x.rir !== undefined && x.rir >= 3)).length / sets.length : 0;
  const progressing = statuses.filter((s) => s.status === 'progressing').length;
  if (sets.length >= 20 && easyShare > 0.55 && weeks.slice(0, 3).every((w) => w >= planDays) && progressing >= Math.max(2, statuses.length / 2)) {
    out.push({
      id: 'easy-volume',
      kind: 'volume',
      title: '+1 подход на основные группы',
      why: [`${Math.round(easyShare * 100)}% подходов отмечены «легко», план выполняется полностью, веса растут.`, 'Запас восстановления есть — можно аккуратно добавить объём.'],
      change: { volumeDelta: 1 },
    });
  }
  return out;
}
