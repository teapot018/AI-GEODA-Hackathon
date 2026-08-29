import 'server-only';

import { loadMeta } from '@/lib/nexon/meta';
import { playerImageUrl, seasonIdOf, seasonImageUrl, pidOf } from '@/lib/nexon/endpoints';
import { choseongKey, matchScore, normalize } from '@/lib/utils/hangul';
import { PLAYER_SEED } from './dataset';
import { estimateProfile } from './estimate';
import { seasonRule, type SeasonTier } from './seasons';
import type { PlayerCardData, PlayerProfile, PositionCode } from './types';

/**
 * 선수 카드 카탈로그.
 *
 * 조합 방식:
 *   넥슨 spid.json  →  { spid, 이름 }          (실데이터: 어떤 카드가 존재하는가)
 *   seasonid.json   →  { 시즌명, 시즌 아이콘 }  (실데이터)
 *   로컬 시드       →  { 능력치, 포지션, 소속 } (없으면 추정 모델)
 *
 * 이 카탈로그는 프로세스당 한 번만 만들고 메모리에 들고 있는다.
 */

interface CatalogEntry {
  spid: number;
  pid: number;
  seasonId: number;
  name: string;
  /** 검색용 정규화 키 */
  key: string;
  cho: string;
  /** PLAYER_SEED 인덱스. -1 이면 추정 프로필. */
  profileIndex: number;
}

interface Catalog {
  entries: CatalogEntry[];
  bySpid: Map<number, CatalogEntry>;
  source: 'nexon' | 'demo';
}

let catalogPromise: Promise<Catalog> | null = null;

/** 이름/별칭 -> 시드 인덱스 */
function buildSeedLookup(): Map<string, number> {
  const lookup = new Map<string, number>();
  PLAYER_SEED.forEach((profile, index) => {
    lookup.set(normalize(profile.name), index);
    for (const alias of profile.aliases ?? []) {
      const key = normalize(alias);
      if (!lookup.has(key)) lookup.set(key, index);
    }
  });
  return lookup;
}

async function buildCatalog(): Promise<Catalog> {
  const meta = await loadMeta();
  const seedLookup = buildSeedLookup();

  const entries: CatalogEntry[] = new Array(meta.spids.length);
  const bySpid = new Map<number, CatalogEntry>();

  for (let i = 0; i < meta.spids.length; i += 1) {
    const { id, name } = meta.spids[i];
    const key = normalize(name);
    const entry: CatalogEntry = {
      spid: id,
      pid: pidOf(id),
      seasonId: seasonIdOf(id),
      name,
      key,
      cho: choseongKey(name),
      profileIndex: seedLookup.get(key) ?? -1,
    };
    entries[i] = entry;
    bySpid.set(id, entry);
  }

  return { entries, bySpid, source: meta.source };
}

export function loadCatalog(): Promise<Catalog> {
  catalogPromise ??= buildCatalog();
  return catalogPromise;
}

/** 시즌 티어 보정을 반영한 카드 오버롤 */
function cardOvr(baseOvr: number, className: string | undefined): number {
  const bonus = seasonRule(className).ovrBonus;
  return Math.max(40, Math.min(120, baseOvr + bonus));
}

async function materialize(entry: CatalogEntry): Promise<PlayerCardData> {
  const meta = await loadMeta();
  const season = meta.seasons.find((s) => s.seasonId === entry.seasonId);

  const seeded: PlayerProfile | undefined =
    entry.profileIndex >= 0 ? PLAYER_SEED[entry.profileIndex] : undefined;
  const profile = seeded ?? estimateProfile({ name: entry.name });

  const ovr = cardOvr(profile.baseOvr, season?.className);

  return {
    spid: entry.spid,
    pid: entry.pid,
    seasonId: entry.seasonId,
    seasonName: season?.className ?? `시즌 ${entry.seasonId}`,
    seasonImg: season?.seasonImg || seasonImageUrl(entry.seasonId),
    imageUrl: playerImageUrl(entry.spid),
    name: entry.name,
    positions: profile.positions as PositionCode[],
    ovr,
    stats: profile.stats,
    gk: profile.gk,
    skillMoves: profile.skillMoves,
    weakFoot: profile.weakFoot,
    foot: profile.foot,
    nation: profile.nation,
    club: profile.club,
    league: profile.league,
    statSource: seeded ? 'seed' : 'estimated',
  };
}

export interface SearchOptions {
  /** 검색어 (초성 가능) */
  query: string;
  /** 특정 시즌만 */
  seasonId?: number;
  /** 특정 포지션만 (주포지션 + 서브포지션 모두 확인) */
  position?: PositionCode;
  limit?: number;
  /** 같은 선수의 여러 시즌 카드를 모두 보여줄지 (기본 true) */
  groupBySeason?: boolean;
}

