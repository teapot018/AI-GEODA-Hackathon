import 'server-only';

import { env, hasApiKey } from '@/lib/env';
import { getCards } from '@/lib/players/catalog';
import type { PlayerCardData } from '@/lib/players/types';
import { MissingApiKeyError, NexonApiError, nexonFetch } from './client';
import { MATCH_TYPE, NX } from './endpoints';
import { divisionMap, matchTypeMap, positionMap } from './meta';
import {
  mockMatchDetail,
  mockMatchIds,
  mockMaxDivision,
  mockOuid,
  mockTrades,
  mockUserBasic,
} from './mock';
import type {
  MatchDetail,
  MaxDivision,
  OuidResponse,
  TradeRecord,
  UserBasic,
} from './types';

/**
 * 화면이 쓰기 좋은 형태로 가공하는 서비스 레이어.
 *
 * 규칙:
 *  - Route Handler 는 이 파일의 함수만 부른다 (nexonFetch 직접 호출 금지).
 *  - 모든 반환값에 source 를 실어 "실데이터인지 데모인지" UI 가 알 수 있게 한다.
 *  - 키가 없거나 호출이 실패하면 FC_ALLOW_MOCK=true 일 때만 목업으로 대체한다.
 */

export type DataSource = 'nexon' | 'mock';

export interface Sourced<T> {
  data: T;
  source: DataSource;
  /** 목업으로 대체된 이유 (UI 툴팁용) */
  note?: string;
}

function shouldFallback(error: unknown): boolean {
  if (!env.allowMock) return false;
  if (error instanceof MissingApiKeyError) return true;
  if (error instanceof NexonApiError) {
    // 닉네임을 정말 못 찾은 경우는 목업으로 감추지 않는다.
    return !error.isNotFound;
  }
  return true;
}

function fallbackNote(error: unknown): string {
  if (error instanceof MissingApiKeyError) return 'NX_API_KEY 미설정 — 데모 데이터';
  if (error instanceof NexonApiError) return `${error.code} — 데모 데이터로 대체`;
  return '넥슨 API 호출 실패 — 데모 데이터로 대체';
}

/* ── 구단주 ───────────────────────────────────────────────── */

export interface DivisionInfo {
  matchType: number;
  matchTypeName: string;
  division: number;
  divisionName: string;
  achievementDate: string;
}

export interface ManagerOverview {
  ouid: string;
  nickname: string;
  level: number;
  divisions: DivisionInfo[];
}

export async function getManagerOverview(nickname: string): Promise<Sourced<ManagerOverview>> {
  const trimmed = nickname.trim();
  if (!trimmed) throw new NexonApiError(400, 'EMPTY_NICKNAME', '구단주 닉네임을 입력해 주세요.');

  const [matchTypes, divisions] = await Promise.all([matchTypeMap(), divisionMap()]);
  const decorate = (rows: MaxDivision[]): DivisionInfo[] =>
    rows.map((row) => ({
      matchType: row.matchType,
      matchTypeName: matchTypes.get(row.matchType) ?? `매치 ${row.matchType}`,
      division: row.division,
      divisionName: divisions.get(row.division) ?? `등급 ${row.division}`,
      achievementDate: row.achievementDate,
    }));

  try {
    const { ouid } = await nexonFetch<OuidResponse>(NX.ouid, { nickname: trimmed }, { revalidate: 600 });
    const [basic, maxDivision] = await Promise.all([
      nexonFetch<UserBasic>(NX.userBasic, { ouid }, { revalidate: 300 }),
      nexonFetch<MaxDivision[]>(NX.maxDivision, { ouid }, { revalidate: 300 }).catch(() => [] as MaxDivision[]),
    ]);

    return {
      data: {
        ouid,
        nickname: basic.nickname,
        level: basic.level,
        divisions: decorate(maxDivision),
      },
      source: 'nexon',
    };
  } catch (error) {
    if (!shouldFallback(error)) throw error;
    const basic = mockUserBasic(trimmed);
    return {
      data: {
        ouid: basic.ouid,
        nickname: basic.nickname,
        level: basic.level,
        divisions: decorate(mockMaxDivision(trimmed)),
      },
      source: 'mock',
      note: fallbackNote(error),
    };
  }
}

