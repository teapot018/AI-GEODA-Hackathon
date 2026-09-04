import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * ── API 키가 브라우저로 새지 않는가 ─────────────────────────
 *
 * 이 프로젝트에서 되돌릴 수 없는 사고는 딱 하나다: 넥슨 API 키가
 * 클라이언트 번들에 박혀 배포되는 것. 한 번 나가면 회수가 안 되고
 * 키를 폐기·재발급하는 수밖에 없다.
 *
 * Next.js 에서 이 사고는 두 가지 방식으로 일어난다.
 *   1. 환경변수에 NEXT_PUBLIC_ 접두사를 붙인다 → 빌드 때 번들에 그대로 인라인된다.
 *   2. 'use client' 모듈이 키를 읽는 모듈을 import 한다 → 같은 결과.
 *
 * 리뷰로 막는 건 언젠가 뚫린다. 그래서 소스 트리를 직접 훑어 검사한다.
 */

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = join(projectRoot, 'src');

const CODE_EXT = ['.ts', '.tsx', '.mts', '.js', '.mjs', '.jsx'];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (CODE_EXT.some((ext) => name.endsWith(ext))) out.push(full);
  }
  return out;
}

const sourceFiles = walk(srcRoot);
const read = (file: string) => readFileSync(file, 'utf8');
const rel = (file: string) => relative(projectRoot, file).replace(/\\/g, '/');

describe('소스 트리 상태 점검', () => {
  it('검사할 소스가 실제로 있다 (경로가 틀리면 이 파일 전체가 무의미해진다)', () => {
    expect(sourceFiles.length).toBeGreaterThan(20);
    expect(sourceFiles.map(rel)).toContain('src/lib/env.ts');
  });
});

