import { activityKey, planActivity, type WorkoutActivityProps } from './liveActivity';

/**
 * Ядро синхронизации Live Activity с тренировкой — без React Native и нативных модулей (проверяется тестами
 * на имитации ActivityKit). Нативная часть и подписки — в services/liveActivity.
 */
export interface ActivityInstance {
  getId(): string;
  update(props: WorkoutActivityProps): Promise<void>;
  end(policy?: unknown, props?: WorkoutActivityProps, contentDate?: Date): Promise<void>;
}
export interface ActivityFactory {
  start(props: WorkoutActivityProps, url?: string): ActivityInstance;
  getInstances(): ActivityInstance[];
}

export interface SyncDeps {
  factory: ActivityFactory;
  /** Политика «убрать после даты» (after() из expo-widgets) */
  after: (d: Date) => unknown;
  /** Текущее состояние тренировки → данные активности; null — тренировки нет */
  props: () => WorkoutActivityProps | null;
  /** Завершена ли (сохранена в истории) тренировка с этим id */
  isFinished: (workoutId: string) => boolean;
  url: string;
  now?: () => number;
}

export function createActivitySync(d: SyncDeps) {
  /** Чья активность: id активности → id тренировки (в пределах запуска приложения) */
  const owners = new Map<string, string>();
  let lastKey = '';
  /** Live Activities запрещены или не поддерживаются — для этой тренировки больше не пытаемся */
  let unavailableFor: string | null = null;
  /** Для какой тренировки активность уже была в этом запуске (её смахнули — не навязываем снова) */
  let startedFor: string | null = null;
  const now = d.now ?? Date.now;

  const list = (): ActivityInstance[] => {
    try {
      return d.factory.getInstances();
    } catch {
      return [];
    }
  };

  const end = async (inst: ActivityInstance) => {
    const id = inst.getId();
    const wid = owners.get(id);
    // Завершённая тренировка — итог виден на экране блокировки пару минут; отменённая — исчезает сразу
    try {
      if (wid && d.isFinished(wid)) await inst.end(d.after(new Date(now() + 2 * 60 * 1000)), undefined, new Date(now()));
      else await inst.end('immediate');
    } catch {
      /* активность уже закрыта системой */
    }
    owners.delete(id);
  };

  async function sync(): Promise<void> {
    const props = d.props();
    const all = list();
    const key = props ? activityKey(props) : '';
    const plan = planActivity({ workoutId: props?.workoutId ?? null, instances: all.map((x) => ({ id: x.getId(), owner: owners.get(x.getId()) })), changed: key !== lastKey });

    for (const inst of all.filter((x) => plan.endIds.includes(x.getId()))) await end(inst);
    if (!props) {
      lastKey = '';
      unavailableFor = null;
      startedFor = null;
      return;
    }
    if (plan.start) {
      if (unavailableFor === props.workoutId || startedFor === props.workoutId) return;
      try {
        const inst = d.factory.start(props, d.url);
        owners.set(inst.getId(), props.workoutId);
        startedFor = props.workoutId;
        lastKey = key;
      } catch {
        // Запрещены в Настройках или устройство не поддерживает — тренировка продолжается без активности
        unavailableFor = props.workoutId;
      }
      return;
    }
    if (!plan.keep) return;
    owners.set(plan.keep, props.workoutId);
    startedFor = props.workoutId;
    if (plan.update) {
      try {
        await all.find((x) => x.getId() === plan.keep)?.update(props);
        lastKey = key;
      } catch {
        /* система могла закрыть активность */
      }
    }
  }

  return {
    sync,
    /** Возвращение в приложение: могли разрешить Live Activities в Настройках — пробуем заново и обновляем данные */
    resume() {
      unavailableFor = null;
      lastKey = '';
    },
  };
}