/* ── 매치 기록 ─────────────────────────────────────────────── */

export interface MatchSideSummary {
  nickname: string;
  result: string;
  goals: number;
  shoot: number;
  possession: number;
  passRate: number;
  rating: number;
}

export interface MatchSummary {
  matchId: string;
  matchDate: string;
  matchType: number;
  matchTypeName: string;
  me: MatchSideSummary;
  opponent: MatchSideSummary | null;
}

function summarizeSide(side: MatchDetail['matchInfo'][number]): MatchSideSummary {
  const passRate =
    side.pass.passTry > 0 ? Math.round((side.pass.passSuccess / side.pass.passTry) * 100) : 0;
  return {
    nickname: side.nickname,
    result: side.matchDetail.matchResult,
    goals: side.shoot.goalTotal,
    shoot: side.shoot.shootTotal,
    possession: side.matchDetail.possession,
    passRate,
    rating: side.matchDetail.averageRating,
  };
}

export interface MatchListOptions {
  ouid: string;
  nickname?: string;
  matchType?: number;
  offset?: number;
  limit?: number;
}

export async function getRecentMatches(
  options: MatchListOptions,
): Promise<Sourced<MatchSummary[]>> {
  const {
    ouid,
    nickname = '나',
    matchType = MATCH_TYPE.공식경기,
    offset = 0,
    limit = 8,
  } = options;

  const matchTypes = await matchTypeMap();
  const typeName = matchTypes.get(matchType) ?? `매치 ${matchType}`;

  const summarize = (detail: MatchDetail, myOuid: string): MatchSummary => {
    const mine =
      detail.matchInfo.find((side) => side.ouid === myOuid) ?? detail.matchInfo[0];
    const other = detail.matchInfo.find((side) => side !== mine) ?? null;
    return {
      matchId: detail.matchId,
      matchDate: detail.matchDate,
      matchType: detail.matchType,
      matchTypeName: matchTypes.get(detail.matchType) ?? typeName,
      me: summarizeSide(mine),
      opponent: other ? summarizeSide(other) : null,
    };
  };

  try {
    const ids = await nexonFetch<string[]>(
      NX.userMatch,
      { ouid, matchtype: matchType, offset, limit },
      { revalidate: 120 },
    );

    // 매치 상세는 건당 1콜이라 동시 호출 수를 제한한다.
    const details = await Promise.all(
      ids.slice(0, limit).map((matchId) =>
        nexonFetch<MatchDetail>(NX.matchDetail, { matchid: matchId }, { revalidate: 3600 })
          .then((detail) => summarize(detail, ouid))
          .catch(() => null),
      ),
    );

    return { data: details.filter((d): d is MatchSummary => d !== null), source: 'nexon' };
  } catch (error) {
    if (!shouldFallback(error)) throw error;
    const ids = mockMatchIds(ouid, matchType, limit);
    const data = ids.map((id) => {
      const detail = mockMatchDetail(id, nickname, matchType);
      return summarize(detail, detail.matchInfo[0].ouid);
    });
    return { data, source: 'mock', note: fallbackNote(error) };
  }
}

/* ── 매치 상세 (출전 선수 포함) ────────────────────────────── */

export interface MatchLineupPlayer {
  spid: number;
  position: string;
  grade: number;
  goal: number;
  assist: number;
  rating: number;
  card: PlayerCardData | null;
}

export interface MatchDetailView {
  matchId: string;
  matchDate: string;
  matchTypeName: string;
  sides: Array<{
    nickname: string;
    summary: MatchSideSummary;
    lineup: MatchLineupPlayer[];
  }>;
}

