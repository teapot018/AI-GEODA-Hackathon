/**
 * 상자 개봉 시뮬레이터용 결정적 난수기.
 *
 * 시드를 주면 같은 결과를 재현할 수 있어 확률 검증(수십만 회 시행)과
 * 버그 재현이 쉬워진다. 시드를 생략하면 crypto 기반으로 무작위 시작한다.
 */

/** 문자열 -> 32bit 시드 (xmur3) */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** mulberry32 — 짧고 통계적 품질이 충분한 PRNG */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rng {
  /** [0, 1) */
  next(): number;
  /** [min, max] 정수 */
  int(min: number, max: number): number;
  /** 배열에서 하나 균등 추출 */
  pick<T>(items: readonly T[]): T;
  readonly seed: string;
}

export function createRng(seed?: string): Rng {
  const resolved =
    seed ??
    (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
  const next = mulberry32(xmur3(resolved)());

  return {
    seed: resolved,
    next,
    int(min, max) {
      return Math.floor(next() * (max - min + 1)) + min;
    },
    pick(items) {
      if (items.length === 0) throw new Error('pick(): 빈 배열');
      return items[Math.floor(next() * items.length)];
    },
  };
}

/**
 * 가중치 기반 추첨. weights 는 상대 가중치(합이 1일 필요 없음).
 * 누적합 이진 탐색이므로 항목이 많아도 O(log n).
 */
export function weightedPick<T>(
  rng: Rng,
  items: readonly T[],
  weightOf: (item: T) => number,
): T {
  if (items.length === 0) throw new Error('weightedPick(): 빈 배열');

  const cumulative: number[] = new Array(items.length);
  let total = 0;
  for (let i = 0; i < items.length; i += 1) {
    const w = Math.max(0, weightOf(items[i]));
    total += w;
    cumulative[i] = total;
  }
  if (total <= 0) return items[0];

  const target = rng.next() * total;
  let lo = 0;
  let hi = items.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid] <= target) lo = mid + 1;
    else hi = mid;
  }
  return items[lo];
}
