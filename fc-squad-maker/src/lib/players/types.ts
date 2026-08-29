/** 포지션 코드는 넥슨 spposition.json 과 동일한 약어를 쓴다. */
export type PositionCode =
  | 'GK'
  | 'SW' | 'RWB' | 'RB' | 'RCB' | 'CB' | 'LCB' | 'LB' | 'LWB'
  | 'RDM' | 'CDM' | 'LDM'
  | 'RM' | 'RCM' | 'CM' | 'LCM' | 'LM'
  | 'RAM' | 'CAM' | 'LAM'
  | 'RF' | 'CF' | 'LF'
  | 'RW' | 'RS' | 'ST' | 'LS' | 'LW';

/** 육각 스탯 (FC 온라인 카드에 노출되는 6개 대분류) */
export interface HexStats {
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physical: number;
}

/** GK 전용 스탯 */
export interface GkStats {
  diving: number;
  handling: number;
  kicking: number;
  reflexes: number;
  speed: number;
  positioning: number;
}

/** 로컬 시드 데이터의 선수 프로필 (시즌 무관한 "선수 자체"의 능력치) */
export interface PlayerProfile {
  /** 넥슨 pid (spid % 1_000_000). 시드에서는 조인 보조키로만 쓴다. */
  pid?: number;
  name: string;
  /** 검색용 별칭 (영문명, 별명 등) */
  aliases?: string[];
  nation?: string;
  club?: string;
  /** 주 포지션이 맨 앞 */
  positions: PositionCode[];
  /** 기준 시즌에서의 오버롤 */
  baseOvr: number;
  stats: HexStats;
  gk?: GkStats;
  skillMoves: number;
  weakFoot: number;
  foot: '오른발' | '왼발';
  /** 팀컬러 계산용 국적/리그 태그 */
  league?: string;
}

/** 실제 카드 1장 (선수 프로필 + 시즌) */
export interface PlayerCardData {
  spid: number;
  pid: number;
  seasonId: number;
  seasonName: string;
  seasonImg: string;
  imageUrl: string;
  name: string;
  positions: PositionCode[];
  ovr: number;
  stats: HexStats;
  gk?: GkStats;
  skillMoves: number;
  weakFoot: number;
  foot: string;
  nation?: string;
  club?: string;
  league?: string;
  /** 스탯이 로컬 시드에 있는 실측치인지, 추정치인지 */
  statSource: 'seed' | 'estimated';
}
