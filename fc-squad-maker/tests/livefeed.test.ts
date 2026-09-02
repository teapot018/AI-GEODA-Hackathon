import { describe, expect, it } from 'vitest';

import {
  canRefresh,
  diffIndex,
  mergeObservations,
  movers,
  msUntilRefresh,
  observationKey,
  poolStats,
  pruneObservations,
  RETENTION_DAYS,
} from '@/lib/market/livefeed';
import type { Observation, PricePoint, PriceStat } from '@/lib/market/observations';

const NOW = new Date('2026-09-01T00:00:00Z');
const DAY = 86_400_000;

function obs(overrides: Partial<Observation> = {}): Observation {
  return {
    tradeDate: '2026-08-31T12:00:00',
    saleSn: '100001',
    spid: 300_000_007,
    grade: 1,
    value: 1_000_000,
    side: 'buy',
    ...overrides,
  };
}

function stat(spid: number, median: number): PriceStat {
  // 이 테스트가 보는 건 spid 와 median 뿐이지만, 캐스트로 덮지 않고
  // 실제 타입을 그대로 채운다 — 스냅샷 모양이 바뀌면 여기서 걸려야 한다.
  const point: PricePoint = { date: '2026-08-31T12:00:00', value: median, side: 'buy' };
  return {
    spid, samples: 1, buyCount: 1, sellCount: 0,
    min: median, max: median, avg: median, median,
    p25: median, p75: median, spread: 0,
    buyMedian: median, sellMedian: null,
    latest: point, oldest: point,
    trend: 'flat', trendPercent: 0, byGrade: [], series: [point],
  };
}

describe('observationKey', () => {
  it('매입과 매도는 같은 번호라도 다른 관측이다', () => {
    expect(observationKey(obs({ side: 'buy' }))).not.toBe(observationKey(obs({ side: 'sell' })));
  });

  it('같은 번호라도 카드가 다르면 다른 관측이다', () => {
    expect(observationKey(obs({ spid: 1 }))).not.toBe(observationKey(obs({ spid: 2 })));
  });

  it('같은 거래는 같은 키다', () => {
    expect(observationKey(obs())).toBe(observationKey(obs({ value: 999 })));
  });
});

describe('mergeObservations', () => {
  it('겹치지 않는 관측은 모두 남는다', () => {
    const merged = mergeObservations([obs({ saleSn: 'a' })], [obs({ saleSn: 'b' })]);
    expect(merged).toHaveLength(2);
  });

  it('같은 거래가 다시 오면 새 값으로 덮는다', () => {
    const merged = mergeObservations(
      [obs({ saleSn: 'a', value: 100 })],
      [obs({ saleSn: 'a', value: 200 })],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].value).toBe(200);
  });

  it('최신 체결이 앞에 온다', () => {
    const merged = mergeObservations(
      [obs({ saleSn: 'old', tradeDate: '2026-08-01T00:00:00' })],
      [obs({ saleSn: 'new', tradeDate: '2026-08-31T00:00:00' })],
    );
    expect(merged.map((r) => r.saleSn)).toEqual(['new', 'old']);
  });

  it('빈 입력에도 깨지지 않는다', () => {
    expect(mergeObservations([], [])).toEqual([]);
    expect(mergeObservations([], [obs()])).toHaveLength(1);
  });

  it('입력을 변형하지 않는다', () => {
    const existing = [obs({ saleSn: 'a' })];
    mergeObservations(existing, [obs({ saleSn: 'b' })]);
    expect(existing).toHaveLength(1);
  });
});

describe('pruneObservations', () => {
  it('보관 기한 안쪽은 남긴다', () => {
    const recent = obs({ tradeDate: '2026-08-30T00:00:00' });
    expect(pruneObservations([recent], NOW)).toHaveLength(1);
  });

  it('30일이 지난 관측은 떨어뜨린다 (약관상 갱신 의무)', () => {
    const old = new Date(NOW.getTime() - (RETENTION_DAYS + 1) * DAY)
      .toISOString()
      .slice(0, 19);
    expect(pruneObservations([obs({ tradeDate: old })], NOW)).toHaveLength(0);
  });

  it('경계에 걸친 관측은 남긴다', () => {
    const edge = new Date(NOW.getTime() - RETENTION_DAYS * DAY).toISOString().slice(0, 19);
    expect(pruneObservations([obs({ tradeDate: edge })], NOW)).toHaveLength(1);
  });

  it('보관 기한을 좁혀 부를 수 있다', () => {
    const week = obs({ tradeDate: '2026-08-25T00:00:00' });
    expect(pruneObservations([week], NOW, 3)).toHaveLength(0);
    expect(pruneObservations([week], NOW, 30)).toHaveLength(1);
  });

  it('날짜를 못 읽는 관측은 조용히 버리지 않는다', () => {
    // 여기서 지우면 표본이 소리 없이 새는 셈이 된다.
    expect(pruneObservations([obs({ tradeDate: '망가진값' })], NOW)).toHaveLength(1);
  });
});

