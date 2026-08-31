import { describe, expect, it } from 'vitest';

import { FORMATIONS, findFormation } from '@/lib/squad/formations';
import {
  fitToFormation,
  inferFormation,
  isStarter,
  positionAffinity,
  positionCodeOf,
  SP_POSITION,
  startersOf,
  SUB_POSITION,
  type LineupEntry,
} from '@/lib/squad/import';
import type { PositionCode } from '@/lib/players/types';

/** spposition 코드 → 선발 라인업 항목 */
function lineup(codes: number[]): Array<LineupEntry<undefined>> {
  return startersOf(
    codes.map((spPosition, i) => ({ spId: 1000 + i, spPosition, spGrade: 1 })),
  );
}

describe('SP_POSITION 코드표', () => {
  it('0 은 골키퍼', () => {
    expect(SP_POSITION[0]).toBe('GK');
  });

  it('넥슨 4-3-3 기본 라인업 코드가 기대한 포지션으로 매핑된다', () => {
    // mock.ts 의 FORMATION_POSITIONS 와 같은 대응이어야 한다.
    expect(positionCodeOf(7)).toBe('LB');
    expect(positionCodeOf(6)).toBe('LCB');
    expect(positionCodeOf(4)).toBe('RCB');
    expect(positionCodeOf(3)).toBe('RB');
    expect(positionCodeOf(14)).toBe('CM');
    expect(positionCodeOf(25)).toBe('ST');
    expect(positionCodeOf(23)).toBe('RW');
    expect(positionCodeOf(27)).toBe('LW');
  });

  it('0~27 이 빠짐없이 채워져 있다', () => {
    for (let code = 0; code < SUB_POSITION; code += 1) {
      expect(positionCodeOf(code), `코드 ${code}`).not.toBeNull();
    }
  });

  it('모르는 코드는 null', () => {
    expect(positionCodeOf(99)).toBeNull();
  });
});

describe('isStarter', () => {
  it('0~27 은 선발', () => {
    expect(isStarter(0)).toBe(true);
    expect(isStarter(27)).toBe(true);
  });

  it('28 부터는 교체 명단', () => {
    expect(isStarter(SUB_POSITION)).toBe(false);
    expect(isStarter(35)).toBe(false);
  });

  it('음수는 선발이 아니다', () => {
    expect(isStarter(-1)).toBe(false);
  });
});

describe('positionAffinity', () => {
  it('같은 포지션은 1', () => {
    expect(positionAffinity('ST', 'ST')).toBe(1);
  });

  it('같은 계열이면 높게 준다', () => {
    expect(positionAffinity('LCB', 'RCB')).toBe(0.8);
    expect(positionAffinity('LW', 'RW')).toBe(0.8);
  });

  it('계열이 다르면 낮게 준다', () => {
    expect(positionAffinity('ST', 'CB')).toBe(0.35);
  });

  it('골키퍼와 필드 플레이어는 서로 못 선다', () => {
    expect(positionAffinity('GK', 'ST')).toBe(0);
    expect(positionAffinity('CB', 'GK')).toBe(0);
  });
});

describe('startersOf', () => {
  it('교체 명단을 걸러낸다', () => {
    const entries = startersOf([
      { spId: 1, spPosition: 0, spGrade: 1 },
      { spId: 2, spPosition: SUB_POSITION, spGrade: 1 },
      { spId: 3, spPosition: 25, spGrade: 1 },
    ]);
    expect(entries.map((e) => e.spid)).toEqual([1, 3]);
  });

  it('알 수 없는 코드도 걸러낸다', () => {
    expect(startersOf([{ spId: 1, spPosition: 99, spGrade: 1 }])).toEqual([]);
  });

  it('강화 등급과 임의 payload 를 함께 나른다', () => {
    const [entry] = startersOf([
      { spId: 1, spPosition: 25, spGrade: 7, payload: { rating: 8.5 } },
    ]);
    expect(entry.grade).toBe(7);
    expect(entry.position).toBe('ST');
    expect(entry.payload).toEqual({ rating: 8.5 });
  });
});

