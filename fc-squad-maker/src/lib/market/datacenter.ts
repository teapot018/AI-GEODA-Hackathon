/**
 * ── 넥슨 데이터센터 기준가 어댑터 ─────────────────────────
 *
 * 여기서 가져오는 값은 Open API 가 주는 **체결가**와 성격이 다르다.
 *
 *   체결가(/user/trade) — 실제로 거래가 성사된 가격. 표본이 조회한
 *                         계정에 묶여 있어 카드 커버리지가 좁다.
 *   기준가(데이터센터)   — 넥슨이 2시간 주기로 집계해 공시하는 값.
 *                         전 카드를 덮지만 집계값이라 체감과 어긋날 수 있다.
 *
 * 둘은 서로를 대체하지 않는다. 어긋나는 폭 자체가 정보라서, 화면에서도
 * 한 칸에 섞지 않고 나란히 보여 준다.
 *
 * ── 무엇을 긁고 무엇을 안 긁나 ──
 * 로그인 없이 열리는 **공개 페이지**만 읽는다. 실시간 호가가 있는
 * 이적시장은 로그인 세션 안에 있고, 그건 계정 정지 사유라 건드리지 않는다.
 * FC VALUE 가 "NEXON Open API 와 NEXON FC ONLINE 홈페이지" 라고 밝힌
 * 범위와 같다.
 *
 * ── 이 파일의 정직한 한계 ──
 * 개발 환경에서 넥슨 도메인이 막혀 있어 **실제 응답을 한 번도 보지 못한
 * 채로 작성했다.** 그래서 파서를 하나로 확정하지 않고 여러 전략을 순서대로
 * 시도하며, 어떤 전략이 걸렸는지(strategy)를 결과에 담는다. 구조가 달라
 * 실패해도 "왜 실패했는지"가 남아야 고칠 수 있기 때문이다.
 *
 * 실제 구조는 `npm run probe:datacenter` 로 확인한다.
 */

/** 공개 데이터센터 선수 정보 페이지. spid 와 강화등급을 쿼리로 받는다. */
export const DATACENTER_PLAYER_URL = 'https://fconline.nexon.com/DataCenter/PlayerInfo';

/** 일 단위 이적시장 시세 페이지. */
export const DATACENTER_DAILY_TRADE_URL = 'https://fconline.nexon.com/datacenter/dailytrade';

/**
 * 공개 페이지를 읽는 것이라 API 키는 없지만, 그렇다고 마음껏 두드려도
 * 된다는 뜻은 아니다. 남의 서버다.
 */
export const POLITE_GAP_MS = 1_000;

export function playerInfoUrl(spid: number, grade = 1): string {
  const url = new URL(DATACENTER_PLAYER_URL);
  url.searchParams.set('spid', String(spid));
  url.searchParams.set('n1Strong', String(grade));
  return url.toString();
}

export type ParseStrategy = 'embedded-json' | 'data-attribute' | 'price-class' | 'bp-label' | 'none';

export interface OfficialPrice {
  spid: number;
  grade: number;
  /** BP. 못 찾으면 null */
  price: number | null;
  /** 어떤 방법으로 읽어냈는지 — 구조가 바뀌었을 때 추적용 */
  strategy: ParseStrategy;
}

/** "1,234,567 BP" / "123만" 같은 표기를 숫자로. */
export function parseBP(text: string): number | null {
  const cleaned = text.replace(/\s/g, '');

  // 한국식 축약(1억 2,345만)이 먼저다. 숫자만 긁으면 1 로 읽힌다.
  const eok = /(\d[\d,]*)억/.exec(cleaned);
  const man = /(\d[\d,]*)만/.exec(cleaned);
  if (eok || man) {
    const toNum = (m: RegExpExecArray | null) => (m ? Number(m[1].replace(/,/g, '')) : 0);
    const rest = /만\s*(\d[\d,]*)/.exec(cleaned);
    return (
      toNum(eok) * 100_000_000 +
      toNum(man) * 10_000 +
      (rest ? Number(rest[1].replace(/,/g, '')) : 0)
    );
  }

  const plain = /(\d[\d,]{2,})/.exec(cleaned);
  if (!plain) return null;
  const value = Number(plain[1].replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
}

/* ── 파싱 전략 ──────────────────────────────────────────────
 * 위에서부터 시도하고 처음 성공한 것을 쓴다. 정확한 것부터 둔다.
 */

/** 1) 페이지에 심어 둔 JSON (Next/Nuxt 계열이거나 var xxx = {...}) */
function fromEmbeddedJson(html: string): number | null {
  const patterns = [
    /"(?:price|tradePrice|basePrice|value)"\s*:\s*"?(\d[\d,]*)"?/i,
    // 앞에 하이픈이나 글자가 붙은 건 제외한다. 안 그러면 data-price="..."
    // 같은 HTML 속성을 JSON 으로 오인해 전략 판정이 뒤집힌다.
    /(?<![-\w])(?:price|tradePrice|basePrice)\s*[:=]\s*"?(\d[\d,]*)"?/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match) {
      const value = Number(match[1].replace(/,/g, ''));
      if (Number.isFinite(value) && value > 0) return value;
    }
  }
  return null;
}

