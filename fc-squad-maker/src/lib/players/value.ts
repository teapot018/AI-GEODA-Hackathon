import { clampEnhancement, MAX_ENHANCEMENT } from '@/lib/fconline/rules';
import { seasonRule } from './seasons';

/**
 * ── BP 가치 추정 모델 ──────────────────────────────────────
 *
 * 넥슨 Open API 는 거래소 시세를 제공하지 않는다(개인 거래 내역만 준다).
 * 그래서 가치는 아래 세 요소를 곱해 "추정"한다. 실제 시세와는 다르며,
 * 화면에서도 항상 `추정` 으로 표기한다.
 *
 *   가치 = 오버롤 지수곡선 × 시즌 티어 배수 × 강화 단계 배수
 *
 * 실제 시세 API/크롤러를 붙일 경우 estimateValue() 만 갈아끼우면 된다.
 */

/**
 * 강화 단계별 가치 배수 — **계층 C (프로젝트 추정)**.
 *
 * 단계 수와 오버롤 상승량은 공식 규칙(fconline/rules.ts)에서 오지만, 그
 * 단계가 시장에서 몇 배에 거래되는지는 넥슨이 공개하지 않는다. 아래는
 * "고강화로 갈수록 급격히 비싸진다" 는 경향만 반영한 추정 곡선이고,
 * 화면에서는 항상 `추정` 으로 표기한다.
 *
 * +11~+13 은 특히 근거가 얕다. 13강 성공 확률이 1% 수준이라 거래 자체가
 * 극히 드물어 참고할 표본이 없다시피 하다. 관측값이 있으면 언제나 관측을
 * 먼저 쓰고(estimated 는 관측이 없을 때만), 그 사실을 화면에 적는다.
 */
export const GRADE_VALUE_MULTIPLIER: readonly number[] = [
  1,      // +1
  1.5,    // +2
  2.4,    // +3
  4.0,    // +4
  6.8,    // +5
  12,     // +6
  23,     // +7
  48,     // +8
  110,    // +9
  280,    // +10
  700,    // +11  ← 아래 셋은 표본이 거의 없는 구간이라 추정 정도가 특히 낮다
  1_800,  // +12
  5_000,  // +13
];

/**
 * 강화 단계 범위는 공식 규칙에서 가져온다.
 *
 * 예전에는 여기에 MAX_GRADE = 10 이 따로 적혀 있었다. 게임에 +13 이
 * 추가된 뒤에도 이 상수가 남아 있어서, 화면·API·테스트가 저마다 +10 을
 * 최고 강화로 알고 있었다. 규칙은 한 곳에만 둔다.
 */
export const MAX_GRADE = MAX_ENHANCEMENT;

export const clampGrade = clampEnhancement;

/**
 * 오버롤 -> 기준 BP (+1 기준, 티어 보정 전)
 *
 * pivot 은 카드 오버롤 표기와 함께 움직여야 한다. 표기를 FC 온라인 범위로
 * 올리면서(seasons.ts estimatedCardOvr) pivot 을 그대로 뒀더니 지수가 30 가까이 커져
 * 값이 수천 배로 튀었다. 표기를 올린 만큼 pivot 도 올려, **보이는 숫자만
 * 바뀌고 가격대는 그대로**가 되게 한다.
 */
export function baseValueOf(ovr: number): number {
  const pivot = 87;
  const raw = 900 * 1.315 ** Math.max(0, ovr - pivot);
  return Math.round(raw / 100) * 100;
}

export interface ValueInput {
  ovr: number;
  seasonClassName?: string;
  grade?: number;
}

export function estimateValue({ ovr, seasonClassName, grade = 1 }: ValueInput): number {
  const g = clampGrade(grade);
  const tier = seasonRule(seasonClassName);
  const value = baseValueOf(ovr) * tier.valueMultiplier * GRADE_VALUE_MULTIPLIER[g - 1];
  return Math.round(value / 1000) * 1000;
}

/** +1 ~ +13 가치 곡선을 통째로 */
export function valueCurve(ovr: number, seasonClassName?: string): number[] {
  return GRADE_VALUE_MULTIPLIER.map((_, index) =>
    estimateValue({ ovr, seasonClassName, grade: index + 1 }),
  );
}
