import React, { useMemo, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { colors, radius, space, themed } from '@/theme';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Icon, SectionTitle, T, type IconName } from '@/components/ui';
import { toast } from '@/components/Dialog';
import { useHealth } from '@/stores/health';
import { healthAvailability, healthLoadError } from '@/services/health';
import { healthUiState, type HealthUiState } from '@/features/health/state';
import { connectHealth, syncHealth } from '@/features/health/sync';
import { healthContext } from '@/features/health/model';
import { formatSleep, relativeDay, today, toISODate } from '@/utils/date';
import { haptic } from '@/services/haptics';
import { BRAND } from '@/config/brand';

const READS: { icon: IconName; label: string; why: string }[] = [
  { icon: 'moon-outline', label: 'Сон', why: 'готовность без ручного ввода' },
  { icon: 'footsteps-outline', label: 'Шаги', why: 'активность и расход' },
  { icon: 'pulse-outline', label: 'HRV', why: 'сравнение с твоей базой' },
  { icon: 'heart-outline', label: 'Пульс покоя', why: 'признак недовосстановления' },
  { icon: 'flame-outline', label: 'Активные калории', why: 'контекст питания' },
  { icon: 'barbell-outline', label: 'Тренировки', why: `нагрузка вне ${BRAND}` },
  { icon: 'scale-outline', label: 'Вес', why: 'тренд без ручных записей' },
];

/** Настройки → Apple Health */
export default function Health() {
  const enabled = useHealth((s) => s.enabled);
  const lastSyncAt = useHealth((s) => s.lastSyncAt);
  const lastError = useHealth((s) => s.lastError);
  const days = useHealth((s) => s.days);
  const [busy, setBusy] = useState(false);
  const av = useMemo(() => healthAvailability(), []);
  const ctx = useMemo(() => healthContext(days, today()), [days]);
  const hasData = useMemo(() => Object.values(days).some((d) => d.steps || d.sleepHours || d.restingHr || d.hrvMs || d.activeKcal || d.weightKg), [days]);
  const state = healthUiState({ av, enabled, lastSyncAt, lastError, hasData, loadError: healthLoadError() });

  const run = async (fn: () => Promise<{ ok: boolean; message: string }>) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (r.ok) haptic.success();
    else haptic.warning();
    toast(r.message, r.ok ? 'checkmark-circle' : 'alert-circle');
  };

  return (
    <Screen>
      <Header title="Apple Health" subtitle="Только чтение · данные остаются на iPhone" />

      <StatusCard state={state} busy={busy} onRetry={() => run(enabled ? syncHealth : connectHealth)} onConnect={() => run(connectHealth)} />

      <SectionTitle title={`${BRAND} может читать`} />
      <Card style={{ gap: 2, paddingVertical: 6 }}>
        {READS.map((r) => (
          <View key={r.label} style={styles.row}>
            <Icon name={r.icon} size={18} color={colors.accent} />
            <T v="body" style={{ flex: 1, fontWeight: '600' }}>
              {r.label}
            </T>
            <T v="small" style={{ fontSize: 12 }}>
              {r.why}
            </T>
          </View>
        ))}
      </Card>

      {enabled && state.kind !== 'unavailable' ? (
        <>
          <SectionTitle title="Данные" />
          <Card style={{ gap: 10 }}>
            {ctx ? (
              <View style={styles.grid}>
                <Metric label="Сон" value={ctx.sleepHours ? formatSleep(ctx.sleepHours * 60) : '—'} />
                <Metric label="Шаги" value={ctx.steps ? ctx.steps.toLocaleString('ru-RU') : '—'} />
                <Metric label="Пульс покоя" value={ctx.restingHr ? `${ctx.restingHr}` : '—'} sub={ctx.rhrDelta !== undefined ? `${ctx.rhrDelta >= 0 ? '+' : ''}${ctx.rhrDelta} к базе 14 дн` : undefined} warn={(ctx.rhrDelta ?? 0) >= 5} />
                <Metric label="HRV" value={ctx.hrvMs ? `${ctx.hrvMs} мс` : '—'} sub={ctx.hrvDeltaPct !== undefined ? `${ctx.hrvDeltaPct >= 0 ? '+' : ''}${ctx.hrvDeltaPct}% к базе 21 дн` : undefined} warn={(ctx.hrvDeltaPct ?? 0) <= -15} />
              </View>
            ) : (
              <T v="small">Данных за сегодня пока нет.</T>
            )}
            <Button title="Синхронизировать" icon="sync" loading={busy} onPress={() => run(syncHealth)} />
            <Button title="Управление доступом" icon="settings-outline" variant="secondary" onPress={() => Linking.openURL('x-apple-health://').catch(() => Linking.openSettings())} />
            <Button title="Отключить" variant="ghost" onPress={() => useHealth.getState().setEnabled(false)} />
          </Card>
        </>
      ) : null}
      <T v="small" style={{ marginTop: space.lg, textAlign: 'center' }}>
        Без доступа {BRAND} продолжает работать: сон и самочувствие можно отмечать в чек-ине. {BRAND} не ставит медицинских диагнозов.
      </T>
    </Screen>
  );
}

