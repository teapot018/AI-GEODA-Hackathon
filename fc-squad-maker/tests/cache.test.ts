import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import { cacheControl, fail, ok } from '@/lib/api/respond';

/**
 * 응답 캐시 범위 검증.
 *
 * 지키려는 사실은 하나다 — **A 의 응답이 B 에게 나가면 안 된다.**
 *
 * 이 앱에서 신원은 쿼리스트링(`?ouid=`, `?nickname=`)에만 있다. 그런데
 * 앞단 공용 캐시가 쿼리스트링을 캐시 키에 넣는다는 보장이 없다.
 * CloudFront 의 기본 캐시 정책은 쿼리스트링을 전달하지 않고, 여러 CDN 이
 * "쿼리스트링 무시"를 옵션으로 제공한다. 그런 앞단에 `public` 을 주면
 * `?ouid=A` 로 채워진 칸이 `?ouid=B` 요청에 그대로 나간다.
 *
 * 그래서 여기서는 "사람마다 다른 응답에 `public` 이 붙지 않는다"를
 * 라우트 핸들러를 **실제로 불러서** 확인한다. 문자열 검사가 아니라
 * 나가는 헤더를 본다.
 */

/* ── 헤더 생성 규칙 ────────────────────────────────────────── */

describe('cacheControl', () => {
  it('shared 만 공용 캐시에 저장을 허용한다', () => {
    expect(cacheControl({ scope: 'shared', seconds: 300 })).toBe(
      'public, s-maxage=300, stale-while-revalidate=1200',
    );
  });

  it('user 는 개인 캐시까지만 — public 이 절대 들어가지 않는다', () => {
    const value = cacheControl({ scope: 'user', seconds: 120 });
    expect(value).toBe('private, max-age=120');
    expect(value).not.toContain('public');
    expect(value).not.toContain('s-maxage');
  });

  it('0 초는 헤더를 비우지 않고 no-store 로 못 박는다', () => {
    // 헤더가 없으면 휴리스틱 캐싱이 대신 결정한다. 0 은 "저장하지 마라"다.
    expect(cacheControl({ scope: 'shared', seconds: 0 })).toBe('no-store');
    expect(cacheControl({ scope: 'user', seconds: 0 })).toBe('no-store');
  });

  it('소수 초는 정수로 내린다', () => {
    // OFFICIAL_TTL_MS / 1000 처럼 나눗셈으로 만들어진 값이 들어온다.
    expect(cacheControl({ scope: 'shared', seconds: 7.9 })).toBe(
      'public, s-maxage=7, stale-while-revalidate=28',
    );
  });
});

