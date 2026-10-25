import React from 'react';
import type { Exercise, Sex } from '@/types';
import { TechniqueView } from './TechniqueView';

/**
 * Нижний сворачиваемый раздел экрана тренировки: 3D-анимация движения с подсветкой мышц, подсказки, ошибки, безопасность.
 */
export function TechniquePanel({ ex, sex }: { ex: Exercise; sex?: Sex }) {
  return <TechniqueView ex={ex} sex={sex} mediaHeight={180} />;
}
