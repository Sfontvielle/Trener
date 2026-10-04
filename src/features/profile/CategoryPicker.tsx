import React, { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Sheet } from '@/components/Sheet';
import { Button, Chip, Icon, T } from '@/components/ui';
import { colors, radius, space, themed } from '@/theme';

/**
 * Каталоги для выбора в «Здоровье и особенности» и «Питание».
 * «Популярное» — первые элементы списка; остальное находится поиском.
 */
export type PickerCategory = 'liked' | 'disliked' | 'forbidden' | 'allergies' | 'intolerances' | 'injuries' | 'chronic' | 'painful' | 'medical';

const FOODS = ['Курица', 'Индейка', 'Говядина', 'Свинина', 'Рыба', 'Лосось', 'Тунец', 'Креветки', 'Яйца', 'Творог', 'Скир', 'Греческий йогурт', 'Молоко', 'Кефир', 'Сыр', 'Тофу', 'Рис', 'Гречка', 'Овсянка', 'Киноа', 'Макароны', 'Картофель', 'Хлеб', 'Бананы', 'Яблоки', 'Ягоды', 'Авокадо', 'Брокколи', 'Огурцы', 'Помидоры', 'Грибы', 'Печень', 'Бобовые', 'Орехи', 'Арахисовая паста', 'Мёд', 'Шоколад', 'Кофе', 'Сахар', 'Алкоголь', 'Фастфуд', 'Газировка'];

export const PICKER_CATALOG: Record<PickerCategory, { title: string; popular: string[]; all: string[] }> = {
  liked: { title: 'Любимые продукты', popular: ['Курица', 'Творог', 'Рис', 'Гречка', 'Яйца', 'Овсянка', 'Говядина', 'Лосось', 'Бананы', 'Картофель'], all: FOODS },
  disliked: { title: 'Не ешь / не любишь', popular: ['Рыба', 'Молоко', 'Грибы', 'Свинина', 'Печень', 'Творог', 'Бобовые'], all: FOODS },
  forbidden: { title: 'Запрещённые продукты', popular: ['Сахар', 'Алкоголь', 'Кофе', 'Фастфуд', 'Газировка', 'Свинина'], all: FOODS },
  allergies: {
    title: 'Аллергии',
    popular: ['Орехи', 'Арахис', 'Молоко', 'Яйца', 'Рыба', 'Морепродукты', 'Пшеница', 'Соя', 'Кунжут', 'Мёд'],
    all: ['Горчица', 'Сельдерей', 'Люпин', 'Моллюски', 'Ракообразные', 'Цитрусовые', 'Клубника', 'Шоколад', 'Киви', 'Сульфиты'],
  },
  intolerances: { title: 'Непереносимости', popular: ['Лактоза', 'Глютен', 'Фруктоза', 'Гистамин', 'Кофеин'], all: ['Сорбит', 'FODMAP', 'Бобовые', 'Острое', 'Жирная пища', 'Сахарозаменители'] },
  injuries: {
    title: 'Травмы',
    popular: ['Плечо', 'Колено', 'Поясница', 'Локоть', 'Запястье', 'Шея', 'Голеностоп', 'Тазобедренный сустав'],
    all: ['Ротаторная манжета', 'Мениск', 'Крестообразная связка', 'Ахиллово сухожилие', 'Грудной отдел спины', 'Растяжение задней поверхности бедра', 'Грыжа диска', 'Тендинит локтя'],
  },
  chronic: {
    title: 'Хронические ограничения',
    popular: ['Протрузия/грыжа диска', 'Гипертония', 'Астма', 'Сколиоз', 'Артроз колена', 'Диабет'],
    all: ['Варикоз', 'Пролапс митрального клапана', 'Остеохондроз', 'Плоскостопие', 'Мигрень', 'Гипотония', 'Аритмия'],
  },
  painful: {
    title: 'Движения, вызывающие боль',
    popular: ['Глубокий присед', 'Жим над головой', 'Становая тяга', 'Выпады', 'Прыжки', 'Бег', 'Отжимания на брусьях'],
    all: ['Жим лёжа', 'Подтягивания', 'Наклоны вперёд', 'Скручивания', 'Тяга в наклоне', 'Разгибания ног', 'Румынская тяга'],
  },
  medical: {
    title: 'Ограничения от врача',
    popular: ['Без осевой нагрузки', 'Без прыжков', 'Без натуживания', 'Без работы до отказа', 'Без нагрузки на плечо', 'Ограничить пульс'],
    all: ['Без бега', 'Без упражнений лёжа на спине', 'Без глубоких приседаний', 'Без скручиваний', 'Только лёгкие веса'],
  },
};

