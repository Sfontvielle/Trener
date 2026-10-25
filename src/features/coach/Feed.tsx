import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { colors, radius, themed } from '@/theme';
import { T } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import type { FeedAction, FeedItem } from './feed';

/** Сколько карточек видно сразу: остальное — по «Ещё», чтобы лента не превращалась в шум */
const VISIBLE = 3;

/**
 * Лента тренера: карточки по приоритету — заголовок, одна фраза, действие. limit — сколько видно сразу;
 * onMore — остальные открываются отдельно (лист), иначе — разворачиваются на месте. bare — без заголовка (в листе).
 */
export function CoachFeed({ items, onAction, onDismiss, onAsk, limit = VISIBLE, onMore, bare }: { items: FeedItem[]; onAction: (item: FeedItem, a: FeedAction) => void; onDismiss: (item: FeedItem) => void; /** Обсудить рекомендацию с тренером (чат с готовым вопросом) */ onAsk?: (item: FeedItem) => void; limit?: number; onMore?: () => void; bare?: boolean }) {
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  const shown = all ? items : items.slice(0, limit);
  const rest = items.length - shown.length;
  return (
    <View style={{ gap: 10 }} testID={bare ? 'coach-feed-list' : 'coach-feed'}>
      {bare ? null : (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 2 }}>
          <T v="h3" accessibilityRole="header" style={{ flex: 1 }}>
            От тренера
          </T>
          {rest > 0 && onMore ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Ещё ${rest} от тренера`} onPress={onMore} hitSlop={10}>
              <T v="small" color={colors.text} style={{ fontWeight: '600' }}>
                Ещё {rest} ›
              </T>
            </Pressable>
          ) : null}
        </View>
      )}
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
              {it.actions.length || it.dismissible || onAsk ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 20, rowGap: 6, marginTop: 4 }}>
                  {it.actions.map((a, k) => (
                    <Pressable key={a.label} accessibilityRole="button" accessibilityLabel={`${a.label}: ${it.title}`} hitSlop={8} onPress={() => onAction(it, a)} style={styles.btn}>
                      <T v="body" color={k === 0 ? colors.accent : colors.text} style={{ fontWeight: '600', fontSize: 15 }}>
                        {a.label}
                      </T>
                    </Pressable>
                  ))}
                  {onAsk && !it.id.startsWith('setup_') ? (
                    <Pressable accessibilityRole="button" accessibilityLabel={`Спросить тренера: ${it.title}`} hitSlop={8} onPress={() => onAsk(it)} style={styles.btn}>
                      <T v="body" color={it.actions.length ? colors.text : colors.accent} style={{ fontWeight: '600', fontSize: 15 }}>
                        Спросить тренера
                      </T>
                    </Pressable>
                  ) : null}
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
      {!onMore && items.length > limit ? (
        <Pressable accessibilityRole="button" onPress={() => setAll(!all)} hitSlop={8} style={{ alignSelf: 'flex-start', paddingVertical: 4 }}>
          <T v="small" style={{ fontWeight: '600' }}>
            {all ? 'Свернуть' : `Ещё ${items.length - limit}`}
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
