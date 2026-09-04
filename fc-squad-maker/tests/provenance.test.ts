import { describe, expect, it } from 'vitest';

import { DATA_LAYER, layerLine, weakerLayer, type DataLayer } from '@/lib/data/provenance';
import { CALL_POLICY, NEXON_RATE_LIMIT_CONFIRMED } from '@/lib/data/policy';
import {
  ENHANCE_TEAMCOLOR_COUNTS,
  ENHANCE_TEAMCOLOR_TIERS,
  ENHANCE_TEAMCOLOR_VERIFIED,
  LISTING_BAND,
  MAX_ENHANCEMENT,
} from '@/lib/fconline/rules';
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
