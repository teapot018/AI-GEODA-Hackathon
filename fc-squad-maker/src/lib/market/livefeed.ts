import type { Observation, PriceStat } from './observations';

/**
 * ── 거래 관측 누적 피드 ───────────────────────────────────
 *
 * 먼저 못 하는 것부터 분명히 하자. **Open API 에는 호가 엔드포인트가 없다.**
 * 지금 이적시장에 얼마짜리 매물이 걸려 있는지는 공식 API 로 알 수 없고,
 * 그걸 알아내려면 게임 클라이언트나 웹 이적시장을 긁는 수밖에 없다.
 * 이 프로젝트는 그 선을 넘지 않는다.
 *
 * 대신 할 수 있는 것: /user/trade 가 주는 **거래 기록**을 조회할 때마다
 * 쌓아서, 표본이 늘어날수록 촘촘해지는 지수를 만든다. 한 계정의 거래
 * 내역은 표본이 얕지만, 조회가 누적되면 카드별 가격 분포가 잡힌다.
 *
 * '실시간'이라고 부르지 않는다. 갱신되는 건 **우리 표본**이지 시장이
 * 아니고, 새 관측은 우리가 누군가를 조회했을 때만 들어온다. 조회가 없는
 * 동안 이 지수는 몇 시간이고 그대로 멈춰 있다 — 실시간이라는 말은 그
 * 멈춤을 감춘다.
 *
 * ── 보관 기한 ──
 * 오래된 관측을 계속 쥐고 있으면 지수가 옛 시세를 붙들게 된다. 그래서
 * 보관 기한을 코드에 상수로 박아 두고(RETENTION_DAYS), 그보다 오래된
 * 관측은 지수에서 떨어뜨린다. '언젠가 지우겠다'가 아니라 읽을 때마다
 * 강제되는 규칙이어야 지켜진다.
 *
 * 30일이라는 숫자는 이 프로젝트가 정한 값이다. 넥슨 이용약관이 정확히
 * 며칠을 요구하는지는 **확인하지 못했으므로**(그 문서를 이 환경에서 열
 * 수 없다) 약관상 의무라고 적지 않는다. 약관을 확인했다면 그 값으로
 * 바꾸면 되고, 지금은 "우리가 스스로 건 상한" 이다.
 *
 * 호출량도 지켜야 할 예의라, 최소 폴링 간격을 두고 그 안에 다시 요청이
 * 오면 캐시를 그대로 돌려준다.
 */

/**
 * 관측 보관 기한(일). 이보다 오래된 관측은 지수에서 뺀다.
 *
 * **이 프로젝트의 정책값이다.** 넥슨 약관이 요구하는 기간이라고 적지
 * 않는다 — 원문을 확인하지 못했다(§확인 불가).
 */
export const RETENTION_DAYS = 30;

/** 자동 갱신 최소 간격. 이보다 자주 넥슨을 부르지 않는다. */
export const MIN_POLL_MS = 60_000;

/** 자동 갱신 기본 간격. 기준가 집계(2시간)보다 촘촘하되 과하지 않게. */
export const DEFAULT_POLL_MS = 5 * 60_000;

const DAY_MS = 86_400_000;

/**
 * 관측 하나를 가리키는 키.
 *
 * saleSn 은 거래 건 번호라 그것만으로 충분할 것 같지만, 매입/매도 양쪽을
 * 따로 긁어 합치기 때문에 같은 번호가 side 만 달리 들어올 수 있다.
 * spid 까지 묶어 두면 넥슨이 번호를 재사용해도 서로 다른 카드의 거래가
 * 겹쳐 지워지지 않는다.
 */
export function observationKey(row: Observation): string {
  return `${row.side}:${row.saleSn}:${row.spid}`;
}

/**
 * 기존 관측에 새 관측을 합친다. 같은 키는 새 값으로 덮는다
 * (넥슨이 정정한 값을 내려줄 수 있으므로 나중 것을 믿는다).
 * 결과는 최신 체결이 앞에 오도록 정렬한다.
 */
