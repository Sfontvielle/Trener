import type { DailyCheckIn, Exercise, GymSetup, ISODate, NutritionTarget, ReadinessResult, UserProfile, WorkoutSession } from '@/types';
import { getExercise } from '@/data/exercises';
import type { TodayWorkout } from '@/features/training/today';
import { MODE_LABEL } from '@/features/training/today';
import { historyFor, recommend, type ExerciseHistoryEntry } from '@/features/training/progression';
import type { HealthContext, HealthDay } from '@/features/health/model';
import { healthGate, type HealthSignal } from '@/features/health/monitor';
import type { StepGoal } from '@/features/science/steps';
import type { MaintenanceEstimate } from '@/features/science/maintenance';
import type { CalorieReview } from '@/features/nutrition/adaptive';
import { GOAL_SHORT } from '@/features/nutrition/targets';
import { readinessLabel } from '@/features/science/insights';
import { RECOVERY_BASIS, sleepMinutesOf } from '@/features/science/recovery';
import { formatDayShort } from '@/utils/date';
import { maintenanceConfidence, progressionConfidence, readinessConfidence, stepsConfidence } from './confidence';
import { fmtInt, fmtKg, type Decision } from './types';

/**
 * «RYNJI COACH — СЕГОДНЯ»: план дня, собранный автоматически из всех данных.
 * Одна карточка отвечает на «что делать сегодня»: тренировка и режим, готовность, сон, шаги, КБЖУ,
 * главный фокус и короткое «Почему?» — с данными и уверенностью у каждого решения.
 */
export interface CoachToday {
  kind: TodayWorkout['kind'];
  title: string;
  mode: string;
  readiness: string | null;
  /** «7:43» */
  sleep: { text: string; source: 'health' | 'checkin' } | null;
  steps: { target: number; done?: number } | null;
  nutrition: { kcal: number; protein: number; fat: number; carbs: number; label: string } | null;
  focus: Decision | null;
  decisions: Decision[];
  /** Короткое «Почему?» — 1–3 фразы */
  why: string[];
}

export interface CoachTodayInput {
  date: ISODate;
  profile: UserProfile;
  today: TodayWorkout;
  readiness?: ReadinessResult;
  checkin?: DailyCheckIn;
  health: Record<string, HealthDay>;
  healthCtx?: HealthContext;
  sessions: WorkoutSession[];
  customs?: Exercise[];
  gym?: GymSetup;
  target: NutritionTarget | null;
  maintenance: MaintenanceEstimate | null;
  calorieReview?: CalorieReview | null;
  steps: StepGoal | null;
  signals: HealthSignal[];
}