function syncTime(at: number): string {
  return `${relativeDay(toISODate(new Date(at))).toLowerCase()} в ${new Date(at).toTimeString().slice(0, 5)}`;
}

/** Явное состояние: Подключено / Нет разрешения / Недоступен (причина) / Ошибка (Повторить, Подробнее) */
function StatusCard({ state, busy, onRetry, onConnect }: { state: HealthUiState; busy: boolean; onRetry: () => void; onConnect: () => void }) {
  const [more, setMore] = useState(false);
  const meta: Record<HealthUiState['kind'], { icon: IconName; title: string; color: string }> = {
    connected: { icon: 'checkmark-circle', title: 'Подключено', color: colors.accent },
    no_permission: { icon: 'lock-closed-outline', title: 'Нет разрешения', color: colors.warning },
    unavailable: { icon: 'phone-portrait-outline', title: 'HealthKit недоступен', color: colors.textDim },
    error: { icon: 'alert-circle', title: 'Ошибка подключения', color: colors.danger },
    not_connected: { icon: 'heart-outline', title: 'Не подключено', color: colors.textDim },
  };
  const m = meta[state.kind];
  const detail = state.kind === 'error' ? state.detail : state.kind === 'unavailable' ? state.detail : undefined;
  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name={m.icon} size={22} color={m.color} />
        <T v="h3" style={{ flex: 1 }}>
          {m.title}
        </T>
      </View>
      {state.kind === 'connected' ? <T v="small">Последняя синхронизация: {syncTime(state.lastSyncAt)}</T> : null}
      {state.kind === 'no_permission' ? <T v="small">{state.text}</T> : null}
      {state.kind === 'unavailable' ? <T v="small">{state.reason}</T> : null}
      {state.kind === 'error' ? <T v="small">Не удалось прочитать данные Apple Health. Техническая причина записана в журнал.</T> : null}
      {state.kind === 'not_connected' ? <T v="small">Сон, шаги, пульс покоя и HRV будут подставляться автоматически.</T> : null}
      {more && detail ? (
        <T v="small" selectable style={{ fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12 }}>
          {detail}
        </T>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {state.kind === 'error' || state.kind === 'no_permission' ? <Button title="Повторить" icon="refresh" loading={busy} onPress={onRetry} style={{ flex: 1 }} /> : null}
        {state.kind === 'not_connected' ? <Button title="Подключить Apple Health" icon="heart" loading={busy} onPress={onConnect} style={{ flex: 1 }} /> : null}
        {detail ? <Button title={more ? 'Скрыть' : 'Подробнее'} variant="secondary" onPress={() => setMore((x) => !x)} style={{ flex: state.kind === 'error' ? 1 : undefined }} /> : null}
      </View>
    </Card>
  );
}

function Metric({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <View style={styles.metric}>
      <T v="caption" style={{ fontSize: 10 }}>
        {label}
      </T>
      <T v="num" style={{ fontSize: 20 }}>
        {value}
      </T>
      {sub ? (
        <T v="small" style={{ fontSize: 11 }} color={warn ? colors.warning : colors.textDim}>
          {sub}
        </T>
      ) : null}
    </View>
  );
}

const styles = themed({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { flexBasis: '47%', flexGrow: 1, padding: 12, borderRadius: radius.md, backgroundColor: colors.surface2, gap: 2 },
});
