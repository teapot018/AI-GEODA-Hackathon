import 'server-only';

import { PLAYER_SEED } from '@/lib/players/dataset';
import { archetypeOf } from '@/lib/players/estimate';
import { DEMO_SEASONS } from '@/lib/players/seasons';
import type { PositionCode } from '@/lib/players/types';
import { createRng } from '@/lib/utils/rng';
import { demoPidOf } from './meta';
import type {
  MatchDetail,
  MatchPlayer,
  MatchSide,
  MaxDivision,
  TradeRecord,
  UserBasic,
} from './types';

/**
 * 데모(목업) 데이터 생성기.
 *
 * API 키가 없거나 넥슨 API 호출이 실패했을 때 화면이 텅 비지 않도록
 * 닉네임에서 시드를 뽑아 **결정적으로** 같은 데이터를 만들어 준다.
 * 응답에는 항상 source: 'mock' 이 붙어 UI 가 "데모 데이터" 배지를 띄운다.
 */

export function mockOuid(nickname: string): string {
  const rng = createRng(`ouid:${nickname}`);
  return Array.from({ length: 4 }, () =>
    Math.floor(rng.next() * 0xffffffff).toString(16).padStart(8, '0'),
  ).join('');
}

export function mockUserBasic(nickname: string): UserBasic {
  const rng = createRng(`basic:${nickname}`);
  return {
    ouid: mockOuid(nickname),
    nickname,
    level: rng.int(40, 130),
  };
}

const DIVISION_POOL = [800, 900, 1000, 1100, 1200, 2000, 2100, 2200, 2300];

export function mockMaxDivision(nickname: string): MaxDivision[] {
  const rng = createRng(`division:${nickname}`);
  return [50, 52].map((matchType) => ({
    matchType,
    division: rng.pick(DIVISION_POOL),
    achievementDate: new Date(Date.now() - rng.int(30, 900) * 86_400_000)
      .toISOString()
      .slice(0, 19),
  }));
}

function mockSpid(rng: ReturnType<typeof createRng>): number {
  const season = rng.pick(DEMO_SEASONS);
  const profile = rng.pick(PLAYER_SEED);
  return season.seasonId * 1_000_000 + demoPidOf(profile.name);
}

/**
 * 포지션에 맞는 선수로 목업 라인업을 만든다.
 * (아무 선수나 뽑으면 GK 자리에 수비수가 서는 등 데모가 어색해진다.)
 */
function mockSpidAt(rng: ReturnType<typeof createRng>, position: PositionCode): number {
  const archetype = archetypeOf(position);
  const exact = PLAYER_SEED.filter((p) => p.positions.includes(position));
  const similar = PLAYER_SEED.filter((p) => p.positions.some((code) => archetypeOf(code) === archetype));
  const pool = exact.length > 0 ? exact : similar.length > 0 ? similar : PLAYER_SEED;

  const season = rng.pick(DEMO_SEASONS);
  return season.seasonId * 1_000_000 + demoPidOf(rng.pick(pool).name);
}

export function mockTrades(nickname: string, type: 'buy' | 'sell', count = 20): TradeRecord[] {
  const rng = createRng(`trade:${nickname}:${type}`);
  return Array.from({ length: count }, (_, i) => ({
    tradeDate: new Date(Date.now() - (i + 1) * rng.int(2, 30) * 3_600_000)
      .toISOString()
      .slice(0, 19),
    saleSn: `${rng.int(100000, 999999)}`,
    spid: mockSpid(rng),
    grade: rng.next() < 0.75 ? 1 : rng.int(2, 6),
    value: rng.int(3, 900) * 10_000,
  }));
}

export function mockMatchIds(ouid: string, matchType: number, count = 10): string[] {
  const rng = createRng(`matchids:${ouid}:${matchType}`);
  return Array.from({ length: count }, () =>
    Array.from({ length: 3 }, () =>
      Math.floor(rng.next() * 0xffffffff).toString(16).padStart(8, '0'),
    ).join(''),
  );
}

/** spposition 코드와 대응 포지션 (4-3-3 기준) */
const FORMATION_POSITIONS: Array<[number, PositionCode]> = [
  [0, 'GK'], [7, 'LB'], [6, 'LCB'], [4, 'RCB'], [3, 'RB'],
  [15, 'LCM'], [14, 'CM'], [13, 'RCM'],
  [27, 'LW'], [25, 'ST'], [23, 'RW'],
];

