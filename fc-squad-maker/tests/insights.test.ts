import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NX } from '@/lib/nexon/endpoints';
import type { TradeRecord } from '@/lib/nexon/types';

/**
 * ── 부분 실패에서도 진짜 데이터를 지키는가 ────────────────
 *
 * 넥슨 호출은 통째로 성공하거나 통째로 실패하지 않는다. 매입 3페이지 중
 * 2페이지만 오거나, 매도만 오고 매입이 429 로 막힌다. 그때 받아 온 진짜
 * 체결가를 버리고 데모 데이터로 떨어뜨리면 안 된다 — 이 파일이 보는 건
 * 그 경계다.
 *
 * nexonFetch 만 갈아끼운다. 통계·풀·카드 이름 붙이기는 실제 코드가 돈다.
 */
const nexonFetch = vi.hoisted(() => vi.fn());

vi.mock('@/lib/nexon/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/nexon/client')>();
  return { ...actual, nexonFetch };
});

const { NexonApiError, MissingApiKeyError } = await import('@/lib/nexon/client');
const { getMarketReport, getManagerAnalytics } = await import('@/lib/nexon/insights');
const { reset } = await import('@/lib/market/pool');

const PAGE = 100;

/** 한 페이지를 꽉 채운 거래 기록 (100건 미만이면 호출부가 멈춘다). */
function page(side: 'buy' | 'sell', offset: number, count = PAGE): TradeRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    tradeDate: `2026-08-${String(20 + (i % 10)).padStart(2, '0')}T12:00:00`,
    saleSn: `${side}-${offset + i}`,
    spid: 300_000_001 + (i % 3),
    grade: 1,
    value: 1_000_000 + i * 1_000,
  }));
}

type Params = { tradetype?: unknown; offset?: unknown };

/** tradetype/offset 을 보고 페이지별로 다르게 답하는 스텁을 깐다. */
function respond(fn: (side: 'buy' | 'sell', offset: number) => TradeRecord[]) {
  nexonFetch.mockImplementation(async (path: string, params: Params = {}) => {
    if (path !== NX.userTrade) return [];
    return fn(params.tradetype as 'buy' | 'sell', Number(params.offset ?? 0));
  });
}

beforeEach(() => {
  reset();
  nexonFetch.mockReset();
});

describe('getMarketReport — 부분 실패', () => {
  it('양쪽 다 오면 실데이터이고 덧붙일 말이 없다', async () => {
    respond((side, offset) => (offset === 0 ? page(side, offset) : []));

    const result = await getMarketReport({ ouid: 'x', pages: 3 });
    expect(result.source).toBe('nexon');
    expect(result.note).toBeUndefined();
    expect(result.data.summary.samples).toBe(200);
  });

  it('한쪽이 통째로 막혀도 나머지 진짜 데이터를 쓴다', async () => {
    respond((side, offset) => {
      if (side === 'buy') throw new NexonApiError(429, 'OPENAPI00007', '호출량 초과');
      return offset === 0 ? page(side, offset) : [];
    });

    const result = await getMarketReport({ ouid: 'x', pages: 3 });
    expect(result.source).toBe('nexon'); // 데모로 떨어지지 않는다
    expect(result.data.summary.buyCount).toBe(0);
    expect(result.data.summary.sellCount).toBe(100);
    expect(result.note).toContain('매입 내역을 받지 못해');
  });

  it('매도가 막혀도 매입은 살린다 (반대 방향)', async () => {
    /*
     * 매입 실패만 시험하면 코드가 한 방향에만 맞춰져 있어도 통과한다.
     * `/user/trade` 는 방향별로 따로 부르므로 양쪽을 다 걸어 봐야 한다.
     */
    respond((side, offset) => {
      if (side === 'sell') throw new NexonApiError(429, 'OPENAPI00007', '호출량 초과');
      return offset === 0 ? page(side, offset) : [];
    });

    const result = await getMarketReport({ ouid: 'x', pages: 3 });
    expect(result.source).toBe('nexon');
    expect(result.data.summary.sellCount).toBe(0);
    expect(result.data.summary.buyCount).toBe(100);
    expect(result.note).toContain('매도 내역을 받지 못해');
  });

  it('뒤쪽 페이지가 실패해도 앞 페이지는 살린다', async () => {
    respond((side, offset) => {
      if (side === 'buy' && offset >= 200) throw new NexonApiError(500, 'ERR', '서버 오류');
      return page(side, offset);
    });

    const result = await getMarketReport({ ouid: 'x', pages: 3 });
    expect(result.source).toBe('nexon');
    expect(result.data.summary.buyCount).toBe(200); // 2페이지분은 지켰다
    expect(result.data.summary.sellCount).toBe(300);
    expect(result.note).toContain('일부 페이지');
  });

  it('양쪽 다 실패해야 데모로 떨어진다', async () => {
    respond(() => {
      throw new NexonApiError(500, 'ERR', '서버 오류');
    });

    const result = await getMarketReport({ ouid: 'x', pages: 1 });
    expect(result.source).toBe('mock');
    expect(result.note).toContain('데모');
  });

  it('없는 구단주(404)는 데모로 덮지 않고 그대로 알린다', async () => {
    respond(() => {
      throw new NexonApiError(404, 'OPENAPI00003', '찾을 수 없음');
    });

    await expect(getMarketReport({ ouid: 'nobody', pages: 1 })).rejects.toThrow('찾을 수 없음');
  });

  it('키가 없으면 데모다', async () => {
    respond(() => {
      throw new MissingApiKeyError();
    });

    const result = await getMarketReport({ ouid: 'x', pages: 1 });
    expect(result.source).toBe('mock');
    expect(result.note).toContain('NX_API_KEY');
  });
});


