import type { HexStats, PlayerProfile, PositionCode } from './types';

/**
 * 시드에 없는 선수의 능력치를 포지션 기반으로 추정한다.
 *
 * 공식 Open API 에 능력치가 없기 때문에, 시드에 없는 카드도 스쿼드에
 * 배치할 수 있도록 "포지션 평균 프로필"을 만들어 채운다.
 * 추정치는 카드에 `추정` 배지로 표시해 실측과 구분한다.
 */

type Archetype = 'gk' | 'cb' | 'fb' | 'dm' | 'cm' | 'am' | 'wing' | 'st';

const ARCHETYPE_OF: Record<string, Archetype> = {
  GK: 'gk',
  SW: 'cb', CB: 'cb', RCB: 'cb', LCB: 'cb',
  RB: 'fb', LB: 'fb', RWB: 'fb', LWB: 'fb',
  CDM: 'dm', RDM: 'dm', LDM: 'dm',
  CM: 'cm', RCM: 'cm', LCM: 'cm',
  CAM: 'am', RAM: 'am', LAM: 'am', CF: 'am',
  RM: 'wing', LM: 'wing', RW: 'wing', LW: 'wing', RF: 'wing', LF: 'wing',
  ST: 'st', RS: 'st', LS: 'st',
};

/** baseOvr 를 100 기준으로 뒀을 때의 스탯 비율 */
const ARCHETYPE_SHAPE: Record<Archetype, HexStats> = {
  gk:   { pace: 0.62, shooting: 0.42, passing: 0.68, dribbling: 0.65, defending: 0.35, physical: 0.86 },
  cb:   { pace: 0.82, shooting: 0.55, passing: 0.74, dribbling: 0.74, defending: 0.99, physical: 0.96 },
  fb:   { pace: 0.98, shooting: 0.72, passing: 0.90, dribbling: 0.92, defending: 0.90, physical: 0.85 },
  dm:   { pace: 0.80, shooting: 0.78, passing: 0.90, dribbling: 0.88, defending: 0.97, physical: 0.95 },
  cm:   { pace: 0.82, shooting: 0.86, passing: 0.98, dribbling: 0.95, defending: 0.82, physical: 0.84 },
  am:   { pace: 0.88, shooting: 0.94, passing: 0.97, dribbling: 1.00, defending: 0.55, physical: 0.76 },
  wing: { pace: 1.03, shooting: 0.92, passing: 0.90, dribbling: 1.00, defending: 0.50, physical: 0.75 },
  st:   { pace: 0.97, shooting: 1.03, passing: 0.82, dribbling: 0.95, defending: 0.42, physical: 0.90 },
};

/** 이름 문자열을 안정적인 0~1 실수로 (같은 선수는 항상 같은 값) */
function nameNoise(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i += 1) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

const clamp = (n: number, min = 30, max = 99) => Math.max(min, Math.min(max, Math.round(n)));

export function archetypeOf(position: PositionCode | string): Archetype {
  return ARCHETYPE_OF[position] ?? 'cm';
}

export interface EstimateInput {
  name: string;
  positions?: PositionCode[];
  /** 알고 있는 오버롤이 있으면 기준으로 사용 */
  ovr?: number;
}

export function estimateProfile({ name, positions, ovr }: EstimateInput): PlayerProfile {
  const noise = nameNoise(name);
  const pos = positions && positions.length > 0 ? positions : (['CM'] as PositionCode[]);
  const archetype = archetypeOf(pos[0]);
  const shape = ARCHETYPE_SHAPE[archetype];

  // 오버롤을 모르면 62~92 사이에서 이름 기반으로 안정적으로 뽑는다.
  // 범위를 넓게 잡아야 상자 시뮬레이터의 등급별 풀이 고르게 찬다.
  const baseOvr = ovr ?? Math.round(62 + noise * 30);

  const jitter = (key: keyof HexStats, index: number) =>
    ((nameNoise(`${name}:${key}:${index}`) - 0.5) * 6);

  const stats: HexStats = {
    pace: clamp(baseOvr * shape.pace + jitter('pace', 1)),
    shooting: clamp(baseOvr * shape.shooting + jitter('shooting', 2)),
    passing: clamp(baseOvr * shape.passing + jitter('passing', 3)),
    dribbling: clamp(baseOvr * shape.dribbling + jitter('dribbling', 4)),
    defending: clamp(baseOvr * shape.defending + jitter('defending', 5)),
    physical: clamp(baseOvr * shape.physical + jitter('physical', 6)),
  };

  const profile: PlayerProfile = {
    name,
    positions: pos,
    baseOvr,
    stats,
    skillMoves: archetype === 'gk' ? 1 : 2 + Math.round(noise * 2),
    weakFoot: 2 + Math.round(nameNoise(`${name}:wf`) * 2),
    foot: nameNoise(`${name}:foot`) > 0.78 ? '왼발' : '오른발',
  };

  if (archetype === 'gk') {
    profile.gk = {
      diving: clamp(baseOvr + jitter('pace', 7)),
      handling: clamp(baseOvr - 2 + jitter('passing', 8)),
      kicking: clamp(baseOvr - 8 + jitter('shooting', 9)),
      reflexes: clamp(baseOvr + 1 + jitter('dribbling', 10)),
      speed: clamp(baseOvr - 30 + jitter('physical', 11)),
      positioning: clamp(baseOvr - 1 + jitter('defending', 12)),
    };
  }

  return profile;
}
