import 'server-only';

import {
  buildFormTimeline,
  buildManagerForm,
  buildPlayerPerformance,
  type FormPoint,
  type ManagerForm,
  type PlayerPerformance,
} from '@/lib/analytics/form';
import {
  buildPriceIndex,
  summarizeMarket,
  tagSide,
  type MarketSummary,
  type Observation,
  type PriceStat,
  type TradeSide,
} from '@/lib/market/observations';
import type { PoolStats, PriceDelta } from '@/lib/market/livefeed';
import { absorb } from '@/lib/market/pool';
import { env } from '@/lib/env';
import { getCards } from '@/lib/players/catalog';
import type { PlayerCardData } from '@/lib/players/types';
import { inferFormation, startersOf } from '@/lib/squad/import';
import { MissingApiKeyError, NexonApiError, nexonFetch } from './client';
import { MATCH_TYPE, NX } from './endpoints';
import { matchTypeMap, positionMap } from './meta';
import { mockMarketTrades, mockMatchDetail, mockMatchIds } from './mock';
import type { MatchDetail, TradeRecord } from './types';
import { type DataSource, type Sourced } from './service';

/**
 * ── Open API 심화 조회 ─────────────────────────────────────
 *
 * service.ts 가 "화면 하나에 대응하는 단건 조회" 라면, 이 파일은
 * **여러 번 호출해서 겹쳐야 의미가 생기는** 조회를 담당한다:
 *
 *  - 시세 관측소   : /user/trade 를 offset 을 밀며 과거까지 긁는다
 *  - 전적 분석     : /user/match 로 ID 를 받고 /match-detail 을 N번 부른다
 *  - 스쿼드 임포트 : /match-detail 의 라인업을 우리 포메이션으로 옮긴다
 *
 * 호출 수가 많아지는 만큼 (1) 동시 실행을 제한하고 (2) 캐시 수명을 길게 잡고
 * (3) 중간에 한 건이 실패해도 나머지로 결과를 만든다.
 */

/** Open API 가 한 번에 주는 최대 건수 */
const PAGE_SIZE = 100;
/** 동시에 열어 둘 요청 수 — 429(호출량 초과)를 피하려고 낮게 잡았다. */
const CONCURRENCY = 4;

function shouldFallback(error: unknown, allowMock: boolean): boolean {
  if (!allowMock) return false;
  if (error instanceof MissingApiKeyError) return true;
  if (error instanceof NexonApiError) return !error.isNotFound;
  return true;
}

function fallbackNote(error: unknown): string {
  if (error instanceof MissingApiKeyError) return 'NX_API_KEY 미설정 — 데모 데이터';
  if (error instanceof NexonApiError) return `${error.code} — 데모 데이터로 대체`;
  return '넥슨 API 호출 실패 — 데모 데이터로 대체';
}

