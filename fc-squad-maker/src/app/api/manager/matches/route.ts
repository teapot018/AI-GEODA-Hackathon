import type { NextRequest } from 'next/server';

import { fail, handleError, intParam, ok } from '@/lib/api/respond';
import { MATCH_TYPE } from '@/lib/nexon/endpoints';
import { getRecentMatches } from '@/lib/nexon/service';

/** GET /api/manager/matches?ouid=&nickname=&matchType=50&limit=8 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const ouid = params.get('ouid')?.trim();
  if (!ouid) return fail(400, 'EMPTY_OUID', 'ouid 가 필요합니다.');

  try {
    const result = await getRecentMatches({
      ouid,
      nickname: params.get('nickname')?.trim() || undefined,
      matchType: intParam(params.get('matchType'), MATCH_TYPE.공식경기),
      offset: intParam(params.get('offset'), 0, { max: 1000 }),
      limit: intParam(params.get('limit'), 8, { min: 1, max: 20 }),
    });
    return ok(result.data, { source: result.source, note: result.note, cacheSeconds: 60 });
  } catch (error) {
    return handleError(error);
  }
}
