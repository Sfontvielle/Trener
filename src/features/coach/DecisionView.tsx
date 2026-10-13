import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { colors, themed } from '@/theme';
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

/**
 * Решение: что → почему → одна строка уверенности. Тап по ней — пояснение уверенности, данные и источник правила
 * (не шумят, но всегда в один тап). Без карточки: решения идут списком с тонким разделителем.
 */
export function DecisionCard({ d, compact, last }: { d: Decision; compact?: boolean; last?: boolean }) {
  const [open, setOpen] = useState(false);
  const level = d.confidence;
  const dots = level === 'high' ? 3 : level === 'medium' ? 2 : 1;
  return (
    <View style={[styles.card, last && { borderBottomWidth: 0 }]} testID={`decision-${d.id}`}>
      <T v="body" style={{ fontWeight: '700', fontSize: 17 }} color={d.area === 'health' ? colors.warning : colors.text}>
        {d.what}
      </T>
      {d.why ? (
        <T v="small" style={{ lineHeight: 20 }}>
          {d.why}
        </T>
      ) : null}
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} disabled={compact} hitSlop={8} onPress={() => setOpen(!open)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
        <View style={styles.dots}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.dot, { backgroundColor: i < dots ? CONF_COLOR[level] : colors.surface3 }]} />
          ))}
        </View>
        <T v="small" style={{ fontSize: 12 }}>
          Уверенность: <T v="small" style={{ fontSize: 12, fontWeight: '800' }} color={CONF_COLOR[level]}>{CONFIDENCE_LABEL[level]}</T>
          {compact ? '' : open ? '' : '  ›'}
        </T>
      </Pressable>
      {open ? (
        <View style={{ gap: 2 }}>
          <T v="small" style={{ fontSize: 12 }}>
            {d.confidenceNote}
          </T>
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
        {decisions.map((d, i) => (
          <DecisionCard key={d.id} d={d} last={i === decisions.length - 1} />
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
  card: { gap: 6, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: colors.borderStrong },
  dots: { flexDirection: 'row', gap: 2 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
