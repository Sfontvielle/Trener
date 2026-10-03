import type { FoodEntry, FoodProduct, Macros, UserProfile } from '@/types';
import { LOCAL_FOODS } from '@/data/foods';
import { macrosFor } from './status';
import { allergenIn, foodAvoidance } from '@/features/profile/health';

export interface SuggestionItem {
  product: FoodProduct;
  grams: number;
  macros: Macros;
}

export interface MealSuggestion {
  id: string;
  title: string;
  items: SuggestionItem[];
  total: Macros;
  why: string;
}

export interface SuggestResult {
  notes: string[];
  options: MealSuggestion[];
}

const MEAT_WORDS = ['кур', 'индей', 'говяд', 'свин', 'фарш', 'ветчин', 'пельмен', 'плов'];
const FISH_WORDS = ['лосос', 'треск', 'тунец', 'кревет', 'рыб', 'сёмг', 'семг', 'форел'];

function matchesAny(name: string, words: string[]): boolean {
  const n = name.toLowerCase();
  return words.some((w) => w.trim() && n.includes(w.trim().toLowerCase().slice(0, Math.max(3, w.trim().length - 2))));
}

function allowed(p: FoodProduct, profile: UserProfile): boolean {
  // Не любит + аллергии + непереносимости + запрещённые продукты из профиля здоровья
  const avoid = foodAvoidance(profile);
  if (matchesAny(p.name, avoid.words) || allergenIn(p.name, avoid.allergyWords)) return false;
  const r = avoid.restrictions;
  const tags = p.tags ?? [];
  // «Не люблю рыбу/мясо/молочку» — исключаем всю категорию, а не только слово в названии
  const dis = avoid.words.join(' ').toLowerCase();
  if (/рыб|морепрод/.test(dis) && (tags.includes('fish') || matchesAny(p.name, FISH_WORDS))) return false;
  if (/мяс/.test(dis) && tags.includes('meat')) return false;
  if (/молок|молоч/.test(dis) && tags.includes('dairy')) return false;
  if (r.includes('vegetarian') && (tags.includes('meat') || tags.includes('fish') || matchesAny(p.name, [...MEAT_WORDS, ...FISH_WORDS]))) return false;
  if (r.includes('no_fish') && (tags.includes('fish') || matchesAny(p.name, FISH_WORDS))) return false;
  if (r.includes('lactose') && tags.includes('dairy')) return false;
  if (r.includes('gluten') && /хлеб|макарон|булгур|лаваш|паст|гранол|пельмен/i.test(p.name)) return false;
  return true;
}

function preferenceBonus(p: FoodProduct, profile: UserProfile, recentIds: Set<string>, eatenToday: Set<string>, hour: number): number {
  let b = 0;
  if (matchesAny(p.name, profile.likedFoods)) b += 0.35;
  if (recentIds.has(p.id)) b += 0.15;
  if (eatenToday.has(p.id)) b -= 0.2;
  const tags = p.tags ?? [];
  if (hour < 11 && tags.includes('breakfast')) b += 0.2;
  if (hour >= 20 && tags.includes('dairy') && tags.includes('protein')) b += 0.15; // творог/скир на вечер
  if (hour >= 21 && (p.per100.fat > 15 || p.per100.kcal > 300)) b -= 0.1;
  return b;
}

/**
 * «Что добрать»: подбирает 1–3 продукта под остаток КБЖУ.
 * Перебор граммовок (шаг 10 г) по парам «белок + углеводы» с учётом предпочтений,
 * уже съеденного, времени суток и ограничений. Жир сверх остатка штрафуется сильнее всего.
 */
