import {
  ENHANCE_TEAMCOLOR_COUNTS,
  ENHANCE_TEAMCOLOR_TIERS,
  ENHANCE_TEAMCOLOR_VERIFIED,
} from '@/lib/fconline/rules';
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

/* ── 강화 팀컬러 (물결) ────────────────────────────────── */

/**
 * 강화 단계로 발동하는 팀컬러.
 *
 * 위 클럽/국가/리그 팀컬러와 축이 다르다. 저쪽은 "누구를 모았나" 고
 * 이쪽은 "얼마나 강화했나" 다. 실제 FC 온라인에서 스쿼드를 말할 때
 * 먼저 나오는 "은카", "8금" 이 바로 이쪽이라, 이 축이 없으면 우리
 * 스쿼드 점수는 사람들이 실제로 신경 쓰는 것을 세지 않는 셈이다.
 *
 * 규칙표는 fconline/rules.ts 에 있고 **미검증**이다(넥슨 공지 원문을
 * 이 환경에서 열지 못했다). 그래서 결과에도 그 사실을 달아 보낸다.
 */
export interface EnhanceTeamColor {
  /** 단계 이름 (예: '금빛 물결') */
  name: string;
  /** 이 단계를 만족시킨 최소 강화 등급 */
  minGrade: number;
  /** 그 등급 이상인 선수 수 */
  count: number;
  /** 5명 조건인지 8명 조건인지 */
  requirement: 5 | 8;
  /** 전 능력치 보너스 */
  bonus: number;
  /** 이 표가 공식 자료로 검증됐는가 — 지금은 아니다 */
  verified: boolean;
}

/**
 * 조건을 만족하는 단계 중 **가장 센 것 하나**를 고른다.
 *
 * 물결은 중첩되지 않는다. 8강 8명이면 금빛 2단계 하나를 받지, 동빛·은빛까지
 * 같이 받지 않는다. 여러 개를 더하면 실제 게임보다 후한 점수가 나온다.
 */
export function computeEnhanceTeamColor(
  entries: Array<{ grade: number }>,
): EnhanceTeamColor | null {
  let best: EnhanceTeamColor | null = null;

  for (const tier of ENHANCE_TEAMCOLOR_TIERS) {
    const count = entries.filter((e) => e.grade >= tier.minGrade).length;

    // 인원이 많은 조건(8명)이 더 세므로 먼저 본다.
    const candidates: Array<{ requirement: 5 | 8; bonus: number; need: number }> = [
      { requirement: 8, bonus: tier.bonusAt8, need: ENHANCE_TEAMCOLOR_COUNTS.tier2 },
      { requirement: 5, bonus: tier.bonusAt5, need: ENHANCE_TEAMCOLOR_COUNTS.tier1 },
    ];

    for (const c of candidates) {
      // bonus 0 은 그 단계에 그 인원 조건이 없다는 뜻이다(동빛 8명 등).
      if (c.bonus === 0 || count < c.need) continue;
      if (!best || c.bonus > best.bonus) {
        best = {
          name: tier.name,
          minGrade: tier.minGrade,
          count,
          requirement: c.requirement,
          bonus: c.bonus,
          verified: ENHANCE_TEAMCOLOR_VERIFIED,
        };
      }
      break; // 이 단계에서는 더 센 인원 조건을 이미 잡았다
    }
  }

  return best;
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
