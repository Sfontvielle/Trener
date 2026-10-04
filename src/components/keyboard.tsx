import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, TextInput, type KeyboardEvent, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollView, type View } from 'react-native';

/**
 * Поле ввода всегда над клавиатурой — без нативных зависимостей (работает в Expo Go, iOS и Android edge-to-edge).
 * 1) Высота перекрытия считается от реального низа контейнера (не от экрана): если система сама
 *    ужала окно, отступ не удваивается.
 * 2) Под содержимым появляется отступ на высоту клавиатуры — можно докрутить до любого поля.
 * 3) Сфокусированное поле измеряется и плавно докручивается так, чтобы над клавиатурой было видно и поле, и текст.
 * Поля (Field, NumberStepper, TagInput) при фокусе сами просят докрутку через контекст — это покрывает
 * переход между полями, когда клавиатура уже открыта и событий клавиатуры нет.
 */
const KeyboardScrollContext = createContext<(() => void) | null>(null);

export function useEnsureVisible(): () => void {
  const ensure = useContext(KeyboardScrollContext);
  return useCallback(() => ensure?.(), [ensure]);
}

export function KeyboardScrollProvider({ ensure, children }: { ensure: () => void; children: React.ReactNode }) {
  return <KeyboardScrollContext.Provider value={ensure}>{children}</KeyboardScrollContext.Provider>;
}

const SHOW = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
const HIDE = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
const MARGIN = 28;

type Focusable = { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void } | null;

function focusedInput(): Focusable {
  const st = (TextInput as unknown as { State?: { currentlyFocusedInput?: () => Focusable } }).State;
  return st?.currentlyFocusedInput?.() ?? null;
}

export function useKeyboardAwareScroll() {
  const scrollRef = useRef<ScrollView>(null);
  const rootRef = useRef<View>(null);
  const offset = useRef(0);
  const kbTop = useRef<number | null>(null);
  const [pad, setPad] = useState(0);

  const ensure = useCallback(() => {
    // Ждём, пока раскладка учтёт отступ и поле получит фокус
    setTimeout(() => {
      const top = kbTop.current;
      const input = focusedInput();
      if (top === null || !input?.measureInWindow || !scrollRef.current) return;
      input.measureInWindow((_x, y, _w, h) => {
        const overflow = y + h + MARGIN - top;
        if (overflow > 0) scrollRef.current?.scrollTo({ y: offset.current + overflow, animated: true });
        else if (y < 80) scrollRef.current?.scrollTo({ y: Math.max(0, offset.current + y - 100), animated: true });
      });
    }, Platform.OS === 'ios' ? 60 : 120);
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const onShow = (e: KeyboardEvent) => {
      kbTop.current = e.endCoordinates.screenY;
      const root = rootRef.current;
      const apply = (bottom: number) => setPad(Math.max(0, bottom - e.endCoordinates.screenY));
      if (root?.measureInWindow) root.measureInWindow((_x, y, _w, h) => apply(y + h));
      else apply(e.endCoordinates.screenY + e.endCoordinates.height);
      ensure();
    };
    const onHide = () => {
      kbTop.current = null;
      setPad(0);
    };
    const a = Keyboard.addListener(SHOW, onShow);
    const b = Keyboard.addListener(HIDE, onHide);
    return () => {
      a.remove();
      b.remove();
    };
  }, [ensure]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = e.nativeEvent.contentOffset.y;
  }, []);

  return { scrollRef, rootRef, pad, ensure, onScroll };
}
