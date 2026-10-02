/**
 * Смена темы перемонтирует навигатор (чтобы все экраны перекрасились). Чтобы пользователь остался
 * ровно там, где был (Профиль → Оформление), сохраняем весь стек навигации и восстанавливаем его целиком,
 * а не добавляем экран заново (иначе «Оформление» открывалось вторым окном).
 */
let pending: object | null = null;

export function setPendingNavState(state: object | undefined | null) {
  pending = state ?? null;
}

export function consumePendingNavState(): object | null {
  const r = pending;
  pending = null;
  return r;
}