describe('NEXT_PUBLIC_ 접두사', () => {
  it('어떤 소스도 NEXT_PUBLIC_ 환경변수를 읽지 않는다', () => {
    const offenders = sourceFiles.filter((f) => /process\.env\.NEXT_PUBLIC_/.test(read(f)));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('.env.example 이 NEXT_PUBLIC_ 사용을 권하지 않는다', () => {
    const example = readFileSync(join(projectRoot, '.env.example'), 'utf8');
    expect(example).not.toMatch(/^\s*NEXT_PUBLIC_/m);
    // 키 자리는 비어 있어야 한다 (예시 파일에 진짜 키를 적는 사고 방지)
    expect(example).toMatch(/^NX_API_KEY=\s*$/m);
  });
});

describe('키를 읽는 곳은 한 군데뿐', () => {
  it('process.env.NX_API_KEY 는 src/lib/env.ts 에서만 읽는다', () => {
    const readers = sourceFiles.filter((f) => /process\.env\.NX_API_KEY/.test(read(f)));
    expect(readers.map(rel)).toEqual(['src/lib/env.ts']);
  });

  it('src/lib/env.ts 는 server-only 로 잠겨 있다', () => {
    const source = read(join(srcRoot, 'lib/env.ts'));
    expect(source).toMatch(/^import 'server-only';/m);
  });

  it('넥슨 호출 클라이언트도 server-only 다', () => {
    expect(read(join(srcRoot, 'lib/nexon/client.ts'))).toMatch(/^import 'server-only';/m);
  });
});

/**
 * import 그래프를 따라가며 "'use client' 에서 출발해 키에 닿는 경로"가
 * 있는지 본다. server-only 패키지가 런타임에 던져 주긴 하지만,
 * 그건 그 코드를 실행해 봐야 알 수 있다. 여기서는 정적으로 잡는다.
 */
describe('클라이언트 번들 도달 범위', () => {
  /**
   * `import ... from '...'` / `export ... from '...'` 를 잡되,
   * **타입 전용 import 는 제외한다.** `import type { X } from '...'` 는
   * 컴파일 때 통째로 지워지므로 클라이언트 번들에 아무것도 남기지 않는다.
   * (이걸 구분하지 않으면 서버 모듈의 타입만 빌려 쓴 컴포넌트가 전부
   *  '누수' 로 잡혀 이 검사가 쓸모없어진다.)
   */
  const IMPORT_RE = /^\s*(?:import|export)\s+([\s\S]*?)\s*from\s*['"]([^'"]+)['"]/gm;

  function resolveImport(fromFile: string, spec: string): string | null {
    let base: string;
    if (spec.startsWith('@/')) base = join(srcRoot, spec.slice(2));
    else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
    else return null; // 외부 패키지는 추적하지 않는다

    for (const candidate of [
      base,
      ...CODE_EXT.map((ext) => base + ext),
      ...CODE_EXT.map((ext) => join(base, `index${ext}`)),
    ]) {
      try {
        if (statSync(candidate).isFile()) return candidate;
      } catch {
        /* 없는 경로는 넘어간다 */
      }
    }
    return null;
  }

  function importsOf(file: string): string[] {
    const source = read(file);
    const out: string[] = [];
    for (const [, clause, spec] of source.matchAll(IMPORT_RE)) {
      if (/^type\b/.test(clause)) continue; // 타입 전용 — 런타임에 존재하지 않는다
      const resolved = resolveImport(file, spec);
      if (resolved) out.push(resolved);
    }
    return out;
  }

  /** 'use client' 파일들에서 출발해 도달 가능한 모든 모듈 */
  function clientReachable(): Map<string, string[]> {
    const entries = sourceFiles.filter((f) => /^\s*['"]use client['"]/m.test(read(f)));
    const paths = new Map<string, string[]>();
    const queue: Array<{ file: string; trail: string[] }> = entries.map((f) => ({
      file: f,
      trail: [rel(f)],
    }));

    while (queue.length > 0) {
      const { file, trail } = queue.shift()!;
      if (paths.has(file)) continue;
      paths.set(file, trail);
      for (const next of importsOf(file)) {
        if (!paths.has(next)) queue.push({ file: next, trail: [...trail, rel(next)] });
      }
    }
    return paths;
  }

  const reachable = clientReachable();

  it("'use client' 모듈이 실제로 잡힌다", () => {
    expect(reachable.size).toBeGreaterThan(10);
    expect([...reachable.keys()].map(rel)).toContain('src/components/squad/SquadBuilder.tsx');
  });

  it('클라이언트에서 src/lib/env.ts 에 닿을 수 없다', () => {
    const target = join(srcRoot, 'lib/env.ts');
    const trail = reachable.get(target);
    expect(trail, `클라이언트 → 키 경로 발견: ${trail?.join(' → ')}`).toBeUndefined();
  });

  it('클라이언트에서 server-only 모듈 어디에도 닿을 수 없다', () => {
    const leaks: string[] = [];
    for (const [file, trail] of reachable) {
      if (/^import 'server-only';/m.test(read(file))) leaks.push(trail.join(' → '));
    }
    expect(leaks).toEqual([]);
  });

  it('클라이언트는 fetch 로 자체 /api 경로만 부른다 (넥슨 직접 호출 금지)', () => {
    const offenders: string[] = [];
    for (const file of reachable.keys()) {
      // 주석 속 언급이 아니라 **문자열 리터럴**에 호스트가 박힌 경우만 잡는다.
      if (/['"`][^'"`\n]*open\.api\.nexon\.com/.test(read(file))) offenders.push(rel(file));
    }
    expect(offenders).toEqual([]);
  });
});

describe('저장소에 키가 커밋되지 않았는가', () => {
  it('.gitignore 가 .env 계열을 전부 막는다', () => {
    const ignore = readFileSync(join(projectRoot, '.gitignore'), 'utf8')
      .split('\n')
      .map((l) => l.trim());
    for (const pattern of ['.env', '.env.local', '.env*.local']) {
      expect(ignore, pattern).toContain(pattern);
    }
  });

  it('소스 어디에도 넥슨 키처럼 생긴 문자열이 없다', () => {
    // 넥슨 키는 test_/live_ 뒤에 긴 16진 문자열이 붙는 형태다.
    const KEY_LIKE = /\b(?:test|live)_[0-9a-f]{32,}\b/i;
    const files = [...sourceFiles, join(projectRoot, '.env.example')];
    const offenders = files.filter((f) => KEY_LIKE.test(read(f)));
    expect(offenders.map(rel)).toEqual([]);
  });
});

describe('키가 흘러 나갈 수 있는 통로 (§84~86)', () => {
  /*
   * 키가 새는 길은 번들만이 아니다. URL, 로그, 에러 메시지, 스택 트레이스,
   * 직렬화된 props — 전부 사람이 볼 수 있는 자리로 나간다. 여기서는
   * 지금 실제로 막혀 있는 통로들을 못 박아 둔다.
   */

  it('키는 헤더로만 나가고 URL 에 들어가지 않는다', () => {
    /*
     * 이게 제일 중요한 한 줄이다. 키를 쿼리 파라미터로 옮기는 순간
     * 프록시 로그, 브라우저 히스토리, Next 데이터 캐시 키, 에러 메시지에
     * 전부 남는다. 지금은 x-nxopen-api-key 헤더로만 나간다.
     */
    const client = read(join(projectRoot, 'src/lib/nexon/client.ts'));
    expect(client).toContain("headers['x-nxopen-api-key'] = env.apiKey");
    // buildUrl 에 키를 넘기지 않는다.
    expect(client).not.toMatch(/buildUrl\([^)]*apiKey/);
    expect(client).not.toMatch(/[?&](?:api_?key|key)=/i);
  });

  it('로그에 키나 env 객체를 통째로 넘기지 않는다', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const text = read(file);
      for (const line of text.split('\n')) {
        if (!/console\.(log|warn|error|info|debug)/.test(line)) continue;
        if (/apiKey|NX_API_KEY|\benv\b\s*\)/.test(line)) offenders.push(`${rel(file)}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('응답 본문에 원본 에러 객체를 담지 않는다', () => {
    /*
     * handleError 는 코드와 사람이 읽을 메시지만 내보낸다. 예외를 그대로
     * 직렬화하면 스택과 함께 요청 정보가 클라이언트로 나간다.
     */
    const respond = read(join(projectRoot, 'src/lib/api/respond.ts'));
    expect(respond).toContain("fail(500, 'INTERNAL'");
    expect(respond).not.toMatch(/JSON\.stringify\(\s*error/);
    expect(respond).not.toMatch(/error:\s*error\b/);
  });

  it('키를 클라이언트로 내려보내는 props 가 없다', () => {
    // 서버 컴포넌트가 env 를 그대로 props 로 넘기면 RSC 페이로드에 실린다.
    const offenders = sourceFiles.filter((f) => /\bapiKey\b/.test(read(f)) && rel(f) !== 'src/lib/env.ts');
    // client.ts 는 헤더에 넣기 위해 읽는다 — 그 한 곳만 허용한다.
    expect(offenders.map(rel).filter((r) => r !== 'src/lib/nexon/client.ts')).toEqual([]);
  });
});
