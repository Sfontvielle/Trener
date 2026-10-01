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

/** UPC-E (6–8 цифр) разворачивается в UPC-A — Open Food Facts хранит полную форму */
export function normalizeBarcode(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.length === 8 && (d[0] === '0' || d[0] === '1') && !isValidGtin(d)) {
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

  /** true — только для первого валидного кода; дальше false до retry() */
  accept(raw: string): string | null {
    if (this.phase === 'locked') {
      this.ignored++;
      return null;
    }
    const code = normalizeBarcode(raw);
    if (!isValidGtin(code)) return null;
    this.phase = 'locked';
    this.lastCode = code;
    return code;
  }

  /** «Сканировать ещё раз» — единственный способ снова принимать коды */
  retry() {
    this.phase = 'scanning';
    this.lastCode = null;
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
 * так работает и системная Камера iPhone. Имена — localizedName устройств AVFoundation.
 */
const LENS_PRIORITY = ['Back Triple Camera', 'Back Dual Wide Camera', 'Back Dual Camera', 'Back Camera'];

export function pickScanLens(available: string[]): string | undefined {
  for (const name of LENS_PRIORITY) if (available.includes(name)) return name;
  return undefined;
}

/**
 * Начальный zoom (0..1 в API expo-camera, фактор = max^zoom). Виртуальная камера на factor 1 показывает
 * сверхширик (0.5×) — код выглядит мелким. Около 2× (= обычный 1× в Камере) удобно и не мешает макро.
 * Для одиночной широкоугольной камеры — лёгкое приближение, чтобы телефон держали дальше мин. дистанции.
 */
export function scanZoom(lens: string | undefined): number {
  if (lens === 'Back Triple Camera' || lens === 'Back Dual Wide Camera') return 0.14;
  return 0.06;
}
