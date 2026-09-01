import 'server-only';

import {
  diffIndex,
  mergeObservations,
  movers as pickMovers,
  observationKey,
  poolStats,
  pruneObservations,
  type PoolStats,
  type PriceDelta,
} from './livefeed';
import { buildPriceIndex, type Observation, type PriceStat } from './observations';

/**
 * ── 관측 풀 ────────────────────────────────────────────────
 *
 * 조회할 때마다 들어오는 체결 기록을 프로세스 메모리에 쌓아 둔다.
 * 한 계정의 거래 내역은 표본이 얕지만, 조회가 누적되면 카드별 체결가
 * 분포가 잡힌다 — FC INFO 같은 사이트와의 차이는 값이 진짜냐 아니냐가
 * 아니라 표본 범위였고, 이게 그 범위를 넓히는 유일하게 정당한 방법이다.
 *
 * ── 이 저장소의 한계를 분명히 ──
 * 프로세스 메모리다. 서버리스(Vercel)에서는 인스턴스가 재활용되면 풀이
 * 비워지고, 인스턴스가 여러 개면 각자 다른 풀을 본다. 그게 정상 동작이며
 * 숨기지 않는다. 영구 저장이 필요하면 아래 absorb/read 두 함수만
 * KV·DB 로 갈아끼우면 되도록 접점을 좁혀 뒀다.
 *
 * ── 약관 ──
 * 넥슨 Open API 는 받아 둔 데이터를 30일 이내에 갱신할 것을 요구한다.
 * absorb() 가 매번 pruneObservations 를 통과시키므로, 오래된 관측은
 * '언젠가'가 아니라 다음 조회 시점에 반드시 떨어진다.
 */

interface PoolState {
  observations: Observation[];
  /** 직전 스냅샷의 카드별 지수 — 무엇이 움직였는지 비교하기 위한 것 */
  previousIndex: PriceStat[];
  lastAbsorbedAt: Date | null;
}

/**
 * 모듈 스코프 상태. Next.js 개발 서버는 HMR 때 모듈을 다시 평가하므로
 * globalThis 에 매달아 두지 않으면 편집할 때마다 풀이 날아간다.
 */
const GLOBAL_KEY = '__fcMarketPool__';

function state(): PoolState {
  const store = globalThis as typeof globalThis & { [GLOBAL_KEY]?: PoolState };
  store[GLOBAL_KEY] ??= { observations: [], previousIndex: [], lastAbsorbedAt: null };
  return store[GLOBAL_KEY];
}

export interface AbsorbResult {
  stats: PoolStats;
  /** 풀 전체를 다시 접은 지수 */
  pooledIndex: PriceStat[];
  /** 직전 스냅샷 대비 움직인 카드 */
  movers: PriceDelta[];
  /** 이번 조회로 새로 들어온 관측 수 */
  added: number;
  lastAbsorbedAt: Date;
}

/**
 * 새 관측을 풀에 합치고, 직전 스냅샷과 비교해 무엇이 움직였는지 낸다.
 * now 를 받는 이유는 보관 기한 계산을 테스트에서 고정하기 위한 것.
 */
export function absorb(incoming: readonly Observation[], now = new Date()): AbsorbResult {
  const current = state();

  /**
   * 신규 건수는 크기 차이(kept - before)로 재면 안 된다. 같은 조회에서
   * 보관 기한이 지난 관측이 빠지면 그만큼 상쇄되어, 새 체결 20건이
   * 들어와도 만료 20건과 맞물리면 "+0 신규" 로 보인다.
   * 들어오기 전에 없던 키가 몇 개나 살아남았는지로 센다.
   */
  const knownKeys = new Set(current.observations.map(observationKey));

  const merged = mergeObservations(current.observations, incoming);
  const kept = pruneObservations(merged, now);
  const pooledIndex = buildPriceIndex(kept);

  const deltas = diffIndex(current.previousIndex, pooledIndex);

  current.observations = kept;
  current.previousIndex = pooledIndex;
  current.lastAbsorbedAt = now;

  return {
    stats: poolStats(kept),
    pooledIndex,
    movers: pickMovers(deltas),
    added: kept.filter((row) => !knownKeys.has(observationKey(row))).length,
    lastAbsorbedAt: now,
  };
}

/** 지금 풀에 쌓여 있는 관측 (읽기 전용). */
export function read(): readonly Observation[] {
  return state().observations;
}

export function lastAbsorbedAt(): Date | null {
  return state().lastAbsorbedAt;
}

/** 테스트·수동 초기화용. */
export function reset(): void {
  const store = globalThis as typeof globalThis & { [GLOBAL_KEY]?: PoolState };
  delete store[GLOBAL_KEY];
}
