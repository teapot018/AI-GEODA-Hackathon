import { describe, expect, it } from 'vitest';
import { DEMO_SEASONS, seasonCode, seasonRule, seasonTier } from '@/lib/players/seasons';

/**
 * 시즌 티어는 카드 가치·오버롤 보정·상자 등급 풀을 전부 좌우한다.
 * 그런데 판정 기준이 문자열이라, 새 시즌이 하나 추가될 때마다 조용히
 * 오분류될 여지가 있다. 여기서 규칙을 못 박아 둔다.
 */
describe('seasonCode — className 에서 코드만 떼기', () => {
  it('괄호 앞부분만 쓰고 연도 접두어는 뗀다', () => {
    expect(seasonCode('ICON (Icon)')).toBe('ICON');
    expect(seasonCode('23UP (23 Ultimate Player)')).toBe('UP');
    expect(seasonCode('22TT (22 Team of the Tournament)')).toBe('TT');
    expect(seasonCode('20KL (2020 K League)')).toBe('KL');
    expect(seasonCode('LH (Live Heroes)')).toBe('LH');
    expect(seasonCode('LIVE ICON (Live Icon)')).toBe('LIVEICON');
  });

  it('괄호가 없어도 동작한다', () => {
    expect(seasonCode('TOTY')).toBe('TOTY');
    expect(seasonCode('  tc  ')).toBe('TC');
  });

  it('빈 문자열도 터지지 않는다', () => {
    expect(seasonCode('')).toBe('');
    expect(seasonCode('(설명만 있음)')).toBe('');
  });
});

/**
 * ── 회귀 테스트 ──────────────────────────────────────────────
 * 예전 판정 로직은 className **전체**에서 키워드를 부분 검색했다.
 * 그래서 아이콘 키워드 'HEROES' 가 "LH (Live Heroes)" 의 괄호 안을 잡아
 * 레전드여야 할 LH 시즌을 아이콘으로 분류했다(가치 3.6배 → 6.0배).
 */
describe('회귀: 괄호 안 단어에 낚이지 않는다', () => {
  it('LH (Live Heroes) 는 아이콘이 아니라 레전드다', () => {
    expect(seasonTier('LH (Live Heroes)')).toBe('legend');
  });

  it('풀네임에 ICON 이 들어가도 코드가 아니면 아이콘이 아니다', () => {
    expect(seasonTier('XX (Iconic Moments)')).toBe('base');
  });

  it("짧은 코드가 다른 단어 속에서 매칭되지 않는다 ('TC' ⊂ 'MATCH')", () => {
    expect(seasonTier('MW (Match Winner)')).toBe('base');
    expect(seasonTier('BM (Best Match)')).toBe('base');
  });
});

describe('seasonTier — 코드별 분류', () => {
  it.each([
    ['ICON (Icon)', 'icon'],
    ['LIVE ICON (Live Icon)', 'icon'],
    ['TC (Team Color)', 'legend'],
    ['BTB (Back To Back)', 'legend'],
    ['TKL (Team of K League)', 'legend'],
    ['23UP (23 Ultimate Player)', 'high'],
    ['22TT (22 Team of the Tournament)', 'high'],
    ['NG (Next Generation)', 'high'],
    ['TOTY (Team of the Year)', 'high'],
    ['NHD (New Heroes Debut)', 'mid'],
    ['VTR (Veteran)', 'mid'],
    ['20KL (2020 K League)', 'base'],
    ['NORMAL', 'base'],
  ])('%s → %s', (className, tier) => {
    expect(seasonTier(className)).toBe(tier);
  });

  it('한글 표기도 잡는다', () => {
    expect(seasonTier('아이콘 클래스')).toBe('icon');
    expect(seasonTier('레전드 클래스')).toBe('legend');
  });

  it('시즌명을 모르면 기본 티어', () => {
    expect(seasonTier(undefined)).toBe('base');
    expect(seasonTier('')).toBe('base');
  });

  it('처음 보는 새 시즌 코드는 기본 티어로 안전하게 떨어진다', () => {
    // 아직 목록에 없는 코드가 와도 터지지 않고 base 로 간다.
    expect(seasonTier('26XX (26 Something New)')).toBe('base');
  });
});

describe('seasonRule — 티어별 보정치', () => {
  it('티어가 높을수록 가치 배수와 오버롤 보정이 크다', () => {
    const icon = seasonRule('ICON (Icon)');
    const legend = seasonRule('TC (Team Color)');
    const high = seasonRule('23UP (23 Ultimate Player)');
    const mid = seasonRule('VTR (Veteran)');
    const base = seasonRule('20KL (2020 K League)');

    const chain = [icon, legend, high, mid, base];
    for (let i = 1; i < chain.length; i += 1) {
      expect(chain[i].valueMultiplier).toBeLessThan(chain[i - 1].valueMultiplier);
      expect(chain[i].ovrBonus).toBeLessThan(chain[i - 1].ovrBonus);
    }
    expect(base.valueMultiplier).toBe(1);
  });

  it('모든 티어에 색이 지정돼 있다', () => {
    for (const className of ['ICON (Icon)', 'TC (Team Color)', 'NG (Next Generation)', 'LN (Legend)', '']) {
      expect(seasonRule(className).color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('DEMO_SEASONS — 데모 폴백 데이터', () => {
  it('시즌 ID 가 겹치지 않는다', () => {
    const ids = DEMO_SEASONS.map((s) => s.seasonId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('아이콘 시즌이 최소 하나 있어야 상자의 아이콘 등급이 빈 풀이 되지 않는다', () => {
    expect(DEMO_SEASONS.filter((s) => seasonTier(s.className) === 'icon').length).toBeGreaterThan(0);
  });

  it('여러 티어가 골고루 들어 있다', () => {
    const tiers = new Set(DEMO_SEASONS.map((s) => seasonTier(s.className)));
    expect(tiers.size).toBeGreaterThanOrEqual(4);
  });
});