describe('fitToFormation', () => {
  it('완벽히 맞는 라인업은 점수 1', () => {
    const formation = findFormation('4-3-3');
    const codes = formation.slots.map(
      (slot) =>
        Number(
          Object.keys(SP_POSITION).find(
            (key) => SP_POSITION[Number(key)] === (slot.position as PositionCode),
          ),
        ),
    );
    const fit = fitToFormation(formation, lineup(codes));

    expect(fit.score).toBe(1);
    expect(fit.placements).toHaveLength(11);
    expect(fit.leftovers).toHaveLength(0);
  });

  it('골키퍼는 GK 슬롯으로 간다', () => {
    const formation = findFormation('4-3-3');
    const fit = fitToFormation(formation, lineup([0, 25, 14]));
    const gk = fit.placements.find((p) => p.slotId === 'gk');

    expect(gk?.entry.position).toBe('GK');
  });

  it('선수가 슬롯보다 많으면 남는다', () => {
    const formation = findFormation('4-3-3');
    const fit = fitToFormation(formation, lineup(Array(13).fill(14)));

    expect(fit.placements).toHaveLength(11);
    expect(fit.leftovers).toHaveLength(2);
  });

  it('선수가 적으면 채운 만큼만 배치한다', () => {
    const fit = fitToFormation(findFormation('4-3-3'), lineup([0, 25]));
    expect(fit.placements).toHaveLength(2);
  });

  it('빈 라인업은 점수 0', () => {
    const fit = fitToFormation(findFormation('4-3-3'), []);
    expect(fit.score).toBe(0);
    expect(fit.placements).toEqual([]);
  });

  it('한 선수가 두 슬롯에 들어가지 않는다', () => {
    const fit = fitToFormation(findFormation('4-3-3'), lineup([0, 25, 14, 4, 3]));
    const spids = fit.placements.map((p) => p.entry.spid);
    expect(new Set(spids).size).toBe(spids.length);
  });
});

describe('inferFormation', () => {
  it('4-3-3 라인업에서 4-3-3 을 찾아낸다', () => {
    // GK, LB, LCB, RCB, RB, LCM, CM, RCM, LW, ST, RW
    const fit = inferFormation(lineup([0, 7, 6, 4, 3, 15, 14, 13, 27, 25, 23]));
    expect(fit.formation.id).toBe('4-3-3');
  });

  it('4-2-3-1 라인업에서 4-2-3-1 을 찾아낸다', () => {
    // GK, LB, LCB, RCB, RB, LDM, RDM, LAM, CAM, RAM, ST
    const fit = inferFormation(lineup([0, 7, 6, 4, 3, 11, 9, 19, 18, 17, 25]));
    expect(fit.formation.id).toBe('4-2-3-1');
  });

  it('스리백 + 윙백 라인업은 스리백 포메이션을 고른다', () => {
    // GK, LCB, CB, RCB, LWB, CDM, RWB, LCM, RCM, LS, RS
    const fit = inferFormation(lineup([0, 6, 5, 4, 8, 10, 2, 15, 13, 26, 24]));
    expect(['3-5-2', '5-3-2']).toContain(fit.formation.id);
  });

  it('입력이 같으면 결과도 같다 (동점은 정의 순서로 깬다)', () => {
    const entries = lineup([0, 14, 14, 14]);
    expect(inferFormation(entries).formation.id).toBe(inferFormation(entries).formation.id);
  });

  it('어떤 라인업에서도 알려진 포메이션 중 하나를 돌려준다', () => {
    const fit = inferFormation(lineup([0, 1, 2, 3]));
    expect(FORMATIONS.map((f) => f.id)).toContain(fit.formation.id);
  });

  it('빈 라인업이어도 터지지 않는다', () => {
    expect(inferFormation([]).formation.id).toBe(FORMATIONS[0].id);
  });
});