export interface SearchResult {
  cards: PlayerCardData[];
  total: number;
  source: 'nexon' | 'demo';
}

export async function searchPlayers(options: SearchOptions): Promise<SearchResult> {
  const { query, seasonId, position, limit = 40 } = options;
  const catalog = await loadCatalog();

  const scored: Array<{ entry: CatalogEntry; score: number }> = [];

  for (const entry of catalog.entries) {
    if (seasonId !== undefined && entry.seasonId !== seasonId) continue;

    const score = query.trim() ? matchScore(entry.name, query) : 1;
    if (score === 0) continue;

    scored.push({ entry, score });
    // 질의가 비어 있으면(둘러보기 모드) 너무 많이 쌓기 전에 끊는다.
    if (!query.trim() && scored.length >= limit * 6) break;
  }

  // 점수 내림차순 → 시즌 ID 내림차순(최신 시즌 우선)
  scored.sort((a, b) => b.score - a.score || b.entry.seasonId - a.entry.seasonId);

  const cards: PlayerCardData[] = [];
  for (const { entry } of scored) {
    if (cards.length >= limit) break;
    const card = await materialize(entry);
    if (position && !card.positions.includes(position)) continue;
    cards.push(card);
  }

  return { cards, total: scored.length, source: catalog.source };
}

export async function getCard(spid: number): Promise<PlayerCardData | null> {
  const catalog = await loadCatalog();
  const entry = catalog.bySpid.get(spid);
  if (entry) return materialize(entry);

  // 카탈로그에 없는 spid (신규 카드 등) 도 최소한의 정보로 만들어 준다.
  const seasonId = seasonIdOf(spid);
  const meta = await loadMeta();
  const season = meta.seasons.find((s) => s.seasonId === seasonId);
  const profile = estimateProfile({ name: `#${spid}` });

  return {
    spid,
    pid: pidOf(spid),
    seasonId,
    seasonName: season?.className ?? `시즌 ${seasonId}`,
    seasonImg: season?.seasonImg || seasonImageUrl(seasonId),
    imageUrl: playerImageUrl(spid),
    name: `알 수 없는 선수 (${spid})`,
    positions: profile.positions,
    ovr: cardOvr(profile.baseOvr, season?.className),
    stats: profile.stats,
    skillMoves: profile.skillMoves,
    weakFoot: profile.weakFoot,
    foot: profile.foot,
    statSource: 'estimated',
  };
}

/** 여러 spid 를 한 번에 (매치 상세의 출전 선수 목록용) */
export async function getCards(spids: number[]): Promise<Map<number, PlayerCardData>> {
  const unique = [...new Set(spids)];
  const result = new Map<number, PlayerCardData>();
  await Promise.all(
    unique.map(async (spid) => {
      const card = await getCard(spid);
      if (card) result.set(spid, card);
    }),
  );
  return result;
}

/* ── 상자 시뮬레이터용 풀 조회 ─────────────────────────────── */

export interface PoolFilter {
  seasonTiers?: SeasonTier[];
  minOvr?: number;
  maxOvr?: number;
}

/** 전체 스캔 없이 재사용하도록 필터 조합별 풀을 캐싱한다. */
const poolCache = new Map<string, number[]>();

function poolKey(filter: PoolFilter): string {
  return JSON.stringify([
    filter.seasonTiers?.slice().sort() ?? null,
    filter.minOvr ?? null,
    filter.maxOvr ?? null,
  ]);
}

/** 카드 재료화 없이 오버롤만 싸게 계산 */
async function quickOvr(entry: CatalogEntry, classNames: Map<number, string>): Promise<number> {
  const profile =
    entry.profileIndex >= 0 ? PLAYER_SEED[entry.profileIndex] : estimateProfile({ name: entry.name });
  return cardOvr(profile.baseOvr, classNames.get(entry.seasonId));
}

/** 필터에 맞는 spid 목록. 결과는 캐시된다. */
export async function candidatePool(filter: PoolFilter): Promise<number[]> {
  const key = poolKey(filter);
  const hit = poolCache.get(key);
  if (hit) return hit;

  const [catalog, meta] = await Promise.all([loadCatalog(), loadMeta()]);
  const classNames = new Map(meta.seasons.map((s) => [s.seasonId, s.className]));
  const tierSet = filter.seasonTiers ? new Set(filter.seasonTiers) : null;

  const pool: number[] = [];
  for (const entry of catalog.entries) {
    if (tierSet) {
      const tier = seasonRule(classNames.get(entry.seasonId)).tier;
      if (!tierSet.has(tier)) continue;
    }
    const ovr = await quickOvr(entry, classNames);
    if (filter.minOvr !== undefined && ovr < filter.minOvr) continue;
    if (filter.maxOvr !== undefined && ovr > filter.maxOvr) continue;
    pool.push(entry.spid);
  }

  poolCache.set(key, pool);
  return pool;
}
