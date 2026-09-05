import { describe, expect, it } from 'vitest';
import { createRng, weightedPick } from '@/lib/utils/rng';

/**
 * 상자 시뮬레이터의 신뢰도는 전부 이 파일에 걸려 있다.
 * "시드를 주면 같은 결과가 나온다"는 약속이 깨지면 결과 공유 기능이 거짓말이 되고,
 * 가중치가 틀어지면 화면에 띄운 확률표가 거짓말이 된다.
 */
describe('createRng — 결정적 난수기', () => {
  it('같은 시드는 같은 수열을 만든다', () => {
    const a = Array.from({ length: 50 }, () => createRng('seed-1')).map((r) => r.next());
    // 같은 시드로 만든 50개의 rng 는 전부 같은 첫 값을 준다
    expect(new Set(a).size).toBe(1);

    const r1 = createRng('fc-online');
    const r2 = createRng('fc-online');
    const s1 = Array.from({ length: 100 }, () => r1.next());
    const s2 = Array.from({ length: 100 }, () => r2.next());
    expect(s1).toEqual(s2);
  });

  it('다른 시드는 다른 수열을 만든다', () => {
    const s1 = Array.from({ length: 20 }, (_, i) => createRng(`a${i}`).next());
    expect(new Set(s1).size).toBe(20);
  });

  it('시드를 생략하면 매번 다른 시드를 스스로 만든다', () => {
    const seeds = new Set(Array.from({ length: 20 }, () => createRng().seed));
    expect(seeds.size).toBe(20);
  });

  it('next() 는 [0, 1) 범위를 벗어나지 않는다', () => {
    const rng = createRng('range-check');
    for (let i = 0; i < 20_000; i += 1) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int(min, max) 는 양 끝을 포함하고 벗어나지 않는다', () => {
    const rng = createRng('int-check');
    const seen = new Set<number>();
    for (let i = 0; i < 5_000; i += 1) {
      const v = rng.int(3, 7);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
      seen.add(v);
    }
    // 양 끝값이 실제로 나오는지 (off-by-one 방지)
    expect(seen).toEqual(new Set([3, 4, 5, 6, 7]));
  });

  it('int(n, n) 은 항상 n', () => {
    const rng = createRng('single');
    expect(Array.from({ length: 100 }, () => rng.int(9, 9))).toEqual(Array(100).fill(9));
  });

  it('pick() 은 빈 배열에서 던진다', () => {
    expect(() => createRng('x').pick([])).toThrow('빈 배열');
  });

  it('pick() 은 배열 밖 인덱스를 만들지 않는다', () => {
    const rng = createRng('pick-check');
    const items = ['a', 'b', 'c'];
    for (let i = 0; i < 3_000; i += 1) {
      expect(items).toContain(rng.pick(items));
    }
  });

  it('mulberry32 의 평균은 0.5 근처여야 한다', () => {
    const rng = createRng('mean-check');
    const n = 100_000;
    let sum = 0;
    for (let i = 0; i < n; i += 1) sum += rng.next();
    expect(sum / n).toBeCloseTo(0.5, 2);
  });
});

describe('weightedPick — 가중치 추첨', () => {
  interface Item {
    id: string;
    w: number;
  }

  it('표본 분포가 가중치를 따라간다', () => {
    const items: Item[] = [
      { id: 'common', w: 0.62 },
      { id: 'rare', w: 0.27 },
      { id: 'epic', w: 0.093 },
      { id: 'legend', w: 0.016 },
      { id: 'icon', w: 0.001 },
    ];
    const rng = createRng('distribution');
    const n = 200_000;
    const counts = new Map<string, number>(items.map((i) => [i.id, 0]));

    for (let i = 0; i < n; i += 1) {
      const picked = weightedPick(rng, items, (it) => it.w);
      counts.set(picked.id, counts.get(picked.id)! + 1);
    }

    for (const item of items) {
      const observed = counts.get(item.id)! / n;
      // 표준오차의 약 5배 — 20만 회면 0.001 확률도 안정적으로 잡힌다.
      const tolerance = 5 * Math.sqrt((item.w * (1 - item.w)) / n);
      expect(Math.abs(observed - item.w)).toBeLessThan(tolerance);
    }
  });

  it('가중치가 합 1 이 아니어도 비율만 맞으면 된다', () => {
    const items = [
      { id: 'a', w: 30 },
      { id: 'b', w: 10 },
    ];
    const rng = createRng('unnormalized');
    let a = 0;
    const n = 40_000;
    for (let i = 0; i < n; i += 1) {
      if (weightedPick(rng, items, (it) => it.w).id === 'a') a += 1;
    }
    expect(a / n).toBeCloseTo(0.75, 2);
  });

  it('가중치 0 인 항목은 절대 뽑히지 않는다', () => {
    const items = [
      { id: 'never', w: 0 },
      { id: 'always', w: 1 },
    ];
    const rng = createRng('zero-weight');
    for (let i = 0; i < 5_000; i += 1) {
      expect(weightedPick(rng, items, (it) => it.w).id).toBe('always');
    }
  });

  it('음수 가중치는 0 으로 취급한다', () => {
    const items = [
      { id: 'negative', w: -100 },
      { id: 'positive', w: 1 },
    ];
    const rng = createRng('negative-weight');
    for (let i = 0; i < 1_000; i += 1) {
      expect(weightedPick(rng, items, (it) => it.w).id).toBe('positive');
    }
  });

  it('전부 0 이면 첫 항목으로 안전하게 떨어진다', () => {
    const items = [{ id: 'first', w: 0 }, { id: 'second', w: 0 }];
    expect(weightedPick(createRng('all-zero'), items, (it) => it.w).id).toBe('first');
  });

  it('항목이 하나면 항상 그것', () => {
    const items = [{ id: 'only', w: 0.5 }];
    const rng = createRng('single-item');
    for (let i = 0; i < 100; i += 1) {
      expect(weightedPick(rng, items, (it) => it.w).id).toBe('only');
    }
  });

  it('빈 배열에서는 던진다', () => {
    expect(() => weightedPick(createRng('x'), [], () => 1)).toThrow('빈 배열');
  });

  it('같은 시드면 추첨 결과 순서까지 같다', () => {
    const items = [{ id: 'a', w: 1 }, { id: 'b', w: 2 }, { id: 'c', w: 3 }];
    const draw = (seed: string) => {
      const rng = createRng(seed);
      return Array.from({ length: 200 }, () => weightedPick(rng, items, (i) => i.w).id);
    };
    expect(draw('reproducible')).toEqual(draw('reproducible'));
    expect(draw('reproducible')).not.toEqual(draw('other'));
  });
});
