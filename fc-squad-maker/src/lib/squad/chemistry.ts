import { archetypeOf } from '@/lib/players/estimate';
import type { PlayerCardData, PositionCode } from '@/lib/players/types';

/**
 * ── 팀컬러 / 포지션 적합도 (자체 근사 로직) ────────────────
 *
 * FC 온라인의 실제 팀컬러는 넥슨이 정해 둔 고정 조합 목록(예: "리버풀 5인")
 * 이며 공개 API 로 제공되지 않는다. 여기서는 같은 클럽/국가/리그 인원 수를
 * 세어 임계치를 넘으면 팀컬러가 발동한 것으로 보는 근사 규칙을 쓴다.
 * 실제 게임 수치와 다르며, 스쿼드 구성의 방향을 잡는 용도다.
 */

/** 포지션 적합도: 1.0 = 주포지션 */
export function positionFit(card: PlayerCardData, slotPosition: PositionCode): number {
  if (card.positions.length === 0) return 0.6;
  if (card.positions[0] === slotPosition) return 1;
  if (card.positions.includes(slotPosition)) return 0.94;

  const slotType = archetypeOf(slotPosition);
  if (card.positions.some((p) => archetypeOf(p) === slotType)) return 0.82;

  // GK 를 필드에 세우거나 그 반대는 크게 깎는다.
  const cardIsGk = card.positions[0] === 'GK';
  const slotIsGk = slotPosition === 'GK';
  if (cardIsGk !== slotIsGk) return 0.35;

  return 0.62;
}

export function fitLabel(fit: number): { text: string; tone: 'good' | 'warn' | 'bad' } {
  if (fit >= 0.94) return { text: '적합', tone: 'good' };
  if (fit >= 0.8) return { text: '보통', tone: 'warn' };
  return { text: '부적합', tone: 'bad' };
}

export type TeamColorKind = 'club' | 'nation' | 'league';

export interface TeamColor {
  kind: TeamColorKind;
  label: string;
  count: number;
  /** 1~3 단계 */
  level: number;
  /** 스쿼드 종합 점수에 더할 보너스 */
  bonus: number;
}

/** 종류별 발동 인원 임계치 (level 1, 2, 3) */
const THRESHOLDS: Record<TeamColorKind, [number, number, number]> = {
  club: [4, 6, 8],
  nation: [4, 6, 9],
  league: [5, 8, 11],
};

const BONUS_BY_LEVEL: Record<TeamColorKind, [number, number, number]> = {
  club: [1.2, 2.4, 3.6],
  nation: [0.9, 1.8, 2.8],
  league: [0.7, 1.5, 2.2],
};

const KIND_LABEL: Record<TeamColorKind, string> = {
  club: '클럽',
  nation: '국가',
  league: '리그',
};

function countBy(cards: PlayerCardData[], pick: (c: PlayerCardData) => string | undefined) {
  const counts = new Map<string, number>();
  for (const card of cards) {
    const key = pick(card);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function levelOf(kind: TeamColorKind, count: number): number {
  const [t1, t2, t3] = THRESHOLDS[kind];
  if (count >= t3) return 3;
  if (count >= t2) return 2;
  if (count >= t1) return 1;
  return 0;
}

export function computeTeamColors(cards: PlayerCardData[]): TeamColor[] {
  const groups: Array<[TeamColorKind, Map<string, number>]> = [
    ['club', countBy(cards, (c) => c.club)],
    ['nation', countBy(cards, (c) => c.nation)],
    ['league', countBy(cards, (c) => c.league)],
  ];

  const result: TeamColor[] = [];
  for (const [kind, counts] of groups) {
    for (const [label, count] of counts) {
      const level = levelOf(kind, count);
      if (level === 0) continue;
      result.push({
        kind,
        label: `${label} (${KIND_LABEL[kind]})`,
        count,
        level,
        bonus: BONUS_BY_LEVEL[kind][level - 1],
      });
    }
  }

  return result.sort((a, b) => b.level - a.level || b.count - a.count);
}

/** 팀컬러까지 몇 명 남았는지 안내 */
export interface TeamColorHint {
  label: string;
  count: number;
  need: number;
}

export function teamColorHints(cards: PlayerCardData[], limit = 3): TeamColorHint[] {
  const hints: TeamColorHint[] = [];
  const groups: Array<[TeamColorKind, Map<string, number>]> = [
    ['club', countBy(cards, (c) => c.club)],
    ['nation', countBy(cards, (c) => c.nation)],
    ['league', countBy(cards, (c) => c.league)],
  ];

  for (const [kind, counts] of groups) {
    for (const [label, count] of counts) {
      const [t1] = THRESHOLDS[kind];
      const need = t1 - count;
      if (need > 0 && need <= 2) {
        hints.push({ label: `${label} (${KIND_LABEL[kind]})`, count, need });
      }
    }
  }

  return hints.sort((a, b) => a.need - b.need).slice(0, limit);
}
