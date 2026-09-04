/**
 * ── 데이터 신선도 ──────────────────────────────────────────
 *
 * 이 프로젝트가 보여 주는 값은 대부분 "지금"이 아니다.
 * 시세는 과거 체결가고, 전적은 이미 끝난 경기다. 그런데 화면에 숫자만
 * 띄워 두면 보는 사람은 그걸 현재값으로 읽는다 — 거래 관측소에서
 * "현재 호가가 아니다"라고 못 박아 둔 것과 같은 이유로, 데이터가
 * 언제 것인지도 같이 보여 줘야 한다.
 *
 * 눈금의 첫 칸은 2시간이다. 이 숫자의 출처를 분명히 해 둔다 —
 * **넥슨이 기준가를 2시간마다 집계한다고 확인한 것이 아니다.** 우리가
 * 들은 것은 Open API 쪽 규칙(매시 정각 갱신, 2시간 전 데이터)이고,
 * 그것도 이 환경에서는 원문을 대조하지 못했다
 * (fconline/rules.ts 의 OPEN_API_UPDATE / DATACENTER_BASELINE_CYCLE).
 *
 * 그러니 이 2시간은 **우리가 고른 눈금**이지 게임 규칙이 아니다.
 * 고른 근거는 이렇다: Open API 가 2시간 전 데이터를 준다면 그보다 최근
 * 것을 관측했을 리 없으므로, 2시간이 "가장 최신일 수 있는 구간" 의
 * 자연스러운 경계가 된다. 쓸 만한 눈금이지만 규칙은 아니다.
 *
 * 모든 함수는 순수 함수다. `now` 를 인자로 받는 이유도 그것 —
 * Date.now() 를 안에서 부르면 테스트에서 시간을 고정할 수 없다.
 */

/**
 * 신선도 눈금의 첫 칸(시간) — **계층 E, 우리가 고른 값이다.**
 *
 * 예전 이름은 `REFRESH_INTERVAL_HOURS` 였고 주석은 "넥슨 데이터센터 기준가
 * 집계 주기" 라고 적혀 있었다. 확인한 적 없는 주기를 상수 이름에 못 박아
 * 둔 셈이라, 이 값을 읽는 곳마다 넥슨 규칙처럼 퍼졌다 — 화면 문구까지.
 *
 * 값은 그대로 두되 이름과 설명을 사실에 맞춘다. 이건 "얼마나 묵었나" 를
 * 재는 우리 눈금이고, 다음 갱신 시각을 계산하는 데는 쓰지 않는다.
 */
export const FRESH_WINDOW_HOURS = 2;

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
  if (ageMs < FRESH_WINDOW_HOURS * HOUR) return 'fresh';
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
 * ── 다음 집계 시각은 계산하지 않는다 ──
 *
 * 한때 이 자리에 nextRefreshAt() 이 있었다. 2시간 주기가 UTC 정각
 * (0,2,4…시)에 떨어진다고 보고 올림해서 "다음 집계 예상 14:00" 을 찍었다.
 * 화면에서 제일 자신 있어 보이는 값이었는데, 근거가 제일 없었다.
 *
 *  - 넥슨은 집계가 몇 시에 도는지 공개한 적이 없다. 정각 기준이라는 건
 *    우리가 지어낸 가정이고, 맞는지 확인할 방법도 없다.
 *  - 카드마다 갱신 시각이 다르다는 것이 이 바닥의 상식이다. 하나의
 *    시계로 전부를 예고하는 것 자체가 틀린 모델이다.
 *  - "예상"이라는 꼬리표를 달아도 사람은 적힌 시각을 보고 그때 다시
 *    들어온다. 빗나가면 그건 빗나간 예상이 아니라 헛걸음이다.
 *
 * 주기가 대략 2시간이라는 것까지는 말할 수 있다. 그래서 주기는 주기로만
 * 밝히고(신선도 눈금 FRESH_WINDOW_HOURS), 시각은 찍지 않는다.
 * 이 프로젝트가 능력치·상자 확률에 "추정"이라고 적어 둔 것과 같은 선이다.
 */

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

  if (times.length === 0) {
    return {
      latest: null, oldest: null, ageMs: null, staleness: null,
      ageLabel: '-', spanMs: null,
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
