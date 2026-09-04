#!/usr/bin/env node
/**
 * 넥슨 데이터센터 공개 페이지 구조 탐침
 *
 *   node scripts/probe-datacenter.mjs                      # 기본 카드로 점검
 *   node scripts/probe-datacenter.mjs --spid 300235494     # 특정 카드
 *   node scripts/probe-datacenter.mjs --grade 5            # 강화 등급
 *   node scripts/probe-datacenter.mjs --dump page.html     # 받은 HTML 저장
 *   node scripts/probe-datacenter.mjs --json               # 결과를 JSON 으로
 *
 * 왜 이 스크립트가 있나
 *   `lib/market/datacenter.ts` 의 파서는 실제 응답을 한 번도 보지 못한 채
 *   작성됐다. 개발 환경에서 넥슨 도메인이 막혀 있었기 때문이다. 그래서
 *   파서를 하나로 확정하는 대신 여러 전략을 순서대로 시도하게 해 뒀고,
 *   이 스크립트가 "실제로는 어떤 구조인가" 를 알려 주는 역할을 한다.
 *
 * 무엇을 보나
 *   1. 페이지가 로그인 없이 열리는가 (열려야 정상 — 공개 페이지다)
 *   2. 파서 4개 전략 중 무엇이 걸리는가
 *   3. 안 걸리면, 가격처럼 생긴 것 주변이 어떻게 생겼는가
 *   4. 값을 JSON 으로 따로 주는 XHR 엔드포인트 흔적이 있는가
 *
 * 의존성 없음. Node 18+ 의 내장 fetch 만 씁니다.
 */

import { writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const has = (name) => argv.includes(`--${name}`);

const SPID = Number(arg('spid') ?? 300235494);
const GRADE = Number(arg('grade') ?? 1);
const DUMP = arg('dump');
const JSON_OUT = has('json');

const BASE = 'https://fconline.nexon.com';
const PLAYER_URL = `${BASE}/DataCenter/PlayerInfo?spid=${SPID}&n1Strong=${GRADE}`;
const DAILY_URL = `${BASE}/datacenter/dailytrade`;

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  bad: (s) => `\x1b[31m${s}\x1b[0m`,
  warn: (s) => `\x1b[33m${s}\x1b[0m`,
};
const say = (...a) => { if (!JSON_OUT) console.log(...a); };

/* ── 파서 전략 (datacenter.ts 와 같은 순서·같은 정규식) ────── */

function parseBP(text) {
  const cleaned = text.replace(/\s/g, '');
  const eok = /(\d[\d,]*)억/.exec(cleaned);
  const man = /(\d[\d,]*)만/.exec(cleaned);
  if (eok || man) {
    const n = (m) => (m ? Number(m[1].replace(/,/g, '')) : 0);
    const rest = /만\s*(\d[\d,]*)/.exec(cleaned);
    return n(eok) * 100_000_000 + n(man) * 10_000 + (rest ? Number(rest[1].replace(/,/g, '')) : 0);
  }
  const plain = /(\d[\d,]{2,})/.exec(cleaned);
  if (!plain) return null;
  const v = Number(plain[1].replace(/,/g, ''));
  return Number.isFinite(v) ? v : null;
}

const STRATEGIES = [
  ['embedded-json', (html) => {
    for (const p of [
      /"(?:price|tradePrice|basePrice|value)"\s*:\s*"?(\d[\d,]*)"?/i,
      // data-price="..." 같은 HTML 속성을 JSON 으로 오인하지 않게 한다.
      /(?<![-\w])(?:price|tradePrice|basePrice)\s*[:=]\s*"?(\d[\d,]*)"?/i,
    ]) {
      const m = p.exec(html);
      if (m) { const v = Number(m[1].replace(/,/g, '')); if (v > 0) return v; }
    }
    return null;
  }],
  ['data-attribute', (html) => {
    const m = /data-(?:price|value|bp)\s*=\s*["'](\d[\d,]*)["']/i.exec(html);
    if (!m) return null;
    const v = Number(m[1].replace(/,/g, ''));
    return v > 0 ? v : null;
  }],
  ['price-class', (html) => {
    const m = /class\s*=\s*["'][^"']*(?:price|bp|value)[^"']*["'][^>]*>([^<]{1,40})</i.exec(html);
    return m ? parseBP(m[1]) : null;
  }],
  ['bp-label', (html) => {
    const text = html.replace(/<[^>]+>/g, ' ');
    const m = /(\d[\d,]{2,})\s*BP/i.exec(text) ?? /BP\s*(\d[\d,]{2,})/i.exec(text);
    return m ? parseBP(m[1]) : null;
  }],
];

/* ── 진단 도우미 ──────────────────────────────────────────── */

/** 가격처럼 생긴 숫자 주변을 잘라 보여 준다 — 파서가 다 실패했을 때의 단서. */
function priceNeighborhoods(html, limit = 5) {
  const out = [];
  const re = /(\d{1,3}(?:,\d{3}){1,}|\d[\d,]*\s*[억만])/g;
  let m;
  while ((m = re.exec(html)) !== null && out.length < limit) {
    const from = Math.max(0, m.index - 90);
    const snippet = html.slice(from, m.index + m[0].length + 60).replace(/\s+/g, ' ').trim();
    out.push(snippet);
  }
  return out;
}

/** 값을 따로 주는 XHR 이 있는지 흔적을 찾는다. */
function apiHints(html) {
  const hints = new Set();
  for (const re of [
    /["'](\/[A-Za-z0-9_\-/]*(?:api|ajax|json|price|trade)[A-Za-z0-9_\-/]*)["']/gi,
    /url\s*:\s*["']([^"']+)["']/gi,
  ]) {
    let m;
    while ((m = re.exec(html)) !== null) {
      const u = m[1];
      if (u.length > 4 && u.length < 160 && !/\.(png|jpg|gif|svg|css|woff2?)$/i.test(u)) {
        hints.add(u);
      }
    }
  }
  return [...hints].slice(0, 12);
}

async function get(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'ko-KR,ko;q=0.9',
        // 평범한 브라우저처럼 보이게 한다. 우회가 아니라, UA 가 비면
        // 아예 다른 페이지를 주는 서버가 흔해서 진단이 헛돈다.
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
      },
    });
    return { ok: res.ok, status: res.status, html: await res.text() };
  } catch (e) {
    return { ok: false, status: 0, html: '', error: String(e?.message ?? e) };
  } finally {
    clearTimeout(timer);
  }
}

