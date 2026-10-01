import type { Exercise, PlannedExercise, TrainingPreferences, UserProfile, VolumeMuscle, WorkoutSession } from '@/types';
import { getExercise } from '@/data/exercises';
import { addDays, today } from '@/utils/date';
import { workingSets } from '../progression';
import { fineTargets, VM_ACC, VM_LABEL } from './muscles';
import { checkAllowed } from './scoring';
import { estimateMinutes } from './time';

/**
 * Ранг упражнения в тренировке (меньше — раньше):
 * 0 — технически сложные тяжёлые базовые; 1 — базовые на приоритетную мышцу; 2 — прочие базовые;
 * 3 — изоляция на приоритетную мышцу; 4 — изоляция крупных групп и дельт; 5 — руки/икры; 6 — пресс.
 */
export function orderRank(ex: Exercise, priority: VolumeMuscle[] = []): number {
  const ft = fineTargets(ex);
  const isPriority = ft.primary.some((m) => priority.includes(m));
  if (ex.mechanic === 'compound') {
    if (ex.pattern === 'core' || ex.pattern === 'carry') return 6;
    if (ex.tier === 1) return isPriority ? 0 : 0.5;
    return isPriority ? 1 : 2;
  }
  if (isPriority) return 3;
  const m = ft.primary[0];
  if (m === 'abs') return 6;
  if (m === 'biceps' || m === 'triceps' || m === 'calves' || !m) return 5;
  return 4;
}

