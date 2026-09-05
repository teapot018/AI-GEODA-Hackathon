import { describe, expect, it } from 'vitest';

import { FORMATIONS, findFormation } from '@/lib/squad/formations';
import type { Assignment } from '@/lib/squad/store';
import {
  evaluateBudget,
  evaluateChemistry,
  evaluatePositionFit,
  optimizeSquad,
  suggestUpgrades,
} from '@/lib/squad/optimizer';
import { makeCard } from './helpers';

const formation = findFormation('4-3-3');

function assign(slotId: string, over: Parameters<typeof makeCard>[0] = {}, grade = 1): [string, Assignment] {
  return [slotId, { card: makeCard(over), grade }];
}

describe('evaluateBudget', () => {
  it('빈 스쿼드는 비용 0, 예산 초과 아님', () => {
    const result = evaluateBudget({}, 1_000_000);
    expect(result.totalCost).toBe(0);
    expect(result.overBudget).toBe(false);
  });

  it('총 가치가 예산을 넘으면 overBudget=true, overBy>0', () => {
    const assignments = Object.fromEntries([assign('gk', { positions: ['GK'], ovr: 99 }, 10)]);
    const result = evaluateBudget(assignments, 100);
    expect(result.overBudget).toBe(true);
    expect(result.overBy).toBeGreaterThan(0);
    expect(result.totalCost).toBeGreaterThan(result.budget);
  });

  it('강화 단계가 오르면 비용도 오른다 (단조 증가)', () => {
    const low = evaluateBudget(Object.fromEntries([assign('gk', {}, 1)]), Infinity);
    const high = evaluateBudget(Object.fromEntries([assign('gk', {}, 5)]), Infinity);
    expect(high.totalCost).toBeGreaterThan(low.totalCost);
  });
});

describe('evaluatePositionFit', () => {
  it('빈 슬롯은 이슈를 내지 않는다', () => {
    expect(evaluatePositionFit(formation, {})).toHaveLength(0);
  });

  it('주 포지션과 정확히 일치하면 이슈가 없다', () => {
    const assignments = Object.fromEntries([assign('gk', { positions: ['GK'] })]);
    expect(evaluatePositionFit(formation, assignments)).toHaveLength(0);
  });

  it('완전히 다른 포지션(GK 슬롯에 필드 플레이어)은 bad 등급', () => {
    const assignments = Object.fromEntries([assign('gk', { positions: ['ST'] })]);
    const issues = evaluatePositionFit(formation, assignments);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('bad');
    expect(issues[0].slotId).toBe('gk');
  });

  it('같은 아키타입 다른 세부 포지션은 warn 등급', () => {
    // rcb 슬롯(CB)에 LCB 카드 — 같은 센터백 계열, 주포지션 불일치
    const assignments = Object.fromEntries([assign('rcb', { positions: ['LCB'] })]);
    const issues = evaluatePositionFit(formation, assignments);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warn');
  });
});

describe('evaluateChemistry', () => {
  it('빈 스쿼드는 팀컬러 없음, 빈 자리 = 전체 슬롯 수', () => {
    const result = evaluateChemistry(formation, {});
    expect(result.colors).toHaveLength(0);
    expect(result.totalBonus).toBe(0);
    expect(result.emptySlots).toBe(formation.slots.length);
  });

  it('같은 클럽 4명 이상이면 팀컬러가 뜬다', () => {
    const assignments = Object.fromEntries(
      formation.slots.slice(0, 4).map((s, i) =>
        assign(s.id, { club: '레알 마드리드', positions: [s.position], spid: 300_000_100 + i }),
      ),
    );
    const result = evaluateChemistry(formation, assignments);
    expect(result.colors.length).toBeGreaterThan(0);
    expect(result.totalBonus).toBeGreaterThan(0);
  });
});

