import type { SetupItem } from '@/types';
import type { CoachAlert } from './decisions/alerts';
import type { LocalInsight } from './insights';

/**
 * Единая лента тренера на главной: сигналы, предложения, перенос тренировки, замеры, «дополни профиль» и итог дня —
 * одним списком по приоритету, а не отдельными блоками. Чистая функция: порядок и состав проверяются тестами.
 */
export type FeedTone = 'urgent' | 'warning' | 'info' | 'positive' | 'neutral';
export type FeedAction =
  | { kind: 'route'; label: string; route: string }
  | { kind: 'measure'; label: string }
  | { kind: 'shift'; label: string }
  | { kind: 'proposal'; label: string }
  | { kind: 'apply'; label: string }
  | { kind: 'setup'; label: string; item: SetupItem };

export interface FeedItem {
  id: string;
  priority: number;
  tone: FeedTone;
  icon: string;
  title: string;
  text: string;
  actions: FeedAction[];
  /** Можно скрыть («Понятно» / «Не сейчас») */
  dismissible: boolean;
  /** Ключ для учёта реакции (совет / сигнал) */
  adviceKey?: string;
  alert?: CoachAlert;
  tip?: LocalInsight;
}

export const MAX_FEED = 5;

const SETUP: Record<SetupItem, { title: string; text: string; section: string }> = {
  health: { title: 'Здоровье и ограничения', text: 'Травмы, болезненные движения, аллергии — тренер не назначит то, что может навредить.', section: 'health' },
  equipment: { title: 'Оборудование и дни', text: 'Что есть в зале, длительность и удобные дни — план станет точнее.', section: 'training' },
  life: { title: 'Активность вне зала', text: 'Шаги и тип работы уточнят расход калорий.', section: 'life' },
  food: { title: 'Что любишь есть', text: 'Тренер будет подбирать «что добрать» из твоих продуктов.', section: 'food' },
};

const ALERT_ICON: Record<CoachAlert['level'], string> = { urgent: 'alert-circle', warning: 'warning-outline', info: 'information-circle-outline', positive: 'trending-up' };
const ALERT_ROUTE: Partial<Record<NonNullable<CoachAlert['target']>, { label: string; route?: string }>> = {
  labs: { label: 'Анализы', route: '/labs' },
  weekly: { label: 'Отчёт недели', route: '/weekly-review' },
  health: { label: 'Подробнее', route: '/health-monitor' },
  checkin: { label: 'Чек-ин', route: '/checkin' },
  weight: { label: 'Взвеситься', route: '/weight' },
  measure: { label: 'Измерить' },
};

