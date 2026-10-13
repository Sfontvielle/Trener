import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { colors, radius, themed } from '@/theme';
import { T } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import type { FeedAction, FeedItem } from './feed';

/** Сколько карточек видно сразу: остальное — по «Ещё», чтобы лента не превращалась в шум */
const VISIBLE = 3;

/** Лента тренера: одна колонка карточек по приоритету — заголовок, одна фраза, действие */
export function CoachFeed({ items, onAction, onDismiss }: { items: FeedItem[]; onAction: (item: FeedItem, a: FeedAction) => void; onDismiss: (item: FeedItem) => void }) {
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  const shown = all ? items : items.slice(0, VISIBLE);
  return (
    <View style={{ gap: 10 }} testID="coach-feed">
      <T v="h3" accessibilityRole="header" style={{ marginBottom: 2 }}>
        От тренера
      </T>
      {shown.map((it, i) => {
        const urgent = it.tone === 'urgent';
        const warn = it.tone === 'warning';
        return (
          <FadeIn key={it.id} delay={60 * i}>
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {urgent || warn ? <View style={[styles.dot, { backgroundColor: urgent ? colors.danger : colors.warning }]} /> : null}
                <T v="body" style={{ fontWeight: '700', flex: 1 }} color={urgent ? colors.danger : colors.text}>
                  {it.title}
                </T>
              </View>
              <T v="small" style={{ lineHeight: 20 }}>
                {it.text}
              </T>
              {it.actions.length || it.dismissible ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 20, rowGap: 6, marginTop: 4 }}>
                  {it.actions.map((a, k) => (
                    <Pressable key={a.label} accessibilityRole="button" accessibilityLabel={`${a.label}: ${it.title}`} hitSlop={8} onPress={() => onAction(it, a)} style={styles.btn}>
                      <T v="body" color={k === 0 ? colors.accent : colors.text} style={{ fontWeight: '600', fontSize: 15 }}>
                        {a.label}
                      </T>
                    </Pressable>
                  ))}
                  {it.dismissible ? (
                    <Pressable accessibilityRole="button" accessibilityLabel={`Скрыть: ${it.title}`} hitSlop={8} onPress={() => onDismiss(it)} style={styles.btn}>
                      <T v="body" color={colors.textDim} style={{ fontSize: 15 }}>
                        {it.actions.length ? 'Не сейчас' : 'Понятно'}
                      </T>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          </FadeIn>
        );
      })}
      {items.length > VISIBLE ? (
        <Pressable accessibilityRole="button" onPress={() => setAll(!all)} hitSlop={8} style={{ alignSelf: 'flex-start', paddingVertical: 4 }}>
          <T v="small" style={{ fontWeight: '600' }}>
            {all ? 'Свернуть' : `Ещё ${items.length - VISIBLE}`}
          </T>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = themed({
  card: { gap: 6, padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface },
  dot: { width: 7, height: 7, borderRadius: 4 },
  btn: { minHeight: 28, justifyContent: 'center' },
});
