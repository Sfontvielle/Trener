import type { CoachMemoryItem } from '@/types';

/**
 * Память тренера на устройстве: из сообщений пользователя извлекаются устойчивые факты
 * (здоровье, диагнозы, лекарства, травмы, питание, цели, режим, рекорды) — тренер учитывает их в ответах.
 * Только то, что человек сказал о себе сам; ничего не додумываем.
 */
export interface Fact {
  text: string;
  category: CoachMemoryItem['category'];
}

const HEALTH = /(гипотиреоз|гипертиреоз|тиреоидит|хашимото|аутоиммун|узл\S* щитовид|щитовидк|диабет|преддиабет|инсулинорезист|гипертон|давлени|аритми|тахикард|астм|гастрит|язв|рефлюкс|изжог|панкреатит|желчн|холецист|синдром раздраж|срк|колит|цели\S*|глютен|лактоз|аллерги|анеми|низк\S* ферритин|подагр|мочев\S* кислот|холестерин|жиров\S* гепатоз|печен|почк|камн\S* в почк|спкя|поликистоз|эндометриоз|бесплод|пролактин|низк\S* тестостерон|гипогонадизм|варикоз|тромб|мигрен|депресс|тревожн|бессонниц|апноэ|сколиоз|кифоз|лордоз|остеохондроз|протрузи|грыж|радикулит|плоскостоп|артроз|артрит|мениск|крестообраз|связк|тендинит|эпикондилит|бурсит|импинджмент|вращательн\S* манжет)/;
const PAIN = /(болит|боль в|болят|ноет|тянет|травм|надрыв|растяжени|вывих|операци)/;
const FOOD = /(не ем|не люблю|не перенош|не пью молок|аллерги\S* на|непереносимост|вегетариан|веган|пост соблюд|халял|кошер|без глютена|без лактозы|без сахара)/;
const MEDS = /(принимаю|пью (таблетк|препарат|лекарств)|назначил\S* (врач|эндокринолог)|на заместительн|на трт|l-тироксин|эутирокс|метформин|левотирокс|гормональн\S* терапи)/;
const GOAL = /(хочу (выступ|соревн|подготов|набрать|сбросить|похудеть|рельеф|сил\S*)|готовлюсь к|соревнован|турнир|сцен\S*|мен.?с.?физик|бодибилдинг|бикини|фитнес-бикини|пауэрлифтинг|к лету|к свадьб)/;
const SCHEDULE = /(работаю (в ночь|посменно|сменами|сутки)|ночные смены|могу тренироваться только|тренируюсь (утром|вечером|в обед)|командировк|маленький ребенок|мало времени)/;
const RECORD = /(пожал|присел|потянул|сделал|выжал|подтянулся|отжался)\s+(\d{2,3}(?:[.,]\d)?)\s*(кг|раз)?/;

const clean = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');

/** Предложения сообщения, в которых человек говорит о себе */
function aboutSelf(text: string): string[] {
  return text
    .split(/(?<=[.!?\n])\s+/)
    .map(clean)
    .filter((s) => s.length >= 6 && /(^|\s)(у меня|мне |я |мой |моя |мои |меня |у моего|диагноз|поставили|принимаю|не ем|не люблю|готовлюсь|работаю|болит|болят|ноет|пожал|присел|потянул)/i.test(` ${s.toLowerCase()} `));
}

export function extractFacts(text: string, date: string): Fact[] {
  const out: Fact[] = [];
  for (const raw of aboutSelf(text)) {
    const s = raw.toLowerCase().replace(/ё/g, 'е');
    // Вопросы «можно ли мне…» без утверждения о себе — не факты
    if (/^(можно ли|как |что |почему|сколько|зачем)/.test(s) && !/(у меня|мне поставили|я принимаю)/.test(s)) continue;
    const short = raw.length > 140 ? `${raw.slice(0, 137)}…` : raw;
    if (MEDS.test(s)) out.push({ text: `Принимает/лечение: ${short}`, category: 'health' });
    else if (HEALTH.test(s)) out.push({ text: `Здоровье: ${short}`, category: PAIN.test(s) ? 'injury' : 'health' });
    else if (PAIN.test(s)) out.push({ text: `${date}: ${short}`, category: 'injury' });
    else if (FOOD.test(s)) out.push({ text: `Питание: ${short}`, category: 'food' });
    else if (GOAL.test(s)) out.push({ text: `Цель: ${short}`, category: 'preference' });
    else if (SCHEDULE.test(s)) out.push({ text: `Режим: ${short}`, category: 'schedule' });
    else if (RECORD.test(s)) out.push({ text: `${date}: ${short}`, category: 'training' });
  }
  return out;
}

/** Факты, относящиеся к вопросу: по общим основам слов (для персонализации ответа) */
export function relevantMemory(memory: CoachMemoryItem[], question: string, extraKeys: string[] = []): CoachMemoryItem[] {
  const words = new Set(
    `${question} ${extraKeys.join(' ')}`
      .toLowerCase()
      .replace(/ё/g, 'е')
      .split(/[^а-яa-z0-9]+/)
      .filter((w) => w.length >= 4)
      .map((w) => w.slice(0, 5)),
  );
  return memory.filter((m) => {
    const mw = m.text.toLowerCase().replace(/ё/g, 'е').split(/[^а-яa-z0-9]+/).filter((w) => w.length >= 4).map((w) => w.slice(0, 5));
    return mw.some((w) => words.has(w));
  });
}
