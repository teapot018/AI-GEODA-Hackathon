import { enhanceCard } from '@/lib/players/enhance';
import type { HexStats, PlayerCardData, PositionCode } from '@/lib/players/types';
import { estimateValue } from '@/lib/players/value';
import { computeTeamColors, positionFit, teamColorHints, type TeamColor, type TeamColorHint } from './chemistry';

/** 슬롯에 배치된 한 명 */
export interface SquadEntry {
  slotId: string;
  slotPosition: PositionCode;
  card: PlayerCardData;
  /** 강화 단계 (+1 ~ +10) */
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
      hints: [],
      totalValue: 0,
      lines: { defence: 0, midfield: 0, attack: 0 },
      averageStats: { ...EMPTY_STATS },
      misfits: [],
    };
  }

  const cards = entries.map((e) => e.card);
  const teamColors = computeTeamColors(cards);
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
