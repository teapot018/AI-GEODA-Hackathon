import { describe, expect, it } from 'vitest';

import {
  formatAge,
  formatDuration,
  measureFreshness,
  parseApiDate,
  FRESH_WINDOW_HOURS,
  stalenessOf,
} from '@/lib/data/freshness';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** 기준 시각을 하나 고정해 두고 쓴다. 2026-08-31T12:00:00Z */
const NOW = new Date('2026-08-31T12:00:00Z');

describe('parseApiDate', () => {
  it('타임존 없는 문자열을 UTC 로 읽는다', () => {
    // 이걸 로컬 시간으로 읽으면 한국에서 9시간이 어긋난다.
    expect(parseApiDate('2024-06-01T12:34:56')?.toISOString()).toBe('2024-06-01T12:34:56.000Z');
  });

  it('이미 Z 가 붙어 있으면 그대로 둔다', () => {
    expect(parseApiDate('2024-06-01T12:34:56Z')?.toISOString()).toBe('2024-06-01T12:34:56.000Z');
  });

  it('오프셋이 붙어 있으면 그것을 존중한다', () => {
    expect(parseApiDate('2024-06-01T21:34:56+09:00')?.toISOString()).toBe(
      '2024-06-01T12:34:56.000Z',
    );
  });

  it('빈 값과 잘못된 값은 null', () => {
    expect(parseApiDate(null)).toBeNull();
    expect(parseApiDate(undefined)).toBeNull();
    expect(parseApiDate('')).toBeNull();
    expect(parseApiDate('어제')).toBeNull();
  });
});

describe('stalenessOf', () => {
  it('갱신 주기 안쪽은 최신', () => {
    expect(stalenessOf(0)).toBe('fresh');
    expect(stalenessOf(FRESH_WINDOW_HOURS * HOUR - 1)).toBe('fresh');
  });

  it('주기를 넘기면 최신이 아니다', () => {
    expect(stalenessOf(FRESH_WINDOW_HOURS * HOUR)).toBe('recent');
  });

  it('반나절·하루를 경계로 단계가 올라간다', () => {
    expect(stalenessOf(11 * HOUR)).toBe('recent');
    expect(stalenessOf(12 * HOUR)).toBe('aging');
    expect(stalenessOf(23 * HOUR)).toBe('aging');
    expect(stalenessOf(DAY)).toBe('stale');
    expect(stalenessOf(30 * DAY)).toBe('stale');
  });
});

describe('formatAge', () => {
  it('1분 미만은 방금', () => {
    expect(formatAge(0)).toBe('방금');
    expect(formatAge(59_000)).toBe('방금');
  });

  it('분·시간·일 단위로 올라간다', () => {
    expect(formatAge(MINUTE)).toBe('1분 전');
    expect(formatAge(59 * MINUTE)).toBe('59분 전');
    expect(formatAge(HOUR)).toBe('1시간 전');
    expect(formatAge(23 * HOUR)).toBe('23시간 전');
    expect(formatAge(DAY)).toBe('1일 전');
  });

  it('한 달·한 해를 넘어가면 단위를 바꾼다', () => {
    expect(formatAge(30 * DAY)).toBe('1개월 전');
    expect(formatAge(400 * DAY)).toBe('1년 전');
  });

  it('내림으로 끊는다 (1시간 59분은 아직 1시간 전)', () => {
    expect(formatAge(HOUR + 59 * MINUTE)).toBe('1시간 전');
  });
});

describe('다음 집계 시각은 예고하지 않는다', () => {
  it('신선도 결과에 예상 갱신 시각이 들어 있지 않다', () => {
    // 한때 nextRefresh / untilRefreshMs 가 여기 있었다. 2시간 주기가 UTC
    // 정각에 떨어진다는 가정으로 만든 값인데, 넥슨은 그런 걸 공개한 적이
    // 없고 카드마다 갱신 시각도 다르다. 근거 없는 시각을 화면에 찍느니
    // 주기만 밝히기로 했고, 그 결정이 되돌아가지 않게 여기서 못박는다.
    const f = measureFreshness(['2026-08-31T11:00:00'], NOW) as unknown as Record<string, unknown>;
    expect(f.nextRefresh).toBeUndefined();
    expect(f.untilRefreshMs).toBeUndefined();
  });

  it('주기 상수는 신선도 눈금으로 계속 쓴다', () => {
    // 주기 자체는 말할 수 있는 값이라 남는다 — '언제 갱신되나'가 아니라
    // '얼마나 묵었나'를 재는 데만 쓴다.
    expect(FRESH_WINDOW_HOURS).toBe(2);
    expect(stalenessOf(FRESH_WINDOW_HOURS * HOUR - 1)).toBe('fresh');
  });
});

describe('measureFreshness', () => {
  it('가장 최근 시각으로 나이를 잰다', () => {
    const f = measureFreshness(
      ['2026-08-31T09:00:00', '2026-08-31T11:00:00', '2026-08-31T10:00:00'],
      NOW,
    );
    expect(f.latest?.toISOString()).toBe('2026-08-31T11:00:00.000Z');
    expect(f.oldest?.toISOString()).toBe('2026-08-31T09:00:00.000Z');
    expect(f.ageMs).toBe(HOUR);
    expect(f.ageLabel).toBe('1시간 전');
    expect(f.staleness).toBe('fresh');
  });

  it('표본이 걸친 기간을 낸다', () => {
    const f = measureFreshness(['2026-08-29T12:00:00', '2026-08-31T11:00:00'], NOW);
    expect(f.spanMs).toBe(2 * DAY - HOUR);
  });

  it('표본이 없으면 0으로 나누지 않고 빈 결과를 준다', () => {
    const f = measureFreshness([], NOW);
    expect(f.latest).toBeNull();
    expect(f.ageMs).toBeNull();
    expect(f.staleness).toBeNull();
    expect(f.ageLabel).toBe('-');
    expect(f.spanMs).toBeNull();
  });

  it('파싱 안 되는 값은 버리고 나머지로 잰다', () => {
    const f = measureFreshness([null, '', '망가진값', '2026-08-31T11:00:00'], NOW);
    expect(f.ageMs).toBe(HOUR);
  });

  it('전부 파싱 실패하면 표본 없음으로 본다', () => {
    expect(measureFreshness(['', null, '어제'], NOW).staleness).toBeNull();
  });

  it('미래 시각이 와도 나이가 음수가 되지 않는다', () => {
    // 서버와 클라이언트 시계가 어긋나면 실제로 생긴다.
    const f = measureFreshness(['2026-08-31T13:00:00'], NOW);
    expect(f.ageMs).toBe(0);
    expect(f.ageLabel).toBe('방금');
  });
});

describe('formatDuration', () => {
  it('분·시간·일로 끊어 읽는다', () => {
    expect(formatDuration(35 * MINUTE)).toBe('35분');
    expect(formatDuration(2 * HOUR)).toBe('2시간');
    expect(formatDuration(2 * HOUR + 15 * MINUTE)).toBe('2시간 15분');
    expect(formatDuration(DAY)).toBe('1일');
    expect(formatDuration(DAY + 4 * HOUR)).toBe('1일 4시간');
  });

  it('0 이하나 이상한 값도 깨지지 않는다', () => {
    expect(formatDuration(0)).toBe('0분');
    expect(formatDuration(-5)).toBe('0분');
    expect(formatDuration(Number.NaN)).toBe('0분');
  });

  it('1분 미만은 0분이 아니라 1분으로 올린다', () => {
    // "0분 동안의 기록" 은 말이 안 된다.
    expect(formatDuration(30_000)).toBe('1분');
  });
});
