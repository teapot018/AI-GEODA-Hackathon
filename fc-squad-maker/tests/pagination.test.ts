import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TradeRecord } from '@/lib/nexon/types';

/**
 * offset 페이지네이션이 살아 있는 목록 위에서 도는 문제.
 *
 * `/user/trade` 는 최신순 목록을 `offset`/`limit` 으로 잘라 준다. 0페이지를
 * 받고 1페이지를 부르는 사이에 새 거래가 K건 들어오면 목록 전체가 K칸 뒤로
 * 밀리고, `offset=100` 은 **이미 본 뒷부분 K건을 다시** 준다.
 *
 * 그대로 쌓으면 같은 체결이 두 번 세어진다. 표본 수가 부풀고, 거래액 합계가
 * 틀리고, 같은 시각 두 건이 되어 간격 중앙값이 0 으로 주저앉는다.
 *
 * 여기서는 그 밀림을 실제로 만들어 놓고, 중복이 걸러지는지와 그 사실이
 * 화면 문구까지 올라오는지를 본다.
 */

const OUID = 'ouid-drift';
const PAGE_SIZE = 100;

/** 최신순 목록에서 saleSn 이 큰 쪽이 새 거래다. */
const row = (saleSn: number): TradeRecord => ({
  tradeDate: new Date(Date.UTC(2024, 5, 1, 0, 0, 0) + saleSn * 60_000)
    .toISOString()
    .slice(0, 19),
  saleSn: String(saleSn),
  spid: 300_000_000 + (saleSn % 7),
  grade: 1,
  value: 1_000_000 + saleSn,
});

/**
 * 목록을 최신순(내림차순)으로 만든다. `head` 가 가장 최근 saleSn.
 * 길이는 `size`.
 */
const listing = (head: number, size: number) =>
  Array.from({ length: size }, (_, i) => row(head - i));

interface Plan {
  /** 호출 순서대로: 그 시점의 목록 맨 앞 saleSn */
  headsByCall: number[];
  size: number;
}

const requests: string[] = [];

function serve(plan: Plan) {
  let call = 0;
  vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    requests.push(href);
    const url = new URL(href);

    if (!url.pathname.includes('/user/trade')) {
      return Promise.reject(new Error(`이 테스트가 다루지 않는 경로: ${url.pathname}`));
    }
    if (url.searchParams.get('tradetype') === 'sell') {
      return Promise.resolve(new Response('[]', { status: 200 }));
    }

    // 매입 쪽만 밀림을 흉내 낸다.
    const head = plan.headsByCall[Math.min(call, plan.headsByCall.length - 1)];
    call += 1;
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const limit = Number(url.searchParams.get('limit') ?? PAGE_SIZE);
    const body = listing(head, plan.size).slice(offset, offset + limit);
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  });
}

const loadInsights = async () => {
  vi.resetModules();
  process.env.NX_API_KEY = 'test-key-not-real';
  return import('@/lib/nexon/insights');
};

beforeEach(() => {
  requests.length = 0;
});

afterEach(() => {
  delete process.env.NX_API_KEY;
  vi.unstubAllGlobals();
});

describe('/user/trade offset 페이지네이션', () => {
  it('밀리지 않으면 두 페이지가 그대로 이어진다', async () => {
    // 목록이 그대로면 0페이지 100건 + 1페이지 100건 = 200건, 겹침 없음.
    serve({ headsByCall: [200, 200], size: 200 });
    const { getMarketReport } = await loadInsights();

    const { data, source, note } = await getMarketReport({ ouid: OUID, pages: 2 });

    expect(source).toBe('nexon');
    expect(data.summary.samples).toBe(200);
    expect(note).toBeUndefined();
  });

  it('조회 중 새 거래가 들어오면 겹친 만큼만 걸러 낸다', async () => {
    /*
     * 0페이지를 받을 때 목록은 200..1 (맨 앞 200). 그 사이 3건이 들어와
     * 1페이지를 받을 때는 203..1 이 된다. `offset=100` 은 새 목록의
     * 100~199번째 = 103..4 를 주는데, 그중 103·102·101 은 0페이지에서
     * 이미 본 것이다.
     */
    serve({ headsByCall: [200, 203], size: 203 });
    const { getMarketReport } = await loadInsights();

    const { data, note } = await getMarketReport({ ouid: OUID, pages: 2 });

    // 200건을 받았지만 서로 다른 체결은 197건이다.
    expect(data.summary.samples).toBe(197);
    expect(data.summary.buyCount).toBe(197);
    expect(note).toContain('겹친 3건');
    expect(note).toContain('덜 내려갔습니다');
  });

  it('밀림을 마지막 페이지로 착각해 일찍 멈추지 않는다', async () => {
    /*
     * 멈춤 판단을 중복 제거 뒤의 수로 하면, 겹침이 있는 페이지가
     * PAGE_SIZE 보다 적어 보여 "더 볼 게 없다"로 읽힌다. 받은 건수로
     * 판단해야 3페이지까지 간다.
     */
    serve({ headsByCall: [300, 303, 306], size: 306 });
    const { getMarketReport } = await loadInsights();

    const { data } = await getMarketReport({ ouid: OUID, pages: 3 });

    expect(data.pagesFetched).toBe(4); // 매입 3 + 매도 1(빈 배열)
    expect(data.summary.samples).toBeGreaterThan(200);
  });

  it('겹친 거래가 거래액에 두 번 더해지지 않는다', async () => {
    /*
     * 중복은 표본 수만 부풀리는 게 아니라 **돈을 두 번 센다**. 순매수/순매도가
     * 틀리면 "이 구단주가 얼마를 썼나" 라는 답 자체가 틀린다.
     *
     * 서로 다른 체결은 saleSn 4~200 의 197건이고, 값은 1,000,000 + saleSn 이다.
     *   197 * 1_000_000 + (4+…+200) = 197_000_000 + 20_094
     * 중복을 걸러 내지 않으면 200_020_400 이 된다.
     */
    serve({ headsByCall: [200, 203], size: 203 });
    const { getMarketReport } = await loadInsights();

    const { data } = await getMarketReport({ ouid: OUID, pages: 2 });

    expect(data.summary.buyTotal).toBe(197_020_094);
    expect(data.summary.buyTotal).not.toBe(200_020_400);
    // 매입만 있으므로 순흐름은 그만큼 음수다.
    expect(data.summary.netFlow).toBe(-197_020_094);
  });
});
