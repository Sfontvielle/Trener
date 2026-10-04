import type { VolumeMuscle } from '@/types';
import { useProfile } from '@/stores/profile';
import { usePlan } from '@/stores/plan';
import { useCoach } from '@/stores/coach';
import { applyProfile } from '@/features/profile/applyProfile';
import { getPrefs, rawPrefs, withPrefs } from './engine/prefs';
import type { ProgramProposal } from './adaptPlan';
import { today } from '@/utils/date';

const MAIN_GROUPS: VolumeMuscle[] = ['chest', 'lats', 'upper_back', 'quads', 'hamstrings', 'glutes', 'side_delts'];

/** Применение предложения по программе — только по явному подтверждению пользователя */
export function applyProgramProposal(p: ProgramProposal): string {
  const profile = useProfile.getState().profile;
  if (!profile) return '';
  let next = profile;
  if (p.change.daysPerWeek !== undefined) next = { ...next, daysPerWeek: p.change.daysPerWeek };
  if (p.change.preferredDays !== undefined) next = { ...next, preferredDays: p.change.preferredDays };
  if (p.change.split) next = withPrefs(next, { preferredSplit: p.change.split });
  if (p.change.volumeDelta) {
    const cur = rawPrefs(next).volumeAdjust;
    const adj = { ...cur };
    for (const m of MAIN_GROUPS) adj[m] = (adj[m] ?? 0) + p.change.volumeDelta;
    next = withPrefs(next, { volumeAdjust: adj });
  }
  applyProfile(next);
  usePlan.getState().addAdjustment({ kind: 'plan_rebuild', summary: `Программа: ${p.title}`, source: 'coach' });
  // Подтверждённый вывод — в долговременную память тренера
  useCoach.getState().addMemory(`${today()}: принято изменение программы — ${p.title} (${p.why[0] ?? ''})`, 'training', 'user');
  return getPrefs(next).preferredSplit !== getPrefs(profile).preferredSplit ? 'Структура программы изменена, план перестроен' : 'План перестроен';
}
