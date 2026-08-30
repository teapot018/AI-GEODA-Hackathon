/**
 * 이적시장 거래 손익 계산.
 * FC 온라인 이적시장은 판매 시 수수료(기본 5%)를 뗀다 — 매도가 전액이 아니라
 * (매도가 × (1-수수료율)) 이 실수령액이다.
 */

export interface TradeInput {
  buyPrice: number;
  sellPrice: number;
  /** 0~1, 기본 0.05 (5%) */
  feeRate?: number;
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
}

export const DEFAULT_FEE_RATE = 0.05;

export function computeTradeProfit({
  buyPrice,
  sellPrice,
  feeRate = DEFAULT_FEE_RATE,
  quantity = 1,
}: TradeInput): TradeResult {
  const buyTotal = buyPrice * quantity;
  const sellGross = sellPrice * quantity;
  const fee = Math.round(sellGross * feeRate);
  const sellNet = sellGross - fee;
  const profit = sellNet - buyTotal;
  const roi = buyTotal > 0 ? (profit / buyTotal) * 100 : 0;

  return { buyTotal, sellGross, fee, sellNet, profit, roi };
}

/** 손익분기 매도가: 수수료를 떼고도 매입가를 회수하는 최소 매도가 */
export function breakEvenSellPrice(buyPrice: number, feeRate = DEFAULT_FEE_RATE): number {
  if (feeRate >= 1) return Infinity;
  return Math.ceil(buyPrice / (1 - feeRate));
}
