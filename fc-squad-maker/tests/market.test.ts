import { describe, expect, it } from 'vitest';

import {
  buildPriceIndex,
  judgePrice,
  median,
  percentile,
  summarizeMarket,
  tagSide,
  TREND_EPSILON,
  type Observation,
} from '@/lib/market/observations';
import type { TradeRecord } from '@/lib/nexon/types';

/** 날짜만 다르게 주면 시계열 순서가 정해진다. */
function trade(over: Partial<TradeRecord> = {}): TradeRecord {
  return {
    tradeDate: '2024-06-01T12:00:00',
    saleSn: '1',
    spid: 300_000_001,
    grade: 1,
    value: 1_000_000,
    ...over,
  };
}

function obs(over: Partial<Observation> = {}): Observation {
  return { ...trade(), side: 'buy', ...over };
}

describe('percentile / median', () => {
  it('빈 배열은 0', () => {
    expect(percentile([], 0.5)).toBe(0);
    expect(median([])).toBe(0);
  });

  it('원소가 하나면 그 값', () => {
    expect(percentile([7], 0.9)).toBe(7);
  });

  it('홀수 개의 중앙값은 가운데 값', () => {
    expect(median([1, 2, 3])).toBe(2);
  });

  it('짝수 개의 중앙값은 가운데 두 값의 평균', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('사이값은 선형 보간한다', () => {
    // [0,10] 의 25% 지점 = 2.5
    expect(percentile([0, 10], 0.25)).toBe(2.5);
  });

  it('q 는 0~1 로 클램프된다', () => {
    expect(percentile([1, 2, 3], -5)).toBe(1);
    expect(percentile([1, 2, 3], 5)).toBe(3);
  });
});

describe('buildPriceIndex', () => {
  it('같은 spid 끼리 묶어 통계를 낸다', () => {
    const index = buildPriceIndex([
      obs({ value: 100, tradeDate: '2024-06-01T00:00:00' }),
      obs({ value: 300, tradeDate: '2024-06-02T00:00:00' }),
      obs({ value: 200, tradeDate: '2024-06-03T00:00:00' }),
    ]);

    expect(index).toHaveLength(1);
    expect(index[0].samples).toBe(3);
    expect(index[0].min).toBe(100);
    expect(index[0].max).toBe(300);
    expect(index[0].avg).toBe(200);
    expect(index[0].median).toBe(200);
  });

  it('시계열은 오래된 것부터, latest/oldest 가 양 끝이다', () => {
    const index = buildPriceIndex([
      obs({ value: 300, tradeDate: '2024-06-03T00:00:00' }),
      obs({ value: 100, tradeDate: '2024-06-01T00:00:00' }),
      obs({ value: 200, tradeDate: '2024-06-02T00:00:00' }),
    ]);

    expect(index[0].series.map((p) => p.value)).toEqual([100, 200, 300]);
    expect(index[0].oldest.value).toBe(100);
    expect(index[0].latest.value).toBe(300);
  });

  it('매입/매도 건수를 따로 센다', () => {
    const index = buildPriceIndex([
      obs({ side: 'buy' }),
      obs({ side: 'sell', tradeDate: '2024-06-02T00:00:00' }),
      obs({ side: 'sell', tradeDate: '2024-06-03T00:00:00' }),
    ]);

    expect(index[0].buyCount).toBe(1);
    expect(index[0].sellCount).toBe(2);
  });

  it('값이 0 이하거나 숫자가 아니면 통계에서 제외한다', () => {
    const index = buildPriceIndex([
      obs({ value: 0 }),
      obs({ value: -100, tradeDate: '2024-06-02T00:00:00' }),
      obs({ value: 500, tradeDate: '2024-06-03T00:00:00' }),
    ]);

    expect(index[0].samples).toBe(1);
    expect(index[0].avg).toBe(500);
  });

  it('표본이 많은 카드가 앞에 온다', () => {
    const index = buildPriceIndex([
      obs({ spid: 1, value: 900 }),
      obs({ spid: 2, value: 100, tradeDate: '2024-06-02T00:00:00' }),
      obs({ spid: 2, value: 100, tradeDate: '2024-06-03T00:00:00' }),
    ]);

    expect(index[0].spid).toBe(2);
  });

  it('강화 등급별로 쪼갠 통계를 함께 준다', () => {
    const index = buildPriceIndex([
      obs({ grade: 1, value: 100 }),
      obs({ grade: 1, value: 200, tradeDate: '2024-06-02T00:00:00' }),
      obs({ grade: 5, value: 900, tradeDate: '2024-06-03T00:00:00' }),
    ]);

    expect(index[0].byGrade).toEqual([
      { grade: 1, samples: 2, avg: 150, min: 100, max: 200 },
      { grade: 5, samples: 1, avg: 900, min: 900, max: 900 },
    ]);
  });

  it('빈 입력은 빈 배열', () => {
    expect(buildPriceIndex([])).toEqual([]);
  });
});

describe('추세', () => {
  it('최근 절반이 비싸면 상승', () => {
    const index = buildPriceIndex([
      obs({ value: 100, tradeDate: '2024-06-01T00:00:00' }),
      obs({ value: 100, tradeDate: '2024-06-02T00:00:00' }),
      obs({ value: 200, tradeDate: '2024-06-03T00:00:00' }),
      obs({ value: 200, tradeDate: '2024-06-04T00:00:00' }),
    ]);

    expect(index[0].trend).toBe('up');
    expect(index[0].trendPercent).toBeCloseTo(100);
  });

  it('최근 절반이 싸면 하락', () => {
    const index = buildPriceIndex([
      obs({ value: 200, tradeDate: '2024-06-01T00:00:00' }),
      obs({ value: 100, tradeDate: '2024-06-02T00:00:00' }),
    ]);

    expect(index[0].trend).toBe('down');
  });

  it(`변동이 ${TREND_EPSILON}% 미만이면 보합`, () => {
    const index = buildPriceIndex([
      obs({ value: 1000, tradeDate: '2024-06-01T00:00:00' }),
      obs({ value: 1010, tradeDate: '2024-06-02T00:00:00' }),
    ]);

    expect(index[0].trend).toBe('flat');
  });

  it('표본이 하나면 추세를 말하지 않는다', () => {
    const index = buildPriceIndex([obs({ value: 1000 })]);
    expect(index[0].trend).toBe('flat');
    expect(index[0].trendPercent).toBe(0);
  });
});

describe('summarizeMarket', () => {
  it('매입/매도 총액과 순유출입을 낸다', () => {
    const summary = summarizeMarket([
      obs({ side: 'buy', value: 1000 }),
      obs({ side: 'sell', value: 1500, spid: 2 }),
    ]);

    expect(summary.buyTotal).toBe(1000);
    expect(summary.sellTotal).toBe(1500);
    expect(summary.netFlow).toBe(500);
    expect(summary.cards).toBe(2);
    expect(summary.samples).toBe(2);
  });

  it('관측 구간의 처음과 끝을 잡는다', () => {
    const summary = summarizeMarket([
      obs({ tradeDate: '2024-06-05T00:00:00' }),
      obs({ tradeDate: '2024-06-01T00:00:00' }),
    ]);

    expect(summary.from).toBe('2024-06-01T00:00:00');
    expect(summary.to).toBe('2024-06-05T00:00:00');
  });

  it('빈 입력에서도 터지지 않는다', () => {
    const summary = summarizeMarket([]);
    expect(summary.samples).toBe(0);
    expect(summary.from).toBeNull();
  });
});

describe('judgePrice', () => {
  const stat = buildPriceIndex([
    obs({ value: 100, tradeDate: '2024-06-01T00:00:00' }),
    obs({ value: 200, tradeDate: '2024-06-02T00:00:00' }),
    obs({ value: 300, tradeDate: '2024-06-03T00:00:00' }),
    obs({ value: 400, tradeDate: '2024-06-04T00:00:00' }),
  ])[0];

  it('하위 25% 미만이면 싸다', () => {
    expect(judgePrice(stat, 100)).toBe('cheap');
  });

  it('사분위 범위 안이면 적정', () => {
    expect(judgePrice(stat, 250)).toBe('fair');
  });

  it('상위 25% 초과면 비싸다', () => {
    expect(judgePrice(stat, 400)).toBe('expensive');
  });

  it('표본이 부족하거나 통계가 없으면 판단하지 않는다', () => {
    expect(judgePrice(undefined, 100)).toBe('unknown');
    expect(judgePrice(buildPriceIndex([obs()])[0], 100)).toBe('unknown');
  });

  it('가격이 0 이하면 판단하지 않는다', () => {
    expect(judgePrice(stat, 0)).toBe('unknown');
  });
});

describe('tagSide', () => {
  it('거래 기록에 매입/매도 꼬리표를 붙인다', () => {
    const tagged = tagSide([trade(), trade()], 'sell');
    expect(tagged.every((row) => row.side === 'sell')).toBe(true);
  });
});
