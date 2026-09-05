import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MIN_SAMPLES, THIN_SAMPLES, TRADE_SAMPLE_DISCLAIMER } from '@/lib/market/observations';
import { ENHANCEMENT_STEPS, LISTING_BAND, MAX_ENHANCEMENT } from '@/lib/fconline/rules';
import { MOCK_GRADE_CDF } from '@/lib/nexon/mock';

/**
 * ── 문구 감사 ─────────────────────────────────────────────
 *
 * 이 프로젝트의 데이터는 세 층이다.
 *   A. 넥슨 공식 API 가 준 값
 *   B. FC 온라인 공식 규칙
 *   C. 이 프로젝트의 추정
 *
 * C 를 A 처럼 적으면 사용자는 추정치로 실제 거래를 한다. 그래서 화면
 * 문구는 취향이 아니라 **정확성 요건**이고, 취향이 아니라면 테스트가
 * 지켜야 한다. 코드 리뷰로만 막으면 반년 뒤 누군가 "실시간 시세" 라고
 * 다시 쓴다 — 그게 더 짧고 더 그럴듯해 보이니까.
 *
 * 소스 텍스트를 직접 훑는 테스트다. 조금 거칠지만, 여기서 막으려는 것이
 * 런타임 동작이 아니라 **우리가 사용자에게 하는 말**이라 다른 방법이 없다.
 */

const SRC = new URL('../src', import.meta.url).pathname;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.tsx?$/.test(path) ? [path] : [];
  });
}

const FILES = walk(SRC).map((path) => ({
  path: path.slice(SRC.length + 1),
  text: readFileSync(path, 'utf-8'),
}));

/** 위반한 파일 목록 — 실패 메시지에 어디를 고쳐야 하는지 그대로 뜨게 */
function filesContaining(needle: string | RegExp): string[] {
  const test = typeof needle === 'string'
    ? (text: string) => text.includes(needle)
    : (text: string) => needle.test(text);
  return FILES.filter((file) => test(file.text)).map((file) => file.path);
}

describe('거래 데이터의 주체를 과장하지 않는다', () => {
  it('소스 어디에도 우리 표본을 시장 전체라고 부르는 말이 없다', () => {
    /*
     * `/user/trade` 는 전체 이적시장의 전수 거래가 아니라, 현재 Open API
     * 인증 주체에서 조회 가능한 거래 기록이다. "이 선수 오늘 3,412건
     * 거래됨" 이라고 적으면 표본 몇 건이 시장 통계로 둔갑한다.
     */
    /*
     * 딱 세 곳만 이 말을 쓸 수 있다 — 전부 **그게 아니라고 말하기 위해**서다.
     * 표현 자체를 금지하면 "이건 시장 전체가 아니다" 라고 적을 수도 없어진다.
     */
    const DENYING = new Set([
      // 고지문 본문: "…전수 거래 데이터가 아닙니다"
      'lib/market/observations.ts',
      // Open API 가 주지 **않는** 것들의 목록
      'lib/fconline/rules.ts',
      // TradeRecord 주석: "화면에서 이렇게 말하면 안 된다"
      'lib/nexon/types.ts',
    ]);

    for (const phrase of ['전체 시장 거래량', '시장 전체 거래량', '전체 거래량', '전수 거래 데이터']) {
      const hits = filesContaining(phrase).filter((path) => !DENYING.has(path));
      expect(hits, `"${phrase}" 를 쓴 파일`).toEqual([]);
    }
  });

  it("'실시간' 이라고 부르지 않는다", () => {
    /*
     * 갱신되는 건 우리 표본이지 시장이 아니다. 새 관측은 누군가를 조회했을
     * 때만 들어오므로, 조회가 없으면 이 지수는 몇 시간이고 멈춰 있다.
     * '실시간' 은 그 멈춤을 감춘다.
     *
     * 데이터센터 파서 주석의 "실시간 호가가 있는 이적시장은 읽지 않는다"
     * 처럼 **하지 않는 일**을 적은 문장은 예외다.
     */
    const claiming = FILES.filter((file) =>
      /실시간\s*(시세|가격|체결|거래량)/.test(file.text),
    ).map((file) => file.path);
    expect(claiming).toEqual([]);
  });

  it('고지문이 무엇이 아닌지부터 말한다', () => {
    expect(TRADE_SAMPLE_DISCLAIMER).toContain('전수 거래 데이터가 아닙니다');
    expect(TRADE_SAMPLE_DISCLAIMER).toContain('Open API 인증 주체');
    expect(TRADE_SAMPLE_DISCLAIMER).toContain('관측 표본');
  });

  it('가격을 보여 주는 두 화면 모두 고지문을 띄운다', () => {
    // 한쪽에만 붙이면, 다른 쪽으로 들어온 사용자는 못 본다.
    for (const path of ['components/market/MarketObservatory.tsx', 'components/market/CardPriceSearch.tsx']) {
      const file = FILES.find((f) => f.path === path);
      expect(file, path).toBeDefined();
      expect(file!.text, path).toContain('<TradeSampleNote');
    }
  });
});

