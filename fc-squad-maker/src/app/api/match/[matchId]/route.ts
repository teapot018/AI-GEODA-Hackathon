import type { NextRequest } from 'next/server';

import { fail, handleError, ok } from '@/lib/api/respond';
import { getMatchDetail } from '@/lib/nexon/service';

/** GET /api/match/{matchId}?nickname= */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await context.params;
  if (!matchId) return fail(400, 'EMPTY_MATCH_ID', 'matchId 가 필요합니다.');

  try {
    const result = await getMatchDetail(
      matchId,
      request.nextUrl.searchParams.get('nickname')?.trim() || undefined,
    );
    return ok(result.data, { source: result.source, note: result.note, cacheSeconds: 600 });
  } catch (error) {
    return handleError(error);
  }
}
