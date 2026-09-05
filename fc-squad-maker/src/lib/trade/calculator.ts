import { BASE_TRADE_FEE_RATE, FEE_DISCOUNT } from '@/lib/fconline/rules';

/**
 * ── 이적시장 손익 계산 ────────────────────────────────────
 *
 * FC 온라인 이적시장은 판매할 때 수수료를 뗀다. **기본 40%** 로, 흔히
 * 짐작하는 것보다 훨씬 크다 — 100만에 팔면 60만이 들어온다.
 *
 * 헷갈리기 쉬운 지점: PC방·TOP CLASS·쿠폰의 % 는 **수수료율이 아니라
 * 수수료에서 깎는 감면율**이다. "30% PC방 할인"은 수수료가 30% 가 된다는
 * 뜻이 아니라 40% 에서 30% 를 깎아 28% 가 된다는 뜻이다.
 *
 *   PC방만        : 감면 30%      → 40% × 0.7 = 28%  → 실수령 원금의 72%
 *   PC방 + TOP    : 감면 30+20=50% → 40% × 0.5 = 20%  → 실수령 원금의 80%
 *
 * 감면은 서로 더해서 적용된다(곱이 아니다). 위 두 줄의 실수령 비율이
 * 게임에서 알려진 값(×0.72, ×0.8)과 맞아떨어지는 것으로 검증했다.
 */

/**
 * 이적시장 기본 판매 수수료. 감면이 하나도 없을 때.
 *
 * 값은 공식 규칙 파일에서 온다 — 같은 숫자를 두 곳에 적어 두면 게임이
 * 수수료를 바꿨을 때 한쪽만 고쳐지고, 계산기와 안내 문구가 서로 다른
 * 말을 하게 된다.
 */
export const BASE_FEE_RATE = BASE_TRADE_FEE_RATE;

export { FEE_DISCOUNT };

export interface FeeDiscounts {
  pcCafe?: boolean;
  topClass?: boolean;
  /** 수수료 할인 쿠폰 감면율 0~1 (0.5 = 50% 쿠폰) */
  coupon?: number;
}

/** 감면율 합계. 1(=100% 감면)을 넘지 않게 자른다. */
export function totalDiscount({ pcCafe, topClass, coupon = 0 }: FeeDiscounts = {}): number {
  const sum =
    (pcCafe ? FEE_DISCOUNT.pcCafe : 0) +
    (topClass ? FEE_DISCOUNT.topClass : 0) +
    (Number.isFinite(coupon) ? coupon : 0);
  return Math.min(1, Math.max(0, sum));
}

/** 감면을 반영한 실효 수수료율 (0~1). */
export function effectiveFeeRate(discounts: FeeDiscounts = {}): number {
  return BASE_FEE_RATE * (1 - totalDiscount(discounts));
}

/**
 * 하위 호환용 기본값. 예전에는 이 값이 5% 였는데 실제 이적시장 수수료와
 * 크게 달라 바로잡았다 — 계산기가 이득처럼 보이던 거래가 실제로는
 * 손해인 경우가 많았다.
 */
export const DEFAULT_FEE_RATE = BASE_FEE_RATE;

/**
 * 카드를 파는 두 가지 길.
 *
 * ── 왜 나눠야 하나 ──
 * 이 계산기는 오랫동안 **이적시장 판매 하나만** 알고 있었다. 그런데 게임
 * 안에서 카드를 처분하는 길은 둘이고, 수수료 규칙이 서로 다르다.
 *
 *   market  이적시장에 올려 파는 것. 판매자에게서 40% 를 뗀다.
 *   quick   즉시 판매(방출). 시스템이 정해 둔 값으로 바로 넘기는 것이라
 *           **이적시장 수수료가 붙지 않는다.**
 *
 * 한쪽만 아는 계산기는 값싼 카드에서 틀린 조언을 한다. 40% 를 떼고 나면
 * 시장에 파는 것보다 즉시 판매가 더 남는 구간이 실제로 있는데, 그 구간을
 * 통째로 못 보기 때문이다.
 *
 * ── 우리가 모르는 것 ──
 * **즉시 판매 가격이 얼마인지는 계산하지 않는다.** 넥슨이 그 공식을
 * 공개한 적이 없고 이 환경에서 대조할 방법도 없다. 게임 화면에는 그
 * 값이 그대로 떠 있으므로, 보고 입력하게 한다. 모르는 값을 지어내
 * "즉시 판매하면 12만" 이라고 적는 것이 이 프로젝트가 하지 않는 일이다.
 */
export type SellPath = 'market' | 'quick';

