import 'server-only';

/**
 * ── 기준가 갱신 관측 ──────────────────────────────────────
 *
 * 한때 이 프로젝트에는 nextRefreshAt() 이 있었다. "2시간 주기가 UTC 정각에
 * 떨어진다"고 **가정하고** 다음 갱신 시각을 찍었는데, 넥슨은 그런 걸 공개한
 * 적이 없다. 근거 없는 시각이라 지웠다(data/freshness.ts 주석 참고).
 *
 * 그렇다고 갱신 시각이 알 수 없는 값인 건 아니다. **재면 된다.**
 * 데이터센터 기준가를 읽을 때마다 값을 적어 두고, 값이 달라진 순간을
 * 기록한다. 그러면 추측이 아니라 관측이 쌓인다:
 *
 *   "이 카드 기준가가 바뀐 걸 3번 봤고, 간격은 2시간 6분이었다"
 *
 * 이건 우리가 실제로 본 것이라 말할 수 있다.
 *
 * ── 우리 관측은 촘촘하지 않다. 그래서 구간으로 말한다 ──
 *
 * 기준가는 사용자가 카드를 눌렀을 때만 읽는다(남의 서버에 대한 예의).
 * 즉 10시에 보고 18시에 다시 봤는데 값이 달라져 있다면, 실제 갱신은
 * 그 8시간 어딘가지 18시가 아니다. 18시는 **우리가 알아챈 시각**일 뿐이다.
 *
 * 그래서 변경 한 건마다 직전 확인 시각을 같이 들고 있는다. 두 시각 사이가
 * 곧 "실제 갱신이 있었을 구간"이고, 그 폭이 우리 관측의 정밀도다. 폭이
 * 넓으면 예측도 그만큼 흐릿하다고 화면에 적는다.
 *
 * ── 저장소 ──
 * 관측 풀과 같이 프로세스 메모리다. 서버리스에서 인스턴스가 재활용되면
 * 비워지고, 그때는 관측이 0건인 상태로 돌아간다 — 그 사실도 화면에 적는다.
 */

/** 카드 하나가 들고 있을 변경 기록 수 상한 */
const MAX_CHANGES = 20;

/** 추적할 카드 수 상한. 넘으면 가장 오래 안 본 것부터 버린다. */
const MAX_TRACKED = 500;

export interface BaselineChange {
  /** 값이 달라진 것을 **우리가 확인한** 시각 */
  noticedAt: Date;
  /**
   * 그 직전에 확인했던 시각. 실제 갱신은 이 시각과 noticedAt 사이 어딘가다.
   * 둘의 간격이 곧 이 관측의 정밀도.
   */
  afterCheckAt: Date;
  from: number;
  to: number;
}

export interface RefreshHistory {
  spid: number;
  grade: number;
  /** 마지막으로 읽은 기준가 */
  current: number | null;
  /** 마지막으로 확인한 시각 */
  lastCheckedAt: Date | null;
  /** 값이 바뀐 것을 확인한 기록 (오래된 것 → 최신) */
  changes: BaselineChange[];
  /** 확인한 총 횟수 — 관측이 얼마나 촘촘한지 가늠하게 한다 */
  checks: number;
}

interface Entry extends RefreshHistory {
  touchedAt: number;
}

const GLOBAL_KEY = '__fcBaselineRefresh__';

function store(): Map<string, Entry> {
  const g = globalThis as typeof globalThis & { [GLOBAL_KEY]?: Map<string, Entry> };
  g[GLOBAL_KEY] ??= new Map();
  return g[GLOBAL_KEY];
}

const keyOf = (spid: number, grade: number) => `${spid}:${grade}`;

/**
 * 기준가를 한 번 읽었다는 사실을 기록한다.
 *
 * price 가 null 이면(파싱 실패·차단) 확인 자체가 안 된 것이라 아무것도
 * 남기지 않는다. 실패를 '변경 없음'으로 세면 간격이 늘어나 보인다.
 */
export function recordBaseline(
  spid: number,
  grade: number,
  price: number | null,
  now = new Date(),
): RefreshHistory {
  const map = store();
  const key = keyOf(spid, grade);

  const entry: Entry = map.get(key) ?? {
    spid,
    grade,
    current: null,
    lastCheckedAt: null,
    changes: [],
    checks: 0,
    touchedAt: 0,
  };

  if (price === null) {
    entry.touchedAt = now.getTime();
    map.set(key, entry);
    return snapshot(entry);
  }

  // 값이 달라졌다면, 실제 갱신은 '직전 확인 ~ 지금' 사이에 있었다.
  if (entry.current !== null && entry.current !== price && entry.lastCheckedAt) {
    entry.changes.push({
      noticedAt: now,
      afterCheckAt: entry.lastCheckedAt,
      from: entry.current,
      to: price,
    });
    if (entry.changes.length > MAX_CHANGES) entry.changes.shift();
  }

  entry.current = price;
  entry.lastCheckedAt = now;
  entry.checks += 1;
  entry.touchedAt = now.getTime();
  map.set(key, entry);

  evict(map);
  return snapshot(entry);
}

