import { describe, expect, it } from 'vitest';
import {
  MATCH_TYPE,
  NX,
  NX_META,
  pidOf,
  playerImageUrl,
  seasonIdOf,
  seasonImageUrl,
} from '@/lib/nexon/endpoints';

/**
 * ── "진짜 최신 시즌까지 검색되는가" 의 근거 ──────────────────
 *
 * 넥슨은 카드 하나를 spid 하나로 식별하고, 그 spid 는
 *     spid = seasonId * 1,000,000 + pid
 * 라는 단순한 규칙으로 만들어진다. 그래서 새 시즌이 나와도 코드를
 * 고칠 필요가 없다 — seasonId 를 하드코딩하지 않고 spid 에서 나눠 쓰기 때문이다.
 * 이 성질이 깨지면 "최신 시즌 지원" 이라는 약속이 통째로 무너지므로
 * 아직 존재하지 않는 미래 시즌 번호까지 넣어 확인한다.
 */
describe('spid 분해 — seasonId * 1,000,000 + pid', () => {
  it('알려진 카드에서 시즌과 선수를 갈라낸다', () => {
    expect(seasonIdOf(300_212_197)).toBe(300);
    expect(pidOf(300_212_197)).toBe(212_197);

    expect(seasonIdOf(274_000_001)).toBe(274);
    expect(pidOf(274_000_001)).toBe(1);
  });

  it('아직 나오지 않은 미래 시즌도 그대로 처리한다', () => {
    // 시즌 번호가 세 자리를 넘어가도(향후 몇 년치) 규칙은 그대로다.
    for (const seasonId of [301, 350, 420, 999, 1_234]) {
      const pid = 212_197;
      const spid = seasonId * 1_000_000 + pid;
      expect(seasonIdOf(spid)).toBe(seasonId);
      expect(pidOf(spid)).toBe(pid);
    }
  });

  it('무작위 조합 왕복 — 어떤 (시즌, 선수) 쌍이든 복원된다', () => {
    for (let i = 0; i < 2_000; i += 1) {
      const seasonId = 100 + ((i * 7) % 900);
      const pid = (i * 383) % 1_000_000;
      const spid = seasonId * 1_000_000 + pid;
      expect(seasonIdOf(spid)).toBe(seasonId);
      expect(pidOf(spid)).toBe(pid);
    }
  });

  it('pid 는 항상 100만 미만이다', () => {
    for (const spid of [1, 999_999, 1_000_000, 300_999_999]) {
      expect(pidOf(spid)).toBeLessThan(1_000_000);
      expect(pidOf(spid)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('이미지 URL', () => {
  it('선수 액션샷은 spid 로 만든다', () => {
    expect(playerImageUrl(300_212_197)).toBe(
      'https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/playersAction/p300212197.png',
    );
  });

  it('시즌 아이콘은 seasonId 로 만든다', () => {
    expect(seasonImageUrl(274)).toBe(
      'https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/seasonIcon/se274.png',
    );
  });

  it('넥슨 CDN 이 아닌 곳을 가리키지 않는다', () => {
    for (const url of [playerImageUrl(1), seasonImageUrl(1)]) {
      expect(new URL(url).host).toBe('fco.dn.nexoncdn.co.kr');
      expect(url.startsWith('https://')).toBe(true);
    }
  });
});

describe('API 경로 상수', () => {
  it('인증이 필요한 경로는 전부 /fconline/v1 아래에 있다', () => {
    for (const [name, path] of Object.entries(NX)) {
      expect(path, name).toMatch(/^\/fconline\/v1\//);
    }
  });

  it('정적 메타 경로는 인증이 필요 없는 /static 아래에 있다', () => {
    for (const [name, path] of Object.entries(NX_META)) {
      expect(path, name).toMatch(/^\/static\/fconline\/meta\/.+\.json$/);
    }
  });

  it('경로가 중복되지 않는다', () => {
    const all = [...Object.values(NX), ...Object.values(NX_META)];
    expect(new Set(all).size).toBe(all.length);
  });

  it('base URL 과 합쳐도 경로가 깨지지 않는다', () => {
    for (const path of Object.values(NX)) {
      const url = new URL(path, 'https://open.api.nexon.com/');
      expect(url.href).toBe(`https://open.api.nexon.com${path}`);
    }
  });

  it('매치 종류 코드는 서로 다르다', () => {
    const codes = Object.values(MATCH_TYPE);
    expect(new Set(codes).size).toBe(codes.length);
    expect(MATCH_TYPE.공식경기).toBe(50);
  });
});
