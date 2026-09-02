import 'server-only';

import { getCard, searchPlayers } from '@/lib/players/catalog';
import type { DataSource } from '@/lib/nexon/service';
import { buildPriceIndex, type Observation, type PriceStat } from './observations';
import { read } from './pool';

/**
 * ── 선수 이름으로 시세 찾기 ────────────────────────────────
 *
 * 지금까지 시세를 보려면 **구단주 닉네임**을 알아야 했다. 관측이 그 사람의
 * 거래 내역에서 나오니 구현으로는 자연스러운 순서였지만, 쓰는 사람의 질문은
 * 언제나 반대다 — "손흥민 얼마야?" 이지 "누구 거래 내역에 손흥민이 있지?"가
 * 아니다. 다른 시세 사이트가 전부 선수 이름 검색으로 시작하는 이유고,
 * 이 프로젝트에서 제일 크게 빠져 있던 구멍이다.
 *
 * 다행히 새로 긁을 것은 없다. 누적 관측 풀에 이미 카드별 체결가가 쌓여
 * 있으니, 이름 → spid 만 카탈로그로 풀면 풀을 그 카드로 잘라 보면 된다.
 * **넥슨 호출이 0회인 기능**이다.
 *
 * ── 없으면 없다고 한다 ──
 * 풀은 그동안 조회된 구단주들이 사고판 카드만 담고 있다. 검색한 카드가
 * 거기 없는 일이 당연히 생기고, 그때 다른 카드 값이나 추정치로 빈칸을
 * 채우지 않는다. stat: null 로 돌려보내고 화면이 "관측 없음"이라고 적는다.
 * 값을 지어내지 않는 것이 이 프로젝트의 원칙이고, 시세에서는 특히 그렇다 —
 * 틀린 시세는 없는 시세보다 나쁘다. 사람이 그 값으로 실제 거래를 한다.
 *
 * ── 풀은 출처별로 갈라져 있다 ──
 * 실데이터 풀과 데모 풀은 섞이지 않는다(pool.ts 참고). 여기서도 한쪽만
 * 골라 읽고, 어느 쪽을 읽었는지 결과에 담아 화면이 배지를 띄울 수 있게 한다.
 */

export interface CardPrice {
  spid: number;
  name: string;
  seasonName: string;
  imageUrl: string;
  ovr: number;
  /**
   * 풀에 이 카드 관측이 없으면 null.
   * 0 이나 추정치가 아니라 null 인 이유는 위 주석 참고.
   */
  stat: PriceStat | null;
}

export interface CardLookupResult {
  query: string;
  cards: CardPrice[];
  /** 이름은 맞았지만 관측이 없던 카드 수 — 화면에서 안내 문구를 고를 때 쓴다 */
  withoutSamples: number;
  /** 이름이 맞은 카드 총수 (cards 는 limit 으로 잘린다) */
  matched: number;
  /** 참고한 풀에 쌓여 있는 총 관측 수 */
  poolSamples: number;
  /** 어느 풀을 읽었는지 */
  source: DataSource;
}

export interface LookupOptions {
  /** 선수 이름. 초성도 된다 ("ㅅㅎㅁ" → 손흥민) */
  query?: string;
  /** 이름 대신 카드를 직접 지정 */
  spid?: number;
  limit?: number;
  /**
   * 읽을 풀. 지정하지 않으면 실데이터 풀을 쓰되, 그쪽이 비어 있고 데모 풀에는
   * 관측이 있으면 데모 풀로 내려간다 — 키 없이 띄운 배포에서 검색이 늘
   * 빈손으로 보이지 않게. 어느 쪽을 읽었는지는 결과에 그대로 실린다.
   */
  source?: DataSource;
}

/** 어느 풀을 읽을지 고른다. 둘을 섞는 선택지는 없다. */
function pickSource(requested?: DataSource): DataSource {
  if (requested) return requested;
  if (read('nexon').length > 0) return 'nexon';
  return read('mock').length > 0 ? 'mock' : 'nexon';
}

/**
 * 후보 카드를 넉넉히 뽑아 두는 배수.
 *
 * 이름만으로 정렬해 limit 만큼 자르면 안 된다. "손흥민"은 시즌별로 수십 장
 * 있는데 그중 풀에 관측이 있는 건 한두 장뿐이고, 하필 그게 이름 순위
 * 20번째면 관측 있는 카드를 놓친 채 "관측 없음" 만 여덟 줄 보여 주게 된다.
 * 그래서 후보를 넓게 받아 관측 있는 쪽을 앞으로 끌어올린 뒤에 자른다.
 */
const CANDIDATE_FACTOR = 8;
const MAX_CANDIDATES = 120;

export async function lookupCardPrices({
  query = '',
  spid,
  limit = 8,
  source,
}: LookupOptions): Promise<CardLookupResult> {
  const pool = pickSource(source);
  const observations = read(pool);

  const candidates = spid
    ? await cardsBySpid(spid)
    : await cardsByName(query, limit);

  const statOf = indexPool(observations, new Set(candidates.map((card) => card.spid)));

  const priced: CardPrice[] = candidates.map((card) => ({
    spid: card.spid,
    name: card.name,
    seasonName: card.seasonName,
    imageUrl: card.imageUrl,
    ovr: card.ovr,
    stat: statOf.get(card.spid) ?? null,
  }));

  /*
   * 관측이 있는 카드를 앞으로. 그 안에서는 표본이 많은 순 —
   * 표본 30건짜리 중앙값이 2건짜리보다 믿을 만하다.
   * 관측이 없는 카드끼리는 카탈로그가 매긴 순서(이름 적합도·최신 시즌)를 지킨다.
   */
  const ranked = priced
    .map((card, order) => ({ card, order }))
    .sort((a, b) => {
      const sa = a.card.stat?.samples ?? 0;
      const sb = b.card.stat?.samples ?? 0;
      if (sa !== sb) return sb - sa;
      return a.order - b.order;
    })
    .map(({ card }) => card);

  const cards = ranked.slice(0, limit);

  return {
    query: spid ? `#${spid}` : query,
    cards,
    withoutSamples: cards.filter((card) => card.stat === null).length,
    matched: candidates.length,
    poolSamples: observations.length,
    source: pool,
  };
}

async function cardsBySpid(spid: number) {
  const card = await getCard(spid);
  return card ? [card] : [];
}

async function cardsByName(query: string, limit: number) {
  if (!query.trim()) return [];
  const result = await searchPlayers({
    query,
    limit: Math.min(MAX_CANDIDATES, limit * CANDIDATE_FACTOR),
  });
  return result.cards;
}

/**
 * 풀을 후보 카드로 좁혀 카드별 통계를 낸다.
 *
 * 풀 전체로 buildPriceIndex 를 돌리면 수천 종을 접고 여덟 줄만 쓰는 셈이다.
 * 관심 있는 spid 만 남기고 접는다.
 */
function indexPool(
  observations: readonly Observation[],
  wanted: Set<number>,
): Map<number, PriceStat> {
  if (wanted.size === 0) return new Map();

  const slice = observations.filter((row) => wanted.has(row.spid));
  return new Map(buildPriceIndex(slice).map((stat) => [stat.spid, stat]));
}
