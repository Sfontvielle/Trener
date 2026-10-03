import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import type { FoodProduct, MealSlot } from '@/types';
import { colors, radius, space, themed } from '@/theme';
import { Button, Icon, IconButton, T, type IconName } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import { toast } from '@/components/Dialog';
import { useNutrition, MEAL_LABEL } from '@/stores/nutrition';
import { LOCAL_FOODS } from '@/data/foods';
import { frequentProducts } from './quick';
import { macrosFor } from './status';
import { haptic } from '@/services/haptics';
import { fmtNum } from '@/utils/format';
import { BRAND } from '@/config/brand';

type View_ = 'menu' | 'favorites' | 'frequent' | 'recent' | 'meals';

/**
 * «+ Добавить еду»: один лист со всеми способами — без лишних переходов.
 * Частые / недавние / мои блюда добавляются одним тапом (порция как в прошлый раз) с «Отменить».
 */
export function AddFoodSheet({ visible, onClose, date, meal }: { visible: boolean; onClose: () => void; date: string; meal: MealSlot }) {
  const [view, setView] = useState<View_>('menu');
  const entries = useNutrition((s) => s.entries);
  const products = useNutrition((s) => s.products);
  const lastGrams = useNutrition((s) => s.lastGrams);
  const recentIds = useNutrition((s) => s.recent);
  const meals = useNutrition((s) => s.meals);
  const favIds = useNutrition((s) => s.favorites);
  const favorites = useMemo(
    () =>
      favIds
        .map((id) => products[id] ?? LOCAL_FOODS.find((f) => f.id === id))
        .filter((p): p is FoodProduct => !!p)
        .map((p) => ({ product: p, grams: lastGrams[p.id] ?? p.serving?.grams ?? 100 })),
    [favIds, products, lastGrams],
  );
  const frequent = useMemo(() => frequentProducts(entries, products, lastGrams, date, 20), [entries, products, lastGrams, date]);
  const recent = useMemo(
    () =>
      recentIds
        .map((id) => products[id] ?? LOCAL_FOODS.find((f) => f.id === id))
        .filter((p): p is FoodProduct => !!p)
        .slice(0, 20)
        .map((p) => ({ product: p, grams: lastGrams[p.id] ?? p.serving?.grams ?? 100 })),
    [recentIds, products, lastGrams],
  );

  const close = () => {
    setView('menu');
    onClose();
  };
  const go = (fn: () => void) => {
    close();
    setTimeout(fn, 220);
  };

  const quickAdd = (p: FoodProduct, grams: number) => {
    const e = useNutrition.getState().addEntry(p, grams, meal, date);
    haptic.light();
    toast(`${p.name} — ${grams} г · ${MEAL_LABEL[meal].toLowerCase()}`, 'checkmark-circle', { label: 'Отменить', onPress: () => useNutrition.getState().removeEntry(e.id) });
  };

  const title = view === 'menu' ? 'Добавить еду' : view === 'favorites' ? 'Избранное' : view === 'frequent' ? 'Частые продукты' : view === 'recent' ? 'Недавние' : 'Мои блюда';
  return (
    <Sheet visible={visible} onClose={close} title={title} subtitle={`${MEAL_LABEL[meal]} · порция как в прошлый раз, изменить — тап по записи`}>
      {view !== 'menu' ? (
        <Pressable accessibilityRole="button" onPress={() => setView('menu')} style={styles.back} hitSlop={6}>
          <Icon name="chevron-back" size={18} color={colors.accent} />
          <T v="small" color={colors.accent} style={{ fontWeight: '700' }}>
            Все способы
          </T>
        </Pressable>
      ) : null}

      {view === 'menu' ? (
        <View style={{ gap: 8 }}>
          <Row icon="search" title="Поиск продукта" sub="База продуктов + твои" onPress={() => go(() => router.push({ pathname: '/food/add', params: { date, meal } }))} />
          <Row icon="barcode-outline" title="Сканировать штрихкод" sub="Камера iPhone" onPress={() => go(() => router.push({ pathname: '/food/scan', params: { date, meal } }))} />
          {favorites.length ? <Row icon="star" title="Избранное" sub={favorites.slice(0, 3).map((f) => f.product.name).join(', ')} badge={favorites.length} onPress={() => setView('favorites')} /> : null}
          <Row icon="flash-outline" title="Частые продукты" sub={frequent.length ? frequent.slice(0, 3).map((f) => f.product.name).join(', ') : 'Появятся сами, когда что-то будешь есть регулярно'} badge={frequent.length || undefined} onPress={() => setView('frequent')} />
          <Row icon="time-outline" title="Недавние" sub={recent.length ? recent.slice(0, 3).map((f) => f.product.name).join(', ') : 'Пока пусто'} onPress={() => setView('recent')} />
          <Row icon="restaurant-outline" title="Мои блюда" sub={meals.length ? meals.slice(0, 3).map((m) => m.name).join(', ') : 'Сохрани приём пищи как блюдо — добавляй одним тапом'} badge={meals.length || undefined} onPress={() => setView('meals')} />
          <Row icon="create-outline" title="Ввести вручную" sub="КБЖУ на 100 г с этикетки" onPress={() => go(() => router.push({ pathname: '/food/add', params: { date, meal, manual: '1' } }))} />
        </View>
      ) : null}

      {view === 'frequent' || view === 'recent' || view === 'favorites' ? (
        <View style={{ gap: 6 }}>
          {(view === 'frequent' ? frequent : view === 'favorites' ? favorites : recent).map((f) => (
            <ProductRow key={f.product.id} p={f.product} grams={f.grams} onAdd={() => quickAdd(f.product, f.grams)} onOpen={() => go(() => router.push({ pathname: '/food/add', params: { date, meal, productId: f.product.id } }))} />
          ))}
          {(view === 'frequent' ? frequent : view === 'favorites' ? favorites : recent).length === 0 ? (
            <T v="small" style={{ textAlign: 'center', marginVertical: space.lg }}>
              {view === 'frequent' ? `${BRAND} сам запомнит продукты, которые ты добавляешь 2+ раза за 3 недели.` : 'Здесь будут последние добавленные продукты.'}
            </T>
          ) : null}
        </View>
      ) : null}

      {view === 'meals' ? (
        <View style={{ gap: 8 }}>
          {meals.map((m) => {
            const total = m.items.reduce((a, it) => {
              const p = products[it.productId] ?? LOCAL_FOODS.find((f) => f.id === it.productId);
              return a + (p ? macrosFor(p.per100, it.grams).kcal : 0);
            }, 0);
            return (
              <View key={m.id} style={styles.meal}>
                <View style={{ flex: 1 }}>
                  <T v="body" style={{ fontWeight: '700' }}>
                    {m.name}
                  </T>
                  <T v="small" numberOfLines={2} style={{ fontSize: 12 }}>
                    {m.items.map((it) => `${it.name} ${it.grams} г`).join(' · ')} · {fmtNum(total)} ккал
                  </T>
                </View>
                <IconButton
                  name="add"
                  label={`Добавить ${m.name}`}
                  onPress={() => {
                    const ids = useNutrition.getState().addSavedMeal(m.id, meal, date);
                    haptic.success();
                    toast(`«${m.name}» добавлено`, 'checkmark-circle', { label: 'Отменить', onPress: () => useNutrition.getState().removeEntries(ids) });
                  }}
                  bg={colors.accent}
                  color={colors.onAccent}
                />
              </View>
            );
          })}
          {meals.length === 0 ? (
            <T v="small" style={{ textAlign: 'center', marginVertical: space.md }}>
              Добавь продукты в приём пищи, затем нажми «Сохранить как блюдо» на карточке приёма — оно появится здесь.
            </T>
          ) : null}
        </View>
      ) : null}
    </Sheet>
  );
}

