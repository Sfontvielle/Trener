import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Platform, Pressable, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { FoodProduct, MealSlot } from '@/types';
import { colors, radius, space, themed } from '@/theme';
import { Header, Screen } from '@/components/Screen';
import { Banner, Button, Chip, Icon, Segmented, Skeleton, T } from '@/components/ui';
import { Field, NumberStepper } from '@/components/inputs';
import { Sheet } from '@/components/Sheet';
import { toast } from '@/components/Dialog';
import { useNutrition, mealForHour, MEAL_LABEL } from '@/stores/nutrition';
import { usePlan } from '@/stores/plan';
import { useProfile } from '@/stores/profile';
import { allergenIn, foodAvoidance, healthOf } from '@/features/profile/health';
import { searchLocalFoods, LOCAL_FOODS } from '@/data/foods';
import { foodErrorText, lookupBarcode, searchProducts } from '@/services/foodApi';
import { macrosFor, remaining, sumMacros } from '@/features/nutrition/status';
import { frequentProducts } from '@/features/nutrition/quick';
import { today } from '@/utils/date';
import { parseDecimal } from '@/utils/format';
import { uid } from '@/utils/id';
import { haptic } from '@/services/haptics';
import { BRAND } from '@/config/brand';

type FoodTab = 'fav' | 'frequent' | 'recent' | 'mine' | 'base';
const TABS: { key: FoodTab; label: string }[] = [
  { key: 'fav', label: '★' },
  { key: 'frequent', label: 'Частые' },
  { key: 'recent', label: 'Недавние' },
  { key: 'mine', label: 'Мои' },
  { key: 'base', label: 'Базовые' },
];
const TAB_HINT: Record<FoodTab, string> = {
  fav: 'Избранное — звёздочка в карточке продукта',
  frequent: 'Ешь регулярно — порция как в прошлый раз',
  recent: 'Недавние',
  mine: 'Мои продукты и блюда',
  base: 'Базовые продукты',
};

