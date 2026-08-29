import type { SeasonTier } from '@/lib/players/seasons';

/**
 * ── 상자(팩) 확률 정의 ─────────────────────────────────────
 *
 *  중요: 아래 확률은 **샘플 값**이다. 넥슨은 확률형 아이템 확률을
 *  게임 내 "확률 공개" 페이지와 공식 홈페이지에 공시하며, Open API 로는
 *  제공하지 않는다. 실제 서비스에 쓰려면 공시된 표를 그대로 옮겨
 *  이 파일만 교체하면 되고, 나머지 시뮬레이션 코드는 손댈 필요가 없다.
 *
 *  가격 역시 샘플이다. 로컬 가치 모델(estimateValue) 기준으로 "기대값이 가격보다
 *  약간 낮게" 나오도록 잡아 뒀다 — 실제 확률형 상품의 경제 구조와 같은 방향이다.
 *
 *  구조상 지켜야 할 것:
 *   - 한 상자의 tiers[].probability 합은 1 이어야 한다 (validateBox 로 검증).
 *   - 각 tier 는 카탈로그에서 어떤 카드를 뽑을지 filter 로 지정한다.
 */

export interface PackTier {
  id: string;
  label: string;
  /** 0 ~ 1 */
  probability: number;
  /** UI 색상 (tailwind 색 대신 직접 hex) */
  color: string;
  /** 연출 등급: 높을수록 화려한 애니메이션 */
  rarity: 1 | 2 | 3 | 4 | 5;
  filter: {
    seasonTiers?: SeasonTier[];
    minOvr?: number;
    maxOvr?: number;
  };
}

export interface PackBox {
  id: string;
  name: string;
  subtitle: string;
  currency: 'BP' | '캐시';
  price: number;
  /** 1회 개봉 시 나오는 카드 수 */
  drawCount: number;
  /** 최고 등급 천장(연속 미획득 시 확정). 없으면 undefined */
  pity?: { tierId: string; after: number };
  tiers: PackTier[];
}

export const PACK_BOXES: PackBox[] = [
  {
    id: 'premium-bp',
    name: 'BP 프리미엄 팩',
    subtitle: 'BP 로 살 수 있는 기본 팩. 무난하게 스쿼드 뼈대를 채운다.',
    currency: 'BP',
    price: 5_000_000,
    drawCount: 3,
    tiers: [
      { id: 'common',  label: '일반 (OVR ~79)',      probability: 0.62,  color: '#9aa7b8', rarity: 1, filter: { maxOvr: 79 } },
      { id: 'rare',    label: '레어 (OVR 80~84)',    probability: 0.27,  color: '#c6ff3d', rarity: 2, filter: { minOvr: 80, maxOvr: 84 } },
      { id: 'epic',    label: '에픽 (OVR 85~88)',    probability: 0.093, color: '#22e1ff', rarity: 3, filter: { minOvr: 85, maxOvr: 88 } },
      { id: 'legend',  label: '레전드 (OVR 89+)',    probability: 0.016, color: '#a78bfa', rarity: 4, filter: { minOvr: 89 } },
      { id: 'icon',    label: '아이콘',              probability: 0.001, color: '#f0c14b', rarity: 5, filter: { seasonTiers: ['icon'] } },
    ],
  },
  {
    id: 'ultimate-cash',
    name: '얼티밋 셀렉트 팩',
    subtitle: '캐시 전용. 고오버롤 확률이 크게 올라간 프리미엄 상자.',
    currency: '캐시',
    price: 12_900,
    drawCount: 1,
    pity: { tierId: 'legend', after: 20 },
    tiers: [
      { id: 'common',  label: '일반 (OVR ~82)',      probability: 0.34,  color: '#9aa7b8', rarity: 1, filter: { maxOvr: 82 } },
      { id: 'rare',    label: '레어 (OVR 83~86)',    probability: 0.42,  color: '#c6ff3d', rarity: 2, filter: { minOvr: 83, maxOvr: 86 } },
      { id: 'epic',    label: '에픽 (OVR 87~89)',    probability: 0.19,  color: '#22e1ff', rarity: 3, filter: { minOvr: 87, maxOvr: 89 } },
      { id: 'legend',  label: '레전드 (OVR 90+)',    probability: 0.042, color: '#a78bfa', rarity: 4, filter: { minOvr: 90 } },
      { id: 'icon',    label: '아이콘',              probability: 0.008, color: '#f0c14b', rarity: 5, filter: { seasonTiers: ['icon'] } },
    ],
  },
  {
    id: 'lucky-box',
    name: '이벤트 럭키 박스',
    subtitle: '싸고 많이. 5장을 한 번에 열지만 대부분 저오버롤이다.',
    currency: 'BP',
    price: 2_400_000,
    drawCount: 5,
    tiers: [
      { id: 'common',  label: '일반 (OVR ~76)',      probability: 0.78,   color: '#9aa7b8', rarity: 1, filter: { maxOvr: 76 } },
      { id: 'rare',    label: '레어 (OVR 77~82)',    probability: 0.185,  color: '#c6ff3d', rarity: 2, filter: { minOvr: 77, maxOvr: 82 } },
      { id: 'epic',    label: '에픽 (OVR 83~87)',    probability: 0.032,  color: '#22e1ff', rarity: 3, filter: { minOvr: 83, maxOvr: 87 } },
      { id: 'legend',  label: '레전드 (OVR 88+)',    probability: 0.0028, color: '#a78bfa', rarity: 4, filter: { minOvr: 88 } },
      { id: 'icon',    label: '아이콘',              probability: 0.0002, color: '#f0c14b', rarity: 5, filter: { seasonTiers: ['icon'] } },
    ],
  },
  {
    id: 'icon-guaranteed',
    name: '아이콘 확정 팩',
    subtitle: '아이콘이 100% 나온다. 대신 어떤 아이콘일지는 운.',
    currency: '캐시',
    price: 99_000,
    drawCount: 1,
    tiers: [
      { id: 'icon-low',  label: '아이콘 (OVR ~91)', probability: 0.72, color: '#e0b64a', rarity: 4, filter: { seasonTiers: ['icon'], maxOvr: 91 } },
      { id: 'icon-high', label: '아이콘 (OVR 92+)', probability: 0.28, color: '#f0c14b', rarity: 5, filter: { seasonTiers: ['icon'], minOvr: 92 } },
    ],
  },
];

export function findBox(id: string): PackBox | undefined {
  return PACK_BOXES.find((box) => box.id === id);
}

/** 확률 합이 1인지 검증 (부동소수 오차 허용) */
export function validateBox(box: PackBox): { ok: boolean; sum: number } {
  const sum = box.tiers.reduce((acc, tier) => acc + tier.probability, 0);
  return { ok: Math.abs(sum - 1) < 1e-6, sum };
}
