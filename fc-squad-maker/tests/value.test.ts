import { describe, expect, it } from 'vitest';
import { ENHANCEMENT_STEPS, MAX_ENHANCEMENT } from '@/lib/fconline/rules';
import { MAX_ESTIMATED_OVR } from '@/lib/players/seasons';
import {
  baseValueOf,
  clampGrade,
  estimateValue,
  GRADE_VALUE_MULTIPLIER,
  MAX_GRADE,
  valueCurve,
} from '@/lib/players/value';
import {
  enhanceCard,
  enhanceCurve,
  OVR_GAIN_BY_GRADE,
  UPGRADE_SUCCESS_RATE,
  upgradeOdds,
} from '@/lib/players/enhance';
import { makeCard } from './helpers';

/**
 * 가치·강화 모델은 "추정"이라고 화면에 써 붙여 뒀지만, 추정이라도
 * 단조성(오버롤이 오르면 값도 오른다, 강화하면 값이 오른다)은 지켜야 한다.
 * 여기가 깨지면 강화 시뮬레이션 그래프가 거꾸로 그려진다.
 */

describe('상수표의 형태', () => {
  it('강화 배수는 +1 ~ +13 열세 개이고 계속 커진다', () => {
    expect(GRADE_VALUE_MULTIPLIER).toHaveLength(MAX_GRADE);
    expect(GRADE_VALUE_MULTIPLIER[0]).toBe(1);
    for (let i = 1; i < GRADE_VALUE_MULTIPLIER.length; i += 1) {
      expect(GRADE_VALUE_MULTIPLIER[i]).toBeGreaterThan(GRADE_VALUE_MULTIPLIER[i - 1]);
    }
  });

  it('오버롤 상승치도 열 개이고 +1 은 0 에서 시작한다', () => {
    expect(OVR_GAIN_BY_GRADE).toHaveLength(MAX_GRADE);
    expect(OVR_GAIN_BY_GRADE[0]).toBe(0);
    for (let i = 1; i < OVR_GAIN_BY_GRADE.length; i += 1) {
      expect(OVR_GAIN_BY_GRADE[i]).toBeGreaterThan(OVR_GAIN_BY_GRADE[i - 1]);
    }
  });

  it('강화 성공률은 아홉 구간이고 갈수록 낮아진다', () => {
    expect(UPGRADE_SUCCESS_RATE).toHaveLength(MAX_GRADE - 1);
    for (let i = 1; i < UPGRADE_SUCCESS_RATE.length; i += 1) {
      expect(UPGRADE_SUCCESS_RATE[i]).toBeLessThan(UPGRADE_SUCCESS_RATE[i - 1]);
    }
    for (const rate of UPGRADE_SUCCESS_RATE) {
      expect(rate).toBeGreaterThan(0);
      expect(rate).toBeLessThanOrEqual(1);
    }
  });
});

describe('clampGrade', () => {
  it('+1 ~ +13 밖의 값을 안으로 접는다', () => {
    expect(clampGrade(0)).toBe(1);
    expect(clampGrade(-5)).toBe(1);
    // 상한은 공식 규칙에서 온다 — 여기 숫자를 박으면 게임에 단계가
    // 추가될 때(실제로 +11~+13 이 그렇게 추가됐다) 테스트만 옛 게임에 남는다.
    expect(clampGrade(MAX_ENHANCEMENT + 1)).toBe(MAX_ENHANCEMENT);
    expect(clampGrade(999)).toBe(MAX_ENHANCEMENT);
  });

  it('소수는 반올림한다', () => {
    expect(clampGrade(3.4)).toBe(3);
    expect(clampGrade(3.6)).toBe(4);
  });
});

