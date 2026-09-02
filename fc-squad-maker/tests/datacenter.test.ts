import { beforeEach, describe, expect, it } from 'vitest';

import {
  comparePrice,
  createGate,
  fetchOfficialPrice,
  GAP_EPSILON_PERCENT,
  OFFICIAL_TTL_MS,
  parseBP,
  parseOfficialPrice,
  playerInfoUrl,
  POLITE_GAP_MS,
  resetDatacenterState,
} from '@/lib/market/datacenter';

/**
 * 게이트와 기준가 기억은 모듈 전역이라, 테스트끼리 새어 나가지 않게 비운다.
 * 간격은 0 으로 둔다 — 간격 자체는 아래 createGate 블록에서 따로 본다.
 */
beforeEach(() => resetDatacenterState(0));

describe('playerInfoUrl', () => {
  it('spid 와 강화등급을 쿼리로 붙인다', () => {
    const url = new URL(playerInfoUrl(300235494, 5));
    expect(url.searchParams.get('spid')).toBe('300235494');
    expect(url.searchParams.get('n1Strong')).toBe('5');
  });

  it('강화등급 기본값은 1', () => {
    expect(new URL(playerInfoUrl(1)).searchParams.get('n1Strong')).toBe('1');
  });
});

describe('parseBP', () => {
  it('쉼표가 붙은 숫자를 읽는다', () => {
    expect(parseBP('1,234,567')).toBe(1_234_567);
    expect(parseBP('1,234,567 BP')).toBe(1_234_567);
  });

  it('한국식 축약을 읽는다', () => {
    expect(parseBP('123만')).toBe(1_230_000);
    expect(parseBP('2억')).toBe(200_000_000);
  });

  it('억과 만이 같이 오면 더한다', () => {
    expect(parseBP('1억 2,345만')).toBe(123_450_000);
  });

  it('만 뒤의 나머지도 더한다', () => {
    expect(parseBP('12만 3,456')).toBe(123_456);
  });

  it('축약을 숫자만 긁어 1로 읽지 않는다', () => {
    // "2억" 에서 2 만 떼면 값이 1억분의 1 이 된다. 이 순서가 중요하다.
    expect(parseBP('2억')).toBeGreaterThan(1_000_000);
  });

  it('숫자가 없으면 null', () => {
    expect(parseBP('가격 정보 없음')).toBeNull();
    expect(parseBP('')).toBeNull();
  });

  it('공백이 섞여 있어도 읽는다', () => {
    expect(parseBP('  1,000,000\n BP ')).toBe(1_000_000);
  });
});

describe('parseOfficialPrice — 전략별', () => {
  it('심어 둔 JSON 을 먼저 본다', () => {
    const html = `<script>window.__DATA__={"spid":1,"price":"4500000"}</script>`;
    const result = parseOfficialPrice(html, 1);
    expect(result.price).toBe(4_500_000);
    expect(result.strategy).toBe('embedded-json');
  });

  it('data 속성을 읽는다', () => {
    const result = parseOfficialPrice(`<div data-price="777000"></div>`, 1);
    expect(result.price).toBe(777_000);
    expect(result.strategy).toBe('data-attribute');
  });

  it('class 이름으로 찾는다', () => {
    const result = parseOfficialPrice(`<span class="txt_price">3,300,000 BP</span>`, 1);
    expect(result.price).toBe(3_300_000);
    expect(result.strategy).toBe('price-class');
  });

  it('최후 수단으로 BP 라벨 주변을 본다', () => {
    // 표도 class 도 없이 본문에 값만 흘러 있는 경우.
    const result = parseOfficialPrice(`<p>이 선수는 1,500,000 BP 에 거래됩니다</p>`, 1);
    expect(result.price).toBe(1_500_000);
    expect(result.strategy).toBe('bp-label');
  });

  it('전략 우선순위를 지킨다 — 정확한 것이 먼저', () => {
    // JSON 과 BP 라벨이 둘 다 있으면 JSON 을 믿는다.
    const html = `<script>{"price":100000}</script><span>999,999 BP</span>`;
    expect(parseOfficialPrice(html, 1).strategy).toBe('embedded-json');
  });

  it('못 찾으면 throw 하지 않고 none 을 남긴다', () => {
    // 한 카드를 못 읽었다고 전체 조회가 무너지면 안 된다.
    const result = parseOfficialPrice('<html><body>점검 중입니다</body></html>', 42, 3);
    expect(result.price).toBeNull();
    expect(result.strategy).toBe('none');
    expect(result.spid).toBe(42);
    expect(result.grade).toBe(3);
  });

  it('0 은 가격으로 인정하지 않는다', () => {
    expect(parseOfficialPrice(`<div data-price="0"></div>`, 1).strategy).not.toBe('data-attribute');
  });
});

