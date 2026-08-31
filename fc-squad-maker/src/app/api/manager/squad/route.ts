import type { NextRequest } from 'next/server';

import { fail, handleError, ok } from '@/lib/api/respond';
import { getSquadFromMatch } from '@/lib/nexon/insights';

/**
 * GET /api/manager/squad?matchId=&ouid=&nickname=
 *
 * 실제 경기의 선발 11명을 우리 포메이션 슬롯으로 옮겨 준다.
 * ouid 를 주면 그 구단주 쪽, 없으면 첫 번째 사이드(=상대 스쿼드 열람용).
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const matchId = params.get('matchId')?.trim();
  if (!matchId) return fail(400, 'EMPTY_MATCH_ID', 'matchId 가 필요합니다.');

  try {
    const result = await getSquadFromMatch({
      matchId,
      ouid: params.get('ouid')?.trim() || undefined,
      nicknameForMock: params.get('nickname')?.trim() || undefined,
    });
    return ok(result.data, { source: result.source, note: result.note, cacheSeconds: 600 });
  } catch (error) {
    return handleError(error);
  }
}
