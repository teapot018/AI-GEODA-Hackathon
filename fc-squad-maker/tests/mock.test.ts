import { describe, expect, it } from 'vitest';

import { mockMarketTrades } from '@/lib/nexon/mock';
import { buildPriceIndex, tagSide } from '@/lib/market/observations';

/**
 * 데모 데이터도 "시세처럼" 보여야 쓸모가 있다. 여기서 보는 건 예쁨이
 * 아니라 통계가 성립하는지다 — 한 카드의 가격이 두 덩어리로 갈라지면
 * 중앙값·사분위·추세가 전부 무의미해진다.
 */
describe('mockMarketTrades', () => {
  it('같은 카드를 풀에 두 번 넣지 않는다', () => {
    // 겹치면 그 카드에 기준가가 둘 생겨 체결 기록이 두 가격대로 갈라진다.
    for (const nickname of ['앙리테스트', '사이드테스트', 'a', 'b', 'c']) {
      const rows = mockMarketTrades(nickname, 'buy', 300);
      const stats = buildPriceIndex(tagSide(rows, 'buy'));

      for (const stat of stats) {
        if (stat.samples < 4) continue;
        // 한 카드의 최고가가 최저가의 몇 배까지 벌어질 수 있나.
        // 생성기는 기준가에 ±15% 잡음과 ±30% 추세만 준다.
        expect(stat.max / stat.min, `${nickname} / spid ${stat.spid}`).toBeLessThan(3);
      }
    }
  });

  it('결정적이다 — 같은 닉네임이면 같은 데이터', () => {
    const a = mockMarketTrades('결정성', 'buy', 50);
    const b = mockMarketTrades('결정성', 'buy', 50);
    expect(a).toEqual(b);
  });

  it('닉네임이 다르면 다른 데이터', () => {
    const a = mockMarketTrades('갑', 'buy', 50);
    const b = mockMarketTrades('을', 'buy', 50);
    expect(a).not.toEqual(b);
  });

  it('값은 항상 양수다 — 0원 체결은 통계를 망친다', () => {
    const rows = mockMarketTrades('양수', 'sell', 200);
    expect(rows.every((row) => row.value > 0)).toBe(true);
  });
});
