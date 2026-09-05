import * as fs from 'node:fs';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  DATA_LAYER,
  deriveValue,
  layerLine,
  mixLayers,
  sourced,
  weakerLayer,
  type DataLayer,
} from '@/lib/data/provenance';
import { ENHANCED_CARD_LAYERS } from '@/lib/players/enhance';
import { CARD_OVR_LAYER } from '@/lib/players/seasons';
import { comparePrice, officialPriceLayer } from '@/lib/market/datacenter';
import { CALL_POLICY, NEXON_RATE_LIMIT_CONFIRMED } from '@/lib/data/policy';
import {
  BASELINE_RANK_UPDATE,
  DATACENTER_BASELINE_CYCLE,
  ENHANCEMENT_TABLE_LAYER,
  ENHANCE_TEAMCOLOR_COUNTS,
  ENHANCE_TEAMCOLOR_TIERS,
  ENHANCE_TEAMCOLOR_VERIFIED,
  LISTING_BAND,
  MAX_ENHANCEMENT,
  OPEN_API_UPDATE,
} from '@/lib/fconline/rules';
import { FRESH_WINDOW_HOURS } from '@/lib/data/freshness';
import { OFFICIAL_TTL_MS, POLITE_GAP_MS } from '@/lib/market/datacenter';
import { MIN_POLL_MS, RETENTION_DAYS } from '@/lib/market/livefeed';
import { computeEnhanceTeamColor } from '@/lib/squad/chemistry';
import { sampleConfidence, SAMPLE_CONFIDENCE_LABEL } from '@/lib/market/observations';
import { PITY_IS_PROJECT_RULE } from '@/lib/pack/boxes';

/**
 * 이 프로젝트의 제1원칙은 "숫자마다 어디서 왔는지 안다" 이다.
 * 그 체계 자체가 무너지면 나머지 표기는 전부 장식이 된다.
 */

describe('출처 계층 체계', () => {
  const ALL: DataLayer[] = [
    'official-api',
    'official-rule',
    'observation',
    'project-estimate',
    'project-policy',
    'demo',
    'unverified',
  ];

  it('일곱 계층이 전부 정의돼 있다', () => {
    for (const layer of ALL) {
      expect(DATA_LAYER[layer], layer).toBeDefined();
      expect(DATA_LAYER[layer].label.length, layer).toBeGreaterThan(0);
      expect(DATA_LAYER[layer].dot.length, layer).toBeGreaterThan(0);
    }
    expect(Object.keys(DATA_LAYER).sort()).toEqual([...ALL].sort());
  });

  it('색점이 서로 겹치지 않는다', () => {
    // 두 계층이 같은 점을 쓰면 배지가 구분 기능을 잃는다.
    const dots = ALL.map((l) => DATA_LAYER[l].dot);
    expect(new Set(dots).size).toBe(dots.length);
  });

  it('섞이면 약한 쪽으로 간다', () => {
    /*
     * 추정 기본 오버롤 + 공식 강화 상승분 = 추정이다. 강한 쪽으로 적으면
     * 섞였다는 사실이 사라지고 사용자는 전부 공식값으로 읽는다.
     */
    expect(weakerLayer('official-rule', 'project-estimate')).toBe('project-estimate');
    expect(weakerLayer('official-api', 'observation')).toBe('observation');
    expect(weakerLayer('demo', 'official-api')).toBe('demo');
    expect(weakerLayer('project-estimate', 'unverified')).toBe('unverified');
    // 같은 계층끼리는 그대로
    expect(weakerLayer('observation', 'observation')).toBe('observation');
  });

  it('추정과 미검증과 정책을 한 칸에 넣지 않는다', () => {
    /*
     * 셋을 '추정' 으로 뭉치면 그 칸이 아무 뜻도 없어진다. 캐시 30분은
     * 추정이 아니라 우리가 정한 값이고, 검증 못 한 파서의 값은 추정도
     * 관측도 아니다.
     */
    const three: DataLayer[] = ['project-estimate', 'project-policy', 'unverified'];
    const labels = three.map((l) => DATA_LAYER[l].label);
    expect(new Set(labels).size).toBe(3);
  });

  it('layerLine 은 점·이름·설명을 한 줄로 준다', () => {
    const line = layerLine('unverified');
    expect(line).toContain(DATA_LAYER.unverified.dot);
    expect(line).toContain(DATA_LAYER.unverified.label);
  });
});

