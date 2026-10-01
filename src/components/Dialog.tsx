import React, { useEffect, useState} from 'react';
import { Animated, Modal, Pressable, StyleSheet, View } from 'react-native';
import { create } from 'zustand';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, space, themed } from '@/theme';
import { Button, Icon, T, type IconName } from './ui';

/**
 * Кросс-платформенные подтверждения и тосты.
 * (Alert.alert в web-превью не показывает кнопки, поэтому свой диалог.)
 */
interface DialogButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}
interface DialogState {
  dialog: { title: string; message?: string; buttons: DialogButton[] } | null;
  toast: { text: string; icon?: IconName; id: number } | null;
  show: (title: string, message?: string, buttons?: DialogButton[]) => void;
  hide: () => void;
  showToast: (text: string, icon?: IconName) => void;
}

export const useDialog = create<DialogState>((set) => ({
  dialog: null,
  toast: null,
  show: (title, message, buttons = [{ text: 'OK' }]) => set({ dialog: { title, message, buttons } }),
  hide: () => set({ dialog: null }),
  showToast: (text, icon) => set({ toast: { text, icon, id: Date.now() } }),
}));

export function confirm(title: string, message: string, confirmText: string, onConfirm: () => void, destructive = false) {
  useDialog.getState().show(title, message, [
    { text: 'Отмена', style: 'cancel' },
    { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}

export function toast(text: string, icon?: IconName) {
  useDialog.getState().showToast(text, icon);
}

export function DialogHost() {
  const dialog = useDialog((s) => s.dialog);
  const hide = useDialog((s) => s.hide);
  return (
    <>
      <Modal visible={!!dialog} transparent animationType="fade" onRequestClose={hide}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={hide} />
          {dialog ? (
            <View style={styles.box} accessibilityRole="alert">
              <T v="h3" style={{ textAlign: 'center' }}>
                {dialog.title}
              </T>
              {dialog.message ? (
                <T v="small" style={{ textAlign: 'center', marginTop: 6 }}>
                  {dialog.message}
                </T>
              ) : null}
              <View style={{ flexDirection: dialog.buttons.length > 2 ? 'column' : 'row', gap: 10, marginTop: space.lg }}>
                {dialog.buttons.map((b, i) => (
                  <Button
                    key={i}
                    title={b.text}
                    variant={b.style === 'destructive' ? 'danger' : b.style === 'cancel' ? 'secondary' : 'primary'}
                    style={{ flex: dialog.buttons.length > 2 ? undefined : 1 }}
                    onPress={() => {
                      hide();
                      b.onPress?.();
                    }}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
      <ToastView />
    </>
  );
}

function ToastView() {
  const t = useDialog((s) => s.toast);
  const insets = useSafeAreaInsets();
  const a = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    if (!t) return;
    a.setValue(0);
    Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(a, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start();
  }, [t, a]);
  if (!t) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.toast, { top: insets.top + 8, opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}
    >
      <Icon name={t.icon ?? 'checkmark-circle'} size={18} color={colors.accent} />
      <T v="small" color={colors.text} style={{ flexShrink: 1, fontWeight: '600' }}>
        {t.text}
      </T>
    </Animated.View>
  );
}

const styles = themed({
  backdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  box: { width: '100%', maxWidth: 340, backgroundColor: colors.surface2, borderRadius: radius.lg, padding: space.xl, borderWidth: 1, borderColor: colors.border },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: 420,
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface3,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    zIndex: 1000,
  },
});
