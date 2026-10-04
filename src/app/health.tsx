import React, { useMemo, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { colors, radius, space, themed } from '@/theme';
import { Header, Screen } from '@/components/Screen';
import { Banner, Button, Card, Icon, SectionTitle, T, type IconName } from '@/components/ui';
import { toast } from '@/components/Dialog';
import { useHealth } from '@/stores/health';
import { healthAvailability } from '@/services/health';
import { connectHealth, syncHealth } from '@/features/health/sync';
import { healthContext } from '@/features/health/model';
import { formatHours, relativeDay, today, toISODate } from '@/utils/date';
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

  const run = async (fn: () => Promise<{ ok: boolean; message: string }>) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (r.ok) haptic.success();
    toast(r.message, r.ok ? 'checkmark-circle' : 'alert-circle');
  };

  return (
    <Screen>
      <Header title="Apple Health" subtitle="Только чтение · данные остаются на iPhone" />

      {av === 'unsupported' ? <Banner icon="phone-portrait-outline" text={Platform.OS === 'web' ? `Apple Health работает в приложении ${BRAND} на iPhone. В веб-превью — ручной чек-ин.` : 'Apple Health доступен только на iPhone.'} /> : null}
      {av === 'needs_dev_build' ? (
        <Banner tone="warning" icon="construct-outline" text={`Apple Health требует сборку ${BRAND} (EAS development / production build). В Expo Go нативный модуль HealthKit недоступен — ${BRAND} работает на ручном чек-ине.`} />
      ) : null}
      {av === 'unavailable' ? <Banner tone="warning" text="На этом устройстве Apple Health недоступен (например, iPad)." /> : null}

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

      {enabled ? (
        <>
          <SectionTitle title="Подключено" />
          <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="checkmark-circle" size={20} color={colors.accent} />
              <T v="body" style={{ fontWeight: '700', flex: 1 }}>
                Последняя синхронизация: {lastSyncAt ? `${relativeDay(toISODate(new Date(lastSyncAt))).toLowerCase()} ${new Date(lastSyncAt).toTimeString().slice(0, 5)}` : '—'}
              </T>
            </View>
            {lastError ? <Banner tone="warning" text={lastError} /> : null}
            {ctx ? (
              <View style={styles.grid}>
                <Metric label="Сон" value={ctx.sleepHours ? formatHours(ctx.sleepHours) : '—'} />
                <Metric label="Шаги" value={ctx.steps ? ctx.steps.toLocaleString('ru-RU') : '—'} />
                <Metric label="Пульс покоя" value={ctx.restingHr ? `${ctx.restingHr}` : '—'} sub={ctx.rhrDelta !== undefined ? `${ctx.rhrDelta >= 0 ? '+' : ''}${ctx.rhrDelta} к базе 14 дн` : undefined} warn={(ctx.rhrDelta ?? 0) >= 5} />
                <Metric label="HRV" value={ctx.hrvMs ? `${ctx.hrvMs} мс` : '—'} sub={ctx.hrvDeltaPct !== undefined ? `${ctx.hrvDeltaPct >= 0 ? '+' : ''}${ctx.hrvDeltaPct}% к базе 21 дн` : undefined} warn={(ctx.hrvDeltaPct ?? 0) <= -15} />
              </View>
            ) : (
              <T v="small">Данных за сегодня пока нет. Если так и останется — проверь доступ: «Здоровье» → профиль → Приложения → {BRAND}.</T>
            )}
            <Button title="Синхронизировать" icon="sync" loading={busy} onPress={() => run(syncHealth)} />
            <Button title="Управление доступом" icon="settings-outline" variant="secondary" onPress={() => Linking.openURL('x-apple-health://').catch(() => Linking.openSettings())} />
            <Button title="Отключить" variant="ghost" onPress={() => useHealth.getState().setEnabled(false)} />
          </Card>
        </>
      ) : (
        <Button title="Подключить Apple Health" icon="heart" size="lg" style={{ marginTop: space.lg }} disabled={av !== 'available'} loading={busy} onPress={() => run(connectHealth)} />
      )}
      <T v="small" style={{ marginTop: space.lg, textAlign: 'center' }}>
        Без доступа {BRAND} продолжает работать: сон и самочувствие можно отмечать в чек-ине. {BRAND} не ставит медицинских диагнозов.
      </T>
    </Screen>
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
