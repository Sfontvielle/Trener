/**
 * Компоненты дизайн-системы RYNJI 2.0 (docs/design/RYNJI_DESIGN_SYSTEM.md §9).
 * Экраны переходят на них по фазам C–F; старые компоненты удаляются, когда на них не останется ссылок.
 */
import React from 'react';
import { Button, EmptyState, SectionTitle, Segmented } from '../ui';

export { AppHeader, type HeaderAction } from './AppHeader';
export { Group, ListRow } from './Group';
export { Scale } from './Scale';
export { StatRow } from './StatRow';
export { scaleFill, statLabel } from './logic';
export { ErrorState, LoadingSkeleton } from './States';
export { EmptyState };

/** Заголовок секции: headline и необязательное действие справа */
export const SectionHeader = SectionTitle;
/** Переключатель 2–4 разделов: капсула, подписи переносятся, а не обрезаются */
export const SegmentedControl = Segmented;

type ActionProps = Omit<React.ComponentProps<typeof Button>, 'variant' | 'size'>;

/** Одно главное действие экрана: высота 52, заливка акцента, на всю ширину */
export function PrimaryAction(p: ActionProps) {
  return <Button full {...p} variant="primary" size="lg" />;
}

/** Второстепенное действие: заливка surface3, высота 48 */
export function SecondaryAction(p: ActionProps & { quiet?: boolean }) {
  const { quiet, ...rest } = p;
  return <Button {...rest} variant={quiet ? 'ghost' : 'secondary'} />;
}
