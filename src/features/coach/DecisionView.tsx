import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { colors, radius, themed } from '@/theme';
import { Icon, T, type IconName } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import { BASIS_LABEL } from '@/features/science/sources';
import { CONFIDENCE_LABEL, type Confidence, type Decision, type DecisionArea } from './decisions/types';
import { afterModalClose } from '@/components/modalGate';

const AREA_ICON: Record<DecisionArea, IconName> = {
  training: 'barbell-outline',
  nutrition: 'restaurant-outline',
  recovery: 'battery-half',
  body: 'body-outline',
  health: 'medkit-outline',
  schedule: 'calendar-outline',
  activity: 'footsteps-outline',
};

const CONF_COLOR: Record<Confidence, string> = { high: colors.accent, medium: colors.textDim, low: colors.warning };

/** «Уверенность: низкая — …» одной строкой */
export function ConfidenceLine({ level, note }: { level: Confidence; note: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
      <View style={[styles.dots]}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.dot, { backgroundColor: i < (level === 'high' ? 3 : level === 'medium' ? 2 : 1) ? CONF_COLOR[level] : colors.surface3 }]} />
        ))}
      </View>
      <T v="small" style={{ flex: 1, fontSize: 12 }}>
        Уверенность: <T v="small" style={{ fontSize: 12, fontWeight: '800' }} color={CONF_COLOR[level]}>{CONFIDENCE_LABEL[level]}</T> — {note}
      </T>
    </View>
  );
}

/** Решение: что → почему → данные → уверенность */
export function DecisionCard({ d, compact }: { d: Decision; compact?: boolean }) {
  return (
    <View style={styles.card} testID={`decision-${d.id}`}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
        <Icon name={AREA_ICON[d.area]} size={16} color={d.area === 'health' ? colors.warning : colors.accent} style={{ marginTop: 2 }} />
        <T v="body" style={{ flex: 1, fontWeight: '800', fontSize: 15 }}>
          {d.what}
        </T>
      </View>
      {d.why ? (
        <T v="body" style={{ fontSize: 14 }} color={colors.textDim}>
          {d.why}
        </T>
      ) : null}
      {!compact && d.data.length ? (
        <View style={{ gap: 2 }}>
          <T v="caption" style={{ fontSize: 10 }}>
            На основе
          </T>
          {d.data.map((x) => (
            <T key={x} v="small" style={{ fontSize: 12 }}>
              • {x}
            </T>
          ))}
        </View>
      ) : null}
      <ConfidenceLine level={d.confidence} note={d.confidenceNote} />
      {!compact ? (
        <T v="small" style={{ fontSize: 11 }} color={colors.muted}>
          {BASIS_LABEL[d.basis.kind]}
          {d.basis.note ? ` · ${d.basis.note}` : ''}
        </T>
      ) : null}
    </View>
  );
}

/** «Почему?» — все решения дня с данными и уверенностью */
export function CoachWhySheet({ visible, onClose, title, decisions, onReadiness }: { visible: boolean; onClose: () => void; title?: string; decisions: Decision[]; onReadiness?: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title ?? 'Почему так?'} subtitle="Что решил тренер, на каких данных и насколько уверен">
      <View style={{ gap: 10 }} testID="coach-why">
        {decisions.map((d) => (
          <DecisionCard key={d.id} d={d} />
        ))}
        <View style={{ flexDirection: 'row', gap: 18, marginTop: 4 }}>
          {onReadiness ? (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={onReadiness}>
              <T v="small" color={colors.accent} style={{ fontWeight: '800' }}>
                Подробнее о готовности
              </T>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => {
              onClose();
              afterModalClose(() => router.push('/coach'));
            }}
          >
            <T v="small" color={colors.accent} style={{ fontWeight: '800' }}>
              Спросить тренера
            </T>
          </Pressable>
        </View>
        <T v="small" style={{ fontSize: 11 }}>
          Все числа считает алгоритм RYNJI по вашим данным; ИИ (если подключён) только объясняет их словами.
        </T>
      </View>
    </Sheet>
  );
}

const styles = themed({
  card: { gap: 6, padding: 12, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  dots: { flexDirection: 'row', gap: 2, marginTop: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
