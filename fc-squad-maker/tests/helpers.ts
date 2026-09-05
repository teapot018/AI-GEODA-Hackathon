import type {
  MatchDefence,
  MatchDetail,
  MatchDetailInfo,
  MatchPass,
  MatchPlayer,
  MatchPlayerStatus,
  MatchShoot,
  MatchSide,
} from '@/lib/nexon/types';
import type { PlayerCardData, PositionCode } from '@/lib/players/types';

/**
 * 테스트용 카드 공장.
 * 케미/평점 테스트는 "누가 어느 클럽인가"만 중요하지 능력치는 곁가지라,
 * 기본값을 잔뜩 채워 두고 필요한 필드만 덮어쓰게 한다.
 */
export function makeCard(over: Partial<PlayerCardData> = {}): PlayerCardData {
  return {
    spid: 300_000_001,
    pid: 1,
    seasonId: 300,
    seasonName: '23UP (23 Ultimate Player)',
    seasonImg: '',
    imageUrl: '',
    name: '테스트 선수',
    positions: ['ST'],
    ovr: 90,
    stats: { pace: 92, shooting: 93, passing: 80, dribbling: 90, defending: 40, physical: 85 },
    skillMoves: 5,
    weakFoot: 4,
    foot: '오른발',
    statSource: 'project-seed',
    ...over,
  };
}

/* ── 매치 상세 픽스처 ─────────────────────────────────────── */

/**
 * 전적 분석 테스트는 "골 몇 개, 평점 몇 점" 만 보므로
 * 나머지 20여 개 스탯은 0 으로 채우고 필요한 것만 덮어쓴다.
 */
export function makePlayerStatus(over: Partial<MatchPlayerStatus> = {}): MatchPlayerStatus {
  return {
    shoot: 0, effectiveShoot: 0, assist: 0, goal: 0, dribble: 0,
    intercept: 0, defending: 0, passTry: 0, passSuccess: 0,
    dribbleTry: 0, dribbleSuccess: 0, ballPossesionTry: 0, ballPossesionSuccess: 0,
    aerialTry: 0, aerialSuccess: 0, blockTry: 0, block: 0,
    tackleTry: 0, tackle: 0, yellowCards: 0, redCards: 0, spRating: 7,
    ...over,
  };
}

/** status 만 부분 지정할 수 있게 한 오버라이드 타입 */
export interface MatchPlayerOverrides extends Partial<Omit<MatchPlayer, 'status'>> {
  status?: Partial<MatchPlayerStatus>;
}

export function makeMatchPlayer(over: MatchPlayerOverrides = {}): MatchPlayer {
  return {
    spId: 300_000_001,
    spPosition: 25,
    spGrade: 1,
    ...over,
    status: makePlayerStatus(over.status),
  };
}

/** 중첩 블록을 하나씩 부분 지정할 수 있게 한 오버라이드 타입 */
export interface MatchSideOverrides {
  ouid?: string;
  nickname?: string;
  matchDetail?: Partial<MatchDetailInfo>;
  shoot?: Partial<MatchShoot>;
  pass?: Partial<MatchPass>;
  defence?: Partial<MatchDefence>;
  player?: MatchPlayer[];
}

export function makeMatchSide(over: MatchSideOverrides = {}): MatchSide {
  const goals = over.shoot?.goalTotal ?? 0;
  return {
    ouid: 'me',
    nickname: '나',
    ...over,
    matchDetail: {
      seasonId: 202401, matchResult: '승', matchEndType: 0, systemPause: 0,
      foul: 0, injury: 0, redCards: 0, yellowCards: 0, dribble: 0,
      cornerKick: 0, possession: 50, offsideCount: 0, averageRating: 7,
      controller: 'gamepad',
      ...over.matchDetail,
    },
    shoot: {
      shootTotal: 10, effectiveShootTotal: 5, shootOutScore: 0,
      goalTotal: goals, goalTotalDisplay: goals, ownGoal: 0,
      shootHeading: 0, goalHeading: 0, shootFreekick: 0, goalFreekick: 0,
      shootInPenalty: 0, goalInPenalty: 0, shootOutPenalty: 0, goalOutPenalty: 0,
      shootPenaltyKick: 0, goalPenaltyKick: 0,
      ...over.shoot,
    },
    pass: {
      passTry: 100, passSuccess: 80, shortPassTry: 0, shortPassSuccess: 0,
      longPassTry: 0, longPassSuccess: 0, bouncingLobPassTry: 0, bouncingLobPassSuccess: 0,
      drivenGroundPassTry: 0, drivenGroundPassSuccess: 0, throughPassTry: 0,
      throughPassSuccess: 0, lobbedThroughPassTry: 0, lobbedThroughPassSuccess: 0,
      ...over.pass,
    },
    defence: {
      blockTry: 0, blockSuccess: 0, tackleTry: 0, tackleSuccess: 0,
      ...over.defence,
    },
    player: over.player ?? [makeMatchPlayer()],
  };
}

/** me / opponent 로 양쪽을 따로 꾸밀 수 있다. */
export function makeMatch(
  over: Partial<MatchDetail> & { me?: MatchSideOverrides; opponent?: MatchSideOverrides } = {},
): MatchDetail {
  const { me, opponent, ...rest } = over;
  return {
    matchId: 'match-1',
    matchDate: '2024-06-01T12:00:00',
    matchType: 50,
    matchInfo: [
      makeMatchSide({ ouid: 'me', nickname: '나', ...me }),
      makeMatchSide({ ouid: 'foe', nickname: '상대', ...opponent }),
    ],
    ...rest,
  };
}

/** 같은 클럽/국가/리그를 공유하는 카드 n 장 */
export function makeSquadOf(
  count: number,
  shared: Partial<PlayerCardData>,
  positions: PositionCode[] = ['CM'],
): PlayerCardData[] {
  return Array.from({ length: count }, (_, i) =>
    makeCard({ ...shared, name: `선수${i + 1}`, spid: 300_000_001 + i, pid: 1 + i, positions }),
  );
}
