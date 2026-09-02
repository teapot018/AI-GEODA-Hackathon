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
 * 된다는 뜻은 아니다. 남의 서버다. 아래 게이트가 이 간격을 강제한다.
 */
export const POLITE_GAP_MS = 1_000;

/**
 * 기준가를 기억해 두는 시간. 넥슨 집계 주기가 2시간이라 그 안에서는
 * 같은 답이 온다 — 라우트의 응답 캐시와 같은 값을 쓰도록 여기서 정한다.
 */
export const OFFICIAL_TTL_MS = 30 * 60_000;

/**
 * ── 나가는 요청 사이의 간격을 강제하는 게이트 ──
 *
 * 상수만 선언해 두고 아무도 기다리지 않으면 그건 예의가 아니라 주석이다.
 * 카드 행을 빠르게 펼치면 그만큼의 요청이 그대로 넥슨 서버로 나간다.
 *
 * 요청을 한 줄로 세우고, 앞 요청이 **시작한 시각**으로부터 gapMs 가
 * 지나야 다음이 출발한다. 앞 요청의 성패는 줄에 영향을 주지 않는다.
 */
export function createGate(
  gapMs: number,
  now: () => number = Date.now,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
) {
  let chain = Promise.resolve();
  let lastStartedAt = Number.NEGATIVE_INFINITY;

  return function pass<T>(task: () => Promise<T>): Promise<T> {
    const turn = chain.then(async () => {
      const wait = lastStartedAt + gapMs - now();
      if (wait > 0) await sleep(wait);
      lastStartedAt = now();
    });
    // 대기 줄만 이어 붙인다. task 의 실패가 뒤 요청을 막아서는 안 된다.
    chain = turn.then(
      () => undefined,
      () => undefined,
    );
    return turn.then(task);
  };
}

interface DatacenterState {
  pass: <T>(task: () => Promise<T>) => Promise<T>;
  cache: Map<string, { at: number; value: OfficialPrice }>;
}

/** 개발 서버의 HMR 이 모듈을 다시 평가해도 게이트가 초기화되지 않도록. */
const GLOBAL_KEY = '__fcDatacenter__';

function shared(): DatacenterState {
  const store = globalThis as typeof globalThis & { [GLOBAL_KEY]?: DatacenterState };
  store[GLOBAL_KEY] ??= { pass: createGate(POLITE_GAP_MS), cache: new Map() };
  return store[GLOBAL_KEY];
}

export function playerInfoUrl(spid: number, grade = 1): string {
  const url = new URL(DATACENTER_PLAYER_URL);
  url.searchParams.set('spid', String(spid));
  url.searchParams.set('n1Strong', String(grade));
  return url.toString();
}

export type ParseStrategy =
  | 'custom'
  | 'embedded-json'
  | 'data-attribute'
  | 'price-class'
  | 'table-row'
  | 'bp-label'
  | 'none';

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

/** 4) 표 안에 "기준가 | 1,234,567" 처럼 들어 있는 경우 */
function fromTableRow(html: string): number | null {
  const match =
    /(?:기준가|시세|거래가|평균가)[^<]*<\/t[dh]>\s*<t[dh][^>]*>([^<]{1,40})</i.exec(html) ??
    /<t[dh][^>]*>\s*(?:기준가|시세|거래가|평균가)\s*<\/t[dh]>[\s\S]{0,80}?>([\d,]{4,})</i.exec(html);
  return match ? parseBP(match[1]) : null;
}

/** 5) 최후 수단 — "BP" 글자 주변의 숫자 */
function fromBpLabel(html: string): number | null {
  const text = html.replace(/<[^>]+>/g, ' ');
  const match = /(\d[\d,]{2,})\s*BP/i.exec(text) ?? /BP\s*(\d[\d,]{2,})/i.exec(text);
  return match ? parseBP(match[1]) : null;
}

const STRATEGIES: Array<[ParseStrategy, (html: string) => number | null]> = [
  ['embedded-json', fromEmbeddedJson],
  ['data-attribute', fromDataAttribute],
  ['price-class', fromPriceClass],
  ['table-row', fromTableRow],
  ['bp-label', fromBpLabel],
];

