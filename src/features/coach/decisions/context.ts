import type { LabReport } from '@/types';
import type { HealthSignal } from '@/features/health/monitor';
import { compareWithPrevious } from '@/features/labs/analysis';
import { formatDayShort } from '@/utils/date';
import type { CoachAlert } from './alerts';
import type { CoachToday } from './today';
import { CONFIDENCE_LABEL, type Decision } from './types';

/**
 * Структурированный контекст решений для чата. ИИ ничего не считает: калории, тренды, прогрессия, объём,
 * пересчёт единиц и история анализов уже посчитаны детерминированным кодом. Модель только объясняет,
 * формулирует и резюмирует — и честно говорит, когда данных недостаточно.
 */
export function decisionLine(d: Decision): string {
  return `- [${d.id}] ${d.what}\n  почему: ${d.why || '—'}\n  данные: ${d.data.length ? d.data.join('; ') : 'нет данных'}\n  уверенность: ${CONFIDENCE_LABEL[d.confidence]} (${d.confidenceNote})`;
}

export function decisionsContext(args: { coach: CoachToday | null; alerts: CoachAlert[]; signals: HealthSignal[]; labs: LabReport[]; enhanced: boolean }): string {
  const L: string[] = ['\n## РЕШЕНИЯ ТРЕНЕРА (рассчитаны приложением — источник истины, не пересчитывай)'];
  const c = args.coach;
  if (c) {
    L.push(`Сегодня: ${c.title} · режим: ${c.mode}${c.readiness ? ` · готовность: ${c.readiness.toLowerCase()}` : ' · готовность: нет данных'}${c.sleep ? ` · сон ${c.sleep.text}` : ''}${c.steps ? ` · цель шагов ${c.steps.target}` : ''}`);
    if (c.focus) L.push(`Главный фокус: ${c.focus.what}`);
    for (const d of c.decisions) L.push(decisionLine(d));
  } else L.push('Плана на сегодня нет.');
  if (args.alerts.length) {
    L.push('\n## ВАЖНЫЕ СИГНАЛЫ (по приоритету)');
    for (const a of args.alerts) L.push(`- ${a.title}: ${a.text}`);
  }
  L.push('\n## ЗДОРОВЬЕ');
  if (args.signals.length) for (const s of args.signals) L.push(`- [${s.level}] ${s.title}: ${s.text} (данные: ${s.data.join('; ') || '—'})`);
  else L.push('- значимых сигналов нет (это не медицинское заключение)');
  if (args.labs.length) {
    const sorted = [...args.labs].sort((a, b) => (a.date < b.date ? -1 : 1));
    const last = sorted[sorted.length - 1];
    L.push(`Последние анализы: ${formatDayShort(last.date)}${last.lab ? ` (${last.lab})` : ''}, показателей ${last.results.length}`);
    if (sorted.length >= 2) {
      const ch = compareWithPrevious(sorted).items.filter((x) => x.significant).slice(0, 8);
      if (ch.length) L.push(`Изменения к прошлому анализу: ${ch.map((x) => `${x.name} ${x.text}`).join('; ')}`);
    }
  } else L.push('Анализов в приложении нет.');
  if (args.enhanced) L.push('Пользователь включил режим Enhanced (AAS) — только как контекст для внимательного мониторинга здоровья. Не обсуждать схемы, дозы, препараты, «курсы» и корректировку по анализам; при неблагоприятной динамике — рекомендовать медицинскую оценку.');
  L.push('Если в вопросе нужны данные, которых здесь нет, — прямо скажи, что данных недостаточно, и что нужно записать.');
  return L.join('\n');
}
