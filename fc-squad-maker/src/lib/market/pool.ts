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
import type { DataSource } from '@/lib/nexon/service';

/**
 * ── 관측 풀 ────────────────────────────────────────────────
 *
 * 조회할 때마다 들어오는 체결 기록을 프로세스 메모리에 쌓아 둔다.
 * 한 계정의 거래 내역은 표본이 얕지만, 조회가 누적되면 카드별 체결가
 * 분포가 잡힌다 — FC INFO 같은 사이트와의 차이는 값이 진짜냐 아니냐가
 * 아니라 표본 범위였고, 이게 그 범위를 넓히는 유일하게 정당한 방법이다.
 *
 * ── 출처가 다른 관측은 절대 섞지 않는다 ──
 * 넥슨이 429 하나만 뱉어도 그 조회는 데모 데이터로 대체된다. 풀이 하나뿐이면
 * 그때 만들어진 가짜 체결이 그대로 남아, 다음 성공 조회가 source: 'nexon'
 * 배지를 달고도 가짜 가격이 섞인 표를 보여 주게 된다. 실데이터라고 말한 표에
 * 지어낸 값이 한 줄이라도 들어가면 그 표 전체를 믿을 수 없다. 그래서 풀을
 * 출처별로 나눠 두고, 조회는 자기 출처의 풀만 본다.
 *
 * ── 이 저장소의 한계를 분명히 ──
 * 프로세스 메모리다. 서버리스(Vercel)에서는 인스턴스가 재활용되면 풀이
 * 비워지고, 인스턴스가 여러 개면 각자 다른 풀을 본다. 그게 정상 동작이며
 * 숨기지 않는다. 영구 저장이 필요하면 아래 absorb/read 두 함수만
 * KV·DB 로 갈아끼우면 되도록 접점을 좁혀 뒀다.
 *
 * ── 보관 기한 ──
 * 오래된 관측은 RETENTION_DAYS(이 프로젝트가 정한 값, 약관 인용이 아니다 —
 * livefeed.ts 주석 참고) 가 지나면 지수에서 뺀다. absorb() 가 매번
 * pruneObservations 를 통과시키므로, 그 제거는 '언젠가'가 아니라 다음
 * 조회 시점에 반드시 일어난다.
 */

interface PoolState {
  observations: Observation[];
  /** 직전 스냅샷의 카드별 지수 — 무엇이 움직였는지 비교하기 위한 것 */
  previousIndex: PriceStat[];
  lastAbsorbedAt: Date | null;
}

type Pools = Record<DataSource, PoolState>;

/**
 * 모듈 스코프 상태. Next.js 개발 서버는 HMR 때 모듈을 다시 평가하므로
 * globalThis 에 매달아 두지 않으면 편집할 때마다 풀이 날아간다.
 */
const GLOBAL_KEY = '__fcMarketPool__';

const emptyPool = (): PoolState => ({ observations: [], previousIndex: [], lastAbsorbedAt: null });

function state(source: DataSource): PoolState {
  const store = globalThis as typeof globalThis & { [GLOBAL_KEY]?: Pools };
  store[GLOBAL_KEY] ??= { nexon: emptyPool(), mock: emptyPool() };
  return store[GLOBAL_KEY][source];
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
 * source 는 이 관측이 어느 풀에 속하는지 — 넥슨에서 온 것과 데모로 지어낸
 * 것은 서로 다른 풀에 쌓인다.
 */
export function absorb(
  incoming: readonly Observation[],
  now = new Date(),
  source: DataSource = 'nexon',
): AbsorbResult {
  const current = state(source);

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
export function read(source: DataSource = 'nexon'): readonly Observation[] {
  return state(source).observations;
}

export function lastAbsorbedAt(source: DataSource = 'nexon'): Date | null {
  return state(source).lastAbsorbedAt;
}

/** 테스트·수동 초기화용. 출처를 지정하지 않으면 전부 비운다. */
export function reset(source?: DataSource): void {
  const store = globalThis as typeof globalThis & { [GLOBAL_KEY]?: Pools };
  if (!source) {
    delete store[GLOBAL_KEY];
    return;
  }
  if (store[GLOBAL_KEY]) store[GLOBAL_KEY][source] = emptyPool();
}
