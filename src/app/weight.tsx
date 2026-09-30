import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { colors, space } from '@/theme';
import { Header, Screen } from '@/components/Screen';
import { Banner, Button, Card, Divider, Icon, T } from '@/components/ui';
import { NumberStepper } from '@/components/inputs';
import { confirm, toast } from '@/components/Dialog';
import { useBody } from '@/stores/body';
import { useProfile } from '@/stores/profile';
import { latestTrendWeight } from '@/features/progress/weightTrend';
import { relativeDay, today } from '@/utils/date';
import { fmtWeight } from '@/utils/format';
import { haptic } from '@/services/haptics';

export default function WeightScreen() {
  const weights = useBody((s) => s.weights);
  const add = useBody((s) => s.addWeight);
  const remove = useBody((s) => s.removeWeight);
  const profileW = useProfile((s) => s.profile?.weightKg ?? 75);
  const last = weights[weights.length - 1];
  const [kg, setKg] = useState(last?.kg ?? profileW);
  const trend = useMemo(() => latestTrendWeight(weights), [weights]);
  const todayEntry = weights.find((w) => w.date === today());

  return (
    <Screen keyboard>
      <Header title="Вес" subtitle="Утром, натощак, после туалета" />
      <Card>
        <NumberStepper value={kg} onChange={setKg} step={0.1} decimals={1} min={30} max={300} unit="кг" />
        <Button
          title={todayEntry ? 'Обновить сегодняшний вес' : 'Записать'}
          icon="checkmark"
          size="lg"
          style={{ marginTop: space.md }}
          onPress={() => {
            add(today(), Math.round(kg * 10) / 10);
            haptic.success();
            toast('Вес записан');
            router.back();
          }}
        />
      </Card>
      {trend ? (
        <Banner tone="accent" icon="trending-up" text={`Тренд: ${fmtWeight(trend)} кг. FORM ориентируется на тренд, а не на разовое значение — колебания ±1 кг от воды это норма.`} />
      ) : null}
      <T v="caption" style={{ marginTop: space.xl, marginBottom: space.sm }}>
        История
      </T>
      {weights.length === 0 ? <T v="small">Пока нет взвешиваний.</T> : null}
      <Card style={{ paddingVertical: 4 }}>
        {[...weights].reverse().slice(0, 30).map((w, i) => (
          <View key={w.id}>
            {i ? <Divider /> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}>
              <T v="body" style={{ flex: 1 }}>
                {relativeDay(w.date)}
              </T>
              <T v="body" style={{ fontWeight: '800', marginRight: 12 }}>
                {fmtWeight(w.kg)} кг
              </T>
              <Pressable accessibilityLabel="Удалить запись" hitSlop={10} onPress={() => confirm('Удалить запись?', `${fmtWeight(w.kg)} кг, ${relativeDay(w.date)}`, 'Удалить', () => remove(w.id), true)}>
                <Icon name="trash-outline" size={18} color={colors.muted} />
              </Pressable>
            </View>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
