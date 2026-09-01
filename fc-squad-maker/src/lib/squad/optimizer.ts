import { computeTeamColors, positionFit, type TeamColor } from '@/lib/squad/chemistry';
import type { Formation } from '@/lib/squad/formations';
import { estimateValue } from '@/lib/players/value';
import type { Assignment } from '@/lib/squad/store';

/**
 * M4 스쿼드 최적화 엔진.
 * FC 온라인은 BP(재화) 기반이라 "급여" 대신 "BP 예산" 개념을 쓴다.
 */

export interface BudgetResult {
  totalCost: number;
  budget: number;
  overBudget: boolean;
  overBy: number;
  ratio: number;
}

export function evaluateBudget(
  assignments: Record<string, Assignment>,
  budget: number,
): BudgetResult {
  const totalCost = Object.values(assignments).reduce(
    (sum, a) => sum + estimateValue({ ovr: a.card.ovr, seasonClassName: a.card.seasonName, grade: a.grade }),
    0,
  );
  const overBy = Math.max(0, totalCost - budget);
  return {
    totalCost,
    budget,
    overBudget: totalCost > budget,
    overBy,
    ratio: budget > 0 ? totalCost / budget : Infinity,
  };
}

export interface PositionIssue {
  slotId: string;
  playerName: string;
  fit: number;
  severity: 'warn' | 'bad';
}

export function evaluatePositionFit(
  formation: Formation,
  assignments: Record<string, Assignment>,
): PositionIssue[] {
  const issues: PositionIssue[] = [];
  for (const slot of formation.slots) {
    const entry = assignments[slot.id];
    if (!entry) continue;
    const fit = positionFit(entry.card, slot.position);
    if (fit < 0.94) {
      issues.push({
        slotId: slot.id,
        playerName: entry.card.name,
        fit,
        severity: fit < 0.8 ? 'bad' : 'warn',
      });
    }
  }
  return issues;
}

export interface ChemistryResult {
  colors: TeamColor[];
  totalBonus: number;
  emptySlots: number;
}

export function evaluateChemistry(formation: Formation, assignments: Record<string, Assignment>): ChemistryResult {
  const cards = Object.values(assignments).map((a) => a.card);
  const colors = computeTeamColors(cards);
  return {
    colors,
    totalBonus: colors.reduce((sum, c) => sum + c.bonus, 0),
    emptySlots: formation.slots.length - cards.length,
  };
}

export interface OptimizationReport {
  budget: BudgetResult;
  positionIssues: PositionIssue[];
  chemistry: ChemistryResult;
  /** 0~100 종합 점수 */
  score: number;
}

export function optimizeSquad(
  formation: Formation,
  assignments: Record<string, Assignment>,
  budget: number,
): OptimizationReport {
  const budgetResult = evaluateBudget(assignments, budget);
  const positionIssues = evaluatePositionFit(formation, assignments);
  const chemistry = evaluateChemistry(formation, assignments);

  const filled = formation.slots.length - chemistry.emptySlots;
  const fillRatio = formation.slots.length > 0 ? filled / formation.slots.length : 0;

  let score = 60 * fillRatio;
  score += Math.min(chemistry.totalBonus, 20);
  score -= positionIssues.reduce((sum, i) => sum + (i.severity === 'bad' ? 6 : 2), 0);
  if (budgetResult.overBudget) score -= Math.min(20, budgetResult.ratio * 10);

  return {
    budget: budgetResult,
    positionIssues,
    chemistry,
    score: Math.max(0, Math.min(100, Math.round(score))),
  };
}

/** 예산 안에서, 현재 카드보다 적합도가 좋은 대체 후보를 고른다. */
export interface UpgradeCandidate {
  slotId: string;
  candidateSpid: number;
  candidateName: string;
  cost: number;
  fitGain: number;
}

export function suggestUpgrades(
  formation: Formation,
  assignments: Record<string, Assignment>,
  pool: Array<{ spid: number; name: string; ovr: number; seasonName: string; positions: string[] }>,
  remainingBudget: number,
): UpgradeCandidate[] {
  const out: UpgradeCandidate[] = [];
  for (const slot of formation.slots) {
    const entry = assignments[slot.id];
    const currentFit = entry ? positionFit(entry.card, slot.position) : 0;
    for (const candidate of pool) {
      if (!candidate.positions.includes(slot.position)) continue;
      const cost = estimateValue({ ovr: candidate.ovr, seasonClassName: candidate.seasonName, grade: 1 });
      if (cost > remainingBudget) continue;
      const fitGain = 1 - currentFit;
      if (fitGain <= 0) continue;
      out.push({ slotId: slot.id, candidateSpid: candidate.spid, candidateName: candidate.name, cost, fitGain });
    }
  }
  return out.sort((a, b) => b.fitGain - a.fitGain).slice(0, 10);
}
