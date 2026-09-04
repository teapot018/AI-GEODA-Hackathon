import { describe, expect, it } from 'vitest';

import { makeCard } from './helpers';
import {
  sanitizePersistedSquad,
  SQUAD_STORE_VERSION,
  type PersistedSquad,
} from '@/lib/squad/store';
import { DEFAULT_FORMATION, findFormation } from '@/lib/squad/formations';
import { MAX_ENHANCEMENT } from '@/lib/fconline/rules';

/**
 * localStorage 에서 되살린 값 검증.
 *
 * 저장된 값은 **이 코드가 쓴 것이라는 보장이 없다** — 몇 달 전 버전이
 * 썼을 수도, 사람이 콘솔에서 고쳤을 수도 있다. 그대로 부으면 화면은
 * 그 값을 오늘 계산한 값처럼 보여 준다.
 */

const slots = DEFAULT_FORMATION.slots.map((s) => s.id);

const saved = (over: Partial<PersistedSquad> = {}): unknown => ({
  formationId: DEFAULT_FORMATION.id,
  assignments: {
    [slots[0]]: { card: makeCard({ spid: 1 }), grade: 5 },
    [slots[1]]: { card: makeCard({ spid: 2 }), grade: 1 },
  },
  imported: {
    matchId: 'm-1',
    nickname: '구단주',
    formationConfidence: 0.9,
    starters: 11,
    missing: 9,
  },
  ...over,
});

describe('sanitizePersistedSquad — 같은 버전', () => {
  it('멀쩡한 값은 그대로 살린다', () => {
    const out = sanitizePersistedSquad(saved());
    expect(Object.keys(out.assignments)).toHaveLength(2);
    expect(out.imported?.matchId).toBe('m-1');
    expect(out.formationId).toBe(DEFAULT_FORMATION.id);
  });

  it('없는 포메이션 ID 는 기본값으로 떨어진다', () => {
    const out = sanitizePersistedSquad(saved({ formationId: '없는-포메이션' }));
    expect(out.formationId).toBe(DEFAULT_FORMATION.id);
  });

  it('이 포메이션에 없는 자리에 붙은 카드는 버린다', () => {
    // 그릴 곳이 없는 배치다. 남겨 두면 "11명 중 12명" 같은 숫자가 나온다.
    const out = sanitizePersistedSquad(
      saved({
        assignments: {
          [slots[0]]: { card: makeCard({ spid: 1 }), grade: 1 },
          'slot-없음': { card: makeCard({ spid: 2 }), grade: 1 },
        } as never,
      }),
    );
    expect(Object.keys(out.assignments)).toEqual([slots[0]]);
  });

  it('카드 모양이 깨진 항목은 지어내지 않고 버린다', () => {
    const out = sanitizePersistedSquad(
      saved({
        assignments: {
          [slots[0]]: { card: { spid: 1 }, grade: 1 },
          [slots[1]]: { card: makeCard({ spid: 2 }), grade: 1 },
        } as never,
      }),
    );
    expect(Object.keys(out.assignments)).toEqual([slots[1]]);
  });

  it('강화 단계는 오늘 규칙으로 자른다', () => {
    /*
     * 저장 당시의 상한이 지금과 다를 수 있다. 저장된 값을 그대로 쓰면
     * 강화 곡선 배열 밖을 짚어 undefined 가 흘러 들어간다.
     */
    const out = sanitizePersistedSquad(
      saved({
        assignments: {
          [slots[0]]: { card: makeCard({ spid: 1 }), grade: 99 },
          [slots[1]]: { card: makeCard({ spid: 2 }), grade: 0 },
        } as never,
      }),
    );
    expect(out.assignments[slots[0]].grade).toBe(MAX_ENHANCEMENT);
    expect(out.assignments[slots[1]].grade).toBe(1);
  });

  it('한 명이라도 버렸으면 "이 경기에서 가져왔다" 표시를 지운다', () => {
    // 출처만 남으면 화면이 없는 근거를 대게 된다.
    const out = sanitizePersistedSquad(
      saved({
        assignments: {
          [slots[0]]: { card: makeCard({ spid: 1 }), grade: 1 },
          'slot-없음': { card: makeCard({ spid: 2 }), grade: 1 },
        } as never,
      }),
    );
    expect(out.imported).toBeNull();
  });

  it('출처 모양이 깨졌으면 null 로 둔다', () => {
    expect(sanitizePersistedSquad(saved({ imported: { matchId: 1 } as never })).imported).toBeNull();
    expect(sanitizePersistedSquad(saved({ imported: null })).imported).toBeNull();
  });

  it('저장소가 통째로 이상해도 빈 스쿼드로 시작한다', () => {
    for (const junk of [null, undefined, 'x', 42, [], { assignments: 'no' }]) {
      const out = sanitizePersistedSquad(junk);
      expect(out.assignments).toEqual({});
      expect(out.formationId).toBe(DEFAULT_FORMATION.id);
    }
  });
});

describe('sanitizePersistedSquad — 버전이 다를 때', () => {
  it('배치를 버리고 포메이션 선택만 남긴다', () => {
    /*
     * 이 프로젝트는 카드 오버롤 표기를 두 자리(92)에서 FC 온라인
     * 범위(121)로 옮긴 적이 있다. 저장되는 것은 spid 가 아니라 카드
     * 객체라, 그 전 스쿼드에는 두 자리 카드가 그대로 남아 있다. 거기에
     * 새 카드를 하나 넣으면 한 평균 안에 92 와 121 이 같이 들어간다.
     *
     * 저장된 값만 보고 어느 눈금인지 가릴 방법은 없다 — 92 도 121 도
     * 유효 범위(60~155) 안이다. 그래서 추측해서 고치지 않고 버린다.
     */
    const other = findFormation('4-3-3') ?? DEFAULT_FORMATION;
    const out = sanitizePersistedSquad(saved({ formationId: other.id }), {
      dropAssignments: true,
    });

    expect(out.assignments).toEqual({});
    expect(out.imported).toBeNull();
    expect(out.formationId).toBe(other.id);
  });

  it('옛 눈금 카드를 형식 검사만으로는 거를 수 없다는 사실을 못 박는다', () => {
    // 두 자리 오버롤 카드도 형식은 완벽하다. 그래서 버전 표시가 필요하다.
    const old = sanitizePersistedSquad(
      saved({
        assignments: { [slots[0]]: { card: makeCard({ ovr: 92 }), grade: 1 } } as never,
      }),
    );
    expect(old.assignments[slots[0]].card.ovr).toBe(92);
    expect(SQUAD_STORE_VERSION).toBeGreaterThanOrEqual(1);
  });
});
