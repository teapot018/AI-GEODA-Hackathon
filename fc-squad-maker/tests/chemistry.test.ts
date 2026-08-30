import { describe, expect, it } from 'vitest';
import {
  computeTeamColors,
  fitLabel,
  positionFit,
  teamColorHints,
} from '@/lib/squad/chemistry';
import { makeCard, makeSquadOf } from './helpers';

/**
 * 팀컬러 임계치는 화면에 "4명부터 발동" 이라고 대놓고 써 있는 숫자다.
 * 코드와 안내 문구가 어긋나면 사용자는 스쿼드를 잘못 짠다.
 * 그래서 경계값 바로 아래/위를 전부 못 박는다.
 */
describe('computeTeamColors — 발동 임계치', () => {
  it('클럽은 4 / 6 / 8 명에서 단계가 오른다', () => {
    const at = (n: number) => computeTeamColors(makeSquadOf(n, { club: '레알 마드리드' }));

    expect(at(3)).toHaveLength(0);
    expect(at(4)[0]).toMatchObject({ kind: 'club', level: 1, count: 4 });
    expect(at(5)[0].level).toBe(1);
    expect(at(6)[0].level).toBe(2);
    expect(at(7)[0].level).toBe(2);
    expect(at(8)[0].level).toBe(3);
    expect(at(11)[0].level).toBe(3);
  });

  it('국가는 4 / 6 / 9 명', () => {
    const at = (n: number) => computeTeamColors(makeSquadOf(n, { nation: '브라질' }));
    expect(at(3)).toHaveLength(0);
    expect(at(4)[0].level).toBe(1);
    expect(at(6)[0].level).toBe(2);
    expect(at(8)[0].level).toBe(2); // 9명이 되기 전까지는 아직 2단계
    expect(at(9)[0].level).toBe(3);
  });

  it('리그는 5 / 8 / 11 명', () => {
    const at = (n: number) => computeTeamColors(makeSquadOf(n, { league: '프리미어리그' }));
    expect(at(4)).toHaveLength(0);
    expect(at(5)[0].level).toBe(1);
    expect(at(8)[0].level).toBe(2);
    expect(at(10)[0].level).toBe(2);
    expect(at(11)[0].level).toBe(3);
  });

  it('단계가 오르면 보너스도 커진다', () => {
    const bonusAt = (n: number) => computeTeamColors(makeSquadOf(n, { club: 'FC 서울' }))[0].bonus;
    expect(bonusAt(6)).toBeGreaterThan(bonusAt(4));
    expect(bonusAt(8)).toBeGreaterThan(bonusAt(6));
  });

  it('한 스쿼드에서 클럽·국가·리그가 동시에 발동할 수 있다', () => {
    const colors = computeTeamColors(
      makeSquadOf(5, { club: '리버풀', nation: '잉글랜드', league: '프리미어리그' }),
    );
    expect(colors.map((c) => c.kind).sort()).toEqual(['club', 'league', 'nation']);
  });

  it('단계 내림차순 → 인원 내림차순으로 정렬한다', () => {
    const cards = [
      ...makeSquadOf(8, { club: '바르셀로나', league: '라리가' }),
      ...makeSquadOf(4, { club: '첼시', league: '라리가' }),
    ];
    const colors = computeTeamColors(cards);

    // 라리가 12명(3단계) · 바르셀로나 8명(3단계) · 첼시 4명(1단계)
    expect(colors.map((c) => [c.label, c.level, c.count])).toEqual([
      ['라리가 (리그)', 3, 12],
      ['바르셀로나 (클럽)', 3, 8],
      ['첼시 (클럽)', 1, 4],
    ]);

    for (let i = 1; i < colors.length; i += 1) {
      const prev = colors[i - 1];
      const cur = colors[i];
      expect(prev.level > cur.level || (prev.level === cur.level && prev.count >= cur.count)).toBe(
        true,
      );
    }
  });

  it('소속이 비어 있는 카드는 세지 않는다', () => {
    expect(computeTeamColors(makeSquadOf(11, {}))).toHaveLength(0);
    expect(computeTeamColors([])).toHaveLength(0);
  });

  it('라벨에 종류를 붙여 준다', () => {
    const [color] = computeTeamColors(makeSquadOf(4, { club: '유벤투스' }));
    expect(color.label).toBe('유벤투스 (클럽)');
  });
});

