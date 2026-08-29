import type { NextRequest } from 'next/server';

import { handleError, intParam, ok } from '@/lib/api/respond';
import { loadMeta } from '@/lib/nexon/meta';
import { searchPlayers } from '@/lib/players/catalog';
import type { PositionCode } from '@/lib/players/types';

/**
 * GET /api/players?q=ㅅㅎㅁ&season=300&position=LW&limit=40
 *
 * q 는 초성 검색을 지원한다 ("ㅅㅎㅁ" -> 손흥민).
 * meta=1 을 붙이면 시즌 목록도 함께 내려줘 필터 UI 를 채울 수 있다.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  try {
    const result = await searchPlayers({
      query: params.get('q') ?? '',
      seasonId: params.get('season') ? intParam(params.get('season'), 0) : undefined,
      position: (params.get('position') as PositionCode | null) ?? undefined,
      limit: intParam(params.get('limit'), 40, { min: 1, max: 100 }),
    });

    const payload: Record<string, unknown> = {
      cards: result.cards,
      total: result.total,
    };

    if (params.get('meta') === '1') {
      const meta = await loadMeta();
      payload.seasons = meta.seasons;
      payload.positions = meta.positions;
    }

    return ok(payload, {
      source: result.source === 'demo' ? 'demo' : 'nexon',
      cacheSeconds: 300,
    });
  } catch (error) {
    return handleError(error);
  }
}
