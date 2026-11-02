import React, { useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, TextInput, View, type ViewStyle } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FoodProduct, MealSlot } from '@/types';
import { colors, radius, space, themed } from '@/theme';
import { Screen } from '@/components/Screen';
import { Banner, Button, Icon, Segmented, Skeleton, T, elevation } from '@/components/ui';
import { AppHeader, ListRow, Group } from '@/components/ds';
import { Field } from '@/components/inputs';
import { Sheet } from '@/components/Sheet';
import { toast } from '@/components/Dialog';
import { useNutrition, mealForHour, type SavedMeal } from '@/stores/nutrition';
import { LOCAL_FOODS } from '@/data/foods';
import { FoodApiError, foodErrorText, lookupBarcode } from '@/services/foodApi';
import { useFoodSearch } from '@/features/nutrition/useFoodSearch';
import { lastPortion } from '@/features/nutrition/quick';
import { PortionSheet, SourceIcon, MEAL_TO, type PortionTarget } from '@/features/nutrition/PortionSheet';
import { macrosExact, verificationOf } from '@/features/nutrition/schema';
import { fmtValue, parseDecimal } from '@/utils/format';
import { addDays, plural, today } from '@/utils/date';
import { uid } from '@/utils/id';
import { haptic } from '@/services/haptics';
import { afterModalClose } from '@/components/modalGate';

type Tab = 'recent' | 'fav' | 'mine';
const TABS: { key: Tab; label: string }[] = [
  { key: 'recent', label: 'Недавние' },
  { key: 'fav', label: 'Избранное' },
  { key: 'mine', label: 'Мои' },
];

type Row = { type: 'h'; key: string; title: string; note?: string } | { type: 'p'; key: string; p: FoodProduct } | { type: 'meal'; key: string; m: SavedMeal } | { type: 'sk'; key: string };

/**
 * Добавление еды — один поток (NUTRITION_SPEC.md §1, макет 03-food-search): Недавние · Избранное · Мои, поиск по
 * всем базам, штрихкод, свой продукт. Тап по продукту — лист порции; «+» в строке — сразу в корзину с привычной
 * порцией. Корзина добавляет несколько продуктов одним действием и переживает закрытие приложения.
 */