describe('프로젝트 정책값을 넥슨 제한과 섞지 않는다', () => {
  it('넥슨 공식 한도를 확인했다고 주장하지 않는다', () => {
    expect(NEXON_RATE_LIMIT_CONFIRMED).toBe(false);
  });

  it('모든 정책값이 근거 문장을 달고 있다', () => {
    // 숫자만 있고 왜인지 없으면, 다음 사람은 그게 넥슨 제한인지 우리
    // 판단인지 알 수 없다.
    for (const [key, policy] of Object.entries(CALL_POLICY)) {
      expect(policy.value, key).toBeGreaterThan(0);
      expect(policy.why.length, key).toBeGreaterThan(10);
      expect(policy.unit.length, key).toBeGreaterThan(0);
    }
  });
});

describe('강화 팀컬러 (물결)', () => {
  it('검증 못 했다고 표시돼 있다', () => {
    // 커뮤니티 정리에서 가져왔고 넥슨 공지로 대조하지 못했다.
    expect(ENHANCE_TEAMCOLOR_VERIFIED).toBe(false);
  });

  it('단계가 강화 등급 순으로 올라간다', () => {
    for (let i = 1; i < ENHANCE_TEAMCOLOR_TIERS.length; i += 1) {
      expect(ENHANCE_TEAMCOLOR_TIERS[i].minGrade).toBeGreaterThan(
        ENHANCE_TEAMCOLOR_TIERS[i - 1].minGrade,
      );
    }
    // 모든 단계가 실제 강화 범위 안에 있어야 한다.
    for (const tier of ENHANCE_TEAMCOLOR_TIERS) {
      expect(tier.minGrade).toBeGreaterThanOrEqual(1);
      expect(tier.minGrade).toBeLessThanOrEqual(MAX_ENHANCEMENT);
    }
  });

  it('조건을 못 채우면 null', () => {
    const four = Array.from({ length: 4 }, () => ({ grade: 8 }));
    expect(computeEnhanceTeamColor(four)).toBeNull();
    expect(computeEnhanceTeamColor([])).toBeNull();
  });

  it('5강 5명이면 은빛 물결이 발동한다', () => {
    const wave = computeEnhanceTeamColor(Array.from({ length: 5 }, () => ({ grade: 5 })));
    expect(wave?.name).toBe('은빛 물결');
    expect(wave?.requirement).toBe(ENHANCE_TEAMCOLOR_COUNTS.tier1);
  });

  it('8강 8명이면 금빛 2단계 — 더 센 쪽을 고른다', () => {
    /*
     * 8강 8명은 동빛·은빛·금빛 조건을 모두 만족한다. 물결은 중첩되지
     * 않으므로 가장 센 것 하나만 받아야 한다 — 다 더하면 실제 게임보다
     * 후한 점수가 나온다.
     */
    const wave = computeEnhanceTeamColor(Array.from({ length: 8 }, () => ({ grade: 8 })));
    expect(wave?.name).toBe('금빛 물결');
    expect(wave?.requirement).toBe(ENHANCE_TEAMCOLOR_COUNTS.tier2);
    expect(wave?.count).toBe(8);
  });

  it('결과에 미검증 사실이 따라붙는다', () => {
    const wave = computeEnhanceTeamColor(Array.from({ length: 5 }, () => ({ grade: 11 })));
    expect(wave).not.toBeNull();
    expect(wave!.verified).toBe(false);
  });

  it('낮은 강화가 섞여 있으면 그만큼만 센다', () => {
    // 8강 4명 + 3강 4명 → 8강 조건(5명)은 못 채우고 3강 조건(5명)은 채운다.
    const mixed = [
      ...Array.from({ length: 4 }, () => ({ grade: 8 })),
      ...Array.from({ length: 4 }, () => ({ grade: 3 })),
    ];
    const wave = computeEnhanceTeamColor(mixed);
    expect(wave?.name).toBe('동빛 물결');
    expect(wave?.count).toBe(8);
  });
});

