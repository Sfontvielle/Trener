/**
 * Логика сканера штрихкодов без камеры (тестируется в node).
 *
 * Проблема: AVFoundation присылает onBarcodeScanned на КАЖДЫЙ кадр, пока код в кадре (до 30 раз/с),
 * а setState в React асинхронен — блокировка через state пропускала несколько вызовов подряд,
 * и продукт мог добавиться/искаться повторно. Здесь синхронный «замок»: первый валидный код
 * захватывает сканер, все последующие вызовы игнорируются до явного retry().
 */

/** Контрольная цифра EAN-13 / EAN-8 / UPC-A (12) — отсекает «полу-резкие» ошибочные считывания */
export function isValidGtin(code: string): boolean {
  const d = code.replace(/\D/g, '');
  if (d !== code.trim() || ![8, 12, 13, 14].includes(d.length)) return false;
  const digits = d.split('').map(Number);
  const check = digits.pop()!;
  let sum = 0;
  // Справа налево: веса 3,1,3,1…
  digits.reverse().forEach((n, i) => (sum += n * (i % 2 === 0 ? 3 : 1)));
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * UPC-E (8 цифр) разворачивается в UPC-A — Open Food Facts хранит полную форму.
 * 8 цифр бывают и EAN-8, поэтому решает тип, который сообщает сканер (iOS: 'upc_e').
 */
export function normalizeBarcode(raw: string, type?: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.length === 8 && (d[0] === '0' || d[0] === '1') && (type === 'upc_e' || (!type && !isValidGtin(d)))) {
    const [ns, m, check] = [d[0], d.slice(1, 7), d[7]];
    const last = m[5];
    let body: string;
    if ('012'.includes(last)) body = `${m.slice(0, 2)}${last}0000${m.slice(2, 5)}`;
    else if (last === '3') body = `${m.slice(0, 3)}00000${m.slice(3, 5)}`;
    else if (last === '4') body = `${m.slice(0, 4)}00000${m[4]}`;
    else body = `${m.slice(0, 5)}0000${last}`;
    return `${ns}${body}${check}`;
  }
  return d;
}

/**
 * Варианты одного кода для поиска в базе: одна и та же упаковка записана в разных системах по-разному
 * (UPC-A 12 цифр ↔ EAN-13 с ведущим 0, GTIN-14 с ведущими нулями ↔ EAN-13, UPC-E ↔ UPC-A).
 * Возвращает только коды с верной контрольной цифрой, без повторов, исходный — первым.
 */
export function barcodeCandidates(raw: string, type?: string): string[] {
  const d = normalizeBarcode(raw, type);
  const out: string[] = [];
  const add = (c: string) => {
    if (c && isValidGtin(c) && !out.includes(c)) out.push(c);
  };
  add(d);
  if (d.length === 12) add(`0${d}`);
  if (d.length === 13 && d[0] === '0') add(d.slice(1));
  if (d.length === 14) {
    if (d[0] === '0') add(d.slice(1));
    if (d.startsWith('00')) add(d.slice(2));
  }
  // 8 цифр: и как EAN-8, и как развёрнутый UPC-E (сканер не всегда верно сообщает тип)
  const raw8 = raw.replace(/\D/g, '');
  if (raw8.length === 8) {
    add(raw8);
    const upcA = normalizeBarcode(raw8, 'upc_e');
    if (upcA.length === 12) {
      add(upcA);
      add(`0${upcA}`);
    }
  }
  return out;
}

export type ScanPhase = 'scanning' | 'locked';

export class ScanGate {
  private phase: ScanPhase = 'scanning';
  private lastCode: string | null = null;
  /** Сколько событий было проглочено после захвата (для диагностики/тестов) */
  ignored = 0;

  get state(): ScanPhase {
    return this.phase;
  }

  get code(): string | null {
    return this.lastCode;
  }

  private pending: string | null = null;

  /**
   * Код — только для первого валидного считывания; дальше null до retry(). Короткие коды (8 цифр) нужно
   * прочитать дважды подряд: их чаще всего «находит» в куске длинного кода или в смазанном кадре.
   */
  accept(raw: string, type?: string): string | null {
    if (this.phase === 'locked') {
      this.ignored++;
      return null;
    }
    const code = normalizeBarcode(raw, type);
    if (!isValidGtin(code)) {
      this.pending = null;
      return null;
    }
    if (code.length === 8 && this.pending !== code) {
      this.pending = code;
      return null;
    }
    this.phase = 'locked';
    this.lastCode = code;
    this.pending = null;
    return code;
  }

  /** «Сканировать ещё раз» — единственный способ снова принимать коды */
  retry() {
    this.phase = 'scanning';
    this.lastCode = null;
    this.pending = null;
    this.ignored = 0;
  }
}

/** Что показывать вместо камеры при разных состояниях разрешения */
export type CameraGateState = 'loading' | 'ask' | 'settings' | 'ready';

export function cameraGate(perm: { granted: boolean; canAskAgain: boolean } | null | undefined): CameraGateState {
  if (!perm) return 'loading';
  if (perm.granted) return 'ready';
  return perm.canAskAgain ? 'ask' : 'settings';
}

/**
 * Какую камеру выбрать. На iPhone 13 Pro и новее основная широкоугольная камера (её expo-camera
 * берёт по умолчанию) не фокусируется ближе ~20 см, а штрихкод держат на 8–15 см — отсюда «мыло».
 * Виртуальные камеры (Triple / Dual Wide) сами переключаются на сверхширик с макро-фокусом вблизи —
 * так работает и системная Камера iPhone. С SDK 58 expo-camera отдаёт объективы объектами: выбираем по
 * устойчивому deviceType (AVCaptureDevice.DeviceType), локализованное имя — только запасной вариант.
 */
export interface LensLike {
  deviceType: string;
  localizedName?: string;
}

const LENS_PRIORITY: [deviceType: string, name: string][] = [
  ['AVCaptureDeviceTypeBuiltInTripleCamera', 'Back Triple Camera'],
  ['AVCaptureDeviceTypeBuiltInDualWideCamera', 'Back Dual Wide Camera'],
  ['AVCaptureDeviceTypeBuiltInDualCamera', 'Back Dual Camera'],
  ['AVCaptureDeviceTypeBuiltInWideAngleCamera', 'Back Camera'],
];

/** Возвращает deviceType для selectedLens */
export function pickScanLens(available: LensLike[]): string | undefined {
  for (const [type, name] of LENS_PRIORITY) {
    const hit = available.find((l) => l.deviceType === type && !/front/i.test(l.localizedName ?? '')) ?? available.find((l) => l.localizedName === name);
    if (hit) return hit.deviceType;
  }
  return undefined;
}

const VIRTUAL = new Set(['AVCaptureDeviceTypeBuiltInTripleCamera', 'AVCaptureDeviceTypeBuiltInDualWideCamera']);

/**
 * Начальный zoom (0..1 в API expo-camera, фактор = max^zoom). Виртуальная камера на factor 1 показывает
 * сверхширик (0.5×) — код выглядит мелким. Около 2× (= обычный 1× в Камере) удобно и не мешает макро.
 * Для одиночной широкоугольной камеры — лёгкое приближение, чтобы телефон держали дальше мин. дистанции.
 */
export function scanZoom(lens: string | undefined): number {
  if (lens && VIRTUAL.has(lens)) return 0.14;
  return 0.06;
}