/**
 * 직접 지정한 패턴. 내장 전략보다 **먼저** 시도한다.
 *
 * 이 탈출구가 있는 이유: 이 파서는 실제 페이지를 보지 못한 채 작성됐고,
 * 넥슨이 구조를 바꾸면 또 어긋난다. 그때마다 코드를 고치고 배포하길
 * 기다리는 대신, probe 로 구조를 확인한 사람이 환경 변수 한 줄로 바로
 * 맞출 수 있어야 한다.
 *
 * 첫 번째 캡처 그룹이 가격이어야 한다. 잘못된 정규식은 조용히 무시된다 —
 * 패턴 하나 때문에 전체 조회가 죽으면 안 되기 때문이다.
 */
function fromCustomPattern(html: string, pattern: string | undefined): number | null {
  if (!pattern) return null;
  try {
    const match = new RegExp(pattern, 'i').exec(html);
    if (!match?.[1]) return null;
    const value = parseBP(match[1]);
    return value !== null && value > 0 ? value : null;
  } catch {
    return null;
  }
}

/**
 * 페이지 HTML 에서 기준가를 뽑는다.
 * 실패해도 throw 하지 않는다 — 한 카드를 못 읽었다고 전체 조회가
 * 무너지면 안 되고, strategy: 'none' 이 곧 진단 정보가 된다.
 */
export function parseOfficialPrice(
  html: string,
  spid: number,
  grade = 1,
  options: { customPattern?: string } = {},
): OfficialPrice {
  const custom = fromCustomPattern(html, options.customPattern);
  if (custom !== null) return { spid, grade, price: custom, strategy: 'custom' };

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
  /** 내장 전략보다 먼저 시도할 정규식 (첫 캡처 그룹이 가격) */
  customPattern?: string;
  /** 캐시 수명을 테스트에서 고정하기 위한 시계 */
  now?: () => number;
}

/**
 * 공개 페이지를 받아 기준가를 읽는다.
 *
 * 네트워크 실패는 throw 하지 않고 price: null 로 돌려준다. 이 값은
 * 어디까지나 체결가를 보조하는 참고치라, 못 가져왔다고 화면이
 * 비어서는 안 된다.
 *
 * 나가는 요청은 게이트를 통과해야 하고(POLITE_GAP_MS 간격), 한 번 읽은
 * 값은 집계 주기 안에서 재사용한다. 실패는 캐시하지 않는다 — 넥슨이
 * 잠깐 흔들렸다고 30분 동안 못 읽는 상태로 굳으면 안 된다.
 */
export async function fetchOfficialPrice(
  spid: number,
  grade = 1,
  { timeoutMs = 8000, fetchImpl = fetch, customPattern, now = Date.now }: FetchOptions = {},
): Promise<OfficialPrice> {
  const { pass, cache } = shared();
  const key = `${spid}:${grade}:${customPattern ?? ''}`;

  const hit = cache.get(key);
  if (hit && now() - hit.at < OFFICIAL_TTL_MS) return hit.value;

  return pass(async () => {
    // 줄을 서 있는 동안 다른 요청이 같은 카드를 채워 넣었을 수 있다.
    const fresh = cache.get(key);
    if (fresh && now() - fresh.at < OFFICIAL_TTL_MS) return fresh.value;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetchImpl(playerInfoUrl(spid, grade), {
        signal: controller.signal,
        headers: { accept: 'text/html,application/xhtml+xml' },
      });
      if (!res.ok) return { spid, grade, price: null, strategy: 'none' as const };

      const parsed = parseOfficialPrice(await res.text(), spid, grade, { customPattern });
      if (parsed.price !== null) cache.set(key, { at: now(), value: parsed });
      return parsed;
    } catch {
      return { spid, grade, price: null, strategy: 'none' as const };
    } finally {
      clearTimeout(timer);
    }
  });
}

/**
 * 테스트·수동 초기화용. 게이트와 기억해 둔 기준가를 모두 비운다.
 * gapMs 를 주면 그 간격의 게이트로 다시 세운다 — 캐시를 검증하는
 * 테스트까지 매번 1초씩 실제로 기다릴 이유는 없다.
 */
export function resetDatacenterState(gapMs = POLITE_GAP_MS): void {
  const store = globalThis as typeof globalThis & { [GLOBAL_KEY]?: DatacenterState };
  store[GLOBAL_KEY] = { pass: createGate(gapMs), cache: new Map() };
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
