import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { colors, radius, themed } from '@/theme';
import { T } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import { BASIS_LABEL } from '@/features/science/sources';
import { CONFIDENCE_LABEL, type Confidence, type Decision } from './decisions/types';
import { afterModalClose } from '@/components/modalGate';


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

/** Решение: что → почему → уверенность; данные и источник правила — по «Данные ›» (не шумят, но всегда доступны) */
export function DecisionCard({ d, compact }: { d: Decision; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const hasMore = !compact && (d.data.length > 0 || !!d.basis);
  return (
    <View style={styles.card} testID={`decision-${d.id}`}>
      <T v="body" style={{ fontWeight: '700' }} color={d.area === 'health' ? colors.warning : colors.text}>
        {d.what}
      </T>
      {d.why ? (
        <T v="small" style={{ lineHeight: 20 }}>
          {d.why}
        </T>
      ) : null}
      <ConfidenceLine level={d.confidence} note={d.confidenceNote} />
      {hasMore ? (
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} hitSlop={8} onPress={() => setOpen(!open)} style={{ alignSelf: 'flex-start' }}>
          <T v="small" style={{ fontWeight: '600', fontSize: 13 }}>
            {open ? 'Скрыть данные' : 'Данные ›'}
          </T>
        </Pressable>
      ) : null}
      {open ? (
        <View style={{ gap: 2 }}>
          {d.data.map((x) => (
            <T key={x} v="small" style={{ fontSize: 13 }}>
              • {x}
            </T>
          ))}
          <T v="small" style={{ fontSize: 12 }} color={colors.muted}>
            {BASIS_LABEL[d.basis.kind]}
            {d.basis.note ? ` · ${d.basis.note}` : ''}
          </T>
        </View>
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
              <T v="small" color={colors.text} style={{ fontWeight: '600' }}>
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
            <T v="small" color={colors.text} style={{ fontWeight: '600' }}>
              Спросить тренера
            </T>
          </Pressable>
        </View>
        <T v="small" style={{ fontSize: 12 }} color={colors.muted}>
          Числа считает алгоритм RYNJI по вашим данным.
        </T>
      </View>
    </Sheet>
  );
}

const styles = themed({
  card: { gap: 8, padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface2 },
  dots: { flexDirection: 'row', gap: 2, marginTop: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
