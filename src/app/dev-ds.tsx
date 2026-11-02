import React, { useState } from 'react';
import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Banner, Button, Card, Chip, Skeleton, T } from '@/components/ui';
import { AppHeader, EmptyState, ErrorState, Group, ListRow, LoadingSkeleton, PrimaryAction, Scale, SecondaryAction, SectionHeader, SegmentedControl, StatRow } from '@/components/ds';
import { colors, space } from '@/theme';

/**
 * Каталог компонентов дизайн-системы — только в сборке разработки (__DEV__), для снимков web и проверки тем.
 * Числа — образец оформления, не данные пользователя.
 */
export default function DesignCatalog() {
  const [seg, setSeg] = useState<'day' | 'week' | 'month'>('day');
  const [food, setFood] = useState<'recent' | 'frequent' | 'base' | 'mine'>('recent');
  const [chip, setChip] = useState('100');
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <Screen>
      <AppHeader title="Компоненты" subtitle="Образец оформления" back actions={[{ icon: 'search-outline', label: 'Поиск', onPress: () => {} }]} />
      <T v="display">2 150</T>
      <T v="title1">Заголовок 1</T>
      <T v="title2">Заголовок 2</T>
      <T v="headline">Headline</T>
      <T v="body">Основной текст 16 pt</T>
      <T v="callout">Пояснение 15 pt</T>
      <T v="footnote">Сноска 13 pt</T>
      <T v="caption">Подпись 12 pt</T>

      <SectionHeader title="Переключатели" action="Все" onAction={() => {}} />
      <View style={{ gap: space.sm }}>
        <SegmentedControl items={[{ key: 'day', label: 'День' }, { key: 'week', label: 'Неделя' }, { key: 'month', label: 'Месяц' }]} value={seg} onChange={setSeg} />
        <SegmentedControl
          items={[{ key: 'recent', label: 'Недавние' }, { key: 'frequent', label: 'Частые' }, { key: 'base', label: 'Базовые' }, { key: 'mine', label: 'Мои' }]}
          value={food}
          onChange={setFood}
        />
        <View style={{ flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' }}>
          {['50', '100', '150', 'Порция'].map((c) => (
            <Chip key={c} label={c === 'Порция' ? c : `${c} г`} active={chip === c} onPress={() => setChip(c)} />
          ))}
        </View>
      </View>

      <SectionHeader title="Сгруппированный список" />
      <Group>
        <StatRow label="Белки" value={96} unit="г" dot={colors.protein} />
        <StatRow label="Вес" value={82.5} digits={1} unit="кг" delta={-0.5} deltaTone="good" icon="scale-outline" />
        <ListRow title="Шаги" subtitle="Apple Health" value="8 420" icon="walk-outline" onPress={() => {}} />
      </Group>

      <SectionHeader title="Шкала" />
      <Card style={{ gap: space.md }}>
        <Scale value={96} target={140} color={colors.protein} accessibilityLabel="Белки 96 из 140 г" />
        <Scale value={2350} target={2150} color={colors.carbs} accessibilityLabel="Энергия 2 350 из 2 150 ккал" />
      </Card>

      <SectionHeader title="Действия" />
      <View style={{ gap: space.sm }}>
        <PrimaryAction title="Начать тренировку" icon="play" onPress={() => {}} />
        <SecondaryAction title="Изменить план" onPress={() => {}} />
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button title="Мини" size="sm" variant="secondary" onPress={() => {}} />
          <Button title="Удалить" size="sm" variant="danger" onPress={() => {}} />
          <Button title="Текст" size="sm" variant="ghost" onPress={() => {}} />
        </View>
      </View>

      <SectionHeader title="Состояния" />
      <View style={{ gap: space.sm }}>
        <Banner icon="cloud-offline-outline" tone="warning" text="Нет сети — показаны сохранённые продукты" />
        <LoadingSkeleton rows={2} />
        <Skeleton height={14} width="60%" />
        <Card>
          <EmptyState icon="restaurant-outline" title="Пока пусто" text="Добавь первый продукт — сумма за день появится здесь" action="Добавить" onAction={() => {}} />
        </Card>
        <Card>
          <ErrorState text="Нет сети — проверь подключение и повтори" onRetry={() => {}} />
        </Card>
      </View>
    </Screen>
  );
}
