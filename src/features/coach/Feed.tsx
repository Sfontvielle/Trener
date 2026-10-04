import React from 'react';
import { Pressable, View } from 'react-native';
import { colors, radius, themed } from '@/theme';
import { Icon, T, type IconName } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import type { FeedAction, FeedItem, FeedTone } from './feed';

const TONE: Record<FeedTone, { color: string; bg: string }> = {
  urgent: { color: colors.danger, bg: colors.dangerDim },
  warning: { color: colors.warning, bg: colors.warningDim },
  info: { color: colors.accent, bg: colors.accentDim },
  positive: { color: colors.accent, bg: colors.accentDim },
  neutral: { color: colors.textDim, bg: colors.surface2 },
};

/** Лента тренера: одна приоритетная колонка карточек с плавным появлением */
export function CoachFeed({ items, onAction, onDismiss }: { items: FeedItem[]; onAction: (item: FeedItem, a: FeedAction) => void; onDismiss: (item: FeedItem) => void }) {
  if (!items.length) return null;
  return (
    <View style={{ gap: 8 }} testID="coach-feed">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
        <Icon name="sparkles" size={14} color={colors.accent} />
        <T v="caption" color={colors.accent} accessibilityRole="header">
          Лента тренера
        </T>
      </View>
      {items.map((it, i) => {
        const t = TONE[it.tone];
        return (
          <FadeIn key={it.id} delay={60 * i}>
            <View style={[styles.card, it.tone === 'urgent' && { borderColor: colors.danger }]}>
              <View style={[styles.icon, { backgroundColor: t.bg }]}>
                <Icon name={it.icon as IconName} size={16} color={t.color} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <T v="body" style={{ fontWeight: '800', fontSize: 14 }} color={it.tone === 'urgent' ? colors.danger : colors.text}>
                  {it.title}
                </T>
                <T v="small" style={{ fontSize: 13 }} color={colors.textDim}>
                  {it.text}
                </T>
                {it.actions.length || it.dismissible ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 6, marginTop: 2 }}>
                    {it.actions.map((a) => (
                      <Pressable key={a.label} accessibilityRole="button" accessibilityLabel={`${a.label}: ${it.title}`} hitSlop={8} onPress={() => onAction(it, a)} style={styles.btn}>
                        <T v="small" color={colors.accent} style={{ fontWeight: '800' }}>
                          {a.label}
                        </T>
                      </Pressable>
                    ))}
                    {it.dismissible ? (
                      <Pressable accessibilityRole="button" accessibilityLabel={`Скрыть: ${it.title}`} hitSlop={8} onPress={() => onDismiss(it)} style={styles.btn}>
                        <T v="small" style={{ fontWeight: '700' }}>
                          {it.actions.length ? 'Не сейчас' : 'Понятно'}
                        </T>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </View>
          </FadeIn>
        );
      })}
    </View>
  );
}

const styles = themed({
  card: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  icon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  btn: { minHeight: 24, justifyContent: 'center' },
});