const norm = (s: string) => s.trim().toLowerCase().replace(/ё/g, 'е');

/** Разбор текстового поля на элементы (через запятую/точку с запятой/перевод строки) */
export function splitItems(text: string): string[] {
  return text
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function joinItems(items: string[]): string {
  return items.join(', ');
}

/** Чистая логика выбора: переключить элемент без дублей (регистр и «ё» не важны) */
export function toggleItem(list: string[], item: string): string[] {
  const t = item.trim();
  if (!t) return list;
  return list.some((x) => norm(x) === norm(t)) ? list.filter((x) => norm(x) !== norm(t)) : [...list, t];
}

/**
 * Лист выбора: поиск, популярное, мультивыбор, выбранное с удалением, «Другое» (свой вариант),
 * Отмена/Сохранить. При открытии показывает текущее состояние.
 */
export function CategoryPicker({ visible, category, value, onClose, onSave }: { visible: boolean; category: PickerCategory; value: string[]; onClose: () => void; onSave: (v: string[]) => void }) {
  const cat = PICKER_CATALOG[category];
  const [sel, setSel] = useState(value);
  const [q, setQ] = useState('');
  const [wasVisible, setWasVisible] = useState(visible);
  // Синхронизация с текущим значением при каждом открытии (без эффекта — состояние от пропсов)
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setSel(value);
      setQ('');
    }
  }
  const all = Array.from(new Set([...cat.popular, ...cat.all]));
  const query = norm(q);
  const list = query ? all.filter((x) => norm(x).includes(query)) : cat.popular;
  const custom = q.trim() && !all.some((x) => norm(x) === query) && !sel.some((x) => norm(x) === query) ? q.trim() : '';
  const isSel = (x: string) => sel.some((s) => norm(s) === norm(x));
  const toggle = (x: string) => {
    setSel((cur) => toggleItem(cur, x));
  };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={cat.title}
      footer={
        <View style={styles.footer}>
          <Button title="Отмена" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          <Button
            title="Сохранить"
            onPress={() => {
              onSave(sel);
              onClose();
            }}
            style={{ flex: 1 }}
          />
        </View>
      }
    >
      <View style={{ gap: space.md }}>
        <View style={styles.search}>
          <Icon name="search" size={18} color={colors.muted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Поиск или свой вариант"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            selectionColor={colors.accent}
            returnKeyType="done"
            onSubmitEditing={() => {
              if (custom) {
                toggle(custom);
                setQ('');
              }
            }}
            accessibilityLabel="Поиск"
          />
          {q ? (
            <Pressable onPress={() => setQ('')} accessibilityLabel="Очистить поиск" hitSlop={8}>
              <Icon name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>

        {sel.length ? (
          <View style={{ gap: 6 }}>
            <T v="caption">Выбрано · {sel.length}</T>
            <View style={styles.wrap}>
              {sel.map((v) => (
                <Pressable key={v} accessibilityLabel={`Убрать ${v}`} onPress={() => toggle(v)} style={styles.tag}>
                  <T v="small" color={colors.onAccent} style={{ fontWeight: '700' }}>
                    {v}
                  </T>
                  <Icon name="close" size={14} color={colors.onAccent} />
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <View style={{ gap: 6 }}>
          <T v="caption">{query ? 'Найдено' : 'Популярное'}</T>
          <View style={styles.wrap}>
            {list.map((x) => (
              <Chip key={x} label={x} active={isSel(x)} icon={isSel(x) ? 'checkmark' : undefined} onPress={() => toggle(x)} style={{ height: 36 }} />
            ))}
          </View>
          {query && !list.length && !custom ? <T v="small">Уже выбрано.</T> : null}
        </View>

        {custom ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Добавить «${custom}»`}
            onPress={() => {
              toggle(custom);
              setQ('');
            }}
            style={styles.custom}
          >
            <Icon name="add-circle" size={20} color={colors.accent} />
            <T v="body" style={{ flex: 1 }}>
              Другое: «{custom}»
            </T>
          </Pressable>
        ) : !query ? (
          <T v="small">Нет в списке? Введи свой вариант в поиск — появится «Другое».</T>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = themed({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accent, paddingHorizontal: 12, height: 32, borderRadius: radius.pill },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md },
  searchInput: { flex: 1, minWidth: 0, height: 46, color: colors.text, fontSize: 16 },
  custom: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accentLine },
  footer: { flexDirection: 'row', gap: space.sm },
});
