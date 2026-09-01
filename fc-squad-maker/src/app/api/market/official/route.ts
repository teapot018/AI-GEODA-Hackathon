import type { NextRequest } from 'next/server';

import { fail, handleError, intParam, ok } from '@/lib/api/respond';
import { env } from '@/lib/env';
import { comparePrice, fetchOfficialPrice } from '@/lib/market/datacenter';

/**
 * GET /api/market/official?spid=300235494&grade=1&observed=1200000
 *
 * 넥슨 데이터센터의 **공시 기준가**를 한 카드만 읽어 온다.
 * observed 를 같이 주면 우리가 관측한 체결가와 비교해 돌려준다.
 *
 * 카드마다 페이지를 한 번씩 부르는 구조라, 목록 전체를 자동으로 훑지
 * 않는다. 사용자가 특정 카드를 펼쳤을 때만 1회 부른다 — 남의 서버에
 * 예의를 지키는 선이 이 정도다.
 *
 * 기준가는 체결가를 대체하지 않는다. 2시간 주기 집계값이라 체감과
 * 어긋날 수 있고, 어긋나는 폭 자체가 정보라서 화면에서도 나란히 둔다.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const spid = intParam(params.get('spid'), 0, { min: 1, max: 999_999_999 });
  if (!spid) return fail(400, 'EMPTY_SPID', 'spid 가 필요합니다.');

  const grade = intParam(params.get('grade'), 1, { min: 1, max: 10 });
  const observed = intParam(params.get('observed'), 0, { min: 0, max: 99_999_999_999 });

  try {
    const official = await fetchOfficialPrice(spid, grade, {
      customPattern: env.datacenterPricePattern,
    });

    return ok(
      {
        ...official,
        comparison: observed > 0 ? comparePrice(spid, observed, official.price) : null,
      },
      {
        // 넥슨 집계 주기가 2시간이라 그보다 촘촘히 다시 부를 이유가 없다.
        cacheSeconds: 1800,
        note:
          official.strategy === 'none'
            ? '기준가를 읽지 못했습니다. 페이지 구조가 바뀌었을 수 있습니다 (npm run probe:datacenter 로 확인).'
            : undefined,
      },
    );
  } catch (error) {
    return handleError(error);
  }
}
