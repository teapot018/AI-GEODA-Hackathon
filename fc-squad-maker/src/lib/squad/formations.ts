import type { PositionCode } from '@/lib/players/types';

/**
 * 포메이션 정의.
 * x, y 는 피치 컨테이너에 대한 백분율 좌표다.
 *   x: 0(왼쪽) ~ 100(오른쪽)
 *   y: 0(상대 골대) ~ 100(우리 골대)  → GK 가 아래쪽
 */
export interface FormationSlot {
  /** 스쿼드 내 고유 슬롯 ID */
  id: string;
  position: PositionCode;
  x: number;
  y: number;
}

export interface Formation {
  id: string;
  name: string;
  description: string;
  slots: FormationSlot[];
}

const slot = (id: string, position: PositionCode, x: number, y: number): FormationSlot => ({
  id, position, x, y,
});

export const FORMATIONS: Formation[] = [
  {
    id: '4-3-3',
    name: '4-3-3',
    description: '측면 윙어를 활용한 정통 공격 포메이션',
    slots: [
      slot('gk', 'GK', 50, 91),
      slot('lb', 'LB', 11, 72), slot('lcb', 'LCB', 34, 78), slot('rcb', 'RCB', 66, 78), slot('rb', 'RB', 89, 72),
      slot('lcm', 'LCM', 27, 52), slot('cm', 'CM', 50, 57), slot('rcm', 'RCM', 73, 52),
      slot('lw', 'LW', 16, 22), slot('st', 'ST', 50, 14), slot('rw', 'RW', 84, 22),
    ],
  },
  {
    id: '4-2-3-1',
    name: '4-2-3-1',
    description: '더블 볼란치로 중원을 잠그는 밸런스형',
    slots: [
      slot('gk', 'GK', 50, 91),
      slot('lb', 'LB', 11, 72), slot('lcb', 'LCB', 34, 78), slot('rcb', 'RCB', 66, 78), slot('rb', 'RB', 89, 72),
      slot('ldm', 'LDM', 34, 60), slot('rdm', 'RDM', 66, 60),
      slot('lam', 'LAM', 17, 37), slot('cam', 'CAM', 50, 34), slot('ram', 'RAM', 83, 37),
      slot('st', 'ST', 50, 13),
    ],
  },
  {
    id: '4-4-2',
    name: '4-4-2',
    description: '두 줄 수비와 투톱, 초보자에게 가장 무난한 형태',
    slots: [
      slot('gk', 'GK', 50, 91),
      slot('lb', 'LB', 10, 72), slot('lcb', 'LCB', 35, 78), slot('rcb', 'RCB', 65, 78), slot('rb', 'RB', 90, 72),
      slot('lm', 'LM', 12, 48), slot('lcm', 'LCM', 37, 54), slot('rcm', 'RCM', 63, 54), slot('rm', 'RM', 88, 48),
      slot('ls', 'LS', 38, 17), slot('rs', 'RS', 62, 17),
    ],
  },
  {
    id: '4-1-2-1-2',
    name: '4-1-2-1-2 (다이아몬드)',
    description: '중앙 과밀 다이아몬드, 짧은 패스 축구에 강함',
    slots: [
      slot('gk', 'GK', 50, 91),
      slot('lb', 'LB', 10, 72), slot('lcb', 'LCB', 35, 78), slot('rcb', 'RCB', 65, 78), slot('rb', 'RB', 90, 72),
      slot('cdm', 'CDM', 50, 63),
      slot('lcm', 'LCM', 24, 48), slot('rcm', 'RCM', 76, 48),
      slot('cam', 'CAM', 50, 33),
      slot('ls', 'LS', 38, 15), slot('rs', 'RS', 62, 15),
    ],
  },
  {
    id: '3-5-2',
    name: '3-5-2',
    description: '윙백을 높게 올려 측면 숫자를 만드는 공격형',
    slots: [
      slot('gk', 'GK', 50, 91),
      slot('lcb', 'LCB', 28, 78), slot('cb', 'CB', 50, 81), slot('rcb', 'RCB', 72, 78),
      slot('lwb', 'LWB', 9, 52), slot('cdm', 'CDM', 50, 60), slot('rwb', 'RWB', 91, 52),
      slot('lcm', 'LCM', 30, 40), slot('rcm', 'RCM', 70, 40),
      slot('ls', 'LS', 38, 15), slot('rs', 'RS', 62, 15),
    ],
  },
  {
    id: '5-3-2',
    name: '5-3-2',
    description: '스리백 + 윙백, 역습 지향 수비형',
    slots: [
      slot('gk', 'GK', 50, 91),
      slot('lwb', 'LWB', 8, 64), slot('lcb', 'LCB', 30, 80), slot('cb', 'CB', 50, 83),
      slot('rcb', 'RCB', 70, 80), slot('rwb', 'RWB', 92, 64),
      slot('lcm', 'LCM', 27, 48), slot('cm', 'CM', 50, 52), slot('rcm', 'RCM', 73, 48),
      slot('ls', 'LS', 38, 16), slot('rs', 'RS', 62, 16),
    ],
  },
];

export const DEFAULT_FORMATION = FORMATIONS[0];

export function findFormation(id: string): Formation {
  return FORMATIONS.find((f) => f.id === id) ?? DEFAULT_FORMATION;
}
