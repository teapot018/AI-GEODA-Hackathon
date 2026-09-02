import { describe, expect, it } from 'vitest';

import { describeFallback, MissingApiKeyError, NexonApiError } from '@/lib/nexon/client';

/**
 * 이 문구는 사용자가 "키를 넣었는데 왜 아직 데모지?" 를 푸는 유일한 단서다.
 * 상태 코드를 그대로 노출하는 대신 무엇이 잘못됐는지 적혀 있어야 한다.
 */
describe('describeFallback', () => {
  it('키가 없으면 키가 없다고 말한다', () => {
    expect(describeFallback(new MissingApiKeyError())).toContain('NX_API_KEY');
  });

  it('401·403 은 키가 거부됐다고 말한다', () => {
    for (const status of [401, 403]) {
      const note = describeFallback(new NexonApiError(status, `HTTP_${status}`, ''));
      expect(note).toContain('키');
      expect(note).toContain('거부');
    }
  });

  it('429 는 호출량 초과라고 말하고 다시 시도하라고 한다', () => {
    const note = describeFallback(new NexonApiError(429, 'HTTP_429', ''));
    expect(note).toContain('호출량');
    expect(note).toContain('다시');
  });

  it('연결 실패는 응답이 없다고 말한다', () => {
    expect(describeFallback(new NexonApiError(504, 'NETWORK', ''))).toContain('연결하지 못했');
  });

  it('넥슨 서버 오류는 넥슨 쪽 문제라고 말한다', () => {
    expect(describeFallback(new NexonApiError(503, 'HTTP_503', ''))).toContain('넥슨 서버');
  });

  it('모르는 오류도 코드는 남긴다 — 물어볼 단서가 있어야 한다', () => {
    expect(describeFallback(new NexonApiError(418, 'ODD_CODE', ''))).toContain('ODD_CODE');
  });

  it('넥슨 오류가 아닌 것도 빈 문자열을 주지 않는다', () => {
    expect(describeFallback(new Error('무언가'))).toContain('데모');
    expect(describeFallback(undefined)).toContain('데모');
  });

  it('어떤 경우에도 데모라는 사실을 밝힌다', () => {
    const errors = [
      new MissingApiKeyError(),
      new NexonApiError(403, 'HTTP_403', ''),
      new NexonApiError(429, 'HTTP_429', ''),
      new NexonApiError(500, 'HTTP_500', ''),
      new Error('x'),
    ];
    for (const error of errors) expect(describeFallback(error)).toContain('데모');
  });
});
