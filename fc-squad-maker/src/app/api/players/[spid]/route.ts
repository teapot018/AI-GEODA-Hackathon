import { fail, handleError, ok } from '@/lib/api/respond';
import { getCard } from '@/lib/players/catalog';
import { enhanceCurve, upgradeOdds } from '@/lib/players/enhance';

/**
 * GET /api/players/{spid}
 * 카드 상세 + 강화 +1~+10 전 구간의 오버롤/능력치/추정 가치 곡선.
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
        odds: {
          '1to5': upgradeOdds(1, 5),
          '1to8': upgradeOdds(1, 8),
          '1to10': upgradeOdds(1, 10),
        },
      },
      { cacheSeconds: 3600 },
    );
  } catch (error) {
    return handleError(error);
  }
}
