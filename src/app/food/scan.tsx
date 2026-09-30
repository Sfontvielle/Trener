import React, { useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, space } from '@/theme';
import { Banner, Button, EmptyState, IconButton, T } from '@/components/ui';
import { useNutrition } from '@/stores/nutrition';
import { foodErrorText, lookupBarcode } from '@/services/foodApi';
import { haptic } from '@/services/haptics';

/** Сканер штрихкодов (камера iPhone). Найденный продукт кэшируется и открывается окно порции. */
export default function Scan() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const insets = useSafeAreaInsets();
  const [perm, request] = useCameraPermissions();
  const [status, setStatus] = useState<'scan' | 'loading' | 'error'>('scan');
  const [error, setError] = useState('');
  const lock = useRef(false);

  const onScan = async (code: string) => {
    if (lock.current) return;
    lock.current = true;
    haptic.success();
    setStatus('loading');
    try {
      const p = await lookupBarcode(code);
      useNutrition.getState().cacheProduct(p);
      router.replace({ pathname: '/food/add', params: { productId: p.id, date: date ?? '' } });
    } catch (e) {
      setError(`${foodErrorText(e)} (код ${code})`);
      setStatus('error');
    }
  };

  if (!perm) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (!perm.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 20, padding: space.lg }}>
        <IconButton name="close" label="Закрыть" onPress={() => router.back()} />
        <EmptyState icon="camera-outline" title="Нужен доступ к камере" text="Камера используется только для чтения штрихкода — фото не сохраняются." action={perm.canAskAgain ? 'Разрешить' : 'Открыть настройки'} onAction={() => (perm.canAskAgain ? request() : Linking.openSettings())} />
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
        onBarcodeScanned={status === 'scan' ? (r) => onScan(r.data) : undefined}
      />
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <IconButton name="close" label="Закрыть" onPress={() => router.back()} bg="rgba(0,0,0,0.5)" />
        <T v="h3" style={{ flex: 1, textAlign: 'center', marginRight: 44 }}>
          Наведи на штрихкод
        </T>
      </View>
      <View style={styles.frame} pointerEvents="none" />
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 20 }]}>
        {status === 'loading' ? <Banner tone="accent" icon="search" text="Ищу продукт в базе…" /> : null}
        {status === 'error' ? (
          <View style={{ gap: 10 }}>
            <Banner tone="warning" text={error} />
            <Button
              title="Сканировать ещё раз"
              onPress={() => {
                lock.current = false;
                setStatus('scan');
              }}
            />
            <Button title="Ввести вручную" variant="secondary" onPress={() => router.back()} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg },
  frame: { position: 'absolute', left: '12%', right: '12%', top: '36%', height: 170, borderWidth: 3, borderColor: colors.accent, borderRadius: radius.lg },
  bottom: { position: 'absolute', left: space.lg, right: space.lg, bottom: 0, gap: 10 },
});
