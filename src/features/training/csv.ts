import type { Exercise, WorkoutSession } from '@/types';
import { getExercise } from '@/data/exercises';
import { isTimed, SESSION_FEEL, feelIndex } from './journal';
import { supersetLabels } from './workoutNav';

/**
 * Экспорт тренировок в CSV (для Excel / Numbers / Google Таблиц): одна строка — один подход.
 * Разделитель «;» и десятичная запятая — так русская локаль Excel открывает файл без мастера импорта.
 */
export const CSV_HEADER = ['Дата', 'Начало', 'Тренировка', 'Длительность, мин', 'Ощущение', '№', 'Упражнение', 'Суперсет', 'Подход', 'Разминка', 'Вес, кг', 'Повторы', 'Время, сек', 'Запас (RIR)', 'Заметка к тренировке'];

function cell(v: string | number | undefined): string {
  if (v === undefined || v === '') return '';
  const s = typeof v === 'number' ? String(v).replace('.', ',') : v;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function hhmm(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function workoutsCsv(sessions: WorkoutSession[], customs: Exercise[] = []): string {
  const rows: string[] = [CSV_HEADER.join(';')];
  const done = sessions.filter((s) => s.status === 'completed').sort((a, b) => a.startedAt - b.startedAt);
  for (const s of done) {
    const minutes = s.finishedAt ? Math.round((s.finishedAt - s.startedAt) / 60000) : undefined;
    const fi = feelIndex(s.sessionRpe);
    const labels = supersetLabels(s.exercises);
    s.exercises.forEach((we, i) => {
      const ex = getExercise(we.exerciseId, customs);
      const timed = isTimed(ex);
      let n = 0;
      for (const x of we.sets.filter((st) => st.done)) {
        if (!x.warmup) n++;
        rows.push(
          [s.date, hhmm(s.startedAt), s.name, minutes, fi >= 0 ? SESSION_FEEL[fi].label : '', i + 1, ex?.name ?? we.exerciseId, labels[i], x.warmup ? '' : n, x.warmup ? 'да' : '', x.weight || '', timed ? '' : x.reps, timed ? x.reps : '', x.rir, s.notes]
            .map(cell)
            .join(';'),
        );
      }
    });
  }
  // BOM — чтобы Excel сразу понял UTF-8 (кириллица)
  return `﻿${rows.join('\r\n')}\r\n`;
}
