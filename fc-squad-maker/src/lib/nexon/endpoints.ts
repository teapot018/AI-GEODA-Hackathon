/**
 * Open API 경로 상수. 경로를 한 곳에 모아 두면
 * 버전이 v1 -> v2 로 올라갈 때 이 파일만 고치면 된다.
 */
export const NX = {
  /** 닉네임 -> ouid */
  ouid: '/fconline/v1/id',
  /** 계정 기본 정보(닉네임/레벨) */
  userBasic: '/fconline/v1/user/basic',
  /** 역대 최고 등급 */
  maxDivision: '/fconline/v1/user/maxdivision',
  /** 매치 기록(ID 목록) */
  userMatch: '/fconline/v1/user/match',
  /** 매치 상세 */
  matchDetail: '/fconline/v1/match-detail',
  /** 이적시장 거래 내역 */
  userTrade: '/fconline/v1/user/trade',
} as const;

export const NX_META = {
  spid: '/static/fconline/meta/spid.json',
  season: '/static/fconline/meta/seasonid.json',
  position: '/static/fconline/meta/spposition.json',
  matchType: '/static/fconline/meta/matchtype.json',
  division: '/static/fconline/meta/division.json',
} as const;

/** 매치 종류 코드 (matchtype.json 과 동일, 자주 쓰는 것만 상수화) */
export const MATCH_TYPE = {
  공식경기: 50,
  감독모드: 52,
  공식경기_친선: 40,
  볼타공식: 60,
} as const;

/** 선수 액션샷 이미지 (spid 기준) */
export function playerImageUrl(spid: number): string {
  return `https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/playersAction/p${spid}.png`;
}

/** 시즌 아이콘. seasonid.json 의 seasonImg 가 우선이고, 이건 폴백. */
export function seasonImageUrl(seasonId: number): string {
  return `https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/seasonIcon/se${seasonId}.png`;
}

/** spid = seasonId * 1_000_000 + pid 규칙 */
export function seasonIdOf(spid: number): number {
  return Math.floor(spid / 1_000_000);
}

export function pidOf(spid: number): number {
  return spid % 1_000_000;
}
