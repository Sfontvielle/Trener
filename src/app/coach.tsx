import React, { useEffect, useRef, useState } from 'react';
import { FlatList, Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
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
import { plural, toISODate } from '@/utils/date';
import { BRAND } from '@/config/brand';

const QUICK = ['Что мне сегодня делать?', 'Упражнения на верх груди', 'Что мне поесть сейчас?', 'Какие анализы сдать?', 'Почему вес стоит?', 'Разбери мою неделю', 'Болит плечо при жиме', 'Что ты обо мне помнишь?'];

export default function Coach() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ q?: string }>();
  const messages = useCoach((s) => s.messages);
  const memoryCount = useCoach((s) => s.memory.length);
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
          subtitle={`Знает твои данные · помнит ${memoryCount} ${plural(memoryCount, 'факт', 'факта', 'фактов')}`}
          actions={[
            {
              icon: 'ellipsis-horizontal',
              label: 'Меню чата',
              onPress: () => confirm('Очистить переписку?', 'Долговременная память тренера сохранится — её можно посмотреть в профиле.', 'Очистить', () => useCoach.getState().clearChat(), true),
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
            <TextInput
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
  return (
    <View style={{ gap: space.xs }}>
      <View style={m.safety ? [styles.card, styles.safety] : undefined}>
        <View style={styles.src}>
          <Icon name={m.safety ? 'alert-circle-outline' : 'sparkles-outline'} size={16} color={m.safety ? colors.danger : colors.textDim} />
          <T v="footnote" color={m.safety ? colors.danger : m.offline ? colors.warning : colors.textDim}>
            {m.safety ? 'Безопасность' : m.offline ? `${BRAND} · сервер недоступен, ответ на устройстве` : BRAND}
          </T>
        </View>
        <T v="body" selectable style={{ marginTop: space.xxs }}>
          {renderBold(m.text)}
        </T>
      </View>
      {m.sources?.length ? <Sources list={m.sources} /> : null}
      {m.actions?.length ? (
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
    <View style={[styles.src, { marginTop: space.xs }]} accessibilityLiveRegion="polite">
      <Icon name="sparkles-outline" size={16} color={colors.textDim} />
      <T v="footnote">Тренер анализирует твои данные…</T>
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
});
