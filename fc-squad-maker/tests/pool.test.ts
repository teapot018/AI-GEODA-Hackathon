import { beforeEach, describe, expect, it } from 'vitest';

import { absorb, lastAbsorbedAt, read, reset } from '@/lib/market/pool';
import { RETENTION_DAYS } from '@/lib/market/livefeed';
import type { Observation } from '@/lib/market/observations';

const NOW = new Date('2026-09-01T00:00:00Z');
const DAY = 86_400_000;

function obs(overrides: Partial<Observation> = {}): Observation {
  return {
    tradeDate: '2026-08-31T12:00:00',
    saleSn: '1',
    spid: 300_000_007,
    grade: 1,
    value: 1_000_000,
    side: 'buy',
    ...overrides,
  };
}

/** 같은 카드의 체결을 여러 건 만든다 (지수가 서려면 표본이 2건 이상 필요). */
function series(spid: number, values: number[], from = 1): Observation[] {
  return values.map((value, i) =>
    obs({ spid, value, saleSn: `${spid}-${from + i}`, tradeDate: `2026-08-3${(i % 2) + 1}T0${i % 9}:00:00` }),
  );
}

beforeEach(() => reset());

describe('absorb', () => {
  it('빈 풀에 첫 관측을 넣는다', () => {
    const result = absorb(series(1, [100, 120]), NOW);
    expect(result.stats.observations).toBe(2);
    expect(result.stats.cards).toBe(1);
    expect(result.added).toBe(2);
  });

  it('조회를 거듭하면 표본이 쌓인다', () => {
    absorb(series(1, [100, 120]), NOW);
    const second = absorb(series(2, [500, 520]), NOW);
    expect(second.stats.observations).toBe(4);
    expect(second.stats.cards).toBe(2);
    expect(second.added).toBe(2);
  });

  it('같은 거래를 다시 넣어도 표본이 부풀지 않는다', () => {
    const batch = series(1, [100, 120]);
    absorb(batch, NOW);
    const again = absorb(batch, NOW);
    expect(again.stats.observations).toBe(2);
    expect(again.added).toBe(0);
  });

  it('풀 전체를 접은 지수를 돌려준다', () => {
    absorb(series(1, [100, 200]), NOW);
    const result = absorb(series(2, [50, 70]), NOW);
    expect(result.pooledIndex.map((s) => s.spid).sort()).toEqual([1, 2]);
  });

  it('보관 기한이 지난 관측은 풀에서 빠진다 (약관상 갱신 의무)', () => {
    const stale = new Date(NOW.getTime() - (RETENTION_DAYS + 5) * DAY).toISOString().slice(0, 19);
    absorb([obs({ saleSn: 'old', tradeDate: stale })], NOW);
    // 오래된 관측만 있었으므로 정리 후 비어야 한다.
    expect(read()).toHaveLength(0);
  });

  it('기한이 지난 것만 골라 떨어뜨린다', () => {
    const stale = new Date(NOW.getTime() - (RETENTION_DAYS + 5) * DAY).toISOString().slice(0, 19);
    absorb([obs({ saleSn: 'old', tradeDate: stale }), obs({ saleSn: 'new' })], NOW);
    expect(read()).toHaveLength(1);
    expect(read()[0].saleSn).toBe('new');
  });

  it('만료가 신규 건수를 상쇄하지 않는다', () => {
    // 크기 차이로 재면 여기서 +0 이 나온다 — 새 체결 2건이 들어왔는데도.
    const stale = new Date(NOW.getTime() - (RETENTION_DAYS + 5) * DAY).toISOString().slice(0, 19);
    absorb(
      [obs({ saleSn: 'old-1', tradeDate: stale }), obs({ saleSn: 'old-2', tradeDate: stale })],
      new Date(NOW.getTime() - 40 * DAY), // 아직 기한 안이라 살아남는 시점에 넣는다
    );
    expect(read()).toHaveLength(2);

    const result = absorb(series(9, [100, 200]), NOW);
    expect(result.added).toBe(2); // 만료된 2건과 무관하게 신규는 2건
    expect(result.stats.observations).toBe(2); // 옛 2건은 빠졌다
  });

  it('이미 있던 관측은 신규로 세지 않는다', () => {
    const batch = series(1, [100, 120]);
    absorb(batch, NOW);
    const again = absorb([...batch, ...series(2, [500, 520])], NOW);
    expect(again.added).toBe(2); // 새 카드 2건만
  });

  it('흡수 시각을 기록한다', () => {
    expect(lastAbsorbedAt()).toBeNull();
    absorb(series(1, [100, 120]), NOW);
    expect(lastAbsorbedAt()?.toISOString()).toBe(NOW.toISOString());
  });
});

describe('movers', () => {
  it('첫 조회에는 비교 대상이 없어 움직임이 없다', () => {
    // 이전 스냅샷이 비어 있으면 전부 new 이고, new 는 mover 가 아니다.
    expect(absorb(series(1, [100, 100]), NOW).movers).toHaveLength(0);
  });

  it('중앙가가 바뀌면 움직인 카드로 잡는다', () => {
    absorb(series(1, [100, 100]), NOW);
    const after = absorb(series(1, [300, 300], 90), NOW);
    const mover = after.movers.find((m) => m.spid === 1);
    expect(mover?.direction).toBe('up');
    expect(mover!.after).toBeGreaterThan(mover!.before!);
  });

  it('값이 그대로면 움직임으로 잡지 않는다', () => {
    const batch = series(1, [100, 100]);
    absorb(batch, NOW);
    expect(absorb(batch, NOW).movers).toHaveLength(0);
  });
});

describe('reset', () => {
  it('풀을 비운다', () => {
    absorb(series(1, [100, 120]), NOW);
    expect(read().length).toBeGreaterThan(0);
    reset();
    expect(read()).toHaveLength(0);
    expect(lastAbsorbedAt()).toBeNull();
  });
});

describe('출처 분리', () => {
  it('데모 관측이 실데이터 풀에 섞이지 않는다', () => {
    // 넥슨이 429 를 한 번 뱉으면 그 조회는 데모로 대체된다. 그때 만들어진
    // 가짜 체결이 풀에 남으면, 다음 성공 조회는 source: 'nexon' 배지를 달고도
    // 가짜 가격이 섞인 표를 보여 주게 된다.
    absorb(series(999, [1, 1]), NOW, 'mock');
    const real = absorb(series(1, [100, 120]), NOW, 'nexon');

    expect(real.pooledIndex.map((s) => s.spid)).toEqual([1]);
    expect(real.stats.observations).toBe(2);
  });

  it('풀마다 직전 스냅샷을 따로 들고 있다', () => {
    // 출처가 달라진 것을 '가격이 움직였다'로 읽으면 안 된다.
    absorb(series(1, [100, 100]), NOW, 'mock');
    const real = absorb(series(1, [900, 900]), NOW, 'nexon');
    expect(real.movers).toHaveLength(0); // 실데이터 풀에는 비교 대상이 없다
    expect(real.pooledIndex[0].median).toBe(900);
  });

  it('한쪽 풀을 비워도 다른 쪽은 남는다', () => {
    absorb(series(1, [100, 120]), NOW, 'nexon');
    absorb(series(2, [500, 520]), NOW, 'mock');
    reset('mock');
    expect(read('mock')).toHaveLength(0);
    expect(read('nexon')).toHaveLength(2);
  });
});
