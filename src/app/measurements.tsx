import React, { useMemo, useState } from 'react';
import { Image, Platform, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';
import type { BodyMetric } from '@/types';
import { colors, radius, space, themed } from '@/theme';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Chip, Divider, SectionTitle, T } from '@/components/ui';
import { NumberStepper } from '@/components/inputs';
import { confirm, toast } from '@/components/Dialog';
import { useBody, type ProgressPhoto } from '@/stores/body';
import { relativeDay, today } from '@/utils/date';
import { haptic } from '@/services/haptics';
import { METRIC_META } from '@/features/progress/metrics';

type Kind = BodyMetric['kind'];
const KINDS = Object.keys(METRIC_META) as Kind[];
const POSE: Record<ProgressPhoto['pose'], string> = { front: 'Спереди', side: 'Сбоку', back: 'Сзади' };

/** Сохраняем фото в папку приложения: системная галерея/кэш могут очиститься */
async function persistPhoto(uri: string): Promise<string> {
  if (Platform.OS === 'web') return uri;
  try {
    const dir = new Directory(Paths.document, 'progress');
    if (!dir.exists) dir.create();
    const src = new File(uri);
    const dst = new File(dir, `p_${Date.now()}.jpg`);
    await src.copy(dst);
    return dst.uri;
  } catch {
    return uri;
  }
}

export default function Measurements() {
  const metrics = useBody((s) => s.metrics);
  const photos = useBody((s) => s.photos);
  const last = useMemo(() => {
    const m = {} as Partial<Record<Kind, BodyMetric>>;
    for (const x of metrics) if (!m[x.kind] || m[x.kind]!.date <= x.date) m[x.kind] = x;
    return m;
  }, [metrics]);
  const [picked, setPicked] = useState<Kind[]>(() => (last.waist ? KINDS.filter((k) => last[k]) : ['waist']));
  const [vals, setVals] = useState<Record<Kind, number>>(() => Object.fromEntries(KINDS.map((k) => [k, last[k]?.value ?? METRIC_META[k].def])) as Record<Kind, number>);
  const [pose, setPose] = useState<ProgressPhoto['pose']>('front');
  const d = today();

  const save = () => {
    const add = useBody.getState().addMetric;
    picked.forEach((k) => add({ date: d, kind: k, value: Math.round(vals[k] * 10) / 10 }));
    haptic.success();
    toast('Замеры сохранены');
    if (router.canGoBack()) router.back();
    else router.replace('/progress');
  };

  const addPhoto = async (camera: boolean) => {
    try {
      const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return toast('Нет доступа — разреши в Настройках', 'alert-circle');
      const r = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.7 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.7 });
      if (r.canceled || !r.assets?.[0]) return;
      useBody.getState().addPhoto({ date: d, uri: await persistPhoto(r.assets[0].uri), pose });
      haptic.success();
      toast('Фото прогресса сохранено');
    } catch (e: any) {
      toast(e?.message ?? 'Не удалось добавить фото', 'alert-circle');
    }
  };

  const byDate = useMemo(() => {
    const g = new Map<string, BodyMetric[]>();
    for (const m of [...metrics].reverse()) g.set(m.date, [...(g.get(m.date) ?? []), m]);
    return [...g.entries()].slice(0, 20);
  }, [metrics]);

  return (
    <Screen keyboard>
      <Header title="Замеры и фото" subtitle="Раз в 1–2 недели, утром, в одно время" />
      <Card style={{ gap: 10 }}>
        <T v="caption">Что измеряем сегодня</T>
        <View style={styles.wrap}>
          {KINDS.map((k) => (
            <Chip key={k} label={METRIC_META[k].label} active={picked.includes(k)} onPress={() => setPicked(picked.includes(k) ? picked.filter((x) => x !== k) : [...picked, k])} />
          ))}
        </View>
        {picked.map((k) => (
          <View key={k} style={{ gap: 2 }}>
            <NumberStepper label={`${METRIC_META[k].label}${last[k] ? ` · было ${String(last[k]!.value).replace('.', ',')} (${relativeDay(last[k]!.date).toLowerCase()})` : ''}`} value={vals[k]} onChange={(v) => setVals({ ...vals, [k]: v })} step={METRIC_META[k].step} decimals={1} min={METRIC_META[k].min} max={METRIC_META[k].max} unit={METRIC_META[k].unit} />
            <T v="small" style={{ fontSize: 11 }}>
              {METRIC_META[k].hint}
            </T>
          </View>
        ))}
        <Button title="Сохранить замеры" icon="checkmark" size="lg" disabled={!picked.length} onPress={save} />
      </Card>

      <SectionTitle title="Фото прогресса" />
      <Card style={{ gap: 10 }}>
        <T v="small">Одинаковый свет, поза и время суток — так изменения видны честно. Фото хранятся только на этом устройстве.</T>
        <View style={styles.wrap}>
          {(Object.keys(POSE) as ProgressPhoto['pose'][]).map((p) => (
            <Chip key={p} label={POSE[p]} active={pose === p} onPress={() => setPose(p)} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {Platform.OS !== 'web' ? <Button title="Снять" icon="camera-outline" variant="secondary" style={{ flex: 1 }} onPress={() => addPhoto(true)} /> : null}
          <Button title="Из галереи" icon="images-outline" variant="secondary" style={{ flex: 1 }} onPress={() => addPhoto(false)} />
        </View>
        {photos.length ? (
          <View style={styles.photos}>
            {[...photos].reverse().slice(0, 12).map((ph) => (
              <Pressable key={ph.id} accessibilityRole="button" accessibilityLabel={`Фото ${relativeDay(ph.date)}, удерживай — удалить`} onLongPress={() => confirm('Удалить фото?', relativeDay(ph.date), 'Удалить', () => useBody.getState().removePhoto(ph.id), true)} style={styles.photo}>
                <Image source={{ uri: ph.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                <View style={styles.photoTag}>
                  <T v="small" color="#fff" style={{ fontSize: 10, fontWeight: '700' }}>
                    {relativeDay(ph.date)} · {POSE[ph.pose].toLowerCase()}
                  </T>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}
      </Card>

      {byDate.length ? (
        <>
          <SectionTitle title="История замеров" />
          <Card style={{ paddingVertical: 4 }}>
            {byDate.map(([date, list], i) => (
              <View key={date}>
                {i ? <Divider /> : null}
                <View style={{ paddingVertical: 10, gap: 4 }}>
                  <T v="body" style={{ fontWeight: '700' }}>
                    {relativeDay(date)}
                  </T>
                  <View style={styles.wrap}>
                    {list.map((m) => (
                      <Pressable key={m.id} accessibilityLabel={`Удалить замер ${METRIC_META[m.kind].label}`} onLongPress={() => confirm('Удалить замер?', `${METRIC_META[m.kind].label}: ${m.value}`, 'Удалить', () => useBody.getState().removeMetric(m.id), true)} style={styles.metric}>
                        <T v="small" color={colors.text} style={{ fontWeight: '700' }}>
                          {METRIC_META[m.kind].label} {String(m.value).replace('.', ',')} {METRIC_META[m.kind].unit}
                        </T>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>
            ))}
          </Card>
          <T v="small" style={{ fontSize: 11, marginTop: 6, textAlign: 'center' }}>
            Удерживай замер или фото, чтобы удалить
          </T>
        </>
      ) : null}
      <View style={{ height: space.lg }} />
    </Screen>
  );
}

const styles = themed({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  photo: { width: '32%', aspectRatio: 0.75, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surface2 },
  photoTag: { position: 'absolute', left: 4, bottom: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.55)' },
  metric: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surface2 },
});