export default function AddFood() {
  const params = useLocalSearchParams<{ date?: string; productId?: string; meal?: MealSlot | ''; manual?: string; barcode?: string }>();
  const date = params.date || today();
  const products = useNutrition((s) => s.products);
  const recentIds = useNutrition((s) => s.recent);
  const [q, setQ] = useState('');
  // Результат онлайн-поиска привязан к запросу: «загрузка» = результат ещё не для текущего запроса
  const [result, setResult] = useState<{ q: string; items: FoodProduct[]; error: string | null }>({ q: '', items: [], error: null });
  // Возврат со сканера: продукт уже в кэше
  const [selected, setSelected] = useState<FoodProduct | null>(() => (params.productId ? products[params.productId] ?? null : null));
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(params.manual === '1');
  const reqId = useRef(0);

  const recent = useMemo(() => recentIds.map((id) => products[id] ?? LOCAL_FOODS.find((f) => f.id === id)).filter((p): p is FoodProduct => !!p), [recentIds, products]);
  const cachedMatches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    return Object.values(products).filter((p) => p.source !== 'local' && `${p.name} ${p.brand ?? ''}`.toLowerCase().includes(t)).slice(0, 10);
  }, [q, products]);
  const local = useMemo(() => searchLocalFoods(q, 12), [q]);
  const entries = useNutrition((s) => s.entries);
  const lastGrams = useNutrition((s) => s.lastGrams);
  // Частые продукты определяются автоматически по дневнику (2+ раза за 3 недели)
  const frequent = useMemo(() => frequentProducts(entries, products, lastGrams, date, 30).map((f) => f.product), [entries, products, lastGrams, date]);
  const mine = useMemo(() => Object.values(products).filter((p) => p.source === 'custom'), [products]);
  const favIds = useNutrition((s) => s.favorites);
  const favs = useMemo(() => favIds.map((id) => products[id] ?? LOCAL_FOODS.find((f) => f.id === id)).filter((p): p is FoodProduct => !!p), [favIds, products]);
  const [tabPick, setTab] = useState<FoodTab | null>(null);
  const tab: FoodTab = tabPick ?? (favs.length ? 'fav' : frequent.length ? 'frequent' : recent.length ? 'recent' : 'base');

  const query = q.trim();
  const online = query.length >= 3;
  const remote = online && result.q === query ? result.items : [];
  const error = online && result.q === query ? result.error : null;
  const loading = online && result.q !== query;

  useEffect(() => {
    if (query.length < 3) return;
    // Если введены только цифры — это штрихкод
    const my = ++reqId.current;
    const timer = setTimeout(async () => {
      try {
        const res = /^\d{8,14}$/.test(query) ? [await lookupBarcode(query)] : await searchProducts(query);
        if (reqId.current === my) setResult({ q: query, items: res, error: null });
      } catch (e) {
        if (reqId.current === my) setResult({ q: query, items: [], error: foodErrorText(e) });
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [query]);

  const sections: { key: string; title: string; data: FoodProduct[] }[] = [];
  if (q.trim().length < 2) {
    const data = tab === 'fav' ? favs : tab === 'frequent' ? frequent : tab === 'recent' ? recent.slice(0, 30) : tab === 'mine' ? mine : LOCAL_FOODS.slice(0, 40);
    sections.push({ key: tab, title: TAB_HINT[tab], data });
  } else {
    const seen = new Set<string>();
    const dedupe = (arr: FoodProduct[]) => arr.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
    const mine = dedupe([...cachedMatches, ...local]);
    if (mine.length) sections.push({ key: 'local', title: 'Из твоих и базовых', data: mine });
    const r = dedupe(remote);
    if (r.length) sections.push({ key: 'remote', title: 'Open Food Facts', data: r });
  }
  const flat: ({ type: 'h'; title: string; key: string } | { type: 'p'; p: FoodProduct; key: string })[] = [];
  sections.forEach((s) => {
    flat.push({ type: 'h', title: s.title, key: `h-${s.key}` });
    s.data.forEach((p) => flat.push({ type: 'p', p, key: `${s.key}-${p.id}` }));
  });

  return (
    <Screen scroll={false} keyboard>
      <Header title="Добавить еду" subtitle={date === today() ? 'Сегодня' : date} />
      <View style={styles.search}>
        <Icon name="search" size={18} color={colors.muted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Название, бренд или штрихкод" placeholderTextColor={colors.muted} style={styles.input} autoFocus={Platform.OS !== 'web' && !params.productId && params.manual !== '1'} returnKeyType="search" selectionColor={colors.accent} clearButtonMode="while-editing" />
        {q ? (
          <Pressable onPress={() => setQ('')} hitSlop={10} accessibilityLabel="Очистить">
            <Icon name="close-circle" size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <Button title="Штрихкод" icon="barcode-outline" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => (Platform.OS === 'web' ? setBarcodeOpen(true) : router.push({ pathname: '/food/scan', params: { date, meal: params.meal ?? '' } }))} />
        <Button title="Свой продукт" icon="create-outline" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => setCustomOpen(true)} />
      </View>
      {q.trim().length < 2 ? <Segmented items={TABS} value={tab} onChange={setTab} style={{ marginTop: 10 }} /> : null}
      {error ? (
        <View style={{ marginTop: 10 }}>
          <Banner tone="warning" icon="cloud-offline-outline" text={error} />
        </View>
      ) : null}
      <FlatList
        style={{ marginTop: 6 }}
        data={flat}
        keyExtractor={(x) => x.key}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={20}
        contentContainerStyle={{ paddingBottom: 40 }}
        renderItem={({ item }) =>
          item.type === 'h' ? (
            <T v="caption" style={{ marginTop: 14, marginBottom: 6 }}>
              {item.title}
            </T>
          ) : (
            <ProductRow p={item.p} onPress={() => setSelected(item.p)} />
          )
        }
        ListFooterComponent={
          q.trim().length < 2 && !sections[0]?.data.length ? (
            <View style={{ alignItems: 'center', gap: 8, marginTop: 20 }}>
              <T v="small" style={{ textAlign: 'center' }}>
                {tab === 'frequent' ? `Здесь появятся продукты, которые ты ешь чаще всего — ${BRAND} запомнит их сам.` : tab === 'mine' ? 'Добавь свой продукт или блюдо с КБЖУ на 100 г — оно будет здесь.' : 'Пока пусто.'}
              </T>
              {tab === 'mine' ? <Button title="Свой продукт" size="sm" variant="secondary" onPress={() => setCustomOpen(true)} /> : null}
            </View>
          ) : loading ? (
            <View style={{ gap: 8, marginTop: 12 }}>
              <T v="caption">Ищу в базе продуктов…</T>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={56} style={{ borderRadius: 12 }} />
              ))}
            </View>
          ) : q.trim().length >= 3 && !remote.length && !error ? (
            <View style={{ alignItems: 'center', gap: 8, marginTop: 20 }}>
              <T v="small" style={{ textAlign: 'center' }}>
                В базе ничего не найдено. Попробуй другое название или бренд — или добавь продукт вручную с этикетки.
              </T>
              <Button title="Добавить вручную" size="sm" variant="secondary" onPress={() => setCustomOpen(true)} />
            </View>
          ) : null
        }
      />
      <PortionSheet key={selected?.id ?? 'none'} product={selected} date={date} initialMeal={params.meal || undefined} onClose={() => setSelected(null)} onAdded={() => { setSelected(null); router.back(); }} />
      <BarcodeSheet visible={barcodeOpen} onClose={() => setBarcodeOpen(false)} onFound={(p) => { setBarcodeOpen(false); setTimeout(() => setSelected(p), 250); }} />
      <CustomProductSheet visible={customOpen} initialName={q} barcode={params.barcode} onClose={() => setCustomOpen(false)} onCreated={(p) => { setCustomOpen(false); setTimeout(() => setSelected(p), 250); }} />
    </Screen>
  );
}

const ProductRow = React.memo(function ProductRow({ p, onPress }: { p: FoodProduct; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={p.name} style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}>
      <View style={{ flex: 1 }}>
        <T v="body" numberOfLines={2} style={{ fontSize: 15, fontWeight: '600' }}>
          {p.name}
        </T>
        <T v="small" numberOfLines={1} style={{ fontSize: 12 }}>
          {p.brand ? `${p.brand} · ` : ''}на 100 г: Б {p.per100.protein} · Ж {p.per100.fat} · У {p.per100.carbs}
        </T>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <T v="body" style={{ fontWeight: '800', fontSize: 15 }}>
          {Math.round(p.per100.kcal)}
        </T>
        <T v="small" style={{ fontSize: 11 }}>
          ккал
        </T>
      </View>
    </Pressable>
  );
});