describe('optimizeSquad — 종합 점수', () => {
  it('점수는 항상 0~100 범위', () => {
    for (const f of FORMATIONS) {
      const report = optimizeSquad(f, {}, 1_000_000_000);
      expect(report.score).toBeGreaterThanOrEqual(0);
      expect(report.score).toBeLessThanOrEqual(100);
    }
  });

  it('빈 스쿼드보다 채워진 스쿼드 점수가 높다 (동일 예산)', () => {
    const empty = optimizeSquad(formation, {}, 1_000_000_000_000);
    const assignments = Object.fromEntries(
      formation.slots.map((s, i) => assign(s.id, { positions: [s.position], spid: 300_000_200 + i })),
    );
    const filled = optimizeSquad(formation, assignments, 1_000_000_000_000);
    expect(filled.score).toBeGreaterThan(empty.score);
  });

  it('예산을 초과하면 점수가 깎인다', () => {
    const assignments = Object.fromEntries(
      formation.slots.map((s, i) => assign(s.id, { positions: [s.position], ovr: 99, spid: 300_000_300 + i }, 10)),
    );
    const withinBudget = optimizeSquad(formation, assignments, Number.MAX_SAFE_INTEGER);
    const overBudget = optimizeSquad(formation, assignments, 1);
    expect(overBudget.score).toBeLessThan(withinBudget.score);
  });

  it('포지션 부적합이 있으면 점수가 깎인다', () => {
    const goodFit = Object.fromEntries([assign('gk', { positions: ['GK'] })]);
    const badFit = Object.fromEntries([assign('gk', { positions: ['ST'] })]);
    const good = optimizeSquad(formation, goodFit, 1_000_000_000);
    const bad = optimizeSquad(formation, badFit, 1_000_000_000);
    expect(bad.score).toBeLessThan(good.score);
  });
});

describe('suggestUpgrades', () => {
  it('빈 슬롯에는 적합도 향상 후보가 나온다 (currentFit=0)', () => {
    const pool = [
      { spid: 1, name: '후보A', ovr: 90, seasonName: '23UP (23 Ultimate Player)', positions: ['GK'] },
    ];
    const result = suggestUpgrades(formation, {}, pool, 1_000_000_000);
    expect(result.some((c) => c.slotId === 'gk')).toBe(true);
  });

  it('예산을 넘는 후보는 제외된다', () => {
    const pool = [
      { spid: 1, name: '초고가 후보', ovr: 99, seasonName: '23UP (23 Ultimate Player)', positions: ['GK'] },
    ];
    const result = suggestUpgrades(formation, {}, pool, 1);
    expect(result).toHaveLength(0);
  });

  it('이미 완벽 적합(fit=1)이면 개선 후보가 없다', () => {
    const assignments = Object.fromEntries([assign('gk', { positions: ['GK'] })]);
    const pool = [
      { spid: 2, name: '동일 포지션 후보', ovr: 85, seasonName: '23UP (23 Ultimate Player)', positions: ['GK'] },
    ];
    const result = suggestUpgrades(formation, assignments, pool, 1_000_000_000);
    expect(result.filter((c) => c.slotId === 'gk')).toHaveLength(0);
  });

  it('다른 포지션 슬롯에는 배정되지 않는다', () => {
    const pool = [
      { spid: 3, name: 'ST 전용 후보', ovr: 90, seasonName: '23UP (23 Ultimate Player)', positions: ['ST'] },
    ];
    const result = suggestUpgrades(formation, {}, pool, 1_000_000_000);
    expect(result.every((c) => c.slotId !== 'gk')).toBe(true);
  });

  it('결과는 최대 10개로 제한된다', () => {
    const pool = Array.from({ length: 30 }, (_, i) => ({
      spid: i,
      name: `후보${i}`,
      ovr: 80 + (i % 15),
      seasonName: '23UP (23 Ultimate Player)',
      positions: ['GK', 'ST', 'CM', 'CB', 'LB', 'RB'],
    }));
    const result = suggestUpgrades(formation, {}, pool, 1_000_000_000);
    expect(result.length).toBeLessThanOrEqual(10);
  });
});
