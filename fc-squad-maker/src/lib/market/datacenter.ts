/**
 * ── 넥슨 데이터센터 기준가 어댑터 ─────────────────────────
 *
 * 여기서 가져오는 값은 Open API 가 주는 **체결가**와 성격이 다르다.
 *
 *   체결가(/user/trade) — 실제로 거래가 성사된 가격. 표본이 조회한
 *                         계정에 묶여 있어 카드 커버리지가 좁다.
 *   기준가(데이터센터)   — 넥슨이 집계해 공시하는 값. 전 카드를 덮지만
 *                         집계값이라 체감과 어긋날 수 있다. 집계 주기는
 *                         확인하지 못했다(rules.ts DATACENTER_BASELINE_CYCLE).
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

import { CALL_POLICY } from '@/lib/data/policy';

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
 * 기준가를 기억해 두는 시간 — **계층 E, 우리 정책이다.**
 *
 * 예전 주석은 "넥슨 집계 주기가 2시간이라 그 안에서는 같은 답이 온다"
 * 였는데, 두 가지가 어긋나 있었다. 첫째로 그 2시간은 우리가 확인한 넥슨
 * 기준가 주기가 아니라 Open API 쪽 이야기에서 흘러온 숫자다
 * (rules.ts DATACENTER_BASELINE_CYCLE). 둘째로 값 자체가 2시간이 아니라
 * 30분이었다 — 근거와 숫자가 서로 다른 말을 하고 있었다.
 *
 * 실제 근거는 이쪽이다: 주기를 모르니 짧게 잡아, 값이 바뀌었는데도 낡은
 * 답을 오래 들고 있지 않게 한다. 같은 값이 data/policy.ts 에도 있으므로
 * 거기서 가져와 두 곳이 어긋나지 않게 한다.
 */
export const OFFICIAL_TTL_MS = CALL_POLICY.datacenterCacheTtl.value * 60_000;

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

/**
 * 이 파서를 **실제 데이터센터 페이지로 검증했는가.**
 *
 * false 다. 그리고 지금 이 값을 true 로 바꿀 방법이 없다 — 이 개발
 * 환경의 이그레스 정책이 넥슨 도메인을 막아서(CONNECT 403) 실제 HTML 을
 * 한 번도 열어 본 적이 없다. 아래 전략들은 "이런 구조라면 이렇게 잡히겠다"
 * 는 추측으로 쓴 것이고, 단위 테스트도 우리가 만든 가짜 HTML 로만 돈다.
 *
 * 왜 이걸 상수로 두는가: 파서가 숫자를 하나 뱉으면 화면은 그걸 "넥슨
 * 공시 기준가" 라고 적는다. 그런데 검증 안 된 정규식이 잡아 온 숫자는
 * 옆 칸의 다른 값일 수도 있다 — **가격처럼 생긴 아무 숫자**여도 통과한다.
 * 값이 나왔다는 것과 그 값이 맞다는 것은 다른 얘기고, 그 차이를 화면이
 * 말할 수 있어야 한다.
 *
 * true 로 바꾸는 조건: 실제 페이지 HTML 을 받아 (1) 어떤 전략이 걸리는지,
 * (2) 뽑힌 숫자가 페이지에 보이는 기준가와 같은지 확인하고, 그 HTML 을
 * 픽스처로 넣어 테스트를 붙일 것. `npm run probe:datacenter` 가 그 확인을
 * 돕는다.
 */
export const PARSER_VERIFIED = false;

export interface OfficialPrice {
  spid: number;
  grade: number;
  /** BP. 못 찾으면 null */
  price: number | null;
  /** 어떤 방법으로 읽어냈는지 — 구조가 바뀌었을 때 추적용 */
  strategy: ParseStrategy;
  /**
   * 이 값을 뽑은 파서가 실제 페이지로 검증됐는가 (PARSER_VERIFIED).
   *
   * 응답에 실어 보낸다 — 화면이 서버 상수를 알 수 없으니, 값과 같이
   * 따라가야 "검증 안 됨" 을 적을 수 있다.
   */
  parserVerified: boolean;
}

/**
 * 한국식 자릿수 단위. 큰 것부터 — 파서가 이 순서로만 내려간다.
 *
 * 경(10^16)은 넣지 않는다. Number 가 정확히 셀 수 있는 한계가
 * 9,007,199,254,740,991(약 900조)이라, 경 단위 값은 읽어도 정확하지 않다.
 * 정확하지 않은 숫자를 내놓느니 못 읽었다고 하는 편이 낫다.
 */
const BP_SCALE: ReadonlyArray<readonly [string, number]> = [
  ['조', 1_000_000_000_000],
  ['억', 100_000_000],
  ['만', 10_000],
];

/** "1,234" / "1.5" 같은 수 하나와, 뒤에 붙었을 수 있는 단위 한 글자 */
const BP_TOKEN = /(\d[\d,]*(?:\.\d+)?)(조|억|만)?/y;

/**
 * 우리가 다루지 않는 자릿수 글자.
 *
 * 천·백·십은 앞 단위를 **꾸미는** 말이라 따로 더할 수 없다. "3천만" 은
 * 3,000 + 10,000 이 아니라 3,000 × 10,000 = 3천만이고, 제대로 읽으려면
 * 한국어 수사 문법을 다 구현해야 한다. 경(10^16)은 Number 가 정확히
 * 세지 못하는 범위다.
 *
 * 그래서 지원하는 대신 **막는다.** 숫자 덩어리 바로 뒤에 이 글자가
 * 남아 있으면 우리가 못 읽은 표기라는 뜻이므로 null 을 낸다 —
 * "2억 3천만" 을 200,003,000 으로 내놓는 것보다 못 읽었다고 하는 편이
 * 훨씬 낫다.
 */