/** «7:43» — сон в часах:минутах */
export function clockSleep(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/** «27.09: 80 кг × 10/10/10, RIR 2» */
export function historyLine(h: ExerciseHistoryEntry): string {
  const top = Math.max(...h.sets.map((s) => s.weight));
  const atTop = h.sets.filter((s) => s.weight === top);
  const rirs = atTop.map((s) => s.rir).filter((x): x is number => x !== undefined);
  const rir = rirs.length ? `, RIR ${Math.round((rirs.reduce((a, b) => a + b, 0) / rirs.length) * 10) / 10}`.replace('.', ',') : '';
  return `${formatDayShort(h.date)}: ${top ? `${fmtKg(top)} кг × ` : ''}${atTop.map((s) => s.reps).join('/')}${rir}`;
}

const PROG_BASIS = { kind: 'evidence' as const, sources: ['acsm2009' as const, 'acsm2026' as const, 'zourdos2016' as const], note: 'двойная прогрессия; шаг — реальный шаг оборудования' };

/** Решение по одному упражнению сегодняшней тренировки */
export function exerciseDecision(args: { exercise: Exercise; sets: number; repMin: number; repMax: number; targetRir: number; history: ExerciseHistoryEntry[]; band?: ReadinessResult['band']; gym?: GymSetup; noIncrease?: string; readinessNote?: string }): Decision & { action: string; weight: number; from: number } {
  const { exercise: ex, history } = args;
  const rec = recommend({ exercise: ex, plannedSets: args.sets, repMin: args.repMin, repMax: args.repMax, targetRir: args.targetRir, history, band: args.band, gym: args.gym, noIncrease: args.noIncrease });
  const conf = progressionConfidence(history);
  const from = history[0] ? Math.max(...history[0].sets.map((s) => s.weight)) : 0;
  const data = history.slice(0, 3).map(historyLine);
  if (args.readinessNote) data.push(args.readinessNote);
  let what: string;
  if (rec.action === 'increase') what = `Попробовать увеличить ${lower(ex.name)} с ${fmtKg(from)} до ${fmtKg(rec.weight)} кг (${rec.repMin}–${rec.repMax} повт.)`;
  else if (rec.action === 'reps') what = `${ex.name}: ${rec.weight ? `${fmtKg(rec.weight)} кг, ` : ''}добрать повторы до ${rec.repMax}`;
  else if (rec.action === 'decrease') what = `${ex.name}: снизить до ${fmtKg(rec.weight)} кг и набрать повторы заново`;
  else if (rec.action === 'new') what = `${ex.name}: подобрать рабочий вес — ${rec.repMax} повторов с запасом ${rec.targetRir}`;
  else what = `${ex.name}: оставить ${rec.weight ? `${fmtKg(rec.weight)} кг` : 'нагрузку'}`;
  return { id: `ex_${ex.id}`, area: 'training', what, why: rec.rationale, data, confidence: conf.level, confidenceNote: conf.note, basis: PROG_BASIS, action: rec.action, weight: rec.weight, from };
}

function lower(name: string): string {
  // «Жим лёжа» → «жим лёжа»; аббревиатуры (RDL) не трогаем
  return /^[А-ЯЁ][а-яё]/.test(name) ? name.charAt(0).toLowerCase() + name.slice(1) : name;
}

export function coachToday(i: CoachTodayInput): CoachToday {
  const tw = i.today;
  const gate = healthGate(i.signals);
  const decisions: Decision[] = [];
  const why: string[] = [];

  // Сон: точные минуты из чек-ина или Apple Health
  const hSleep = i.health[i.date]?.sleepHours;
  const sleep = i.checkin ? { text: clockSleep(sleepMinutesOf(i.checkin)), source: (i.checkin.sleepSource === 'health' ? 'health' : 'checkin') as 'health' | 'checkin' } : hSleep ? { text: clockSleep(hSleep * 60), source: 'health' as const } : null;

  // Готовность и режим тренировки
  const rc = readinessConfidence(i.readiness, i.checkin, i.healthCtx);
  const readiness = i.readiness ? readinessLabel(i.readiness) : null;
  const mode = gate.stop ? 'Отдых' : tw.kind === 'workout' ? MODE_LABEL[tw.mode] : tw.kind === 'rest' ? 'Отдых' : tw.kind === 'done' ? 'Выполнена' : '—';
  if (tw.kind === 'workout' || tw.kind === 'rest') {
    const rReasons = i.readiness?.reasons?.length ? i.readiness.reasons : i.readiness?.factors.filter((f) => f.impact < 0).map((f) => `${f.label.toLowerCase()}: ${f.detail}`) ?? [];
    decisions.push({
      id: 'mode',
      area: 'recovery',
      what: tw.kind === 'rest' ? 'День отдыха по плану' : `Режим: ${MODE_LABEL[tw.mode].toLowerCase()}`,
      why: tw.reason ?? (i.readiness ? (i.readiness.band === 'go' ? 'Восстановление в пределах вашей нормы — работаем по плану.' : i.readiness.headline) : 'Чек-ина и данных сна нет — работаем по плану.'),
      data: [sleep ? `сон ${sleep.text} (${sleep.source === 'health' ? 'Apple Health' : 'чек-ин'})` : '', ...rReasons.slice(0, 3)].filter(Boolean),
      confidence: rc.level,
      confidenceNote: rc.note,
      basis: RECOVERY_BASIS,
    });
  }

  // Главный фокус
  let focus: Decision | null = null;
  if (gate.stop) {
    focus = { id: 'health_stop', area: 'health', what: 'Сегодня без тренировки', why: gate.reason!, data: i.signals.filter((s) => s.level === 'urgent').flatMap((s) => s.data).slice(0, 3), confidence: 'high', confidenceNote: 'медицинские пороги из клинических рекомендаций', basis: i.signals[0].basis };
  } else if (tw.kind === 'workout' && tw.template) {
    const lowReady = tw.mode !== 'normal';
    const readinessNote = i.readiness ? `готовность: ${readinessLabel(i.readiness).toLowerCase()}` : undefined;
    const band = lowReady && (!i.readiness || i.readiness.band === 'go') ? 'reduce' : i.readiness?.band;
    const exDecisions = tw.template.exercises.slice(0, 5).flatMap((pe) => {
      const ex = getExercise(pe.exerciseId, i.customs ?? []);
      if (!ex) return [];
      return [exerciseDecision({ exercise: ex, sets: pe.sets, repMin: pe.repMin, repMax: pe.repMax, targetRir: pe.targetRir, history: historyFor(ex.id, i.sessions), band, gym: i.gym, noIncrease: gate.blockIncrease ? 'есть показатели здоровья, которые стоит обсудить с врачом.' : undefined, readinessNote })];
    });
    if (lowReady) {
      focus = { ...decisions[0], id: 'focus_recovery', what: `${MODE_LABEL[tw.mode]}: веса без повышения, запас повторов больше обычного` };
    } else {
      focus = exDecisions.find((d) => d.action === 'increase') ?? exDecisions.find((d) => d.action === 'reps' || d.action === 'decrease') ?? exDecisions.find((d) => d.action === 'new') ?? exDecisions[0] ?? null;
    }
    if (gate.blockIncrease) {
      decisions.push({ id: 'health_hold', area: 'health', what: 'Нагрузку не повышаем', why: gate.reason!, data: i.signals.filter((s) => s.level === 'doctor').flatMap((s) => [s.title, ...s.data]).slice(0, 4), confidence: 'high', confidenceNote: 'здоровье важнее прогресса', basis: i.signals[0].basis });
    }
    for (const d of exDecisions) if (d.id !== focus?.id) decisions.push(d);
  } else if (tw.kind === 'rest') {
    focus = { id: 'rest_focus', area: 'activity', what: `Восстановление: ${i.steps ? `${fmtInt(i.steps.target)} шагов` : 'прогулка'}${i.target ? `, белок ${i.target.protein} г` : ''}`, why: tw.reason ?? 'Мышцы растут между тренировками: шаги, белок и сон — часть плана.', data: tw.nextWorkout ? [`следующая: ${tw.nextWorkout.template.name}, ${formatDayShort(tw.nextWorkout.date)}`] : [], confidence: 'high', confidenceNote: 'по плану тренировок', basis: { kind: 'heuristic', sources: ['acsm2026'] } };
  } else if (tw.kind === 'done' && tw.completedSession) {
    focus = { id: 'done_focus', area: 'recovery', what: `Восстановление после «${tw.completedSession.name}»${i.target ? `: белок ${i.target.protein} г` : ''}, сон 7+ ч`, why: 'Тренировка выполнена — результат закрепляется отдыхом и питанием.', data: [], confidence: 'high', confidenceNote: 'тренировка записана', basis: { kind: 'evidence', sources: ['watson2015', 'morton2018'] } };
  }
  if (focus && !decisions.some((d) => d.id === focus!.id)) decisions.unshift(focus);

  // Питание
  let nutrition: CoachToday['nutrition'] = null;
  if (i.target) {
    const t = i.target;
    const trainingDay = tw.kind === 'workout' || tw.kind === 'done';
    nutrition = { kcal: t.kcal, protein: t.protein, fat: t.fat, carbs: t.carbs, label: `${GOAL_SHORT[i.profile.goal]} · ${trainingDay ? 'тренировочный день' : 'день отдыха'}` };
    const mc = maintenanceConfidence(t, i.maintenance);
    const data: string[] = [];
    if (i.maintenance) data.push(i.maintenance.text);
    else data.push(`стартовая оценка расхода ${fmtInt(t.tdee)} ккал по формуле`);
    if (i.calorieReview && i.calorieReview.actualKgPerWeek !== undefined) data.push(`тренд веса ${i.calorieReview.actualKgPerWeek > 0 ? '+' : ''}${String(i.calorieReview.actualKgPerWeek.toFixed(2)).replace('.', ',')} кг/нед при цели ${i.calorieReview.targetKgPerWeek > 0 ? '+' : ''}${String(i.calorieReview.targetKgPerWeek.toFixed(2)).replace('.', ',')}`);
    if (t.adjustmentKcal) data.push(`адаптивные корректировки: ${t.adjustmentKcal > 0 ? '+' : ''}${t.adjustmentKcal} ккал`);
    decisions.push({
      id: 'nutrition',
      area: 'nutrition',
      what: `${fmtInt(t.kcal)} ккал · Б ${t.protein} · Ж ${t.fat} · У ${t.carbs} г`,
      why: i.calorieReview?.summary ?? (t.source === 'adaptive' ? 'Цель по вашему фактическому расходу.' : 'Стартовая оценка по формуле; через 2–3 недели взвешиваний и дневника заменится вашим фактическим расходом.'),
      data,
      confidence: mc.level,
      confidenceNote: mc.note,
      basis: t.source === 'adaptive' ? { kind: 'estimate', sources: ['hall2008'] } : { kind: 'evidence', sources: ['mifflin1990', 'frankenfield2005'] },
    });
  }

  // Шаги
  const steps = i.steps ? { target: i.steps.target, done: i.health[i.date]?.steps } : null;
  if (i.steps) {
    const sc = stepsConfidence(i.steps);
    decisions.push({ id: 'steps', area: 'activity', what: `${fmtInt(i.steps.target)} шагов`, why: i.steps.reason, data: i.steps.source === 'health' ? [`обычно ~${fmtInt(i.steps.baseline)} шагов (медиана)`] : ['из профиля'], confidence: sc.level, confidenceNote: sc.note, basis: i.steps.basis });
  }

  // Короткое «Почему?»
  if (focus) why.push(focus.why);
  const modeD = decisions.find((d) => d.id === 'mode');
  if (modeD && modeD.id !== focus?.id && tw.kind === 'workout' && !focus?.id.startsWith('focus_recovery')) why.push(modeD.why);
  if (gate.blockIncrease && !gate.stop) why.push(gate.reason!);

  const title = gate.stop ? 'Отдых и медицинская оценка' : tw.kind === 'workout' && tw.template ? tw.template.name : tw.kind === 'rest' ? 'День отдыха' : tw.kind === 'done' ? `${tw.completedSession?.name ?? 'Тренировка'} ✓` : 'Плана пока нет';
  return { kind: tw.kind, title, mode, readiness, sleep, steps, nutrition, focus, decisions, why: [...new Set(why)].slice(0, 3) };
}
