#!/usr/bin/env node
/**
 * 넥슨 FC 온라인 Open API 점검 스크립트
 *
 *   node scripts/check-api.mjs                    # .env.local 의 NX_API_KEY 사용
 *   node scripts/check-api.mjs --nickname 손흥민   # 실제 구단주까지 끝까지 조회
 *   node scripts/check-api.mjs --key test_xxx     # 키를 직접 넘기기
 *   node scripts/check-api.mjs --json             # 결과를 JSON 으로
 *
 * 확인하는 것
 *   1. 정적 메타(인증 불필요)가 열리는가 — 시즌/선수 목록
 *   2. **최신 시즌이 메타에 들어와 있는가** (이 앱의 "최신까지 검색" 근거)
 *   3. 발급받은 키가 실제로 통하는가 — 엔드포인트별로
 *   4. 닉네임을 주면 ouid → 계정정보 → 매치 → 매치상세까지 실제로 흐르는가
 *
 * 의존성 없음. Node 18+ 의 내장 fetch 만 씁니다.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.NX_API_BASE?.trim() || 'https://open.api.nexon.com';

/* ── 인자 ─────────────────────────────────────────────────── */
const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const has = (name) => argv.includes(`--${name}`);
const JSON_OUT = has('json');
const NICKNAME = arg('nickname');
const API_BASE = arg('base') || BASE;   // --base 는 목업/스테이징 점검용

/* ── 키 읽기: --key > 환경변수 > .env.local > .env ─────────── */
function readEnvFile(file) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return out;
}

function resolveKey() {
  if (arg('key')) return { key: arg('key'), from: '--key 인자' };
  if (process.env.NX_API_KEY) return { key: process.env.NX_API_KEY.trim(), from: '환경변수 NX_API_KEY' };
  for (const f of ['.env.local', '.env']) {
    const env = readEnvFile(resolve(ROOT, f));
    if (env.NX_API_KEY) return { key: env.NX_API_KEY, from: `${f} 의 NX_API_KEY` };
  }
  return { key: '', from: null };
}

/* ── 출력 ─────────────────────────────────────────────────── */
const C = process.stdout.isTTY
  ? { r:'\x1b[31m', g:'\x1b[32m', y:'\x1b[33m', b:'\x1b[36m', d:'\x1b[2m', B:'\x1b[1m', x:'\x1b[0m' }
  : { r:'', g:'', y:'', b:'', d:'', B:'', x:'' };

