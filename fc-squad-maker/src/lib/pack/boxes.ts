import type { SeasonTier } from '@/lib/players/seasons';

/**
 * ── 모의 상자 정의 — **계층 C (이 프로젝트가 지어낸 값)** ────
 *
 *  여기 있는 상자는 **실제 FC 온라인 상품이 아니다.** 이름도, 가격도,
 *  확률도 이 프로젝트가 만들었다. 실제 상품과 같은 이름이 있다면 우연이
 *  아니라 흉내 낸 것이고, 그래도 숫자는 다르다.
 *
 *  ── 확률 ──
 *  넥슨은 확률형 아이템 확률을 게임 내 '확률 공개' 페이지와 공식
 *  홈페이지에 공시하며, **Open API 로는 제공하지 않는다.** 그래서 이
 *  프로젝트가 공시표를 가져올 방법이 없고, 아래 값은 "확률형 상품이란
 *  대개 이런 모양" 을 흉내 낸 표본이다.
 *
 *  각 tier 는 probabilitySource 로 그 사실을 들고 다닌다. 공시표를
 *  옮겨 넣을 때는 값과 함께 이 필드를 'official' 로 바꾼다 — 값만 바꾸면
 *  화면은 여전히 샘플이라고 적고, 필드만 바꾸면 샘플을 공식이라 부르게
 *  된다. 둘을 같이 두어야 한 쪽만 바뀌는 일이 눈에 띈다.
 *
 *  ── 가격과 기대값 ──
 *  가격도 샘플이다. 로컬 가치 모델(estimateValue) 기준으로 기대값이
 *  가격보다 낮게 나오도록 잡아 뒀다(EV_BELOW_PRICE 참고). 그건 실제
 *  게임에서 관측한 규칙이 아니라 **이 프로젝트가 상자를 설계할 때 건
 *  가정**이다 — 실제 상품이 그렇다는 주장이 아니다.
 *
 *  구조상 지켜야 할 것:
 *   - 한 상자의 tiers[].probability 합은 1 이어야 한다 (validateBox 로 검증).
 *   - 각 tier 는 카탈로그에서 어떤 카드를 뽑을지 filter 로 지정한다.
 */

/**
 * 이 확률이 어디서 왔는가.
 *
 *  - 'official'       : 넥슨 공시 확률표를 옮긴 값
 *  - 'project-sample' : 이 프로젝트가 흉내 낸 표본
 *
 * 지금은 전부 후자다. 공시표는 Open API 로 오지 않고, 이 개발 환경에서는
 * 넥슨 도메인이 막혀 공시 페이지도 열 수 없다.
 */
export type ProbabilitySource = 'official' | 'project-sample';

/**
 * 상자 설계에 건 가정: **기대값 < 가격.**
 *
 * 실제 게임에서 관측한 규칙이 아니다. 이 프로젝트가 모의 상자를 만들 때
 * "확률형 상품은 파는 쪽이 남아야 성립한다" 는 상식으로 건 조건이고,
 * pack 테스트가 그 조건을 지킨다. 실제 상품이 반드시 그렇다는 주장이
 * 아니므로 화면에서도 '가정' 이라고 적는다.
 */
export const EV_BELOW_PRICE = true;