export function orderExercises<T extends { exerciseId: string }>(list: T[], priority: VolumeMuscle[] = [], customs: Exercise[] = []): T[] {
  return list
    .map((pe, i) => ({ pe, i, r: (() => { const ex = getExercise(pe.exerciseId, customs); return ex ? orderRank(ex, priority) : 4; })() }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.pe);
}

export interface OrderSuggestion {
  changed: boolean;
  order: PlannedExercise[];
  why: string;
}

/** Оптимизатор порядка своей тренировки: предлагает, но не меняет без согласия пользователя */
export function suggestOrder(list: PlannedExercise[], priority: VolumeMuscle[] = [], customs: Exercise[] = []): OrderSuggestion {
  const order = orderExercises(list, priority, customs);
  const changed = order.some((pe, i) => pe !== list[i]);
  if (!changed) return { changed, order, why: '' };
  // Какие мышцы «утомлялись» изоляцией до базового
  const tiredBefore = new Set<string>();
  const seen: Exercise[] = [];
  for (const pe of list) {
    const ex = getExercise(pe.exerciseId, customs);
    if (!ex) continue;
    if (ex.mechanic === 'compound') {
      const ft = fineTargets(ex);
      for (const prev of seen) if (prev.mechanic === 'isolation') fineTargets(prev).primary.forEach((m) => [...ft.primary, ...ft.secondary].includes(m) && tiredBefore.add(VM_ACC[m]));
    }
    seen.push(ex);
  }
  const muscles = [...tiredBefore];
  const why = muscles.length
    ? `Тяжёлые многосуставные упражнения лучше выполнять до локальной усталости: сейчас изоляция утомляет ${muscles.join(' и ')} до базового движения — меньше вес и выше риск потерять технику.`
    : 'Сначала технически сложные и тяжёлые многосуставные, затем вспомогательные и изоляция, мелкие мышцы и пресс — в конце.';
  return { changed, order, why: priority.length ? `${why} Приоритетные группы поставлены раньше.` : why };
}

export interface WorkoutIssue {
  id: string;
  level: 'info' | 'warning' | 'danger';
  text: string;
  fixLabel?: string;
  fix?: (list: PlannedExercise[]) => PlannedExercise[];
}

/**
 * Анализ собранной тренировки: перегруз мышцы, повторы паттернов, общий объём, время,
 * конфликт с недавней тренировкой и с ограничениями пользователя.
 */
export function analyzeWorkout(args: {
  list: PlannedExercise[];
  profile: UserProfile;
  prefs: TrainingPreferences;
  sessions: WorkoutSession[];
  weeklyTargets?: Partial<Record<VolumeMuscle, number>>;
  customs?: Exercise[];
}): WorkoutIssue[] {
  const { list, profile, prefs, sessions } = args;
  const issues: WorkoutIssue[] = [];
  const customs = args.customs ?? [];
  if (!list.length) return issues;

  const direct = new Map<VolumeMuscle, number>();
  const patterns = new Map<string, number>();
  for (const pe of list) {
    const ex = getExercise(pe.exerciseId, customs);
    if (!ex) continue;
    fineTargets(ex).primary.forEach((m) => direct.set(m, (direct.get(m) ?? 0) + pe.sets));
    patterns.set(ex.pattern, (patterns.get(ex.pattern) ?? 0) + 1);
    const allowed = checkAllowed(ex, profile, prefs);
    if (!allowed.ok) {
      issues.push({
        id: `limit-${ex.id}`,
        level: 'danger',
        text: `«${ex.name}» конфликтует с твоими ограничениями (${allowed.reason}).`,
        fixLabel: 'Убрать',
        fix: (l) => l.filter((x) => x.exerciseId !== ex.id),
      });
    }
  }

  // Перегруз одной мышцы за сессию
  for (const [m, sets] of direct) {
    const target = args.weeklyTargets?.[m];
    const tooMuch = sets > 10 || (target !== undefined && target > 0 && sets > Math.max(8, target * 0.75));
    if (!tooMuch) continue;
    const cap = Math.max(6, Math.min(8, Math.round((target ?? 12) * 0.6)));
    issues.push({
      id: `over-${m}`,
      level: 'warning',
      text: `У тебя ${sets} прямых подходов на ${VM_ACC[m]} за одну сессию${target ? ` при недельной цели ${target}` : ''}. Это избыточно — эффективнее ~${cap} и добрать в другой день.`,
      fixLabel: `Сократить до ~${cap}`,
      fix: (l) => {
        let excess = l.reduce((a, x) => a + (fineTargets(getExercise(x.exerciseId, customs)!).primary.includes(m) ? x.sets : 0), 0) - cap;
        const out = l.map((x) => ({ ...x }));
        for (let i = out.length - 1; i >= 0 && excess > 0; i--) {
          const ex = getExercise(out[i].exerciseId, customs);
          if (!ex || !fineTargets(ex).primary.includes(m)) continue;
          while (out[i].sets > 2 && excess > 0) {
            out[i].sets--;
            excess--;
          }
        }
        return out;
      },
    });
  }

  for (const [p, n] of patterns) {
    if (n >= 3) issues.push({ id: `pattern-${p}`, level: 'info', text: `${n} упражнения с одинаковым движением — разнообразие углов (жим под наклоном, тяга к поясу и т. п.) даст больше пользы.` });
  }

  const total = list.reduce((a, x) => a + x.sets, 0);
  if (total > 28) issues.push({ id: 'total-high', level: 'warning', text: `${total} рабочих подходов — тяжело восстановиться к следующей тренировке. Обычно достаточно 15–25.` });
  if (total < 6) issues.push({ id: 'total-low', level: 'info', text: `Всего ${total} рабочих подходов — для полноценной тренировки маловато.` });

  const minutes = estimateMinutes(list, customs);
  if (minutes > profile.sessionMinutes + 10) issues.push({ id: 'time', level: 'info', text: `≈${minutes} мин — дольше твоих обычных ${profile.sessionMinutes} мин.` });

  // Конфликт с последними 48 часами
  const from = addDays(today(), -2);
  const recent = new Map<VolumeMuscle, number>();
  for (const s of sessions) {
    if (s.status !== 'completed' || s.date < from) continue;
    for (const we of s.exercises) {
      const ex = getExercise(we.exerciseId, customs);
      if (!ex) continue;
      const n = workingSets(we.sets).length;
      fineTargets(ex).primary.forEach((m) => recent.set(m, (recent.get(m) ?? 0) + n));
    }
  }
  const hot = [...direct.keys()].filter((m) => (recent.get(m) ?? 0) >= 6 && (direct.get(m) ?? 0) >= 3);
  if (hot.length) issues.push({ id: 'recent', level: 'warning', text: `${hot.map((m) => VM_LABEL[m]).join(', ')} — уже нагружались за последние 48 ч. Восстановление может быть неполным.` });

  // Баланс жим/тяга в тренировке верха
  const push = (direct.get('chest') ?? 0) + (direct.get('front_delts') ?? 0);
  const pull = (direct.get('lats') ?? 0) + (direct.get('upper_back') ?? 0);
  if (push >= 6 && pull === 0 && (direct.get('quads') ?? 0) === 0) issues.push({ id: 'balance', level: 'info', text: 'Есть жимы, но нет тяг. Если это не Push-день, добавь тягу для баланса плеч.' });

  return issues;
}
