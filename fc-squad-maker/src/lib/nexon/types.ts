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
export interface TradeRecord {
  tradeDate: string;
  saleSn: string;
  spid: number;
  grade: number;
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
