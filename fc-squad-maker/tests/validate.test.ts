import { describe, expect, it } from 'vitest';

import { validateTradeRecords } from '@/lib/nexon/validate';
import { NexonApiError } from '@/lib/nexon/client';

/**
 * `nexonFetch<T>` 의 `as T` 는 검사가 아니라 선언이다. 넥슨이 다른 모양을
 * 줘도 타입스크립트는 우리 편을 들어 주고, 문제는 한참 아래에서 터진다.
 *
 * 아래 기대값은 전부 **고치기 전에 실제로 재 본** 동작에서 나왔다.
 */

const GOOD = {
  tradeDate: '2024-06-01T00:00:00',
  saleSn: '1',
  spid: 300_000_001,
  grade: 1,
  value: 1000,
};

describe('validateTradeRecords', () => {
  it('멀쩡한 응답은 그대로 통과시킨다', () => {
    const { rows, dropped } = validateTradeRecords([GOOD], 'buy');
    expect(rows).toHaveLength(1);
    expect(dropped).toBe(0);
  });

  it('이웃이 망가졌다고 멀쩡한 행을 버리지 않는다', () => {
    /*
     * 고치기 전에는 배열에 null 이 하나 섞이면 **정상 행까지 사라졌다**
     * (표본 1 -> 0). 조용히 줄어드는 표본이 이 검증의 첫 번째 이유다.
     */
    for (const junk of [null, undefined, 'x', 42, []]) {
      const { rows, dropped } = validateTradeRecords([GOOD, junk], 'buy');
      expect(rows, `${JSON.stringify(junk)} 옆의 정상 행이 사라졌다`).toHaveLength(1);
      expect(dropped).toBe(1);
    }
  });

  it('tradeDate 가 없으면 버린다', () => {
    // 정렬·간격·보관 기한이 전부 이 축에 기댄다. 고치기 전에는
    // `.endsWith` of null 로 요청 전체가 터졌다.
    expect(validateTradeRecords([{ ...GOOD, tradeDate: null }], 'buy').dropped).toBe(1);
    expect(validateTradeRecords([{ ...GOOD, tradeDate: '' }], 'buy').dropped).toBe(1);
    expect(validateTradeRecords([{ ...GOOD, tradeDate: 20240601 }], 'buy').dropped).toBe(1);
  });

  it('spid 가 숫자가 아니면 버린다', () => {
    /*
     * 고치기 전에는 문자열 spid 가 **통계에 그대로 섞였다** (표본 1 -> 2).
     * 쓰레기를 조용히 받아들이는 쪽이 버리는 쪽보다 나쁘다 — 화면에는
     * 아무 표시도 남지 않는다.
     */
    expect(validateTradeRecords([{ ...GOOD, spid: 'x' }], 'buy').dropped).toBe(1);
    expect(validateTradeRecords([{ ...GOOD, spid: NaN }], 'buy').dropped).toBe(1);
  });

  it('saleSn 은 문자열로 통일한다', () => {
    // 중복 제거 키가 타입에 따라 갈리면 같은 거래가 두 번 남는다.
    const { rows } = validateTradeRecords([{ ...GOOD, saleSn: 12345 }], 'buy');
    expect(rows[0].saleSn).toBe('12345');
  });

  it('값이 빠진 거래는 버리지 않는다', () => {
    /*
     * 여기서 보는 것은 "행을 다룰 수 있는가" 이지 "값이 쓸 만한가" 가
     * 아니다. 값 없는 거래도 "그때 거래가 있었다" 는 사실로는 쓰이고,
     * 금액 통계 쪽이 이미 Number.isFinite 로 거른다.
     */
    expect(validateTradeRecords([{ ...GOOD, value: null }], 'buy').dropped).toBe(0);
    expect(validateTradeRecords([{ ...GOOD, value: 'abc' }], 'buy').dropped).toBe(0);
  });

  it('응답이 배열이 아니면 빈 배열로 바꾸지 않고 에러를 낸다', () => {
    /*
     * 빈 배열은 "거래가 없다" 는 **다른 말**이다. 서버 오류를 정상
     * 응답으로 둔갑시키면 화면은 조용히 거짓말을 하게 된다.
     * 고치기 전에는 `batch is not iterable` TypeError 가 500 으로 나갔다.
     */
    for (const junk of [null, undefined, { error: 'nope' }, 'x', 42]) {
      expect(() => validateTradeRecords(junk, 'buy')).toThrow(NexonApiError);
    }
    try {
      validateTradeRecords({ error: 'nope' }, 'sell');
    } catch (error) {
      expect((error as NexonApiError).code).toBe('UNEXPECTED_SHAPE');
      // 어느 방향이 이상했는지 메시지에 남는다.
      expect((error as NexonApiError).message).toContain('sell');
    }
  });

  it('버린 수를 정확히 센다', () => {
    const rows = [GOOD, null, { ...GOOD, spid: 'x' }, { ...GOOD, saleSn: '2' }, 'junk'];
    const out = validateTradeRecords(rows, 'buy');
    expect(out.rows).toHaveLength(2);
    expect(out.dropped).toBe(3);
  });
});
