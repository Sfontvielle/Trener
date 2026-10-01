import React, { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import type { Equipment, Exercise, ExerciseCategory } from '@/types';
import { colors, radius } from '@/theme';
import { Chip, EmptyState, Icon, T } from '@/components/ui';
import { CATEGORY_LABEL, EQUIPMENT_LABEL, EXERCISES, MUSCLE_LABEL } from '@/data/exercises';
import { useProfile } from '@/stores/profile';
import { useWorkouts } from '@/stores/workouts';
import { isAvailable } from '@/features/training/planGenerator';

type Flag = 'compound' | 'isolation' | 'gym' | 'home' | 'bodyweight' | 'mine';
const FLAGS: { k: Flag; label: string }[] = [
  { k: 'mine', label: 'Доступные мне' },
  { k: 'compound', label: 'Базовые' },
  { k: 'isolation', label: 'Изолирующие' },
  { k: 'gym', label: 'Зал' },
  { k: 'home', label: 'Дом' },
  { k: 'bodyweight', label: 'Свой вес' },
];
const EQ: Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'kettlebell', 'band', 'pullupbar', 'ezbar', 'smith'];

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

/**
 * Библиотека упражнений: поиск + фильтры по мышце, оборудованию, типу и месту.
 * FlatList с мемоизированными строками; изображения в списке не грузятся — только в карточке.
 */
export function ExerciseList({
  onSelect,
  selectedIds = [],
  header,
  contentPaddingBottom = 24,
  initialCategory,
  excludeIds = [],
}: {
  onSelect: (ex: Exercise) => void;
  selectedIds?: string[];
  header?: React.ReactElement;
  contentPaddingBottom?: number;
  initialCategory?: ExerciseCategory;
  excludeIds?: string[];
}) {
  const profile = useProfile((s) => s.profile);
  const customs = useWorkouts((s) => s.customExercises);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<ExerciseCategory | 'all'>(initialCategory ?? 'all');
  const [flags, setFlags] = useState<Flag[]>([]);
  const [eq, setEq] = useState<Equipment | null>(null);

  const data = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    return [...EXERCISES, ...customs].filter((e) => {
      if (excludeIds.includes(e.id)) return false;
      if (cat !== 'all' && e.category !== cat) return false;
      if (eq && !e.equipment.includes(eq)) return false;
      for (const f of flags) {
        if (f === 'compound' && e.mechanic !== 'compound') return false;
        if (f === 'isolation' && e.mechanic !== 'isolation') return false;
        if (f === 'gym' && !e.location.includes('gym')) return false;
        if (f === 'home' && !e.location.includes('home')) return false;
        if (f === 'bodyweight' && !e.bodyweight) return false;
        if (f === 'mine' && profile && !isAvailable(e, profile.equipment, profile.location)) return false;
      }
      if (words.length) {
        const hay = norm(`${e.name} ${e.nameEn} ${CATEGORY_LABEL[e.category]} ${e.primary.map((m) => MUSCLE_LABEL[m]).join(' ')}`);
        if (!words.every((w) => hay.includes(w))) return false;
      }
      return true;
    });
  }, [q, cat, flags, eq, customs, profile, excludeIds]);

  const toggleFlag = (f: Flag) => setFlags((x) => (x.includes(f) ? x.filter((y) => y !== f) : [...x, f]));
  const renderItem = useCallback(({ item }: { item: Exercise }) => <Row ex={item} selected={selectedIds.includes(item.id)} onPress={onSelect} />, [selectedIds, onSelect]);

  return (
    <FlatList
      data={data}
      keyExtractor={(e) => e.id}
      renderItem={renderItem}
      initialNumToRender={14}
      maxToRenderPerBatch={16}
      windowSize={9}
      removeClippedSubviews
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={{ paddingBottom: contentPaddingBottom }}
      ItemSeparatorComponent={Sep}
      ListHeaderComponent={
        <View style={{ gap: 10, marginBottom: 10 }}>
          {header}
          <View style={styles.search}>
            <Icon name="search" size={18} color={colors.muted} />
            <TextInput value={q} onChangeText={setQ} placeholder="Поиск: жим, присед, бицепс…" placeholderTextColor={colors.muted} style={styles.searchInput} selectionColor={colors.accent} returnKeyType="search" clearButtonMode="while-editing" />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
            <Chip label="Все" active={cat === 'all'} onPress={() => setCat('all')} />
            {(Object.keys(CATEGORY_LABEL) as ExerciseCategory[]).map((c) => (
              <Chip key={c} label={CATEGORY_LABEL[c]} active={cat === c} onPress={() => setCat(cat === c ? 'all' : c)} />
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
            {FLAGS.map((f) => (
              <Chip key={f.k} label={f.label} active={flags.includes(f.k)} onPress={() => toggleFlag(f.k)} style={{ height: 32 }} />
            ))}
            {EQ.map((e) => (
              <Chip key={e} label={EQUIPMENT_LABEL[e]} active={eq === e} onPress={() => setEq(eq === e ? null : e)} style={{ height: 32 }} />
            ))}
          </ScrollView>
          <T v="small" style={{ fontSize: 12 }}>
            {data.length} упражнений
          </T>
        </View>
      }
      ListEmptyComponent={<EmptyState icon="search" title="Ничего не найдено" text="Измени запрос или сбрось фильтры." action="Сбросить фильтры" onAction={() => { setQ(''); setCat('all'); setFlags([]); setEq(null); }} />}
    />
  );
}

const Sep = () => <View style={{ height: 8 }} />;

const Row = memo(function Row({ ex, selected, onPress }: { ex: Exercise; selected: boolean; onPress: (e: Exercise) => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={ex.name} onPress={() => onPress(ex)} style={({ pressed }) => [styles.row, selected && { borderColor: colors.accent }, pressed && { opacity: 0.8 }]}>
      <View style={[styles.badge, ex.mechanic === 'compound' && { backgroundColor: colors.accentDim }]}>
        <T v="small" color={ex.mechanic === 'compound' ? colors.accent : colors.textDim} style={{ fontWeight: '800', fontSize: 11 }}>
          {CATEGORY_LABEL[ex.category].slice(0, 3).toUpperCase()}
        </T>
      </View>
      <View style={{ flex: 1 }}>
        <T v="body" numberOfLines={2} style={{ fontWeight: '700' }}>
          {ex.name}
        </T>
        <T v="small" numberOfLines={1} style={{ fontSize: 12 }}>
          {ex.primary.map((m) => MUSCLE_LABEL[m]).join(', ')} · {ex.equipment.map((e) => EQUIPMENT_LABEL[e]).join(', ')}
        </T>
      </View>
      <Icon name={selected ? 'checkmark-circle' : 'chevron-forward'} size={selected ? 22 : 18} color={selected ? colors.accent : colors.muted} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12 },
  searchInput: { flex: 1, minWidth: 0, color: colors.text, fontSize: 16, height: '100%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, minHeight: 60 },
  badge: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
});
