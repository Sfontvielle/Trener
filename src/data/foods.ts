import type { FoodProduct, FoodTag } from '@/types';

/**
 * Базовые продукты (на 100 г, усреднённые справочные значения USDA / таблиц химического состава).
 * Используются офлайн, для быстрого поиска и для подбора «что добрать».
 * Для упакованных продуктов приоритет — штрихкод и данные с этикетки (Open Food Facts).
 */
type Row = [slug: string, name: string, kcal: number, p: number, f: number, c: number, tags: FoodTag[], serving?: [string, number], aliases?: string];

const ROWS: Row[] = [
  // Мясо и птица (готовое, если не указано иное)
  ['chicken_breast', 'Куриная грудка отварная', 137, 29.8, 1.8, 0, ['protein', 'meat', 'lean'], undefined, 'курица филе грудка'],
  ['chicken_breast_raw', 'Куриное филе сырое', 113, 23.6, 1.9, 0.4, ['protein', 'meat', 'lean'], undefined, 'курица филе'],
  ['chicken_thigh', 'Куриное бедро без кожи, запечённое', 179, 24.8, 8.2, 0, ['protein', 'meat'], undefined, 'курица бедро'],
  ['turkey_breast', 'Индейка, филе отварное', 130, 28.6, 1.6, 0, ['protein', 'meat', 'lean'], undefined, 'индейка'],
  ['beef_lean', 'Говядина постная отварная', 187, 29.3, 7.5, 0, ['protein', 'meat'], undefined, 'говядина'],
  ['beef_mince', 'Фарш говяжий 15% (готовый)', 250, 26, 15, 0, ['protein', 'meat'], undefined, 'фарш'],
  ['pork_tenderloin', 'Свиная вырезка запечённая', 143, 26, 3.5, 0, ['protein', 'meat', 'lean'], undefined, 'свинина'],
  ['ham', 'Ветчина', 145, 18, 7.5, 1.5, ['protein', 'meat'], ['2 ломтика', 40]],
  // Рыба
  ['salmon', 'Лосось запечённый', 206, 22, 12.4, 0, ['protein', 'fish'], undefined, 'сёмга форель'],
  ['cod', 'Треска отварная', 105, 23, 0.9, 0, ['protein', 'fish', 'lean'], undefined, 'рыба'],
  ['tuna_can', 'Тунец в собственном соку', 108, 24, 1, 0, ['protein', 'fish', 'lean'], ['банка (слив)', 140]],
  ['shrimp', 'Креветки отварные', 99, 21, 1.1, 0, ['protein', 'fish', 'lean']],
  // Яйца и молочное
  ['egg', 'Яйцо куриное', 155, 12.6, 10.6, 1.1, ['protein', 'breakfast'], ['1 шт', 55], 'яйца'],
  ['egg_white', 'Яичный белок', 52, 10.9, 0.2, 0.7, ['protein', 'lean', 'breakfast'], ['белок 1 яйца', 33]],
  ['cottage_5', 'Творог 5%', 121, 17.2, 5, 1.8, ['protein', 'dairy', 'breakfast', 'snack'], ['пачка', 180], 'творог'],
  ['cottage_0', 'Творог обезжиренный', 71, 16.5, 0.2, 1.3, ['protein', 'dairy', 'lean', 'breakfast', 'snack'], ['пачка', 180], 'творог 0'],
  ['cottage_9', 'Творог 9%', 159, 16.7, 9, 2, ['protein', 'dairy', 'breakfast'], ['пачка', 180]],
  ['skyr', 'Скир / исландский йогурт', 63, 11, 0.2, 3.8, ['protein', 'dairy', 'lean', 'snack', 'breakfast'], ['стакан', 140]],
  ['greek_yogurt', 'Греческий йогурт 2%', 73, 10, 2, 3.9, ['protein', 'dairy', 'snack', 'breakfast'], ['стакан', 150]],
  ['kefir_1', 'Кефир 1%', 40, 3, 1, 4, ['dairy', 'snack'], ['стакан', 250]],
  ['milk_25', 'Молоко 2,5%', 52, 2.8, 2.5, 4.7, ['dairy', 'breakfast'], ['стакан', 250], 'молоко'],
  ['cheese', 'Сыр твёрдый 45%', 356, 26, 27, 0, ['protein', 'dairy', 'fat'], ['ломтик', 20], 'сыр'],
  ['mozzarella', 'Моцарелла', 254, 18, 20, 2, ['dairy', 'fat'], ['шарик', 125]],
  ['whey', 'Протеин сывороточный', 390, 75, 6, 9, ['protein', 'lean', 'snack'], ['скуп', 30], 'протеин сыворотка'],
  ['tofu', 'Тофу', 144, 17.3, 8.7, 2.8, ['protein']],
  // Крупы и гарниры (готовые)
  ['rice_cooked', 'Рис белый отварной', 130, 2.7, 0.3, 28.2, ['carb'], undefined, 'рис'],
  ['rice_dry', 'Рис белый сухой', 344, 6.7, 0.7, 78.9, ['carb'], undefined],
  ['buckwheat_cooked', 'Гречка отварная', 110, 4.2, 1.1, 21.3, ['carb'], undefined, 'гречка'],
  ['oats_dry', 'Овсяные хлопья', 366, 12.3, 6.1, 59.5, ['carb', 'breakfast'], ['порция', 50], 'овсянка геркулес'],
  ['pasta_cooked', 'Макароны отварные', 158, 5.8, 0.9, 30.9, ['carb'], undefined, 'паста'],
  ['potato_boiled', 'Картофель отварной', 86, 1.7, 0.1, 20, ['carb', 'veg'], undefined, 'картошка'],
  ['sweet_potato', 'Батат запечённый', 90, 2, 0.2, 20.7, ['carb', 'veg']],
  ['bulgur_cooked', 'Булгур отварной', 83, 3.1, 0.2, 18.6, ['carb']],
  ['quinoa_cooked', 'Киноа отварная', 120, 4.4, 1.9, 21.3, ['carb']],
  ['bread_rye', 'Хлеб ржаной', 210, 6.6, 1.2, 40.5, ['carb'], ['ломтик', 30], 'хлеб'],
  ['bread_white', 'Хлеб пшеничный', 265, 8.9, 3.2, 49, ['carb'], ['ломтик', 30]],
  ['lavash', 'Лаваш тонкий', 275, 9, 1.2, 56, ['carb'], ['лист', 80]],
  ['granola', 'Гранола', 450, 10, 18, 60, ['carb', 'breakfast', 'fat']],
  ['rice_cakes', 'Хлебцы рисовые', 387, 8, 2.8, 81, ['carb', 'snack'], ['1 шт', 9]],
  // Фрукты
  ['banana', 'Банан', 89, 1.1, 0.3, 22.8, ['fruit', 'carb', 'snack'], ['1 шт', 120]],
  ['apple', 'Яблоко', 52, 0.3, 0.2, 13.8, ['fruit', 'snack'], ['1 шт', 180]],
  ['orange', 'Апельсин', 47, 0.9, 0.1, 11.8, ['fruit', 'snack'], ['1 шт', 150]],
  ['berries', 'Ягоды (смесь)', 50, 0.8, 0.3, 11, ['fruit', 'snack', 'breakfast']],
  ['dates', 'Финики сушёные', 282, 2.5, 0.4, 75, ['fruit', 'carb', 'snack'], ['1 шт', 8]],
  ['raisins', 'Изюм', 299, 3.1, 0.5, 79, ['fruit', 'carb', 'snack']],
  // Овощи
  ['cucumber', 'Огурец', 15, 0.7, 0.1, 3.6, ['veg'], ['1 шт', 120]],
  ['tomato', 'Помидор', 18, 0.9, 0.2, 3.9, ['veg'], ['1 шт', 120]],
  ['broccoli', 'Брокколи отварная', 35, 2.4, 0.4, 7.2, ['veg']],
  ['salad_mix', 'Салат листовой', 15, 1.4, 0.2, 2.9, ['veg']],
  ['veg_mix', 'Овощи замороженные (смесь)', 45, 2.5, 0.3, 8, ['veg'], undefined, 'овощи'],
  ['bell_pepper', 'Перец болгарский', 27, 1, 0.3, 6, ['veg'], ['1 шт', 150]],
  ['carrot', 'Морковь', 41, 0.9, 0.2, 9.6, ['veg'], ['1 шт', 80]],
  // Бобовые
  ['lentils_cooked', 'Чечевица отварная', 116, 9, 0.4, 20.1, ['carb', 'protein']],
  ['chickpeas_cooked', 'Нут отварной', 164, 8.9, 2.6, 27.4, ['carb', 'protein']],
  ['beans_can', 'Фасоль консервированная', 91, 6.2, 0.4, 15.6, ['carb', 'protein']],
  // Жиры и орехи
  ['olive_oil', 'Масло оливковое', 884, 0, 100, 0, ['fat'], ['1 ст. л.', 10], 'масло'],
  ['butter', 'Масло сливочное 82%', 748, 0.5, 82.5, 0.8, ['fat'], ['1 ч. л.', 5]],
  ['peanut_butter', 'Арахисовая паста', 588, 25, 50, 20, ['fat', 'protein', 'snack'], ['1 ст. л.', 16]],
  ['almonds', 'Миндаль', 579, 21, 50, 21.6, ['fat', 'snack'], ['горсть', 30], 'орехи'],
  ['walnuts', 'Грецкий орех', 654, 15.2, 65.2, 13.7, ['fat', 'snack'], ['горсть', 30], 'орехи'],
  ['avocado', 'Авокадо', 160, 2, 14.7, 8.5, ['fat', 'veg'], ['1/2 шт', 70]],
  ['dark_chocolate', 'Шоколад горький 70%', 598, 7.8, 42.6, 45.9, ['fat', 'snack'], ['долька', 10]],
  // Готовое и прочее
  ['borsch', 'Борщ', 49, 1.1, 2.2, 6.7, ['veg'], ['тарелка', 300]],
  ['plov', 'Плов с курицей', 170, 9, 6, 20, ['carb', 'protein'], ['порция', 300]],
  ['pelmeni', 'Пельмени (отварные)', 250, 11, 12, 25, ['protein', 'carb', 'fat'], ['порция', 250]],
  ['syrniki', 'Сырники', 220, 14, 9, 21, ['protein', 'breakfast'], ['1 шт', 60]],
  ['omelette', 'Омлет из 2 яиц с молоком', 154, 10.6, 11.6, 1.6, ['protein', 'breakfast'], ['порция', 150]],
  ['honey', 'Мёд', 304, 0.3, 0, 82.4, ['carb', 'breakfast'], ['1 ч. л.', 10]],
  ['sugar', 'Сахар', 399, 0, 0, 99.8, ['carb'], ['1 ч. л.', 5]],
  ['coke_zero', 'Coca-Cola Zero', 0.3, 0, 0, 0, ['snack'], ['банка', 330], 'кола кока-кола'],
  ['coke', 'Coca-Cola', 42, 0, 0, 10.6, ['snack', 'carb'], ['банка', 330], 'кола кока-кола'],
  ['juice_orange', 'Сок апельсиновый', 45, 0.7, 0.2, 10.4, ['fruit'], ['стакан', 250]],
  ['protein_bar', 'Протеиновый батончик', 350, 30, 10, 35, ['protein', 'snack'], ['1 шт', 60]],
];

