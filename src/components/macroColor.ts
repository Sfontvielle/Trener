import { colors } from '@/theme';
import type { MacroState } from '@/features/nutrition/status';

export function stateColor(s: MacroState, base: string = colors.accent): string {
  switch (s) {
    case 'target':
      return colors.accent;
    case 'attention':
      return colors.warning;
    case 'off':
      return colors.danger;
    default:
      return base;
  }
}
