/** Чистая логика компонентов дизайн-системы — без React Native, чтобы проверять юнит-тестами */

/** Доля заполнения шкалы: 0…1, перебор — отдельно (конец шкалы = цель) */
export function scaleFill(value: number, target: number): { fill: number; over: boolean } {
  if (!Number.isFinite(value) || !Number.isFinite(target) || target <= 0) return { fill: 0, over: false };
  const k = Math.max(0, value / target);
  return { fill: Math.min(1, k), over: k > 1 };
}

/** Подпись для VoiceOver: «Белки: 96 г, изменение +4» — число вместе с единицей, без знаков разметки */
export function statLabel(label: string, value: string, unit?: string, extra?: string): string {
  return [`${label}: ${value}${unit ? ` ${unit}` : ''}`, extra].filter(Boolean).join(', ');
}