function PortionSheet({ product, date, onClose, onAdded, initialMeal }: { product: FoodProduct | null; date: string; onClose: () => void; onAdded: () => void; initialMeal?: MealSlot }) {
  const lastGrams = useNutrition((s) => s.lastGrams);
  const entries = useNutrition((s) => s.entries);
  const target = usePlan((s) => s.target);
  const profile = useProfile((s) => s.profile);
  const [g, setG] = useState(() => (product ? lastGrams[product.id] ?? product.serving?.grams ?? 100 : 100));
  const [meal, setMeal] = useState<MealSlot>(() => initialMeal ?? mealForHour(new Date().getHours()));
  if (!product) return <Sheet visible={false} onClose={onClose}>{null}</Sheet>;
  const m = macrosFor(product.per100, g);
  const rem = target ? remaining(target, sumMacros(entries.filter((e) => e.date === date))) : null;
  const presets = [...new Set([product.serving?.grams, 50, 100, 150, 200, 250, 350].filter((x): x is number => !!x && x > 0))].slice(0, 7);
  const avoid = profile ? foodAvoidance(profile) : null;
  const allergen = avoid ? allergenIn(`${product.name} ${product.brand ?? ''}`, avoid.allergyWords) : undefined;
  const forbidden = !allergen && profile ? allergenIn(product.name, healthOf(profile).forbiddenFoods) : undefined;
  return (
    <Sheet visible={!!product} onClose={onClose} title={product.name} subtitle={product.brand ?? (product.source === 'local' ? 'Базовый продукт' : product.source === 'custom' ? 'Свой продукт' : 'Open Food Facts')}>
      <View style={{ gap: space.md }}>
        <FavStar id={product.id} />
        {allergen ? <Banner tone="danger" icon="warning-outline" text={`В профиле указано: «${allergen}». Проверь состав на упаковке — название может не отражать все ингредиенты.`} /> : null}
        {forbidden ? <Banner tone="warning" icon="ban-outline" text={`«${forbidden}» в списке запрещённых продуктов профиля.`} /> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {presets.map((x) => (
            <Chip key={x} label={product.serving && x === product.serving.grams ? `${product.serving.label} · ${x} г` : `${x} г`} active={g === x} onPress={() => setG(x)} />
          ))}
        </View>
        <NumberStepper value={g} onChange={setG} step={10} min={1} max={3000} unit="г" />
        <View style={styles.macroBox}>
          <MacroCell label="Ккал" v={m.kcal} rem={rem?.kcal} />
          <MacroCell label="Белки" v={m.protein} rem={rem?.protein} />
          <MacroCell label="Жиры" v={m.fat} rem={rem?.fat} />
          <MacroCell label="Углев." v={m.carbs} rem={rem?.carbs} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(Object.keys(MEAL_LABEL) as MealSlot[]).map((k) => (
            <Chip key={k} label={MEAL_LABEL[k]} active={meal === k} onPress={() => setMeal(k)} />
          ))}
        </View>
        <Button
          title={`Добавить · ${m.kcal} ккал`}
          icon="add"
          size="lg"
          onPress={() => {
            useNutrition.getState().addEntry(product, g, meal, date);
            haptic.success();
            toast(`${product.name} — ${g} г`);
            onAdded();
          }}
        />
      </View>
    </Sheet>
  );
}

