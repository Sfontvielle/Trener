import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, FlatList, Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { INPUT_MAX_SCALE } from '@/components/inputs';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CoachAction, CoachMessage } from '@/types';
import { colors, radius, space, themed } from '@/theme';
import { Button, Chip, Icon, T, elevation } from '@/components/ui';
import { AppHeader } from '@/components/ds';
import { confirm, toast } from '@/components/Dialog';
import { useCoach } from '@/stores/coach';
import { applyCoachAction, declineCoachAction, sendCoachMessage } from '@/features/coach/service';
import { useKeyboardAwareScroll } from '@/components/keyboard';
import { haptic } from '@/services/haptics';
import { toISODate } from '@/utils/date';
import { BRAND } from '@/config/brand';
import { prefersReducedMotion, userPrefersReducedMotion } from '@/components/motion';
import { revealedAt, revealMs, thinkMs, wordStops } from '@/features/coach/reveal';

const QUICK = ['Что мне сегодня делать?', 'Упражнения на верх груди', 'Что мне поесть сейчас?', 'Почему вес стоит?', 'Разбери мою неделю', 'Болит плечо при жиме', 'Сколько белка мне нужно?', 'Как улучшить сон?'];

export default function Coach() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ q?: string }>();
  const messages = useCoach((s) => s.messages);
  const [text, setText] = useState(params.q ? String(params.q) : '');
  const [busy, setBusy] = useState(false);
  const list = useRef<FlatList<CoachMessage>>(null);
  // Композер всегда над клавиатурой (iOS и Android edge-to-edge)
  const { rootRef, pad } = useKeyboardAwareScroll();

  useEffect(() => {
    const t = setTimeout(() => list.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [messages.length, busy]);

  const send = async (q?: string) => {
    const msg = (q ?? text).trim();
    if (!msg || busy) return;
    setText('');
    setBusy(true);
    haptic.tap();
    try {
      await sendCoachMessage(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View ref={rootRef} style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + space.sm, paddingBottom: pad }}>
      <View style={{ paddingHorizontal: space.md }}>
        <AppHeader
          back
          title={`${BRAND} Coach`}
          subtitle="Знает твои тренировки, питание и восстановление"
          actions={[
            {
              icon: 'ellipsis-horizontal',
              label: 'Меню чата',
              onPress: () => confirm('Очистить переписку?', 'Сообщения удалятся с этого iPhone.', 'Очистить', () => useCoach.getState().clearChat(), true),
            },
          ]}
        />
      </View>
      <View style={{ flex: 1 }}>
        <FlatList
          ref={list}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingHorizontal: space.md, paddingBottom: space.lg, gap: space.md, flexGrow: 1 }}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Intro />}
          renderItem={({ item }) => <Bubble m={item} />}
          ListFooterComponent={busy ? <Typing /> : undefined}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
        />
        <View style={[styles.composer, { paddingBottom: pad ? 8 : insets.bottom + 8 }]}>
          {!messages.length || !busy ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs, paddingHorizontal: space.md }} keyboardShouldPersistTaps="handled">
              {QUICK.map((q) => (
                <Chip key={q} label={q} onPress={() => send(q)} />
              ))}
            </ScrollView>
          ) : null}
          <View style={styles.inputRow}>
            <TextInput maxFontSizeMultiplier={INPUT_MAX_SCALE}
              value={text}
              onChangeText={setText}
              placeholder="Спроси тренера…"
              placeholderTextColor={colors.muted}
              style={styles.input}
              multiline
              maxLength={2000}
              selectionColor={colors.accent}
              onSubmitEditing={() => send()}
              blurOnSubmit={false}
              accessibilityLabel="Сообщение тренеру"
            />
            <Pressable accessibilityRole="button" accessibilityLabel="Отправить" disabled={!text.trim() || busy} onPress={() => send()} style={[styles.send, (!text.trim() || busy) && { opacity: 0.4 }]}>
              <Icon name="arrow-up" size={22} color={colors.onAccent} />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

function Intro() {
  const insight = useCoach((st) => st.insight);
  const todayInsight = insight && insight.date === toISODate(new Date()) ? insight.text : null;
  return (
    <View style={{ gap: space.sm, paddingVertical: space.xl }}>
      <T v="title1">Чем помочь?</T>
      <T v="callout" color={colors.textDim}>
        Спроси про тренировку, питание, технику, анализы или восстановление — отвечу по твоим данным.
      </T>
      {todayInsight ? (
        <View style={[styles.card, elevation(), { marginTop: space.xs }]}>
          <View style={styles.src}>
            <Icon name="sparkles-outline" size={16} color={colors.textDim} />
            <T v="footnote">Совет дня</T>
          </View>
          <T v="body">{todayInsight}</T>
        </View>
      ) : null}
      <T v="footnote" style={{ marginTop: space.xs }}>
        {BRAND} — фитнес-помощник, не врач и не ставит диагнозов. При боли в груди, обмороке, сильной одышке или травме — сразу к врачу.
      </T>
    </View>
  );
}

