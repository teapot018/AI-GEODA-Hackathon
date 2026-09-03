import { describe, expect, it, vi } from 'vitest';
import { findBox, PACK_BOXES, validateBox } from '@/lib/pack/boxes';
import { candidatePool } from '@/lib/players/catalog';
import { describeBox, openBox } from '@/lib/pack/simulator';

/**
 * 확률형 상자는 이 서비스에서 유일하게 "숫자를 약속하는" 기능이다.
 * 화면에 62% 라고 써 놓고 실제로 55% 가 나오면 그건 버그가 아니라 거짓말이다.
 * 그래서 (1) 표 자체의 정합성, (2) 뽑을 카드가 실제로 있는지,
 * (3) 시뮬레이션 결과가 표를 따라가는지를 전부 검증한다.
 */

describe('상자 정의표', () => {
  it('상자 ID 는 유일하다', () => {
    const ids = PACK_BOXES.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(PACK_BOXES.map((b) => [b.id, b] as const))(
    '%s — 등급 확률의 합이 정확히 1 이다',
    (_id, box) => {
      const { ok, sum } = validateBox(box);
      expect(sum).toBeCloseTo(1, 9);
      expect(ok).toBe(true);
    },
  );

  it.each(PACK_BOXES.map((b) => [b.id, b] as const))('%s — 표의 형태가 올바르다', (_id, box) => {
    expect(box.tiers.length).toBeGreaterThan(0);
    expect(new Set(box.tiers.map((t) => t.id)).size).toBe(box.tiers.length);
    expect(box.drawCount).toBeGreaterThan(0);
    expect(box.price).toBeGreaterThan(0);

    for (const tier of box.tiers) {
      expect(tier.probability, `${box.id}/${tier.id}`).toBeGreaterThan(0);
      expect(tier.probability, `${box.id}/${tier.id}`).toBeLessThanOrEqual(1);
      expect(tier.color).toMatch(/^#[0-9a-f]{6}$/i);
      if (tier.filter.minOvr !== undefined && tier.filter.maxOvr !== undefined) {
        expect(tier.filter.minOvr, `${box.id}/${tier.id}`).toBeLessThanOrEqual(tier.filter.maxOvr);
      }
    }
  });

  it('천장이 있다면 그 등급이 실제로 상자에 존재한다', () => {
    for (const box of PACK_BOXES) {
      if (!box.pity) continue;
      expect(box.tiers.map((t) => t.id), box.id).toContain(box.pity.tierId);
      expect(box.pity.after, box.id).toBeGreaterThan(0);
    }
  });

  it('모르는 상자는 undefined', () => {
    expect(findBox('없는-상자')).toBeUndefined();
  });
});

/**
 * ── 회귀 테스트 ──────────────────────────────────────────────
 * 예전에 실제로 났던 버그: 카탈로그에 저오버롤 선수가 없어서
 * 'OVR ~79' 등급의 뽑을 카드가 0장이 됐다. 시뮬레이터는 그 등급을 조용히
 * 빼고 나머지에 확률을 재분배했고, 결과적으로 기대 가치가 8배로 뻥튀기됐다.
 * 표에 적힌 등급은 반드시 실제로 뽑을 카드가 있어야 한다.
 */
describe('회귀: 모든 등급에 뽑을 카드가 있어야 한다', () => {
  it.each(
    PACK_BOXES.flatMap((box) => box.tiers.map((tier) => [`${box.id}/${tier.id}`, tier] as const)),
  )('%s — 카드 풀이 비어 있지 않다', async (label, tier) => {
    const pool = await candidatePool(tier.filter);
    expect(pool.length, `${label} 의 카드 풀이 0장입니다`).toBeGreaterThan(0);
  });

  it('상자를 열 때 "풀이 비었다" 경고가 뜨지 않는다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      for (const box of PACK_BOXES) {
        await openBox({ boxId: box.id, seed: `warn-check-${box.id}` });
      }
      const messages = warn.mock.calls.map((c) => String(c[0]));
      expect(messages.filter((m) => m.includes('뽑을 카드가 없는 등급'))).toEqual([]);
      expect(messages.filter((m) => m.includes('확률 합이 1이 아닙니다'))).toEqual([]);
    } finally {
      warn.mockRestore();
    }
  });
});

