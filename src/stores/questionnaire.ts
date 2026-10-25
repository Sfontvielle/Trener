import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { persistOptions } from '@/storage/persist';
import { emptyDraft, migrateDraft, type QDraft } from '@/features/profile/questionnaire';

/**
 * Черновик анкеты: каждый ответ сохраняется сразу, поэтому после закрытия приложения анкета продолжается
 * с того же этапа. После «Начать» черновик очищается — дальше данные живут в профиле.
 */
interface QuestionnaireState {
  stage: number;
  draft: QDraft;
  update: (patch: Partial<QDraft>) => void;
  setStage: (n: number) => void;
  reset: () => void;
}

export const useQuestionnaire = create<QuestionnaireState>()(
  persist(
    (set) => ({
      stage: 0,
      draft: emptyDraft(),
      update: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),
      setStage: (n) => set({ stage: n }),
      reset: () => set({ stage: 0, draft: emptyDraft() }),
    }),
    {
      ...persistOptions<QuestionnaireState>('questionnaire', 1, (s) => ({ stage: s.stage, draft: s.draft }) as QuestionnaireState),
      // черновик прошлой версии анкеты (дни недели, работа + шаги) продолжается без потери ответов
      merge: (persisted, current) => {
        const p = { ...current, ...(persisted as Partial<QuestionnaireState>) };
        p.draft = migrateDraft(p.draft ?? emptyDraft());
        return p;
      },
    },
  ),
);
