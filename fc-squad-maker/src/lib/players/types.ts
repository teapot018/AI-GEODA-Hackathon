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

/**
 * 화면에 뜨는 카드 1장 (선수 프로필 + 시즌).
 *
 * 카드의 **존재**는 넥슨 메타(spid.json)가 정하지만, 여기 담긴 오버롤과
 * 능력치는 이 프로젝트가 만든 값이다. '실제 카드' 라고 부르면 안에 든
 * 숫자까지 실제인 것처럼 읽힌다.
 */
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
  /**
   * 능력치가 어디서 왔는가. **둘 다 계층 C(이 프로젝트가 만든 값)다.**
   *
   * 넥슨 Open API 는 카드의 오버롤과 세부 능력치를 주지 않는다. 그래서
   * 어느 쪽도 "게임에 뜨는 값" 이 아니고, 화면에서는 둘 다 추정으로
   * 표기한다. 한때 'seed' 를 실측치라고 불렀는데, 그 시드는 이 저장소에
   * 사람이 손으로 적어 넣은 표일 뿐이다 — 손으로 적었다고 공식이 되지
   * 않는다.
   *
   *  - project-seed    : dataset.ts 에 손으로 적어 둔 프로필
   *  - project-formula : 포지션·이름으로 만들어 낸 추정 프로필
   *
   * 카드의 **존재 여부**는 이것과 무관하게 계층 A 다 — 카탈로그는 넥슨
   * spid.json 이 준 목록으로만 만들어지고, 여기 값은 그 카드를 꾸밀 뿐이다.
   */
  statSource: 'project-seed' | 'project-formula';
}