describe('표본이 얇다는 것을 숨기지 않는다', () => {
  it('경고 기준이 최소 표본보다 넉넉하다', () => {
    /*
     * MIN_SAMPLES 는 "여기 아래는 통계가 아니다" 의 선이지 "여기부터는
     * 믿어도 된다" 가 아니다. 3~4건짜리 중앙값은 한 사람의 급매 하나에
     * 통째로 끌려가므로, 계산은 하되 경고를 붙이는 구간이 그 위에 따로
     * 있어야 한다. 둘이 같아지면 그 구간이 사라진다.
     */
    expect(THIN_SAMPLES).toBeGreaterThan(MIN_SAMPLES);
  });

  it('가격 화면이 얇은 표본을 경고한다', () => {
    const file = FILES.find((f) => f.path === 'components/market/CardPriceSearch.tsx');
    expect(file).toBeDefined();
    expect(file!.text).toContain('THIN_SAMPLES');
  });

  it('등급 혼합 경고가 폭의 원인을 단정하지 않는다', () => {
    /*
     * 섞인 표만 봐서는 넓어 보이는 폭의 얼마가 등급 차이고 얼마가 실제
     * 가격 변동인지 가를 수 없다. "전부 등급 때문" 이라고 적으면 우리가
     * 아는 것보다 많이 말하는 것이다.
     */
    const file = FILES.find((f) => f.path === 'components/market/GradeSelect.tsx');
    expect(file).toBeDefined();

    // 화면에 나가는 부분만 본다. 위쪽 주석에는 "한때 이렇게 단정했다" 는
    // 설명이 있어야 하고, 그 문장까지 금지하면 왜 바꿨는지를 적을 수 없다.
    const rendered = file!.text.slice(file!.text.indexOf('export function MixedGradeWarning'));
    expect(rendered).toContain('가를 수 없습니다');
    expect(rendered).not.toMatch(/폭은 전부|전부 등급 (차이|때문)/);
  });
});

describe('우리 가격 지수를 공식 지수라고 부르지 않는다', () => {
  it('거래 관측소가 넥슨 공시 지수가 아님을 적는다', () => {
    const file = FILES.find((f) => f.path === 'components/market/MarketObservatory.tsx');
    expect(file).toBeDefined();
    expect(file!.text).toContain('넥슨이 공시하는 가격지수가 아닙니다');
  });
});

