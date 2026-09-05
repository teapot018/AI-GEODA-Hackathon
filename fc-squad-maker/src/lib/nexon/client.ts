import 'server-only';

import { env, hasApiKey } from '@/lib/env';

/**
 * 넥슨 Open API 서버 전용 클라이언트.
 *
 * 브라우저에서 open.api.nexon.com 을 직접 부르면 (1) CORS 로 막히고
 * (2) API 키가 노출된다. 그래서 모든 호출은 이 모듈을 거쳐
 * Route Handler(/src/app/api/**) 안에서만 일어난다.
 */

/** Open API 가 문서화한 에러 코드 -> 사람이 읽을 메시지 */
const ERROR_MESSAGES: Record<string, string> = {
  OPENAPI00001: '넥슨 서버 내부 오류입니다. 잠시 후 다시 시도해 주세요.',
  OPENAPI00002: '해당 API 에 대한 권한이 없습니다. 앱 설정에서 게임을 확인하세요.',
  OPENAPI00003: '유효하지 않은 식별자(ouid/matchid)입니다.',
  OPENAPI00004: '요청 파라미터가 누락되었거나 형식이 올바르지 않습니다.',
  OPENAPI00005: '유효하지 않은 API KEY 입니다. NX_API_KEY 를 확인하세요.',
  OPENAPI00006: '유효하지 않은 게임 또는 API PATH 입니다.',
  OPENAPI00007: 'API 호출량을 초과했습니다. 잠시 후 다시 시도해 주세요.',
  OPENAPI00009: '데이터 준비 중입니다. 잠시 후 다시 시도해 주세요.',
  OPENAPI00010: '넥슨 API 점검 중입니다.',
  OPENAPI00011: '넥슨 서버 내부 오류입니다.',
};

export class NexonApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'NexonApiError';
  }

  /** 클라이언트에 그대로 내려도 안전한 형태 */
  toJSON() {
    return { status: this.status, code: this.code, message: this.message };
  }

  /** 닉네임/ouid 를 못 찾은 경우 (404 로 내려주기 위한 구분) */
  get isNotFound(): boolean {
    return this.status === 404 || this.code === 'OPENAPI00003';
  }
}

export class MissingApiKeyError extends Error {
  readonly code = 'NO_API_KEY';
  constructor() {
    super('NX_API_KEY 가 설정되지 않았습니다. .env.local 에 키를 넣어 주세요.');
    this.name = 'MissingApiKeyError';
  }
}

export type QueryValue = string | number | boolean | undefined | null;

export interface NexonFetchOptions {
  /** ISR 캐시 수명(초). 0 이면 매번 새로 호출. */
  revalidate?: number;
  /** 요청 타임아웃(ms). 기본 8초. */
  timeoutMs?: number;
  /** 429/5xx 재시도 횟수. 기본 2회. */
  retries?: number;
  /** 인증 헤더 없이 호출 (정적 메타데이터용) */
  anonymous?: boolean;
}

function buildUrl(path: string, params?: Record<string, QueryValue>): string {
  const url = new URL(path, `${env.apiBase}/`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function parseError(res: Response): Promise<NexonApiError> {
  let code = `HTTP_${res.status}`;
  let message = `넥슨 API 오류 (HTTP ${res.status})`;
  try {
    const body = (await res.json()) as { error?: { name?: string; message?: string } };
    if (body?.error?.name) {
      code = body.error.name;
      message = ERROR_MESSAGES[code] ?? body.error.message ?? message;
    }
  } catch {
    /* JSON 이 아닌 에러 본문은 무시하고 기본 메시지 사용 */
  }
  return new NexonApiError(res.status, code, message);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function nexonFetch<T>(
  path: string,
  params?: Record<string, QueryValue>,
  options: NexonFetchOptions = {},
): Promise<T> {
  const { revalidate = 60, timeoutMs = 8000, retries = 2, anonymous = false } = options;

  if (!anonymous && !hasApiKey) throw new MissingApiKeyError();

  const url = buildUrl(path, params);
  const headers: Record<string, string> = { accept: 'application/json' };
  if (!anonymous) headers['x-nxopen-api-key'] = env.apiKey;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers,
        signal: controller.signal,
        next: revalidate > 0 ? { revalidate } : undefined,
        cache: revalidate > 0 ? undefined : 'no-store',
      });

      if (res.ok) return (await res.json()) as T;

      const error = await parseError(res);
      // 4xx 중 재시도가 의미 있는 건 429(호출량 초과)뿐이다.
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt === retries) throw error;
      lastError = error;
    } catch (error) {
      if (error instanceof NexonApiError) {
        if (attempt === retries) throw error;
        lastError = error;
      } else {
        // 네트워크 오류/타임아웃
        if (attempt === retries) {
          throw new NexonApiError(
            504,
            'NETWORK',
            '넥슨 API 에 연결하지 못했습니다 (타임아웃 또는 네트워크 오류).',
          );
        }
        lastError = error;
      }
    } finally {
      clearTimeout(timer);
    }

    await sleep(2 ** attempt * 300);
  }

  throw lastError instanceof Error
    ? lastError
    : new NexonApiError(500, 'UNKNOWN', '알 수 없는 오류');
}

/**
 * 데모로 대체됐을 때 화면에 붙일 한 줄.
 *
 * 예전에는 "HTTP_403 — 데모 데이터로 대체" 였다. 코드를 아는 사람에게는
 * 충분하지만, 이 앱을 쓰는 사람은 방금 Vercel 에 키를 붙여 넣고 왜 여전히
 * 데모인지 알고 싶을 뿐이다. 무엇이 잘못됐고 무엇을 하면 되는지 적는다.
 */
export function describeFallback(error: unknown): string {
  if (error instanceof MissingApiKeyError) {
    return 'API 키(NX_API_KEY)가 없어 데모 데이터를 보여 줍니다.';
  }

  if (error instanceof NexonApiError) {
    if (error.status === 401 || error.status === 403) {
      return '넥슨이 API 키를 거부했습니다. 키가 맞는지, 사용 승인이 났는지 확인하세요. 지금은 데모 데이터입니다.';
    }
    if (error.status === 429) {
      return '넥슨 호출량 한도를 넘었습니다. 잠시 뒤 다시 조회하세요. 지금은 데모 데이터입니다.';
    }
    if (error.code === 'NETWORK' || error.status === 504) {
      return '넥슨 서버에 연결하지 못했습니다 (응답 없음). 지금은 데모 데이터입니다.';
    }
    if (error.status >= 500) {
      return '넥슨 서버에 문제가 있습니다. 잠시 뒤 다시 조회하세요. 지금은 데모 데이터입니다.';
    }
    return `넥슨 API 오류(${error.code})로 데모 데이터를 보여 줍니다.`;
  }

  return '넥슨 API 호출에 실패해 데모 데이터를 보여 줍니다.';
}
