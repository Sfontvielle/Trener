import React from 'react';
import { View } from 'react-native';
import { Sheet } from '@/components/Sheet';
import { Chip, T } from '@/components/ui';
import { space } from '@/theme';
import { useProfile } from '@/stores/profile';
import { DEFAULT_GYM } from './equipment';
import type { GymSetup } from '@/types';

const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25, 0.5];
const fmt = (x: number) => String(x).replace('.', ',');

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <T v="caption">{label}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>
    </View>
  );
}

/** Оборудование зала: от него зависят рекомендуемые веса, шаг прогрессии, разминка и раскладка блинов */
export function GymSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const gym = useProfile((s) => s.settings.gym) ?? DEFAULT_GYM;
  const set = (patch: Partial<GymSetup>) => useProfile.getState().updateSettings({ gym: { ...gym, ...patch } });
  return (
    <Sheet visible={visible} onClose={onClose} title="Оборудование зала" subtitle="RYNJI рекомендует только веса, которые реально поставить">
      <View style={{ gap: space.lg }}>
        <Row label="Гриф штанги">
          {[20, 15, 10].map((v) => (
            <Chip key={v} label={`${v} кг`} active={gym.barKg === v} onPress={() => set({ barKg: v })} />
          ))}
        </Row>
        <Row label="EZ-гриф">
          {[10, 8, 7, 5].map((v) => (
            <Chip key={v} label={`${v} кг`} active={gym.ezBarKg === v} onPress={() => set({ ezBarKg: v })} />
          ))}
        </Row>
        <Row label="Диски (есть пара каждого)">
          {PLATES.map((p) => {
            const on = gym.plates.includes(p);
            return <Chip key={p} label={`${fmt(p)} кг`} active={on} onPress={() => set({ plates: on ? (gym.plates.length > 1 ? gym.plates.filter((x) => x !== p) : gym.plates) : [...gym.plates, p].sort((a, b) => b - a) })} />;
          })}
        </Row>
        <Row label="Шаг гантелей">
          {[1, 2, 2.5, 5].map((v) => (
            <Chip key={v} label={`${fmt(v)} кг`} active={gym.dumbbellStep === v} onPress={() => set({ dumbbellStep: v })} />
          ))}
        </Row>
        <Row label="Шаг тренажёров и блоков">
          {[2.5, 5, 7, 10].map((v) => (
            <Chip key={v} label={`${fmt(v)} кг`} active={gym.machineStep === v} onPress={() => set({ machineStep: v })} />
          ))}
        </Row>
        <T v="small" style={{ fontSize: 12 }}>
          Если реальный шаг другой, RYNJI сам подстроится по весам, которые ты записываешь.
        </T>
      </View>
    </Sheet>
  );
}
