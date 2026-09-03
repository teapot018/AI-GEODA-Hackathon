import { beforeEach, describe, expect, it } from 'vitest';

import {
  estimateRefresh,
  historyOf,
  recordBaseline,
  resetRefreshHistory,
  tradeCadence,
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

describe('tradeCadence — 데이터센터 없이 재는 거래 빈도', () => {
  /*
   * 위 estimateRefresh 는 넥슨 데이터센터 페이지를 읽어야 굴러가는데, 그
   * 페이지는 막혀 있을 수 있다(개발 환경은 CONNECT 403). 이 쪽은 /user/trade
   * 의 tradeDate 만 쓰므로 그 경로가 막혀도 항상 답한다.
   *
   * 인자는 (구매 등록 시각, 판매 완료 시각) 두 묶음이다. 한 묶음으로 받던
   * 시절이 있었는데, 그건 서로 다른 사건을 한 줄로 평균 낸 것이었다.
   */
  it('체결이 없으면 아무 말도 하지 않는다', () => {
    const c = tradeCadence([], []);
    expect(c.sale.lastAt).toBeNull();
    expect(c.sale.samples).toBe(0);
    expect(c.sale.intervalMs).toBeNull();
    expect(c.purchase.lastAt).toBeNull();
    expect(c.purchase.samples).toBe(0);
  });

  it('체결이 하나면 시각만 사실로 남기고 빈도는 말하지 않는다', () => {
    const c = tradeCadence([], [at(5)]);
    expect(c.sale.lastAt).toEqual(at(5));
    expect(c.sale.samples).toBe(1);
    expect(c.sale.intervalMs).toBeNull();
  });

  it('체결 간격의 중앙값을 낸다', () => {
    const c = tradeCadence([], [at(0), at(2), at(4), at(6)]);
    expect(c.sale.samples).toBe(4);
    expect(c.sale.intervalMs).toBe(2 * HOUR);
    expect(c.sale.lastAt).toEqual(at(6));
    expect(c.sale.spanMs).toBe(6 * HOUR);
  });

  it('순서가 뒤섞여 와도 시간순으로 잰다', () => {
    // 풀은 거래 기록을 온 순서대로 담으므로 정렬돼 있다는 보장이 없다.
    const c = tradeCadence([], [at(6), at(0), at(4), at(2)]);
    expect(c.sale.intervalMs).toBe(2 * HOUR);
    expect(c.sale.lastAt).toEqual(at(6));
  });

  it('공백 하나에 끌려가지 않는다 (평균이 아니라 중앙값)', () => {
    /*
     * 한 달 비어 있다가 몰아서 거래된 카드에서, 평균은 그 공백 하나가
     * 통째로 끌고 간다. 중앙값은 실제로 자주 있었던 간격을 가리킨다.
     */
    const c = tradeCadence([], [at(0), at(1), at(2), at(3), at(720)]);
    expect(c.sale.intervalMs).toBe(HOUR);
  });

  it('구매 등록과 판매 완료를 한 빈도로 섞지 않는다', () => {
    /*
     * 이것이 이 함수를 두 인자로 쪼갠 이유다. `/user/trade` 의 tradeDate 는
     * 방향에 따라 가리키는 사건이 다르다 — 구매 쪽은 **구매 등록** 시각,
     * 판매 쪽은 **판매 완료** 시각이다(nexon/types.ts 주석). 둘을 한 배열에
     * 부어 간격을 재면 "등록과 완료 사이" 라는, 아무도 묻지 않은 값이 나온다.
     *
     * 여기서는 매입이 4시간 간격, 매도가 5시간 간격이다. 합쳐서 재면
     * 뒤섞인 시각들의 간격(2시간)이 나오는데, 그건 매입 빈도도 매도
     * 빈도도 아닌 숫자다.
     */
    const purchases = [at(0), at(4), at(8), at(12)];
    const sales = [at(1), at(6), at(11), at(16)];

    const c = tradeCadence(purchases, sales);

    expect(c.purchase.intervalMs).toBe(4 * HOUR);
    expect(c.sale.intervalMs).toBe(5 * HOUR);
    expect(c.purchase.samples).toBe(4);
    expect(c.sale.samples).toBe(4);
    expect(c.purchase.lastAt).toEqual(at(12));
    expect(c.sale.lastAt).toEqual(at(16));

    // 합쳐서 쟀다면 나왔을 값. 어느 쪽 빈도도 아니다.
    const merged = tradeCadence([], [...purchases, ...sales]);
    expect(merged.sale.intervalMs).not.toBe(c.sale.intervalMs);
    expect(merged.sale.intervalMs).not.toBe(c.purchase.intervalMs);
  });

  it('한쪽만 있어도 다른 쪽을 빌려 오지 않는다', () => {
    // 매도 기록만 있는 카드에서 매입 빈도를 지어내면, 화면은 없는 사건을
    // 있었다고 적게 된다.
    const c = tradeCadence([], [at(0), at(3), at(6)]);
    expect(c.sale.intervalMs).toBe(3 * HOUR);
    expect(c.purchase.samples).toBe(0);
    expect(c.purchase.intervalMs).toBeNull();
    expect(c.purchase.lastAt).toBeNull();
  });

  it('다음 체결 시각은 내놓지 않는다', () => {
    /*
     * 체결은 주기가 아니라 사람이 사고파는 사건이다. 평균 2시간마다
     * 팔렸다고 다음이 2시간 뒤인 건 아니라서, 빈도까지만 말한다.
     * nextRefreshAt 을 지운 것과 같은 선.
     */
    const c = tradeCadence([], [at(0), at(2), at(4)]).sale as unknown as Record<string, unknown>;
    expect(c.nextAt).toBeUndefined();
    expect(c.confidence).toBeUndefined();
  });
});
