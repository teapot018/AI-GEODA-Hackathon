import type { TradeRecord } from '@/lib/nexon/types';

/**
 * ── 거래 관측소 ────────────────────────────────────────────
 *
 * 넥슨 Open API 는 "현재 이적시장에 올라온 매물" 을 주지 않는다.
 * 대신 `/fconline/v1/user/trade` 가 **거래 기록**을 준다:
 *   { tradeDate, spid, grade, value }  ← value 가 거래 BP
 *
 * 즉 크롤링 없이도 공식 API 만으로 거래 가격 표본을 모을 수 있다.
 * 한 구단주의 기록은 표본이 작지만, offset 을 밀어 과거까지 긁으면
 * 카드별 가격대·변동폭·추세를 뽑기에는 충분하다.
 *
 * ── 이 표본이 무엇인지 (이걸 틀리면 전부 틀린다) ──
 * 여기 쌓이는 것은 **전체 이적시장의 전수 거래가 아니다.** 현재 Open API
 * 인증 주체에서 조회 가능한 거래 기록일 뿐이다. 그래서 이 프로젝트의
 * 숫자는 "시장에서 오늘 3,412건 거래됨" 이 아니라 "우리가 3,412건을
 * 관측함" 이다. 둘은 전혀 다른 문장이고, 화면에서 섞이면 사용자는
 * 표본 몇 건을 시장 전체로 읽는다.
 *
 * 한계(화면에도 그대로 표기한다):
 *  - 현재 호가가 아니라 **과거 거래가**다.
 *  - 조회한 구단주가 실제로 사고판 카드만 나온다.
 *  - 못 본 거래가 있으므로 건수·빈도는 전부 **하한/상한**이다.
 */

/**
 * 이 프로젝트의 거래 데이터가 무엇인지 한 문장으로.
 *
 * 화면 여러 곳에서 같은 문장을 써야 해서 여기 한 번만 적는다 — 각자
 * 풀어 쓰면 어느 화면에선가 "전체 시장" 으로 슬쩍 넘어간다.
 */
export const TRADE_SAMPLE_DISCLAIMER =
  '이 데이터는 전체 FC 온라인 시장의 전수 거래 데이터가 아닙니다. ' +
  '현재 Open API 인증 주체에서 확인 가능한 거래 기록을 누적한 관측 표본입니다.';

export type TradeSide = 'buy' | 'sell';

/**
 * tradeDate 가 실제로 가리키는 사건.
 *
 * 매입과 매도를 하나의 "체결 시각" 으로 합치면, 서로 다른 사건의 간격을
 * 한 줄로 평균 내게 된다. 타입에 적어 두어 합칠 수 없게 한다.
 */
export type TimestampMeaning = 'purchase-registration' | 'sale-completion';

export const TIMESTAMP_LABEL: Readonly<Record<TimestampMeaning, string>> = {
  'purchase-registration': '구매 등록',
  'sale-completion': '판매 완료',
};

export interface Observation extends TradeRecord {
  side: TradeSide;
  /** 이 행의 tradeDate 가 무엇을 가리키는지 (side 에서 유도) */
  timestampMeaning: TimestampMeaning;
}

/** 거래 방향 → 시각의 의미. 한 곳에서만 정한다. */
export function meaningOf(side: TradeSide): TimestampMeaning {
  return side === 'buy' ? 'purchase-registration' : 'sale-completion';
}

export interface GradeStat {
  grade: number;
  samples: number;
  avg: number;
  min: number;
  max: number;
  /**
   * 등급별 중앙값·사분위.
   *
   * 예전에는 평균/최소/최대만 냈다. 그런데 화면에서 사람이 실제로 읽는
   * 숫자는 중앙값이고, 폭을 볼 때 보는 건 사분위 범위다. 등급을 고르면
   * 그 등급의 숫자가 헤드라인이 되므로, 전체 통계와 같은 급으로 낸다.
   */
  median: number;
  p25: number;
  p75: number;
}

export type Trend = 'up' | 'down' | 'flat';

export interface PricePoint {
  date: string;
  value: number;
  side: TradeSide;
}