const lines = [];
const say = (s = '') => { if (!JSON_OUT) console.log(s); lines.push(s); };
const head = (s) => { say(); say(`${C.B}${s}${C.x}`); say(`${C.d}${'─'.repeat(58)}${C.x}`); };
const okLine   = (label, detail = '') => say(`  ${C.g}✓${C.x} ${label.padEnd(30)} ${C.d}${detail}${C.x}`);
const badLine  = (label, detail = '') => say(`  ${C.r}✗${C.x} ${label.padEnd(30)} ${detail}`);
const warnLine = (label, detail = '') => say(`  ${C.y}!${C.x} ${label.padEnd(30)} ${C.d}${detail}${C.x}`);
const ms = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${n}ms`);
const nf = (n) => n.toLocaleString('ko-KR');

/* ── Open API 문서화 오류 코드 ─────────────────────────────── */
const ERRORS = {
  OPENAPI00001: '넥슨 서버 내부 오류',
  OPENAPI00002: '이 API 에 대한 권한 없음 — 앱 등록에서 FC ONLINE 을 선택했는지 확인',
  OPENAPI00003: '유효하지 않은 식별자(ouid/matchid)',
  OPENAPI00004: '파라미터 누락 또는 형식 오류 (닉네임을 못 찾은 경우도 여기로 옵니다)',
  OPENAPI00005: '유효하지 않은 API KEY — 키가 틀렸거나 만료됨',
  OPENAPI00006: '유효하지 않은 게임 또는 API PATH',
  OPENAPI00007: 'API 호출량 초과',
  OPENAPI00009: '데이터 준비 중',
  OPENAPI00010: '넥슨 API 점검 중',
  OPENAPI00011: '넥슨 서버 내부 오류',
};

/* ── 호출 ─────────────────────────────────────────────────── */
async function call(path, { params, key, timeout = 20000 } = {}) {
  const url = new URL(path, `${API_BASE}/`);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  const headers = { accept: 'application/json' };
  if (key) headers['x-nxopen-api-key'] = key;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  const started = Date.now();
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    const took = Date.now() - started;
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = null; }

    if (!res.ok) {
      const code = body?.error?.name ?? `HTTP_${res.status}`;
      // 넥슨은 오류도 JSON({error:{name,message}}) 으로 준다. JSON 이 아닌 4xx/5xx 는
      // 대개 중간의 프록시·방화벽이 막은 것이지 넥슨의 응답이 아니다.
      const proxyish = !body && [401, 403, 405, 407, 502, 503].includes(res.status);
      return {
        ok: false, status: res.status, code, took,
        message: ERRORS[code]
          ?? body?.error?.message
          ?? (proxyish
            ? `HTTP ${res.status} (넥슨 형식의 오류가 아닙니다 — 사내망·VPN·프록시가 open.api.nexon.com 을 막고 있을 가능성이 큽니다)`
            : `HTTP ${res.status}`),
      };
    }
    return { ok: true, status: res.status, took, data: body, bytes: text.length };
  } catch (err) {
    const took = Date.now() - started;
    const network = err.name === 'AbortError'
      ? `타임아웃 (${timeout}ms 초과)`
      : `네트워크 오류 — ${err.cause?.code ?? err.message}`;
    return { ok: false, status: 0, code: 'NETWORK', took, message: network };
  }
}

/* ── 점검 본체 ────────────────────────────────────────────── */
const report = { meta: {}, auth: {}, flow: {}, verdict: null };

async function main() {
  const { key, from } = resolveKey();
  const isTestKey = key.startsWith('test_');

  say();
  say(`${C.B}${C.b}넥슨 FC 온라인 Open API 점검${C.x}`);
  say(`${C.d}${new Date().toLocaleString('ko-KR')} · ${API_BASE}${C.x}`);

  head('0. 키');
  if (!key) {
    badLine('키를 찾지 못함', '.env.local 에 NX_API_KEY 를 넣거나 --key 로 넘기세요');
  } else {
    okLine('키 확인', `${from} · ${key.slice(0, 5)}…${key.slice(-4)} (${key.length}자)`);
    if (isTestKey) {
      warnLine('테스트 키 (test_)', '유효기간과 호출 한도가 짧습니다. 배포용은 live_ 키를 발급하세요');
    }
  }
  report.auth.keyPresent = !!key;
  report.auth.testKey = isTestKey;

  /* 1. 정적 메타 — 인증 불필요 */
  head('1. 정적 메타 (인증 불필요)');
  const metaTargets = [
    ['seasonid.json',   '/static/fconline/meta/seasonid.json',   'seasons'],
    ['spid.json',       '/static/fconline/meta/spid.json',       'spids'],
    ['spposition.json', '/static/fconline/meta/spposition.json', 'positions'],
    ['matchtype.json',  '/static/fconline/meta/matchtype.json',  'matchTypes'],
    ['division.json',   '/static/fconline/meta/division.json',   'divisions'],
  ];
  const meta = {};
  for (const [label, path, slot] of metaTargets) {
    const r = await call(path, { timeout: 30000 });
    if (r.ok && Array.isArray(r.data)) {
      meta[slot] = r.data;
      okLine(label, `${ms(r.took)} · ${nf(r.data.length)}건 · ${nf(Math.round(r.bytes / 1024))}KB`);
    } else {
      badLine(label, `${r.code} — ${r.message}`);
    }
    report.meta[slot] = r.ok ? r.data?.length ?? 0 : null;
  }

  /* 2. 최신 시즌이 들어와 있는가 */
  head('2. 최신 시즌 반영 여부');
  if (meta.seasons?.length) {
    const sorted = [...meta.seasons].sort((a, b) => b.seasonId - a.seasonId);
    okLine('시즌 총계', `${nf(sorted.length)}종`);
    say(`  ${C.d}가장 최근 시즌 8개 (seasonId 내림차순):${C.x}`);
    for (const s of sorted.slice(0, 8)) {
      const n = meta.spids?.filter((p) => Math.floor(p.id / 1_000_000) === s.seasonId).length;
      say(`    ${C.b}${String(s.seasonId).padStart(4)}${C.x}  ${String(s.className).padEnd(38)} ${C.d}${n === undefined ? '' : `카드 ${nf(n)}장`}${C.x}`);
    }
    report.meta.newestSeason = { id: sorted[0].seasonId, name: sorted[0].className };

    if (meta.spids?.length) {
      const newest = meta.spids.filter((p) => Math.floor(p.id / 1_000_000) === sorted[0].seasonId);
      if (newest.length) {
        okLine('최신 시즌 카드 검색 가능', `${nf(newest.length)}장 — 예: ${newest.slice(0, 3).map((p) => p.name).join(', ')}`);
      } else {
        warnLine('최신 시즌 카드 0장', 'seasonid 에는 있으나 spid 에 아직 반영 전일 수 있습니다');
      }
      report.meta.newestSeasonCards = newest.length;
    }
  } else {
    badLine('시즌 메타 없음', '위 1번이 실패해 판단할 수 없습니다');
  }

  /* 3. 키가 통하는가 */
  head('3. 인증 엔드포인트 (키 필요)');
  if (!key) {
    warnLine('건너뜀', '키가 없습니다');
  } else {
    // 존재하지 않을 법한 닉네임으로도 "키 자체가 유효한지"는 판별된다.
    // 키가 틀리면 OPENAPI00005, 키가 맞고 닉네임만 없으면 OPENAPI00003/00004 가 온다.
    const probe = await call('/fconline/v1/id', { params: { nickname: NICKNAME ?? '존재하지않을닉네임_점검용_zzq' }, key });

    // 키 유효성은 "넥슨이 실제로 답했는가" 로만 판정한다.
    // 프록시가 가로챈 403 같은 건 넥슨까지 닿지도 않았으므로 판정 불가로 둔다.
    const fromNexon = probe.ok || probe.code.startsWith('OPENAPI');
    const KEY_REJECTED = ['OPENAPI00005', 'OPENAPI00002'];
    const NICK_NOT_FOUND = ['OPENAPI00003', 'OPENAPI00004'];

    if (probe.ok) {
      okLine('/fconline/v1/id', `${ms(probe.took)} · 키 유효 · ouid ${probe.data.ouid.slice(0, 12)}…`);
      report.auth.valid = true;
      report.flow.ouid = probe.data.ouid;
    } else if (KEY_REJECTED.includes(probe.code)) {
      badLine('/fconline/v1/id', `${probe.code} — ${probe.message}`);
      report.auth.valid = false;
    } else if (NICK_NOT_FOUND.includes(probe.code)) {
      // 넥슨이 인증은 통과시키고 닉네임만 못 찾은 것 = 키는 살아 있다
      okLine('/fconline/v1/id', `${ms(probe.took)} · 키 유효 (${probe.code}: 조회한 닉네임이 없을 뿐)`);
      report.auth.valid = true;
    } else if (probe.code === 'OPENAPI00007') {
      warnLine('/fconline/v1/id', `${probe.code} — ${probe.message} (키는 유효하나 호출 한도 초과)`);
      report.auth.valid = true;
    } else if (fromNexon) {
      warnLine('/fconline/v1/id', `${probe.code} — ${probe.message} (넥슨 쪽 사정, 키 판정 보류)`);
      report.auth.valid = null;
    } else {
      badLine('/fconline/v1/id', `${probe.message} — 요청이 넥슨에 닿지 못해 키를 판정할 수 없습니다`);
      report.auth.valid = null;
    }
  }

  /* 4. 실제 닉네임으로 끝까지 */
  head('4. 전체 흐름 (닉네임 → 매치 상세)');
  if (!key) {
    warnLine('건너뜀', '키가 없습니다');
  } else if (!NICKNAME) {
    warnLine('건너뜀', '--nickname "구단주명" 을 주면 끝까지 실제로 조회합니다');
  } else if (report.auth.valid === false) {
    warnLine('건너뜀', '키가 유효하지 않습니다');
  } else {
    const idRes = report.flow.ouid
      ? { ok: true, data: { ouid: report.flow.ouid }, took: 0 }
      : await call('/fconline/v1/id', { params: { nickname: NICKNAME }, key });

    if (!idRes.ok) {
      badLine(`닉네임 "${NICKNAME}"`, `${idRes.code} — ${idRes.message}`);
    } else {
      const ouid = idRes.data.ouid;
      okLine(`닉네임 "${NICKNAME}" → ouid`, ouid);

      const basic = await call('/fconline/v1/user/basic', { params: { ouid }, key });
      basic.ok
        ? okLine('user/basic', `${ms(basic.took)} · ${basic.data.nickname} · Lv.${basic.data.level}`)
        : badLine('user/basic', `${basic.code} — ${basic.message}`);

      const div = await call('/fconline/v1/user/maxdivision', { params: { ouid }, key });
      div.ok
        ? okLine('user/maxdivision', `${ms(div.took)} · ${div.data.length}건`)
        : badLine('user/maxdivision', `${div.code} — ${div.message}`);

      const matches = await call('/fconline/v1/user/match', { params: { ouid, matchtype: 50, offset: 0, limit: 5 }, key });
      if (matches.ok) {
        okLine('user/match (공식경기)', `${ms(matches.took)} · ${matches.data.length}건`);
        if (matches.data.length) {
          const detail = await call('/fconline/v1/match-detail', { params: { matchid: matches.data[0] }, key });
          if (detail.ok) {
            const side = detail.data.matchInfo?.[0];
            okLine('match-detail', `${ms(detail.took)} · ${detail.data.matchInfo?.length ?? 0}인 · 출전 ${side?.player?.length ?? 0}명`);
            // 매치에 등장한 spid 가 메타에 있는지 = 카탈로그 조인이 실제로 되는지
            if (meta.spids?.length && side?.player?.length) {
              const names = new Map(meta.spids.map((p) => [p.id, p.name]));
              const hit = side.player.filter((p) => names.has(p.spId));
              okLine('출전 선수 ↔ 메타 매칭', `${hit.length}/${side.player.length}명 · 예: ${hit.slice(0, 3).map((p) => `${names.get(p.spId)}(+${p.spGrade})`).join(', ')}`);
            }
          } else {
            badLine('match-detail', `${detail.code} — ${detail.message}`);
          }
        }
      } else {
        badLine('user/match', `${matches.code} — ${matches.message}`);
      }

      const trade = await call('/fconline/v1/user/trade', { params: { ouid, tradetype: 'buy', offset: 0, limit: 5 }, key });
      trade.ok
        ? okLine('user/trade', `${ms(trade.took)} · ${trade.data.length}건`)
        : warnLine('user/trade', `${trade.code} — ${trade.message} (거래 내역 비공개일 수 있음)`);
    }
  }

  /* 판정 */
  head('판정');
  const metaOk = !!meta.seasons?.length && !!meta.spids?.length;
  if (!metaOk) {
    report.verdict = 'meta-unreachable';
    badLine('메타를 못 받았습니다', '네트워크/방화벽에서 open.api.nexon.com 이 열려 있는지 확인하세요');
  } else if (report.auth.valid === true) {
    report.verdict = 'ok';
    okLine('사용 가능', `최신 시즌 ${report.meta.newestSeason?.name ?? '?'} 포함 ${nf(report.meta.spids ?? 0)}장 검색 가능`);
    say();
    say(`  ${C.d}이제 fc-squad-maker/.env.local 에 키를 넣고 npm run dev 를 실행하면${C.x}`);
    say(`  ${C.d}데모 8시즌 대신 위 전체 시즌으로 바뀝니다.${C.x}`);
  } else if (report.auth.valid === false) {
    report.verdict = 'bad-key';
    badLine('키가 통하지 않습니다', 'openapi.nexon.com 에서 FC ONLINE 으로 발급된 키인지, 만료되지 않았는지 확인하세요');
    say();
    say(`  ${C.d}메타 자체는 인증 없이 열리므로, 키 없이도 선수 목록 검색은 동작합니다.${C.x}`);
  } else {
    report.verdict = 'meta-only';
    warnLine('메타만 확인됨', '키 검증은 못 했습니다 (위 3번 참고)');
  }
  say();

  if (JSON_OUT) console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.verdict === 'ok' || report.verdict === 'meta-only' ? 0 : 1;
}

main().catch((err) => {
  console.error('점검 스크립트 자체가 실패했습니다:', err);
  process.exit(2);
});