/**
 * 각 경로에 이적시장 수수료가 붙는가.
 *
 * 이건 가격 추정이 아니라 **어느 수수료가 적용되는가** 라는 규칙이라
 * 여기 적는다. 즉시 판매에 40% 가 붙지 않는다는 것까지가 우리가 아는
 * 범위이고, 그 값이 얼마인지는 아니다.
 */
export const PATH_HAS_MARKET_FEE: Readonly<Record<SellPath, boolean>> = {
  market: true,
  quick: false,
};

export interface TradeInput {
  buyPrice: number;
  /**
   * 파는 값.
   *
   * path 가 'market' 이면 이적시장 등록가, 'quick' 이면 게임이 보여 주는
   * 즉시 판매 가격이다. 두 번째 경우 이 값은 **사용자가 게임에서 읽어
   * 온 것**이지 우리가 계산한 값이 아니다.
   */
  sellPrice: number;
  /** 파는 길. 생략하면 이적시장. */
  path?: SellPath;
  /** 0~1. 주면 그대로 쓰고, 없으면 discounts 로 계산한다. */
  feeRate?: number;
  discounts?: FeeDiscounts;
  quantity?: number;
}

export interface TradeResult {
  buyTotal: number;
  sellGross: number;
  fee: number;
  sellNet: number;
  profit: number;
  /** 매입가 대비 수익률 (%) */
  roi: number;
  /** 실제로 적용된 수수료율 (0~1) */
  appliedFeeRate: number;
  /** 어느 길로 판 결과인가 */
  path: SellPath;
}

/**
 * 수수료를 1 BP 단위로 떨어뜨리는 방법.
 *
 * ── 이 값이 왜 상수로 나와 있는가 ──
 * 수수료율 40% 는 게임 규칙(계층 B)이지만, **끝수를 어떻게 처리하는지는
 * 우리가 확인하지 못했다.** 넥슨이 내림하는지 반올림하는지 올림하는지
 * 적어 둔 문서를 찾지 못했고, 이 환경에서는 게임으로 대조할 수도 없다.
 *
 * 그래서 반올림을 **고른 것**이지 확인한 것이 아니다 — 계층 D(프로젝트
 * 추정)다. 코드 한가운데 `Math.round` 로 박아 두면 그 사실이 사라지므로
 * 이름을 붙여 꺼내 둔다.
 *
 * 어긋나 봐야 1 BP 라 판단이 뒤집히지는 않는다. 그래도 "확인한 것" 과
 * "고른 것" 을 섞지 않는 것이 이 프로젝트가 지키는 선이다.
 */
export const FEE_ROUNDING = 'round' as const;
export const FEE_ROUNDING_VERIFIED = false;

/** 수수료 끝수 처리. FEE_ROUNDING 이 가리키는 방식 한 곳. */
export function roundFee(amount: number): number {
  return Math.round(amount);
}

function resolveFeeRate(feeRate: number | undefined, discounts: FeeDiscounts | undefined): number {
  if (feeRate !== undefined && Number.isFinite(feeRate)) {
    return Math.min(1, Math.max(0, feeRate));
  }
  return effectiveFeeRate(discounts);
}

export function computeTradeProfit({
  buyPrice,
  sellPrice,
  path = 'market',
  feeRate,
  discounts,
  quantity = 1,
}: TradeInput): TradeResult {
  /*
   * 즉시 판매에는 이적시장 수수료가 붙지 않는다. 감면 설정을 켜 둔
   * 채로 경로만 바꿔도 수수료가 0 이어야 한다 — PC방에 있다고 즉시
   * 판매가 더 남는 게 아니다.
   */
  const applied = PATH_HAS_MARKET_FEE[path] ? resolveFeeRate(feeRate, discounts) : 0;
  const buyTotal = buyPrice * quantity;
  const sellGross = sellPrice * quantity;
  const fee = roundFee(sellGross * applied);
  const sellNet = sellGross - fee;
  const profit = sellNet - buyTotal;

  return {
    buyTotal,
    sellGross,
    fee,
    sellNet,
    profit,
    roi: buyTotal > 0 ? (profit / buyTotal) * 100 : 0,
    appliedFeeRate: applied,
    path,
  };
}

/**
 * 손익분기 매도가: 수수료를 떼고도 매입가를 회수하는 최소 매도가.
 *
 * 40% 수수료에서는 매입가의 약 1.67배에 팔아야 본전이다. 이 숫자가
 * 계산기를 만든 이유이기도 하다 — 감으로는 절대 안 나온다.
 */
export function breakEvenSellPrice(buyPrice: number, feeRate: number = BASE_FEE_RATE): number {
  const rate = Math.min(1, Math.max(0, feeRate));
  if (rate >= 1) return Infinity;
  return Math.ceil(buyPrice / (1 - rate));
}
