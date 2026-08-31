import type { NextRequest } from 'next/server';

import { fail, handleError, intParam, ok } from '@/lib/api/respond';
import { getManagerAnalytics } from '@/lib/nexon/insights';

/**
 * GET /api/manager/analytics?ouid=&nickname=&matchType=50&limit=20
 *
 * 매치 상세를 limit 건 겹쳐 승률·득실·점유율과 선수별 실전 성능을 낸다.
 * 경기당 1콜이라 limit 상한이 곧 호출량 상한이다.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const ouid = params.get('ouid')?.trim();
  if (!ouid) return fail(400, 'EMPTY_OUID', 'ouid 가 필요합니다.');

  try {
    const result = await getManagerAnalytics({
      ouid,
      nicknameForMock: params.get('nickname')?.trim() || undefined,
      matchType: intParam(params.get('matchType'), 50, { min: 0, max: 999 }),
      limit: intParam(params.get('limit'), 20, { min: 1, max: 40 }),
    });
    return ok(result.data, { source: result.source, note: result.note, cacheSeconds: 180 });
  } catch (error) {
    return handleError(error);
  }
}
