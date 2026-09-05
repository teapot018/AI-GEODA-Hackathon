import { NexonApiError } from './client';
import type { TradeRecord } from './types';

/**
 * ── 넥슨이 준 것을 진짜로 확인한다 ─────────────────────────
 *
 * `nexonFetch<T>` 는 `await res.json() as T` 로 끝난다. `as` 는 검사가
 * 아니라 **선언**이라, 넥슨이 다른 모양을 줘도 타입스크립트는 우리 편을
 * 들어 준다. 그 거짓말이 어디까지 가는지 실제로 재 봤다:
 *
 *   응답이 배열이 아님   -> `batch is not iterable` TypeError, 500 INTERNAL
 *   행이 `null`          -> **정상 행까지 통째로 사라진다** (표본 1 -> 0)
 *   행이 객체가 아님     -> `.endsWith` of undefined 로 터짐
 *   tradeDate 가 null    -> `.endsWith` of null 로 터짐
 *   spid 가 문자열       -> **통계에 그대로 섞인다** (표본 1 -> 2)
 *
 * 뒤의 둘이 특히 나쁘다. 하나는 멀쩡한 데이터를 조용히 버리고, 하나는
 * 쓰레기를 조용히 받아들인다. 둘 다 화면에는 아무 표시도 남지 않는다.
 *
 * 여기서 하는 일은 세 가지다.
 *   1. 살릴 수 있는 행만 통과시킨다 — 이웃이 망가졌다고 멀쩡한 행을
 *      버리지 않는다.
 *   2. 몇 줄을 버렸는지 센다. 조용히 줄어드는 표본이 제일 위험하다.
 *   3. 응답이 통째로 다른 모양이면 **에러를 낸다.** 빈 배열로 바꾸지
 *      않는다 — 그건 "거래가 없다" 는 다른 말이고, 서버 오류를 정상
 *      응답으로 둔갑시키는 짓이다.
 *
 * server-only 를 붙이지 않는다. 순수 함수뿐이라 테스트에서 그대로
 * 불러 검증할 수 있어야 한다.
 */

export interface Validated<T> {
  rows: T[];
  /** 모양이 맞지 않아 버린 행 수 */
  dropped: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 거래 한 줄이 통계에 들어갈 만한가.
 *
 * 값(`value`)이 없거나 이상한 행은 여기서 버리지 않는다 — 통계 쪽이
 * 이미 `Number.isFinite(value) && value > 0` 로 거르고 있고, 값이 빠진
 * 거래도 "그때 거래가 있었다" 는 사실로는 쓸 수 있기 때문이다.
 * 여기서 보는 것은 **행을 다룰 수 있는가**다.
 */
function isTradeRecord(value: unknown): value is TradeRecord {
  if (!isRecord(value)) return false;
  // tradeDate 는 정렬·간격·보관 기한이 전부 기대는 축이라 없으면 못 쓴다.
  if (typeof value.tradeDate !== 'string' || value.tradeDate.length === 0) return false;
  // saleSn 은 중복 제거 키다. 없으면 같은 거래를 두 번 셀 수 있다.
  if (typeof value.saleSn !== 'string' && typeof value.saleSn !== 'number') return false;
  // spid 가 숫자가 아니면 카드로 접을 수 없다 — 문자열이 그대로 통계에 섞였다.
  if (typeof value.spid !== 'number' || !Number.isFinite(value.spid)) return false;
  return true;
}

export function validateTradeRecords(payload: unknown, side: string): Validated<TradeRecord> {
  if (!Array.isArray(payload)) {
    throw new NexonApiError(
      502,
      'UNEXPECTED_SHAPE',
      `넥슨이 ${side} 거래 목록을 배열이 아닌 형태로 응답했습니다. 응답 형식이 바뀌었을 수 있습니다.`,
    );
  }

  const rows: TradeRecord[] = [];
  let dropped = 0;

  for (const row of payload) {
    if (!isTradeRecord(row)) {
      dropped += 1;
      continue;
    }
    // saleSn 은 문자열로 통일한다 — 중복 제거 키가 타입에 따라 갈리면
    // 같은 거래가 두 번 남는다.
    rows.push({ ...row, saleSn: String(row.saleSn) });
  }

  return { rows, dropped };
}
