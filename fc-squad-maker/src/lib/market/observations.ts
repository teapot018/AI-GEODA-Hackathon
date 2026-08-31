import type { TradeRecord } from '@/lib/nexon/types';

/**
 * ── 시세 관측소 ────────────────────────────────────────────
 *
 * 넥슨 Open API 는 "현재 이적시장에 올라온 매물" 을 주지 않는다.
 * 대신 `/fconline/v1/user/trade` 가 **실제로 체결된 거래**를 준다:
 *   { tradeDate, spid, grade, value }  ← value 가 실거래 BP
 *
 * 즉 크롤링 없이도 공식 API 만으로 "관측된 실거래가" 를 모을 수 있다.
 * 한 구단주의 기록은 표본이 작지만, offset 을 밀어 과거까지 긁으면
 * 카드별 가격대·변동폭·추세를 뽑기에는 충분하다.
 *
 * 한계(화면에도 그대로 표기한다):
 *  - 현재 호가가 아니라 **과거 체결가**다.
 *  - 조회한 구단주가 실제로 사고판 카드만 나온다.
 */

export type TradeSide = 'buy' | 'sell';

export interface Observation extends TradeRecord {
  side: TradeSide;
}

export interface GradeStat {
  grade: number;
  samples: number;
  avg: number;
  min: number;
  max: number;
}

export type Trend = 'up' | 'down' | 'flat';

export interface PricePoint {
  date: string;
  value: number;
  side: TradeSide;
}

export interface PriceStat {
  spid: number;
  samples: number;
  buyCount: number;
  sellCount: number;
  min: number;
  max: number;
  avg: number;
  median: number;
  /** 하위 25% / 상위 25% 가격 — 흥정 범위의 하단과 상단 */
  p25: number;
  p75: number;
  /** (p75 - p25) / median. 클수록 가격이 들쭉날쭉하다. */
  spread: number;
  latest: PricePoint;
  oldest: PricePoint;
  /** 최근 절반 평균 vs 이전 절반 평균 */
  trend: Trend;
  trendPercent: number;
  byGrade: GradeStat[];
  /** 오래된 것 → 최신 순 시계열 (스파크라인용) */
  series: PricePoint[];
}

export interface MarketSummary {
  /** 관측된 거래 건수 */
  samples: number;
  /** 서로 다른 카드 수 */
  cards: number;
  buyCount: number;
  sellCount: number;
  buyTotal: number;
  sellTotal: number;
  /** 매도 총액 - 매입 총액 */
  netFlow: number;
  /** 관측 구간 (없으면 null) */
  from: string | null;
  to: string | null;
}

/** 추세를 '보합' 으로 볼 변동폭 (%) */
export const TREND_EPSILON = 3;

/** 통계가 의미를 갖기 시작하는 최소 표본 수 */
export const MIN_SAMPLES = 2;

export function tagSide(records: TradeRecord[], side: TradeSide): Observation[] {
  return records.map((record) => ({ ...record, side }));
}

/** 오름차순 정렬된 배열의 q(0~1) 분위수. 사이값은 선형 보간. */
export function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];

  const pos = (sorted.length - 1) * Math.max(0, Math.min(1, q));
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (pos - lower);
}

export function median(sorted: number[]): number {
  return percentile(sorted, 0.5);
}

const mean = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((acc, v) => acc + v, 0) / values.length;

/**
 * 최근 절반과 이전 절반의 평균을 비교해 추세를 낸다.
 * 표본이 홀수면 가운데 한 건은 '최근' 쪽에 넣는다 (최신 정보에 무게).
 */
function trendOf(series: PricePoint[]): { trend: Trend; trendPercent: number } {
  if (series.length < MIN_SAMPLES) return { trend: 'flat', trendPercent: 0 };

  const split = Math.floor(series.length / 2);
  const older = mean(series.slice(0, split).map((p) => p.value));
  const recent = mean(series.slice(split).map((p) => p.value));
  if (older <= 0) return { trend: 'flat', trendPercent: 0 };

  const percent = ((recent - older) / older) * 100;
  if (Math.abs(percent) < TREND_EPSILON) return { trend: 'flat', trendPercent: percent };
  return { trend: percent > 0 ? 'up' : 'down', trendPercent: percent };
}