describe('openBox — 개봉', () => {
  it('drawCount × times 만큼 뽑는다', async () => {
    const one = await openBox({ boxId: 'premium-bp', seed: 'count-1' });
    expect(one.cards).toHaveLength(3);

    const ten = await openBox({ boxId: 'premium-bp', times: 10, seed: 'count-10' });
    expect(ten.cards).toHaveLength(30);
  });

  it('times 는 1 ~ 50 으로 접힌다', async () => {
    const zero = await openBox({ boxId: 'premium-bp', times: 0, seed: 'clamp-0' });
    expect(zero.cards).toHaveLength(3);

    const huge = await openBox({ boxId: 'premium-bp', times: 9999, seed: 'clamp-max' });
    expect(huge.cards).toHaveLength(50 * 3);
  });

  it('같은 시드는 같은 결과를 낸다 (결과 공유의 근거)', async () => {
    const a = await openBox({ boxId: 'ultimate-cash', times: 20, seed: 'share-me' });
    const b = await openBox({ boxId: 'ultimate-cash', times: 20, seed: 'share-me' });
    expect(a.cards.map((c) => [c.tierId, c.card.spid, c.grade])).toEqual(
      b.cards.map((c) => [c.tierId, c.card.spid, c.grade]),
    );
    expect(a.totalValue).toBe(b.totalValue);
  });

  it('다른 시드는 다른 결과를 낸다', async () => {
    const a = await openBox({ boxId: 'ultimate-cash', times: 20, seed: 'seed-a' });
    const b = await openBox({ boxId: 'ultimate-cash', times: 20, seed: 'seed-b' });
    expect(a.cards.map((c) => c.card.spid)).not.toEqual(b.cards.map((c) => c.card.spid));
  });

  it('시드를 안 주면 스스로 만들고, 그 시드를 돌려준다', async () => {
    const first = await openBox({ boxId: 'premium-bp' });
    expect(first.seed).toBeTruthy();
    const replay = await openBox({ boxId: 'premium-bp', seed: first.seed });
    expect(replay.cards.map((c) => c.card.spid)).toEqual(first.cards.map((c) => c.card.spid));
  });

  it('뽑힌 카드는 그 등급의 조건을 만족한다', async () => {
    const result = await openBox({ boxId: 'premium-bp', times: 50, seed: 'filter-check' });
    for (const pulled of result.cards) {
      const tier = findBox('premium-bp')!.tiers.find((t) => t.id === pulled.tierId)!;
      if (tier.filter.minOvr !== undefined) {
        expect(pulled.card.ovr, pulled.card.name).toBeGreaterThanOrEqual(tier.filter.minOvr);
      }
      if (tier.filter.maxOvr !== undefined) {
        expect(pulled.card.ovr, pulled.card.name).toBeLessThanOrEqual(tier.filter.maxOvr);
      }
    }
  });

  it('아이콘 확정 팩은 100% 아이콘만 준다', async () => {
    const result = await openBox({ boxId: 'icon-guaranteed', times: 50, seed: 'icon-only' });
    expect(result.cards).toHaveLength(50);
    for (const pulled of result.cards) {
      expect(pulled.tierId.startsWith('icon')).toBe(true);
      expect(pulled.card.seasonName.toUpperCase()).toContain('ICON');
    }
  });

  it('총 가치와 비용이 맞게 집계된다', async () => {
    // 가격을 상수로 박지 않는다 — 이 테스트가 보는 건 '가격 × 횟수' 라는
    // 관계지 그날의 가격이 아니다. 박아 두면 샘플 가격을 조정할 때마다
    // 관계는 멀쩡한데 테스트가 빨개진다.
    const box = PACK_BOXES.find((b) => b.id === 'premium-bp')!;
    const result = await openBox({ boxId: 'premium-bp', times: 4, seed: 'cost-check' });
    expect(result.totalValue).toBe(result.cards.reduce((s, c) => s + c.value, 0));
    expect(result.cost).toEqual({ currency: 'BP', amount: box.price * 4 });
  });

  it('낮은 등급은 항상 +1 로 나온다', async () => {
    const result = await openBox({ boxId: 'lucky-box', times: 50, seed: 'grade-check' });
    for (const pulled of result.cards) {
      if (pulled.rarity < 4) expect(pulled.grade).toBe(1);
      expect(pulled.grade).toBeGreaterThanOrEqual(1);
      expect(pulled.grade).toBeLessThanOrEqual(4);
    }
  });

  it('모르는 상자를 열면 던진다', async () => {
    await expect(openBox({ boxId: '없는-상자' })).rejects.toThrow('알 수 없는 상자');
  });
});