describe('teamColorHints — "몇 명 더" 안내', () => {
  it('2명 이내로 남았을 때만 알려 준다', () => {
    const hints = teamColorHints([
      ...makeSquadOf(3, { club: '아스날' }), // 1명 남음
      ...makeSquadOf(2, { club: '토트넘' }), // 2명 남음
      ...makeSquadOf(1, { club: '뉴캐슬' }), // 3명 남음 → 제외
    ]);
    const labels = hints.map((h) => h.label);
    expect(labels).toContain('아스날 (클럽)');
    expect(labels).toContain('토트넘 (클럽)');
    expect(labels).not.toContain('뉴캐슬 (클럽)');
  });

  it('가까운 것부터 보여 주고 개수를 제한한다', () => {
    const hints = teamColorHints([
      ...makeSquadOf(2, { club: 'A' }),
      ...makeSquadOf(3, { club: 'B' }),
      ...makeSquadOf(3, { club: 'C' }),
      ...makeSquadOf(3, { club: 'D' }),
    ]);
    expect(hints).toHaveLength(3);
    expect(hints[0].need).toBe(1);
    for (let i = 1; i < hints.length; i += 1) {
      expect(hints[i].need).toBeGreaterThanOrEqual(hints[i - 1].need);
    }
  });

  it('이미 발동한 조합은 안내에서 빠진다', () => {
    const hints = teamColorHints(makeSquadOf(4, { club: '맨시티' }));
    expect(hints.map((h) => h.label)).not.toContain('맨시티 (클럽)');
  });
});

describe('positionFit — 슬롯 적합도', () => {
  it('주포지션이면 1.0', () => {
    expect(positionFit(makeCard({ positions: ['ST', 'CF'] }), 'ST')).toBe(1);
  });

  it('서브 포지션이면 0.94', () => {
    expect(positionFit(makeCard({ positions: ['ST', 'CF'] }), 'CF')).toBe(0.94);
  });

  it('같은 계열이면 0.82', () => {
    // ST 와 RS 는 둘 다 스트라이커 계열
    expect(positionFit(makeCard({ positions: ['ST'] }), 'RS')).toBe(0.82);
    // CB 와 RCB 는 둘 다 센터백 계열
    expect(positionFit(makeCard({ positions: ['CB'] }), 'RCB')).toBe(0.82);
  });

  it('골키퍼를 필드에 세우면 크게 깎는다', () => {
    expect(positionFit(makeCard({ positions: ['GK'] }), 'CB')).toBe(0.35);
    expect(positionFit(makeCard({ positions: ['ST'] }), 'GK')).toBe(0.35);
  });

  it('골키퍼끼리는 1.0', () => {
    expect(positionFit(makeCard({ positions: ['GK'] }), 'GK')).toBe(1);
  });

  it('계열이 아예 다르면 0.62', () => {
    expect(positionFit(makeCard({ positions: ['ST'] }), 'CB')).toBe(0.62);
  });

  it('포지션 정보가 없으면 중간값으로 둔다', () => {
    expect(positionFit(makeCard({ positions: [] }), 'ST')).toBe(0.6);
  });

  it('적합도는 항상 0 과 1 사이', () => {
    const slots = ['GK', 'CB', 'RB', 'CDM', 'CM', 'CAM', 'RW', 'ST'] as const;
    const cards = [['GK'], ['CB'], ['LB'], ['CDM'], ['CM'], ['CAM'], ['LW'], ['ST'], []] as const;
    for (const positions of cards) {
      for (const slot of slots) {
        const fit = positionFit(makeCard({ positions: [...positions] }), slot);
        expect(fit).toBeGreaterThan(0);
        expect(fit).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('fitLabel — 적합도를 말로', () => {
  it('경계값에서 문구가 바뀐다', () => {
    expect(fitLabel(1).tone).toBe('good');
    expect(fitLabel(0.94).tone).toBe('good');
    expect(fitLabel(0.82).tone).toBe('warn');
    expect(fitLabel(0.8).tone).toBe('warn');
    expect(fitLabel(0.62).tone).toBe('bad');
    expect(fitLabel(0.35).tone).toBe('bad');
  });
});
