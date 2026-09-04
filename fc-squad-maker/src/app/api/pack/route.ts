import type { NextRequest } from 'next/server';

import { handleError, ok } from '@/lib/api/respond';
import { PACK_BOXES } from '@/lib/pack/boxes';
import { describeBox } from '@/lib/pack/simulator';

/**
 * GET /api/pack          -> 상자 목록
 * GET /api/pack?box=xxx  -> 해당 상자의 확률/기대값 상세
 */
export async function GET(request: NextRequest) {
  const boxId = request.nextUrl.searchParams.get('box');

  try {
    if (boxId) {
      return ok(await describeBox(boxId), { cache: { scope: 'shared', seconds: 600 } });
    }
    return ok(
      {
        boxes: PACK_BOXES.map((box) => ({
          id: box.id,
          name: box.name,
          subtitle: box.subtitle,
          currency: box.currency,
          price: box.price,
          drawCount: box.drawCount,
          pity: box.pity ?? null,
          tiers: box.tiers,
        })),
      },
      { cache: { scope: 'shared', seconds: 3600 } },
    );
  } catch (error) {
    return handleError(error);
  }
}