describe('ok / fail 헤더', () => {
  it('cache 를 주지 않으면 헤더를 붙이지 않는다', () => {
    expect(ok({ a: 1 }).headers.get('cache-control')).toBeNull();
  });

  it('실패 응답은 저장하지 않는다', () => {
    // 404 는 RFC 9111 이 휴리스틱 캐싱을 허용하는 상태 코드다.
    const res = fail(404, 'NOT_FOUND', '없음');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

/* ── 실제 라우트 핸들러 ────────────────────────────────────── */

interface RouteCase {
  name: string;
  /** 이 라우트의 소스 파일 — 아래 "빠뜨린 라우트가 없다" 가 파일 목록과 대조한다 */
  file: string;
  scope: 'shared' | 'user';
  load: () => Promise<{ GET: (req: NextRequest, ctx: never) => Promise<Response> }>;
  url: string;
  /** 동적 세그먼트를 쓰는 라우트만 */
  params?: Record<string, string>;
}

const BASE = 'http://localhost';

/**
 * 앱이 가진 캐시 걸린 라우트 **전부**.
 *
 * 새 라우트를 추가하면 여기도 늘려야 한다. 아래 "빠뜨린 라우트가 없다"
 * 테스트가 파일 목록과 이 표를 맞춰 보므로, 빠뜨리면 테스트가 깨진다.
 */
const ROUTES: readonly RouteCase[] = [
  {
    name: 'GET /api/players',
    file: 'src/app/api/players/route.ts',
    scope: 'shared',
    load: () => import('@/app/api/players/route'),
    url: `${BASE}/api/players?q=&limit=5`,
  },
  {
    name: 'GET /api/players/[spid]',
    file: 'src/app/api/players/[spid]/route.ts',
    scope: 'shared',
    load: () => import('@/app/api/players/[spid]/route'),
    url: `${BASE}/api/players/300235494`,
    params: { spid: '300235494' },
  },
  {
    name: 'GET /api/pack',
    file: 'src/app/api/pack/route.ts',
    scope: 'shared',
    load: () => import('@/app/api/pack/route'),
    url: `${BASE}/api/pack`,
  },
  {
    name: 'GET /api/market/official',
    file: 'src/app/api/market/official/route.ts',
    scope: 'shared',
    load: () => import('@/app/api/market/official/route'),
    url: `${BASE}/api/market/official?spid=300235494&grade=1`,
  },
  {
    name: 'GET /api/manager',
    file: 'src/app/api/manager/route.ts',
    scope: 'user',
    load: () => import('@/app/api/manager/route'),
    url: `${BASE}/api/manager?nickname=구단주A`,
  },
  {
    name: 'GET /api/manager/trades',
    file: 'src/app/api/manager/trades/route.ts',
    scope: 'user',
    load: () => import('@/app/api/manager/trades/route'),
    url: `${BASE}/api/manager/trades?ouid=ouid-a&nickname=구단주A&limit=5`,
  },
  {
    name: 'GET /api/manager/matches',
    file: 'src/app/api/manager/matches/route.ts',
    scope: 'user',
    load: () => import('@/app/api/manager/matches/route'),
    url: `${BASE}/api/manager/matches?ouid=ouid-a&nickname=구단주A&limit=3`,
  },
  {
    name: 'GET /api/manager/squad',
    file: 'src/app/api/manager/squad/route.ts',
    scope: 'user',
    load: () => import('@/app/api/manager/squad/route'),
    url: `${BASE}/api/manager/squad?matchId=m-1&nickname=구단주A`,
  },
  {
    name: 'GET /api/manager/analytics',
    file: 'src/app/api/manager/analytics/route.ts',
    scope: 'user',
    load: () => import('@/app/api/manager/analytics/route'),
    url: `${BASE}/api/manager/analytics?ouid=ouid-a&nickname=구단주A&limit=2`,
  },
  {
    name: 'GET /api/match/[matchId]',
    file: 'src/app/api/match/[matchId]/route.ts',
    scope: 'user',
    load: () => import('@/app/api/match/[matchId]/route'),
    url: `${BASE}/api/match/m-1?nickname=구단주A`,
    params: { matchId: 'm-1' },
  },
  {
    name: 'GET /api/market/observations',
    file: 'src/app/api/market/observations/route.ts',
    scope: 'user',
    load: () => import('@/app/api/market/observations/route'),
    url: `${BASE}/api/market/observations?ouid=ouid-a&nickname=구단주A&pages=1&maxCards=5`,
  },
];

const call = async (route: RouteCase, url = route.url) => {
  const mod = await route.load();
  const ctx = route.params
    ? ({ params: Promise.resolve(route.params) } as never)
    : undefined;
  return mod.GET(new NextRequest(url), ctx as never);
};

describe('라우트가 내보내는 cache-control', () => {
  it.each(ROUTES.filter((r) => r.scope === 'user'))(
    '$name — 사람마다 다른 응답이라 public 을 붙이지 않는다',
    async (route) => {
      const res = await call(route);
      const header = res.headers.get('cache-control') ?? '';

      expect(header, `${route.name} 이 캐시 헤더를 내지 않았다`).not.toBe('');
      expect(header).not.toContain('public');
      // s-maxage 는 "공용 캐시가 이만큼 갖고 있어라"는 뜻이라 같이 금지한다.
      expect(header).not.toContain('s-maxage');
      expect(header).toContain('private');
    },
  );

  it.each(ROUTES.filter((r) => r.scope === 'shared'))(
    '$name — 누구에게나 같은 응답이라 공용 캐시를 허용한다',
    async (route) => {
      const res = await call(route);
      expect(res.headers.get('cache-control') ?? '').toContain('public');
    },
  );
});

describe('신원이 응답을 실제로 가른다', () => {
  /*
   * 캐시 범위만 맞고 응답이 요청자와 무관하다면 그것대로 버그다.
   * 서로 다른 구단주로 부르면 서로 다른 응답이 나와야 한다 —
   * 그래야 "신원이 캐시 키에 들어간다"는 말이 성립한다.
   */
  it('구단주가 다르면 /api/manager 응답도 다르다', async () => {
    const route = ROUTES.find((r) => r.name === 'GET /api/manager')!;
    const a = await (await call(route, `${BASE}/api/manager?nickname=구단주A`)).json();
    const b = await (await call(route, `${BASE}/api/manager?nickname=구단주B`)).json();

    expect(a.ok && b.ok).toBe(true);
    expect(JSON.stringify(a.data)).not.toBe(JSON.stringify(b.data));
  });
});

describe('빠뜨린 라우트가 없다', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      return statSync(full).isDirectory() ? walk(full) : full.endsWith('route.ts') ? [full] : [];
    });

  it('cache 를 거는 모든 라우트 파일이 이 표에 있다', () => {
    // 새 라우트가 캐시를 걸었는데 표에 없으면, 위의 public 검사를 통째로
    // 건너뛴 채 배포된다. 파일 목록 쪽에서 먼저 잡는다.
    const cached = walk('src/app/api')
      .filter((file) => /cache:\s*\{/.test(readFileSync(file, 'utf8')))
      .sort();

    expect(cached).toEqual([...ROUTES.map((r) => r.file)].sort());
  });

  it('표의 파일이 실제로 그 범위를 선언한다', () => {
    for (const route of ROUTES) {
      const text = readFileSync(route.file, 'utf8');
      expect(text, `${route.file} 에 scope: '${route.scope}' 선언이 없다`).toContain(
        `scope: '${route.scope}'`,
      );
    }
  });

  it('shared 를 선언한 파일은 신원 파라미터를 읽지 않는다', () => {
    for (const route of ROUTES.filter((r) => r.scope === 'shared')) {
      const text = readFileSync(route.file, 'utf8');
      // ouid/nickname 을 읽는데 shared 라면 남의 데이터가 섞여 나갈 수 있다.
      expect(/get\('ouid'\)|get\('nickname'\)/.test(text), `${route.file} 은 신원을 읽는다`)
        .toBe(false);
      expect(text).not.toContain("scope: 'user'");
    }
  });
});
