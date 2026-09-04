import { fail, handleError, ok } from '@/lib/api/respond';
import { getCard } from '@/lib/players/catalog';
import { MAX_ENHANCEMENT } from '@/lib/fconline/rules';
import { enhanceCurve, upgradeOdds } from '@/lib/players/enhance';

/**
 * GET /api/players/{spid}
 * 카드 상세 + 강화 +1~+13 전 구간의 오버롤/능력치/추정 가치 곡선.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ spid: string }> },
) {
  const { spid: raw } = await context.params;
  const spid = Number.parseInt(raw, 10);
  if (!Number.isFinite(spid) || spid <= 0) {
    return fail(400, 'INVALID_SPID', 'spid 는 양의 정수여야 합니다.');
  }

  try {
    const card = await getCard(spid);
    if (!card) return fail(404, 'NOT_FOUND', '해당 선수 카드를 찾을 수 없습니다.');

    return ok(
      {
        card,
        curve: enhanceCurve(card),
        /*
         * 구간 이름을 상수에서 만든다. 예전에는 '1to10' 이 마지막 칸이라
         * 응답만 보면 +10 이 상한처럼 보였다 — 게임은 +13 까지 열려 있다.
         * 상한은 한 곳(fconline/rules.ts)에서만 정한다.
         */
        odds: Object.fromEntries(
          [5, 8, 10, MAX_ENHANCEMENT].map((to) => [`1to${to}`, upgradeOdds(1, to)]),
        ),
      },
      { cacheSeconds: 3600 },
    );
  } catch (error) {
    return handleError(error);
  }
}