export function suggestMeals(args: {
  remaining: Macros;
  profile: UserProfile;
  todayEntries: FoodEntry[];
  recentProducts: FoodProduct[];
  hour?: number;
}): SuggestResult {
  const { remaining: R, profile, todayEntries } = args;
  const hour = args.hour ?? new Date().getHours();
  const notes: string[] = [];

  if (R.kcal < 80 && R.protein < 10) {
    if (R.kcal < -150) notes.push(`Лимит калорий превышен на ${Math.round(-R.kcal)} ккал. Больше сегодня не добавляй — один день ничего не ломает, завтра по плану.`);
    else notes.push('Норма на сегодня выбрана. Если голоден — овощи или напиток без сахара.');
    return { notes, options: [] };
  }
  if (R.fat < -5) notes.push(`Жиры уже превышены на ${Math.round(-R.fat)} г — сегодня без орехов, масла, сыра и жирного мяса.`);
  else if (R.fat < 6) notes.push('Жиров почти достаточно — выбирай постное.');
  if (R.protein <= 5) notes.push('Белок на сегодня добран — дальше углеводы и овощи.');
  if (R.carbs < -10) notes.push(`Углеводов уже на ${Math.round(-R.carbs)} г больше плана — сделай упор на белок и овощи.`);

  const recentIds = new Set(args.recentProducts.map((p) => p.id));
  const eatenToday = new Set(todayEntries.map((e) => e.productId));
  // Сырые/сухие ингредиенты годятся для дневника, но не для готового совета
  const pool = dedupe([...args.recentProducts, ...LOCAL_FOODS]).filter((p) => allowed(p, profile) && p.per100.kcal > 0 && !/сыро[ей]|сух(ой|ие)/i.test(p.name));

  // Подбираем ОДИН приём пищи: остаток делится на оставшиеся приёмы (утром — не весь день сразу)
  const mealsLeft = hour < 11 ? 4 : hour < 15 ? 3 : hour < 19 ? 2 : 1;
  const share = mealsLeft === 1 ? 1 : Math.min(1, Math.max(1 / mealsLeft, 450 / Math.max(1, R.kcal)));
  const M: Macros = {
    kcal: Math.min(R.kcal * share, 1100),
    protein: Math.max(0, R.protein) * Math.max(share, mealsLeft === 1 ? 1 : 0.35),
    fat: Math.max(0, R.fat) * share,
    carbs: Math.max(0, R.carbs) * share,
  };
  if (mealsLeft > 1 && R.kcal > 700) notes.push(`До конца дня ${Math.round(R.kcal)} ккал — ниже варианты на один приём (~${Math.round(M.kcal / 10) * 10} ккал).`);
  const needProtein = M.protein > 8;
  const needCarbs = M.carbs > 15;
  const fatBudget = Math.max(0, M.fat);

  const proteins = pool
    .filter((p) => (p.tags?.includes('protein') || p.per100.protein >= 15) && p.per100.protein / Math.max(1, p.per100.kcal) > 0.08)
    .filter((p) => (fatBudget < 10 ? p.per100.fat <= 6 : true));
  const carbs = pool.filter(
    (p) =>
      (p.tags?.includes('carb') || p.per100.carbs >= 15) &&
      p.per100.fat < 10 &&
      p.per100.protein < 15 &&
      // без «пустых» углеводов: сахар, мёд, сладкие напитки, снеки
      !(p.tags?.includes('snack') && !p.tags?.includes('fruit')) &&
      !/сахар|м[её]д|кола|сок|газиров|конфет/i.test(p.name),
  );
  const veg = pool.filter((p) => p.tags?.includes('veg') && p.per100.kcal < 50);

  const addVeg = hour >= 11 && M.kcal > 300;
  const vegItem = addVeg ? pickVeg(veg, profile, recentIds) : undefined;
  const vegM = vegItem ? macrosFor(vegItem.per100, 150) : { kcal: 0, protein: 0, fat: 0, carbs: 0 };
  const Rv: Macros = { kcal: M.kcal - vegM.kcal, protein: M.protein - vegM.protein, fat: M.fat - vegM.fat, carbs: M.carbs - vegM.carbs };

  type Cand = { items: SuggestionItem[]; total: Macros; score: number; key: string };
  const cands: Cand[] = [];

  const scoreOf = (m: Macros, pref: number): number => {
    const pe = needProtein ? Math.abs(m.protein - Rv.protein) / Math.max(20, Rv.protein) : Math.max(0, m.protein - Math.max(0, Rv.protein) - 10) / 30;
    const ce = needCarbs ? Math.abs(m.carbs - Rv.carbs) / Math.max(30, Rv.carbs) : Math.max(0, m.carbs - Math.max(0, Rv.carbs)) / 30;
    const ke = Math.max(0, m.kcal - Rv.kcal) / 150 + Math.max(0, Rv.kcal - m.kcal) / 600;
    const fo = Math.max(0, m.fat - Math.max(0, Rv.fat)) / 6;
    return pe * 2.2 + ce * 1.2 + ke * 1.5 + fo * 2.5 - pref;
  };

  // Реалистичные порции: плотные продукты — меньше, штучные — до 3 порций
  const gramsRange = (p: FoodProduct, max: number): number[] => {
    const out: number[] = [];
    const small = p.serving && p.serving.grams <= 60;
    const step = small ? p.serving!.grams : 10;
    const density = p.per100.kcal;
    const driedFruit = !!p.tags?.includes('fruit') && density > 200;
    const cap = small ? p.serving!.grams * 3 : driedFruit ? 50 : density > 350 ? 120 : density > 230 ? 150 : density > 150 ? 250 : 350;
    for (let g = step; g <= Math.min(max, cap); g += step) out.push(g);
    return out;
  };

  if (needProtein) {
    for (const P of proteins) {
      const prefP = preferenceBonus(P, profile, recentIds, eatenToday, hour);
      const gP = gramsRange(P, 350);
      const carbList = needCarbs ? carbs : [undefined];
      for (const C of carbList) {
        if (C && !compatible(P, C)) continue;
        const prefC = C ? preferenceBonus(C, profile, recentIds, eatenToday, hour) : 0;
        let best: Cand | undefined;
        for (const gp of gP) {
          const mp = macrosFor(P.per100, gp);
          if (mp.protein > Rv.protein + 15) break;
          for (const gc of C ? gramsRange(C, 400) : [0]) {
            const mc = C ? macrosFor(C.per100, gc) : { kcal: 0, protein: 0, fat: 0, carbs: 0 };
            const m = add(mp, mc);
            if (m.kcal > Rv.kcal + 120) break;
            const s = scoreOf(m, prefP + prefC);
            if (!best || s < best.score) {
              const items: SuggestionItem[] = [{ product: P, grams: gp, macros: mp }];
              if (C) items.push({ product: C, grams: gc, macros: mc });
              best = { items, total: m, score: s, key: P.id };
            }
          }
        }
        if (best) cands.push(best);
      }
    }
  } else if (needCarbs) {
    for (const C of carbs) {
      const pref = preferenceBonus(C, profile, recentIds, eatenToday, hour);
      let best: Cand | undefined;
      for (const g of gramsRange(C, 400)) {
        const m = macrosFor(C.per100, g);
        if (m.kcal > Rv.kcal + 80) break;
        const s = scoreOf(m, pref);
        if (!best || s < best.score) best = { items: [{ product: C, grams: g, macros: m }], total: m, score: s, key: C.id };
      }
      if (best) cands.push(best);
    }
  }

  cands.sort((a, b) => a.score - b.score);
  const seen = new Set<string>();
  const options: MealSuggestion[] = [];
  for (const c of cands) {
    const k2 = c.items.map((i) => i.product.id).join('+');
    if (seen.has(c.key) || seen.has(k2)) continue;
    seen.add(c.key);
    seen.add(k2);
    // Овощи — к мясу/рыбе с гарниром, не к творогу с фруктами
    const withVeg = vegItem && !c.items.some((i) => i.product.tags?.includes('dairy') || i.product.tags?.includes('fruit'));
    const items = withVeg ? [...c.items, { product: vegItem!, grams: 150, macros: vegM }] : c.items;
    const total = withVeg ? add(c.total, vegM) : c.total;
    options.push({
      id: k2,
      title: `Вариант ${options.length + 1}`,
      items,
      total,
      why: explain(c.items, profile, recentIds),
    });
    if (options.length >= 3) break;
  }

  if (options.length === 0 && notes.length === 0) notes.push('Не нашёл подходящей комбинации из твоих продуктов. Добавь любимые продукты в профиле или спроси тренера.');
  return { notes, options };
}