export default function AddFood() {
  const params = useLocalSearchParams<{ date?: string; productId?: string; meal?: MealSlot | ''; manual?: string; barcode?: string; enterBarcode?: string; name?: string }>();
  const date = params.date || today();
  const meal: MealSlot = (params.meal as MealSlot) || (date === today() ? mealForHour(new Date().getHours()) : 'snack');
  const insets = useSafeAreaInsets();
  const products = useNutrition((s) => s.products);
  const recentIds = useNutrition((s) => s.recent);
  const favIds = useNutrition((s) => s.favorites);
  const entries = useNutrition((s) => s.entries);
  const lastGrams = useNutrition((s) => s.lastGrams);
  const savedMeals = useNutrition((s) => s.meals);
  const draft = useNutrition((s) => s.draft);
  const cart = draft && draft.date === date ? draft : null;
  const [q, setQ] = useState('');
  const [tabPick, setTab] = useState<Tab | null>(null);
  const [portion, setPortion] = useState<PortionTarget | null>(() => {
    const p = params.productId ? products[params.productId] ?? LOCAL_FOODS.find((f) => f.id === params.productId) : undefined;
    return p ? { mode: 'add', product: p, date, meal } : null;
  });
  const [barcodeOpen, setBarcodeOpen] = useState(params.enterBarcode === '1');
  const [customOpen, setCustomOpen] = useState(params.manual === '1');
  const [custom, setCustom] = useState<{ barcode?: string; name?: string }>({});
  const [cartOpen, setCartOpen] = useState(false);
  const search = useFoodSearch(q);
  // Экран мог открыться по ссылке (сканер, уведомление) — тогда «назад» некуда: возвращаемся в дневник
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/nutrition'));
  const query = q.trim();

  const find = (id: string) => products[id] ?? LOCAL_FOODS.find((f) => f.id === id);
  // Сколько раз ели за 30 дней — для подписи «Обычно 180 г, ели 6 раз»
  const eaten30 = useMemo(() => {
    const from = addDays(today(), -30);
    const m = new Map<string, number>();
    for (const e of entries) if (e.date >= from) m.set(e.productId, (m.get(e.productId) ?? 0) + 1);
    return m;
  }, [entries]);
  const recent = useMemo(() => recentIds.map(find).filter((p): p is FoodProduct => !!p).slice(0, 40), [recentIds, products]); // eslint-disable-line react-hooks/exhaustive-deps
  const favs = useMemo(() => favIds.map(find).filter((p): p is FoodProduct => !!p), [favIds, products]); // eslint-disable-line react-hooks/exhaustive-deps
  const mine = useMemo(() => Object.values(products).filter((p) => p.source === 'custom' || p.source === 'recipe').sort((a, b) => a.name.localeCompare(b.name, 'ru')), [products]);
  const tab: Tab = tabPick ?? (recent.length ? 'recent' : favs.length ? 'fav' : 'recent');

  const rows: Row[] = [];
  if (query.length < 2) {
    if (tab === 'recent') {
      if (recent.length) recent.forEach((p) => rows.push({ type: 'p', key: `r-${p.id}`, p }));
      else {
        rows.push({ type: 'h', key: 'h-base', title: 'Базовые продукты', note: 'ккал на 100 г' });
        LOCAL_FOODS.slice(0, 40).forEach((p) => rows.push({ type: 'p', key: `b-${p.id}`, p }));
      }
    } else if (tab === 'fav') favs.forEach((p) => rows.push({ type: 'p', key: `f-${p.id}`, p }));
    else {
      if (savedMeals.length) {
        rows.push({ type: 'h', key: 'h-meals', title: 'Мои блюда' });
        savedMeals.forEach((m) => rows.push({ type: 'meal', key: `m-${m.id}`, m }));
      }
      if (mine.length) {
        rows.push({ type: 'h', key: 'h-mine', title: 'Мои продукты и рецепты', note: 'ккал на 100 г' });
        mine.forEach((p) => rows.push({ type: 'p', key: `c-${p.id}`, p }));
      }
    }
  } else {
    // Сохранённые и базовые — сразу; найденные в сети — отдельной группой ниже, по мере ответа
    const isNet = (p: FoodProduct) => (p.source === 'openfoodfacts' || p.source === 'usda') && !products[p.id];
    const local = search.items.filter((r) => !isNet(r.product));
    const net = search.items.filter((r) => isNet(r.product));
    if (local.length) {
      rows.push({ type: 'h', key: 'h-local', title: 'Мои и базовые продукты', note: 'ккал на 100 г' });
      local.slice(0, 30).forEach((r) => rows.push({ type: 'p', key: `l-${r.product.id}`, p: r.product }));
    }
    if (net.length || search.pending.length) {
      rows.push({ type: 'h', key: 'h-net', title: 'Open Food Facts и USDA', note: search.pending.length ? 'ищу…' : undefined });
      net.slice(0, 30).forEach((r) => rows.push({ type: 'p', key: `n-${r.product.id}`, p: r.product }));
      if (search.pending.length && !net.length) [0, 1].forEach((i) => rows.push({ type: 'sk', key: `sk-${i}` }));
    }
  }

  const netError = query.length >= 3 && search.done ? search.errors[0]?.error : undefined;
  const nothing = query.length >= 2 && search.done && !search.items.length;
  const inCart = (id: string) => !!cart?.items.some((i) => i.product.id === id);
  const toggleCart = (p: FoodProduct) => {
    const st = useNutrition.getState();
    const i = cart?.items.findIndex((x) => x.product.id === p.id) ?? -1;
    haptic.tap();
    if (i >= 0) st.draftRemove(i);
    else st.draftAdd(date, cart?.meal ?? meal, { product: p, grams: lastPortion(p.id, lastGrams, entries, p.serving).grams });
  };
  const commitCart = () => {
    const c = useNutrition.getState().draft;
    if (!c) return;
    const ids = useNutrition.getState().draftCommit();
    haptic.success();
    toast(`${ids.length} ${plural(ids.length, 'продукт', 'продукта', 'продуктов')} в ${MEAL_TO[c.meal]}`, 'checkmark-circle', { label: 'Отменить', onPress: () => useNutrition.getState().deleteEntries(ids) });
    leave();
  };
  const addMeal = (m: SavedMeal) => {
    const ids = useNutrition.getState().addSavedMeal(m.id, meal, date);
    haptic.success();
    toast(`«${m.name}» в ${MEAL_TO[meal]}`, 'checkmark-circle', { label: 'Отменить', onPress: () => useNutrition.getState().deleteEntries(ids) });
    leave();
  };
  const cartKcal = cart ? Math.round(cart.items.reduce((a, i) => a + macrosExact(i.product.per100, i.grams).kcal, 0)) : 0;

  const sub = (p: FoodProduct): string => {
    const n = eaten30.get(p.id) ?? 0;
    const lp = lastPortion(p.id, lastGrams, entries);
    const g = lp.source === 'last' ? lp.grams : undefined;
    if (n >= 2 && g) return `Обычно ${fmtValue(g)} г, ели ${n} ${plural(n, 'раз', 'раза', 'раз')}`;
    if (g) return `Последний раз ${fmtValue(g)} г`;
    if (p.source === 'local') return 'Базовый продукт';
    if (p.source === 'recipe') return 'Мой рецепт';
    if (p.source === 'custom') return 'Мой продукт, с этикетки';
    return [p.brand, verificationOf(p) === 'database' ? (p.source === 'usda' ? 'USDA' : 'Open Food Facts') : undefined].filter(Boolean).join(' · ');
  };

  return (
    <Screen scroll={false} keyboard>
      <AppHeader title={`Добавить в ${MEAL_TO[meal]}`} subtitle={date === today() ? undefined : date} back />
      <View style={styles.search}>
        <Icon name="search" size={18} color={colors.muted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Название, бренд или штрихкод"
          placeholderTextColor={colors.muted}
          style={styles.input}
          autoFocus={Platform.OS !== 'web' && !params.productId && params.manual !== '1'}
          returnKeyType="search"
          selectionColor={colors.accent}
          clearButtonMode="while-editing"
          accessibilityLabel="Поиск продукта"
          testID="food-search"
        />
        {q ? (
          <Pressable onPress={() => setQ('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Очистить поиск">
            <Icon name="close-circle" size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.tools}>
        <Button title="Сканировать" icon="barcode-outline" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => (Platform.OS === 'web' ? setBarcodeOpen(true) : router.push({ pathname: '/food/scan', params: { date, meal } }))} />
        <Button title="Свой продукт" icon="create-outline" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => setCustomOpen(true)} />
      </View>
      {query.length < 2 ? <Segmented items={TABS} value={tab} onChange={setTab} style={{ marginTop: space.sm }} /> : null}
      {query.length < 2 && tab === 'mine' ? (
        <Button title="Новый рецепт" icon="restaurant-outline" variant="ghost" size="sm" onPress={() => router.push('/food/recipe')} style={{ alignSelf: 'flex-start', marginTop: space.xs }} testID="new-recipe" />
      ) : null}
      {netError ? (
        <View style={{ marginTop: space.sm }}>
          <Banner
            tone="warning"
            icon={netError instanceof FoodApiError && netError.kind === 'offline' ? 'cloud-offline-outline' : 'alert-circle-outline'}
            text={netError instanceof FoodApiError && netError.kind === 'offline' ? (Platform.OS === 'web' ? foodErrorText(netError) : 'Нет сети — ищу в сохранённых и базовых продуктах') : netError instanceof FoodApiError && netError.kind === 'timeout' ? 'База продуктов не ответила вовремя' : 'База продуктов вернула ошибку'}
            action={netError instanceof FoodApiError && netError.kind === 'offline' ? undefined : 'Повторить'}
            onAction={() => setQ((x) => `${x} `)}
          />
        </View>
      ) : null}
      <FlatList
        style={{ marginTop: space.xs }}
        data={rows}
        keyExtractor={(x) => x.key}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={16}
        contentContainerStyle={{ paddingBottom: (cart ? 140 : 24) + insets.bottom }}
        renderItem={({ item, index }) =>
          item.type === 'h' ? (
            <View style={styles.groupTitle}>
              <T v="footnote">{item.title}</T>
              {item.note ? <T v="footnote" color={colors.muted}>{item.note}</T> : null}
            </View>
          ) : item.type === 'sk' ? (
            <View style={[styles.row, edge(rows, index)]}>
              <View style={{ flex: 1, gap: 6 }}>
                <Skeleton height={14} width="62%" />
                <Skeleton height={12} width="38%" />
              </View>
              <Skeleton height={14} width={32} />
            </View>
          ) : item.type === 'meal' ? (
            <SavedMealRow m={item.m} onAdd={() => addMeal(item.m)} style={edge(rows, index)} />
          ) : (
            <ProductRow p={item.p} sub={sub(item.p)} inCart={inCart(item.p.id)} style={edge(rows, index)} onPress={() => setPortion({ mode: 'add', product: item.p, date, meal: cart?.meal ?? meal })} onQuick={() => toggleCart(item.p)} />
          )
        }
        ListEmptyComponent={
          query.length < 2 ? (
            <View style={styles.empty}>
              <T v="callout" style={{ textAlign: 'center' }}>
                {tab === 'fav' ? 'Звёздочка в листе порции добавляет продукт в избранное — он будет здесь.' : tab === 'mine' ? 'Добавь свой продукт с этикетки — он будет здесь и найдётся без интернета.' : 'Здесь появятся продукты, которые ты добавлял.'}
              </T>
              {tab === 'mine' ? <Button title="Свой продукт" icon="create-outline" variant="secondary" onPress={() => setCustomOpen(true)} /> : null}
            </View>
          ) : nothing ? (
            <View style={styles.empty} testID="food-nothing">
              <T v="callout" style={{ textAlign: 'center' }}>
                Ничего не нашлось по «{query}». Проверь написание, попробуй бренд или добавь продукт с этикетки.
              </T>
              <Button title="Свой продукт" icon="create-outline" variant="secondary" onPress={() => setCustomOpen(true)} />
            </View>
          ) : undefined
        }
      />

      {cart ? (
        <View style={[styles.cart, elevation(), { paddingBottom: insets.bottom + space.sm }]} testID="food-cart">
          <Pressable accessibilityRole="button" accessibilityLabel={`Корзина: ${cart.items.length} ${plural(cart.items.length, 'продукт', 'продукта', 'продуктов')}, ${cartKcal} ккал. Открыть`} onPress={() => setCartOpen(true)} style={styles.cartLine}>
            <T v="callout">
              В корзине{' '}
              <T v="bodyStrong">
                {cart.items.length} {plural(cart.items.length, 'продукт', 'продукта', 'продуктов')}
              </T>
            </T>
            <T v="callout">
              <T v="bodyStrong">{fmtValue(cartKcal)}</T> ккал
            </T>
          </Pressable>
          <Button title={`Добавить в ${MEAL_TO[cart.meal]}`} size="lg" full onPress={commitCart} testID="cart-commit" />
        </View>
      ) : null}

      <PortionSheet
        target={portion}
        onClose={() => setPortion(null)}
        onDone={(how) => {
          setPortion(null);
          if (how === 'added') leave();
        }}
      />
      <CartSheet visible={cartOpen} onClose={() => setCartOpen(false)} />
      <BarcodeSheet visible={barcodeOpen} onClose={() => setBarcodeOpen(false)} onFound={(p) => { setBarcodeOpen(false); afterModalClose(() => setPortion({ mode: 'add', product: p, date, meal })); }} onCreate={(code, nm) => { setBarcodeOpen(false); setCustom({ barcode: code, name: nm }); afterModalClose(() => setCustomOpen(true)); }} />
      <CustomProductSheet visible={customOpen} initialName={custom.name || params.name || q} barcode={custom.barcode || params.barcode} onClose={() => setCustomOpen(false)} onCreated={(p) => { setCustomOpen(false); afterModalClose(() => setPortion({ mode: 'add', product: p, date, meal })); }} />
    </Screen>
  );
}

/** Строки списка между заголовками — одна группа: скругление у первой и последней, без линии под последней */
function edge(rows: Row[], i: number): ViewStyle {
  const first = i === 0 || rows[i - 1].type === 'h';
  const last = i === rows.length - 1 || rows[i + 1].type === 'h';
  return {
    ...(first ? { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg } : null),
    ...(last ? { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, borderBottomWidth: 0 } : null),
  };
}

const ProductRow = React.memo(function ProductRow({ p, sub, inCart, onPress, onQuick, style }: { p: FoodProduct; sub: string; inCart: boolean; onPress: () => void; onQuick: () => void; style?: ViewStyle }) {
  return (
    <View style={[styles.row, style]}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${p.name}${sub ? `, ${sub}` : ''}, ${Math.round(p.per100.kcal)} ккал на 100 г`} style={({ pressed }) => [styles.rowMain, pressed && { opacity: 0.6 }]}>
        <SourceIcon p={p} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T v="bodyStrong" numberOfLines={2}>
            {p.name}
          </T>
          {sub ? (
            <T v="footnote" numberOfLines={1}>
              {sub}
            </T>
          ) : null}
        </View>
        <T v="bodyStrong" style={{ fontVariant: ['tabular-nums'] }}>
          {Math.round(p.per100.kcal)}
        </T>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={inCart ? `Убрать «${p.name}» из корзины` : `В корзину: ${p.name}`} accessibilityState={{ selected: inCart }} onPress={onQuick} hitSlop={8} style={[styles.quick, inCart && { backgroundColor: colors.text }]}>
        <Icon name={inCart ? 'checkmark' : 'add'} size={18} color={inCart ? colors.bg : colors.text} />
      </Pressable>
    </View>
  );
});

function SavedMealRow({ m, onAdd, style }: { m: SavedMeal; onAdd: () => void; style?: ViewStyle }) {
  const products = useNutrition((s) => s.products);
  const kcal = Math.round(m.items.reduce((a, it) => {
    const p = products[it.productId] ?? LOCAL_FOODS.find((f) => f.id === it.productId);
    return a + (p ? macrosExact(p.per100, it.grams).kcal : 0);
  }, 0));
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Добавить блюдо «${m.name}»: ${m.items.length} ${plural(m.items.length, 'продукт', 'продукта', 'продуктов')}, ${kcal} ккал`} onPress={onAdd} style={({ pressed }) => [styles.row, styles.rowMain, style, pressed && { opacity: 0.6 }]}>
      <Icon name="bookmark-outline" size={16} color={colors.muted} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T v="bodyStrong" numberOfLines={1}>
          {m.name}
        </T>
        <T v="footnote" numberOfLines={1}>
          {m.items.map((i) => i.name).join(', ')}
        </T>
      </View>
      <T v="bodyStrong" style={{ fontVariant: ['tabular-nums'] }}>
        {fmtValue(kcal)}
      </T>
    </Pressable>
  );
}

/** Корзина: что добавится одним действием; можно убрать продукт */
function CartSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const draft = useNutrition((s) => s.draft);
  return (
    <Sheet visible={visible && !!draft} onClose={onClose} title="Корзина" subtitle={draft ? `Добавится в ${MEAL_TO[draft.meal]}` : undefined}>
      {draft ? (
        <View style={{ gap: space.md }}>
          <Group>
            {draft.items.map((it, i) => (
              <ListRow
                key={it.product.id}
                title={it.product.name}
                subtitle={`${it.unit ? `${String(it.unit.qty).replace('.', ',')} ${it.unit.label}, ` : ''}${fmtValue(it.grams)} г`}
                value={`${Math.round(macrosExact(it.product.per100, it.grams).kcal)} ккал`}
                right={
                  <Pressable accessibilityRole="button" accessibilityLabel={`Убрать «${it.product.name}»`} onPress={() => useNutrition.getState().draftRemove(i)} hitSlop={8} style={styles.quick}>
                    <Icon name="remove" size={18} color={colors.text} />
                  </Pressable>
                }
              />
            ))}
          </Group>
          <Button
            title="Очистить корзину"
            variant="ghost"
            onPress={() => {
              const prev = useNutrition.getState().draft;
              useNutrition.getState().draftClear();
              onClose();
              if (prev) toast('Корзина очищена', 'trash-outline', { label: 'Отменить', onPress: () => useNutrition.setState({ draft: prev }) });
            }}
          />
        </View>
      ) : null}
    </Sheet>
  );
}

function BarcodeSheet({ visible, onClose, onFound, onCreate }: { visible: boolean; onClose: () => void; onFound: (p: FoodProduct) => void; onCreate: (code: string, name?: string) => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [missing, setMissing] = useState<{ name?: string } | null>(null);
  const find = async () => {
    setBusy(true);
    setErr(null);
    setMissing(null);
    try {
      // Сначала свои продукты — найдутся и без сети
      const own = Object.values(useNutrition.getState().products).find((p) => p.barcode && p.barcode.replace(/^0+/, '') === code.replace(/^0+/, ''));
      const p = own ?? (await lookupBarcode(code));
      useNutrition.getState().cacheProduct(p);
      onFound(p);
      setCode('');
    } catch (e) {
      setErr(e instanceof FoodApiError && e.kind === 'not_found' && !e.partial ? 'Этого штрихкода нет в базах' : foodErrorText(e));
      if (e instanceof FoodApiError && e.kind === 'not_found') setMissing({ name: e.partial?.name });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Штрихкод" subtitle="В web-превью камера недоступна — введи цифры штрихкода">
      <View style={{ gap: space.md }}>
        <Field placeholder="4600000000000" keyboardType="number-pad" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, ''))} maxLength={14} />
        {err ? <Banner tone="warning" text={err} /> : null}
        {missing ? (
          <Button title={missing.name ? 'Добавить с этикетки' : 'Создать продукт с этим кодом'} icon="add-circle-outline" full onPress={() => onCreate(code, missing.name)} />
        ) : (
          <Button title="Найти" icon="search" full loading={busy} disabled={code.length < 8} onPress={find} />
        )}
      </View>
    </Sheet>
  );
}

