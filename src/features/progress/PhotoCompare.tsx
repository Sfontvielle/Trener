import React, { useMemo, useState } from 'react';
import { Image, View } from 'react-native';
import { colors, radius } from '@/theme';
import { Chip, T } from '@/components/ui';
import { formatDayShort } from '@/utils/date';
import type { ProgressPhoto } from '@/stores/body';
import { photoPair } from './photoCompare';

const POSE: Record<ProgressPhoto['pose'], string> = { front: 'Спереди', side: 'Сбоку', back: 'Сзади' };

/** «Месяц назад / сейчас» — два фото одного ракурса в одном кадре */
export function PhotoCompare({ photos }: { photos: ProgressPhoto[] }) {
  const [pose, setPose] = useState<ProgressPhoto['pose'] | undefined>(undefined);
  const pair = useMemo(() => photoPair(photos, pose), [photos, pose]);
  const available = (['front', 'side', 'back'] as const).filter((p) => photos.filter((x) => x.pose === p).length >= 2);
  if (!available.length) return null;
  const cur = pair ?? photoPair(photos);
  if (!cur) return null;
  const label = cur.days >= 25 && cur.days <= 40 ? 'месяц назад' : `${cur.days} дн. назад`;
  return (
    <View style={{ gap: 8 }} testID="photo-compare">
      {available.length > 1 ? (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {available.map((p) => (
            <Chip key={p} label={POSE[p]} active={cur.pose === p} onPress={() => setPose(p)} />
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface2, aspectRatio: 1.5 }} accessible accessibilityRole="image" accessibilityLabel={`Сравнение фото: ${label}, ${formatDayShort(cur.before.date)}, и сейчас, ${formatDayShort(cur.after.date)}`}>
        {[cur.before, cur.after].map((ph, i) => (
          <View key={ph.id} style={{ flex: 1, borderLeftWidth: i ? 2 : 0, borderColor: colors.bg }}>
            <Image source={{ uri: ph.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            <View style={{ position: 'absolute', left: 6, bottom: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.6)' }}>
              <T v="small" color="#fff" style={{ fontSize: 11, fontWeight: '700' }}>
                {i ? 'сейчас' : label} · {formatDayShort(ph.date)}
              </T>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
