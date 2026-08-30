import { describe, expect, it } from 'vitest';
import { DEFAULT_FORMATION, findFormation, FORMATIONS } from '@/lib/squad/formations';
import { rateSquad, type SquadEntry } from '@/lib/squad/rating';
import { makeCard } from './helpers';
import type { PlayerCardData } from '@/lib/players/types';

/**
 * 스쿼드 평점은 여러 근사 모델(강화 + 적합도 + 팀컬러)이 겹쳐 나오는 최종 숫자다.
 * 개별 모듈이 맞아도 합치는 과정에서 0 나누기나 보너스 이중 계산이 나기 쉬워서
 * 여기서 조립 결과를 따로 검증한다.
 */
const entry = (card: PlayerCardData, slotPosition: SquadEntry['slotPosition'], grade = 1): SquadEntry => ({
  slotId: `${slotPosition}-${card.spid}`,
  slotPosition,
  card,
  grade,
});

/** 4-3-3 슬롯을 주포지션이 딱 맞는 카드로 전부 채운 스쿼드 */
function perfectSquad(shared: Partial<PlayerCardData> = {}, grade = 1): SquadEntry[] {
  return DEFAULT_FORMATION.slots.map((s, i) =>
    entry(
      makeCard({ ...shared, name: `선수${i}`, spid: 300_000_100 + i, positions: [s.position] }),
      s.position,
      grade,
    ),
  );
}

describe('포메이션 정의', () => {
  it('모든 포메이션이 11명이고 골키퍼가 정확히 하나다', () => {
    for (const formation of FORMATIONS) {
      expect(formation.slots, formation.id).toHaveLength(11);
      expect(formation.slots.filter((s) => s.position === 'GK'), formation.id).toHaveLength(1);
    }
  });

  it('슬롯 ID 는 포메이션 안에서 겹치지 않는다', () => {
    for (const formation of FORMATIONS) {
      const ids = formation.slots.map((s) => s.id);
      expect(new Set(ids).size, formation.id).toBe(ids.length);
    }
  });

  it('좌표가 피치 밖으로 나가지 않는다', () => {
    for (const formation of FORMATIONS) {
      for (const s of formation.slots) {
        expect(s.x, `${formation.id}/${s.id}.x`).toBeGreaterThanOrEqual(0);
        expect(s.x, `${formation.id}/${s.id}.x`).toBeLessThanOrEqual(100);
        expect(s.y, `${formation.id}/${s.id}.y`).toBeGreaterThanOrEqual(0);
        expect(s.y, `${formation.id}/${s.id}.y`).toBeLessThanOrEqual(100);
      }
    }
  });

  it('골키퍼는 항상 우리 진영 가장 깊은 곳에 있다', () => {
    for (const formation of FORMATIONS) {
      const gk = formation.slots.find((s) => s.position === 'GK')!;
      const deepestOutfield = Math.max(
        ...formation.slots.filter((s) => s.position !== 'GK').map((s) => s.y),
      );
      expect(gk.y, formation.id).toBeGreaterThan(deepestOutfield);
    }
  });

  it('포메이션 ID 는 유일하고, 모르는 ID 는 기본값으로 떨어진다', () => {
    const ids = FORMATIONS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(findFormation('4-3-3').id).toBe('4-3-3');
    expect(findFormation('존재하지-않는-포메이션')).toBe(DEFAULT_FORMATION);
  });
});

describe('rateSquad — 빈 스쿼드', () => {
  it('0 으로 나누지 않고 전부 0 을 돌려준다', () => {
    const rating = rateSquad([]);
    expect(rating.filled).toBe(0);
    expect(rating.overall).toBe(0);
    expect(rating.rawOverall).toBe(0);
    expect(rating.totalValue).toBe(0);
    expect(rating.teamColors).toEqual([]);
    expect(rating.misfits).toEqual([]);
    expect(Object.values(rating.averageStats).every((v) => v === 0)).toBe(true);
    expect(Object.values(rating.lines).every((v) => v === 0)).toBe(true);
  });
});