const BP_UNHANDLED_UNIT = /[천백십경]/;

/**
 * "1,234,567 BP" / "1억 2,345만" / "1.2억" 같은 표기를 숫자로.
 *
 * ── 왜 정규식 몇 개로는 안 되는가 ──
 * 예전 구현은 `/(\d[\d,]*)억/` 처럼 조각을 따로 긁어 더했다. 그러면
 * 소수점 앞자리가 통째로 사라진다:
 *
 *   "0.5억"  -> '5억' 이 걸려  500,000,000   (정답의 10배)
 *   "3.75억" -> '75억' 이 걸려 7,500,000,000 (정답의 20배)
 *   "1.2억"  -> '2억' 이 걸려  200,000,000   (정답의 1.7배)
 *   "1조2,345억" -> 조를 몰라  234,500,000,000 (조가 통째로 증발)
 *
 * 전부 **틀린 값을 자신 있게 내놓는** 실패다. 파싱이 실패해 null 이
 * 나오면 화면은 "기준가를 읽지 못했다"고 적고 끝나지만, 10배 틀린 값은
 * 그대로 기준가로 표시되고 관측 비교에까지 흘러 들어간다. 이 파서가
 * 아직 실물로 검증되지 않았다는 점(PARSER_VERIFIED)을 생각하면 더욱,
 * 애매하면 null 이어야 한다.
 *
 * 그래서 조각을 긁는 대신 **앞에서부터 한 덩어리로 읽는다**. 단위는
 * 조 > 억 > 만 > 천 순으로만 내려갈 수 있고, 그 규칙이 깨지는 순간
 * 거기서 끊는다 — "1억 2,345만" 뒤에 붙은 "수수료 40만" 을 값에
 * 더해 버리지 않기 위해서다.
 */
export function parseBP(text: string): number | null {
  const cleaned = text.replace(/\s/g, '');

  const start = cleaned.search(/\d/);
  if (start < 0) return null;

  let total = 0;
  let cursor = start;
  /** 마지막으로 본 단위의 자리(내림차순이어야 한다). 단위 없는 끝수는 0. */
  let lastScale = Number.POSITIVE_INFINITY;
  let tokens = 0;
  let sawUnit = false;

  BP_TOKEN.lastIndex = cursor;
  for (let match = BP_TOKEN.exec(cleaned); match; match = BP_TOKEN.exec(cleaned)) {
    const digits = Number(match[1].replace(/,/g, ''));
    if (!Number.isFinite(digits)) return null;

    const unit = match[2];
    const scale = unit ? (BP_SCALE.find(([name]) => name === unit)?.[1] ?? 1) : 1;

    // 자리가 커지거나 같아지면 다른 수가 시작된 것이다. 여기서 끊는다.
    if (scale >= lastScale) break;

    total += digits * scale;
    lastScale = scale;
    cursor = BP_TOKEN.lastIndex;
    tokens += 1;
    if (unit) sawUnit = true;

    // 단위가 없었다면 그게 끝수라 더 읽을 것이 없다.
    if (!unit) break;
    BP_TOKEN.lastIndex = cursor;
    // 다음 글자가 숫자가 아니면 덩어리가 끝났다.
    if (!/\d/.test(cleaned[cursor] ?? '')) break;
  }

  if (tokens === 0) return null;

  // 덩어리 바로 뒤에 우리가 못 읽는 자릿수 글자가 남았으면 포기한다.
  if (BP_UNHANDLED_UNIT.test(cleaned[cursor] ?? '')) return null;

  /*
   * 단위 없는 짧은 숫자는 값이 아니라 지나가는 수일 때가 많다 —
   * 예전 구현이 3자리 이상만 받던 이유고, 그 선은 유지한다.
   */
  if (!sawUnit && cleaned.slice(start, cursor).replace(/,/g, '').length < 3) return null;

  /*
   * BP 는 정수다. "1.2억" 처럼 소수로 적힌 표기에서만 소수부가 생기는데,
   * 그건 표기의 문제이지 값의 문제가 아니라 정수로 되돌린다.
   */
  const value = Math.round(total);
  if (!Number.isFinite(value) || value < 0) return null;

  /*
   * Number 가 정확히 셀 수 있는 범위를 넘으면 읽지 않는다. 넘긴 값은
   * 이미 반올림된 다른 숫자라, 내보내면 조용히 틀린 값이 된다.
   */
  if (value > Number.MAX_SAFE_INTEGER) return null;

  return value;
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
  if (custom !== null)
    return { spid, grade, price: custom, strategy: 'custom', parserVerified: PARSER_VERIFIED };

  for (const [strategy, extract] of STRATEGIES) {
    const price = extract(html);
    if (price !== null && price > 0)
      return { spid, grade, price, strategy, parserVerified: PARSER_VERIFIED };
  }
  return { spid, grade, price: null, strategy: 'none', parserVerified: PARSER_VERIFIED };
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
      if (!res.ok)
        return { spid, grade, price: null, strategy: 'none' as const, parserVerified: PARSER_VERIFIED };

      const parsed = parseOfficialPrice(await res.text(), spid, grade, { customPattern });
      if (parsed.price !== null) cache.set(key, { at: now(), value: parsed });
      return parsed;
    } catch {
      return { spid, grade, price: null, strategy: 'none' as const, parserVerified: PARSER_VERIFIED };
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