describe('게임의 하한가/상한가를 우리 사분위값에 붙이지 않는다', () => {
  /*
   * FC 온라인의 하한가/상한가는 **게임이 정하는 등록 가능 구간**이다.
   * 기준가를 중심으로 잡히고, 그 밖으로는 등록 자체가 되지 않는다.
   *
   * 우리 p25/p75 는 우리가 본 거래의 가운데 절반이 놓인 구간이다. 둘은
   * 전혀 다른 물건인데, 화면에서 이름이 같아지면 사용자는 우리 관측값을
   * 게임이 강제하는 선으로 읽고 그 아래 가격은 시도조차 하지 않는다.
   */
  it('배율을 확정하지 못했으므로 계산하지 않는다', () => {
    expect(LISTING_BAND.exists).toBe(true);
    expect(LISTING_BAND.multipliersConfirmed).toBe(false);
    // 확정 못 한 배율로는 값을 내지 않는다. 셋이 어긋나면 둘 중 하나가
    // 거짓말이므로 여기서 걸린다.
    expect(LISTING_BAND.computable).toBe(false);
  });

  it('가격 화면이 하한가/상한가를 값의 이름으로 쓰지 않는다', () => {
    for (const path of [
      'components/market/MarketObservatory.tsx',
      'components/market/CardPriceSearch.tsx',
    ]) {
      const file = FILES.find((f) => f.path === path);
      expect(file, path).toBeDefined();
      // label / sub 속성에 그 단어가 들어가면 그건 값의 이름으로 쓴 것이다.
      // 설명 문장에서 "그것과 다르다" 고 적는 것은 막지 않는다.
      expect(file!.text, path).not.toMatch(/(label|sub)=["'{][^"'}]*(하한가|상한가)/);
    }
  });

  it('둘이 다르다는 사실을 화면에 적는다', () => {
    const file = FILES.find((f) => f.path === 'components/market/MarketObservatory.tsx');
    expect(file!.text).toContain('하한가·상한가');
    expect(file!.text).toContain('알지 못합니다');
  });
});

describe('보관 기한을 약관 인용으로 적지 않는다', () => {
  it('30일이 약관상 의무라고 단정하지 않는다', () => {
    /*
     * 넥슨 이용약관 원문을 이 환경에서 열지 못했다. 확인하지 않은 것을
     * "약관이 요구한다" 고 적으면, 우리 정책값에 남의 권위를 빌리는 것이다.
     * 30일은 이 프로젝트가 스스로 건 상한이다.
     */
    const claiming = FILES.filter((file) =>
      /약관[^\n]{0,40}(요구|의무)/.test(file.text) && !/적지\s*않는다|아니다/.test(file.text),
    ).map((file) => file.path);
    expect(claiming).toEqual([]);
  });
});

describe('공식이 아닌 것을 공식이라 부르지 않는다 (전수 문구 감사)', () => {
  /*
   * 여기 목록은 이 프로젝트가 실제로 저질렀던 표현들이다. 하나하나가
   * 사용자에게 "이건 게임이 정한 값" 이라고 말하는 문장이었고, 전부
   * 사실이 아니었다. 다시 들어오면 여기서 걸린다.
   */
  const BANNED: Array<[RegExp, string]> = [
    [/실시간\s*시세/, "'실시간 시세' — 갱신되는 건 우리 표본이지 시장이 아니다"],
    [/real-?time\s*price/i, "'real-time price' — 같은 이유"],
    [/live\s*price/i, "'live price' — Open API 에 호가 엔드포인트가 없다"],
    [/현재\s*호가/, "'현재 호가' — 제공하지 않는 데이터다"],
    [/전체\s*시장\s*거래량/, "'전체 시장 거래량' — 우리 표본은 전수가 아니다"],
    [/공식\s*가격\s*지수/, "'공식 가격지수' — 넥슨 공시 지수가 따로 있다"],
    [/공식\s*OVR/, "'공식 OVR' — Open API 는 오버롤을 주지 않는다"],
    [/공식\s*강화\s*확률/, "'공식 강화 확률' — 성공률은 우리 근사표다"],
    [/FC\s*온라인\s*천장/, "'FC 온라인 천장' — 천장은 이 시뮬레이터의 규칙이다"],
    [/포메이션[^\n]{0,10}복원/, "'포메이션 복원' — API 는 포메이션 이름을 주지 않는다"],
    [/22명\s*(전원|전체)/, "'22명 전원' — 응답이 그만큼 온다는 보장이 없다"],
  ];

  it('금지 표현이 소스 어디에도 없다', () => {
    const failures: string[] = [];
    for (const [pattern, why] of BANNED) {
      for (const file of FILES) {
        /*
         * 주석에서 "이렇게 쓰면 안 된다" 고 설명하는 것은 막지 않는다.
         * 부인은 다음 줄로 넘어가는 일이 잦아서(줄바꿈이 문장 중간에
         * 들어간다) 걸린 줄과 그 다음 줄을 같이 본다 — 한 줄만 보면
         * "…처럼 / 말하면 안 된다" 가 위반으로 잡힌다.
         */
        const lines = file.text.split('\n');
        lines.forEach((line, i) => {
          if (!pattern.test(line)) return;
          const context = `${line} ${lines[i + 1] ?? ''}`;
          const denies = /아니|않|없|말라|마라|금지|한때|예전|대신/.test(context);
          if (!denies) failures.push(`${file.path}: ${line.trim().slice(0, 80)}  ← ${why}`);
        });
      }
    }
    expect(failures).toEqual([]);
  });
});

describe('강화 단계는 공식 표를 따른다', () => {
  it('+1 ~ +13 열세 단계다', () => {
    // 2024 겨울 업데이트로 +11~+13 이 추가됐다. +10 을 상한으로 적은
    // 문서·코드가 남아 있으면 화면은 옛 게임을 설명하게 된다.
    expect(MAX_ENHANCEMENT).toBe(13);
    expect(ENHANCEMENT_STEPS).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });

  it('데모 거래도 +13 까지 나온다', () => {
    /*
     * 데모 분포가 +10 에서 끊겨 있으면, 화면에서 +11 을 골랐을 때 데모
     * 환경에서는 영영 "관측 없음" 이다. 기능이 고장 난 것처럼 보이지만
     * 사실은 데이터를 안 만든 것이고, 그 차이는 화면에서 구별되지 않는다.
     */
    expect(MOCK_GRADE_CDF[MOCK_GRADE_CDF.length - 1][0]).toBe(MAX_ENHANCEMENT);
    expect(MOCK_GRADE_CDF.map(([grade]) => grade)).toEqual(ENHANCEMENT_STEPS);
    // 누적 확률표이므로 단조 증가하고 1 에서 끝나야 한다.
    expect(MOCK_GRADE_CDF[MOCK_GRADE_CDF.length - 1][1]).toBe(1);
    for (let i = 1; i < MOCK_GRADE_CDF.length; i += 1) {
      expect(MOCK_GRADE_CDF[i][1]).toBeGreaterThan(MOCK_GRADE_CDF[i - 1][1]);
    }
  });

  it('소스에 +1~+10 을 상한처럼 적은 곳이 없다', () => {
    const hits = filesContaining(/\+1\s*~\s*\+10(?!\d)/).filter(
      // 옛 상한을 언급하며 바뀐 사실을 설명하는 주석은 남겨 둔다.
      (path) => !FILES.find((f) => f.path === path)!.text.includes('한때'),
    );
    expect(hits).toEqual([]);
  });
});
