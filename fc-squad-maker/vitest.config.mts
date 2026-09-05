import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * 테스트 실행 설정.
 *
 * 두 가지 별칭이 핵심이다.
 *  1. `@/*`        — Next.js 의 tsconfig paths 를 Vitest 에도 그대로 재현한다.
 *  2. `server-only` — 클라이언트 번들에 섞이면 즉시 throw 하는 마커 패키지다.
 *     Next.js 는 `react-server` 조건으로 빈 모듈을 집어 들지만 Vitest 는 그
 *     조건을 모른다. 그대로 두면 catalog/simulator 같은 서버 전용 모듈을
 *     import 하는 순간 테스트가 죽으므로 빈 스텁으로 갈아 끼운다.
 */
const src = fileURLToPath(new URL('./src', import.meta.url));
const stub = (name: string) =>
  fileURLToPath(new URL(`./tests/stubs/${name}.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/(.*)$/, replacement: `${src}/$1` },
      { find: /^server-only$/, replacement: stub('server-only') },
    ],
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    // 상자 분포 검증은 수천 회 추첨을 돌리므로 기본 5초로는 빠듯하다.
    testTimeout: 30_000,
    reporters: ['default'],
  },
});
