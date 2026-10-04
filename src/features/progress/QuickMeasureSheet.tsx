import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Sheet } from '@/components/Sheet';
import { Button, Chip, T } from '@/components/ui';
import { NumberStepper, Toggle } from '@/components/inputs';
import { toast } from '@/components/Dialog';
import { space } from '@/theme';
import { useBody } from '@/stores/body';
import { useProfile } from '@/stores/profile';
import { haptic } from '@/services/haptics';
import { METRIC_META } from './metrics';
import type { BodyMetric, ISODate } from '@/types';
import { afterModalClose } from '@/components/modalGate';

type Kind = BodyMetric['kind'];
const EXTRA: Kind[] = ['chest', 'arm', 'thigh', 'hips', 'bodyfat'];

/**
 * «+ Замеры» в один тап: вес и талия сразу, остальные обхваты — по выбору.
 * % жира — только если человек действительно его измерил (RYNJI его не оценивает).
 */
export function QuickMeasureSheet({ visible, onClose, date }: { visible: boolean; onClose: () => void; date: ISODate }) {
  const weights = useBody((s) => s.weights);
  const metrics = useBody((s) => s.metrics);
  const lastOf = (k: Kind) => [...metrics].reverse().find((m) => m.kind === k)?.value;
  const lastKg = weights[weights.length - 1]?.kg ?? useProfile.getState().profile?.weightKg ?? 75;
  const [kg, setKg] = useState(lastKg);
  const [logKg, setLogKg] = useState(true);
  const [vals, setVals] = useState<Partial<Record<Kind, number>>>({});
  const [on, setOn] = useState<Kind[]>(['waist']);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setKg(weights.find((w) => w.date === date)?.kg ?? lastKg);
      setLogKg(true);
      setOn(['waist']);
      setVals({});
    }
  }
  const val = (k: Kind) => vals[k] ?? lastOf(k) ?? METRIC_META[k].def;

  const save = () => {
    const body = useBody.getState();
    let n = 0;
    if (logKg) {
      body.addWeight(date, Math.round(kg * 10) / 10);
      n++;
    }
    for (const k of on) {
      body.addMetric({ date, kind: k, value: Math.round(val(k) * 10) / 10 });
      n++;
    }
    haptic.success();
    toast(n ? `Записано: ${n}` : 'Ничего не выбрано', n ? 'checkmark-circle' : 'alert-circle');
    if (n) onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Замеры" subtitle="Утром, натощак — так тренд точнее" footer={<Button title="Сохранить" icon="checkmark" size="lg" onPress={save} />}>
      <View style={{ gap: space.md }}>
        <Toggle value={logKg} onChange={setLogKg} label="Вес" sub="Решения принимаются по среднему за неделю, а не по одному взвешиванию" />
        {logKg ? <NumberStepper value={kg} onChange={setKg} step={0.1} decimals={1} min={30} max={300} unit="кг" /> : null}
        {on.map((k) => (
          <View key={k} style={{ gap: 4 }}>
            <T v="caption">
              {METRIC_META[k].label} · {METRIC_META[k].hint}
            </T>
            <NumberStepper value={val(k)} onChange={(v) => setVals((x) => ({ ...x, [k]: v }))} step={METRIC_META[k].step} decimals={1} min={METRIC_META[k].min} max={METRIC_META[k].max} unit={METRIC_META[k].unit} />
          </View>
        ))}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(['waist', ...EXTRA] as Kind[]).map((k) => (
            <Chip key={k} label={METRIC_META[k].label} active={on.includes(k)} onPress={() => setOn((x) => (x.includes(k) ? x.filter((y) => y !== k) : [...x, k]))} />
          ))}
        </View>
        <Button
          title="Все замеры и фото"
          variant="ghost"
          size="sm"
          onPress={() => {
            onClose();
            afterModalClose(() => router.push('/measurements'));
          }}
        />
      </View>
    </Sheet>
  );
}
