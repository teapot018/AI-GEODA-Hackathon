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

export interface TradeInput {
  buyPrice: number;
  sellPrice: number;
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
  feeRate,
  discounts,
  quantity = 1,
}: TradeInput): TradeResult {
  const applied = resolveFeeRate(feeRate, discounts);
  const buyTotal = buyPrice * quantity;
  const sellGross = sellPrice * quantity;
  const fee = Math.round(sellGross * applied);
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