/** 가장 오래 안 본 카드부터 버린다. */
function evict(map: Map<string, Entry>): void {
  if (map.size <= MAX_TRACKED) return;
  const ordered = [...map.entries()].sort((a, b) => a[1].touchedAt - b[1].touchedAt);
  for (const [key] of ordered.slice(0, map.size - MAX_TRACKED)) map.delete(key);
}

function snapshot(entry: Entry): RefreshHistory {
  return {
    spid: entry.spid,
    grade: entry.grade,
    current: entry.current,
    lastCheckedAt: entry.lastCheckedAt,
    changes: [...entry.changes],
    checks: entry.checks,
  };
}

export function historyOf(spid: number, grade: number): RefreshHistory | null {
  const entry = store().get(keyOf(spid, grade));
  return entry ? snapshot(entry) : null;
}

/** 테스트·수동 초기화용 */
export function resetRefreshHistory(): void {
  const g = globalThis as typeof globalThis & { [GLOBAL_KEY]?: Map<string, Entry> };
  delete g[GLOBAL_KEY];
}

/* ── 관측에서 주기를 뽑는다 ──────────────────────────────── */

/**
 * 관측이 얼마나 믿을 만한지.
 *
 *  none — 변경을 한 번도 못 봤거나 한 번만 봤다. 간격 자체가 없으므로
 *         아무 말도 하지 않는다. (변경 1회 = 간격 0개다)
 *  weak — 간격 표본이 적거나, 들쭉날쭉하거나, 관측 구간이 넓다.
 *         "대략 이 정도" 이상은 말하지 않는다.
 *  fair — 간격을 여러 번 봤고 서로 비슷하며 구간도 좁다.
 *
 * 여기서 제일 센 등급이 'fair' 인 것은 일부러다. 우리 관측은 사용자가
 * 카드를 누를 때만 일어나서 촘촘할 수가 없고, 넥슨이 주기를 바꾸면 알 길도
 * 없다. 'certain' 같은 걸 만들어 두면 언젠가 그 이름으로 거짓말을 하게 된다.
 */
export type RefreshConfidence = 'none' | 'weak' | 'fair';

export interface RefreshEstimate {
  /** 관측한 간격의 중앙값(ms). 간격 표본이 없으면 null */
  intervalMs: number | null;
  /** 간격 표본 수 = 관측한 변경 횟수 - 1 */
  intervalSamples: number;
  /**
   * 관측 구간 폭의 중앙값(ms). '직전 확인 ~ 알아챈 시각' 사이 —
   * 이 값이 곧 우리 관측의 정밀도이고, 넓을수록 예측이 흐려진다.
   */
  windowMs: number | null;
  confidence: RefreshConfidence;
  /** 마지막으로 갱신을 확인한 시각 */
  lastChangeAt: Date | null;
  /**
   * 다음 갱신 예상. confidence 가 'none' 이면 null —
   * 근거가 없으면 시각을 찍지 않는다는 원칙은 그대로다.
   */
  nextAt: Date | null;
  /** 예상 시각이 이미 지났다 (곧 바뀔 때가 됐다는 뜻) */
  overdue: boolean;
}

/** 간격이 서로 이 비율 넘게 벌어지면 '들쭉날쭉'으로 본다 */
const SPREAD_LIMIT = 0.5;

/**
 * 관측 구간이 주기의 이 비율을 넘으면 정밀도가 부족하다고 본다.
 *
 * 절반으로 잡은 이유: 구간이 주기의 절반 이하라면 "주기 안 어디쯤에서
 * 바뀌는지"를 반 이상 좁힌 것이라 예측에 쓸 값이 된다. 절반을 넘으면
 * 사실상 주기 전체가 후보라 시각을 말할 근거가 못 된다.
 *
 * 더 좁게(0.25) 잡아 봤더니 도달할 수 없는 기준이 됐다 — 2시간마다 바뀌는
 * 카드를 매시간 확인해도 구간은 1시간이라 통과하지 못한다. 우리 확인은
 * 사용자가 버튼을 누를 때만 일어나 그보다 촘촘해질 수 없고, 아무리 잘
 * 관측해도 늘 '대략'만 뜨면 그 표시는 정보가 아니라 장식이 된다.
 */
const WINDOW_LIMIT = 0.5;