function gradeStats(observations: Observation[]): GradeStat[] {
  const buckets = new Map<number, number[]>();
  for (const row of observations) {
    const list = buckets.get(row.grade);
    if (list) list.push(row.value);
    else buckets.set(row.grade, [row.value]);
  }

  return [...buckets.entries()]
    .map(([grade, values]) => ({
      grade,
      samples: values.length,
      avg: Math.round(mean(values)),
      min: Math.min(...values),
      max: Math.max(...values),
    }))
    .sort((a, b) => a.grade - b.grade);
}

/** tradeDate 는 "2024-06-01T12:34:56" 형태라 문자열 비교로 시간순 정렬이 된다. */
const byDateAsc = (a: { tradeDate: string }, b: { tradeDate: string }) =>
  a.tradeDate.localeCompare(b.tradeDate);

/**
 * 관측 거래를 카드(spid)별로 묶어 가격 통계를 만든다.
 * 표본이 많은 카드가 앞에 오고, 같으면 평균가가 높은 쪽이 앞이다.
 */
export function buildPriceIndex(observations: Observation[]): PriceStat[] {
  const grouped = new Map<number, Observation[]>();
  for (const row of observations) {
    if (!Number.isFinite(row.value) || row.value <= 0) continue;
    const list = grouped.get(row.spid);
    if (list) list.push(row);
    else grouped.set(row.spid, [row]);
  }

  const stats: PriceStat[] = [];
  for (const [spid, rows] of grouped) {
    const chronological = [...rows].sort(byDateAsc);
    const series: PricePoint[] = chronological.map((row) => ({
      date: row.tradeDate,
      value: row.value,
      side: row.side,
    }));
    const sortedValues = chronological.map((row) => row.value).sort((a, b) => a - b);
    const med = median(sortedValues);
    const p25 = percentile(sortedValues, 0.25);
    const p75 = percentile(sortedValues, 0.75);

    stats.push({
      spid,
      samples: rows.length,
      buyCount: rows.filter((row) => row.side === 'buy').length,
      sellCount: rows.filter((row) => row.side === 'sell').length,
      min: sortedValues[0],
      max: sortedValues[sortedValues.length - 1],
      avg: Math.round(mean(sortedValues)),
      median: Math.round(med),
      p25: Math.round(p25),
      p75: Math.round(p75),
      spread: med > 0 ? (p75 - p25) / med : 0,
      latest: series[series.length - 1],
      oldest: series[0],
      ...trendOf(series),
      byGrade: gradeStats(rows),
      series,
    });
  }

  return stats.sort((a, b) => b.samples - a.samples || b.avg - a.avg);
}

export function summarizeMarket(observations: Observation[]): MarketSummary {
  const valid = observations.filter((row) => Number.isFinite(row.value) && row.value > 0);
  const buys = valid.filter((row) => row.side === 'buy');
  const sells = valid.filter((row) => row.side === 'sell');
  const total = (rows: Observation[]) => rows.reduce((acc, row) => acc + row.value, 0);

  const dates = valid.map((row) => row.tradeDate).sort();
  const buyTotal = total(buys);
  const sellTotal = total(sells);

  return {
    samples: valid.length,
    cards: new Set(valid.map((row) => row.spid)).size,
    buyCount: buys.length,
    sellCount: sells.length,
    buyTotal,
    sellTotal,
    netFlow: sellTotal - buyTotal,
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
  };
}

/**
 * 시세 대비 제안가가 싼지 비싼지 판정한다.
 * 사분위 범위를 기준으로 하는 이유: 평균은 이상치 한 건에 쉽게 끌려간다.
 */
export type PriceVerdict = 'cheap' | 'fair' | 'expensive' | 'unknown';

export function judgePrice(stat: PriceStat | undefined, price: number): PriceVerdict {
  if (!stat || stat.samples < MIN_SAMPLES || !Number.isFinite(price) || price <= 0) return 'unknown';
  if (price < stat.p25) return 'cheap';
  if (price > stat.p75) return 'expensive';
  return 'fair';
}
