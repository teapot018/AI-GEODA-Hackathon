import 'server-only';

import { NextResponse } from 'next/server';

import { MissingApiKeyError, NexonApiError } from '@/lib/nexon/client';

/**
 * Route Handler 공통 응답 규격.
 *
 * 성공: { ok: true, data, source?, note? }
 * 실패: { ok: false, error: { code, message } }
 *
 * 클라이언트는 ok 만 보고 분기하면 되고, 넥슨 에러 코드는 그대로 전달돼
 * "API 키가 잘못됐다" 같은 원인을 화면에서 안내할 수 있다.
 */

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  source?: 'nexon' | 'mock' | 'demo';
  note?: string;
}

export interface ApiFailure {
  ok: false;
  error: { code: string; message: string };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function ok<T>(
  data: T,
  extra?: { source?: ApiSuccess<T>['source']; note?: string; cacheSeconds?: number },
) {
  const body: ApiSuccess<T> = { ok: true, data };
  if (extra?.source) body.source = extra.source;
  if (extra?.note) body.note = extra.note;

  const headers: Record<string, string> = {};
  if (extra?.cacheSeconds) {
    headers['cache-control'] = `public, s-maxage=${extra.cacheSeconds}, stale-while-revalidate=${extra.cacheSeconds * 4}`;
  }
  return NextResponse.json(body, { headers });
}

export function fail(status: number, code: string, message: string) {
  return NextResponse.json<ApiFailure>({ ok: false, error: { code, message } }, { status });
}

/** 서비스 레이어에서 올라온 예외를 HTTP 응답으로 변환 */
export function handleError(error: unknown) {
  if (error instanceof MissingApiKeyError) {
    return fail(503, error.code, error.message);
  }
  if (error instanceof NexonApiError) {
    const status = error.isNotFound ? 404 : error.status >= 400 ? error.status : 502;
    return fail(status, error.code, error.message);
  }
  console.error('[api] 처리되지 않은 오류', error);
  return fail(500, 'INTERNAL', '서버에서 오류가 발생했습니다.');
}

/** 쿼리 파라미터를 정수로, 범위 제한까지 */
export function intParam(
  value: string | null,
  fallback: number,
  { min = 0, max = Number.MAX_SAFE_INTEGER }: { min?: number; max?: number } = {},
): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}
