import { beforeEach, describe, expect, it } from 'vitest';

import {
  estimateRefresh,
  historyOf,
  recordBaseline,
  resetRefreshHistory,
} from '@/lib/market/refresh';

const HOUR = 3_600_000;
const T0 = new Date('2026-09-01T00:00:00Z');
const at = (hours: number) => new Date(T0.getTime() + hours * HOUR);

const SPID = 300_235_494;

beforeEach(() => resetRefreshHistory());

describe('recordBaseline', () => {
  it('첫 확인은 변경이 아니다', () => {
    const h = recordBaseline(SPID, 1, 1_000_000, at(0));
    expect(h.current).toBe(1_000_000);
    expect(h.changes).toHaveLength(0);
    expect(h.checks).toBe(1);
  });

  it('같은 값이면 변경으로 세지 않는다', () => {
    recordBaseline(SPID, 1, 1_000_000, at(0));
    const h = recordBaseline(SPID, 1, 1_000_000, at(2));
    expect(h.changes).toHaveLength(0);
    expect(h.checks).toBe(2);
  });

  it('값이 달라지면 변경으로 세고, 직전 확인 시각을 같이 남긴다', () => {
    /*
     * 실제 갱신 시각은 모른다. 아는 건 "직전에 봤을 때는 100만이었고
     * 지금 보니 120만" 이라는 것뿐이라, 그 구간을 통째로 들고 있는다.
     */
    recordBaseline(SPID, 1, 1_000_000, at(0));
    const h = recordBaseline(SPID, 1, 1_200_000, at(3));

    expect(h.changes).toHaveLength(1);
    expect(h.changes[0].from).toBe(1_000_000);
    expect(h.changes[0].to).toBe(1_200_000);
    expect(h.changes[0].noticedAt).toEqual(at(3));
    expect(h.changes[0].afterCheckAt).toEqual(at(0));
  });

  it('읽기 실패는 아무것도 기록하지 않는다', () => {
    // 실패를 '변경 없음' 으로 세면 간격이 실제보다 길어 보인다.
    recordBaseline(SPID, 1, 1_000_000, at(0));
    recordBaseline(SPID, 1, null, at(1));
    const h = recordBaseline(SPID, 1, 1_000_000, at(2));

    expect(h.checks).toBe(2);
    expect(h.changes).toHaveLength(0);
    expect(h.lastCheckedAt).toEqual(at(2));
  });

  it('실패 뒤에도 직전 성공 시각을 기준으로 구간을 잡는다', () => {
    recordBaseline(SPID, 1, 1_000_000, at(0));
    recordBaseline(SPID, 1, null, at(1));
    const h = recordBaseline(SPID, 1, 1_200_000, at(2));

    expect(h.changes[0].afterCheckAt).toEqual(at(0));
  });

  it('등급이 다르면 다른 카드로 센다', () => {
    // +1 과 +5 는 서로 다른 페이지고 갱신도 따로 돈다.
    recordBaseline(SPID, 1, 1_000_000, at(0));
    recordBaseline(SPID, 5, 9_000_000, at(0));

    expect(historyOf(SPID, 1)?.current).toBe(1_000_000);
    expect(historyOf(SPID, 5)?.current).toBe(9_000_000);
  });

  it('본 적 없는 카드는 null', () => {
    expect(historyOf(999, 1)).toBeNull();
  });
});

