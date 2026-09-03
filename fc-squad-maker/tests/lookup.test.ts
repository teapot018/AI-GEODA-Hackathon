import { beforeEach, describe, expect, it } from 'vitest';

import { lookupCardPrices } from '@/lib/market/lookup';
import { absorb, reset } from '@/lib/market/pool';
import { searchPlayers } from '@/lib/players/catalog';
import { meaningOf, type Observation, type TradeSide } from '@/lib/market/observations';

/** side 와 시각 의미를 함께 — 둘을 따로 적으면 어긋날 수 있다. */
const sideOf = (side: TradeSide) => ({ side, timestampMeaning: meaningOf(side) });

const NOW = new Date('2026-09-01T00:00:00Z');

/**
 * 카탈로그에서 실제 spid 를 받아 쓴다.
 * 데모 카탈로그는 spid 를 시즌·이름으로 만들어 내므로 상수로 박으면
 * 시드가 바뀔 때 조용히 엉뚱한 카드를 시험하게 된다.
 */
async function spidOf(name: string): Promise<number> {
  const { cards } = await searchPlayers({ query: name, limit: 1 });
  expect(cards.length, `${name} 카드를 카탈로그에서 찾지 못했다`).toBeGreaterThan(0);
  return cards[0].spid;
}

function trades(spid: number, values: number[], grade = 1): Observation[] {
  return values.map((value, i) => ({
    tradeDate: `2026-08-3${(i % 2) + 1}T0${i % 9}:00:00`,
    saleSn: `${spid}-${grade}-${i}`,
    spid,
    grade,
    value,
    ...sideOf(i % 2 === 0 ? 'buy' : 'sell'),
  }));
}

beforeEach(() => reset());