function FavStar({ id }: { id: string }) {
  const fav = useNutrition((s) => s.favorites.includes(id));
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={fav ? 'Убрать из избранного' : 'В избранное'} onPress={() => { haptic.tap(); useNutrition.getState().toggleFavorite(id); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }} hitSlop={8}>
      <Icon name={fav ? 'star' : 'star-outline'} size={18} color={fav ? colors.fat : colors.textDim} />
      <T v="small" style={{ fontWeight: '700' }} color={fav ? colors.text : colors.textDim}>
        {fav ? 'В избранном' : 'В избранное'}
      </T>
    </Pressable>
  );
}

function MacroCell({ label, v, rem }: { label: string; v: number; rem?: number }) {
  const over = rem !== undefined && v > rem + (label === 'Ккал' ? 50 : 5) && rem >= 0;
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <T v="caption" style={{ fontSize: 10 }}>
        {label}
      </T>
      <T v="num" style={{ fontSize: 18 }} color={over ? colors.warning : colors.text}>
        {Math.round(v)}
      </T>
      {rem !== undefined ? (
        <T v="small" style={{ fontSize: 10 }}>
          ост. {Math.max(0, Math.round(rem))}
        </T>
      ) : null}
    </View>
  );
}

function BarcodeSheet({ visible, onClose, onFound }: { visible: boolean; onClose: () => void; onFound: (p: FoodProduct) => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const cache = useNutrition((s) => s.cacheProduct);
  const find = async () => {
    setBusy(true);
    setErr(null);
    try {
      const p = await lookupBarcode(code);
      cache(p);
      onFound(p);
      setCode('');
    } catch (e) {
      setErr(foodErrorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Штрихкод" subtitle="В web-превью камера недоступна — введи цифры штрихкода">
      <View style={{ gap: space.md }}>
        <Field placeholder="4600000000000" keyboardType="number-pad" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, ''))} maxLength={14} />
        {err ? <Banner tone="warning" text={err} /> : null}
        <Button title="Найти" icon="search" loading={busy} disabled={code.length < 8} onPress={find} />
      </View>
    </Sheet>
  );
}

function CustomProductSheet({ visible, onClose, onCreated, initialName, barcode }: { visible: boolean; onClose: () => void; onCreated: (p: FoodProduct) => void; initialName: string; barcode?: string }) {
  const [name, setName] = useState('');
  const [v, setV] = useState({ kcal: '', protein: '', fat: '', carbs: '' });
  // При открытии листа подставляем то, что искали
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
  const valid = name.trim().length > 1 && kcal > 0 && p <= 100 && f <= 100 && c <= 100;
  return (
    <Sheet visible={visible} onClose={onClose} title="Свой продукт" subtitle="Данные с этикетки, на 100 г">
      <View style={{ gap: space.md }}>
        <Field label="Название" value={name} onChangeText={setName} placeholder="Например: Сырники мамины" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Field style={{ flex: 1 }} label="Белки, г" keyboardType="decimal-pad" value={v.protein} onChangeText={(t) => setV({ ...v, protein: t })} />
          <Field style={{ flex: 1 }} label="Жиры, г" keyboardType="decimal-pad" value={v.fat} onChangeText={(t) => setV({ ...v, fat: t })} />
          <Field style={{ flex: 1 }} label="Углев., г" keyboardType="decimal-pad" value={v.carbs} onChangeText={(t) => setV({ ...v, carbs: t })} />
        </View>
        <Field label="Ккал (если пусто — посчитаем)" keyboardType="decimal-pad" value={v.kcal} onChangeText={(t) => setV({ ...v, kcal: t })} placeholder={String(kcal)} />
        <Button
          title="Сохранить продукт"
          icon="checkmark"
          disabled={!valid}
          onPress={() => {
            const prod: FoodProduct = { id: `custom:${uid()}`, name: name.trim(), per100: { kcal, protein: p, fat: f, carbs: c }, source: 'custom', barcode: barcode || undefined };
            useNutrition.getState().cacheProduct(prod);
            setV({ kcal: '', protein: '', fat: '', carbs: '' });
            onCreated(prod);
          }}
        />
      </View>
    </Sheet>
  );
}

const styles = themed({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 50, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12 },
  input: { flex: 1, minWidth: 0, color: colors.text, fontSize: 16, height: '100%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.surface, marginBottom: 6, borderWidth: 1, borderColor: colors.border, minHeight: 56 },
  macroBox: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: radius.md, paddingVertical: 12 },
});