export function mergeObservations(
  existing: readonly Observation[],
  incoming: readonly Observation[],
): Observation[] {
  const byKey = new Map<string, Observation>();
  for (const row of existing) byKey.set(observationKey(row), row);
  for (const row of incoming) byKey.set(observationKey(row), row);

  return [...byKey.values()].sort((a, b) => b.tradeDate.localeCompare(a.tradeDate));
}

/** 보관 기한이 지난 관측을 떨어뜨린다. */
export function pruneObservations(
  observations: readonly Observation[],
  now: Date,
  retentionDays = RETENTION_DAYS,
): Observation[] {
  const cutoff = now.getTime() - retentionDays * DAY_MS;
  return observations.filter((row) => {
    const time = Date.parse(row.tradeDate.endsWith('Z') ? row.tradeDate : `${row.tradeDate}Z`);
    // 파싱이 안 되는 값은 나이를 알 수 없으니 남겨 둔다. 지수 계산 쪽에서
    // 어차피 걸러지고, 여기서 지워 버리면 조용히 표본이 새는 셈이 된다.
    return Number.isNaN(time) || time >= cutoff;
  });
}

export type PriceDirection = 'up' | 'down' | 'same' | 'new';

export interface PriceDelta {
  spid: number;
  direction: PriceDirection;
  /** 이전 중앙가 (없으면 null) */
  before: number | null;
  after: number;
  /** after - before */
  diff: number;
  /** 변동률 (%) */
  percent: number;
}

/**
 * 두 스냅샷의 카드별 중앙가를 비교한다.
 * 갱신했을 때 "무엇이 얼마나 움직였는지"를 화면에 표시하기 위한 것.
 */
export function diffIndex(
  before: readonly PriceStat[],
  after: readonly PriceStat[],
): PriceDelta[] {
  const previous = new Map(before.map((stat) => [stat.spid, stat.median]));

  return after.map((stat) => {
    const prior = previous.get(stat.spid);
    if (prior === undefined) {
      return { spid: stat.spid, direction: 'new', before: null, after: stat.median, diff: 0, percent: 0 };
    }
    const diff = stat.median - prior;
    return {
      spid: stat.spid,
      direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'same',
      before: prior,
      after: stat.median,
      diff,
      percent: prior > 0 ? (diff / prior) * 100 : 0,
    };
  });
}

/** 움직인 카드만, 변동폭이 큰 순으로. */
export function movers(deltas: readonly PriceDelta[], limit = 5): PriceDelta[] {
  return deltas
    .filter((d) => d.direction === 'up' || d.direction === 'down')
    .sort((a, b) => Math.abs(b.percent) - Math.abs(a.percent))
    .slice(0, limit);
}

/**
 * 지금 넥슨을 다시 불러도 되는가.
 * 최소 간격 안이면 캐시를 쓰라는 뜻으로 false 를 준다.
 */
export function canRefresh(lastFetchedAt: Date | null, now: Date, minGapMs = MIN_POLL_MS): boolean {
  if (!lastFetchedAt) return true;
  return now.getTime() - lastFetchedAt.getTime() >= minGapMs;
}

/** 다음 갱신 가능 시각까지 남은 ms (이미 가능하면 0). */
export function msUntilRefresh(
  lastFetchedAt: Date | null,
  now: Date,
  minGapMs = MIN_POLL_MS,
): number {
  if (!lastFetchedAt) return 0;
  return Math.max(0, minGapMs - (now.getTime() - lastFetchedAt.getTime()));
}

export interface PoolStats {
  observations: number;
  cards: number;
  oldest: string | null;
  newest: string | null;
}

/** 풀 상태 요약 — 화면에 "얼마나 쌓였나"를 보여 주기 위한 것. */
export function poolStats(observations: readonly Observation[]): PoolStats {
  if (observations.length === 0) {
    return { observations: 0, cards: 0, oldest: null, newest: null };
  }
  const dates = observations.map((row) => row.tradeDate).sort();
  return {
    observations: observations.length,
    cards: new Set(observations.map((row) => row.spid)).size,
    oldest: dates[0],
    newest: dates[dates.length - 1],
  };
}