/** Сообщение: своё — нейтральным пузырём справа; ответ тренера — текстом на всю ширину, предупреждение безопасности — карточкой */
function Bubble({ m }: { m: CoachMessage }) {
  const mine = m.role === 'user';
  if (mine) {
    return (
      <View style={{ alignItems: 'flex-end' }}>
        <View style={styles.mine}>
          <T v="body" selectable>
            {renderBold(m.text)}
          </T>
        </View>
      </View>
    );
  }
  return <AssistantBubble m={m} />;
}

/** Уже показанные «печатью» ответы — при прокрутке и возврате на экран не печатаются заново */
const typed = new Set<string>();

/**
 * Ответ тренера (R1): свежий ответ «печатается» — пауза с точками набора, затем текст словами.
 * Тап по ответу — показать целиком. «Уменьшение движения» и старые сообщения — сразу целиком.
 * Карточки действий и источники появляются, когда текст допечатан.
 */
function AssistantBubble({ m }: { m: CoachMessage }) {
  const [fresh] = useState(() => !typed.has(m.id) && Date.now() - m.createdAt < 8000 && !m.safety && !userPrefersReducedMotion());
  const [t, setT] = useState(fresh ? -thinkMs(m.text.length) : Number.POSITIVE_INFINITY);
  const [stops] = useState(() => wordStops(m.text));
  const total = revealMs(m.text.length);
  const done = t >= total;
  useEffect(() => {
    if (done) {
      typed.add(m.id);
      return;
    }
    // t < 0 — ещё «думает» (|t| мс до первого слова), t ≥ 0 — сколько мс уже печатается
    const think = Math.max(0, -t);
    const start = Date.now() - Math.max(0, t);
    const id = setInterval(() => setT(Date.now() - start - think), 40);
    return () => clearInterval(id);
    // Таймер запускается один раз на ответ; t — только стартовое значение
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, m.id]);
  const finish = () => {
    if (done) return;
    typed.add(m.id);
    setT(Number.POSITIVE_INFINITY);
  };
  const shown = done ? m.text : revealedAt(m.text, stops, t, total);
  return (
    <View style={{ gap: space.xs }}>
      <Pressable disabled={done} onPress={finish} accessibilityLabel={done ? undefined : m.text.replace(/\*\*/g, '')} accessibilityHint={done ? undefined : 'Показать ответ целиком'} style={m.safety ? [styles.card, styles.safety] : undefined} testID={done ? undefined : 'coach-typing-reply'}>
        <View style={styles.src}>
          <Icon name={m.safety ? 'alert-circle-outline' : 'sparkles-outline'} size={16} color={m.safety ? colors.danger : colors.textDim} />
          <T v="footnote" color={m.safety ? colors.danger : m.offline ? colors.warning : colors.textDim}>
            {m.safety ? 'Безопасность' : m.offline ? `${BRAND} · сервер недоступен, ответ на устройстве` : t < 0 ? `${BRAND} печатает…` : BRAND}
          </T>
        </View>
        {t < 0 ? (
          <TypingDots />
        ) : (
          <T v="body" selectable={done} style={{ marginTop: space.xxs }}>
            {renderBold(shown)}
          </T>
        )}
      </Pressable>
      {!done ? null : m.sources?.length ? <Sources list={m.sources} /> : null}
      {done && m.actions?.length ? (
        <View style={{ gap: space.xs }}>
          {m.actions.map((a) => (
            <View key={a.id} style={[styles.card, elevation()]}>
              <T v="bodyStrong">{a.label}</T>
              {a.params.reason ? <T v="callout" color={colors.textDim}>{a.params.reason}</T> : null}
              <ActionState messageId={m.id} a={a} />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Откуда рекомендация: позиции обществ, обзоры, руководства — открываются в браузере */
function Sources({ list }: { list: NonNullable<CoachMessage['sources']> }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.sources}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 }} hitSlop={6}>
        <Icon name="library-outline" size={16} color={colors.textDim} />
        <T v="footnote" style={{ flex: 1 }}>
          Источники · {list.length}
        </T>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
      </Pressable>
      {open
        ? list.map((s) => (
            <Pressable key={s.url} accessibilityRole="link" onPress={() => void Linking.openURL(s.url)} style={{ paddingVertical: space.xxs }}>
              <T v="callout" color={colors.text} numberOfLines={3}>
                {s.title}
              </T>
              <T v="footnote">
                {s.org}
                {s.year ? ` · ${s.year}` : ''} · открыть
              </T>
            </Pressable>
          ))
        : null}
    </View>
  );
}

/** AI предлагает → приложение проверило → пользователь решает: «Не менять» и действие — равные кнопки */
function ActionState({ messageId, a }: { messageId: string; a: CoachAction }) {
  if (a.applied || a.declined || a.invalid) {
    const label = a.applied ? (a.type.startsWith('start') ? 'Начато' : a.type === 'create_exercise' || a.type === 'add_to_plan' ? 'Готово' : 'Применено') : a.declined ? 'Не сейчас' : `Отклонено ${BRAND}: ${a.invalid}`;
    const color = a.applied ? colors.text : a.invalid ? colors.warning : colors.textDim;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.xxs }}>
        <Icon name={a.applied ? 'checkmark-circle' : a.invalid ? 'alert-circle' : 'close-circle'} size={16} color={a.applied ? colors.accent : color} />
        <T v="footnote" color={color} style={{ flexShrink: 1 }}>
          {label}
        </T>
      </View>
    );
  }
  const replace = a.type === 'replace_exercise';
  const verb = a.type === 'start_today' || a.type === 'start_custom_workout' ? 'Начать' : a.type === 'create_exercise' ? 'Создать' : a.type === 'generate_workout' ? 'Собрать' : a.type === 'add_to_plan' ? 'Добавить' : 'Применить';
  const optional = verb !== 'Применить';
  return (
    <View style={{ gap: space.xs, marginTop: space.xxs }}>
      <View style={styles.btns}>
        <Button title={optional ? 'Не сейчас' : 'Не менять'} variant="secondary" size="md" onPress={() => declineCoachAction(messageId, a)} style={styles.btn} />
        <Button
          title={verb}
          size="md"
          style={styles.btn}
          onPress={() => {
            const r = applyCoachAction(messageId, a);
            if (r.ok) haptic.success();
            else haptic.warning();
            toast(r.message);
          }}
        />
      </View>
      {replace ? (
        <Pressable accessibilityRole="button" hitSlop={6} onPress={() => declineCoachAction(messageId, a, true)} style={{ alignSelf: 'center', minHeight: 32, justifyContent: 'center' }}>
          <T v="footnote">Больше не предлагать</T>
        </Pressable>
      ) : null}
    </View>
  );
}

