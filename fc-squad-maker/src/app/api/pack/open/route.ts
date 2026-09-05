import type { NextRequest } from 'next/server';

import { fail, handleError, ok } from '@/lib/api/respond';
import { env } from '@/lib/env';
import { findBox } from '@/lib/pack/boxes';
import { openBox } from '@/lib/pack/simulator';

/**
 * POST /api/pack/open
 * body: { boxId: string, times?: number, seed?: string, pityCounter?: number }
 *
 * 추첨은 서버에서만 한다. 클라이언트에서 뽑으면 확률 테이블이 번들에 노출되고
 * 결과를 조작할 수 있기 때문이다(시뮬레이터라도 결과 신뢰도가 떨어진다).
 */
export async function POST(request: NextRequest) {
  let body: { boxId?: string; times?: number; seed?: string; pityCounter?: number };
  try {
    body = await request.json();
  } catch {
    return fail(400, 'INVALID_JSON', '요청 본문이 올바른 JSON 이 아닙니다.');
  }

  const boxId = body.boxId?.trim();
  if (!boxId) return fail(400, 'EMPTY_BOX_ID', 'boxId 가 필요합니다.');
  if (!findBox(boxId)) return fail(404, 'BOX_NOT_FOUND', `상자를 찾을 수 없습니다: ${boxId}`);

  const times = Math.max(1, Math.min(50, Math.trunc(body.times ?? 1) || 1));

  try {
    const result = await openBox({
      boxId,
      times,
      seed: body.seed ?? env.packSeed,
      pityCounter: Math.max(0, Math.trunc(body.pityCounter ?? 0)),
    });
    return ok(result);
  } catch (error) {
    return handleError(error);
  }
}
