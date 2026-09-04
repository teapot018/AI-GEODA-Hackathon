import { describe, expect, it } from 'vitest';

import {
  BASE_FEE_RATE,
  breakEvenSellPrice,
  computeTradeProfit,
  effectiveFeeRate,
  FEE_DISCOUNT,
  FEE_ROUNDING_VERIFIED,
  PATH_HAS_MARKET_FEE,
  type FeeDiscounts,
  roundFee,
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

describe('수수료 끝수 — 부동소수점과 반올림', () => {
  /*
   * 감면율은 더해서 적용되므로 실효 수수료율이 이진수로 딱 떨어지지 않는다.
   * PC방만 걸면 0.4 × 0.7 이 0.27999999999999997 이 된다. 이 오차가 반올림
   * 결과를 바꾸면 수수료가 1 BP 씩 어긋난다.
   *
   * 알려진 세 요율(40% / 28% / 20%)에서는 정확히 .5 로 떨어지는 매출액이
   * 존재하지 않는다 — 0.4·0.2·0.28 의 배수는 소수부가 .5 를 지나가지 않는다.
   * 그래서 오차가 반올림 방향을 바꿀 수 없다. 그 사실을 정수 산술과
   * 맞대어 못 박아 둔다.
   */
  const RATES: Array<[string, FeeDiscounts, number]> = [
    ['감면 없음', {}, 400],
    ['PC방', { pcCafe: true }, 280],
    ['PC방+TOP CLASS', { pcCafe: true, topClass: true }, 200],
  ];

  it.each(RATES)('%s — 부동소수점 계산이 정수 계산과 어긋나지 않는다', (_l, discounts, permille) => {
    const rate = effectiveFeeRate(discounts);
    for (let gross = 1; gross <= 500_000; gross += 313) {
      const float = computeTradeProfit({ buyPrice: 0, sellPrice: gross, discounts }).fee;
      // 같은 반올림을 정수만으로: floor((gross * permille + 500) / 1000)
      const exact = Math.floor((gross * permille + 500) / 1000);
      expect(float, `gross=${gross} rate=${rate}`).toBe(exact);
    }
  });

  it('수수료 끝수 처리는 확인한 규칙이 아니라 고른 값이다', () => {
    // 40% 는 게임 규칙이지만 끝수를 내림/반올림/올림 중 무엇으로 하는지는
    // 확인하지 못했다. 확인 못 한 것을 확인한 것처럼 표시하지 않는다.
    expect(FEE_ROUNDING_VERIFIED).toBe(false);
    expect(roundFee(1.5)).toBe(2);
    expect(roundFee(1.4)).toBe(1);
  });

  it('큰 금액에서도 정수로 떨어진다', () => {
    // 억 단위 거래에서 수수료가 소수로 남으면 화면에 0.0000001 이 뜬다.
    for (const gross of [1_234_567_890, 99_999_999_999, 1_000_000_000_000]) {
      const r = computeTradeProfit({ buyPrice: 0, sellPrice: gross, discounts: { pcCafe: true } });
      expect(Number.isInteger(r.fee)).toBe(true);
      expect(Number.isInteger(r.sellNet)).toBe(true);
    }
  });
});

describe('파는 길이 둘이다 — 이적시장 vs 즉시 판매 (§13/§14)', () => {
  /*
   * 이 계산기는 오랫동안 이적시장 판매 하나만 알고 있었다. 그런데 값싼
   * 카드에서는 40% 를 떼고 나면 즉시 판매가 더 남는 구간이 실제로 있다.
   * 한쪽만 아는 계산기는 그 구간에서 틀린 조언을 한다.
   */

  it('즉시 판매에는 이적시장 수수료가 붙지 않는다', () => {
    const quick = computeTradeProfit({ buyPrice: 0, sellPrice: 100_000, path: 'quick' });
    expect(quick.fee).toBe(0);
    expect(quick.appliedFeeRate).toBe(0);
    expect(quick.sellNet).toBe(100_000);
  });

  it('감면 설정을 켜 둔 채 경로만 바꿔도 수수료는 0 이다', () => {
    // PC방에 있다고 즉시 판매가 더 남는 게 아니다. 감면은 이적시장 쪽
    // 수수료를 깎는 것이라, 애초에 수수료가 없는 길에는 개입하지 않는다.
    const quick = computeTradeProfit({
      buyPrice: 0,
      sellPrice: 100_000,
      path: 'quick',
      discounts: { pcCafe: true, topClass: true },
    });
    expect(quick.fee).toBe(0);
  });

  it('경로를 안 주면 예전처럼 이적시장이다', () => {
    // 기존 호출부가 조용히 수수료 0 이 되면 안 된다.
    const market = computeTradeProfit({ buyPrice: 0, sellPrice: 100_000 });
    expect(market.path).toBe('market');
    expect(market.fee).toBe(40_000);
  });

  it('40% 를 떼면 즉시 판매가 더 나은 구간이 실제로 있다', () => {
    /*
     * 이 함수를 쪼갠 이유 자체다. 이적시장 10만은 수수료 뒤 6만이고,
     * 즉시 판매가 7만이면 시장에 올리는 쪽이 손해다.
     */
    const market = computeTradeProfit({ buyPrice: 0, sellPrice: 100_000 });
    const quick = computeTradeProfit({ buyPrice: 0, sellPrice: 70_000, path: 'quick' });

    expect(market.sellNet).toBe(60_000);
    expect(quick.sellNet).toBe(70_000);
    expect(quick.sellNet).toBeGreaterThan(market.sellNet);
  });

  it('어느 길에 수수료가 붙는지는 한 곳에서만 정한다', () => {
    expect(PATH_HAS_MARKET_FEE.market).toBe(true);
    expect(PATH_HAS_MARKET_FEE.quick).toBe(false);
  });

  it('즉시 판매 가격을 우리가 계산해 주지는 않는다', () => {
    /*
     * 넥슨이 공식을 공개한 적이 없다. 입력받은 값을 그대로 쓸 뿐,
     * 매입가나 오버롤에서 유도하지 않는다 — 지어낸 값을 게임 값처럼
     * 보여 주는 것이 이 프로젝트가 하지 않는 일이다.
     */
    const a = computeTradeProfit({ buyPrice: 5_000_000, sellPrice: 1, path: 'quick' });
    const b = computeTradeProfit({ buyPrice: 10, sellPrice: 1, path: 'quick' });
    expect(a.sellGross).toBe(1);
    expect(b.sellGross).toBe(1);
  });
});