describe('직접 지정한 패턴 (탈출구)', () => {
  it('내장 전략보다 먼저 쓰인다', () => {
    // BP 라벨이 있어도 지정한 패턴이 이긴다.
    const html = '<span>999,999 BP</span><em id="mine">1,111,000</em>';
    const result = parseOfficialPrice(html, 1, 1, {
      customPattern: 'id="mine">([\\d,]+)',
    });
    expect(result.price).toBe(1_111_000);
    expect(result.strategy).toBe('custom');
  });

  it('한국식 축약도 읽는다', () => {
    const result = parseOfficialPrice('<b>가격 12만 3,456</b>', 1, 1, {
      customPattern: '가격\\s*([\\d,만억\\s]+)',
    });
    expect(result.price).toBe(123_456);
  });

  it('안 맞으면 내장 전략으로 넘어간다', () => {
    const result = parseOfficialPrice('<span>500,000 BP</span>', 1, 1, {
      customPattern: '없는패턴([\\d,]+)',
    });
    expect(result.price).toBe(500_000);
    expect(result.strategy).toBe('bp-label');
  });

  it('잘못된 정규식이 전체를 죽이지 않는다', () => {
    // 패턴 하나 때문에 조회가 통째로 실패하면 안 된다.
    const result = parseOfficialPrice('<span>500,000 BP</span>', 1, 1, {
      customPattern: '([unclosed',
    });
    expect(result.price).toBe(500_000);
  });

  it('패턴이 없으면 평소대로 동작한다', () => {
    expect(parseOfficialPrice('<span>500,000 BP</span>', 1, 1, {}).strategy).toBe('bp-label');
  });
});

describe('표 안의 기준가', () => {
  it('셀이 나란히 있는 표를 읽는다', () => {
    const html = '<tr><td>기준가</td><td>2,500,000</td></tr>';
    const result = parseOfficialPrice(html, 1);
    expect(result.price).toBe(2_500_000);
    expect(result.strategy).toBe('table-row');
  });

  it('시세·거래가 같은 표기도 잡는다', () => {
    expect(parseOfficialPrice('<tr><td>시세</td><td>880,000</td></tr>', 1).price).toBe(880_000);
  });
});

