import { describe, expect, it } from 'vitest';

import {
  BASE_FEE_RATE,
  breakEvenSellPrice,
  computeTradeProfit,
  effectiveFeeRate,
  FEE_DISCOUNT,
  totalDiscount,
} from '@/lib/trade/calculator';

describe('수수료 모델', () => {
  it('기본 수수료는 40%', () => {
    expect(BASE_FEE_RATE).toBe(0.4);
    expect(effectiveFeeRate()).toBeCloseTo(0.4);
  });

  it('PC방만 쓰면 실수수료 28% — 실수령은 원금의 72%', () => {
    // 게임에 알려진 "원금 × 0.72" 와 맞는지가 이 모델의 검증점이다.
    const rate = effectiveFeeRate({ pcCafe: true });
    expect(rate).toBeCloseTo(0.28);
    expect(1 - rate).toBeCloseTo(0.72);
  });

  it('PC방 + TOP CLASS 면 실수수료 20% — 실수령은 원금의 80%', () => {
    const rate = effectiveFeeRate({ pcCafe: true, topClass: true });
    expect(rate).toBeCloseTo(0.2);
    expect(1 - rate).toBeCloseTo(0.8);
  });

  it('감면은 곱이 아니라 합이다', () => {
    // 곱이라면 0.4 × 0.7 × 0.8 = 0.224 가 되어 위 검증값과 어긋난다.
    expect(totalDiscount({ pcCafe: true, topClass: true })).toBeCloseTo(0.5);
    expect(effectiveFeeRate({ pcCafe: true, topClass: true })).not.toBeCloseTo(0.224);
  });

  it('쿠폰 감면율이 더해진다', () => {
    expect(effectiveFeeRate({ coupon: 0.5 })).toBeCloseTo(0.2);
    expect(effectiveFeeRate({ pcCafe: true, coupon: 0.3 })).toBeCloseTo(0.4 * 0.4);
  });

  it('감면 합계가 100%를 넘어도 수수료가 음수가 되지 않는다', () => {
    expect(totalDiscount({ pcCafe: true, topClass: true, coupon: 0.9 })).toBe(1);
    expect(effectiveFeeRate({ pcCafe: true, topClass: true, coupon: 0.9 })).toBe(0);
  });

  it('음수 쿠폰은 무시한다 (수수료가 기본보다 커지지 않게)', () => {
    expect(effectiveFeeRate({ coupon: -1 })).toBeCloseTo(BASE_FEE_RATE);
  });

  it('감면 항목 비율은 PC방 30% · TOP CLASS 20%', () => {
    expect(FEE_DISCOUNT.pcCafe).toBe(0.3);
    expect(FEE_DISCOUNT.topClass).toBe(0.2);
  });
});

describe('computeTradeProfit', () => {
  it('수수료 없이 매도가 > 매입가면 순이익 = 차액', () => {
    const result = computeTradeProfit({ buyPrice: 1000, sellPrice: 1500, feeRate: 0 });
    expect(result.fee).toBe(0);
    expect(result.profit).toBe(500);
    expect(result.roi).toBeCloseTo(50);
  });

  it('기본 수수료는 40% — 100만에 팔면 60만이 들어온다', () => {
    const result = computeTradeProfit({ buyPrice: 0, sellPrice: 1_000_000 });
    expect(result.fee).toBe(400_000);
    expect(result.sellNet).toBe(600_000);
  });

  it('본전 매도는 수수료만큼 손해다', () => {
    const result = computeTradeProfit({ buyPrice: 1000, sellPrice: 1000 });
    expect(result.profit).toBe(-400);
  });

  it('감면을 넘기면 그만큼 덜 뗀다', () => {
    const plain = computeTradeProfit({ buyPrice: 0, sellPrice: 1_000_000 });
    const pcCafe = computeTradeProfit({
      buyPrice: 0,
      sellPrice: 1_000_000,
      discounts: { pcCafe: true },
    });
    expect(pcCafe.fee).toBe(280_000);
    expect(pcCafe.sellNet).toBe(720_000);
    expect(pcCafe.fee).toBeLessThan(plain.fee);
  });

  it('feeRate 를 직접 주면 감면보다 우선한다', () => {
    const result = computeTradeProfit({
      buyPrice: 0,
      sellPrice: 1000,
      feeRate: 0.1,
      discounts: { pcCafe: true },
    });
    expect(result.appliedFeeRate).toBeCloseTo(0.1);
    expect(result.fee).toBe(100);
  });

  it('적용된 수수료율을 결과에 담아 준다', () => {
    const result = computeTradeProfit({
      buyPrice: 0,
      sellPrice: 1000,
      discounts: { pcCafe: true, topClass: true },
    });
    expect(result.appliedFeeRate).toBeCloseTo(0.2);
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

  it('수수료율이 범위를 벗어나도 잘라서 쓴다', () => {
    expect(computeTradeProfit({ buyPrice: 0, sellPrice: 1000, feeRate: 5 }).fee).toBe(1000);
    expect(computeTradeProfit({ buyPrice: 0, sellPrice: 1000, feeRate: -1 }).fee).toBe(0);
  });
});

describe('breakEvenSellPrice', () => {
  it('수수료 0%면 손익분기 = 매입가', () => {
    expect(breakEvenSellPrice(1000, 0)).toBe(1000);
  });

  it('기본 40% 수수료에서는 매입가의 약 1.67배가 필요하다', () => {
    // 감으로는 절대 안 나오는 배수다. 계산기가 있어야 하는 이유.
    expect(breakEvenSellPrice(1_000_000)).toBe(1_666_667);
  });

  it('손익분기가로 팔면 손해가 나지 않는다', () => {
    for (const rate of [0, 0.2, 0.28, BASE_FEE_RATE]) {
      const breakEven = breakEvenSellPrice(1000, rate);
      const result = computeTradeProfit({ buyPrice: 1000, sellPrice: breakEven, feeRate: rate });
      expect(result.profit).toBeGreaterThanOrEqual(0);
    }
  });

  it('수수료율이 높을수록 손익분기가도 높아진다', () => {
    expect(breakEvenSellPrice(1000, 0.2)).toBeGreaterThan(breakEvenSellPrice(1000, 0.05));
  });

  it('수수료 100%면 회수가 불가능하다', () => {
    expect(breakEvenSellPrice(1000, 1)).toBe(Infinity);
  });
});