describe('estimateRefresh', () => {
  /** 2시간마다 값이 바뀌고, 매시간 확인하는 이상적인 상황 */
  function observeEveryHour(changeEvery: number, hours: number) {
    let price = 1_000_000;
    for (let h = 0; h <= hours; h += 1) {
      if (h > 0 && h % changeEvery === 0) price += 10_000;
      recordBaseline(SPID, 1, price, at(h));
    }
  }

  it('관측이 없으면 아무 말도 하지 않는다', () => {
    const e = estimateRefresh(null);
    expect(e.confidence).toBe('none');
    expect(e.nextAt).toBeNull();
    expect(e.intervalMs).toBeNull();
  });

  it('변경을 한 번만 봤으면 주기를 말하지 않는다', () => {
    // 변경 1회 = 간격 0개. 마지막 갱신 시각만 사실로 남는다.
    recordBaseline(SPID, 1, 1_000_000, at(0));
    recordBaseline(SPID, 1, 1_200_000, at(2));

    const e = estimateRefresh(historyOf(SPID, 1), at(3));
    expect(e.confidence).toBe('none');
    expect(e.intervalMs).toBeNull();
    expect(e.nextAt).toBeNull();
    // 마지막으로 바뀐 걸 확인한 시각은 사실이므로 남긴다.
    expect(e.lastChangeAt).toEqual(at(2));
  });

  it('간격을 여러 번 촘촘히 보면 주기를 낸다', () => {
    observeEveryHour(2, 12);

    const e = estimateRefresh(historyOf(SPID, 1), at(12));
    expect(e.intervalMs).toBe(2 * HOUR);
    expect(e.intervalSamples).toBeGreaterThanOrEqual(3);
    expect(e.confidence).toBe('fair');
  });

  it('확인이 촘촘하면 관측 구간이 좁다', () => {
    // 매시간 확인 → 변경을 알아채기까지 최대 1시간
    observeEveryHour(2, 12);
    expect(estimateRefresh(historyOf(SPID, 1), at(12)).windowMs).toBe(HOUR);
  });

  it('띄엄띄엄 확인하면 주기는 나와도 확신하지 않는다', () => {
    /*
     * 12시간마다 한 번씩만 확인하면, 값이 2시간마다 바뀌어도 우리가 보는
     * 간격은 12시간이다. 관측 구간이 간격만큼 넓어 정밀도가 없으므로
     * 'fair' 를 주면 안 된다.
     */
    let price = 1_000_000;
    for (let h = 0; h <= 60; h += 12) {
      price += 10_000;
      recordBaseline(SPID, 1, price, at(h));
    }

    const e = estimateRefresh(historyOf(SPID, 1), at(60));
    expect(e.intervalSamples).toBeGreaterThanOrEqual(3);
    expect(e.windowMs).toBe(12 * HOUR);
    expect(e.confidence).toBe('weak');
  });

  it('간격이 들쭉날쭉하면 확신하지 않는다', () => {
    let price = 1_000_000;
    for (const h of [0, 1, 2, 10, 11, 30]) {
      price += 10_000;
      recordBaseline(SPID, 1, price, at(h));
    }

    const e = estimateRefresh(historyOf(SPID, 1), at(30));
    expect(e.intervalSamples).toBeGreaterThanOrEqual(3);
    expect(e.confidence).toBe('weak');
  });

  it('다음 예상은 마지막 갱신 + 관측 주기다', () => {
    observeEveryHour(2, 12);

    const e = estimateRefresh(historyOf(SPID, 1), at(12));
    expect(e.lastChangeAt).toEqual(at(12));
    expect(e.nextAt).toEqual(at(14));
    expect(e.overdue).toBe(false);
  });

  it('예상 시각이 지나면 지났다고 말한다', () => {
    observeEveryHour(2, 12);

    const e = estimateRefresh(historyOf(SPID, 1), at(20));
    expect(e.overdue).toBe(true);
  });

  it('근거가 없으면 시각을 찍지 않는다', () => {
    /*
     * 이 프로젝트가 nextRefreshAt() 을 지운 이유가 이것이다 — 주기를
     * 가정하고 시각을 찍으면 사람은 그 시각에 맞춰 다시 들어온다.
     * 관측이 없으면 예상도 없다.
     */
    recordBaseline(SPID, 1, 1_000_000, at(0));
    recordBaseline(SPID, 1, 1_000_000, at(5));

    const e = estimateRefresh(historyOf(SPID, 1), at(5));
    expect(e.nextAt).toBeNull();
    expect(e.confidence).toBe('none');
  });
});
