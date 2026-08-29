import 'server-only';

import { nexonFetch } from './client';
import { NX_META } from './endpoints';
import type {
  MetaDivision,
  MetaMatchType,
  MetaPosition,
  MetaSeason,
  MetaSpid,
} from './types';
import { PLAYER_SEED } from '@/lib/players/dataset';
import { DEMO_SEASONS } from '@/lib/players/seasons';

/**
 * 정적 메타데이터 로더.
 *
 * spid.json 은 2만 건이 넘어 매 요청 파싱하면 낭비다.
 * (1) Next.js fetch 캐시(revalidate 24h) + (2) 프로세스 메모리 캐시
 * 두 겹으로 감싸 서버 인스턴스당 한 번만 실제 파싱하도록 한다.
 */

const DAY = 60 * 60 * 24;

interface MetaBundle {
  spids: MetaSpid[];
  seasons: MetaSeason[];
  positions: MetaPosition[];
  matchTypes: MetaMatchType[];
  divisions: MetaDivision[];
  /** 실제 넥슨 메타를 받아왔는지, 데모 폴백인지 */
  source: 'nexon' | 'demo';
}

let cached: MetaBundle | null = null;
let inflight: Promise<MetaBundle> | null = null;

/* ── 데모 폴백 ────────────────────────────────────────────── */

/** 이름 -> 안정적인 6자리 pid (데모 전용, 실제 넥슨 pid 아님) */
export function demoPidOf(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i += 1) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return 100000 + ((h >>> 0) % 800000);
}

const DEMO_POSITIONS: MetaPosition[] = [
  { spposition: 0, desc: 'GK' }, { spposition: 1, desc: 'SW' }, { spposition: 2, desc: 'RWB' },
  { spposition: 3, desc: 'RB' }, { spposition: 4, desc: 'RCB' }, { spposition: 5, desc: 'CB' },
  { spposition: 6, desc: 'LCB' }, { spposition: 7, desc: 'LB' }, { spposition: 8, desc: 'LWB' },
  { spposition: 9, desc: 'RDM' }, { spposition: 10, desc: 'CDM' }, { spposition: 11, desc: 'LDM' },
  { spposition: 12, desc: 'RM' }, { spposition: 13, desc: 'RCM' }, { spposition: 14, desc: 'CM' },
  { spposition: 15, desc: 'LCM' }, { spposition: 16, desc: 'LM' }, { spposition: 17, desc: 'RAM' },
  { spposition: 18, desc: 'CAM' }, { spposition: 19, desc: 'LAM' }, { spposition: 20, desc: 'RF' },
  { spposition: 21, desc: 'CF' }, { spposition: 22, desc: 'LF' }, { spposition: 23, desc: 'RW' },
  { spposition: 24, desc: 'RS' }, { spposition: 25, desc: 'ST' }, { spposition: 26, desc: 'LS' },
  { spposition: 27, desc: 'LW' }, { spposition: 28, desc: 'SUB' },
];

const DEMO_MATCH_TYPES: MetaMatchType[] = [
  { matchtype: 50, desc: '공식경기' },
  { matchtype: 52, desc: '감독모드' },
  { matchtype: 40, desc: '친선경기' },
  { matchtype: 60, desc: '볼타 공식경기' },
];

const DEMO_DIVISIONS: MetaDivision[] = [
  { divisionId: 800, divisionName: '슈퍼 챔피언스' },
  { divisionId: 900, divisionName: '챔피언스' },
  { divisionId: 1000, divisionName: '슈퍼 챌린지' },
  { divisionId: 1100, divisionName: '챌린지1' },
  { divisionId: 1200, divisionName: '챌린지2' },
  { divisionId: 1300, divisionName: '챌린지3' },
  { divisionId: 2000, divisionName: '월드클래스1' },
  { divisionId: 2100, divisionName: '월드클래스2' },
  { divisionId: 2200, divisionName: '월드클래스3' },
  { divisionId: 2300, divisionName: '프로1' },
  { divisionId: 2400, divisionName: '프로2' },
  { divisionId: 2500, divisionName: '프로3' },
];

function buildDemoBundle(): MetaBundle {
  const spids: MetaSpid[] = [];
  for (const season of DEMO_SEASONS) {
    for (const profile of PLAYER_SEED) {
      spids.push({
        id: season.seasonId * 1_000_000 + demoPidOf(profile.name),
        name: profile.name,
      });
    }
  }
  return {
    spids,
    seasons: DEMO_SEASONS,
    positions: DEMO_POSITIONS,
    matchTypes: DEMO_MATCH_TYPES,
    divisions: DEMO_DIVISIONS,
    source: 'demo',
  };
}

/* ── 로더 ─────────────────────────────────────────────────── */

async function fetchBundle(): Promise<MetaBundle> {
  // 정적 메타는 인증이 필요 없다 (anonymous: true).
  const opts = { revalidate: DAY, anonymous: true as const, retries: 1 };
  const [spids, seasons, positions, matchTypes, divisions] = await Promise.all([
    nexonFetch<MetaSpid[]>(NX_META.spid, undefined, { ...opts, timeoutMs: 20000 }),
    nexonFetch<MetaSeason[]>(NX_META.season, undefined, opts),
    nexonFetch<MetaPosition[]>(NX_META.position, undefined, opts),
    nexonFetch<MetaMatchType[]>(NX_META.matchType, undefined, opts),
    nexonFetch<MetaDivision[]>(NX_META.division, undefined, opts),
  ]);
  return { spids, seasons, positions, matchTypes, divisions, source: 'nexon' };
}

export async function loadMeta(): Promise<MetaBundle> {
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = fetchBundle()
    .catch((error) => {
      console.warn('[meta] 넥슨 메타 로드 실패 → 데모 데이터로 대체합니다.', error);
      return buildDemoBundle();
    })
    .then((bundle) => {
      cached = bundle;
      inflight = null;
      return bundle;
    });

  return inflight;
}

/** 테스트/개발 중 캐시를 비우고 싶을 때 */
export function clearMetaCache(): void {
  cached = null;
  inflight = null;
}

/* ── 조회 헬퍼 ────────────────────────────────────────────── */

export async function seasonMap(): Promise<Map<number, MetaSeason>> {
  const { seasons } = await loadMeta();
  return new Map(seasons.map((s) => [s.seasonId, s]));
}

export async function positionMap(): Promise<Map<number, string>> {
  const { positions } = await loadMeta();
  return new Map(positions.map((p) => [p.spposition, p.desc]));
}

export async function matchTypeMap(): Promise<Map<number, string>> {
  const { matchTypes } = await loadMeta();
  return new Map(matchTypes.map((m) => [m.matchtype, m.desc]));
}

export async function divisionMap(): Promise<Map<number, string>> {
  const { divisions } = await loadMeta();
  return new Map(divisions.map((d) => [d.divisionId, d.divisionName]));
}

export async function spidNameMap(): Promise<Map<number, string>> {
  const { spids } = await loadMeta();
  return new Map(spids.map((s) => [s.id, s.name]));
}
