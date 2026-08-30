import { describe, expect, it } from 'vitest';

import { breakEvenSellPrice, computeTradeProfit, DEFAULT_FEE_RATE } from '@/lib/trade/calculator';

describe('computeTradeProfit', () => {
  it('수수료 없이 매도가 > 매입가면 순이익 = 차액', () => {
    const result = computeTradeProfit({ buyPrice: 1000, sellPrice: 1500, feeRate: 0 });
    expect(result.fee).toBe(0);
    expect(result.profit).toBe(500);
    expect(result.roi).toBeCloseTo(50);
  });

  it('기본 수수료율은 5%', () => {
    const result = computeTradeProfit({ buyPrice: 1000, sellPrice: 1000 });
    expect(result.fee).toBe(50);
    expect(result.profit).toBe(-50); // 본전 매도도 수수료만큼 손해
  });

  it('수량이 곱해진다', () => {
    const one = computeTradeProfit({ buyPrice: 1000, sellPrice: 1500, feeRate: 0, quantity: 1 });
    const five = computeTradeProfit({ buyPrice: 1000, sellPrice: 1500, feeRate: 0, quantity: 5 });
    expect(five.profit).toBe(one.profit * 5);
  });

  it('매입가 0이면 ROI는 0 (0으로 나누기 방지)', () => {
    const result = computeTradeProfit({ buyPrice: 0, sellPrice: 1000 });
    expect(result.roi).toBe(0);
    expect(Number.isFinite(result.roi)).toBe(true);
  });

  it('수수료율이 높을수록 실수령액이 줄어든다', () => {
    const low = computeTradeProfit({ buyPrice: 1000, sellPrice: 2000, feeRate: 0.01 });
    const high = computeTradeProfit({ buyPrice: 1000, sellPrice: 2000, feeRate: 0.2 });
    expect(high.sellNet).toBeLessThan(low.sellNet);
    expect(high.profit).toBeLessThan(low.profit);
  });
});

describe('breakEvenSellPrice', () => {
  it('수수료 0%면 손익분기 = 매입가', () => {
    expect(breakEvenSellPrice(1000, 0)).toBe(1000);
  });

  it('기본 수수료(5%)에서 손익분기가로 팔면 손해가 나지 않는다', () => {
    const buy = 1000;
    const breakEven = breakEvenSellPrice(buy, DEFAULT_FEE_RATE);
    const result = computeTradeProfit({ buyPrice: buy, sellPrice: breakEven, feeRate: DEFAULT_FEE_RATE });
    expect(result.profit).toBeGreaterThanOrEqual(0);
  });

  it('수수료율이 높을수록 손익분기가도 높아진다', () => {
    const low = breakEvenSellPrice(1000, 0.05);
    const high = breakEvenSellPrice(1000, 0.2);
    expect(high).toBeGreaterThan(low);
  });
});
