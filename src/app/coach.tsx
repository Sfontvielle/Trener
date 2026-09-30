import React, { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CoachMessage } from '@/types';
import { colors, radius, space } from '@/theme';
import { Header } from '@/components/Screen';
import { Button, Chip, Icon, IconButton, T } from '@/components/ui';
import { confirm, toast } from '@/components/Dialog';
import { useCoach } from '@/stores/coach';
import { applyCoachAction, sendCoachMessage } from '@/features/coach/service';
import { coachBaseUrl } from '@/services/coachApi';
import { haptic } from '@/services/haptics';

const QUICK = ['Что мне поесть сейчас?', 'Как сегодня тренироваться?', 'Разбери мою неделю', 'Почему вес стоит?', 'Чем заменить упражнение, если болит плечо?'];

export default function Coach() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ q?: string }>();
  const messages = useCoach((s) => s.messages);
  const memoryCount = useCoach((s) => s.memory.length);
  const [text, setText] = useState(params.q ? String(params.q) : '');
  const [busy, setBusy] = useState(false);
  const list = useRef<FlatList<CoachMessage>>(null);
  const configured = !!coachBaseUrl();

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
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + space.sm }}>
      <View style={{ paddingHorizontal: space.lg }}>
        <Header
          title="FORM Coach"
          subtitle={configured ? `AI · помнит ${memoryCount} ${memoryCount === 1 ? 'факт' : 'фактов'} о тебе` : 'Офлайн-режим · AI-сервер не подключён'}
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
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        <FlatList
          ref={list}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.lg, gap: 10, flexGrow: 1 }}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Intro configured={configured} />}
          renderItem={({ item }) => <Bubble m={item} />}
          ListFooterComponent={busy ? <Typing /> : null}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
        />
        <View style={[styles.composer, { paddingBottom: insets.bottom + 8 }]}>
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
      </KeyboardAvoidingView>
    </View>
  );
}

function Intro({ configured }: { configured: boolean }) {
  return (
    <View style={{ gap: 12, paddingVertical: space.xl }}>
      <View style={styles.introIcon}>
        <Icon name="sparkles" size={28} color={colors.onAccent} />
      </View>
      <T v="h2">Я знаю твой план, питание, тренировки и восстановление</T>
      <T v="bodyDim">Спрашивай что угодно: что съесть, как изменить тренировку под самочувствие, почему стоит вес. Если нужно — предложу изменение плана, и ты применишь его одной кнопкой.</T>
      {!configured ? (
        <View style={{ padding: 12, borderRadius: radius.md, backgroundColor: colors.warningDim, gap: 8 }}>
          <T v="small" color={colors.text}>
            AI-сервер не подключён — отвечаю по расчётам FORM (без AI). Подключение: Профиль → AI Coach.
          </T>
          <Button title="Настроить" size="sm" variant="secondary" onPress={() => router.push('/profile')} />
        </View>
      ) : null}
      <T v="small" style={{ fontSize: 12 }}>
        FORM — фитнес-помощник, не врач. При боли в груди, обмороке, сильной одышке или травме — сразу к врачу.
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
            {m.safety ? 'Безопасность' : 'Без AI · расчёт FORM'}
          </T>
        ) : null}
        <T v="body" color={mine ? colors.onAccent : colors.text} style={{ fontSize: 15, lineHeight: 21 }} selectable>
          {renderBold(m.text, mine)}
        </T>
      </View>
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
              {a.applied ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Icon name="checkmark-circle" size={18} color={colors.accent} />
                  <T v="small" color={colors.accent} style={{ fontWeight: '700' }}>
                    Применено
                  </T>
                </View>
              ) : (
                <Button
                  title="Применить"
                  size="sm"
                  onPress={() => {
                    applyCoachAction(m.id, a);
                    haptic.success();
                    toast('План изменён');
                  }}
                />
              )}
            </View>
          ))}
        </View>
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

const styles = StyleSheet.create({
  composer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 8, gap: 8, backgroundColor: colors.bg },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: space.lg },
  input: { flex: 1, minWidth: 0, minHeight: 46, maxHeight: 120, borderRadius: 23, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, color: colors.text, fontSize: 16, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 },
  send: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  bubble: { maxWidth: '88%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, borderWidth: 1 },
  mine: { backgroundColor: colors.accent, borderColor: colors.accent, borderBottomRightRadius: 6 },
  theirs: { backgroundColor: colors.surface, borderColor: colors.border, borderBottomLeftRadius: 6 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.accentLine },
  introIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
});
