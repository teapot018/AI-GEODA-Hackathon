'use client';

import type { ApiResponse } from '@/lib/api/respond';

/**
 * 브라우저 -> 자체 /api/* 프록시 호출 헬퍼.
 *
 * 넥슨 API 를 직접 부르지 않는 이유:
 *  1) open.api.nexon.com 은 CORS 를 허용하지 않는다.
 *  2) 직접 부르면 API 키가 브라우저에 노출된다.
 * 그래서 모든 호출은 같은 오리진의 Route Handler 를 거친다.
 */

export class ApiError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface FetchResult<T> {
  data: T;
  source?: 'nexon' | 'mock' | 'demo';
  note?: string;
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<FetchResult<T>> {
  const res = await fetch(path, { signal, headers: { accept: 'application/json' } });
  const body = (await res.json().catch(() => null)) as ApiResponse<T> | null;

  if (!body) {
    throw new ApiError('BAD_RESPONSE', '서버 응답을 해석하지 못했습니다.', res.status);
  }
  if (!body.ok) {
    throw new ApiError(body.error.code, body.error.message, res.status);
  }
  return { data: body.data, source: body.source, note: body.note };
}

export async function apiPost<T>(
  path: string,
  payload: unknown,
  signal?: AbortSignal,
): Promise<FetchResult<T>> {
  const res = await fetch(path, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => null)) as ApiResponse<T> | null;

  if (!body) {
    throw new ApiError('BAD_RESPONSE', '서버 응답을 해석하지 못했습니다.', res.status);
  }
  if (!body.ok) {
    throw new ApiError(body.error.code, body.error.message, res.status);
  }
  return { data: body.data, source: body.source, note: body.note };
}

/** 검색 입력처럼 연타되는 호출을 위한 디바운스 */
export function debounce<Args extends unknown[]>(fn: (...args: Args) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
