import type { GkStats, HexStats, PlayerCardData } from './types';
import {
  ENHANCEMENT_ODDS_LAYER,
  ENHANCEMENT_OVR_BONUS,
  ENHANCEMENT_STEPS,
  ENHANCEMENT_TABLE_LAYER,
} from '@/lib/fconline/rules';
import { mixLayers } from '@/lib/data/provenance';
import { CARD_OVR_LAYER, MAX_ESTIMATED_OVR } from './seasons';
import { clampGrade, estimateValue, VALUE_MODEL_LAYER } from './value';

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

/**
 * 이 파일이 내놓는 숫자들의 계층 — **손으로 고르지 않고 계산한다.**
 *
 * 지금까지 이 규칙은 주석과 JSX 리터럴로만 있었다. SquadSummary 에
 * `layer="project-estimate"` 라고 적어 두고 그 옆에 "섞여 있으므로 더
 * 약한 쪽으로 표시한다" 는 주석을 달아 두는 식이었다. 규칙은 맞았지만
 * 지키는 것은 사람의 습관이라, 새 화면을 만드는 사람에게는 따라오지
 * 않는다. 여기서 mixLayers 로 접어 두면 배지가 입력을 따라간다 —
 * 강화 표가 미검증으로 내려가면 오버롤 배지도 같이 내려간다.
 */
export const ENHANCED_CARD_LAYERS = {
  /** 추정 기본 오버롤(D) + 공식 상승분(B) → 약한 쪽인 D */
  ovr: mixLayers(CARD_OVR_LAYER, ENHANCEMENT_TABLE_LAYER),
  /** 세부 능력치는 공식 곡선에서 유도한 우리 추정 */
  stats: mixLayers(CARD_OVR_LAYER, ENHANCEMENT_TABLE_LAYER),
  /** 가치는 곱 중 하나가 우리 곡선이라 추정 */
  estimatedValue: mixLayers(CARD_OVR_LAYER, ENHANCEMENT_TABLE_LAYER, VALUE_MODEL_LAYER),
  /** 성공 확률은 넥슨이 공개한 값 하나만 쓴다 */
  odds: ENHANCEMENT_ODDS_LAYER,
} as const;

export interface EnhancedCard {
  grade: number;
  /**
   * 이 단계의 오버롤.
   *
   * 두 층이 섞여 있다: 기본 오버롤은 **우리 추정**(공개 API 에 없다),
   * 거기 얹은 상승분은 **공식 표**(ENHANCEMENT_OVR_BONUS). 화면에서는
   * 더 약한 쪽에 맞춰 추정으로 표기한다.
   */
  ovr: number;
  stats: HexStats;
  gk?: GkStats;
  /**
   * 이 프로젝트가 **추정한** BP 가치 — 계층 C.
   *
   * 관측된 거래가와 절대 섞이지 않는다. 이름이 estimated 로 시작하는
   * 이유가 그것이다: 어딘가에서 "관측이 없으면 추정값으로 채운다" 는
   * 코드가 생기면, 화면은 지어낸 값을 관측가라고 적게 된다. 관측이
   * 없으면 없다고 적는다(market/lookup.ts 의 stat: null).
   */
  estimatedValue: number;
  /** 직전 단계 대비 오버롤 상승 (공식 표에서 나온 차이) */
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
    estimatedValue: estimateValue({ ovr: card.ovr, seasonClassName: card.seasonName, grade: g }),
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
