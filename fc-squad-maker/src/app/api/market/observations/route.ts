import type { NextRequest } from 'next/server';

import { fail, handleError, intParam, ok } from '@/lib/api/respond';
import { getMarketReport } from '@/lib/nexon/insights';

/**
 * GET /api/market/observations?ouid=&nickname=&pages=3&minSamples=1&grade=1
 *
 * 거래 내역을 offset 을 밀어 가며 긁어 카드별 실거래 가격 통계를 낸다.
 * pages 가 커질수록 넥슨 호출 수가 선형으로 늘어나므로 상한을 둔다.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const ouid = params.get('ouid')?.trim();
  if (!ouid) return fail(400, 'EMPTY_OUID', 'ouid 가 필요합니다.');

  try {
    const result = await getMarketReport({
      ouid,
      nicknameForMock: params.get('nickname')?.trim() || undefined,
      pages: intParam(params.get('pages'), 3, { min: 1, max: 10 }),
      minSamples: intParam(params.get('minSamples'), 1, { min: 1, max: 50 }),
      maxCards: intParam(params.get('maxCards'), 60, { min: 1, max: 300 }),
      // 모르는 값이 오면 기본(누적 풀)으로 떨어뜨린다.
      scope: params.get('scope') === 'account' ? 'account' : 'pool',
      // 0 이면 등급을 가리지 않는다(합친 값). 화면은 기본으로 +1 을 보낸다.
      grade: intParam(params.get('grade'), 0, { min: 0, max: 10 }) || undefined,
    });
    return ok(result.data, { source: result.source, note: result.note, cacheSeconds: 300 });
  } catch (error) {
    return handleError(error);
  }
}
