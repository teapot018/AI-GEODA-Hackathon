/**
 * ══════════════════════════════════════════════════════════
 *  계층 B — FC 온라인 공식 게임 규칙
 * ══════════════════════════════════════════════════════════
 *
 * 이 파일에는 **넥슨이 공지·공개한 게임 규칙만** 들어간다.
 * 이 프로젝트가 만들어 낸 추정값은 여기 두지 않는다(그건 계층 C —
 * players/value.ts, players/estimate.ts 등).
 *
 * 세 계층을 섞지 않는 것이 이 프로젝트의 제1원칙이다:
 *
 *   A. 넥슨 공식 API 응답값      (nexon/types.ts 가 그대로 담는 것)
 *   B. 게임 공식 규칙            ← 이 파일
 *   C. 프로젝트 자체 추정        (estimated* 접두사를 붙인다)
 *
 * 규칙이 바뀌면 이 파일 하나만 고친다. 같은 숫자를 여러 곳에 적어 두면
 * 한 곳만 고쳤을 때 화면마다 다른 말을 하게 된다.
 */

/* ── 강화 ──────────────────────────────────────────────── */

/**
 * 강화 최고 단계.
 *
 * 2024 겨울 업데이트로 +11~+13 이 추가되기 전까지 상한은 +10 이었다.
 * 이 프로젝트도 한동안 +10 을 최고 강화로 다뤘는데, 그건 그때의 게임이지
 * 지금의 게임이 아니다.
 */
export const MAX_ENHANCEMENT = 13;
export const MIN_ENHANCEMENT = 1;

/**
 * 강화 단계별 **누적** 오버롤 상승량 (+1 대비).
 *
 * 단계별 증가분을 누적한 값이다:
 *   1→2 +1, 2→3 +1, 3→4 +2, 4→5 +2, 5→6 +2, 6→7 +3,
 *   7→8 +4, 8→9 +2, 9→10 +2, 10→11 +2, 11→12 +3, 12→13 +3
 *
 * 8강 구간(+4)이 유독 큰 것과 그 뒤가 다시 +2 로 내려가는 것은 실제
 * 게임의 곡선이 그렇기 때문이지 오타가 아니다.
 *
 * 출처: 넥슨 공지 및 커뮤니티 정리표에서 교차 확인 (2026-09 기준).
 * 넥슨 도메인이 이 개발 환경에서 차단돼 공식 공지 원문을 직접 열어
 * 대조하지는 못했다 — 값이 바뀌면 여기만 고치면 된다.
 */
export const ENHANCEMENT_OVR_BONUS: Readonly<Record<number, number>> = {
  1: 0,
  2: 1,
  3: 2,
  4: 4,
  5: 6,
  6: 8,
  7: 11,
  8: 15,
  9: 17,
  10: 19,
  11: 21,
  12: 24,
  13: 27,
} as const;

/** +1 ~ +13 을 순서대로. UI 사다리와 반복문이 함께 쓴다. */
export const ENHANCEMENT_STEPS: readonly number[] = Object.keys(ENHANCEMENT_OVR_BONUS)
  .map(Number)
  .sort((a, b) => a - b);

/** 게임에 존재하는 강화 단계인가 */
export function isValidEnhancement(grade: number): boolean {
  return Number.isInteger(grade) && grade >= MIN_ENHANCEMENT && grade <= MAX_ENHANCEMENT;
}

export function clampEnhancement(grade: number): number {
  return Math.max(MIN_ENHANCEMENT, Math.min(MAX_ENHANCEMENT, Math.round(grade)));
}

/** 이 단계의 누적 오버롤 상승량. 범위 밖이면 가장 가까운 단계로 자른다. */
export function enhancementOvrBonus(grade: number): number {
  return ENHANCEMENT_OVR_BONUS[clampEnhancement(grade)];
}

/* ── 이적시장 수수료 ───────────────────────────────────── */

/**
 * 판매 기본 수수료율.
 *
 * 100만에 팔면 40만을 떼고 60만이 들어온다. PC방·TOP CLASS·쿠폰의 %는
 * 수수료율이 아니라 **이 수수료에서 깎아 주는 감면율**이고, 곱이 아니라
 * 더해서 적용된다(trade/fee.ts 참고).
 */
export const BASE_TRADE_FEE_RATE = 0.4;

/**
 * 넥슨 데이터센터가 공시하는 기준가의 집계 주기(시간).
 *
 * **집계 주기이지 갱신 시각이 아니다.** 몇 시에 도는지는 공개된 적이 없어
 * 이 상수로 다음 갱신 시각을 계산하지 않는다(data/freshness.ts 주석 참고).
 */
export const DATACENTER_AGGREGATION_HOURS = 2;

/* ── Open API 의 한계 (규칙이라기보다 사실 관계) ─────────── */

/**
 * Open API 가 **제공하지 않는** 것.
 *
 * 화면에서 "이건 알 수 없다" 고 말해야 할 때 이 목록을 근거로 삼는다.
 * 없는 데이터를 추정으로 메우지 않기 위해 명시적으로 적어 둔다.
 */
export const OPEN_API_DOES_NOT_PROVIDE = [
  '현재 이적시장에 올라온 매물의 호가',
  '즉시 구매 현재가',
  '전체 유저의 거래 내역(시장 전체 거래량)',
  '선수 카드의 공식 오버롤·세부 능력치',
  '선수팩 실시간 확률',
] as const;