describe('rateSquad — 기본 집계', () => {
  it('배치 인원을 센다', () => {
    expect(rateSquad(perfectSquad()).filled).toBe(11);
    expect(rateSquad(perfectSquad().slice(0, 5)).filled).toBe(5);
  });

  it('적합도 100% 스쿼드는 가중 평점과 순수 평점이 같다 (팀컬러 없을 때)', () => {
    const rating = rateSquad(perfectSquad());
    expect(rating.chemistryBonus).toBe(0);
    expect(rating.overall).toBe(rating.rawOverall);
  });

  it('포지션이 틀어지면 평점이 떨어지고 misfits 에 잡힌다', () => {
    const good = rateSquad(perfectSquad());

    const broken = perfectSquad();
    // 스트라이커를 센터백 자리에 세운다
    broken[2] = entry(makeCard({ name: '엉뚱한 선수', spid: 999, positions: ['ST'] }), 'LCB');
    const bad = rateSquad(broken);

    expect(bad.overall).toBeLessThan(good.overall);
    expect(bad.misfits).toHaveLength(1);
    expect(bad.misfits[0].name).toBe('엉뚱한 선수');
    expect(bad.misfits[0].fit).toBeLessThan(0.94);
  });

  it('서브 포지션(0.94)은 misfit 으로 보지 않는다', () => {
    const squad = perfectSquad();
    squad[9] = entry(makeCard({ name: '멀티 자원', spid: 998, positions: ['CF', 'ST'] }), 'ST');
    expect(rateSquad(squad).misfits).toHaveLength(0);
  });
});

describe('rateSquad — 팀컬러 보너스', () => {
  it('팀컬러가 붙으면 평점이 오른다', () => {
    const plain = rateSquad(perfectSquad());
    const united = rateSquad(perfectSquad({ club: '레알 마드리드' }));
    expect(united.chemistryBonus).toBeGreaterThan(0);
    expect(united.overall).toBeGreaterThan(plain.overall);
    expect(united.rawOverall).toBe(plain.rawOverall); // 순수 평점은 그대로
  });

  it('보너스는 8점에서 멈춘다', () => {
    // 클럽 3단계(3.6) + 국가 3단계(2.8) + 리그 3단계(2.2) = 8.6 → 8 로 잘림
    const stacked = rateSquad(
      perfectSquad({ club: '레알 마드리드', nation: '스페인', league: '라리가' }),
    );
    expect(stacked.chemistryBonus).toBe(8);
  });

  it('발동 직전에는 보너스가 없다', () => {
    const squad = perfectSquad();
    // 11명 중 3명만 같은 클럽 → 클럽 임계치(4) 미달
    for (let i = 0; i < 3; i += 1) squad[i].card = { ...squad[i].card, club: '아약스' };
    expect(rateSquad(squad).chemistryBonus).toBe(0);
  });
});

describe('rateSquad — 강화 반영', () => {
  it('강화하면 평점과 가치가 함께 오른다', () => {
    const plus1 = rateSquad(perfectSquad({}, 1));
    const plus10 = rateSquad(perfectSquad({}, 10));
    expect(plus10.rawOverall).toBe(plus1.rawOverall + 18); // OVR_GAIN_BY_GRADE 마지막 값
    expect(plus10.totalValue).toBeGreaterThan(plus1.totalValue);
    expect(plus10.averageStats.shooting).toBeGreaterThan(plus1.averageStats.shooting);
  });

  it('총 가치는 개별 가치의 합이다', () => {
    const squad = perfectSquad({}, 3);
    const rating = rateSquad(squad);
    expect(rating.totalValue).toBeGreaterThan(0);
    expect(rating.totalValue % 1000).toBe(0); // 1000 단위로 반올림된 값들의 합
  });
});

describe('rateSquad — 라인별 평균', () => {
  it('수비·미드·공격 세 라인이 모두 채워진다', () => {
    const rating = rateSquad(perfectSquad());
    expect(rating.lines.defence).toBeGreaterThan(0);
    expect(rating.lines.midfield).toBeGreaterThan(0);
    expect(rating.lines.attack).toBeGreaterThan(0);
  });

  it('한 라인만 배치하면 나머지 라인은 0 이다', () => {
    const onlyAttack = perfectSquad().filter((e) =>
      ['LW', 'ST', 'RW'].includes(e.slotPosition),
    );
    const rating = rateSquad(onlyAttack);
    expect(rating.filled).toBe(3);
    expect(rating.lines.attack).toBeGreaterThan(0);
    expect(rating.lines.defence).toBe(0);
    expect(rating.lines.midfield).toBe(0);
  });

  it('공격진의 공격력이 수비진보다 높다', () => {
    const rating = rateSquad(perfectSquad());
    expect(rating.averageStats.shooting).toBeGreaterThan(0);
    expect(rating.averageStats.defending).toBeGreaterThan(0);
  });
});
