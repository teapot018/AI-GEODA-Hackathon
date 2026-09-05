import { beforeEach, vi } from 'vitest';

/**
 * 모든 테스트가 공유하는 준비 작업.
 *
 * 목표는 하나다 — **테스트가 넥슨 서버에 의존하지 않게 한다.**
 * CI 러너는 open.api.nexon.com 에 나갈 수 없고, 나갈 수 있더라도
 * 남의 서버 응답에 따라 빌드가 빨개지는 건 좋은 테스트가 아니다.
 * 그래서 fetch 를 즉시 거부하도록 바꿔 두고, 코드가 준비해 둔
 * 데모 폴백(buildDemoBundle) 경로를 타게 만든다.
 * 즉 이 파일은 "폴백이 실제로 동작하는가"까지 같이 검증하는 셈이다.
 */

/** 테스트 중 실제로 시도된 네트워크 요청 URL 목록 (누수 감시용) */
export const attemptedRequests: string[] = [];

declare global {
  // eslint-disable-next-line no-var
  var __attemptedRequests: string[] | undefined;
}
globalThis.__attemptedRequests = attemptedRequests;

class BlockedNetworkError extends Error {
  constructor(url: string) {
    super(`테스트 환경에서는 외부 요청이 차단됩니다: ${url}`);
    this.name = 'BlockedNetworkError';
  }
}

vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  attemptedRequests.push(url);
  return Promise.reject(new BlockedNetworkError(url));
});

/* 키가 없어야 데모/목업 경로가 켜진다. 로컬에 .env 가 있어도 무시한다. */
delete process.env.NX_API_KEY;
process.env.FC_ALLOW_MOCK = 'true';

/**
 * 위에서 fetch 를 막았으니 메타 로더는 반드시 한 번 경고를 찍는다.
 * 그 한 줄만 조용히 흘려보내고, 나머지 경고(특히 상자 풀이 비었다는 경고)는
 * 그대로 보이게 둔다 — 그건 진짜 버그 신호다.
 */
const EXPECTED_WARNINGS = ['[meta] 넥슨 메타 로드 실패'];
const realWarn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  const first = typeof args[0] === 'string' ? args[0] : '';
  if (EXPECTED_WARNINGS.some((prefix) => first.startsWith(prefix))) return;
  realWarn(...args);
};

beforeEach(() => {
  attemptedRequests.length = 0;
});
