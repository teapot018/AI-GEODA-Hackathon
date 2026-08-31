import { describe, expect, it } from 'vitest';

import {
  formatAge,
  formatDuration,
  measureFreshness,
  nextRefreshAt,
  parseApiDate,
  REFRESH_INTERVAL_HOURS,
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
    expect(stalenessOf(REFRESH_INTERVAL_HOURS * HOUR - 1)).toBe('fresh');
  });

  it('주기를 넘기면 최신이 아니다', () => {
    expect(stalenessOf(REFRESH_INTERVAL_HOURS * HOUR)).toBe('recent');
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

describe('nextRefreshAt', () => {
  it('다음 짝수 정각으로 올린다', () => {
    expect(nextRefreshAt(new Date('2026-08-31T12:00:00Z')).toISOString()).toBe(
      '2026-08-31T14:00:00.000Z',
    );
    expect(nextRefreshAt(new Date('2026-08-31T12:34:56Z')).toISOString()).toBe(
      '2026-08-31T14:00:00.000Z',
    );
    expect(nextRefreshAt(new Date('2026-08-31T13:59:59Z')).toISOString()).toBe(
      '2026-08-31T14:00:00.000Z',
    );
  });

  it('항상 미래다', () => {
    for (const hour of [0, 1, 7, 15, 22, 23]) {
      const now = new Date(Date.UTC(2026, 7, 31, hour, 30));
      expect(nextRefreshAt(now).getTime()).toBeGreaterThan(now.getTime());
    }
  });

  it('자정을 넘길 때 날짜가 넘어간다', () => {
    expect(nextRefreshAt(new Date('2026-08-31T23:10:00Z')).toISOString()).toBe(
      '2026-09-01T00:00:00.000Z',
    );
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
    // 표본이 없어도 다음 갱신 예상은 계산된다.
    expect(f.nextRefresh.toISOString()).toBe('2026-08-31T14:00:00.000Z');
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

  it('다음 갱신까지 남은 시간은 양수다', () => {
    const f = measureFreshness(['2026-08-31T11:00:00'], NOW);
    expect(f.untilRefreshMs).toBeGreaterThan(0);
    expect(f.untilRefreshMs).toBe(2 * HOUR);
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
