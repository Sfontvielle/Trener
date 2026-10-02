/** Старые (английские) названия дней из сохранённых планов и истории → русские */
const LEGACY_DAY_NAMES: Record<string, string> = {
  'Upper A': 'Верх А',
  'Upper B': 'Верх Б',
  'Lower A': 'Низ А',
  'Lower B': 'Низ Б',
  'Push': 'Жимовая',
  'Pull': 'Тяговая',
  'Legs': 'Ноги',
  'Push B': 'Жимовая Б',
  'Pull B': 'Тяговая Б',
  'Legs B': 'Ноги Б',
  'Full Body A': 'Всё тело А',
  'Full Body B': 'Всё тело Б',
  'Full Body C': 'Всё тело В',
  'Torso A': 'Торс А',
  'Limbs A': 'Конечности А',
  'Torso B': 'Торс Б',
  'Limbs B': 'Конечности Б',
};

export function localizeWorkoutName(name: string): string {
  return LEGACY_DAY_NAMES[name] ?? name.replace(/^(Upper|Lower|Push|Pull|Legs|Full Body|Torso|Limbs)( [ABC])?\b/, (m) => LEGACY_DAY_NAMES[m] ?? m);
}