/** Promise.all 은 N개를 한꺼번에 던진다. 그러면 429 가 나므로 창을 좁힌다. */
async function mapWithLimit<In, Out>(
  items: In[],
  limit: number,
  fn: (item: In, index: number) => Promise<Out>,
): Promise<Out[]> {
  const results = new Array<Out>(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}

/* ── 시세 관측소 ───────────────────────────────────────────── */

export interface MarketCardStat extends PriceStat {
  name: string;
  seasonName: string;
  imageUrl: string;
  ovr: number;
}

/** 움직인 카드 — 이름을 붙여 화면에 바로 쓸 수 있게 한다. */
export interface MarketMover extends PriceDelta {
  name: string;
  seasonName: string;
}

export interface MarketReport {
  summary: MarketSummary;
  cards: MarketCardStat[];
  /** minSamples 를 넘긴 카드 총수 (cards 는 maxCards 로 잘린다) */
  cardsTotal: number;
  /** 누적 관측 풀 현황 — 조회를 거듭할수록 표본이 쌓인다 */
  pool: PoolStats;
  /** 직전 조회 대비 중앙가가 움직인 카드 (풀 기준) */
  movers: MarketMover[];
  /** 이번 조회로 풀에 새로 들어온 관측 수 */
  poolAdded: number;
  /** 실제로 긁어온 페이지 수 (요청한 만큼 없을 수 있다) */
  pagesFetched: number;
}

/**
 * offset 을 밀어 가며 한쪽(매입/매도) 거래를 모은다.
 * 페이지가 PAGE_SIZE 보다 적게 오면 더 볼 게 없다는 뜻이라 멈춘다.
 */
async function fetchTradePages(
  ouid: string,
  side: TradeSide,
  pages: number,
): Promise<{ records: TradeRecord[]; pagesFetched: number }> {
  const records: TradeRecord[] = [];
  let pagesFetched = 0;

  for (let page = 0; page < pages; page += 1) {
    const batch = await nexonFetch<TradeRecord[]>(
      NX.userTrade,
      { ouid, tradetype: side, offset: page * PAGE_SIZE, limit: PAGE_SIZE },
      { revalidate: 600 },
    );
    pagesFetched += 1;
    records.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  return { records, pagesFetched };
}

export interface MarketOptions {
  ouid: string;
  nicknameForMock?: string;
  /** 각 방향(매입/매도)당 긁을 페이지 수 */
  pages?: number;
  /** 표본이 이 수 미만인 카드는 통계로 내보내지 않는다 */
  minSamples?: number;
  /** 응답에 담을 카드 수 상한 — 거래가 잦은 구단주는 수천 종이 나온다 */
  maxCards?: number;
  allowMock?: boolean;
}

export async function getMarketReport({
  ouid,
  nicknameForMock = '나',
  pages = 3,
  minSamples = 1,
  maxCards = 60,
  allowMock = env.allowMock,
}: MarketOptions): Promise<Sourced<MarketReport>> {
  const build = async (
    observations: Observation[],
    pagesFetched: number,
  ): Promise<MarketReport> => {
    // 이번 관측을 누적 풀에 합친다. 풀은 조회를 거듭할수록 커지므로
    // 무엇이 움직였는지는 이번 조회분이 아니라 풀 기준으로 봐야 한다.
    const pooled = absorb(observations);

    const index = buildPriceIndex(observations).filter((stat) => stat.samples >= minSamples);
    // 표본이 많은 순으로 이미 정렬돼 있으므로 앞에서 자르면 볼 만한 것만 남는다.
    const top = index.slice(0, maxCards);
    // 움직인 카드 이름도 함께 받아 온다 — 한 번의 조회로 끝내기 위해.
    const cards = await getCards([
      ...top.map((stat) => stat.spid),
      ...pooled.movers.map((delta) => delta.spid),
    ]);

    return {
      summary: summarizeMarket(observations),
      pagesFetched,
      cardsTotal: index.length,
      pool: pooled.stats,
      poolAdded: pooled.added,
      movers: pooled.movers.map((delta) => ({
        ...delta,
        name: cards.get(delta.spid)?.name ?? `#${delta.spid}`,
        seasonName: cards.get(delta.spid)?.seasonName ?? '-',
      })),
      cards: top.map((stat) => {
        const card = cards.get(stat.spid);
        return {
          ...stat,
          name: card?.name ?? `#${stat.spid}`,
          seasonName: card?.seasonName ?? '-',
          imageUrl: card?.imageUrl ?? '',
          ovr: card?.ovr ?? 0,
        };
      }),
    };
  };

  try {
    const [buy, sell] = await Promise.all([
      fetchTradePages(ouid, 'buy', pages),
      fetchTradePages(ouid, 'sell', pages),
    ]);
    const observations = [...tagSide(buy.records, 'buy'), ...tagSide(sell.records, 'sell')];
    return {
      data: await build(observations, buy.pagesFetched + sell.pagesFetched),
      source: 'nexon',
    };
  } catch (error) {
    if (!shouldFallback(error, allowMock)) throw error;
    const observations = [
      ...tagSide(mockMarketTrades(nicknameForMock, 'buy', pages * PAGE_SIZE), 'buy'),
      ...tagSide(mockMarketTrades(nicknameForMock, 'sell', pages * PAGE_SIZE), 'sell'),
    ];
    return {
      data: await build(observations, 0),
      source: 'mock',
      note: fallbackNote(error),
    };
  }
}

/* ── 전적 분석 ─────────────────────────────────────────────── */

export interface PlayerPerformanceRow extends PlayerPerformance {
  name: string;
  seasonName: string;
  imageUrl: string;
  ovr: number;
  /** 가장 많이 선 자리의 한글 이름 */
  topPositionName: string;
}

export interface ManagerAnalytics {
  form: ManagerForm;
  timeline: FormPoint[];
  players: PlayerPerformanceRow[];
  matchTypeName: string;
  /** 실제로 상세까지 받아온 경기 수 */
  analyzed: number;
}

export interface AnalyticsOptions {
  ouid: string;
  nicknameForMock?: string;
  matchType?: number;
  /** 상세를 받아올 경기 수. 경기당 1콜이라 상한을 둔다. */
  limit?: number;
  allowMock?: boolean;
}

export async function getManagerAnalytics({
  ouid,
  nicknameForMock = '나',
  matchType = MATCH_TYPE.공식경기,
  limit = 20,
  allowMock = env.allowMock,
}: AnalyticsOptions): Promise<Sourced<ManagerAnalytics>> {
  const [matchTypes, positions] = await Promise.all([matchTypeMap(), positionMap()]);
  const matchTypeName = matchTypes.get(matchType) ?? `매치 ${matchType}`;

  const build = async (details: MatchDetail[], myOuid: string): Promise<ManagerAnalytics> => {
    const performance = buildPlayerPerformance(details, myOuid);
    const cards = await getCards(performance.map((row) => row.spid));

    return {
      matchTypeName,
      analyzed: details.length,
      form: buildManagerForm(details, myOuid),
      timeline: buildFormTimeline(details, myOuid),
      players: performance.map((row) => {
        const card = cards.get(row.spid);
        const top = row.positions[0];
        return {
          ...row,
          name: card?.name ?? `#${row.spid}`,
          seasonName: card?.seasonName ?? '-',
          imageUrl: card?.imageUrl ?? '',
          ovr: card?.ovr ?? 0,
          topPositionName: positions.get(top) ?? `POS${top ?? '-'}`,
        };
      }),
    };
  };

  try {
    const ids = await nexonFetch<string[]>(
      NX.userMatch,
      { ouid, matchtype: matchType, offset: 0, limit },
      { revalidate: 300 },
    );

    // 한 경기 상세가 실패해도 나머지로 분석을 만든다.
    const details = await mapWithLimit(ids.slice(0, limit), CONCURRENCY, (matchId) =>
      nexonFetch<MatchDetail>(NX.matchDetail, { matchid: matchId }, { revalidate: 3600 }).catch(
        () => null,
      ),
    );

    const usable = details.filter((detail): detail is MatchDetail => detail !== null);
    if (usable.length === 0) {
      throw new NexonApiError(502, 'NO_MATCH_DETAIL', '매치 상세를 하나도 받아오지 못했습니다.');
    }
    return { data: await build(usable, ouid), source: 'nexon' };
  } catch (error) {
    if (!shouldFallback(error, allowMock)) throw error;
    const ids = mockMatchIds(ouid, matchType, limit);
    const details = ids.map((id) => mockMatchDetail(id, nicknameForMock, matchType));
    // 목업의 내 ouid 는 닉네임에서 파생되므로 첫 사이드의 ouid 를 쓴다.
    const myOuid = details[0]?.matchInfo[0]?.ouid ?? ouid;
    return { data: await build(details, myOuid), source: 'mock', note: fallbackNote(error) };
  }
}

/* ── 스쿼드 임포트 ─────────────────────────────────────────── */

export interface ImportedSlot {
  slotId: string;
  card: PlayerCardData;
  grade: number;
  /** 실제 경기에서 선 자리 (한글) */
  actualPosition: string;
  rating: number;
}

export interface ImportedSquad {
  matchId: string;
  matchDate: string;
  nickname: string;
  formationId: string;
  formationName: string;
  /** 포메이션 추론 신뢰도 (0~1) */
  confidence: number;
  slots: ImportedSlot[];
  /** 카탈로그에서 못 찾아 배치하지 못한 spid */
  missing: number[];
}

export interface ImportOptions {
  matchId: string;
  /** 어느 쪽 스쿼드를 가져올지. 미지정이면 첫 번째 사이드. */
  ouid?: string;
  nicknameForMock?: string;
  allowMock?: boolean;
}

export async function getSquadFromMatch({
  matchId,
  ouid,
  nicknameForMock = '나',
  allowMock = env.allowMock,
}: ImportOptions): Promise<Sourced<ImportedSquad>> {
  const positions = await positionMap();

  const build = async (detail: MatchDetail): Promise<ImportedSquad> => {
    const side =
      (ouid ? detail.matchInfo.find((s) => s.ouid === ouid) : undefined) ?? detail.matchInfo[0];
    if (!side) {
      throw new NexonApiError(404, 'NO_SIDE', '해당 경기에서 스쿼드를 찾지 못했습니다.');
    }

    const lineup = startersOf(
      side.player.map((player) => ({
        spId: player.spId,
        spPosition: player.spPosition,
        spGrade: player.spGrade,
        payload: { rating: player.status.spRating },
      })),
    );
    const fit = inferFormation(lineup);
    const cards = await getCards(lineup.map((entry) => entry.spid));

    const slots: ImportedSlot[] = [];
    const missing: number[] = [];
    for (const { slotId, entry } of fit.placements) {
      const card = cards.get(entry.spid);
      if (!card) {
        missing.push(entry.spid);
        continue;
      }
      slots.push({
        slotId,
        card,
        grade: entry.grade,
        actualPosition: positions.get(entry.spPosition) ?? entry.position,
        rating: entry.payload?.rating ?? 0,
      });
    }

    return {
      matchId: detail.matchId,
      matchDate: detail.matchDate,
      nickname: side.nickname,
      formationId: fit.formation.id,
      formationName: fit.formation.name,
      confidence: Math.round(fit.score * 100) / 100,
      slots,
      missing,
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
    if (!shouldFallback(error, allowMock)) throw error;
    return {
      data: await build(mockMatchDetail(matchId, nicknameForMock)),
      source: 'mock',
      note: fallbackNote(error),
    };
  }
}

export type { DataSource };
