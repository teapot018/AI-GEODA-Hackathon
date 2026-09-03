import 'server-only';

import { candidatePool, getCard } from '@/lib/players/catalog';
import type { PlayerCardData } from '@/lib/players/types';
import { estimateValue } from '@/lib/players/value';
import { createRng, weightedPick, type Rng } from '@/lib/utils/rng';
import {
  findBox,
  isOfficialOdds,
  probabilitySourceOf,
  validateBox,
  type PackBox,
  type PackTier,
  type ProbabilitySource,
} from './boxes';

/**
 * 상자 개봉 시뮬레이터.
 *
 * 흐름: 등급 추첨(가중치) → 그 등급의 카드 풀에서 균등 추첨 → 가치 계산.
 * 시드를 넘기면 결과가 완전히 재현되므로, 확률 검증(수만 회 시행)과
 * "친구에게 같은 결과 공유" 같은 기능을 그대로 얹을 수 있다.
 */

export interface PulledCard {
  tierId: string;
  tierLabel: string;
  tierColor: string;
  rarity: number;
  card: PlayerCardData;
  /** 뽑힌 카드의 강화 단계 (상자는 대부분 +1 이지만 일부 고급 상자는 상향) */
  grade: number;
  value: number;
  /** 천장(pity)으로 확정된 결과인지 */
  fromPity: boolean;
}

export interface OpenResult {
  boxId: string;
  boxName: string;
  seed: string;
  cards: PulledCard[];
  /** 이번 개봉의 총 추정 가치 */
  totalValue: number;
  /** 지불 비용 (BP 상자만 BP 로 환산 가능) */
  cost: { currency: PackBox['currency']; amount: number };
}

export interface OpenOptions {
  boxId: string;
  /** 몇 번 열지 (1회 = drawCount 장) */
  times?: number;
  seed?: string;
  /** 천장 카운터 (클라이언트가 누적해서 보내준다) */
  pityCounter?: number;
}

async function pickCardForTier(rng: Rng, tier: PackTier): Promise<PlayerCardData | null> {
  const pool = await candidatePool(tier.filter);
  if (pool.length === 0) return null;
  const spid = pool[rng.int(0, pool.length - 1)];
  return getCard(spid);
}

/** 등급별로 뽑을 카드가 실제로 존재하는지 확인하고, 없으면 확률 0 처리 */
async function usableTiers(box: PackBox): Promise<PackTier[]> {
  const checks = await Promise.all(
    box.tiers.map(async (tier) => ({
      tier,
      size: (await candidatePool(tier.filter)).length,
    })),
  );
  const empty = checks.filter((c) => c.size === 0);
  if (empty.length > 0) {
    // 풀이 비면 그 등급의 확률이 나머지로 재분배되어 실제 분포가 표에서 벗어난다.
    // (예: 로컬 시드에 저오버롤 선수가 없으면 '일반' 등급이 아예 안 나온다.)
    console.warn(
      `[pack] ${box.id}: 뽑을 카드가 없는 등급 ${empty
        .map((c) => c.tier.id)
        .join(', ')} — 확률이 나머지 등급으로 재분배됩니다.`,
    );
  }

  const usable = checks.filter((c) => c.size > 0).map((c) => c.tier);
  return usable.length > 0 ? usable : box.tiers;
}