/* ── 실행 ─────────────────────────────────────────────────── */

const report = { spid: SPID, grade: GRADE, pages: {} };

say(c.bold('\n넥슨 데이터센터 구조 탐침'));
say(c.dim(`카드 ${SPID} · 강화 +${GRADE}\n`));

for (const [label, url] of [['playerInfo', PLAYER_URL], ['dailyTrade', DAILY_URL]]) {
  say(c.bold(label), c.dim(url));
  const res = await get(url);
  const entry = { url, status: res.status, ok: res.ok, bytes: res.html.length };

  if (!res.ok) {
    entry.error = res.error ?? `HTTP ${res.status}`;
    say(' ', c.bad('✗'), entry.error);
    // 여기서 막히면 파싱은 볼 필요가 없다.
    if (res.status === 0) say('   ', c.dim('네트워크·차단 문제입니다. 브라우저로는 열리는지 확인해 보세요.'));
    say('');
    report.pages[label] = entry;
    continue;
  }

  say(' ', c.ok('✓'), `HTTP ${res.status} · ${res.html.length.toLocaleString('ko-KR')} bytes`);

  // 로그인 벽에 걸렸는지 (공개 페이지여야 정상)
  if (/login|로그인/i.test(res.html.slice(0, 4000))) {
    entry.loginWall = true;
    say('   ', c.warn('!'), '문서 앞부분에 로그인 관련 문구가 보입니다. 공개 페이지가 맞는지 확인 필요.');
  }

  const hit = STRATEGIES.map(([name, fn]) => [name, fn(res.html)]).find(([, v]) => v !== null);
  if (hit) {
    entry.strategy = hit[0];
    entry.price = hit[1];
    say('   ', c.ok('가격 인식'), `${hit[1].toLocaleString('ko-KR')} BP`, c.dim(`(${hit[0]})`));
  } else {
    entry.strategy = 'none';
    say('   ', c.warn('가격을 못 읽었습니다.'), c.dim('주변 구조를 보여 드립니다:'));
    entry.neighborhoods = priceNeighborhoods(res.html);
    entry.neighborhoods.forEach((s, i) => say(c.dim(`     ${i + 1}. ${s.slice(0, 170)}`)));
    if (entry.neighborhoods.length === 0) {
      say(c.dim('     가격처럼 생긴 숫자가 아예 없습니다 — 값을 XHR 로 따로 부르는 구조일 수 있습니다.'));
    }
  }

  entry.apiHints = apiHints(res.html);
  if (entry.apiHints.length) {
    say('   ', c.dim('XHR 후보:'), c.dim(entry.apiHints.slice(0, 6).join('  ')));
  }

  report.pages[label] = entry;
  say('');

  if (DUMP && label === 'playerInfo') {
    writeFileSync(DUMP, res.html);
    say(c.dim(`   HTML 저장: ${DUMP}\n`));
  }

  // 남의 서버다. 연속 요청 사이에 간격을 둔다.
  await new Promise((r) => setTimeout(r, 1000));
}

/*
 * 한 페이지라도 파서가 값을 뽑았는가.
 *
 * 페이지를 아예 못 받은 것(403·네트워크 차단)과, 받았는데 파서가 못 읽은
 * 것은 다른 문제다. 앞은 환경을 고쳐야 하고 뒤는 코드를 고쳐야 한다.
 */
const parsed = Object.values(report.pages).some((p) => p.strategy && p.strategy !== 'none');
const reached = Object.values(report.pages).some((p) => p.status && p.status < 400);

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
} else {
  say(c.bold(parsed ? c.ok('파서가 통했습니다.') : c.warn('파서 조정이 필요합니다.')));
  if (!reached) {
    say(c.dim('페이지를 하나도 받지 못했습니다 — 파서 문제가 아니라 네트워크/차단입니다.'));
    say(c.dim('이 환경에서 fconline.nexon.com 이 열리는지 먼저 확인하세요.\n'));
  } else if (!parsed) {
    say(c.dim('위의 "주변 구조" 와 "XHR 후보" 를 그대로 복사해 주시면'));
    say(c.dim('lib/market/datacenter.ts 의 전략을 실제 구조에 맞춰 고치겠습니다.\n'));
  }
}

/*
 * 종료 코드로도 알린다. 예전에는 아무것도 못 뚫고도 0 을 반환해서,
 * 스크립트로 감싸 돌리면 "성공" 으로 보였다 — 탐침이 탐침에 실패한
 * 것을 성공이라고 하면 안 된다.
 *   0  파서가 값을 뽑음
 *   1  페이지는 받았지만 파서가 못 읽음 (코드를 고칠 차례)
 *   2  페이지를 못 받음 (환경 문제)
 */
process.exitCode = parsed ? 0 : reached ? 1 : 2;