function renderBold(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? (
      <T key={i} v="bodyStrong">
        {p.slice(2, -2)}
      </T>
    ) : (
      p
    ),
  );
}

function Typing() {
  return (
    <View style={{ marginTop: space.xs, gap: space.xxs }} accessibilityLiveRegion="polite" accessibilityLabel={`${BRAND} печатает`}>
      <View style={styles.src}>
        <Icon name="sparkles-outline" size={16} color={colors.textDim} />
        <T v="footnote">{BRAND} печатает…</T>
      </View>
      <TypingDots />
    </View>
  );
}

/** Три точки набора, как в мессенджере: по очереди «подпрыгивают» */
function TypingDots() {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <View style={styles.dots} testID="coach-typing">
      {[0, 1, 2].map((i) => {
        // Точка «подпрыгивает» в своём окне [a; a + 0,3]; последняя заканчивается на 0,74 — диапазон всегда возрастает
        const a = 0.001 + i * 0.22;
        const range = [0, a, a + 0.15, a + 0.3, 1];
        const op = v.interpolate({ inputRange: range, outputRange: [0.35, 0.35, 1, 0.35, 0.35], extrapolate: 'clamp' });
        const y = v.interpolate({ inputRange: range, outputRange: [0, 0, -3, 0, 0], extrapolate: 'clamp' });
        return <Animated.View key={i} style={[styles.dot, { opacity: op, transform: [{ translateY: y }] }]} />;
      })}
    </View>
  );
}

const styles = themed({
  composer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: space.xs, gap: space.xs, backgroundColor: colors.bg },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.xs, paddingHorizontal: space.md },
  input: { flex: 1, minWidth: 0, minHeight: 44, maxHeight: 120, borderRadius: 22, backgroundColor: colors.surface2, color: colors.text, fontSize: 16, paddingHorizontal: space.md, paddingTop: 11, paddingBottom: 11 },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  mine: { maxWidth: '85%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.lg, borderBottomRightRadius: radius.xs, backgroundColor: colors.surface3 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md, gap: space.xs },
  safety: { borderWidth: 1, borderColor: colors.dangerLine },
  src: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sources: { paddingHorizontal: space.sm, paddingVertical: space.xxs, borderRadius: radius.md, backgroundColor: colors.surface, gap: 2 },
  btns: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  btn: { flexGrow: 1, flexBasis: 130 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 22, marginTop: space.xxs, paddingHorizontal: 2 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.textDim },
});
