import type { NextRequest } from 'next/server';

import { fail, handleError, intParam, ok } from '@/lib/api/respond';
import { MAX_ENHANCEMENT } from '@/lib/fconline/rules';
import { lookupCardPrices } from '@/lib/market/lookup';

/**
 * GET /api/market/card?q=손흥민&grade=1&limit=8
 * GET /api/market/card?spid=300235494&grade=5
 *
 * 선수 이름으로 누적 관측 풀을 찾아본다. q 는 초성도 받는다.
 *
 * 넥슨을 부르지 않는다 — 이미 쌓아 둔 관측을 카드 기준으로 다시 자를 뿐이다.
 * 그래서 응답이 빠르고, 남의 서버에 부담을 주지 않으며, 키가 없어도 데모
 * 풀에서 같은 방식으로 답한다(어느 풀을 읽었는지는 source 로 밝힌다).
 *
 * 캐시를 걸지 않는 이유: 풀은 조회할 때마다 커진다. 방금 구단주를 조회해
 * 표본을 늘려 놓고 검색했는데 60초 전 빈 결과가 돌아오면, 사용자가 보기엔
 * 기능이 고장 난 것이다.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = params.get('q')?.trim() ?? '';
  const spid = intParam(params.get('spid'), 0, { min: 0, max: 999_999_999 });
  // grade 를 주지 않으면 등급을 가리지 않고 합친다 — 그건 '거래 전반'이지
  // '이 등급의 시세'가 아니라서, 화면은 기본으로 등급을 하나 집어 보낸다.
  const grade = intParam(params.get('grade'), 0, { min: 0, max: MAX_ENHANCEMENT });

  if (!query && !spid) {
    return fail(400, 'EMPTY_QUERY', '선수 이름(q) 또는 spid 가 필요합니다.');
  }

  try {
    const result = await lookupCardPrices({
      query,
      spid: spid || undefined,
      grade: grade || undefined,
      limit: intParam(params.get('limit'), 8, { min: 1, max: 30 }),
    });

    return ok(result, {
      source: result.source === 'mock' ? 'demo' : 'nexon',
      note:
        result.poolSamples === 0
          ? '아직 관측 풀이 비어 있습니다. 구단주를 한 번 조회하면 그 거래 내역이 풀에 쌓입니다.'
          : undefined,
    });
  } catch (error) {
    return handleError(error);
  }
}
