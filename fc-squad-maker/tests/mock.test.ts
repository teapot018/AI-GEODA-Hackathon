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
    /*
     * 겹치면 그 카드에 기준가가 둘 생겨 체결 기록이 두 가격대로 갈라진다.
     *
     * 폭은 반드시 **같은 등급 안에서** 재야 한다. 등급이 다르면 값이 몇 배씩
     * 벌어지는 게 정상이라(그게 강화다), 등급을 섞어 재면 이 검사가 정상적인
     * 강화 곡선을 버그로 신고한다.
     */
    for (const nickname of ['앙리테스트', '사이드테스트', 'a', 'b', 'c']) {
      const rows = mockMarketTrades(nickname, 'buy', 300);
      const observations = tagSide(rows, 'buy');

      for (const grade of new Set(rows.map((row) => row.grade))) {
        for (const stat of buildPriceIndex(observations, { grade })) {
          if (stat.samples < 4) continue;
          // 한 카드·한 등급의 최고가가 최저가의 몇 배까지 벌어질 수 있나.
          // 생성기는 기준가에 ±15% 잡음과 ±30% 추세만 준다.
          expect(stat.max / stat.min, `${nickname} / spid ${stat.spid} / +${grade}`).toBeLessThan(3);
        }
      }
    }
  });

  it('강화 등급이 높을수록 비싸다', () => {
    /*
     * 예전에는 등급과 가격을 따로 굴려서 +1 과 +6 이 같은 값에 거래됐다.
     * 게임을 아는 사람이 화면을 보자마자 가짜라고 아는 그림이었고,
     * 등급별 가격을 보러 온 사람에게는 아예 쓸모가 없었다.
     */
    const observations = tagSide(mockMarketTrades('등급곡선', 'buy', 600), 'buy');

    let compared = 0;
    for (const stat of buildPriceIndex(observations)) {
      const ladder = stat.byGrade.filter((row) => row.samples >= 2);
      for (let i = 1; i < ladder.length; i += 1) {
        expect(
          ladder[i].median,
          `spid ${stat.spid}: +${ladder[i].grade} 가 +${ladder[i - 1].grade} 보다 싸다`,
        ).toBeGreaterThan(ladder[i - 1].median);
        compared += 1;
      }
    }

    expect(compared, '비교할 등급 쌍이 있어야 검사가 성립한다').toBeGreaterThan(0);
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