/**
 * Клетчатка, г/100 г (USDA FoodData Central, округлено). Продукты животного происхождения, масла, сахар — 0.
 * Для смешанных блюд (борщ, плов, пельмени, сырники) и батончиков состав сильно разнится — значение НЕ задано,
 * и в сводке такие продукты показываются как «нет данных», а не 0.
 */
const ZERO_FIBER = ['chicken_breast', 'chicken_breast_raw', 'chicken_thigh', 'turkey_breast', 'beef_lean', 'beef_mince', 'pork_tenderloin', 'ham', 'salmon', 'cod', 'tuna_can', 'shrimp', 'egg', 'egg_white', 'cottage_5', 'cottage_0', 'cottage_9', 'skyr', 'greek_yogurt', 'kefir_1', 'milk_25', 'cheese', 'mozzarella', 'whey', 'olive_oil', 'butter', 'honey', 'sugar', 'coke_zero', 'coke', 'omelette'];
const FIBER: Record<string, number> = {
  ...Object.fromEntries(ZERO_FIBER.map((k) => [k, 0])),
  tofu: 0.3,
  rice_cooked: 0.4,
  rice_dry: 1.3,
  buckwheat_cooked: 2.7,
  oats_dry: 10.1,
  pasta_cooked: 1.8,
  potato_boiled: 1.8,
  sweet_potato: 3.3,
  bulgur_cooked: 4.5,
  quinoa_cooked: 2.8,
  bread_rye: 5.8,
  bread_white: 2.7,
  lavash: 2.2,
  granola: 6,
  rice_cakes: 4.2,
  banana: 2.6,
  apple: 2.4,
  orange: 2.4,
  berries: 3.5,
  dates: 8,
  raisins: 3.7,
  cucumber: 0.5,
  tomato: 1.2,
  broccoli: 3.3,
  salad_mix: 1.3,
  veg_mix: 4,
  bell_pepper: 2.1,
  carrot: 2.8,
  lentils_cooked: 7.9,
  chickpeas_cooked: 7.6,
  beans_can: 6,
  peanut_butter: 6,
  almonds: 12.5,
  walnuts: 6.7,
  avocado: 6.7,
  dark_chocolate: 10.9,
  juice_orange: 0.2,
};

