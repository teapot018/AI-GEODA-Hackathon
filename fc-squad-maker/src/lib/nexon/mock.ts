import 'server-only';

import { PLAYER_SEED } from '@/lib/players/dataset';
import { archetypeOf } from '@/lib/players/estimate';
import { cardOvr, DEMO_SEASONS } from '@/lib/players/seasons';
import { clampGrade, estimateValue, GRADE_VALUE_MULTIPLIER } from '@/lib/players/value';
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

/**
 * 시세 관측소용 거래 목업.
 *
 * mockTrades 는 카드를 매번 새로 뽑아서 spid 가 거의 안 겹친다 —
 * 그러면 카드마다 표본이 1건이라 가격대도 추세도 나오지 않는다.
 * 여기서는 카드 풀을 좁게 잡고 카드별 기준가 주변에서 가격을 흔들어,
 * 데모에서도 시세 그래프가 실제처럼 보이게 한다.
 */
export function mockMarketTrades(
  nickname: string,
  type: 'buy' | 'sell',
  count = 100,
  poolSize = 24,
): TradeRecord[] {
  /**
   * 카드 풀은 spid 가 겹치지 않아야 한다.
   *
   * 겹치면 한 카드에 기준가가 둘 생기고, 화면에서는 spid 로 묶이므로
   * 그 카드의 체결 기록이 9만원대와 300만원대로 갈라진다 — 중앙값도
   * 사분위도 추세도 의미를 잃는다. (실제로 앙리 카드가 그렇게 나왔다.)
   * 시즌×선수 조합이 유한하니 뽑기 횟수에 상한을 둔다.
   */
  const poolRng = createRng(`market-pool:${nickname}`);
  const pool: Array<{ spid: number; base: number; slope: number }> = [];
  const taken = new Set<number>();

  for (let attempt = 0; pool.length < poolSize && attempt < poolSize * 20; attempt += 1) {
    const season = poolRng.pick(DEMO_SEASONS);
    const profile = poolRng.pick(PLAYER_SEED);
    const spid = season.seasonId * 1_000_000 + demoPidOf(profile.name);
    if (taken.has(spid)) continue;
    taken.add(spid);
    pool.push({
      spid,
      /*
       * 기준가를 난수로 뽑지 않는다.
       *
       * 예전에는 5만~800만 사이를 그냥 굴렸다. 그래서 아이콘 손흥민이
       * 9만이고 2020 K리그 카드가 700만인 표가 나왔다 — 게임을 아는
       * 사람이 한눈에 가짜라고 아는 화면이다. 카드값은 오버롤과 시즌
       * 티어를 따라가므로, 이미 있는 가치 모델에 물려 그 형태를 지킨다.
       */
      base: estimateValue({
        ovr: cardOvr(profile.baseOvr, season.className),
        seasonClassName: season.className,
        grade: 1,
      }),
      // 카드마다 추세 방향을 따로 준다. 하나로 통일하면 데모에서
      // 모든 카드가 나란히 상승해 버려 가짜 티가 난다.
      slope: (poolRng.next() - 0.5) * 0.6,
    });
  }

  if (pool.length === 0) return [];

  const rng = createRng(`market:${nickname}:${type}`);
  return Array.from({ length: count }, (_, i) => {
    const card = rng.pick(pool);
    // i=0 이 가장 최근이다. 최근일수록 slope 만큼 기준가에서 벌어진다.
    const age = i / Math.max(1, count - 1); // 0(최신) ~ 1(과거)
    const drift = 1 + card.slope * (0.5 - age);
    const noise = 0.85 + rng.next() * 0.3;

    /*
     * 등급을 먼저 굴리고, 가격은 그 등급에서 나오게 한다.
     *
     * 예전에는 등급과 가격을 따로 굴렸다. 그 결과 +1 과 +6 이 같은 값에
     * 거래되는 표가 나왔는데, 강화가 값을 몇 배로 올리는 게임에서 이건
     * 그냥 틀린 그림이다. 등급별 가격을 보러 온 사람에게는 특히 그렇다.
     * 강화 배수는 가치 모델(GRADE_VALUE_MULTIPLIER)의 것을 그대로 쓴다 —
     * 추정 모델이지만, 적어도 화면 곳곳이 같은 곡선을 말하게 된다.
     */
    const grade = rng.next() < 0.75 ? 1 : rng.int(2, 6);
    const gradeMultiplier = GRADE_VALUE_MULTIPLIER[clampGrade(grade) - 1];

    return {
      tradeDate: new Date(Date.now() - (i + 1) * rng.int(1, 6) * 3_600_000)
        .toISOString()
        .slice(0, 19),
      saleSn: `${rng.int(100000, 999999)}`,
      spid: card.spid,
      grade,
      value: Math.max(
        10_000,
        Math.round((card.base * gradeMultiplier * drift * noise) / 10_000) * 10_000,
      ),
    };
  });
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

  /**
   * 시도와 성공을 따로 뽑으면 성공률이 100% 를 넘는 선수가 나온다.
   * 성공은 반드시 시도에서 파생시킨다.
   */
  const attempt = (min: number, max: number, lowRate: number, highRate: number) => {
    const tries = rng.int(min, max);
    return { tries, success: Math.round(tries * (lowRate + rng.next() * (highRate - lowRate))) };
  };

  const players: MatchPlayer[] = FORMATION_POSITIONS.map(([spPosition, position]) => {
    const pass = attempt(10, 70, 0.62, 0.95);
    const dribble = attempt(0, 12, 0.5, 0.95);
    const possession = attempt(10, 80, 0.55, 0.9);
    const aerial = attempt(0, 8, 0.3, 0.85);
    const block = attempt(0, 5, 0.3, 0.8);
    const tackle = attempt(0, 8, 0.4, 0.85);
    const shoot = rng.int(0, 4);

    return {
      spId: mockSpidAt(rng, position),
      spPosition,
      spGrade: rng.next() < 0.6 ? 1 : rng.int(2, 8),
      status: {
        shoot,
        effectiveShoot: rng.int(0, shoot),
        assist: rng.int(0, 2),
        goal: rng.int(0, 2), dribble: rng.int(0, 20), intercept: rng.int(0, 6),
        defending: rng.int(0, 8),
        passTry: pass.tries, passSuccess: pass.success,
        dribbleTry: dribble.tries, dribbleSuccess: dribble.success,
        ballPossesionTry: possession.tries, ballPossesionSuccess: possession.success,
        aerialTry: aerial.tries, aerialSuccess: aerial.success,
        blockTry: block.tries, block: block.success,
        tackleTry: tackle.tries, tackle: tackle.success,
        yellowCards: rng.next() < 0.12 ? 1 : 0, redCards: rng.next() < 0.02 ? 1 : 0,
        spRating: Math.round((5.5 + rng.next() * 4) * 10) / 10,
      },
    };
  });

  const teamBlock = attempt(0, 14, 0.3, 0.8);
  const teamTackle = attempt(2, 25, 0.4, 0.85);

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
      blockTry: teamBlock.tries, blockSuccess: teamBlock.success,
      tackleTry: teamTackle.tries, tackleSuccess: teamTackle.success,
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