/** Сочетаемость: творог/йогурт — с овсянкой, фруктами, хлебцами; мясо/рыба/яйца — с гарниром и хлебом */
function compatible(P: FoodProduct, C: FoodProduct): boolean {
  const pt = P.tags ?? [];
  const ct = C.tags ?? [];
  const sweetBase = ct.includes('fruit') || ct.includes('breakfast') || /хлебц/i.test(C.name);
  if (pt.includes('dairy')) return sweetBase;
  if (/протеин/i.test(P.name)) return ct.includes('fruit') || ct.includes('breakfast');
  return !ct.includes('fruit') && !/гранол/i.test(C.name);
}

function explain(items: SuggestionItem[], profile: UserProfile, recent: Set<string>): string {
  const liked = items.filter((i) => matchesAny(i.product.name, profile.likedFoods)).map((i) => i.product.name.toLowerCase());
  if (liked.length) return `Из любимого: ${liked.join(', ')}`;
  if (items.some((i) => recent.has(i.product.id))) return 'Из того, что ты обычно ешь';
  return 'Под остаток белка и углеводов';
}

function pickVeg(veg: FoodProduct[], profile: UserProfile, recent: Set<string>): FoodProduct | undefined {
  const liked = veg.find((v) => matchesAny(v.name, profile.likedFoods));
  return liked ?? veg.find((v) => recent.has(v.id)) ?? veg.find((v) => v.id === 'local:veg_mix') ?? veg[0];
}

function add(a: Macros, b: Macros): Macros {
  return { kcal: a.kcal + b.kcal, protein: a.protein + b.protein, fat: a.fat + b.fat, carbs: a.carbs + b.carbs };
}

function dedupe(ps: FoodProduct[]): FoodProduct[] {
  const m = new Map<string, FoodProduct>();
  for (const p of ps) if (!m.has(p.id)) m.set(p.id, p);
  return [...m.values()];
}
