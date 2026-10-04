import React, { useEffect, useRef, useState } from 'react';
import { FlatList, Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CoachAction, CoachMessage } from '@/types';
import { colors, radius, space, themed } from '@/theme';
import { Header } from '@/components/Screen';
import { Button, Chip, Icon, IconButton, T } from '@/components/ui';
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
      <View style={{ paddingHorizontal: space.lg }}>
        <Header
          title={`Тренер ${BRAND}`}
          subtitle={`Знает твои данные · помнит ${memoryCount} ${plural(memoryCount, 'факт', 'факта', 'фактов')} о тебе`}
          right={
            <IconButton
              name="ellipsis-horizontal"
              label="Меню чата"
              onPress={() =>
                confirm('Очистить переписку?', 'Долговременная память тренера сохранится — её можно посмотреть в профиле.', 'Очистить', () => useCoach.getState().clearChat(), true)
              }
            />
          }
        />
      </View>
      <View style={{ flex: 1 }}>
        <FlatList
          ref={list}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.lg, gap: 10, flexGrow: 1 }}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Intro />}
          renderItem={({ item }) => <Bubble m={item} />}
          ListFooterComponent={busy ? <Typing /> : null}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
        />
        <View style={[styles.composer, { paddingBottom: pad ? 8 : insets.bottom + 8 }]}>
          {!messages.length || !busy ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: space.lg }} keyboardShouldPersistTaps="handled">
              {QUICK.map((q) => (
                <Chip key={q} label={q} onPress={() => send(q)} style={{ height: 34 }} />
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
    <View style={{ gap: 12, paddingVertical: space.xl }}>
      <View style={styles.introIcon}>
        <Icon name="sparkles" size={28} color={colors.onAccent} />
      </View>
      <T v="h2">Я знаю твой план, питание, тренировки и восстановление</T>
      <T v="bodyDim">Тренировка на сегодня с весами, программа на любую мышцу (соберу и запущу), техника и замены, подготовка к соревнованиям, питание и диетология, разбор анализов (напиши «ТТГ 5,2, ферритин 18»), гормоны, травмы и риски препаратов. Помню, что ты рассказываешь о себе, и сам слежу за прогрессом, питанием и восстановлением. Работаю на устройстве; при интернете дополняю ответы свежими научными обзорами и показываю источники.</T>
      {todayInsight ? (
        <View style={styles.insightCard}>
          <T v="caption" color={colors.accent}>
            Совет дня
          </T>
          <T v="body" color={colors.text}>
            {todayInsight}
          </T>
        </View>
      ) : null}
      <T v="small" style={{ fontSize: 12 }}>
        {BRAND} — фитнес-помощник, не врач и не ставит диагнозов. При боли в груди, обмороке, сильной одышке или травме — сразу к врачу.
      </T>
    </View>
  );
}

function Bubble({ m }: { m: CoachMessage }) {
  const mine = m.role === 'user';
  return (
    <View style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
      <View style={[styles.bubble, mine ? styles.mine : styles.theirs, m.safety && { borderColor: colors.danger, backgroundColor: colors.dangerDim }]}>
        {!mine && (m.offline || m.safety) ? (
          <T v="caption" color={m.safety ? colors.danger : colors.warning} style={{ marginBottom: 4, fontSize: 10 }}>
            {m.safety ? 'Безопасность' : 'Сервер недоступен · ответ на устройстве'}
          </T>
        ) : null}
        <T v="body" color={mine ? colors.onAccent : colors.text} style={{ fontSize: 15, lineHeight: 21 }} selectable>
          {renderBold(m.text, mine)}
        </T>
      </View>
      {!mine && m.sources?.length ? <Sources list={m.sources} /> : null}
      {m.actions?.length ? (
        <View style={{ gap: 6, marginTop: 6, alignSelf: 'stretch' }}>
          {m.actions.map((a) => (
            <View key={a.id} style={styles.action}>
              <View style={{ flex: 1 }}>
                <T v="body" style={{ fontWeight: '700', fontSize: 14 }}>
                  {a.label}
                </T>
                {a.params.reason ? (
                  <T v="small" style={{ fontSize: 12 }}>
                    {a.params.reason}
                  </T>
                ) : null}
              </View>
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
      <Pressable accessibilityRole="button" onPress={() => setOpen(!open)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} hitSlop={6}>
        <Icon name="library-outline" size={14} color={colors.accent} />
        <T v="small" color={colors.accent} style={{ fontWeight: '800', fontSize: 12, flex: 1 }}>
          Источники · {list.length}
        </T>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textDim} />
      </Pressable>
      {open
        ? list.map((s) => (
            <Pressable key={s.url} accessibilityRole="link" onPress={() => void Linking.openURL(s.url)} style={{ paddingVertical: 4 }}>
              <T v="small" color={colors.text} style={{ fontSize: 12 }} numberOfLines={3}>
                {s.title}
              </T>
              <T v="small" style={{ fontSize: 11 }}>
                {s.org}
                {s.year ? ` · ${s.year}` : ''} · открыть
              </T>
            </Pressable>
          ))
        : null}
    </View>
  );
}

/** AI предлагает → приложение проверило → пользователь решает */
function ActionState({ messageId, a }: { messageId: string; a: CoachAction }) {
  if (a.applied || a.declined || a.invalid) {
    const label = a.applied ? (a.type.startsWith('start') ? 'Начато' : a.type === 'create_exercise' || a.type === 'add_to_plan' ? 'Готово' : 'Применено') : a.declined ? 'Не сейчас' : `Отклонено ${BRAND}: ${a.invalid}`;
    const color = a.applied ? colors.accent : a.invalid ? colors.warning : colors.textDim;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1, maxWidth: '45%' }}>
        <Icon name={a.applied ? 'checkmark-circle' : a.invalid ? 'alert-circle' : 'close-circle'} size={16} color={color} />
        <T v="small" color={color} style={{ fontWeight: '700', fontSize: 12 }}>
          {label}
        </T>
      </View>
    );
  }
  const replace = a.type === 'replace_exercise';
  const verb = a.type === 'start_today' || a.type === 'start_custom_workout' ? 'Начать' : a.type === 'create_exercise' ? 'Создать' : a.type === 'generate_workout' ? 'Собрать' : a.type === 'add_to_plan' ? 'Добавить' : 'Применить';
  const optional = verb !== 'Применить';
  return (
    <View style={{ gap: 6, alignItems: 'flex-end' }}>
      <Button
        title={verb}
        size="sm"
        onPress={() => {
          const r = applyCoachAction(messageId, a);
          if (r.ok) haptic.success();
          else haptic.warning();
          toast(r.message);
        }}
      />
      <Pressable accessibilityRole="button" hitSlop={6} onPress={() => declineCoachAction(messageId, a)}>
        <T v="small" color={colors.textDim} style={{ fontSize: 12, fontWeight: '600' }}>
          {optional ? 'Не сейчас' : 'Не менять'}
        </T>
      </Pressable>
      {replace ? (
        <Pressable accessibilityRole="button" hitSlop={6} onPress={() => declineCoachAction(messageId, a, true)}>
          <T v="small" color={colors.textDim} style={{ fontSize: 11 }}>
            Больше не предлагать
          </T>
        </Pressable>
      ) : null}
    </View>
  );
}

function renderBold(text: string, mine: boolean) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? (
      <T key={i} v="body" color={mine ? colors.onAccent : colors.accent} style={{ fontWeight: '800', fontSize: 15 }}>
        {p.slice(2, -2)}
      </T>
    ) : (
      p
    ),
  );
}

function Typing() {
  return (
    <View style={[styles.bubble, styles.theirs, { flexDirection: 'row', gap: 8, alignItems: 'center', alignSelf: 'flex-start', marginTop: 10 }]}>
      <Icon name="sparkles" size={14} color={colors.accent} />
      <T v="small">Тренер анализирует твои данные…</T>
    </View>
  );
}

const styles = themed({
  composer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 8, gap: 8, backgroundColor: colors.bg },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: space.lg },
  input: { flex: 1, minWidth: 0, minHeight: 46, maxHeight: 120, borderRadius: 23, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, color: colors.text, fontSize: 16, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 },
  send: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  bubble: { maxWidth: '88%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, borderWidth: 1 },
  mine: { backgroundColor: colors.accent, borderColor: colors.accent, borderBottomRightRadius: 6 },
  theirs: { backgroundColor: colors.surface, borderColor: colors.border, borderBottomLeftRadius: 6 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.accentLine },
  insightCard: { padding: 12, borderRadius: radius.md, backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accentLine, gap: 4 },
  sources: { maxWidth: '88%', marginTop: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 2 },
  introIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
});
