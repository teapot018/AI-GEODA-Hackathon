import { archetypeOf } from '@/lib/players/estimate';
import type { PositionCode } from '@/lib/players/types';
import { FORMATIONS, type Formation } from './formations';

/**
 * ── 실제 경기 라인업 → 스쿼드 빌더 ─────────────────────────
 *
 * `/fconline/v1/match-detail` 의 player[] 는 { spId, spPosition, spGrade } 를
 * 준다. spPosition 은 넥슨 spposition.json 의 숫자 코드다.
 * 이걸 우리 PositionCode 로 옮기고, 나온 포지션 구성으로 포메이션을
 * 역추론하면 "그 경기에서 실제로 쓴 스쿼드" 를 그대로 빌더에 올릴 수 있다.
 *
 * 상대 스쿼드도 같은 방식으로 올릴 수 있어서, 나를 이긴 스쿼드를
 * 그대로 복사해 뜯어보는 용도로도 쓴다.
 */

/** spposition.json 코드표 (0~27 이 선발, 28 부터 교체/벤치) */
export const SP_POSITION: Readonly<Record<number, PositionCode>> = {
  0: 'GK',
  1: 'SW', 2: 'RWB', 3: 'RB', 4: 'RCB', 5: 'CB', 6: 'LCB', 7: 'LB', 8: 'LWB',
  9: 'RDM', 10: 'CDM', 11: 'LDM',
  12: 'RM', 13: 'RCM', 14: 'CM', 15: 'LCM', 16: 'LM',
  17: 'RAM', 18: 'CAM', 19: 'LAM',
  20: 'RF', 21: 'CF', 22: 'LF',
  23: 'RW', 24: 'RS', 25: 'ST', 26: 'LS', 27: 'LW',
};

/** 이 코드부터는 교체 명단이라 선발 스쿼드에 넣지 않는다. */
export const SUB_POSITION = 28;

export function positionCodeOf(spPosition: number): PositionCode | null {
  return SP_POSITION[spPosition] ?? null;
}

export function isStarter(spPosition: number): boolean {
  return spPosition >= 0 && spPosition < SUB_POSITION;
}

/**
 * 포지션끼리의 궁합. positionFit 과 달리 카드 없이 코드만으로 계산한다
 * (포메이션 역추론 단계에서는 아직 카드 정보를 안 붙였기 때문).
 */
export function positionAffinity(from: PositionCode, to: PositionCode): number {
  if (from === to) return 1;

  const fromGk = from === 'GK';
  const toGk = to === 'GK';
  // 골키퍼를 필드로 내보내거나 그 반대는 사실상 불가능하다.
  if (fromGk !== toGk) return 0;

  if (archetypeOf(from) === archetypeOf(to)) return 0.8;
  return 0.35;
}

export interface LineupEntry<T = unknown> {
  spid: number;
  spPosition: number;
  position: PositionCode;
  grade: number;
  payload?: T;
}

/** 선발 11명만 뽑아 PositionCode 를 붙인다. */
export function startersOf<T>(
  players: Array<{ spId: number; spPosition: number; spGrade: number; payload?: T }>,
): Array<LineupEntry<T>> {
  const entries: Array<LineupEntry<T>> = [];
  for (const player of players) {
    if (!isStarter(player.spPosition)) continue;
    const position = positionCodeOf(player.spPosition);
    if (!position) continue;
    entries.push({
      spid: player.spId,
      spPosition: player.spPosition,
      position,
      grade: player.spGrade,
      payload: player.payload,
    });
  }
  return entries;
}

export interface FormationFit<T> {
  formation: Formation;
  /** 슬롯당 평균 궁합 (0~1) */
  score: number;
  /** 배치되지 못하고 남은 선수 (인원이 슬롯보다 많을 때) */
  leftovers: Array<LineupEntry<T>>;
  placements: Array<{ slotId: string; entry: LineupEntry<T> }>;
}

/**
 * 한 포메이션에 라인업을 욕심껏(greedy) 배치한다.
 *
 * 슬롯을 "선택지가 적은 순" 이 아니라 정의 순서대로 도는 대신,
 * GK 처럼 궁합이 0/1 로 갈리는 자리가 앞에 오도록 포메이션 정의가
 * 이미 GK-수비-미드-공격 순이라 실질적으로 잘 맞는다.
 */
export function fitToFormation<T>(
  formation: Formation,
  lineup: Array<LineupEntry<T>>,
): FormationFit<T> {
  const remaining = [...lineup];
  const placements: Array<{ slotId: string; entry: LineupEntry<T> }> = [];
  let total = 0;

  for (const slot of formation.slots) {
    if (remaining.length === 0) break;

    let bestIndex = 0;
    let bestScore = -1;
    remaining.forEach((entry, index) => {
      const score = positionAffinity(entry.position, slot.position);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    placements.push({ slotId: slot.id, entry: remaining[bestIndex] });
    total += bestScore;
    remaining.splice(bestIndex, 1);
  }

  return {
    formation,
    score: placements.length > 0 ? total / placements.length : 0,
    leftovers: remaining,
    placements,
  };
}

/**
 * 라인업 구성에 가장 잘 맞는 포메이션을 고른다.
 * 동점이면 FORMATIONS 정의 순서가 앞선 쪽 — 결과가 매번 같아야 하기 때문.
 */
export function inferFormation<T>(lineup: Array<LineupEntry<T>>): FormationFit<T> {
  let best = fitToFormation(FORMATIONS[0], lineup);
  for (const formation of FORMATIONS.slice(1)) {
    const candidate = fitToFormation(formation, lineup);
    if (candidate.score > best.score) best = candidate;
  }
  return best;
}