describe('baseValueOf — 오버롤 → 기준 BP', () => {
  it('오버롤이 오르면 값도 오른다', () => {
    /*
     * pivot(87) 아래는 바닥값 900 으로 눌려 있어 단조 증가가 성립하지 않는다.
     * 카드 오버롤 표기가 FC 온라인 범위(90~145)로 올라가면서 그 구간은 실제
     * 카드가 존재하지 않는 영역이 됐으므로, 카드가 실제로 놓이는 구간에서 본다.
     */
    for (let ovr = 89; ovr <= 145; ovr += 1) {
      expect(baseValueOf(ovr), `OVR ${ovr}`).toBeGreaterThan(baseValueOf(ovr - 1));
    }
  });

  it('기준점(60) 이하는 바닥값에 머무른다', () => {
    expect(baseValueOf(60)).toBe(900);
    expect(baseValueOf(40)).toBe(900);
    expect(baseValueOf(0)).toBe(900);
  });

  it('오버롤 1 차이의 값 배수는 대략 1.3 배다', () => {
    // 낮은 오버롤에서는 100 단위 반올림이 비율을 흔든다(2000/1600 = 1.25).
    // 곡선의 기울기를 보는 테스트이므로 반올림이 묻히는 구간에서 잰다.
    expect(baseValueOf(120) / baseValueOf(119)).toBeCloseTo(1.315, 1);
  });
});

describe('estimateValue — 시즌 티어 × 강화 단계', () => {
  it('아이콘 시즌이 일반 시즌보다 비싸다', () => {
    const icon = estimateValue({ ovr: 90, seasonClassName: 'ICON (Icon)' });
    const base = estimateValue({ ovr: 90, seasonClassName: '20KL (2020 K League)' });
    expect(icon).toBeGreaterThan(base);
  });

  it('시즌을 모르면 기본 티어로 계산한다 (터지지 않는다)', () => {
    expect(estimateValue({ ovr: 85 })).toBeGreaterThan(0);
    expect(estimateValue({ ovr: 85, seasonClassName: undefined })).toBeGreaterThan(0);
  });

  it('강화 단계를 벗어난 입력도 접어서 계산한다', () => {
    expect(estimateValue({ ovr: 85, grade: 0 })).toBe(estimateValue({ ovr: 85, grade: 1 }));
    expect(estimateValue({ ovr: 85, grade: 99 })).toBe(
      estimateValue({ ovr: 85, grade: MAX_ENHANCEMENT }),
    );
  });
});

describe('valueCurve — +1 ~ +13 가치 곡선', () => {
  it('열 개이고 계속 우상향한다', () => {
    const curve = valueCurve(90, 'ICON (Icon)');
    expect(curve).toHaveLength(MAX_GRADE);
    for (let i = 1; i < curve.length; i += 1) {
      expect(curve[i]).toBeGreaterThan(curve[i - 1]);
    }
  });

  it('낮은 오버롤에서도 단조성이 깨지지 않는다 (반올림 눌림 방지)', () => {
    // 1000 단위 반올림 때문에 저오버롤 구간에서 값이 같아질 수 있는데,
    // 그러면 그래프가 계단처럼 멈춘다. 최소한 뒤로 가지는 않아야 한다.
    for (const ovr of [62, 70, 75, 80]) {
      const curve = valueCurve(ovr);
      for (let i = 1; i < curve.length; i += 1) {
        expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1]);
      }
      expect(curve[9]).toBeGreaterThan(curve[0]);
    }
  });

  it('+10 은 +1 의 280 배 근처다', () => {
    const curve = valueCurve(95, 'ICON (Icon)');
    expect(curve[9] / curve[0]).toBeCloseTo(280, -1);
  });
});