export async function getMatchDetail(
  matchId: string,
  nicknameForMock = '나',
): Promise<Sourced<MatchDetailView>> {
  const [matchTypes, positions] = await Promise.all([matchTypeMap(), positionMap()]);

  const build = async (detail: MatchDetail): Promise<MatchDetailView> => {
    const allSpids = detail.matchInfo.flatMap((side) => side.player.map((p) => p.spId));
    const cards = await getCards(allSpids);

    return {
      matchId: detail.matchId,
      matchDate: detail.matchDate,
      matchTypeName: matchTypes.get(detail.matchType) ?? `매치 ${detail.matchType}`,
      sides: detail.matchInfo.map((side) => ({
        nickname: side.nickname,
        summary: summarizeSide(side),
        lineup: side.player.map((p) => ({
          spid: p.spId,
          position: positions.get(p.spPosition) ?? `POS${p.spPosition}`,
          grade: p.spGrade,
          goal: p.status.goal,
          assist: p.status.assist,
          rating: p.status.spRating,
          card: cards.get(p.spId) ?? null,
        })),
      })),
    };
  };

  try {
    const detail = await nexonFetch<MatchDetail>(
      NX.matchDetail,
      { matchid: matchId },
      { revalidate: 3600 },
    );
    return { data: await build(detail), source: 'nexon' };
  } catch (error) {
    if (!shouldFallback(error)) throw error;
    return {
      data: await build(mockMatchDetail(matchId, nicknameForMock)),
      source: 'mock',
      note: fallbackNote(error),
    };
  }
}

/* ── 거래 내역 / 자산 ──────────────────────────────────────── */

export interface TradeRow extends TradeRecord {
  name: string;
  seasonName: string;
  imageUrl: string;
  ovr: number;
}

export interface AssetSnapshot {
  /** 최근 기록 기준 매입 총액 */
  buyTotal: number;
  /** 최근 기록 기준 매도 총액 */
  sellTotal: number;
  /** 매도 - 매입 */
  net: number;
  buyCount: number;
  sellCount: number;
  recent: TradeRow[];
}

async function decorateTrades(records: TradeRecord[]): Promise<TradeRow[]> {
  const cards = await getCards(records.map((r) => r.spid));
  return records.map((record) => {
    const card = cards.get(record.spid);
    return {
      ...record,
      name: card?.name ?? `#${record.spid}`,
      seasonName: card?.seasonName ?? '-',
      imageUrl: card?.imageUrl ?? '',
      ovr: card?.ovr ?? 0,
    };
  });
}

export async function getAssetSnapshot(
  ouid: string,
  nicknameForMock = '나',
  limit = 30,
): Promise<Sourced<AssetSnapshot>> {
  const build = async (buy: TradeRecord[], sell: TradeRecord[]): Promise<AssetSnapshot> => {
    const rows = await decorateTrades(
      [...buy, ...sell].sort((a, b) => b.tradeDate.localeCompare(a.tradeDate)).slice(0, limit),
    );
    const sum = (list: TradeRecord[]) => list.reduce((acc, r) => acc + r.value, 0);
    const buyTotal = sum(buy);
    const sellTotal = sum(sell);
    return {
      buyTotal,
      sellTotal,
      net: sellTotal - buyTotal,
      buyCount: buy.length,
      sellCount: sell.length,
      recent: rows,
    };
  };

  try {
    const [buy, sell] = await Promise.all([
      nexonFetch<TradeRecord[]>(NX.userTrade, { ouid, tradetype: 'buy', offset: 0, limit }, { revalidate: 300 }),
      nexonFetch<TradeRecord[]>(NX.userTrade, { ouid, tradetype: 'sell', offset: 0, limit }, { revalidate: 300 }),
    ]);
    return { data: await build(buy, sell), source: 'nexon' };
  } catch (error) {
    if (!shouldFallback(error)) throw error;
    return {
      data: await build(mockTrades(nicknameForMock, 'buy', limit), mockTrades(nicknameForMock, 'sell', limit)),
      source: 'mock',
      note: fallbackNote(error),
    };
  }
}

export const apiKeyConfigured = hasApiKey;
