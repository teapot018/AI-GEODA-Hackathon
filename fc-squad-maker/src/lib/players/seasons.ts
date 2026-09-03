import type { MetaSeason } from '@/lib/nexon/types';

/**
 * 시즌 등급(티어) 판정.
 *
 * seasonid.json 의 seasonId 는 클래스가 추가될 때마다 늘어나므로
 * 숫자를 하드코딩하면 금방 낡는다. 대신 className 앞에 붙는 **시즌 코드**로
 * 티어를 판정해서 새 시즌이 추가돼도 자동으로 분류되게 한다.
 *
 * className 은 넥슨이 `코드 (풀네임)` 형태로 준다.
 *   "ICON (Icon)" · "23UP (23 Ultimate Player)" · "LH (Live Heroes)"
 * 여기서 괄호 앞부분만 떼어 코드로 쓴다. 괄호 **안쪽**까지 훑으면
 * 엉뚱한 곳에 걸린다 — 실제로 'HEROES' 라는 아이콘 키워드가
 * "Live Heroes" 의 뒷단어를 잡아 LH 시즌을 아이콘으로 만든 적이 있다.
 * 짧은 코드일수록 위험해서('TC' 는 "MATCH" 안에도 들어 있다) 부분 일치가
 * 아니라 코드 전체 일치로만 판정한다.
 */
export type SeasonTier = 'icon' | 'legend' | 'high' | 'mid' | 'base';

interface TierRule {
  tier: SeasonTier;
  /** 시즌 코드(연도 접두어 제외)와 정확히 같으면 매칭 */
  codes: string[];
  /** 코드로 못 잡는 한글 표기 대비. className 어디에 있어도 매칭 */
  phrases?: string[];
  /** 프로필 baseOvr 에 더할 보정치 */
  ovrBonus: number;
  /** 카드 가치 배수 */
  valueMultiplier: number;
  color: string;
}

const TIER_RULES: TierRule[] = [
  {
    tier: 'icon',
    codes: ['ICON', 'LIVEICON', 'HEROES'],
    phrases: ['아이콘'],
    ovrBonus: 5,
    valueMultiplier: 6.0,
    color: '#f0c14b',
  },
  {
    tier: 'legend',
    codes: ['TC', 'CC', 'BTB', 'LH', 'TKI', 'TKL'],
    phrases: ['레전드'],
    ovrBonus: 4,
    valueMultiplier: 3.6,
    color: '#a78bfa',
  },
  {
    tier: 'high',
    codes: ['UP', 'TT', 'NG', 'MC', 'OTW', 'TOTS', 'TOTY'],
    ovrBonus: 2,
    valueMultiplier: 2.2,
    color: '#22e1ff',
  },
  {
    tier: 'mid',
    codes: ['NHD', 'LN', 'GR', 'HG', 'VTR', 'CFA', 'EBS'],
    ovrBonus: 0,
    valueMultiplier: 1.3,
    color: '#c6ff3d',
  },
];

const BASE_RULE: TierRule = {
  tier: 'base',
  codes: [],
  ovrBonus: -2,
  valueMultiplier: 1,
  color: '#9aa7b8',
};

/**
 * className 에서 시즌 코드만 뽑는다.
 *   "23UP (23 Ultimate Player)" -> "UP"
 *   "LIVE ICON (Live Icon)"     -> "LIVEICON"
 *   "LH (Live Heroes)"          -> "LH"
 * 앞에 붙는 연도(2~4자리)는 시즌마다 바뀌므로 떼어 낸다.
 */
export function seasonCode(className: string): string {
  const head = className.split('(')[0] ?? '';
  return head.replace(/\s+/g, '').toUpperCase().replace(/^\d{2,4}/, '');
}

export function seasonRule(className: string | undefined): TierRule {
  if (!className) return BASE_RULE;

  const code = seasonCode(className);
  const upper = className.toUpperCase();

  for (const rule of TIER_RULES) {
    if (code && rule.codes.includes(code)) return rule;
    if (rule.phrases?.some((phrase) => upper.includes(phrase.toUpperCase()))) return rule;
  }
  return BASE_RULE;
}

/**
 * 시즌 보정을 얹은 카드 오버롤.
 *
 * 카탈로그와 데모 생성기가 같은 값을 써야 한다 — 데모가 다른 오버롤로
 * 가격을 매기면 화면에 뜬 OVR 과 가격이 서로 안 맞는다.
 */
export function cardOvr(baseOvr: number, className: string | undefined): number {
  const bonus = seasonRule(className).ovrBonus;
  return Math.max(40, Math.min(120, baseOvr + bonus));
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
