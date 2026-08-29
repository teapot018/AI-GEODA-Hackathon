import type { NextRequest } from 'next/server';

import { fail, handleError, intParam, ok } from '@/lib/api/respond';
import { getAssetSnapshot } from '@/lib/nexon/service';

/** GET /api/manager/trades?ouid=&nickname=&limit=30 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const ouid = params.get('ouid')?.trim();
  if (!ouid) return fail(400, 'EMPTY_OUID', 'ouid 가 필요합니다.');

  try {
    const result = await getAssetSnapshot(
      ouid,
      params.get('nickname')?.trim() || undefined,
      intParam(params.get('limit'), 30, { min: 1, max: 100 }),
    );
    return ok(result.data, { source: result.source, note: result.note, cacheSeconds: 120 });
  } catch (error) {
    return handleError(error);
  }
}
