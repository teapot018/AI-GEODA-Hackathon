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
    ovrBonus: 32,
    valueMultiplier: 6.0,
    color: '#f0c14b',
  },
  {
    tier: 'legend',
    codes: ['TC', 'CC', 'BTB', 'LH', 'TKI', 'TKL'],
    phrases: ['레전드'],
    ovrBonus: 30,
    valueMultiplier: 3.6,
    color: '#a78bfa',
  },
  {
    tier: 'high',
    codes: ['UP', 'TT', 'NG', 'MC', 'OTW', 'TOTS', 'TOTY'],
    ovrBonus: 27,
    valueMultiplier: 2.2,
    color: '#22e1ff',
  },
  {
    tier: 'mid',
    codes: ['NHD', 'LN', 'GR', 'HG', 'VTR', 'CFA', 'EBS'],
    ovrBonus: 24,
    valueMultiplier: 1.3,
    color: '#c6ff3d',
  },
];

const BASE_RULE: TierRule = {
  tier: 'base',
  codes: [],
  ovrBonus: 22,
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
 * ── 시드 능력치 → FC 온라인 카드 표기 ──────────────────────
 *
 * PLAYER_SEED 의 baseOvr 는 현실 선수 기량을 68~93 범위로 적어 둔 값이다.
 * 그런데 게임 안에서 보이는 숫자는 그 범위가 아니다 — 시즌이 쌓이며
 * 파워 인플레가 진행돼, 요즘 상위 카드는 **+1 에서 이미 120대**를 찍는다.
 * 68~93 을 그대로 띄우면 게임을 아는 사람 눈에는 다른 게임 화면이다.
 *
 * 그래서 시드는 '현실 기량' 층으로 두고, 카드로 만들 때 시즌 티어만큼
 * 끌어올린다. 티어 차이가 곧 파워 인플레의 크기다.
 *
 *   지단(93) + 아이콘(32) = 125    이순민(68) + 기본(22) = 90
 *
 * 상한을 145 로 둔 이유: +10 은 여기에 18 을 더 얹으므로(enhance.ts),
 * 상위 카드가 만강되면 140대까지 올라간다. 120 으로 두면 고강화 카드가
 * 전부 같은 숫자에 눌려붙어 강화의 의미가 화면에서 사라진다.
 *
 * 이 숫자들은 추정이며 화면에서도 `추정` 으로 표기한다. 넥슨 Open API 는
 * 능력치를 주지 않으므로 실측으로 맞출 방법이 없다.
 */
export function cardOvr(baseOvr: number, className: string | undefined): number {
  const bonus = seasonRule(className).ovrBonus;
  return Math.max(60, Math.min(145, baseOvr + bonus));
}

/**
 * 카드 표기에 맞춘 세부 능력치 배율.
 *
 * 오버롤만 올리고 스탯을 시드 그대로 두면 OVR 125 카드에 페이스 56 이
 * 붙는다 — 같은 카드를 설명하는 두 숫자가 서로 다른 게임을 말하는 꼴이다.
 * 오버롤이 오른 비율만큼 스탯도 같이 민다.
 */
export function cardStatFactor(baseOvr: number, className: string | undefined): number {
  if (baseOvr <= 0) return 1;
  return cardOvr(baseOvr, className) / baseOvr;
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