/** 2) data-price="123456" 같은 속성 */
function fromDataAttribute(html: string): number | null {
  const match = /data-(?:price|value|bp)\s*=\s*["'](\d[\d,]*)["']/i.exec(html);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** 3) class 이름에 price/bp 가 들어간 요소의 텍스트 */
function fromPriceClass(html: string): number | null {
  const match = /class\s*=\s*["'][^"']*(?:price|bp|value)[^"']*["'][^>]*>([^<]{1,40})</i.exec(html);
  return match ? parseBP(match[1]) : null;
}

/** 4) 최후 수단 — "BP" 글자 주변의 숫자 */
function fromBpLabel(html: string): number | null {
  const text = html.replace(/<[^>]+>/g, ' ');
  const match = /(\d[\d,]{2,})\s*BP/i.exec(text) ?? /BP\s*(\d[\d,]{2,})/i.exec(text);
  return match ? parseBP(match[1]) : null;
}

const STRATEGIES: Array<[ParseStrategy, (html: string) => number | null]> = [
  ['embedded-json', fromEmbeddedJson],
  ['data-attribute', fromDataAttribute],
  ['price-class', fromPriceClass],
  ['bp-label', fromBpLabel],
];

/**
 * 페이지 HTML 에서 기준가를 뽑는다.
 * 실패해도 throw 하지 않는다 — 한 카드를 못 읽었다고 전체 조회가
 * 무너지면 안 되고, strategy: 'none' 이 곧 진단 정보가 된다.
 */
export function parseOfficialPrice(html: string, spid: number, grade = 1): OfficialPrice {
  for (const [strategy, extract] of STRATEGIES) {
    const price = extract(html);
    if (price !== null && price > 0) return { spid, grade, price, strategy };
  }
  return { spid, grade, price: null, strategy: 'none' };
}

export interface FetchOptions {
  timeoutMs?: number;
  /** 테스트·오프라인용 주입구. 없으면 전역 fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * 공개 페이지를 받아 기준가를 읽는다.
 *
 * 네트워크 실패는 throw 하지 않고 price: null 로 돌려준다. 이 값은
 * 어디까지나 체결가를 보조하는 참고치라, 못 가져왔다고 화면이
 * 비어서는 안 된다.
 */
export async function fetchOfficialPrice(
  spid: number,
  grade = 1,
  { timeoutMs = 8000, fetchImpl = fetch }: FetchOptions = {},
): Promise<OfficialPrice> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(playerInfoUrl(spid, grade), {
      signal: controller.signal,
      headers: { accept: 'text/html,application/xhtml+xml' },
    });
    if (!res.ok) return { spid, grade, price: null, strategy: 'none' };
    return parseOfficialPrice(await res.text(), spid, grade);
  } catch {
    return { spid, grade, price: null, strategy: 'none' };
  } finally {
    clearTimeout(timer);
  }
}

/* ── 체결가와의 비교 ──────────────────────────────────────── */

export interface PriceComparison {
  spid: number;
  /** 우리가 관측한 체결가 중앙값 */
  observed: number;
  /** 넥슨 공시 기준가 */
  official: number | null;
  /** observed - official */
  gap: number | null;
  /** 기준가 대비 몇 % 비싼가 */
  gapPercent: number | null;
  /** 체결가가 기준가보다 확실히 높으면 'above' */
  verdict: 'above' | 'below' | 'near' | 'unknown';
}

/** 이 폭 안쪽이면 사실상 같은 값으로 본다. */
export const GAP_EPSILON_PERCENT = 5;

export function comparePrice(
  spid: number,
  observed: number,
  official: number | null,
): PriceComparison {
  if (official === null || official <= 0) {
    return { spid, observed, official, gap: null, gapPercent: null, verdict: 'unknown' };
  }

  const gap = observed - official;
  const gapPercent = (gap / official) * 100;

  return {
    spid,
    observed,
    official,
    gap,
    gapPercent,
    verdict:
      Math.abs(gapPercent) < GAP_EPSILON_PERCENT ? 'near' : gapPercent > 0 ? 'above' : 'below',
  };
}
