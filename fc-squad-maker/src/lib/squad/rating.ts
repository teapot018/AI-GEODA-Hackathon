import { enhanceCard } from '@/lib/players/enhance';
import type { HexStats, PlayerCardData, PositionCode } from '@/lib/players/types';
import { estimateValue } from '@/lib/players/value';
import {
  computeEnhanceTeamColor,
  computeTeamColors,
  positionFit,
  teamColorHints,
  type EnhanceTeamColor,
  type TeamColor,
  type TeamColorHint,
} from './chemistry';

/** 슬롯에 배치된 한 명 */
export interface SquadEntry {
  slotId: string;
  slotPosition: PositionCode;
  card: PlayerCardData;
  /** 강화 단계 (+1 ~ +13). fconline/rules.ts 참고 */
  grade: number;
}

export interface SquadRating {
  /** 배치 인원 */
  filled: number;
  /** 강화/적합도 반영 평균 오버롤 */
  overall: number;
  /** 강화만 반영한 순수 평균 오버롤 */
  rawOverall: number;
  /** 팀컬러 보너스 합 */
  chemistryBonus: number;
  teamColors: TeamColor[];
  /**
   * 강화 단계로 발동하는 팀컬러(물결). 조건을 못 채우면 null.
   *
   * 클럽/국가/리그 팀컬러와 축이 다르다 — 저쪽은 "누구를 모았나",
   * 이쪽은 "얼마나 강화했나" 다. 규칙표가 미검증이라 점수에는 넣지
   * 않고 화면에만 알린다(아래 enhanceBonusApplied 주석 참고).
   */
  enhanceTeamColor: EnhanceTeamColor | null;
  hints: TeamColorHint[];
  /** 스쿼드 총 추정 가치(BP) */
  totalValue: number;
  /** 라인별 평균 (수비/미드/공격) */
  lines: { defence: number; midfield: number; attack: number };
  /** 스쿼드 평균 육각 스탯 */
  averageStats: HexStats;
  /** 포지션이 안 맞는 선수 목록 */
  misfits: Array<{ slotId: string; name: string; fit: number }>;
}

const LINE_OF: Record<string, 'defence' | 'midfield' | 'attack'> = {
  GK: 'defence', SW: 'defence', CB: 'defence', RCB: 'defence', LCB: 'defence',
  RB: 'defence', LB: 'defence', RWB: 'defence', LWB: 'defence',
  CDM: 'midfield', RDM: 'midfield', LDM: 'midfield',
  CM: 'midfield', RCM: 'midfield', LCM: 'midfield', RM: 'midfield', LM: 'midfield',
  CAM: 'midfield', RAM: 'midfield', LAM: 'midfield',
  CF: 'attack', RF: 'attack', LF: 'attack', RW: 'attack', LW: 'attack',
  ST: 'attack', RS: 'attack', LS: 'attack',
};

const EMPTY_STATS: HexStats = {
  pace: 0, shooting: 0, passing: 0, dribbling: 0, defending: 0, physical: 0,
};

export function rateSquad(entries: SquadEntry[]): SquadRating {
  if (entries.length === 0) {
    return {
      filled: 0,
      overall: 0,
      rawOverall: 0,
      chemistryBonus: 0,
      teamColors: [],
      enhanceTeamColor: null,
      hints: [],
      totalValue: 0,
      lines: { defence: 0, midfield: 0, attack: 0 },
      averageStats: { ...EMPTY_STATS },
      misfits: [],
    };
  }

  const cards = entries.map((e) => e.card);
  const teamColors = computeTeamColors(cards);

  /*
   * 강화 팀컬러는 **점수에 더하지 않는다.**
   *
   * 규칙표를 넥슨 공지로 대조하지 못했기 때문이다(rules.ts
   * ENHANCE_TEAMCOLOR_VERIFIED = false). 미검증 보너스를 종합 점수에
   * 섞으면 그 점수가 어디서 왔는지 아무도 못 가른다 — 검증되면 그때
   * 더하면 되고, 그 전까지는 "이 조건을 만족했다" 는 사실만 알린다.
   */
  const enhanceTeamColor = computeEnhanceTeamColor(entries);
  const chemistryBonus = Math.min(
    8,
    teamColors.reduce((sum, tc) => sum + tc.bonus, 0),
  );

  const lineBuckets: Record<'defence' | 'midfield' | 'attack', number[]> = {
    defence: [], midfield: [], attack: [],
  };
  const statSum: HexStats = { ...EMPTY_STATS };
  const misfits: SquadRating['misfits'] = [];

  let weightedSum = 0;
  let rawSum = 0;
  let totalValue = 0;

  for (const entry of entries) {
    const enhanced = enhanceCard(entry.card, entry.grade);
    const fit = positionFit(entry.card, entry.slotPosition);

    rawSum += enhanced.ovr;
    weightedSum += enhanced.ovr * fit;
    totalValue += estimateValue({
      ovr: entry.card.ovr,
      seasonClassName: entry.card.seasonName,
      grade: entry.grade,
    });

    if (fit < 0.94) {
      misfits.push({ slotId: entry.slotId, name: entry.card.name, fit });
    }

    lineBuckets[LINE_OF[entry.slotPosition] ?? 'midfield'].push(enhanced.ovr * fit);

    statSum.pace += enhanced.stats.pace;
    statSum.shooting += enhanced.stats.shooting;
    statSum.passing += enhanced.stats.passing;
    statSum.dribbling += enhanced.stats.dribbling;
    statSum.defending += enhanced.stats.defending;
    statSum.physical += enhanced.stats.physical;
  }

  const n = entries.length;
  const avg = (values: number[]) =>
    values.length === 0 ? 0 : Math.round(values.reduce((a, b) => a + b, 0) / values.length);

  return {
    filled: n,
    overall: Math.round(weightedSum / n + chemistryBonus),
    rawOverall: Math.round(rawSum / n),
    chemistryBonus: Math.round(chemistryBonus * 10) / 10,
    teamColors,
    enhanceTeamColor,
    hints: teamColorHints(cards),
    totalValue,
    lines: {
      defence: avg(lineBuckets.defence),
      midfield: avg(lineBuckets.midfield),
      attack: avg(lineBuckets.attack),
    },
    averageStats: {
      pace: Math.round(statSum.pace / n),
      shooting: Math.round(statSum.shooting / n),
      passing: Math.round(statSum.passing / n),
      dribbling: Math.round(statSum.dribbling / n),
      defending: Math.round(statSum.defending / n),
      physical: Math.round(statSum.physical / n),
    },
    misfits,
  };
}