function CustomProductSheet({ visible, onClose, onCreated, initialName, barcode }: { visible: boolean; onClose: () => void; onCreated: (p: FoodProduct) => void; initialName: string; barcode?: string }) {
  // Открыт сразу (из сканера) — название подставляется с первого кадра
  const [name, setName] = useState(() => (visible ? initialName.replace(/^\d+$/, '') : ''));
  const [v, setV] = useState({ kcal: '', protein: '', fat: '', carbs: '', fiber: '', piece: '' });
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setName(initialName.replace(/^\d+$/, ''));
  }
  const num = (s: string) => {
    const n = parseDecimal(s);
    return Number.isFinite(n) ? n : 0;
  };
  const p = num(v.protein);
  const f = num(v.fat);
  const c = num(v.carbs);
  const kcal = v.kcal ? num(v.kcal) : Math.round(p * 4 + f * 9 + c * 4);
  const piece = v.piece.trim() ? num(v.piece) : 0;
  const valid = name.trim().length > 1 && kcal > 0 && kcal <= 950 && p <= 100 && f <= 100 && c <= 100 && piece >= 0 && piece <= 3000;
  return (
    <Sheet visible={visible} onClose={onClose} title="Свой продукт" subtitle={barcode ? `Штрихкод ${barcode} · данные с этикетки, на 100 г` : 'Данные с этикетки, на 100 г'}>
      <View style={{ gap: space.md }}>
        <Field label="Название" value={name} onChangeText={setName} placeholder="Например: Сырники мамины" />
        <View style={{ flexDirection: 'row', gap: space.xs }}>
          <Field style={{ flex: 1 }} label="Белки, г" keyboardType="decimal-pad" value={v.protein} onChangeText={(t) => setV({ ...v, protein: t })} />
          <Field style={{ flex: 1 }} label="Жиры, г" keyboardType="decimal-pad" value={v.fat} onChangeText={(t) => setV({ ...v, fat: t })} />
          <Field style={{ flex: 1 }} label="Углев., г" keyboardType="decimal-pad" value={v.carbs} onChangeText={(t) => setV({ ...v, carbs: t })} />
        </View>
        <View style={{ flexDirection: 'row', gap: space.xs }}>
          <Field style={{ flex: 1 }} label="Ккал" keyboardType="decimal-pad" value={v.kcal} onChangeText={(t) => setV({ ...v, kcal: t })} placeholder={`${kcal} — посчитаем`} />
          <Field style={{ flex: 1 }} label="Клетчатка, г" keyboardType="decimal-pad" value={v.fiber} onChangeText={(t) => setV({ ...v, fiber: t })} placeholder="если есть" />
        </View>
        <Field label="Вес 1 шт, г" keyboardType="decimal-pad" value={v.piece} onChangeText={(t) => setV({ ...v, piece: t })} placeholder="если продаётся штуками — вводить «2 шт»" />
        <Button
          title="Сохранить продукт"
          icon="checkmark"
          size="lg"
          full
          disabled={!valid}
          onPress={() => {
            const fib = v.fiber.trim() ? num(v.fiber) : undefined;
            const prod: FoodProduct = {
              id: `custom:${uid()}`,
              name: name.trim(),
              per100: fib !== undefined && fib <= 100 ? { kcal, protein: p, fat: f, carbs: c, fiber: fib } : { kcal, protein: p, fat: f, carbs: c },
              source: 'custom',
              verification: 'label',
              barcode: barcode || undefined,
              ...(piece > 0 ? { units: [{ id: 'piece' as const, label: 'шт', grams: piece }] } : null),
            };
            useNutrition.getState().cacheProduct(prod);
            setV({ kcal: '', protein: '', fat: '', carbs: '', fiber: '', piece: '' });
            // Своя база: в следующий раз этот штрихкод найдётся сразу, без интернета
            if (barcode) toast('Сохранено в твою базу — по штрихкоду найдётся сразу', 'checkmark-circle');
            onCreated(prod);
          }}
        />
      </View>
    </Sheet>
  );
}

const styles = themed({
  search: { flexDirection: 'row', alignItems: 'center', gap: space.xs, height: 48, borderRadius: radius.md, backgroundColor: colors.surface2, paddingHorizontal: space.sm },
  // outlineWidth: в веб-превью без рамки фокуса браузера (на iPhone её нет)
  input: { flex: 1, minWidth: 0, color: colors.text, fontSize: 17, height: '100%', outlineWidth: 0 },
  tools: { flexDirection: 'row', gap: space.xs, marginTop: space.sm },
  groupTitle: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.md, marginBottom: space.xs, paddingHorizontal: space.xxs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 56, paddingVertical: space.xs, paddingHorizontal: space.md, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.borderStrong },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
  quick: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: space.sm, marginTop: space.xl, paddingHorizontal: space.md },
  cart: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: space.sm, paddingHorizontal: space.md, gap: space.sm, backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderTopWidth: 0.5, borderTopColor: colors.borderStrong },
  cartLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', minHeight: 32 },
});