describe('표본 두께는 네 단계', () => {
  it('0건과 몇 건과 얇음과 충분을 가른다', () => {
    /*
     * 1건과 9건은 둘 다 '얇음' 이지만 전혀 다른 물건이다 — 1건은 분포가
     * 아니라 그냥 그 한 건이다.
     */
    expect(sampleConfidence(0)).toBe('none');
    expect(sampleConfidence(1)).toBe('very-thin');
    expect(sampleConfidence(3)).toBe('very-thin');
    expect(sampleConfidence(4)).toBe('thin');
    expect(sampleConfidence(9)).toBe('thin');
    expect(sampleConfidence(10)).toBe('ok');
    expect(sampleConfidence(500)).toBe('ok');
  });

  it('네 단계 모두 서로 다른 말을 한다', () => {
    const labels = Object.values(SAMPLE_CONFIDENCE_LABEL);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('공식이라고 주장하지 않는 것들', () => {
  it('천장은 이 시뮬레이터의 규칙이다', () => {
    expect(PITY_IS_PROJECT_RULE).toBe(true);
  });

  it('등록 가격대는 개념만 알고 값은 모른다', () => {
    expect(LISTING_BAND.exists).toBe(true);
    expect(LISTING_BAND.computable).toBe(false);
  });
});

describe('갱신 주기 — 섞으면 안 되는 세 가지 (§60/§61)', () => {
  /*
   * 전부 "몇 시간마다 바뀌나" 한 문장으로 요약되기 때문에 한 숫자로
   * 뭉치기 쉽다. 뭉치면 한쪽에서 들은 사실이 다른 쪽의 근거처럼 쓰인다 —
   * 실제로 이 저장소에 그 뭉침이 있었다.
   */

  it('Open API 갱신 규칙은 매시 정각 + 2시간 전 데이터다', () => {
    expect(OPEN_API_UPDATE.onTheHour).toBe(true);
    expect(OPEN_API_UPDATE.dataLagHours).toBe(2);
  });

  it('그 규칙조차 원문을 대조하지 못했다고 표시한다', () => {
    // 넥슨 도메인이 이그레스 정책에 막혀 있다(CONNECT 403). 전해 들은
    // 내용을 확인한 것처럼 표시하지 않는다.
    expect(OPEN_API_UPDATE.verified).toBe(false);
  });

  it('데이터센터 기준가 집계 주기는 모른다고 말한다', () => {
    // 흔히 쓰이는 "2시간" 은 위 Open API 쪽에서 흘러온 숫자일 수 있다.
    expect(DATACENTER_BASELINE_CYCLE.known).toBe(false);
    // 모른다고 아무 말도 못 하는 건 아니다 — 관측으로 잰다.
    expect(DATACENTER_BASELINE_CYCLE.observed).toBe(true);
  });

  it('기준가 순위 갱신은 집계와 별개다', () => {
    expect(BASELINE_RANK_UPDATE.daily).toBe(true);
    expect(BASELINE_RANK_UPDATE.window).toContain('00');
    expect(BASELINE_RANK_UPDATE.verified).toBe(false);
    // 이 프로젝트는 순위를 읽지 않는다. 안 쓰는 것을 쓰는 것처럼 두지 않는다.
    expect(BASELINE_RANK_UPDATE.used).toBe(false);
  });

  it('신선도 눈금은 넥슨 규칙이 아니라 우리가 고른 값이다', () => {
    /*
     * 예전 이름 REFRESH_INTERVAL_HOURS 는 "넥슨 데이터센터 기준가 집계
     * 주기" 라는 주석을 달고 있었다. 확인한 적 없는 주기를 상수 이름에
     * 못 박아 두면 그 값을 읽는 곳마다 넥슨 규칙처럼 퍼진다.
     */
    expect(FRESH_WINDOW_HOURS).toBe(2);
    // 같은 2 라도 출처가 다르다. 눈금이 기준가 주기를 '아는' 것으로
    // 둔갑하지 않았는지 확인한다.
    expect(DATACENTER_BASELINE_CYCLE.known).toBe(false);
  });

  it('기준가 캐시 수명은 정책 파일 한 곳에서만 정해진다', () => {
    // 30분이라는 숫자가 두 곳에 각각 적혀 있었고, 주석은 2시간을 근거로
    // 대고 있었다 — 근거와 값이 서로 다른 말을 하는 상태였다.
    expect(OFFICIAL_TTL_MS).toBe(CALL_POLICY.datacenterCacheTtl.value * 60_000);
  });
});

describe('숫자 세탁 차단 — 계산을 통과해도 출처가 남는가 (§102/§103/§104)', () => {
  /*
   * 이 저장소의 계층 표기는 오래도록 반쪽이었다. 이름과 배지는 있었지만
   * **값이 출처를 들고 다니지 않았다** — 화면이 `layer="project-estimate"`
   * 처럼 손으로 골라 붙였고, weakerLayer 는 테스트에서만 불렸다.
   * 규칙은 있었지만 지키는 것은 사람의 습관이었고, 습관은 새 화면을
   * 만드는 사람에게 따라오지 않는다.
   */

  it('mixLayers 는 가장 약한 입력을 고른다', () => {
    expect(mixLayers('official-rule', 'project-estimate')).toBe('project-estimate');
    expect(mixLayers('official-api', 'official-rule', 'observation')).toBe('observation');
    expect(mixLayers('observation', 'unverified', 'project-estimate')).toBe('unverified');
    expect(mixLayers('official-api')).toBe('official-api');
  });

  it('deriveValue 는 입력 없이는 결과를 못 만든다', () => {
    // 기본값을 두면 "아무것도 안 넣으면 공식" 같은 사고가 생긴다.
    expect(() => deriveValue(1, [])).toThrow();
    expect(deriveValue(3, [sourced(1, 'official-api'), sourced(2, 'project-estimate')])).toEqual({
      value: 3,
      layer: 'project-estimate',
    });
  });

  it('강화 카드 숫자의 계층은 손으로 고르지 않고 접어서 나온다', () => {
    // 추정 기본 오버롤 + 공식 강화표 = 추정.
    expect(ENHANCED_CARD_LAYERS.ovr).toBe('project-estimate');
    // 거기에 우리 가치 곡선까지 곱하면 여전히 추정.
    expect(ENHANCED_CARD_LAYERS.estimatedValue).toBe('project-estimate');
    // 확률은 공식값 하나만 쓰므로 내려가지 않는다.
    expect(ENHANCED_CARD_LAYERS.odds).toBe('official-rule');
  });

  it('입력이 내려가면 결과 배지도 따라 내려간다', () => {
    /*
     * 이게 하드코딩과의 진짜 차이다. 강화표가 미검증으로 바뀌는 날
     * 화면 문자열을 찾아다니지 않아도 오버롤 배지가 함께 내려가야 한다.
     */
    expect(mixLayers(CARD_OVR_LAYER, 'unverified')).toBe('unverified');
    expect(mixLayers(CARD_OVR_LAYER, ENHANCEMENT_TABLE_LAYER)).toBe(ENHANCED_CARD_LAYERS.ovr);
  });

  it('검증 안 된 파서가 뽑은 기준가는 공식으로 표시하지 않는다', () => {
    // 파서가 숫자를 뱉었다는 것과 그 숫자가 맞다는 것은 다른 얘기다.
    expect(officialPriceLayer({ price: 1_000_000, parserVerified: false })).toBe('unverified');
    expect(officialPriceLayer({ price: 1_000_000, parserVerified: true })).toBe('official-api');
    // 못 읽었으면 층을 논할 값 자체가 없다.
    expect(officialPriceLayer({ price: null, parserVerified: true })).toBe('unverified');
  });

  it('기준가와 관측을 뺀 결과도 계층을 들고 나온다', () => {
    /*
     * 두 숫자에 각각 배지를 달아 두고 뺀 결과에는 아무 표시도 없으면,
     * 그 차이가 어느 층의 이야기인지 아무도 말하지 않게 된다.
     */
    const unverified = comparePrice(1, 1_200_000, 1_000_000, { parserVerified: false });
    expect(unverified.gapPercent).toBeCloseTo(20);
    expect(unverified.layer).toBe('unverified');

    const verified = comparePrice(1, 1_200_000, 1_000_000, { parserVerified: true });
    // 관측(C)과 공시(A)를 섞었으니 약한 쪽인 관측.
    expect(verified.layer).toBe('observation');

    // 기준가를 못 읽은 경우에도 결과에 계층이 붙는다.
    expect(comparePrice(1, 1_200_000, null, { parserVerified: true }).layer).toBe('unverified');
  });

  it('production 코드가 실제로 이 장치를 쓴다', () => {
    /*
     * 예전에는 weakerLayer 가 테스트에서만 불렸다. 장치가 있는데 아무도
     * 안 쓰면 없는 것과 같으므로, 쓰이고 있다는 사실 자체를 검사한다.
     */
    const { readdirSync, readFileSync, statSync } = fs;
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((e) => {
        const full = join(dir, e);
        return statSync(full).isDirectory()
          ? walk(full)
          : /\.tsx?$/.test(full) && !full.endsWith('provenance.ts')
            ? [full]
            : [];
      });

    const users = walk('src').filter((f) => /\bmixLayers\(/.test(readFileSync(f, 'utf8')));
    expect(users.length, 'mixLayers 를 쓰는 production 파일이 없다').toBeGreaterThan(0);
  });
});

describe('숫자 감시표 — 같은 값을 두 곳에 적지 않는다 (§201)', () => {
  /*
   * 이 저장소에서 반복해서 나온 실패 유형이다. 정책 숫자를 한 곳에
   * 모아 두고도, 실제로 쓰는 자리에는 같은 숫자를 다시 적어 두는 것.
   *
   * 그러면 세 가지가 어긋난다.
   *   1. 한쪽만 고쳐진다.
   *   2. 근거와 값이 서로 다른 말을 한다 (OFFICIAL_TTL_MS 의 주석은
   *      "집계 주기가 2시간이라" 인데 값은 30분이었다).
   *   3. '단일 출처' 로 둔 상수를 아무도 안 읽고 죽어 있다
   *      (DATACENTER_AGGREGATION_HOURS 가 그랬다).
   */

  it('운영 정책 숫자는 policy.ts 에서만 나온다', () => {
    expect(RETENTION_DAYS).toBe(CALL_POLICY.observationRetention.value);
    expect(MIN_POLL_MS).toBe(CALL_POLICY.marketRefreshCooldown.value * 1_000);
    expect(POLITE_GAP_MS).toBe(CALL_POLICY.datacenterGap.value * 1_000);
    expect(OFFICIAL_TTL_MS).toBe(CALL_POLICY.datacenterCacheTtl.value * 60_000);
  });

  it('policy.ts 의 숫자를 소스에 그대로 다시 적지 않았다', () => {
    /*
     * 값이 우연히 같아지는 것으로는 안 된다 — 리터럴이 남아 있으면
     * 다음 사람이 그걸 고치고 정책 파일은 그대로 둔다. 실제로 파일을
     * 읽어 리터럴이 사라졌는지 본다.
     */
    const read = (f: string) => readFileSync(f, 'utf8');
    expect(read('src/lib/market/livefeed.ts')).not.toMatch(/RETENTION_DAYS\s*=\s*\d/);
    expect(read('src/lib/market/livefeed.ts')).not.toMatch(/MIN_POLL_MS\s*=\s*\d/);
    expect(read('src/lib/market/datacenter.ts')).not.toMatch(/POLITE_GAP_MS\s*=\s*\d/);
    expect(read('src/lib/market/datacenter.ts')).not.toMatch(/OFFICIAL_TTL_MS\s*=\s*\d/);
  });

  it('규칙 상수를 아무도 안 읽는 채로 두지 않는다', () => {
    /*
     * DATACENTER_AGGREGATION_HOURS 는 "단일 출처" 로 만들어 두고 정작
     * 아무 데서도 안 읽혔다. 같은 숫자가 freshness.ts 에 따로 적혀
     * 있었고, 그쪽이 실제로 쓰이고 있었다. 죽은 단일 출처는 단일
     * 출처가 아니라 그냥 오해의 소지다.
     */
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((e) => {
        const full = join(dir, e);
        return statSync(full).isDirectory() ? walk(full) : /\.tsx?$/.test(full) ? [full] : [];
      });
    const all = walk('src');
    const rulesText = readFileSync('src/lib/fconline/rules.ts', 'utf8');

    const exported = [...rulesText.matchAll(/^export const ([A-Z][A-Z0-9_]*)/gm)].map((m) => m[1]);
    expect(exported.length).toBeGreaterThan(5);

    /*
     * 선언 줄 자체는 사용이 아니다. 같은 파일 안에서 쓰이는 것은
     * 사용으로 친다 — MIN_ENHANCEMENT 처럼 clampEnhancement 안에서만
     * 쓰이는 값도 제 몫을 하고 있다.
     */
    const dead = exported.filter((name) => {
      const uses = all.reduce((count, file) => {
        const text = readFileSync(file, 'utf8');
        const hits = text.match(new RegExp(`\\b${name}\\b`, 'g'))?.length ?? 0;
        // rules.ts 안에서는 선언 한 번을 빼고 센다.
        return count + (file.endsWith('fconline/rules.ts') ? Math.max(0, hits - 1) : hits);
      }, 0);
      return uses === 0;
    });

    /*
     * 예외 하나. BASELINE_RANK_UPDATE 는 "이 프로젝트는 순위를 쓰지
     * 않는다" 는 사실 자체를 적어 둔 것이라, 아무도 안 읽는 것이 맞다 —
     * 다음 사람이 기준가 집계 주기와 헷갈리지 않게 두는 표지다.
     */
    expect(dead.filter((n) => n !== 'BASELINE_RANK_UPDATE')).toEqual([]);
  });
});
