import { describe, expect, it } from 'vitest';

import {
  comparePrice,
  fetchOfficialPrice,
  GAP_EPSILON_PERCENT,
  parseBP,
  parseOfficialPrice,
  playerInfoUrl,
} from '@/lib/market/datacenter';

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
    const result = parseOfficialPrice(`<td>기준가</td><td>1,500,000 BP</td>`, 1);
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