export async function openBox(options: OpenOptions): Promise<OpenResult> {
  const { boxId, times = 1, seed, pityCounter = 0 } = options;

  const box = findBox(boxId);
  if (!box) throw new Error(`알 수 없는 상자: ${boxId}`);

  const check = validateBox(box);
  if (!check.ok) {
    console.warn(`[pack] ${box.id} 확률 합이 1이 아닙니다 (합계 ${check.sum}). 정규화해서 진행합니다.`);
  }

  const rng = createRng(seed);
  const tiers = await usableTiers(box);
  const cards: PulledCard[] = [];

  let sinceLastPity = pityCounter;
  const totalDraws = Math.max(1, Math.min(50, times)) * box.drawCount;

  for (let i = 0; i < totalDraws; i += 1) {
    let tier: PackTier;
    let fromPity = false;

    const pityTier = box.pity ? tiers.find((t) => t.id === box.pity!.tierId) : undefined;
    if (box.pity && pityTier && sinceLastPity + 1 >= box.pity.after) {
      tier = pityTier;
      fromPity = true;
    } else {
      tier = weightedPick(rng, tiers, (t) => t.probability);
    }

    // 천장 카운터: 목표 등급 이상을 뽑으면 리셋
    if (pityTier && tier.rarity >= pityTier.rarity) sinceLastPity = 0;
    else sinceLastPity += 1;

    const card = await pickCardForTier(rng, tier);
    if (!card) continue;

    // 고등급일수록 드물게 강화된 카드가 나오는 연출
    const grade = tier.rarity >= 4 && rng.next() < 0.15 ? rng.int(2, 4) : 1;

    cards.push({
      tierId: tier.id,
      tierLabel: tier.label,
      tierColor: tier.color,
      rarity: tier.rarity,
      card,
      grade,
      value: estimateValue({ ovr: card.ovr, seasonClassName: card.seasonName, grade }),
      fromPity,
    });
  }

  return {
    boxId: box.id,
    boxName: box.name,
    seed: rng.seed,
    cards,
    totalValue: cards.reduce((sum, c) => sum + c.value, 0),
    cost: { currency: box.currency, amount: box.price * Math.max(1, times) },
  };
}

/* ── 기대값 계산 (열기 전에 보여주는 정보) ─────────────────── */

export interface TierExpectation {
  tierId: string;
  label: string;
  color: string;
  probability: number;
  /** 위 확률이 공시표에서 온 것인지, 이 프로젝트의 표본인지 */
  probabilitySource: ProbabilitySource;
  poolSize: number;
  averageValue: number;
  /** 1회 개봉에서 이 등급이 한 장이라도 나올 확률 */
  atLeastOnce: number;
}

export interface BoxExpectation {
  boxId: string;
  drawCount: number;
  /**
   * 이 상자의 확률이 **전부** 공시표에서 왔는가.
   *
   * 하나라도 표본이 섞여 있으면 false 다. 섞인 표를 "공시 확률" 이라고
   * 부르면 공식인 줄 알고 읽는 줄이 생긴다.
   */
  officialOdds: boolean;
  tiers: TierExpectation[];
  /** 1회 개봉의 기대 가치(BP) */
  expectedValue: number;
  /** BP 상자에 한해: 기대 가치 / 가격 */
  valueRatio: number | null;
  probabilitySum: number;
}

/** 풀 전체를 재료화하지 않고 표본으로 평균 가치를 추정한다. */
async function samplePoolValue(tier: PackTier, sampleSize = 24): Promise<{ size: number; avg: number }> {
  const pool = await candidatePool(tier.filter);
  if (pool.length === 0) return { size: 0, avg: 0 };

  const step = Math.max(1, Math.floor(pool.length / sampleSize));
  const picks: number[] = [];
  for (let i = 0; i < pool.length && picks.length < sampleSize; i += step) picks.push(pool[i]);

  const cards = await Promise.all(picks.map((spid) => getCard(spid)));
  const values = cards
    .filter((c): c is PlayerCardData => c !== null)
    .map((c) => estimateValue({ ovr: c.ovr, seasonClassName: c.seasonName, grade: 1 }));

  const avg = values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
  return { size: pool.length, avg: Math.round(avg) };
}

export async function describeBox(boxId: string): Promise<BoxExpectation> {
  const box = findBox(boxId);
  if (!box) throw new Error(`알 수 없는 상자: ${boxId}`);

  const tiers: TierExpectation[] = await Promise.all(
    box.tiers.map(async (tier) => {
      const { size, avg } = await samplePoolValue(tier);
      return {
        tierId: tier.id,
        label: tier.label,
        color: tier.color,
        probability: tier.probability,
        probabilitySource: probabilitySourceOf(tier),
        poolSize: size,
        averageValue: avg,
        atLeastOnce: 1 - (1 - tier.probability) ** box.drawCount,
      };
    }),
  );

  const expectedValue = Math.round(
    tiers.reduce((sum, t) => sum + t.probability * t.averageValue, 0) * box.drawCount,
  );

  return {
    boxId: box.id,
    drawCount: box.drawCount,
    officialOdds: isOfficialOdds(box),
    tiers,
    expectedValue,
    valueRatio: box.currency === 'BP' ? expectedValue / box.price : null,
    probabilitySum: validateBox(box).sum,
  };
}
