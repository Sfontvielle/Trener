import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space, themed } from '@/theme';
import { BRAND } from '@/config/brand';
import { Button, Icon, T, elevation } from '../ui';

/**
 * Предложение тренера, которое меняет план или цель (дизайн-система §9 CoachInsight, вариант с решением):
 * что предлагается, почему, и два равных по размеру ответа — «Не менять» и «Применить».
 * Ничего не применяется без нажатия.
 */
export function ProposalCard({
  title,
  why,
  source = BRAND,
  applyLabel = 'Применить',
  keepLabel = 'Не менять',
  onApply,
  onKeep,
  testID,
  style,
}: {
  title: string;
  why?: string;
  source?: string;
  applyLabel?: string;
  keepLabel?: string;
  onApply: () => void;
  onKeep: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View testID={testID} style={[styles.card, elevation(), style]}>
      <View style={styles.src}>
        <Icon name="sparkles-outline" size={16} color={colors.textDim} />
        <T v="footnote">{source}</T>
      </View>
      <T v="bodyStrong">{title}</T>
      {why ? <T v="callout" color={colors.textDim}>{why}</T> : null}
      <View style={styles.btns}>
        <Button title={keepLabel} variant="secondary" size="md" onPress={onKeep} style={styles.btn} />
        <Button title={applyLabel} size="md" onPress={onApply} style={styles.btn} />
      </View>
    </View>
  );
}

const styles = themed({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md, gap: space.xs },
  src: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  btns: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.xs },
  btn: { flexGrow: 1, flexBasis: 140 },
});
