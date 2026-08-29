import type { GkStats, HexStats, PlayerCardData } from './types';
import { clampGrade, estimateValue, MAX_GRADE } from './value';

/**
 * ── 강화 단계 시뮬레이션 ───────────────────────────────────
 *
 * FC 온라인의 카드는 +1 ~ +10 으로 강화되며 단계마다 오버롤과 세부 능력치가
 * 오른다. 정확한 상승 폭은 공개 API 로 제공되지 않으므로, 아래 표는
 * 커뮤니티에 알려진 경향(초반 완만 → 후반 급증)을 따른 **근사 모델**이다.
 * 숫자를 바꾸고 싶으면 이 파일의 상수 두 개만 고치면 된다.
 */

/** +1 대비 누적 오버롤 상승치 (index 0 = +1) */
export const OVR_GAIN_BY_GRADE: readonly number[] = [0, 1, 2, 3, 4, 6, 8, 11, 14, 18];

/** 누적 세부 능력치 상승 배율 */
const STAT_GAIN_BY_GRADE: readonly number[] = [
  1.0, 1.012, 1.025, 1.038, 1.052, 1.078, 1.105, 1.14, 1.185, 1.24,
];

const clampStat = (n: number) => Math.max(1, Math.min(130, Math.round(n)));

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

/** +1 ~ +10 전체 곡선 (가치 시뮬레이션 테이블용) */
export function enhanceCurve(card: PlayerCardData): EnhancedCard[] {
  return Array.from({ length: MAX_GRADE }, (_, i) => enhanceCard(card, i + 1));
}

/* ── 강화 성공 확률 (근사) ─────────────────────────────────── */

/**
 * n -> n+1 강화 성공 확률. 게임 내 공지 확률표를 그대로 옮긴 값이 아니라
 * "고강화일수록 급격히 낮아진다"는 경향만 반영한 근사치다.
 */
export const UPGRADE_SUCCESS_RATE: readonly number[] = [
  0.95, // +1 -> +2
  0.90, // +2 -> +3
  0.80, // +3 -> +4
  0.65, // +4 -> +5
  0.50, // +5 -> +6
  0.34, // +6 -> +7
  0.20, // +7 -> +8
  0.11, // +8 -> +9
  0.05, // +9 -> +10
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