describe('getManagerAnalytics — 경기 일부만 와도 센 것만 센다', () => {
  /** 매치 상세 한 건. 선수 수를 조절할 수 있게 열어 둔다. */
  function detail(matchId: string, ouid: string, players = 11) {
    return {
      matchId,
      matchDate: '2026-08-30T12:00:00',
      matchType: 50,
      matchInfo: [
        {
          ouid,
          nickname: '나',
          matchDetail: { matchResult: '승', matchEndType: 0, goalTotal: 2, goalTotalDisplay: 2 },
          shoot: {},
          pass: {},
          defence: {},
          player: Array.from({ length: players }, (_, i) => ({
            spId: 300_000_001 + i,
            spPosition: i,
            spGrade: 1,
            status: { spRating: 7 },
          })),
        },
      ],
    };
  }

  it('일부 경기의 상세가 실패해도 나머지로 분석하고, 몇 개가 빠졌는지 밝힌다', async () => {
    /*
     * 경기당 1콜이라 20경기면 20콜이고, 그중 몇 개는 흔히 실패한다.
     * 그때 "최근 20경기 분석" 이라고만 적으면 20경기가 다 반영된 것처럼
     * 읽힌다 — 요청/수신/집계/누락을 따로 세야 한다.
     */
    const ids = ['m1', 'm2', 'm3', 'm4', 'm5'];
    nexonFetch.mockImplementation(async (path: string, params: Record<string, unknown> = {}) => {
      if (path === NX.userMatch) return ids;
      if (path === NX.matchDetail) {
        const id = String(params.matchid);
        // 다섯 중 둘은 상세를 못 받는다.
        if (id === 'm2' || id === 'm4') throw new NexonApiError(500, 'ERR', '서버 오류');
        return detail(id, 'me');
      }
      return [];
    });

    const result = await getManagerAnalytics({ ouid: 'me', limit: 5 });

    expect(result.source).toBe('nexon'); // 데모로 떨어지지 않는다
    expect(result.data.requestedMatches).toBe(5);
    expect(result.data.listedMatches).toBe(5);
    expect(result.data.analyzedMatches).toBe(3);
    expect(result.data.incompleteMatches).toBe(2);
  });

  it('목록이 요청보다 적게 와도 그대로 센다', async () => {
    // 경기 수가 그만큼 없을 수 있다. 요청 수를 받은 수인 척하지 않는다.
    nexonFetch.mockImplementation(async (path: string, params: Record<string, unknown> = {}) => {
      if (path === NX.userMatch) return ['m1', 'm2'];
      if (path === NX.matchDetail) return detail(String(params.matchid), 'me');
      return [];
    });

    const result = await getManagerAnalytics({ ouid: 'me', limit: 10 });
    expect(result.data.requestedMatches).toBe(10);
    expect(result.data.listedMatches).toBe(2);
    expect(result.data.analyzedMatches).toBe(2);
    expect(result.data.incompleteMatches).toBe(0);
  });

  it('상세를 하나도 못 받으면 데모로 떨어진다', async () => {
    nexonFetch.mockImplementation(async (path: string) => {
      if (path === NX.userMatch) return ['m1', 'm2'];
      throw new NexonApiError(500, 'ERR', '서버 오류');
    });

    const result = await getManagerAnalytics({ ouid: 'me', limit: 2 });
    expect(result.source).toBe('mock');
  });

  it('선수가 11명보다 적게 와도 온 만큼만 센다', async () => {
    // 응답이 잘리거나 포지션 코드가 우리 표에 없으면 적게 온다.
    nexonFetch.mockImplementation(async (path: string, params: Record<string, unknown> = {}) => {
      if (path === NX.userMatch) return ['m1'];
      if (path === NX.matchDetail) return detail(String(params.matchid), 'me', 7);
      return [];
    });

    const result = await getManagerAnalytics({ ouid: 'me', limit: 1 });
    expect(result.source).toBe('nexon');
    expect(result.data.analyzedMatches).toBe(1);
    // 없는 선수를 채워 넣지 않는다.
    expect(result.data.players.length).toBeLessThanOrEqual(7);
  });
});
