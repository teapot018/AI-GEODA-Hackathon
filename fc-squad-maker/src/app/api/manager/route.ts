import type { NextRequest } from 'next/server';

import { fail, handleError, ok } from '@/lib/api/respond';
import { getManagerOverview } from '@/lib/nexon/service';

/**
 * GET /api/manager?nickname=닉네임
 *
 * 브라우저 -> 이 라우트 -> 넥슨 API 순으로 흐르므로
 * CORS 문제도, API 키 노출도 없다.
 */
export async function GET(request: NextRequest) {
  const nickname = request.nextUrl.searchParams.get('nickname')?.trim();
  if (!nickname) return fail(400, 'EMPTY_NICKNAME', '구단주 닉네임을 입력해 주세요.');

  try {
    const result = await getManagerOverview(nickname);
    return ok(result.data, { source: result.source, note: result.note, cacheSeconds: 60 });
  } catch (error) {
    return handleError(error);
  }
}