/** 'fair' 를 주기 위해 필요한 최소 간격 표본 */
const FAIR_SAMPLES = 3;

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function estimateRefresh(
  history: RefreshHistory | null,
  now = new Date(),
): RefreshEstimate {
  const empty: RefreshEstimate = {
    intervalMs: null,
    intervalSamples: 0,
    windowMs: null,
    confidence: 'none',
    lastChangeAt: null,
    nextAt: null,
    overdue: false,
  };
  if (!history || history.changes.length === 0) return empty;

  const changes = history.changes;
  const lastChangeAt = changes[changes.length - 1].noticedAt;

  // 변경을 한 번만 봤으면 간격이 없다. 마지막 갱신 시각만 사실로 남긴다.
  if (changes.length < 2) return { ...empty, lastChangeAt };

  const gaps: number[] = [];
  for (let i = 1; i < changes.length; i += 1) {
    gaps.push(changes[i].noticedAt.getTime() - changes[i - 1].noticedAt.getTime());
  }
  const intervalMs = medianOf(gaps);
  const windowMs = medianOf(
    changes.map((c) => c.noticedAt.getTime() - c.afterCheckAt.getTime()),
  );

  if (intervalMs <= 0) return { ...empty, lastChangeAt, intervalSamples: gaps.length };

  const spread = (Math.max(...gaps) - Math.min(...gaps)) / intervalMs;
  const confidence: RefreshConfidence =
    gaps.length >= FAIR_SAMPLES && spread < SPREAD_LIMIT && windowMs <= intervalMs * WINDOW_LIMIT
      ? 'fair'
      : 'weak';

  const nextAt = new Date(lastChangeAt.getTime() + intervalMs);

  return {
    intervalMs,
    intervalSamples: gaps.length,
    windowMs,
    confidence,
    lastChangeAt,
    nextAt,
    overdue: nextAt.getTime() <= now.getTime(),
  };
}

/* ── 체결 간격: 데이터센터 없이도 답할 수 있는 쪽 ──────────── */

/**
 * ── 왜 이게 따로 있나 ──
 *
 * 위쪽 기준가 관측은 넥슨 **데이터센터 페이지**를 읽어야 굴러간다. 그런데 그
 * 페이지는 개발 환경의 이그레스 정책에 막혀 있고(CONNECT 403), 배포 환경에서
 * 파서가 실제 구조에 맞을지도 아직 확인되지 않았다. 즉 그 경로 하나에만
 * 기대면, 화면은 영영 "관측 없음" 만 띄울 수 있다.
 *
 * 그래서 같은 질문에 **막히지 않는 재료로** 답한다. `/user/trade` 가 주는
 * 체결 기록에는 `tradeDate` 가 붙어 있다 — 우리가 알아챈 시각이 아니라
 * **넥슨이 적어 준 실제 체결 시각**이다. 기준가 관측과 달리 '구간' 이 없다.
 *
 * 다만 표본은 여전히 일부다. 조회된 구단주가 사고판 것만 보이므로, 우리가
 * 재는 간격은 실제 거래 빈도보다 **길게** 나온다(중간 거래를 못 봤을 뿐이다).
 * 그래서 이 값은 상한으로 읽어야 하고, 화면에도 그렇게 적는다.
 *
 * ── 다음 체결 시각은 찍지 않는다 ──
 * 기준가 갱신은 주기가 있는 집계지만, 체결은 사람이 사고파는 사건이라
 * 주기가 아니다. 평균 4시간마다 팔렸다고 다음이 4시간 뒤인 건 아니다.
 * 빈도까지만 말하고 시각은 말하지 않는다 — nextRefreshAt 을 지운 것과 같은 선이다.
 */
export interface TradeCadence {
  /** 표본에서 가장 최근 체결 시각 (넥슨이 적어 준 값) */
  lastTradeAt: Date | null;
  /** 이 카드에서 본 체결 건수 */
  samples: number;
  /**
   * 체결 사이 간격의 중앙값(ms). 표본이 2건 미만이면 null.
   * 우리가 못 본 거래가 있으므로 **실제 빈도의 상한**이다.
   */
  intervalMs: number | null;
  /** 표본이 걸쳐 있는 기간(ms) */
  spanMs: number | null;
}

/**
 * 체결 시각만으로 거래 빈도를 낸다.
 *
 * 문자열 그대로 받는 이유: 넥슨은 타임존 없는 "2026-09-01T12:00:00" 를 주고,
 * 그건 UTC 다. 파싱 규칙을 한 곳(data/freshness parseApiDate)에 두려고
 * 호출부에서 Date 로 바꿔 넘긴다.
 */
export function tradeCadence(tradeTimes: readonly Date[]): TradeCadence {
  const times = tradeTimes
    .map((d) => d.getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);

  if (times.length === 0) {
    return { lastTradeAt: null, samples: 0, intervalMs: null, spanMs: null };
  }

  const lastTradeAt = new Date(times[times.length - 1]);
  const spanMs = times[times.length - 1] - times[0];

  if (times.length < 2) {
    return { lastTradeAt, samples: times.length, intervalMs: null, spanMs: null };
  }

  const gaps: number[] = [];
  for (let i = 1; i < times.length; i += 1) gaps.push(times[i] - times[i - 1]);

  return {
    lastTradeAt,
    samples: times.length,
    // 중앙값을 쓰는 이유: 한 달 비어 있다가 몰아서 거래된 카드에서
    // 평균은 그 공백 하나에 통째로 끌려간다.
    intervalMs: medianOf(gaps),
    spanMs,
  };
}
