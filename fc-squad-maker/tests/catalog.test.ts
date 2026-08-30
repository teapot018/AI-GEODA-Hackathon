import { describe, expect, it } from 'vitest';
import { candidatePool, getCard, getCards, loadCatalog, searchPlayers } from '@/lib/players/catalog';
import { PLAYER_SEED } from '@/lib/players/dataset';
import { DEMO_SEASONS } from '@/lib/players/seasons';
import { seasonIdOf } from '@/lib/nexon/endpoints';

/**
 * 카탈로그는 세 조각을 합친다 — 넥슨 spid.json(어떤 카드가 있는가),
 * seasonid.json(시즌명), 로컬 시드(능력치). 여기 테스트는 넥슨 쪽이
 * 통째로 끊긴 상황(= CI, = 사내망 차단)을 가정하고 돌아간다.
 * 데모 폴백이 살아 있어야 앱이 "키 없이도 열리는" 약속을 지킨다.
 */
describe('데모 폴백 — 넥슨이 안 될 때', () => {
  it('넥슨 메타 없이도 카탈로그가 만들어진다', async () => {
    const catalog = await loadCatalog();
    expect(catalog.source).toBe('demo');
    expect(catalog.entries.length).toBe(PLAYER_SEED.length * DEMO_SEASONS.length);
    expect(catalog.entries.length).toBe(512);
  });

  it('메타를 받으려고 시도한 곳은 인증이 필요 없는 /static 경로뿐이다', async () => {
    // 키가 없는 상태에서 인증 API 를 부르려 했다면 그 자체가 설계 오류다.
    const attempted = globalThis.__attemptedRequests ?? [];
    for (const url of attempted) {
      expect(new URL(url).pathname, url).toMatch(/^\/static\/fconline\/meta\//);
    }
  });

  it('카드 하나하나가 spid 규칙을 지킨다', async () => {
    const catalog = await loadCatalog();
    const seasonIds = new Set(DEMO_SEASONS.map((s) => s.seasonId));
    for (const entry of catalog.entries) {
      expect(seasonIdOf(entry.spid)).toBe(entry.seasonId);
      expect(seasonIds.has(entry.seasonId)).toBe(true);
    }
  });

  it('같은 선수는 시즌 수만큼 카드가 있다', async () => {
    const catalog = await loadCatalog();
    const byName = new Map<string, number>();
    for (const e of catalog.entries) byName.set(e.name, (byName.get(e.name) ?? 0) + 1);
    for (const [name, count] of byName) {
      expect(count, name).toBe(DEMO_SEASONS.length);
    }
  });

  it('spid 는 전부 유일하다', async () => {
    const catalog = await loadCatalog();
    expect(new Set(catalog.entries.map((e) => e.spid)).size).toBe(catalog.entries.length);
  });
});

describe('searchPlayers — 이름 검색', () => {
  it('한글 이름을 찾는다', async () => {
    const { cards } = await searchPlayers({ query: '손흥민' });
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((c) => c.name === '손흥민')).toBe(true);
  });

  it('초성만으로도 찾는다', async () => {
    const { cards } = await searchPlayers({ query: 'ㅅㅎㅁ' });
    expect(cards.map((c) => c.name)).toContain('손흥민');
  });

  it('별칭은 능력치를 붙이는 데 쓰인다', async () => {
    // dataset 의 aliases 로 시드 프로필을 찾아 붙이므로 statSource 가 'seed' 가 된다.
    const { cards } = await searchPlayers({ query: '판 다이크', limit: 1 });
    expect(cards[0].statSource).toBe('seed');
    expect(cards[0].positions).toContain('CB');
  });

  /**
   * 알려진 공백: aliases 는 프로필 연결에만 쓰이고 검색어 매칭에는 안 들어간다.
   * 그래서 'Van Dijk' 나 'Alisson' 으로 치면 0건이다.
   * 검색 고도화 단계에서 별칭까지 색인하기로 하고, 지금은 못 박지 않는다.
   */
  it.todo('영문/이형 별칭으로도 검색된다');

  it('최신 시즌이 먼저 나온다', async () => {
    const { cards } = await searchPlayers({ query: '손흥민' });
    const seasonIds = cards.map((c) => c.seasonId);
    expect(seasonIds).toEqual([...seasonIds].sort((a, b) => b - a));
    expect(seasonIds[0]).toBe(Math.max(...DEMO_SEASONS.map((s) => s.seasonId)));
  });

  it('시즌으로 좁힐 수 있다', async () => {
    const iconSeason = DEMO_SEASONS.find((s) => s.className.startsWith('ICON'))!;
    const { cards } = await searchPlayers({ query: '', seasonId: iconSeason.seasonId, limit: 100 });
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((c) => c.seasonId === iconSeason.seasonId)).toBe(true);
    expect(cards.every((c) => c.seasonName.startsWith('ICON'))).toBe(true);
  });

  it('포지션으로 좁힐 수 있다', async () => {
    const { cards } = await searchPlayers({ query: '', position: 'GK', limit: 30 });
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((c) => c.positions.includes('GK'))).toBe(true);
  });

  it('limit 을 넘겨 주지 않는다', async () => {
    for (const limit of [1, 5, 25]) {
      const { cards } = await searchPlayers({ query: '', limit });
      expect(cards.length).toBeLessThanOrEqual(limit);
    }
  });

  it('빈 검색어는 둘러보기 모드로 동작한다', async () => {
    const { cards, total } = await searchPlayers({ query: '   ', limit: 12 });
    expect(cards).toHaveLength(12);
    expect(total).toBeGreaterThan(0);
  });

  it('없는 이름은 빈 결과 (터지지 않는다)', async () => {
    const { cards, total } = await searchPlayers({ query: '존재하지않는선수이름' });
    expect(cards).toEqual([]);
    expect(total).toBe(0);
  });

  it('결과 카드에 화면이 필요로 하는 필드가 다 있다', async () => {
    const { cards } = await searchPlayers({ query: '김민재', limit: 1 });
    const card = cards[0];
    expect(card).toMatchObject({
      spid: expect.any(Number),
      seasonId: expect.any(Number),
      name: '김민재',
      ovr: expect.any(Number),
      statSource: 'seed',
    });
    expect(card.positions.length).toBeGreaterThan(0);
    expect(card.imageUrl).toContain(String(card.spid));
    expect(Object.values(card.stats).every((v) => v > 0)).toBe(true);
  });

  it('시즌 티어에 따라 같은 선수라도 오버롤이 달라진다', async () => {
    const { cards } = await searchPlayers({ query: '손흥민', limit: 20 });
    const icon = cards.find((c) => c.seasonName.startsWith('ICON'))!;
    const kleague = cards.find((c) => c.seasonName.includes('K League'))!;
    expect(icon.ovr).toBeGreaterThan(kleague.ovr);
  });
});