function mockSide(seed: string, nickname: string, isWinner: boolean | null): MatchSide {
  const rng = createRng(seed);
  const goals = isWinner === null ? rng.int(1, 3) : isWinner ? rng.int(2, 5) : rng.int(0, 2);
  const shootTotal = goals + rng.int(3, 12);
  const passTry = rng.int(280, 620);
  const passSuccess = Math.round(passTry * (0.72 + rng.next() * 0.2));

  const players: MatchPlayer[] = FORMATION_POSITIONS.map(([spPosition, position]) => ({
    spId: mockSpidAt(rng, position),
    spPosition,
    spGrade: rng.next() < 0.6 ? 1 : rng.int(2, 8),
    status: {
      shoot: rng.int(0, 4), effectiveShoot: rng.int(0, 3), assist: rng.int(0, 2),
      goal: rng.int(0, 2), dribble: rng.int(0, 20), intercept: rng.int(0, 6),
      defending: rng.int(0, 8), passTry: rng.int(10, 70), passSuccess: rng.int(8, 65),
      dribbleTry: rng.int(0, 12), dribbleSuccess: rng.int(0, 10),
      ballPossesionTry: rng.int(10, 80), ballPossesionSuccess: rng.int(8, 70),
      aerialTry: rng.int(0, 8), aerialSuccess: rng.int(0, 6),
      blockTry: rng.int(0, 5), block: rng.int(0, 3),
      tackleTry: rng.int(0, 8), tackle: rng.int(0, 6),
      yellowCards: rng.next() < 0.12 ? 1 : 0, redCards: rng.next() < 0.02 ? 1 : 0,
      spRating: Math.round((5.5 + rng.next() * 4) * 10) / 10,
    },
  }));

  return {
    ouid: mockOuid(nickname),
    nickname,
    matchDetail: {
      seasonId: 202401,
      matchResult: isWinner === null ? '무' : isWinner ? '승' : '패',
      matchEndType: 0,
      systemPause: 0,
      foul: rng.int(0, 8),
      injury: rng.int(0, 2),
      redCards: rng.next() < 0.05 ? 1 : 0,
      yellowCards: rng.int(0, 3),
      dribble: rng.int(20, 160),
      cornerKick: rng.int(0, 9),
      possession: rng.int(35, 65),
      offsideCount: rng.int(0, 4),
      averageRating: Math.round((6 + rng.next() * 2) * 10) / 10,
      controller: rng.next() < 0.5 ? 'keyboard' : 'gamepad',
    },
    shoot: {
      shootTotal, effectiveShootTotal: Math.max(goals, rng.int(1, shootTotal)),
      shootOutScore: rng.int(0, 3), goalTotal: goals, goalTotalDisplay: goals,
      ownGoal: 0, shootHeading: rng.int(0, 3), goalHeading: rng.int(0, 1),
      shootFreekick: rng.int(0, 2), goalFreekick: 0,
      shootInPenalty: rng.int(1, 8), goalInPenalty: goals,
      shootOutPenalty: rng.int(0, 5), goalOutPenalty: 0,
      shootPenaltyKick: rng.int(0, 1), goalPenaltyKick: 0,
    },
    pass: {
      passTry, passSuccess,
      shortPassTry: Math.round(passTry * 0.6), shortPassSuccess: Math.round(passSuccess * 0.65),
      longPassTry: rng.int(10, 40), longPassSuccess: rng.int(5, 30),
      bouncingLobPassTry: rng.int(0, 15), bouncingLobPassSuccess: rng.int(0, 12),
      drivenGroundPassTry: rng.int(0, 30), drivenGroundPassSuccess: rng.int(0, 25),
      throughPassTry: rng.int(0, 20), throughPassSuccess: rng.int(0, 15),
      lobbedThroughPassTry: rng.int(0, 10), lobbedThroughPassSuccess: rng.int(0, 7),
    },
    defence: {
      blockTry: rng.int(0, 14), blockSuccess: rng.int(0, 10),
      tackleTry: rng.int(2, 25), tackleSuccess: rng.int(1, 18),
    },
    player: players,
  };
}

const OPPONENT_NAMES = [
  '강남_피파장인', '역삼동케인', '컨트롤러파괴자', '수비만해요', '무패신화',
  '박스깡의신', '월클도전중', '손세이셔널', '드리블머신', '골든볼',
];

export function mockMatchDetail(matchId: string, nickname: string, matchType = 50): MatchDetail {
  const rng = createRng(`match:${matchId}`);
  const outcome = rng.next();
  const won = outcome < 0.45 ? true : outcome < 0.85 ? false : null;
  const opponent = rng.pick(OPPONENT_NAMES);

  return {
    matchId,
    matchDate: new Date(Date.now() - rng.int(1, 480) * 3_600_000).toISOString().slice(0, 19),
    matchType,
    matchInfo: [
      mockSide(`${matchId}:me`, nickname, won),
      mockSide(`${matchId}:op`, opponent, won === null ? null : !won),
    ],
  };
}
