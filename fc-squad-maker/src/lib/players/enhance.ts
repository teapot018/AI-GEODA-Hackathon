import type { GkStats, HexStats, PlayerCardData } from './types';
import {
  ENHANCEMENT_OVR_BONUS,
  ENHANCEMENT_STEPS,
} from '@/lib/fconline/rules';
import { MAX_ESTIMATED_OVR } from './seasons';
import { clampGrade, estimateValue } from './value';

/**
 * ── 강화 단계 시뮬레이션 ───────────────────────────────────
 *
 * FC 온라인의 카드는 +1 ~ +13 으로 강화되며 단계마다 오버롤과 세부 능력치가
 * 오른다. 정확한 상승 폭은 공개 API 로 제공되지 않으므로, 아래 표는
 * 커뮤니티에 알려진 경향(초반 완만 → 후반 급증)을 따른 **근사 모델**이다.
 * 숫자를 바꾸고 싶으면 이 파일의 상수 두 개만 고치면 된다.
 */

/**
 * +1 대비 누적 오버롤 상승치 — **계층 B (공식 규칙)**.
 *
 * 예전에는 이 자리에 [0,1,2,3,4,6,8,11,14,18] 이라는 자체 근사표가 있었다.
 * 실제 게임과 여러 단계가 달랐고(+8 은 11 이 아니라 15, +10 은 18 이 아니라
 * 19), 무엇보다 +10 에서 끝나 있었다 — 게임에는 +13 까지 있다.
 * 지금은 공식 규칙 하나에서만 읽는다.
 */
export const OVR_GAIN_BY_GRADE: readonly number[] = ENHANCEMENT_STEPS.map(
  (grade) => ENHANCEMENT_OVR_BONUS[grade],
);

/**
 * 누적 세부 능력치 상승 배율 — **계층 C (프로젝트 추정)**.
 *
 * 넥슨은 강화가 세부 능력치를 얼마나 올리는지 공개하지 않는다. 오버롤
 * 상승량에 비례한다고 보고 공식 곡선에서 유도한다 — 표를 따로 적어 두면
 * 오버롤은 공식대로 오르는데 스탯은 옛 곡선을 따라가는 일이 생긴다.
 */
const STAT_GAIN_PER_OVR = 0.013;
const STAT_GAIN_BY_GRADE: readonly number[] = OVR_GAIN_BY_GRADE.map(
  (gain) => 1 + gain * STAT_GAIN_PER_OVR,
);

// 상한은 카드 오버롤 상한(seasons.ts)과 같은 자리에 둔다 — 13강까지 오른
// 카드의 스탯이 그보다 낮은 천장에 눌리면 안 된다.
const clampStat = (n: number) => Math.max(1, Math.min(MAX_ESTIMATED_OVR, Math.round(n)));

export interface EnhancedCard {
  grade: number;
  ovr: number;
  stats: HexStats;
  gk?: GkStats;
  /** 추정 BP 가치 */
  value: number;
  /** 직전 단계 대비 오버롤 상승 */
  ovrDelta: number;
}

function scaleHex(stats: HexStats, factor: number): HexStats {
  return {
    pace: clampStat(stats.pace * factor),
    shooting: clampStat(stats.shooting * factor),
    passing: clampStat(stats.passing * factor),
    dribbling: clampStat(stats.dribbling * factor),
    defending: clampStat(stats.defending * factor),
    physical: clampStat(stats.physical * factor),
  };
}

function scaleGk(stats: GkStats, factor: number): GkStats {
  return {
    diving: clampStat(stats.diving * factor),
    handling: clampStat(stats.handling * factor),
    kicking: clampStat(stats.kicking * factor),
    reflexes: clampStat(stats.reflexes * factor),
    speed: clampStat(stats.speed * factor),
    positioning: clampStat(stats.positioning * factor),
  };
}

/** 카드 1장의 특정 강화 단계 상태 */
export function enhanceCard(card: PlayerCardData, grade: number): EnhancedCard {
  const g = clampGrade(grade);
  const gain = OVR_GAIN_BY_GRADE[g - 1];
  const factor = STAT_GAIN_BY_GRADE[g - 1];

  return {
    grade: g,
    ovr: card.ovr + gain,
    stats: scaleHex(card.stats, factor),
    gk: card.gk ? scaleGk(card.gk, factor) : undefined,
    value: estimateValue({ ovr: card.ovr, seasonClassName: card.seasonName, grade: g }),
    ovrDelta: g === 1 ? 0 : gain - OVR_GAIN_BY_GRADE[g - 2],
  };
}

/** +1 ~ +13 전체 곡선 (가치 시뮬레이션 테이블용) */
export function enhanceCurve(card: PlayerCardData): EnhancedCard[] {
  return ENHANCEMENT_STEPS.map((grade) => enhanceCard(card, grade));
}

/* ── 강화 성공 확률 (근사) ─────────────────────────────────── */

/**
 * n -> n+1 강화 성공 확률 — **계층 C (프로젝트 추정)**.
 *
 * 넥슨 공지 확률표를 그대로 옮긴 값이 **아니다**. "고강화일수록 급격히
 * 낮아진다" 는 경향만 반영한 근사치이며, 화면에서 실제 강화 확률처럼
 * 보이지 않게 표기해야 한다. 공식 확률표를 넣을 때는 이 배열을 통째로
 * 갈아끼우고 이름도 OFFICIAL_ 로 바꾼다.
 */
export const UPGRADE_SUCCESS_RATE: readonly number[] = [
  0.95,  // +1 -> +2
  0.90,  // +2 -> +3
  0.80,  // +3 -> +4
  0.65,  // +4 -> +5
  0.50,  // +5 -> +6
  0.34,  // +6 -> +7
  0.20,  // +7 -> +8
  0.11,  // +8 -> +9
  0.05,  // +9 -> +10
  0.03,  // +10 -> +11
  0.02,  // +11 -> +12
  0.01,  // +12 -> +13  ← 13강 1% 는 공개 확률표와 대체로 맞는 유일한 칸이다
];

/**
 * from 단계에서 to 단계까지 "한 번도 실패 없이" 올릴 확률과,
 * 기대 시도 횟수(실패 시 카드 소멸 없이 재시도한다고 가정).
 */
export function upgradeOdds(from: number, to: number) {
  const a = clampGrade(from);
  const b = clampGrade(to);
  if (b <= a) return { straightRate: 1, expectedAttempts: 0, steps: [] as number[] };

  const steps: number[] = [];
  let straightRate = 1;
  let expectedAttempts = 0;

  for (let g = a; g < b; g += 1) {
    const rate = UPGRADE_SUCCESS_RATE[g - 1] ?? 0.05;
    steps.push(rate);
    straightRate *= rate;
    expectedAttempts += 1 / rate;
  }

  return { straightRate, expectedAttempts, steps };
}
