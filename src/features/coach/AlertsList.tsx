import React from 'react';
import { Pressable, View } from 'react-native';
import { colors, radius, themed } from '@/theme';
import { Icon, T, type IconName } from '@/components/ui';
import type { AlertLevel, AlertTarget, CoachAlert } from './decisions/alerts';

const LEVEL: Record<AlertLevel, { icon: IconName; color: string; bg: string }> = {
  urgent: { icon: 'alert-circle', color: colors.danger, bg: colors.dangerDim },
  warning: { icon: 'warning-outline', color: colors.warning, bg: colors.warningDim },
  info: { icon: 'information-circle-outline', color: colors.accent, bg: colors.accentDim },
  positive: { icon: 'trending-up', color: colors.accent, bg: colors.accentDim },
};

const ACTION: Partial<Record<AlertTarget, string>> = { labs: 'Анализы', measure: 'Измерить', weekly: 'Отчёт недели', health: 'Подробнее', checkin: 'Чек-ин', weight: 'Взвеситься' };

/** Coach Alerts: максимум 3, по приоритету. Срочные нельзя скрыть */
export function AlertsList({ alerts, onOpen, onDismiss }: { alerts: CoachAlert[]; onOpen: (a: CoachAlert) => void; onDismiss: (a: CoachAlert) => void }) {
  if (!alerts.length) return null;
  return (
    <View style={{ gap: 8 }} testID="coach-alerts">
      {alerts.map((a) => {
        const m = LEVEL[a.level];
        const action = a.target ? ACTION[a.target] : undefined;
        return (
          <View key={a.id} style={[styles.card, a.level === 'urgent' && { borderColor: colors.danger }]}>
            <View style={[styles.icon, { backgroundColor: m.bg }]}>
              <Icon name={m.icon} size={16} color={m.color} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <T v="body" style={{ fontWeight: '800', fontSize: 14 }} color={a.level === 'urgent' ? colors.danger : colors.text}>
                {a.title}
              </T>
              <T v="small" style={{ fontSize: 13 }} color={colors.textDim}>
                {a.text}
              </T>
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 2 }}>
                {action ? (
                  <Pressable accessibilityRole="button" hitSlop={8} onPress={() => onOpen(a)}>
                    <T v="small" color={colors.accent} style={{ fontWeight: '800' }}>
                      {action}
                    </T>
                  </Pressable>
                ) : null}
                {a.level !== 'urgent' ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={`Скрыть: ${a.title}`} hitSlop={8} onPress={() => onDismiss(a)}>
                    <T v="small" style={{ fontWeight: '700' }}>
                      Понятно
                    </T>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = themed({
  card: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  icon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
