import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Animated, AppState, Linking, Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, space, themed } from '@/theme';
import { Button, EmptyState, Icon, IconButton, T } from '@/components/ui';
import { useNutrition } from '@/stores/nutrition';
import { FoodApiError, foodErrorText, lookupBarcode } from '@/services/foodApi';
import { haptic } from '@/services/haptics';
import { barcodeCandidates, cameraGate, pickScanLens, ScanGate, scanZoom } from '@/features/food/scanner';
import { BRAND } from '@/config/brand';

type Phase = { kind: 'scan' } | { kind: 'loading'; code: string } | { kind: 'not_found'; code: string; text: string; name?: string } | { kind: 'error'; code: string; text: string };

/**
 * Сканер штрихкодов как в системной Камере iPhone:
 *  • виртуальная камера Triple/Dual Wide (макро-фокус вблизи) + непрерывный автофокус;
 *  • тап по экрану — повторная фокусировка (one-shot autofocus → снова continuous);
 *  • синхронный «замок»: один код = один поиск, повторные кадры игнорируются до «Сканировать ещё»;
 *  • камера останавливается, когда приложение в фоне или экран не активен.
 */
export default function Scan() {
  const { date, meal } = useLocalSearchParams<{ date?: string; meal?: string }>();
  const insets = useSafeAreaInsets();
  const [perm, request] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>({ kind: 'scan' });
  const [torch, setTorch] = useState(false);
  const [lens, setLens] = useState<string | undefined>();
  const [focusPulse, setFocusPulse] = useState<'off' | 'on'>('off');
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [screenFocused, setScreenFocused] = useState(true);
  const [gate] = useState(() => new ScanGate());
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAppActive(s === 'active'));
    return () => sub.remove();
  }, []);
  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      return () => setScreenFocused(false);
    }, []),
  );

  const refocus = () => {
    // 'on' = одиночная фокусировка (AVCaptureDevice .autoFocus), затем возвращаем continuous
    setFocusPulse('on');
    pulse.setValue(0);
    Animated.sequence([Animated.timing(pulse, { toValue: 1, duration: 160, useNativeDriver: true }), Animated.timing(pulse, { toValue: 0, duration: 420, delay: 200, useNativeDriver: true })]).start();
    setTimeout(() => setFocusPulse('off'), 700);
  };

  const lookup = async (code: string) => {
    setPhase({ kind: 'loading', code });
    // Уже сканировали или создавали — без сети (по всем записям кода: UPC-A ↔ EAN-13 и т. п.)
    const cands = barcodeCandidates(code);
    const cached = Object.values(useNutrition.getState().products).find((p) => !!p.barcode && cands.includes(p.barcode));
    try {
      const p = cached ?? (await lookupBarcode(code));
      useNutrition.getState().cacheProduct(p);
      // Сразу к выбору порции найденного продукта (без клавиатуры поиска), в тот же приём пищи
      router.replace({ pathname: '/food/add', params: { productId: p.id, date: date ?? '', meal: meal ?? '' } });
    } catch (e) {
      const notFound = e instanceof FoodApiError && e.kind === 'not_found';
      haptic.warning();
      setPhase(notFound ? { kind: 'not_found', code, text: foodErrorText(e), name: e instanceof FoodApiError ? e.partial?.name : undefined } : { kind: 'error', code, text: foodErrorText(e) });
    }
  };

  const onScanned = (r: BarcodeScanningResult) => {
    const code = gate.accept(r.data, r.type);
    if (!code) return;
    haptic.success();
    void lookup(code);
  };

  const retry = () => {
    gate.retry();
    setPhase({ kind: 'scan' });
  };

  const g = cameraGate(perm);
  if (g === 'loading') return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (g !== 'ready') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 8, paddingHorizontal: space.lg }}>
        <IconButton name="chevron-back" label="Назад" onPress={() => router.back()} />
        <EmptyState
          icon="camera-outline"
          title="Нужен доступ к камере"
          text={g === 'settings' ? `Доступ к камере выключен. Включи его в Настройках iPhone → ${BRAND} → Камера. Камера используется только для чтения штрихкода.` : 'Камера используется только для чтения штрихкода — фото не сохраняются.'}
          action={g === 'ask' ? 'Разрешить камеру' : 'Открыть настройки'}
          onAction={() => (g === 'ask' ? request() : Linking.openSettings())}
        />
        <View style={{ gap: 10 }}>
          <Button title="Найти по названию" icon="search" variant="secondary" onPress={() => router.replace({ pathname: '/food/add', params: { date: date ?? '', meal: meal ?? '' } })} />
          <Button title="Ввести вручную" icon="create-outline" variant="ghost" onPress={() => router.replace({ pathname: '/food/add', params: { date: date ?? '', meal: meal ?? '', manual: '1' } })} />
        </View>
      </View>
    );
  }

  const cameraOn = appActive && screenFocused;
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Pressable style={StyleSheet.absoluteFill} onPress={refocus} accessibilityLabel="Нажми, чтобы сфокусироваться">
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          active={cameraOn}
          autofocus={focusPulse}
          enableTorch={torch && cameraOn}
          selectedLens={lens}
          zoom={scanZoom(lens)}
          onAvailableLensesChanged={(e) => {
            const best = pickScanLens(e.lenses);
            if (best && best !== lens) setLens(best);
          }}
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'itf14'] }}
          onBarcodeScanned={onScanned}
        />
      </Pressable>

      <View style={[styles.top, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        <IconButton name="chevron-back" label="Назад" onPress={() => router.back()} bg="rgba(0,0,0,0.5)" color="#fff" />
        <T v="h3" color="#fff" style={{ flex: 1, textAlign: 'center', marginRight: 44 }}>
          Сканировать продукт
        </T>
      </View>

      {/* Рамка с затемнением вокруг */}
      <View style={styles.frameWrap} pointerEvents="none">
        <View style={[styles.frame, phase.kind === 'loading' && { borderColor: '#fff' }]}>
          {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
            <View key={c} style={[styles.corner, styles[c]]} />
          ))}
          <Animated.View style={[styles.focus, { opacity: pulse, transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1.25, 1] }) }] }]} />
        </View>
        <T v="body" color="#fff" style={{ marginTop: 18, textAlign: 'center', fontWeight: '700' }}>
          {phase.kind === 'scan' ? 'Наведи штрихкод в рамку' : phase.kind === 'loading' ? 'Ищу продукт…' : ''}
        </T>
        {phase.kind === 'scan' ? (
          <T v="small" color="rgba(255,255,255,0.7)" style={{ marginTop: 4, textAlign: 'center' }}>
            Нечётко — коснись экрана, чтобы навести фокус
          </T>
        ) : null}
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 20 }]}>
        {phase.kind === 'loading' ? (
          <View style={styles.card}>
            <ActivityIndicator color={colors.accent} />
            <View style={{ flex: 1 }}>
              <T v="h3">Ищу продукт…</T>
              <T v="small">Штрихкод {phase.code}</T>
            </View>
          </View>
        ) : null}
        {phase.kind === 'not_found' || phase.kind === 'error' ? (
          // Не нашли — одно понятное главное действие и запасные варианты строками
          <View style={[styles.card, { flexDirection: 'column', alignItems: 'stretch', gap: 12 }]} testID="scan-fallback">
            <View style={{ gap: 2 }}>
              <T v="h3">{phase.kind === 'error' ? 'Не удалось проверить код' : phase.name ? phase.name : 'Продукт не найден'}</T>
              <T v="small">
                {phase.kind === 'not_found' && phase.name ? 'Есть в базе, но без КБЖУ — добавь с этикетки за минуту' : phase.text} · {phase.code}
              </T>
            </View>
            {phase.kind === 'error' ? (
              <Button title="Повторить поиск" icon="refresh" live onPress={() => void lookup(phase.code)} />
            ) : (
              <Button
                title={phase.name ? 'Добавить с этикетки' : 'Создать продукт'}
                icon="add-circle-outline"
                live
                onPress={() => router.replace({ pathname: '/food/add', params: { date: date ?? '', meal: meal ?? '', manual: '1', barcode: phase.code, name: phase.kind === 'not_found' ? (phase.name ?? '') : '' } })}
              />
            )}
            <View style={styles.links}>
              <FallbackLink icon="search" label="Найти по названию" onPress={() => router.replace({ pathname: '/food/add', params: { date: date ?? '', meal: meal ?? '' } })} />
              <FallbackLink icon="keypad-outline" label="Ввести код" onPress={() => router.replace({ pathname: '/food/add', params: { date: date ?? '', meal: meal ?? '', enterBarcode: '1' } })} />
              <FallbackLink icon="scan-outline" label="Ещё раз" onPress={retry} />
            </View>
          </View>
        ) : null}
        {phase.kind === 'scan' ? (
          <Pressable accessibilityRole="button" accessibilityLabel={torch ? 'Выключить фонарик' : 'Включить фонарик'} onPress={() => { haptic.tap(); setTorch((t) => !t); }} style={[styles.torch, torch && { backgroundColor: '#fff' }]}>
            <Icon name={torch ? 'flashlight' : 'flashlight-outline'} size={22} color={torch ? '#000' : '#fff'} />
            <T v="body" color={torch ? '#000' : '#fff'} style={{ fontWeight: '700' }}>
              {torch ? 'Выключить фонарик' : 'Включить фонарик'}
            </T>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function FallbackLink({ icon, label, onPress }: { icon: React.ComponentProps<typeof Icon>['name']; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => { haptic.tap(); onPress(); }} hitSlop={6} style={({ pressed }) => [styles.link, pressed && { opacity: 0.6 }]}>
      <Icon name={icon} size={18} color={colors.text} />
      <T v="small" color={colors.text} style={{ fontWeight: '600', fontSize: 12 }} numberOfLines={1}>
        {label}
      </T>
    </Pressable>
  );
}

const C = 26;
const styles = themed({
  top: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg },
  frameWrap: { position: 'absolute', left: 0, right: 0, top: '30%', alignItems: 'center' },
  frame: { width: '78%', height: 170, borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', boxShadow: '0px 0px 0px 2000px rgba(0,0,0,0.45)' },
  corner: { position: 'absolute', width: C, height: C, borderColor: colors.accent },
  tl: { left: -2, top: -2, borderLeftWidth: 4, borderTopWidth: 4, borderTopLeftRadius: radius.lg },
  tr: { right: -2, top: -2, borderRightWidth: 4, borderTopWidth: 4, borderTopRightRadius: radius.lg },
  bl: { left: -2, bottom: -2, borderLeftWidth: 4, borderBottomWidth: 4, borderBottomLeftRadius: radius.lg },
  br: { right: -2, bottom: -2, borderRightWidth: 4, borderBottomWidth: 4, borderBottomRightRadius: radius.lg },
  focus: { position: 'absolute', alignSelf: 'center', top: 45, width: 80, height: 80, borderRadius: 12, borderWidth: 2, borderColor: colors.accent },
  bottom: { position: 'absolute', left: space.lg, right: space.lg, bottom: 0, gap: 10, alignItems: 'stretch' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: space.lg, borderRadius: radius.xl, backgroundColor: colors.surface },
  links: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  link: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.surface2 },
  torch: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, height: 52, paddingHorizontal: 20, borderRadius: 26, backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
});