export const LOCAL_FOODS: FoodProduct[] = ROWS.map(([slug, name, kcal, protein, fat, carbs, tags, serving]) => ({
  id: `local:${slug}`,
  name,
  per100: FIBER[slug] !== undefined ? { kcal, protein, fat, carbs, fiber: FIBER[slug] } : { kcal, protein, fat, carbs },
  serving: serving ? { label: serving[0], grams: serving[1] } : undefined,
  source: 'local',
  tags,
}));

const ALIASES = new Map(ROWS.map((r) => [`local:${r[0]}`, (r[8] ?? '').toLowerCase()]));

export function searchLocalFoods(q: string, limit = 20): FoodProduct[] {
  const query = q.trim().toLowerCase().replace(/ё/g, 'е');
  if (!query) return [];
  const words = query.split(/\s+/);
  const scored: { p: FoodProduct; s: number }[] = [];
  for (const p of LOCAL_FOODS) {
    const hay = `${p.name} ${ALIASES.get(p.id) ?? ''}`.toLowerCase().replace(/ё/g, 'е');
    if (!words.every((w) => hay.includes(w))) continue;
    const s = hay.startsWith(words[0]) ? 0 : 1;
    scored.push({ p, s });
  }
  return scored.sort((a, b) => a.s - b.s || a.p.name.length - b.p.name.length).slice(0, limit).map((x) => x.p);
}

export function getLocalFood(id: string): FoodProduct | undefined {
  return LOCAL_FOODS.find((f) => f.id === id);
}
