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

/**
 * 이 응답을 **누가** 다시 써도 되는지.
 *
 *  shared  같은 URL 이면 누구에게나 같은 응답이다. 카드 도감, 상자 확률,
 *          공시 기준가처럼 요청자가 누구든 바뀌지 않는 것들 — 공용 캐시(CDN)에
 *          둬도 된다.
 *  user    요청한 사람의 것이다. 구단주 거래 내역, 경기 목록, 스쿼드처럼
 *          `?ouid=` / `?nickname=` 에 따라 달라지는 응답 — 브라우저 개인
 *          캐시까지만 허용한다(`private`).
 *
 * 여기서 `user` 를 `public` 으로 내보내는 것이 왜 위험한지가 이 타입의 존재
 * 이유다. 우리 응답에서 신원은 **쿼리스트링에만** 있는데, 앞단 공용 캐시가
 * 쿼리스트링을 캐시 키에 넣어 준다는 보장이 없다 — CloudFront 의 기본
 * 캐시 정책(Managed-CachingOptimized)은 쿼리스트링을 아예 전달하지 않고,
 * 여러 CDN 이 "쿼리스트링 무시"를 옵션으로 제공한다. 그런 앞단에
 * `public` 을 주면 `?ouid=A` 로 채워진 칸이 `?ouid=B` 요청에 그대로
 * 나간다. A 의 거래 내역이 B 에게 보이는 것이다.
 *
 * 그래서 초 수만 넘기고 범위를 고르지 않는 길은 열어 두지 않는다. 캐시를
 * 걸려면 이 응답이 누구 것인지를 반드시 함께 말해야 한다.
 */
export type CacheScope = 'shared' | 'user';

export interface CachePolicy {
  scope: CacheScope;
  seconds: number;
}

export function cacheControl({ scope, seconds }: CachePolicy): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s === 0) return 'no-store';
  return scope === 'shared'
    ? `public, s-maxage=${s}, stale-while-revalidate=${s * 4}`
    : `private, max-age=${s}`;
}

export function ok<T>(
  data: T,
  extra?: { source?: ApiSuccess<T>['source']; note?: string; cache?: CachePolicy },
) {
  const body: ApiSuccess<T> = { ok: true, data };
  if (extra?.source) body.source = extra.source;
  if (extra?.note) body.note = extra.note;

  const headers: Record<string, string> = {};
  if (extra?.cache) headers['cache-control'] = cacheControl(extra.cache);
  return NextResponse.json(body, { headers });
}

/**
 * 실패 응답은 저장하지 않는다.
 *
 * 404 는 RFC 9111 이 휴리스틱 캐싱을 허용하는 상태 코드라, 헤더를 비워 두면
 * 중간 캐시가 "그 구단주 없음"을 제 마음대로 붙들고 있을 수 있다. 넥슨이
 * 잠깐 429 를 준 것이 몇 분짜리 사실로 굳는 것도 같은 이유로 곤란하다.
 * 에러는 그 순간의 상태일 뿐이므로 매번 다시 묻게 한다.
 */
export function fail(status: number, code: string, message: string) {
  return NextResponse.json<ApiFailure>(
    { ok: false, error: { code, message } },
    { status, headers: { 'cache-control': 'no-store' } },
  );
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
