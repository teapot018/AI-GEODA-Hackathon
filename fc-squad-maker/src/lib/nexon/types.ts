/**
 * 넥슨 FC 온라인 Open API 응답 타입.
 * 출처: https://openapi.nexon.com/game/fconline (FC ONLINE > API 목록)
 */

/** GET /fconline/v1/id */
export interface OuidResponse {
  ouid: string;
}

/** GET /fconline/v1/user/basic */
export interface UserBasic {
  ouid: string;
  nickname: string;
  level: number;
}

/** GET /fconline/v1/user/maxdivision */
export interface MaxDivision {
  matchType: number;
  division: number;
  achievementDate: string;
}

/** GET /fconline/v1/user/match -> string[] (매치 ID 배열) */
export type MatchIdList = string[];

/** GET /fconline/v1/user/trade */
/**
 * `/fconline/v1/user/trade` 한 행 — **계층 A (넥슨 공식 응답)**.
 *
 * ── 이 데이터가 누구 것인가 ──
 * 전체 이적시장의 거래가 아니다. **현재 사용 중인 Open API 인증 주체에서
 * 조회 가능한 거래 기록**이다. 화면에서 "이 선수의 전체 시장 거래량" 처럼
 * 말하면 안 된다 — 그런 데이터를 이 API 는 주지 않는다.
 *
 * ── tradeDate 의 의미는 방향에 따라 다르다 ──
 * 매입(buy)과 매도(sell)를 같은 "체결 시각" 으로 뭉뚱그리면 안 된다.
 * 둘이 가리키는 사건이 다르므로, 내부에서는 Observation.timestampMeaning
 * 으로 구분해 들고 다닌다(market/observations.ts).
 */
export interface TradeRecord {
  /**
   * 거래 시각. 타임존 없는 문자열이며 UTC 다(parseApiDate 가 Z 를 붙인다).
   * 방향별 의미는 위 주석 참고.
   */
  tradeDate: string;
  saleSn: string;
  spid: number;
  /** 강화 단계 (+1 ~ +13). fconline/rules.ts 참고 */
  grade: number;
  /** BP */
  value: number;
}

export interface MatchShoot {
  shootTotal: number;
  effectiveShootTotal: number;
  shootOutScore: number;
  goalTotal: number;
  goalTotalDisplay: number;
  ownGoal: number;
  shootHeading: number;
  goalHeading: number;
  shootFreekick: number;
  goalFreekick: number;
  shootInPenalty: number;
  goalInPenalty: number;
  shootOutPenalty: number;
  goalOutPenalty: number;
  shootPenaltyKick: number;
  goalPenaltyKick: number;
}

export interface MatchPass {
  passTry: number;
  passSuccess: number;
  shortPassTry: number;
  shortPassSuccess: number;
  longPassTry: number;
  longPassSuccess: number;
  bouncingLobPassTry: number;
  bouncingLobPassSuccess: number;
  drivenGroundPassTry: number;
  drivenGroundPassSuccess: number;
  throughPassTry: number;
  throughPassSuccess: number;
  lobbedThroughPassTry: number;
  lobbedThroughPassSuccess: number;
}

export interface MatchDefence {
  blockTry: number;
  blockSuccess: number;
  tackleTry: number;
  tackleSuccess: number;
}

export interface MatchPlayerStatus {
  shoot: number;
  effectiveShoot: number;
  assist: number;
  goal: number;
  dribble: number;
  intercept: number;
  defending: number;
  passTry: number;
  passSuccess: number;
  dribbleTry: number;
  dribbleSuccess: number;
  ballPossesionTry: number;
  ballPossesionSuccess: number;
  aerialTry: number;
  aerialSuccess: number;
  blockTry: number;
  block: number;
  tackleTry: number;
  tackle: number;
  yellowCards: number;
  redCards: number;
  spRating: number;
}

export interface MatchPlayer {
  spId: number;
  spPosition: number;
  spGrade: number;
  status: MatchPlayerStatus;
}

export interface MatchDetailInfo {
  seasonId: number;
  matchResult: string;
  matchEndType: number;
  systemPause: number;
  foul: number;
  injury: number;
  redCards: number;
  yellowCards: number;
  dribble: number;
  cornerKick: number;
  possession: number;
  offsideCount: number;
  averageRating: number;
  controller: string;
}

export interface MatchSide {
  ouid: string;
  nickname: string;
  matchDetail: MatchDetailInfo;
  shoot: MatchShoot;
  pass: MatchPass;
  defence: MatchDefence;
  player: MatchPlayer[];
}

/** GET /fconline/v1/match-detail */
export interface MatchDetail {
  matchId: string;
  matchDate: string;
  matchType: number;
  matchInfo: MatchSide[];
}

/* ── 정적 메타데이터 (인증 불필요) ───────────────────────────── */

export interface MetaSpid {
  id: number;
  name: string;
}

export interface MetaSeason {
  seasonId: number;
  className: string;
  seasonImg: string;
}

export interface MetaPosition {
  spposition: number;
  desc: string;
}

export interface MetaMatchType {
  matchtype: number;
  desc: string;
}

export interface MetaDivision {
  divisionId: number;
  divisionName: string;
}
