/**
 * ── 조회가 얼마나 온전했는가 ──────────────────────────────
 *
 * 넥슨 호출은 부분적으로 실패한다. 매입 3페이지 중 2페이지만 오거나,
 * 매도만 오고 매입이 429 로 막히거나.
 *
 * 그럴 때 전부 버리고 데모 데이터로 떨어뜨리면, 실제로 받아 온 진짜
 * 체결가를 지어낸 값으로 바꿔치기하는 셈이 된다. 받은 만큼으로 통계를
 * 내되 **무엇이 빠졌는지 화면에 적는다** — 그 둘을 같이 해야 정직하다.
 *
 * server-only 를 붙이지 않는다. 이 파일은 순수 함수뿐이라 테스트에서
 * 그대로 불러 검증할 수 있어야 한다.
 */

export interface SideCoverage {
  /** 이 방향(매입/매도)을 한 페이지라도 받았는가 */
  ok: boolean;
  /** 중간에 실패해 요청한 페이지 수를 다 못 채웠는가 */
  truncated: boolean;
  /**
   * 페이지를 넘기는 사이 목록이 밀려 다시 받은 거래 수.
   *
   * `offset` 페이지네이션은 살아 있는 목록 위에서 돈다. 0페이지를 받고
   * 1페이지를 부르는 사이에 새 거래가 K건 들어오면 목록 전체가 K칸 뒤로
   * 밀리고, `offset=100` 은 이미 본 뒷부분을 다시 준다.
   *
   * 이 겹침은 **중복이지 누락이 아니다** — 거래 내역은 앞쪽에만 쌓이므로
   * 밀림으로 사이가 비지는 않는다. 다만 한 페이지가 새 거래로 채워진
   * 만큼 과거로는 덜 내려간다. 그래서 "빠진 게 있다"가 아니라
   * "덜 깊이 봤다"로 적어야 맞다.
   */
  shiftedRows: number;
}

/**
 * 빠진 게 있으면 한 줄로 설명하고, 온전하면 undefined 를 준다.
 * (undefined 여야 UI 가 굳이 빈 배지를 그리지 않는다.)
 */
export function coverageNote(buy: SideCoverage, sell: SideCoverage): string | undefined {
  const parts: string[] = [];

  if (!buy.ok && sell.ok) parts.push('매입 내역을 받지 못해 매도 기록만으로 냈습니다');
  else if (!sell.ok && buy.ok) parts.push('매도 내역을 받지 못해 매입 기록만으로 냈습니다');

  // 한쪽이 통째로 빠진 경우엔 "일부 페이지" 얘기가 군더더기다.
  const truncated = (buy.ok && buy.truncated) || (sell.ok && sell.truncated);
  if (truncated && parts.length === 0) parts.push('일부 페이지를 받지 못해 표본이 요청보다 적습니다');
  else if (truncated) parts.push('남은 쪽도 일부 페이지가 빠졌습니다');

  // 목록 밀림은 실패가 아니라 "그 사이 거래가 있었다"는 사실이다.
  // 중복은 이미 걸러졌으므로 통계가 부풀지는 않는다 — 대신 표본이
  // 요청한 깊이만큼 과거로 못 갔다는 점을 적는다.
  const shifted = (buy.ok ? buy.shiftedRows : 0) + (sell.ok ? sell.shiftedRows : 0);
  if (shifted > 0) {
    parts.push(
      `조회 중 새 거래가 들어와 목록이 밀렸습니다 — 겹친 ${shifted}건을 걸렀고 그만큼 과거로 덜 내려갔습니다`,
    );
  }

  return parts.length > 0 ? `${parts.join(' · ')}.` : undefined;
}