export function buildFeed(args: {
  alerts: CoachAlert[];
  tips: LocalInsight[];
  shift?: { text: string; action: string } | null;
  due?: { kind: string; text: string } | null;
  setupPending?: SetupItem[];
  evening?: { verdict: string; good: boolean } | null;
  /** Скрытые сегодня ключи */
  hidden?: string[];
}): FeedItem[] {
  const out: FeedItem[] = [];
  for (const a of args.alerts) {
    const r = a.target ? ALERT_ROUTE[a.target] : undefined;
    out.push({
      id: `a_${a.id}`,
      priority: a.priority,
      tone: a.level,
      icon: ALERT_ICON[a.level],
      title: a.title,
      text: a.text,
      actions: r ? [r.route ? { kind: 'route', label: r.label, route: r.route } : { kind: 'measure', label: r.label }] : [],
      dismissible: a.level !== 'urgent',
      adviceKey: a.id,
      alert: a,
    });
  }
  if (args.shift) out.push({ id: 'shift', priority: 80, tone: 'info', icon: 'calendar-outline', title: 'Пропущена тренировка', text: args.shift.text, actions: [{ kind: 'shift', label: args.shift.action }], dismissible: true, adviceKey: 'shift' });
  for (const t of args.tips) {
    // Тренировочные и пищевые подсказки без действия дублируют план дня — в ленту только с действием или здоровье
    if (!t.action && !t.proposal && t.kind !== 'safety' && t.kind !== 'health') continue;
    out.push({
      id: `t_${t.key ?? t.text.slice(0, 24)}`,
      priority: t.kind === 'safety' ? 100 : Math.min(85, t.priority),
      tone: t.kind === 'safety' || t.kind === 'health' ? 'warning' : 'info',
      icon: t.kind === 'safety' || t.kind === 'health' ? 'medkit-outline' : t.kind === 'plan' ? 'git-branch-outline' : 'sparkles',
      title: t.kind === 'plan' ? 'Предложение по программе' : t.kind === 'safety' ? 'Безопасность' : t.kind === 'health' ? 'Ограничение' : 'Предложение тренера',
      text: t.text.replace(/^Предложение по программе:\s*/, ''),
      actions: [...(t.proposal ? [{ kind: 'proposal' as const, label: 'Подробнее' }] : []), ...(t.action ? [{ kind: 'apply' as const, label: t.action.label }] : [])],
      dismissible: !!t.key && t.kind !== 'safety',
      adviceKey: t.key,
      tip: t,
    });
  }
  // Напоминание о замере — если такое же не пришло сигналом
  if (args.due && !out.some((x) => x.alert?.id === 'waist_due')) out.push({ id: `due_${args.due.kind}`, priority: args.due.kind === 'weight' ? 40 : 30, tone: 'neutral', icon: args.due.kind === 'weight' ? 'scale-outline' : 'body-outline', title: args.due.kind === 'weight' ? 'Взвешивание' : 'Замер', text: args.due.text, actions: [args.due.kind === 'weight' ? { kind: 'route', label: 'Записать', route: '/weight' } : { kind: 'measure', label: 'Добавить' }], dismissible: true, adviceKey: `due_${args.due.kind}` });
  // «Дополни профиль» — одним пунктом, с первым незаполненным разделом
  const pend = args.setupPending ?? [];
  if (pend.length) {
    const first = pend[0];
    out.push({ id: `setup_${first}`, priority: first === 'health' ? 45 : 22, tone: 'neutral', icon: first === 'health' ? 'medkit-outline' : 'person-circle-outline', title: `Дополни профиль: ${SETUP[first].title.toLowerCase()}`, text: `${SETUP[first].text}${pend.length > 1 ? ` Осталось разделов: ${pend.length}.` : ''}`, actions: [{ kind: 'setup', label: 'Заполнить', item: first }], dismissible: true, adviceKey: `setup_${first}` });
  }
  if (args.evening) out.push({ id: 'evening', priority: 60, tone: args.evening.good ? 'positive' : 'info', icon: args.evening.good ? 'checkmark-circle' : 'moon-outline', title: 'Итог дня', text: args.evening.verdict, actions: [], dismissible: false });
  const hidden = new Set(args.hidden ?? []);
  const seen = new Set<string>();
  return out
    .filter((x) => !(x.dismissible && x.adviceKey && hidden.has(x.adviceKey)))
    .filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, MAX_FEED);
}

export const SETUP_SECTION: Record<SetupItem, string> = { health: 'health', equipment: 'training', life: 'life', food: 'food' };

/** Вечерний итог дня одной фразой — по тренировке, калориям и белку */
export function dayVerdict(a: { workoutDone: boolean; restDay: boolean; kcal: [number, number] | null; protein: [number, number] | null }): { verdict: string; good: boolean } {
  const kOk = a.kcal ? Math.abs(a.kcal[0] - a.kcal[1]) / a.kcal[1] <= 0.1 : false;
  const pOk = a.protein ? a.protein[0] >= a.protein[1] * 0.9 : false;
  if ((a.workoutDone || a.restDay) && kOk && pOk) return { verdict: 'Хороший день. Завтра план можно оставить без изменений.', good: true };
  if (a.protein && !pOk) return { verdict: `Белка не хватило ~${Math.round(a.protein[1] - a.protein[0])} г — добери перед сном (творог, йогурт) или завтра с утра.`, good: false };
  if (a.kcal && a.kcal[0] < a.kcal[1] * 0.85) return { verdict: `Недобор ~${Math.round(a.kcal[1] - a.kcal[0])} ккал — для твоей цели лучше закрыть его.`, good: false };
  if (a.kcal && a.kcal[0] > a.kcal[1] * 1.1) return { verdict: 'Калорий больше цели — завтра без компенсаций, просто по плану.', good: false };
  return { verdict: 'День в рамках плана.', good: true };
}
