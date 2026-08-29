import type { MetaSeason } from '@/lib/nexon/types';

/**
 * 시즌 등급(티어) 판정.
 *
 * seasonid.json 의 seasonId 는 클래스가 추가될 때마다 늘어나므로
 * 숫자를 하드코딩하면 금방 낡는다. 대신 className 키워드로 티어를
 * 판정해서 새 시즌이 추가돼도 자동으로 분류되게 한다.
 */
export type SeasonTier = 'icon' | 'legend' | 'high' | 'mid' | 'base';

interface TierRule {
  tier: SeasonTier;
  /** className 에 이 중 하나가 포함되면 매칭 */
  keywords: string[];
  /** 프로필 baseOvr 에 더할 보정치 */
  ovrBonus: number;
  /** 카드 가치 배수 */
  valueMultiplier: number;
  color: string;
}

const TIER_RULES: TierRule[] = [
  { tier: 'icon',   keywords: ['ICON', '아이콘', 'LIVE ICON', 'HEROES'],            ovrBonus: 5,  valueMultiplier: 6.0, color: '#f0c14b' },
  { tier: 'legend', keywords: ['TC', 'CC', 'BTB', 'LH', 'TKI', 'TKL', '레전드'],    ovrBonus: 4,  valueMultiplier: 3.6, color: '#a78bfa' },
  { tier: 'high',   keywords: ['UP', 'TT', 'NG', 'MC', 'OTW', 'TOTS', 'TOTY'],      ovrBonus: 2,  valueMultiplier: 2.2, color: '#22e1ff' },
  { tier: 'mid',    keywords: ['NHD', 'LN', 'GR', 'HG', 'VTR', 'CFA', 'EBS'],       ovrBonus: 0,  valueMultiplier: 1.3, color: '#c6ff3d' },
];

const BASE_RULE: TierRule = {
  tier: 'base',
  keywords: [],
  ovrBonus: -2,
  valueMultiplier: 1,
  color: '#9aa7b8',
};

export function seasonRule(className: string | undefined): TierRule {
  if (!className) return BASE_RULE;
  const upper = className.toUpperCase();
  for (const rule of TIER_RULES) {
    if (rule.keywords.some((kw) => upper.includes(kw.toUpperCase()))) return rule;
  }
  return BASE_RULE;
}

export function seasonTier(className: string | undefined): SeasonTier {
  return seasonRule(className).tier;
}

/**
 * 데모(목업) 모드에서 쓰는 시즌 목록.
 * 실행 중 넥슨 seasonid.json 을 받아오면 그걸로 통째로 대체된다.
 */
export const DEMO_SEASONS: MetaSeason[] = [
  { seasonId: 300, className: '23UP (23 Ultimate Player)', seasonImg: '' },
  { seasonId: 274, className: 'ICON (Icon)', seasonImg: '' },
  { seasonId: 268, className: 'TC (Team Color)', seasonImg: '' },
  { seasonId: 256, className: '22TT (22 Team of the Tournament)', seasonImg: '' },
  { seasonId: 245, className: 'NG (Next Generation)', seasonImg: '' },
  { seasonId: 234, className: 'LH (Live Heroes)', seasonImg: '' },
  { seasonId: 212, className: 'MC (Mobile Class)', seasonImg: '' },
  { seasonId: 101, className: '20KL (2020 K League)', seasonImg: '' },
];
