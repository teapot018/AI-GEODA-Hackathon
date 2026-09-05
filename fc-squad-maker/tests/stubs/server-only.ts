/**
 * `server-only` 패키지의 테스트용 대체품.
 *
 * 원본은 "클라이언트 번들에 섞이면 즉시 throw" 하도록 만들어져 있고,
 * Next.js 만 `react-server` 조건으로 빈 모듈을 집어 든다. Vitest 는 그 조건을
 * 모르기 때문에 그대로 두면 서버 전용 모듈(catalog, simulator 등)을
 * import 하는 순간 테스트가 죽는다. 그래서 빈 모듈로 갈아 끼운다.
 *
 * 원본 패키지의 `./empty.js` 를 직접 가리키지 않는 이유: 그 파일은
 * package.json 의 exports 에 서브패스로 노출돼 있지 않아 번들러가 거부한다.
 */
export {};