export interface PackTier {
  id: string;
  label: string;
  /** 0 ~ 1 */
  probability: number;
  /**
   * 위 확률이 어디서 왔는가. 생략하면 'project-sample' 이다 —
   * 기본값을 '공식' 으로 두면 적어 넣기를 잊은 표가 공식으로 뜬다.
   */
  probabilitySource?: ProbabilitySource;
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
  /**
   * 상자 이름. **실제 FC 온라인 상품명이 아니다** — 이 프로젝트가 지은
   * 이름이고, 실제 상품과 비슷하게 들리더라도 다른 물건이다.
   */
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
    /*
     * 가격은 이 프로젝트가 정한 샘플 값이다(실제 상품가가 아니다).
     * 카드 오버롤 표기를 FC 온라인 범위로 올리면서 등급 경계를 다시 잡았고,
     * 그 결과 풀 구성이 바뀌어 기대값이 옛 가격을 넘어섰다. 확률형 상품은
     * 기대값이 가격보다 낮은 게 성립 조건이라(그래야 상자를 파는 쪽이 남는다),
     * 가격을 다시 맞춘다. 이 관계는 pack 테스트가 지킨다.
     */
    price: 6_300_000,
    drawCount: 3,
    tiers: [
      { id: 'common',  label: '일반 (OVR ~104)',     probability: 0.62,  color: '#9aa7b8', rarity: 1, filter: { maxOvr: 104 } },
      { id: 'rare',    label: '레어 (OVR 105~113)',  probability: 0.27,  color: '#c6ff3d', rarity: 2, filter: { minOvr: 105, maxOvr: 113 } },
      { id: 'epic',    label: '에픽 (OVR 114~118)',  probability: 0.093, color: '#22e1ff', rarity: 3, filter: { minOvr: 114, maxOvr: 118 } },
      { id: 'legend',  label: '레전드 (OVR 119+)',   probability: 0.016, color: '#a78bfa', rarity: 4, filter: { minOvr: 119 } },
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
      { id: 'common',  label: '일반 (OVR ~109)',     probability: 0.34,  color: '#9aa7b8', rarity: 1, filter: { maxOvr: 109 } },
      { id: 'rare',    label: '레어 (OVR 110~116)',  probability: 0.42,  color: '#c6ff3d', rarity: 2, filter: { minOvr: 110, maxOvr: 116 } },
      { id: 'epic',    label: '에픽 (OVR 117~119)',  probability: 0.19,  color: '#22e1ff', rarity: 3, filter: { minOvr: 117, maxOvr: 119 } },
      { id: 'legend',  label: '레전드 (OVR 120+)',   probability: 0.042, color: '#a78bfa', rarity: 4, filter: { minOvr: 120 } },
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
      { id: 'common',  label: '일반 (OVR ~101)',     probability: 0.78,   color: '#9aa7b8', rarity: 1, filter: { maxOvr: 101 } },
      { id: 'rare',    label: '레어 (OVR 102~110)',  probability: 0.185,  color: '#c6ff3d', rarity: 2, filter: { minOvr: 102, maxOvr: 110 } },
      { id: 'epic',    label: '에픽 (OVR 111~117)',  probability: 0.032,  color: '#22e1ff', rarity: 3, filter: { minOvr: 111, maxOvr: 117 } },
      { id: 'legend',  label: '레전드 (OVR 118+)',   probability: 0.0028, color: '#a78bfa', rarity: 4, filter: { minOvr: 118 } },
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
      { id: 'icon-low',  label: '아이콘 (OVR ~118)', probability: 0.72, color: '#e0b64a', rarity: 4, filter: { seasonTiers: ['icon'], maxOvr: 118 } },
      { id: 'icon-high', label: '아이콘 (OVR 119+)', probability: 0.28, color: '#f0c14b', rarity: 5, filter: { seasonTiers: ['icon'], minOvr: 119 } },
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

/** 이 등급 확률이 어디서 왔는가. 적지 않았으면 샘플이다. */
export function probabilitySourceOf(tier: PackTier): ProbabilitySource {
  return tier.probabilitySource ?? 'project-sample';
}

/**
 * 이 상자의 확률이 **전부** 공시표에서 온 것인가.
 *
 * 하나라도 샘플이 섞여 있으면 false 다 — 섞인 표를 "공시 확률" 이라고
 * 부르면 공식인 줄 알고 읽는 줄이 생긴다.
 */
export function isOfficialOdds(box: PackBox): boolean {
  return box.tiers.every((tier) => probabilitySourceOf(tier) === 'official');
}
