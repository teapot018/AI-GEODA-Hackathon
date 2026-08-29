import 'server-only';

/**
 * 서버 전용 환경 변수 접근점.
 *
 * API 키는 절대 NEXT_PUBLIC_ 으로 노출하지 않는다. NEXT_PUBLIC_ 접두사가 붙은
 * 값은 클라이언트 번들에 문자열 그대로 인라인되므로, 배포 즉시 누구나 꺼내
 * 쓸 수 있다. 이 파일은 'server-only' 를 import 하므로 클라이언트 컴포넌트에서
 * 실수로 import 하면 빌드 타임에 에러가 난다.
 */

function readBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return !['0', 'false', 'off', 'no'].includes(value.toLowerCase());
}

export const env = {
  /** 넥슨 Open API 키. 없으면 데모(목업) 모드로 동작. */
  apiKey: process.env.NX_API_KEY?.trim() ?? '',
  apiBase: (process.env.NX_API_BASE?.trim() || 'https://open.api.nexon.com').replace(/\/$/, ''),
  /** 키가 없거나 호출이 실패했을 때 목업으로 대체할지 여부. */
  allowMock: readBool(process.env.FC_ALLOW_MOCK, true),
  /** 상자 시뮬레이터 고정 시드(재현용). 비우면 매 요청 랜덤. */
  packSeed: process.env.FC_PACK_SEED?.trim() || undefined,
} as const;

export const hasApiKey = env.apiKey.length > 0;
