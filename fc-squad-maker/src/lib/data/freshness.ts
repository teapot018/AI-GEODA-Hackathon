/**
 * ── 데이터 신선도 ──────────────────────────────────────────
 *
 * 이 프로젝트가 보여 주는 값은 대부분 "지금"이 아니다.
 * 시세는 과거 체결가고, 전적은 이미 끝난 경기다. 그런데 화면에 숫자만
 * 띄워 두면 보는 사람은 그걸 현재값으로 읽는다 — 시세 관측소에서
 * "현재 호가가 아니다"라고 못 박아 둔 것과 같은 이유로, 데이터가
 * 언제 것인지도 같이 보여 줘야 한다.
 *
 * 넥슨 데이터센터의 기준가는 2시간 주기로 집계된다. 우리가 쓰는
 * /user/trade 는 그 집계값이 아니라 체결 기록 원본이라 주기가 따로
 * 없지만, "얼마나 묵은 값인가"를 재는 눈금으로는 이 2시간이 쓸 만하다.
 * 표본의 최신 체결이 2시간 안쪽이면 게임 내 기준가와 대체로 같은
 * 시대를 보고 있는 셈이고, 하루가 넘어가면 다른 이야기다.
 *
 * 모든 함수는 순수 함수다. `now` 를 인자로 받는 이유도 그것 —
 * Date.now() 를 안에서 부르면 테스트에서 시간을 고정할 수 없다.
 */

/** 넥슨 데이터센터 기준가 집계 주기(시간). 신선도 눈금의 기준. */
export const REFRESH_INTERVAL_HOURS = 2;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Open API 는 "2024-06-01T12:34:56" 처럼 타임존이 없는 문자열을 준다.
 * 이 값은 UTC 기준이라, 그냥 new Date() 에 넣으면 실행 환경의 로컬
 * 시간으로 해석돼 한국에서는 9시간이 어긋난다. Z 를 붙여 UTC 로 못박는다.
 */
export function parseApiDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export type Staleness = 'fresh' | 'recent' | 'aging' | 'stale';

/**
 * 얼마나 묵었는가.
 *  fresh  : 갱신 주기 안쪽 — 게임 내 값과 같은 시대
 *  recent : 반나절 안쪽 — 참고할 만함
 *  aging  : 하루 안쪽
 *  stale  : 그 이상 — 시세로 쓰기엔 위험
 */
export function stalenessOf(ageMs: number): Staleness {
  if (ageMs < REFRESH_INTERVAL_HOURS * HOUR) return 'fresh';
  if (ageMs < 12 * HOUR) return 'recent';
  if (ageMs < DAY) return 'aging';
  return 'stale';
}

export const STALENESS_LABEL: Readonly<Record<Staleness, string>> = {
  fresh: '최신',
  recent: '양호',
  aging: '조금 지남',
  stale: '오래됨',
};

/**
 * "3분 전", "2시간 전" 같은 사람 말.
 *
 * 미래 시각은 음수 나이가 되는데, 이건 서버와 클라이언트 시계가 조금
 * 어긋났을 때 실제로 생긴다. "-3분 전" 같은 걸 보여 주느니 방금으로 친다.
 */
export function formatAge(ageMs: number): string {
  if (ageMs < MINUTE) return '방금';

  const minutes = Math.floor(ageMs / MINUTE);
  if (minutes < 60) return `${minutes}분 전`;

  const hours = Math.floor(ageMs / HOUR);
  if (hours < 24) return `${hours}시간 전`;

  const days = Math.floor(ageMs / DAY);
  if (days < 30) return `${days}일 전`;

  const months = Math.floor(days / 30);
  return months < 12 ? `${months}개월 전` : `${Math.floor(days / 365)}년 전`;
}

/**
 * 다음 집계 시점. 2시간 주기가 정각(0,2,4…시)에 떨어진다고 보고 올림한다.
 * 넥슨이 정확히 몇 분에 도는지는 공개돼 있지 않아 어림값이며,
 * 화면에서도 "예상"이라고 적어 둔다.
 */
export function nextRefreshAt(now: Date): Date {
  const next = new Date(now);
  next.setUTCMinutes(0, 0, 0);
  const step = REFRESH_INTERVAL_HOURS;
  next.setUTCHours(Math.floor(now.getUTCHours() / step) * step + step);
  return next;
}

export interface Freshness {
  /** 표본에서 가장 최근 시각 */
  latest: Date | null;
  /** 표본에서 가장 오래된 시각 */
  oldest: Date | null;
  /** latest 기준 경과 시간(ms). 표본이 없으면 null */
  ageMs: number | null;
  staleness: Staleness | null;
  /** "2시간 전" */
  ageLabel: string;
  /** 표본이 걸쳐 있는 기간(ms) */
  spanMs: number | null;
  /** 다음 집계 예상 시각 */
  nextRefresh: Date;
  /** 다음 집계까지 남은 ms */
  untilRefreshMs: number;
}

/**
 * 시각 문자열 목록에서 신선도를 뽑는다.
 * 파싱 실패한 값은 조용히 버린다 — 넥슨이 빈 문자열을 주는 경우가 있다.
 */
export function measureFreshness(dates: Array<string | null | undefined>, now: Date): Freshness {
  const times = dates
    .map(parseApiDate)
    .filter((d): d is Date => d !== null)
    .map((d) => d.getTime())
    .sort((a, b) => a - b);

  const nextRefresh = nextRefreshAt(now);
  const untilRefreshMs = nextRefresh.getTime() - now.getTime();

  if (times.length === 0) {
    return {
      latest: null, oldest: null, ageMs: null, staleness: null,
      ageLabel: '-', spanMs: null, nextRefresh, untilRefreshMs,
    };
  }

  const oldest = times[0];
  const latest = times[times.length - 1];
  // 시계 어긋남으로 미래 시각이 와도 나이가 음수가 되지 않게 자른다.
  const ageMs = Math.max(0, now.getTime() - latest);

  return {
    latest: new Date(latest),
    oldest: new Date(oldest),
    ageMs,
    staleness: stalenessOf(ageMs),
    ageLabel: formatAge(ageMs),
    spanMs: latest - oldest,
    nextRefresh,
    untilRefreshMs,
  };
}

/** "1일 4시간", "35분" 처럼 기간을 읽기 좋게 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0분';

  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / HOUR);
  const minutes = Math.floor((ms % HOUR) / MINUTE);

  if (days > 0) return hours > 0 ? `${days}일 ${hours}시간` : `${days}일`;
  if (hours > 0) return minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`;
  return `${Math.max(1, minutes)}분`;
}
