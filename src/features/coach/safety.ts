/**
 * Протокол безопасности: при «красных флагах» FORM не продолжает обычную оптимизацию тренировок.
 * Работает локально и мгновенно (даже без интернета), независимо от AI.
 */
const RED_FLAGS: { re: RegExp; kind: 'emergency' | 'injury'; /** в общем вопросе («можно ли при аритмии…») — не тревога */ general?: boolean }[] = [
  { re: /бол\S*\s+(в|за)\s+груд|давит\s+(в\s+)?груд|жжение\s+в\s+груд|chest pain/i, kind: 'emergency' },
  { re: /потер\S*\s+сознан|обморок|отключил|упал в обморок|потемнело в глазах|faint/i, kind: 'emergency' },
  { re: /(сильн|тяжел)\S*\s+одышк|не могу дышать|задыха|трудно дышать/i, kind: 'emergency' },
  { re: /онемел\S*\s+(рук|лиц|половин)|перекосил|невнятн\S*\s+реч/i, kind: 'emergency' },
  { re: /сердце\s+(колотит|сбива|перебо)|пульс\s+2\d\d/i, kind: 'emergency' },
  { re: /аритми/i, kind: 'emergency', general: true },
  { re: /(сильн|остр|резк|невыносим)\S*\s+бол|хруст\S*\s+и\s+бол|травм|вывих|перелом|порвал|надрыв|растяжени|отёк|отек|опух/i, kind: 'injury', general: true },
];

export type SafetyLevel = 'none' | 'emergency' | 'injury';

/** Справочный вопрос, а не сообщение о своём состоянии: «можно ли тренироваться при аритмии?», «как восстановиться после травмы колена?» */
export function isGeneralQuestion(text: string): boolean {
  const n = text.toLowerCase().replace(/ё/g, 'е').trim();
  return /^(можно ли|можно|как |какие|какой|что такое|расскажи|почему|чем опасн|что делать при|что будет|правда ли|нужно ли|стоит ли|сколько)/.test(n) && !/(у меня|мне сейчас|я сейчас|только что|сегодня|сейчас)/.test(n);
}

export function detectSafety(text: string): SafetyLevel {
  let level: SafetyLevel = 'none';
  const general = isGeneralQuestion(text);
  for (const f of RED_FLAGS) {
    if (f.general && general) continue;
    if (f.re.test(text)) {
      if (f.kind === 'emergency') return 'emergency';
      level = 'injury';
    }
  }
  return level;
}

export function safetyReply(level: SafetyLevel): string {
  if (level === 'emergency')
    return 'Остановись и не тренируйся. Боль в груди, потеря сознания, сильная одышка или онемение — это повод срочно обратиться за медицинской помощью: вызови скорую (103 или 112). Не садись за руль сам. Я перевёл сегодняшний день в режим отдыха — к тренировкам вернёмся только после консультации врача.';
  if (level === 'injury')
    return 'Прекрати упражнение, которое вызывает боль, и не работай «через боль». Если есть отёк, резкая боль, хруст или ограничение движения — покажись врачу (травматологу). Сегодня исключаю нагрузку на эту зону; дальше подберём безболезненные замены, когда станет ясно, что это.';
  return '';
}