describe('openBox — 천장(pity)', () => {
  it('연속으로 못 뽑으면 확정으로 나온다', async () => {
    const box = findBox('ultimate-cash')!;
    const after = box.pity!.after;

    // 천장 직전까지 카운터를 채워 두고 한 장 뽑으면 확정이어야 한다.
    const result = await openBox({
      boxId: 'ultimate-cash',
      seed: 'pity-now',
      pityCounter: after - 1,
    });
    expect(result.cards[0].fromPity).toBe(true);
    expect(result.cards[0].tierId).toBe(box.pity!.tierId);
  });

  it('카운터가 0 이면 확정이 아니다', async () => {
    const result = await openBox({ boxId: 'ultimate-cash', seed: 'pity-fresh', pityCounter: 0 });
    expect(result.cards[0].fromPity).toBe(false);
  });

  it('천장 간격보다 길게 뽑으면 반드시 목표 등급 이상이 섞인다', async () => {
    const box = findBox('ultimate-cash')!;
    const target = box.tiers.find((t) => t.id === box.pity!.tierId)!;
    const result = await openBox({ boxId: 'ultimate-cash', times: 50, seed: 'pity-long' });

    // 50장 안에서 목표 등급 미획득 구간이 천장 길이를 넘으면 안 된다.
    let gap = 0;
    for (const pulled of result.cards) {
      if (pulled.rarity >= target.rarity) gap = 0;
      else gap += 1;
      expect(gap).toBeLessThanOrEqual(box.pity!.after);
    }
  });

  it('천장이 없는 상자는 fromPity 가 항상 false', async () => {
    const result = await openBox({
      boxId: 'premium-bp',
      times: 50,
      seed: 'no-pity',
      pityCounter: 999,
    });
    expect(result.cards.every((c) => c.fromPity === false)).toBe(true);
  });
});

/**
 * 화면에 띄운 확률표와 실제 추첨 분포가 같은지 — 이 서비스의 신뢰도 그 자체.
 * 시드를 고정했으므로 결과는 결정적이다 (CI 에서 깜빡이지 않는다).
 */
describe('분포 검증: 표에 적은 확률대로 나오는가', () => {
  it('BP 프리미엄 팩 30,000장 — 모든 등급이 5σ 안에 든다', async () => {
    const box = findBox('premium-bp')!;
    const counts = new Map<string, number>(box.tiers.map((t) => [t.id, 0]));

    let total = 0;
    for (let round = 0; round < 200; round += 1) {
      const result = await openBox({ boxId: box.id, times: 50, seed: `dist-${round}` });
      for (const pulled of result.cards) {
        counts.set(pulled.tierId, (counts.get(pulled.tierId) ?? 0) + 1);
        total += 1;
      }
    }
    expect(total).toBe(30_000);

    for (const tier of box.tiers) {
      const observed = counts.get(tier.id)! / total;
      const sigma = Math.sqrt((tier.probability * (1 - tier.probability)) / total);
      expect(
        Math.abs(observed - tier.probability),
        `${tier.id}: 표 ${(tier.probability * 100).toFixed(3)}% vs 실측 ${(observed * 100).toFixed(3)}%`,
      ).toBeLessThan(5 * sigma);
    }
  });
});

describe('describeBox — 열기 전 기대값', () => {
  it.each(PACK_BOXES.map((b) => b.id))('%s — 표를 그대로 반영한다', async (boxId) => {
    const box = findBox(boxId)!;
    const info = await describeBox(boxId);

    expect(info.probabilitySum).toBeCloseTo(1, 9);
    expect(info.tiers).toHaveLength(box.tiers.length);
    expect(info.drawCount).toBe(box.drawCount);

    for (const tier of info.tiers) {
      expect(tier.poolSize, `${boxId}/${tier.tierId}`).toBeGreaterThan(0);
      expect(tier.averageValue, `${boxId}/${tier.tierId}`).toBeGreaterThan(0);
      // 1회 개봉에서 한 장이라도 나올 확률은 단일 확률 이상, 1 이하
      expect(tier.atLeastOnce).toBeGreaterThanOrEqual(tier.probability - 1e-12);
      expect(tier.atLeastOnce).toBeLessThanOrEqual(1);
    }
  });

  it('여러 장 뽑는 상자는 "한 장이라도" 확률이 더 높다', async () => {
    const info = await describeBox('lucky-box'); // drawCount 5
    const icon = info.tiers.find((t) => t.tierId === 'icon')!;
    expect(icon.atLeastOnce).toBeGreaterThan(icon.probability);
    expect(icon.atLeastOnce).toBeCloseTo(1 - (1 - icon.probability) ** 5, 12);
  });

  it('고등급일수록 평균 가치가 높다', async () => {
    const info = await describeBox('premium-bp');
    const byRarity = ['common', 'rare', 'epic', 'legend'].map(
      (id) => info.tiers.find((t) => t.tierId === id)!.averageValue,
    );
    for (let i = 1; i < byRarity.length; i += 1) {
      expect(byRarity[i]).toBeGreaterThan(byRarity[i - 1]);
    }
  });

  it('BP 상자는 기대값 대비 가격 비율을 알려 준다 (캐시 상자는 못 준다)', async () => {
    const bp = await describeBox('premium-bp');
    expect(bp.valueRatio).not.toBeNull();
    expect(bp.valueRatio!).toBeGreaterThan(0);
    // 확률형 상품답게 기대값이 가격을 넘지 않아야 한다.
    expect(bp.valueRatio!).toBeLessThan(1);

    const cash = await describeBox('ultimate-cash');
    expect(cash.valueRatio).toBeNull();
  });

  it('모르는 상자는 던진다', async () => {
    await expect(describeBox('없는-상자')).rejects.toThrow('알 수 없는 상자');
  });
});