describe('fetchOfficialPrice', () => {
  const html = (body: string) =>
    ({ ok: true, status: 200, text: async () => body }) as Response;

  it('받아온 HTML 을 파싱한다', async () => {
    const result = await fetchOfficialPrice(1, 1, {
      fetchImpl: async () => html('<span class="price">2,000,000 BP</span>'),
    });
    expect(result.price).toBe(2_000_000);
  });

  it('요청한 URL 에 spid 와 등급이 들어간다', async () => {
    let seen = '';
    await fetchOfficialPrice(300235494, 7, {
      fetchImpl: async (url) => {
        seen = String(url);
        return html('');
      },
    });
    expect(seen).toContain('spid=300235494');
    expect(seen).toContain('n1Strong=7');
  });

  it('HTTP 오류는 throw 하지 않고 null 을 준다', async () => {
    const result = await fetchOfficialPrice(1, 1, {
      fetchImpl: async () => ({ ok: false, status: 503, text: async () => '' }) as Response,
    });
    expect(result.price).toBeNull();
    expect(result.strategy).toBe('none');
  });

  it('네트워크 실패도 throw 하지 않는다', async () => {
    // 기준가는 체결가를 보조하는 참고치다. 못 가져왔다고 화면이 비면 안 된다.
    const result = await fetchOfficialPrice(1, 1, {
      fetchImpl: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    expect(result.price).toBeNull();
  });

  it('집계 주기 안에서는 같은 카드를 다시 부르지 않는다', async () => {
    let calls = 0;
    const options = {
      now: () => 0,
      fetchImpl: async () => {
        calls += 1;
        return html('<span class="price">1,000,000 BP</span>');
      },
    };

    await fetchOfficialPrice(7, 1, options);
    await fetchOfficialPrice(7, 1, options);
    expect(calls).toBe(1);
  });

  it('기본 간격이 실제로 걸린다 — 두 번째 요청은 바로 나가지 않는다', async () => {
    resetDatacenterState(); // 기본값(POLITE_GAP_MS)으로 다시 세운다
    const started = Date.now();
    const fetchImpl = async () => html('<span class="price">1,000,000 BP</span>');

    await fetchOfficialPrice(21, 1, { fetchImpl, now: () => 0 });
    await fetchOfficialPrice(22, 1, { fetchImpl, now: () => 0 });

    expect(Date.now() - started).toBeGreaterThanOrEqual(POLITE_GAP_MS - 50);
  });

  it('강등급이 다르면 다른 값이라 따로 부른다', async () => {
    let calls = 0;
    const options = {
      now: () => 0,
      fetchImpl: async () => {
        calls += 1;
        return html('<span class="price">1,000,000 BP</span>');
      },
    };

    await fetchOfficialPrice(7, 1, options);
    await fetchOfficialPrice(7, 5, options);
    expect(calls).toBe(2);
  });

  it('수명이 지나면 다시 부른다', async () => {
    let clock = 0;
    let calls = 0;
    const options = {
      now: () => clock,
      fetchImpl: async () => {
        calls += 1;
        return html('<span class="price">1,000,000 BP</span>');
      },
    };

    await fetchOfficialPrice(9, 1, options);
    clock = OFFICIAL_TTL_MS + 1;
    await fetchOfficialPrice(9, 1, options);
    expect(calls).toBe(2);
  });

  it('실패는 기억하지 않는다 — 잠깐 흔들렸다고 30분을 굳히면 안 된다', async () => {
    let calls = 0;
    const options = {
      now: () => 0,
      fetchImpl: async () => {
        calls += 1;
        return calls === 1
          ? ({ ok: false, status: 503, text: async () => '' } as Response)
          : html('<span class="price">1,000,000 BP</span>');
      },
    };

    expect((await fetchOfficialPrice(11, 1, options)).price).toBeNull();
    expect((await fetchOfficialPrice(11, 1, options)).price).toBe(1_000_000);
  });
});

describe('createGate — 나가는 요청 사이의 간격', () => {
  /** 시계와 대기를 가짜로 물려 실제로 기다리지 않고 간격만 관찰한다. */
  function fakeGate(gapMs = 1_000) {
    let clock = 0;
    const slept: number[] = [];
    const gate = createGate(
      gapMs,
      () => clock,
      async (ms) => {
        slept.push(ms);
        clock += ms;
      },
    );
    return { gate, slept };
  }

  it('첫 요청은 기다리지 않는다', async () => {
    const { gate, slept } = fakeGate();
    await gate(async () => 'ok');
    expect(slept).toEqual([]);
  });

  it('이어지는 요청은 간격만큼 벌어진다', async () => {
    const { gate, slept } = fakeGate();
    await Promise.all([gate(async () => 1), gate(async () => 2), gate(async () => 3)]);
    expect(slept).toEqual([1_000, 1_000]);
  });

  it('들어온 순서를 지킨다', async () => {
    const { gate } = fakeGate();
    const order: number[] = [];
    await Promise.all([1, 2, 3].map((n) => gate(async () => void order.push(n))));
    expect(order).toEqual([1, 2, 3]);
  });

  it('한 건이 실패해도 뒤의 요청이 막히지 않는다', async () => {
    const { gate } = fakeGate();
    const failing = gate(async () => {
      throw new Error('boom');
    });
    const following = gate(async () => 'ok');

    await expect(failing).rejects.toThrow('boom');
    await expect(following).resolves.toBe('ok');
  });
});

describe('comparePrice', () => {
  it('체결가가 기준가보다 높으면 above', () => {
    const c = comparePrice(1, 120, 100);
    expect(c.verdict).toBe('above');
    expect(c.gap).toBe(20);
    expect(c.gapPercent).toBeCloseTo(20);
  });

  it('낮으면 below', () => {
    expect(comparePrice(1, 80, 100).verdict).toBe('below');
  });

  it('오차 범위 안이면 near 로 본다', () => {
    expect(comparePrice(1, 100, 100).verdict).toBe('near');
    expect(comparePrice(1, 100 + GAP_EPSILON_PERCENT - 1, 100).verdict).toBe('near');
  });

  it('기준가가 없으면 unknown — 0으로 나누지 않는다', () => {
    const c = comparePrice(1, 100, null);
    expect(c.verdict).toBe('unknown');
    expect(c.gapPercent).toBeNull();
  });

  it('기준가가 0이어도 unknown', () => {
    expect(comparePrice(1, 100, 0).verdict).toBe('unknown');
    expect(Number.isFinite(comparePrice(1, 100, 0).gapPercent ?? 0)).toBe(true);
  });
});