describe('lookupCardPrices', () => {
  it('선수 이름으로 풀에 쌓인 체결가를 찾는다', async () => {
    const spid = await spidOf('손흥민');
    absorb(trades(spid, [1_000_000, 1_200_000, 1_100_000]), NOW, 'nexon');

    const result = await lookupCardPrices({ query: '손흥민' });
    const hit = result.cards.find((card) => card.spid === spid);

    expect(hit).toBeDefined();
    expect(hit?.stat?.samples).toBe(3);
    expect(hit?.stat?.median).toBe(1_100_000);
    expect(result.source).toBe('nexon');
  });

  it('초성으로도 찾는다', async () => {
    const spid = await spidOf('손흥민');
    absorb(trades(spid, [900_000, 950_000]), NOW, 'nexon');

    const result = await lookupCardPrices({ query: 'ㅅㅎㅁ' });
    expect(result.cards.some((card) => card.spid === spid)).toBe(true);
  });

  it('spid 로 카드 하나만 집어 볼 수 있다', async () => {
    const spid = await spidOf('김민재');
    absorb(trades(spid, [500_000, 600_000]), NOW, 'nexon');

    const result = await lookupCardPrices({ spid });
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].spid).toBe(spid);
    expect(result.cards[0].stat?.samples).toBe(2);
  });

  it('관측이 없는 카드는 값을 지어내지 않고 null 로 돌려준다', async () => {
    // 풀은 비어 있다. 이름은 맞지만 체결 기록이 없는 상태.
    const result = await lookupCardPrices({ query: '손흥민' });

    expect(result.cards.length).toBeGreaterThan(0);
    expect(result.cards.every((card) => card.stat === null)).toBe(true);
    expect(result.withoutSamples).toBe(result.cards.length);
    expect(result.poolSamples).toBe(0);
  });

  it('관측이 있는 카드를 관측 없는 카드보다 앞에 놓는다', async () => {
    /*
     * 이 정렬이 이 기능의 핵심이다. 이름 적합도로만 자르면 시즌별로 수십 장
     * 있는 카드 중 표본이 있는 한 장이 뒤로 밀려 잘려 나가고, 사용자는
     * "관측 없음" 만 잔뜩 보게 된다 — 데이터는 있는데도.
     */
    const many = await searchPlayers({ query: '손흥민', limit: 40 });
    expect(many.cards.length, '시즌이 여러 장 있어야 정렬을 시험할 수 있다').toBeGreaterThan(3);

    // 이름 순위에서 뒤쪽에 있는 카드에만 표본을 심는다.
    const buried = many.cards[many.cards.length - 1];
    absorb(trades(buried.spid, [700_000, 800_000]), NOW, 'nexon');

    const result = await lookupCardPrices({ query: '손흥민', limit: 3 });
    expect(result.cards[0].spid).toBe(buried.spid);
    expect(result.cards[0].stat?.samples).toBe(2);
  });

  it('표본이 많은 카드가 앞에 온다', async () => {
    const cards = (await searchPlayers({ query: '손흥민', limit: 10 })).cards;
    const thin = cards[0];
    const thick = cards[1];

    absorb(trades(thin.spid, [100_000, 110_000]), NOW, 'nexon');
    absorb(trades(thick.spid, [200_000, 210_000, 220_000, 230_000]), NOW, 'nexon');

    const result = await lookupCardPrices({ query: '손흥민' });
    expect(result.cards[0].spid).toBe(thick.spid);
    expect(result.cards[1].spid).toBe(thin.spid);
  });

  it('데모 관측이 실데이터 검색 결과에 섞이지 않는다', async () => {
    /*
     * pool.ts 가 풀을 출처별로 갈라 둔 이유가 여기서도 그대로 걸린다.
     * 데모 풀에만 값이 있는데 nexon 을 지정하면 빈손이어야 한다 —
     * 지어낸 체결가가 '실거래' 라는 이름을 달고 나가면 안 된다.
     */
    const spid = await spidOf('손흥민');
    absorb(trades(spid, [1, 2, 3]), NOW, 'mock');

    const real = await lookupCardPrices({ query: '손흥민', source: 'nexon' });
    expect(real.cards.every((card) => card.stat === null)).toBe(true);
    expect(real.poolSamples).toBe(0);

    const demo = await lookupCardPrices({ query: '손흥민', source: 'mock' });
    expect(demo.cards.find((card) => card.spid === spid)?.stat?.samples).toBe(3);
  });

  it('실데이터 풀이 비어 있으면 데모 풀로 내려가되 그 사실을 밝힌다', async () => {
    const spid = await spidOf('손흥민');
    absorb(trades(spid, [10, 20]), NOW, 'mock');

    const result = await lookupCardPrices({ query: '손흥민' });
    expect(result.source).toBe('mock');
    expect(result.cards.find((card) => card.spid === spid)?.stat?.samples).toBe(2);
  });

  it('실데이터가 하나라도 있으면 데모 풀을 보지 않는다', async () => {
    const son = await spidOf('손흥민');
    absorb(trades(son, [10, 20]), NOW, 'mock');
    // 전혀 다른 카드로 실데이터 풀을 채운다.
    absorb(trades(await spidOf('김민재'), [500_000, 510_000]), NOW, 'nexon');

    const result = await lookupCardPrices({ query: '손흥민' });
    expect(result.source).toBe('nexon');
    expect(result.cards.every((card) => card.stat === null)).toBe(true);
  });

  it('등급을 고르면 그 등급의 시세만 낸다', async () => {
    /*
     * +1 과 +6 은 이름만 같지 값이 몇 배씩 다른 물건이다. 섞어 놓은
     * 중앙값은 어느 쪽 시세도 아니라서, 등급별 가격을 보러 온 사람에게
     * 아무 답이 되지 않는다.
     */
    const spid = await spidOf('손흥민');
    absorb(trades(spid, [1_000_000, 1_100_000], 1), NOW, 'nexon');
    absorb(trades(spid, [12_000_000, 13_000_000], 6), NOW, 'nexon');

    const plusOne = await lookupCardPrices({ query: '손흥민', grade: 1 });
    const one = plusOne.cards.find((card) => card.spid === spid);
    expect(one?.stat?.median).toBe(1_050_000);
    expect(one?.stat?.samples).toBe(2);
    expect(plusOne.grade).toBe(1);

    const plusSix = await lookupCardPrices({ query: '손흥민', grade: 6 });
    expect(plusSix.cards.find((card) => card.spid === spid)?.stat?.median).toBe(12_500_000);

    // 등급을 안 고르면 둘이 섞여 어느 쪽도 아닌 값이 나온다.
    const mixed = await lookupCardPrices({ query: '손흥민' });
    expect(mixed.grade).toBeNull();
    expect(mixed.cards.find((card) => card.spid === spid)?.stat?.median).toBe(6_550_000);
  });

  it('등급을 골라도 등급 사다리는 전부 보여 준다', async () => {
    // +1 을 골라 놓고 "그럼 +6 은?" 을 물으려면 다시 검색해야 한다면
    // 등급을 고르는 의미가 없다.
    const spid = await spidOf('손흥민');
    absorb(trades(spid, [1_000_000, 1_100_000], 1), NOW, 'nexon');
    absorb(trades(spid, [12_000_000, 13_000_000], 6), NOW, 'nexon');

    const result = await lookupCardPrices({ query: '손흥민', grade: 1 });
    const hit = result.cards.find((card) => card.spid === spid);

    expect(hit?.stat?.median).toBe(1_050_000);
    expect(hit?.stat?.byGrade.map((row) => row.grade)).toEqual([1, 6]);
    expect(hit?.stat?.byGrade.find((row) => row.grade === 6)?.median).toBe(12_500_000);
  });

  it('어느 등급에 표본이 있는지 알려 준다', async () => {
    // 이 목록은 선택지를 거르는 데 쓰지 않는다 — 화면은 +1~+10 을 전부
    // 띄우고, 이 값으로 데이터가 있는 등급에 표시만 한다.
    const spid = await spidOf('손흥민');
    absorb(trades(spid, [1_000_000, 1_100_000], 1), NOW, 'nexon');
    absorb(trades(spid, [5_000_000], 4), NOW, 'nexon');

    const result = await lookupCardPrices({ query: '손흥민' });
    expect(result.availableGrades).toEqual([1, 4]);
  });

  it('고른 등급의 표본이 없으면 관측 없음으로 둔다', async () => {
    // +1 기록만 있는데 +6 을 물으면, 값을 지어내지 않고 없다고 한다.
    const spid = await spidOf('손흥민');
    absorb(trades(spid, [1_000_000, 1_100_000], 1), NOW, 'nexon');

    const result = await lookupCardPrices({ query: '손흥민', grade: 6 });
    expect(result.cards.find((card) => card.spid === spid)?.stat ?? null).toBeNull();
  });

  it('빈 검색어는 카드를 내지 않는다', async () => {
    const result = await lookupCardPrices({ query: '   ' });
    expect(result.cards).toHaveLength(0);
    expect(result.matched).toBe(0);
  });

  it('없는 이름은 빈 결과다', async () => {
    const result = await lookupCardPrices({ query: '존재하지않는선수이름zzz' });
    expect(result.cards).toHaveLength(0);
  });

  it('limit 을 넘겨 주지 않는다', async () => {
    const result = await lookupCardPrices({ query: '손흥민', limit: 2 });
    expect(result.cards.length).toBeLessThanOrEqual(2);
  });

  it('넥슨을 부르지 않는다', async () => {
    const attempted = globalThis.__attemptedRequests ?? [];
    const before = attempted.length;

    absorb(trades(await spidOf('손흥민'), [1_000, 2_000]), NOW, 'nexon');
    await lookupCardPrices({ query: '손흥민' });

    // 카탈로그 메타는 첫 로드에서 한 번 시도하고 데모로 떨어지므로,
    // 조회 자체가 새 요청을 만들지 않는다는 것만 본다.
    expect(attempted.slice(before).filter((url) => url.includes('/user/trade'))).toHaveLength(0);
  });
});
