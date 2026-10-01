/** Экран, на который нужно вернуться после перемонтирования навигатора при смене темы */
let pending: string | null = null;

export function setPendingRoute(route: string) {
  pending = route;
}

export function consumePendingRoute(): string | null {
  const r = pending;
  pending = null;
  return r;
}