describe('getCard / getCards — spid 로 직접 조회', () => {
  it('카탈로그에 있는 카드를 돌려준다', async () => {
    const catalog = await loadCatalog();
    const target = catalog.entries[0];
    const card = await getCard(target.spid);
    expect(card).not.toBeNull();
    expect(card!.name).toBe(target.name);
    expect(card!.spid).toBe(target.spid);
  });

  it('카탈로그에 없는 spid 도 최소 정보로 만들어 준다 (신규 카드 대비)', async () => {
    const unknown = 999 * 1_000_000 + 123_456;
    const card = await getCard(unknown);
    expect(card).not.toBeNull();
    expect(card!.spid).toBe(unknown);
    expect(card!.seasonId).toBe(999);
    expect(card!.statSource).toBe('estimated');
    expect(card!.ovr).toBeGreaterThan(0);
    expect(card!.positions.length).toBeGreaterThan(0);
  });

  it('여러 장을 한 번에 가져오고 중복은 합친다', async () => {
    const catalog = await loadCatalog();
    const spids = catalog.entries.slice(0, 5).map((e) => e.spid);
    const map = await getCards([...spids, ...spids]);
    expect(map.size).toBe(5);
    for (const spid of spids) expect(map.get(spid)!.spid).toBe(spid);
  });

  it('빈 목록은 빈 결과', async () => {
    expect((await getCards([])).size).toBe(0);
  });
});

describe('candidatePool — 상자용 카드 풀', () => {
  it('오버롤 범위를 정확히 지킨다', async () => {
    const pool = await candidatePool({ minOvr: 85, maxOvr: 88 });
    expect(pool.length).toBeGreaterThan(0);
    for (const spid of pool) {
      const card = await getCard(spid);
      expect(card!.ovr, card!.name).toBeGreaterThanOrEqual(85);
      expect(card!.ovr, card!.name).toBeLessThanOrEqual(88);
    }
  });

  it('시즌 티어로 거를 수 있다', async () => {
    const pool = await candidatePool({ seasonTiers: ['icon'] });
    expect(pool.length).toBeGreaterThan(0);
    for (const spid of pool) {
      expect((await getCard(spid))!.seasonName.toUpperCase()).toContain('ICON');
    }
  });

  it('겹치지 않는 구간들은 서로소이고, 합치면 전체가 된다', async () => {
    const low = await candidatePool({ maxOvr: 79 });
    const mid = await candidatePool({ minOvr: 80, maxOvr: 84 });
    const high = await candidatePool({ minOvr: 85 });

    const all = new Set([...low, ...mid, ...high]);
    expect(all.size).toBe(low.length + mid.length + high.length);

    const catalog = await loadCatalog();
    expect(all.size).toBe(catalog.entries.length);
  });

  it('같은 조건을 두 번 물으면 같은 배열을 캐시에서 준다', async () => {
    const a = await candidatePool({ minOvr: 90 });
    const b = await candidatePool({ minOvr: 90 });
    expect(a).toBe(b); // 참조까지 동일 = 캐시 적중
  });

  it('아무도 없는 조건은 빈 배열 (터지지 않는다)', async () => {
    expect(await candidatePool({ minOvr: 200 })).toEqual([]);
  });
});