describe('diffIndex', () => {
  it('오른 카드와 내린 카드를 가른다', () => {
    const deltas = diffIndex([stat(1, 100), stat(2, 100)], [stat(1, 120), stat(2, 80)]);
    expect(deltas.find((d) => d.spid === 1)?.direction).toBe('up');
    expect(deltas.find((d) => d.spid === 2)?.direction).toBe('down');
  });

  it('변동률을 낸다', () => {
    const [delta] = diffIndex([stat(1, 100)], [stat(1, 125)]);
    expect(delta.diff).toBe(25);
    expect(delta.percent).toBeCloseTo(25);
  });

  it('같으면 same', () => {
    expect(diffIndex([stat(1, 100)], [stat(1, 100)])[0].direction).toBe('same');
  });

  it('이전에 없던 카드는 new (변동률 0)', () => {
    const [delta] = diffIndex([], [stat(9, 500)]);
    expect(delta.direction).toBe('new');
    expect(delta.before).toBeNull();
    expect(delta.percent).toBe(0);
  });

  it('이전 값이 0이어도 0으로 나누지 않는다', () => {
    const [delta] = diffIndex([stat(1, 0)], [stat(1, 100)]);
    expect(Number.isFinite(delta.percent)).toBe(true);
    expect(delta.percent).toBe(0);
  });

  it('사라진 카드는 결과에 없다 (이후 스냅샷 기준)', () => {
    expect(diffIndex([stat(1, 100)], [stat(2, 100)]).map((d) => d.spid)).toEqual([2]);
  });
});

describe('movers', () => {
  it('변동폭이 큰 순으로 자른다', () => {
    const deltas = diffIndex(
      [stat(1, 100), stat(2, 100), stat(3, 100)],
      [stat(1, 110), stat(2, 50), stat(3, 105)],
    );
    expect(movers(deltas, 2).map((d) => d.spid)).toEqual([2, 1]);
  });

  it('오르내림 없는 카드는 빠진다', () => {
    const deltas = diffIndex([stat(1, 100)], [stat(1, 100), stat(2, 300)]);
    expect(movers(deltas)).toHaveLength(0);
  });
});

describe('갱신 간격', () => {
  it('처음이면 바로 부를 수 있다', () => {
    expect(canRefresh(null, NOW)).toBe(true);
    expect(msUntilRefresh(null, NOW)).toBe(0);
  });

  it('최소 간격 안이면 캐시를 쓴다', () => {
    const justNow = new Date(NOW.getTime() - 10_000);
    expect(canRefresh(justNow, NOW)).toBe(false);
    expect(msUntilRefresh(justNow, NOW)).toBe(50_000);
  });

  it('간격이 지나면 다시 부를 수 있다', () => {
    const old = new Date(NOW.getTime() - 120_000);
    expect(canRefresh(old, NOW)).toBe(true);
    expect(msUntilRefresh(old, NOW)).toBe(0);
  });

  it('간격을 직접 줄 수 있다', () => {
    const ago = new Date(NOW.getTime() - 30_000);
    expect(canRefresh(ago, NOW, 10_000)).toBe(true);
    expect(canRefresh(ago, NOW, 60_000)).toBe(false);
  });
});

describe('poolStats', () => {
  it('관측 수와 카드 종수를 센다', () => {
    const stats = poolStats([
      obs({ saleSn: 'a', spid: 1 }),
      obs({ saleSn: 'b', spid: 1 }),
      obs({ saleSn: 'c', spid: 2 }),
    ]);
    expect(stats.observations).toBe(3);
    expect(stats.cards).toBe(2);
  });

  it('관측 구간을 낸다', () => {
    const stats = poolStats([
      obs({ saleSn: 'a', tradeDate: '2026-08-10T00:00:00' }),
      obs({ saleSn: 'b', tradeDate: '2026-08-20T00:00:00' }),
    ]);
    expect(stats.oldest).toBe('2026-08-10T00:00:00');
    expect(stats.newest).toBe('2026-08-20T00:00:00');
  });

  it('비어 있으면 0으로 채운다', () => {
    expect(poolStats([])).toEqual({ observations: 0, cards: 0, oldest: null, newest: null });
  });
});