describe('enhanceCard — 카드 한 장의 강화 결과', () => {
  it('오버롤이 표대로 오른다', () => {
    const c = makeCard({ ovr: 90 });
    OVR_GAIN_BY_GRADE.forEach((gain, i) => {
      expect(enhanceCard(c, i + 1).ovr).toBe(90 + gain);
    });
  });

  it('ovrDelta 는 직전 단계와의 차이이고, 다 더하면 총 상승치가 된다', () => {
    const curve = enhanceCurve(makeCard({ ovr: 88 }));
    expect(curve[0].ovrDelta).toBe(0);
    const summed = curve.reduce((sum, step) => sum + step.ovrDelta, 0);
    expect(summed).toBe(OVR_GAIN_BY_GRADE[MAX_GRADE - 1]);
    expect(curve[MAX_GRADE - 1].ovr - curve[0].ovr).toBe(summed);
  });

  it('세부 능력치도 같이 오르고 추정 상한을 넘지 않는다', () => {
    const c = makeCard({
      stats: { pace: 129, shooting: 128, passing: 120, dribbling: 125, defending: 40, physical: 99 },
    });
    const plus10 = enhanceCard(c, 10);
    expect(plus10.stats.pace).toBeLessThanOrEqual(MAX_ESTIMATED_OVR);
    expect(plus10.stats.shooting).toBeLessThanOrEqual(MAX_ESTIMATED_OVR);
    expect(plus10.stats.dribbling).toBeGreaterThan(c.stats.dribbling);
  });

  it('골키퍼 능력치는 있을 때만 따라 오른다', () => {
    const field = enhanceCard(makeCard(), 5);
    expect(field.gk).toBeUndefined();

    const keeper = enhanceCard(
      makeCard({
        positions: ['GK'],
        gk: { diving: 90, handling: 88, kicking: 70, reflexes: 91, speed: 55, positioning: 89 },
      }),
      10,
    );
    expect(keeper.gk!.diving).toBeGreaterThan(90);
    expect(keeper.gk!.reflexes).toBeLessThanOrEqual(MAX_ESTIMATED_OVR);
  });

  it('가치는 카드의 원래 오버롤 기준으로 계산한다 (강화 보너스를 두 번 세지 않는다)', () => {
    const c = makeCard({ ovr: 90 });
    expect(enhanceCard(c, 5).estimatedValue).toBe(
      estimateValue({ ovr: 90, seasonClassName: c.seasonName, grade: 5 }),
    );
  });

  it('enhanceCurve 는 열세 단계를 순서대로 돌려준다', () => {
    const curve = enhanceCurve(makeCard());
    expect(curve.map((s) => s.grade)).toEqual(ENHANCEMENT_STEPS);
  });
});

describe('upgradeOdds — 연속 강화 성공 확률', () => {
  it('한 단계 확률은 표 값 그대로', () => {
    expect(upgradeOdds(1, 2).straightRate).toBeCloseTo(0.95, 10);
    expect(upgradeOdds(9, 10).straightRate).toBeCloseTo(0.05, 10);
  });

  it('여러 단계는 곱, 기대 시도는 역수의 합', () => {
    const odds = upgradeOdds(1, 4);
    expect(odds.steps).toEqual([0.95, 0.9, 0.8]);
    expect(odds.straightRate).toBeCloseTo(0.95 * 0.9 * 0.8, 10);
    expect(odds.expectedAttempts).toBeCloseTo(1 / 0.95 + 1 / 0.9 + 1 / 0.8, 10);
  });

  it('+1 → +10 은 사실상 불가능에 가깝다', () => {
    const odds = upgradeOdds(1, 10);
    expect(odds.steps).toHaveLength(9);
    expect(odds.straightRate).toBeLessThan(0.001);
    expect(odds.expectedAttempts).toBeGreaterThan(30);
  });

  it('목표가 현재와 같거나 낮으면 아무것도 안 한 것', () => {
    expect(upgradeOdds(5, 5)).toEqual({ straightRate: 1, expectedAttempts: 0, steps: [] });
    expect(upgradeOdds(8, 3)).toEqual({ straightRate: 1, expectedAttempts: 0, steps: [] });
  });

  it('범위 밖 입력도 접어서 처리한다', () => {
    expect(upgradeOdds(0, 99)).toEqual(upgradeOdds(1, MAX_ENHANCEMENT));
  });

  it('구간이 길수록 확률은 낮아지고 기대 시도는 늘어난다', () => {
    let prevRate = 1;
    let prevAttempts = 0;
    for (let to = 2; to <= 10; to += 1) {
      const { straightRate, expectedAttempts } = upgradeOdds(1, to);
      expect(straightRate).toBeLessThan(prevRate);
      expect(expectedAttempts).toBeGreaterThan(prevAttempts);
      prevRate = straightRate;
      prevAttempts = expectedAttempts;
    }
  });
});