export interface PriceStat {
  spid: number;
  /**
   * 이 통계가 어느 강화 등급의 것인가. null 이면 등급을 가리지 않고 합친 값.
   *
   * 합친 값은 기본값으로 두기에 위험하다 — 아래 buildPriceIndex 주석 참고.
   */
  grade: number | null;
  samples: number;
  buyCount: number;
  sellCount: number;
  min: number;
  max: number;
  avg: number;
  median: number;
  /**
   * 하위 25% / 상위 25% 관측가.
   *
   * **게임의 하한가/상한가가 아니다.** 그쪽은 기준가를 중심으로 게임이
   * 정하는 등록 가능 구간이고(fconline/rules.ts LISTING_BAND), 이쪽은
   * 우리가 본 거래의 가운데 절반이 놓인 구간이다. 이름을 빌려 쓰면
   * 사용자는 이 값을 게임이 강제하는 선으로 읽는다.
   */
  p25: number;
  p75: number;
  /** (p75 - p25) / median. 클수록 가격이 들쭉날쭉하다. */
  spread: number;
  /**
   * 매입만 / 매도만 따로 낸 중앙가 (그 쪽 표본이 없으면 null).
   *
   * 합친 중앙값 하나로는 두 가지를 구분할 수 없다 — 이 구단주가 싸게 사서
   * 비싸게 파는 것인지, 아니면 애초에 매도 쪽 숫자가 다른 기준(예: 수수료를
   * 뗀 뒤 금액)으로 오는 것인지. 나눠 두면 화면에서 눈으로 확인된다.
   */
  buyMedian: number | null;
  sellMedian: number | null;
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

/**
 * 통계가 의미를 갖기 시작하는 최소 표본 수.
 *
 * 2 는 낮다. 중앙값 하나를 "시세" 라고 부르기에 2건은 턱없이 부족하고,
 * 이 값은 "여기서부터 믿어도 된다" 가 아니라 **"여기 아래는 통계가 아니다"**
 * 를 가리킨다. 1건이면 그건 분포가 아니라 그냥 그 한 건이라서 추세도
 * 차이율도 내지 않는다.
 */
export const MIN_SAMPLES = 2;

/**
 * 화면이 "표본이 얇다" 고 경고할 기준.
 *
 * MIN_SAMPLES 를 넘겼다고 안심할 숫자가 되는 것은 아니다. 3~4건짜리
 * 중앙값은 한 사람의 급매 하나에 통째로 끌려간다. 계산은 하되 옆에
 * 경고를 붙이는 구간이 필요하고, 그 경계가 여기다.
 *
 * 근거가 있는 숫자는 아니다 — 통계적으로 유도한 값이 아니라 "한 자리
 * 수 표본은 눈으로도 못 믿는다" 는 판단이다(계층 C).
 */
export const THIN_SAMPLES = 10;

/**
 * 표본이 얼마나 두꺼운지 — 네 단계.
 *
 * 예전에는 '얇다 / 아니다' 둘뿐이었다. 그런데 1건과 9건은 둘 다 '얇음'
 * 인데도 전혀 다른 물건이다 — 1건은 분포가 아니라 그냥 그 한 건이고,
 * 9건은 흔들리긴 해도 가운데가 있다. 한 칸에 넣으면 그 경고가 어느
 * 쪽을 말하는지 알 수 없다.
 *
 * 고강화로 갈수록 표본이 얕아지므로, 이 구분이 실제로 걸리는 곳도
 * 대부분 +8 이상이다.
 */
export type SampleConfidence = 'none' | 'very-thin' | 'thin' | 'ok';

export const SAMPLE_CONFIDENCE_LABEL: Readonly<Record<SampleConfidence, string>> = {
  none: '표본 없음',
  'very-thin': '표본 매우 얇음',
  thin: '표본 얇음',
  ok: '관측 충분',
};

/**
 * 'very-thin' 의 상한. 이 이하는 한 사람의 급매 하나가 중앙값을 통째로
 * 정한다 — 계산은 하되 숫자를 믿으라고 하지 않는다.
 *
 * 3 이라는 값에 통계적 근거는 없다(계층: 프로젝트 정책). "손가락으로
 * 셀 수 있으면 분포가 아니다" 는 판단이다.
 */
export const VERY_THIN_SAMPLES = 3;

export function sampleConfidence(samples: number): SampleConfidence {
  if (samples <= 0) return 'none';
  if (samples <= VERY_THIN_SAMPLES) return 'very-thin';
  if (samples < THIN_SAMPLES) return 'thin';
  return 'ok';
}

export function tagSide(records: TradeRecord[], side: TradeSide): Observation[] {
  const timestampMeaning = meaningOf(side);
  return records.map((record) => ({ ...record, side, timestampMeaning }));
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
    .map(([grade, values]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return {
        grade,
        samples: sorted.length,
        avg: Math.round(mean(sorted)),
        min: sorted[0],
        max: sorted[sorted.length - 1],
        median: Math.round(median(sorted)),
        p25: Math.round(percentile(sorted, 0.25)),
        p75: Math.round(percentile(sorted, 0.75)),
      };
    })
    .sort((a, b) => a.grade - b.grade);
}

/** tradeDate 는 "2024-06-01T12:34:56" 형태라 문자열 비교로 시간순 정렬이 된다. */
const byDateAsc = (a: { tradeDate: string }, b: { tradeDate: string }) =>
  a.tradeDate.localeCompare(b.tradeDate);

export interface IndexOptions {
  /**
   * 이 강화 등급의 체결만 써서 통계를 낸다.
   * 지정하지 않으면 등급을 가리지 않고 합친다(아래 경고 참고).
   */
  grade?: number;
}

/**
 * 관측 거래를 카드(spid)별로 묶어 **거래 관측 가격 지수**를 만든다.
 *
 * 이름을 길게 적는 이유: 이건 넥슨이 공시하는 가격지수가 **아니다.**
 * 우리가 조회할 수 있었던 거래 기록을 카드별로 접은 값이고, 표본에
 * 없는 거래는 반영되지 않는다. 같은 카드라도 우리가 다른 구단주를
 * 조회했다면 다른 숫자가 나온다.
 *
 * 표본이 많은 카드가 앞에 오고, 같으면 평균가가 높은 쪽이 앞이다.
 *
 * ── 강화 등급을 섞으면 중앙값이 무의미해진다 ──
 *
 * +1 카드와 +6 카드는 이름만 같지 **다른 물건**이다. 게임 안에서 +6은 +1의
 * 몇 배에 거래되는데, 둘을 한 통에 넣고 중앙값을 내면 어느 쪽 가격도 아닌
 * 숫자가 나온다. 사분위 범위는 더 나쁘다 — 등급 차이가 그대로
 * 범위로 잡혀서, 실제로는 좁은 시세를 폭이 몇 배인 것처럼 보여 준다.
 *
 * 그래서 grade 를 주면 그 등급의 체결만 남기고 접는다. 화면은 등급을
 * 고르게 하고, 고른 등급의 숫자를 헤드라인으로 쓴다. 등급을 가리지 않는
 * 모드도 남겨 두긴 했지만(카드가 어떤 등급으로 돌고 있는지 훑을 때 쓴다),
 * 그건 '이 카드의 시세'가 아니라 '이 카드의 거래 전반'이라는 뜻이다.
 */
export function buildPriceIndex(
  observations: Observation[],
  { grade }: IndexOptions = {},
): PriceStat[] {
  /*
   * 카드별로 묶을 때는 등급을 가리지 않는다. 등급 사다리(byGrade)는 고른
   * 등급과 무관하게 전부 보여 줘야 하기 때문이다 — +1 을 골라 놓고
   * "그럼 +5 는?" 을 물으려면 다시 검색해야 한다면 고르는 의미가 없다.
   * 헤드라인 숫자만 고른 등급으로 낸다.
   */
  const grouped = new Map<number, Observation[]>();
  for (const row of observations) {
    if (!Number.isFinite(row.value) || row.value <= 0) continue;
    const list = grouped.get(row.spid);
    if (list) list.push(row);
    else grouped.set(row.spid, [row]);
  }

  const stats: PriceStat[] = [];
  for (const [spid, all] of grouped) {
    // 헤드라인은 고른 등급의 체결만. 그 등급 표본이 없는 카드는 내보내지
    // 않는다 — 값이 없는데 줄만 있으면 0 으로 읽힌다.
    const rows = grade === undefined ? all : all.filter((row) => row.grade === grade);
    if (rows.length === 0) continue;
    const chronological = [...rows].sort(byDateAsc);
    const series: PricePoint[] = chronological.map((row) => ({
      date: row.tradeDate,
      value: row.value,
      side: row.side,
    }));
    const sortedValues = chronological.map((row) => row.value).sort((a, b) => a - b);
    const med = median(sortedValues);
    const medianOfSide = (side: TradeSide): number | null => {
      const values = rows
        .filter((row) => row.side === side)
        .map((row) => row.value)
        .sort((a, b) => a - b);
      return values.length > 0 ? Math.round(median(values)) : null;
    };
    const p25 = percentile(sortedValues, 0.25);
    const p75 = percentile(sortedValues, 0.75);

    stats.push({
      spid,
      grade: grade ?? null,
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
      buyMedian: medianOfSide('buy'),
      sellMedian: medianOfSide('sell'),
      latest: series[series.length - 1],
      oldest: series[0],
      ...trendOf(series),
      // 사다리는 언제나 전체 등급으로 낸다 (위 주석 참고).
      byGrade: gradeStats(all),
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