function Row({ icon, title, sub, onPress, badge }: { icon: IconName; title: string; sub: string; onPress: () => void; badge?: number }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}>
      <View style={styles.rowIcon}>
        <Icon name={icon} size={20} color={colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <T v="body" style={{ fontWeight: '700' }}>
          {title}
        </T>
        <T v="small" numberOfLines={1} style={{ fontSize: 12 }}>
          {sub}
        </T>
      </View>
      {badge ? (
        <View style={styles.badge}>
          <T v="small" style={{ fontSize: 11, fontWeight: '800' }}>
            {badge}
          </T>
        </View>
      ) : null}
      <Icon name="chevron-forward" size={16} color={colors.muted} />
    </Pressable>
  );
}

function ProductRow({ p, grams, onAdd, onOpen }: { p: FoodProduct; grams: number; onAdd: () => void; onOpen: () => void }) {
  return (
    <View style={styles.prow}>
      <Pressable style={{ flex: 1 }} onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${p.name}, выбрать порцию`}>
        <T v="body" numberOfLines={1} style={{ fontWeight: '600' }}>
          {p.name}
        </T>
        <T v="small" style={{ fontSize: 12 }}>
          {grams} г · {fmtNum(Math.round((p.per100.kcal * grams) / 100))} ккал · Б {Math.round((p.per100.protein * grams) / 100)}
        </T>
      </Pressable>
      <Button title="+" size="sm" onPress={onAdd} style={{ width: 48 }} />
    </View>
  );
}

const styles = themed({
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 64, borderRadius: radius.lg, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  rowIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accentDim, alignItems: 'center', justifyContent: 'center' },
  badge: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
  prow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: radius.md, backgroundColor: colors.surface2 },
  meal: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: colors.surface2 },
});
