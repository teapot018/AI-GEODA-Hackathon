import type { MatchDetail, MatchPlayer, MatchSide } from '@/lib/nexon/types';

/**
 * ── 전적 분석 ──────────────────────────────────────────────
 *
 * `/fconline/v1/match-detail` 은 그 경기에 뛴 선수들의 세부 스탯
 * (슛/패스/드리블/태클/공중볼/카드/평점)을 준다. **몇 명이 오는지는
 * 응답을 열어 봐야 안다** — 양 팀 11+11 을 가정하지 않는다. 아래 집계는
 * 전부 실제로 온 선수만 세고, 없는 자리를 채우지 않는다.
 * 지금까지는 골·도움·평점만 화면에 쓰고 나머지를 버리고 있었는데,
 * 여러 경기를 겹쳐 집계하면 "이 선수가 내 스쿼드에서 실제로 일하는가"
 * 를 판단할 수 있는 실전 성능 리포트가 나온다.
 *
 * 모든 함수는 순수 함수다 — 네트워크를 모르고, 입력이 같으면 출력이 같다.
 */

export type ResultKind = '승' | '무' | '패';

/** 넥슨은 몰수승/몰수패 같은 변형 문자열도 내려준다. */
export function classifyResult(matchResult: string): ResultKind {
  if (matchResult.includes('승')) return '승';
  if (matchResult.includes('패')) return '패';
  return '무';
}

/**
 * 성공률. 성공은 시도를 넘을 수 없다는 게 정의라서 1 로 자른다 —
 * 넥슨 응답이 어긋나 있어도 화면에 "패스 성공률 119%" 가 뜨지는 않게.
 */
const ratio = (success: number, total: number): number =>
  total > 0 ? Math.min(1, success / total) : 0;
const avg = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((acc, v) => acc + v, 0) / values.length;
const round1 = (value: number): number => Math.round(value * 10) / 10;

export interface Streak {
  kind: ResultKind;
  length: number;
}

export interface ManagerForm {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  /** 0~1 */
  winRate: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  avgGoalsFor: number;
  avgGoalsAgainst: number;
  cleanSheets: number;
  /** 무득점으로 끝난 경기 */
  blanks: number;
  avgPossession: number;
  /** 0~1 */
  avgPassRate: number;
  /** 유효슛 / 전체슛, 0~1 */
  shotAccuracy: number;
  /** 골 / 유효슛, 0~1 */
  conversionRate: number;
  avgRating: number;
  totalShots: number;
  totalShotsOnTarget: number;
  yellowCards: number;
  redCards: number;
  /** 최신 경기가 앞 */
  results: ResultKind[];
  streak: Streak | null;
}

const EMPTY_FORM: ManagerForm = {
  played: 0, wins: 0, draws: 0, losses: 0, winRate: 0,
  goalsFor: 0, goalsAgainst: 0, goalDiff: 0, avgGoalsFor: 0, avgGoalsAgainst: 0,
  cleanSheets: 0, blanks: 0, avgPossession: 0, avgPassRate: 0,
  shotAccuracy: 0, conversionRate: 0, avgRating: 0,
  totalShots: 0, totalShotsOnTarget: 0, yellowCards: 0, redCards: 0,
  results: [], streak: null,
};

/** 내 쪽 MatchSide 를 고른다. ouid 가 안 맞으면 첫 번째를 나로 본다(목업 대비). */
export function mySide(detail: MatchDetail, ouid: string): MatchSide | null {
  if (detail.matchInfo.length === 0) return null;
  return detail.matchInfo.find((side) => side.ouid === ouid) ?? detail.matchInfo[0];
}

function opponentSide(detail: MatchDetail, me: MatchSide): MatchSide | null {
  return detail.matchInfo.find((side) => side !== me) ?? null;
}

/** 최신 경기부터 같은 결과가 몇 번 연속인지 */
export function currentStreak(results: ResultKind[]): Streak | null {
  if (results.length === 0) return null;
  const kind = results[0];
  let length = 0;
  for (const result of results) {
    if (result !== kind) break;
    length += 1;
  }
  return { kind, length };
}

/**
 * 매치 상세 목록을 하나의 폼 지표로 접는다.
 * details 는 최신순으로 들어온다고 가정한다 (Open API 가 그렇게 준다).
 */
export function buildManagerForm(details: MatchDetail[], ouid: string): ManagerForm {
  const rows = details
    .map((detail) => {
      const me = mySide(detail, ouid);
      return me ? { me, opponent: opponentSide(detail, me) } : null;
    })
    .filter((row): row is { me: MatchSide; opponent: MatchSide | null } => row !== null);

  if (rows.length === 0) return EMPTY_FORM;

  const results = rows.map((row) => classifyResult(row.me.matchDetail.matchResult));
  const goalsFor = rows.reduce((acc, row) => acc + row.me.shoot.goalTotal, 0);
  const goalsAgainst = rows.reduce((acc, row) => acc + (row.opponent?.shoot.goalTotal ?? 0), 0);
  const totalShots = rows.reduce((acc, row) => acc + row.me.shoot.shootTotal, 0);
  const totalShotsOnTarget = rows.reduce((acc, row) => acc + row.me.shoot.effectiveShootTotal, 0);
  const passTry = rows.reduce((acc, row) => acc + row.me.pass.passTry, 0);
  const passSuccess = rows.reduce((acc, row) => acc + row.me.pass.passSuccess, 0);

  const wins = results.filter((r) => r === '승').length;
  const draws = results.filter((r) => r === '무').length;

  return {
    played: rows.length,
    wins,
    draws,
    losses: results.length - wins - draws,
    winRate: ratio(wins, rows.length),
    goalsFor,
    goalsAgainst,
    goalDiff: goalsFor - goalsAgainst,
    avgGoalsFor: round1(goalsFor / rows.length),
    avgGoalsAgainst: round1(goalsAgainst / rows.length),
    cleanSheets: rows.filter((row) => (row.opponent?.shoot.goalTotal ?? 0) === 0).length,
    blanks: rows.filter((row) => row.me.shoot.goalTotal === 0).length,
    avgPossession: Math.round(avg(rows.map((row) => row.me.matchDetail.possession))),
    avgPassRate: ratio(passSuccess, passTry),
    shotAccuracy: ratio(totalShotsOnTarget, totalShots),
    conversionRate: ratio(goalsFor, totalShotsOnTarget),
    avgRating: round1(avg(rows.map((row) => row.me.matchDetail.averageRating))),
    totalShots,
    totalShotsOnTarget,
    yellowCards: rows.reduce((acc, row) => acc + row.me.matchDetail.yellowCards, 0),
    redCards: rows.reduce((acc, row) => acc + row.me.matchDetail.redCards, 0),
    results,
    streak: currentStreak(results),
  };
}

/* ── 선수 실전 성능 ────────────────────────────────────────── */

export interface PlayerPerformance {
  spid: number;
  /** 출전 경기 수 */
  apps: number;
  goals: number;
  assists: number;
  /** (골 + 도움) / 출전 */
  contributionPerApp: number;
  avgRating: number;
  bestRating: number;
  shots: number;
  shotsOnTarget: number;
  /** 0~1 */
  passRate: number;
  dribbleRate: number;
  tackleRate: number;
  aerialRate: number;
  intercept: number;
  block: number;
  defending: number;
  yellowCards: number;
  redCards: number;
  /** 출전한 spposition 코드들 (많이 선 순서) */
  positions: number[];
  /** 관측된 강화 등급 (낮은 순) */
  grades: number[];
}

interface Accumulator {
  spid: number;
  apps: number;
  goals: number;
  assists: number;
  ratings: number[];
  shots: number;
  shotsOnTarget: number;
  passTry: number;
  passSuccess: number;
  dribbleTry: number;
  dribbleSuccess: number;
  tackleTry: number;
  tackle: number;
  aerialTry: number;
  aerialSuccess: number;
  intercept: number;
  block: number;
  defending: number;
  yellowCards: number;
  redCards: number;
  positionCounts: Map<number, number>;
  grades: Set<number>;
}

function newAccumulator(spid: number): Accumulator {
  return {
    spid, apps: 0, goals: 0, assists: 0, ratings: [],
    shots: 0, shotsOnTarget: 0,
    passTry: 0, passSuccess: 0, dribbleTry: 0, dribbleSuccess: 0,
    tackleTry: 0, tackle: 0, aerialTry: 0, aerialSuccess: 0,
    intercept: 0, block: 0, defending: 0, yellowCards: 0, redCards: 0,
    positionCounts: new Map(), grades: new Set(),
  };
}

function accumulate(acc: Accumulator, player: MatchPlayer): void {
  const s = player.status;
  acc.apps += 1;
  acc.goals += s.goal;
  acc.assists += s.assist;
  // 평점 0 은 "출전했지만 기록 없음" 이 아니라 데이터 누락에 가까워 평균에서 뺀다.
  if (s.spRating > 0) acc.ratings.push(s.spRating);
  acc.shots += s.shoot;
  acc.shotsOnTarget += s.effectiveShoot;
  acc.passTry += s.passTry;
  acc.passSuccess += s.passSuccess;
  acc.dribbleTry += s.dribbleTry;
  acc.dribbleSuccess += s.dribbleSuccess;
  acc.tackleTry += s.tackleTry;
  acc.tackle += s.tackle;
  acc.aerialTry += s.aerialTry;
  acc.aerialSuccess += s.aerialSuccess;
  acc.intercept += s.intercept;
  acc.block += s.block;
  acc.defending += s.defending;
  acc.yellowCards += s.yellowCards;
  acc.redCards += s.redCards;
  acc.positionCounts.set(player.spPosition, (acc.positionCounts.get(player.spPosition) ?? 0) + 1);
  acc.grades.add(player.spGrade);
}

function finalize(acc: Accumulator): PlayerPerformance {
  return {
    spid: acc.spid,
    apps: acc.apps,
    goals: acc.goals,
    assists: acc.assists,
    contributionPerApp: acc.apps > 0 ? round1((acc.goals + acc.assists) / acc.apps) : 0,
    avgRating: round1(avg(acc.ratings)),
    bestRating: acc.ratings.length > 0 ? Math.max(...acc.ratings) : 0,
    shots: acc.shots,
    shotsOnTarget: acc.shotsOnTarget,
    passRate: ratio(acc.passSuccess, acc.passTry),
    dribbleRate: ratio(acc.dribbleSuccess, acc.dribbleTry),
    tackleRate: ratio(acc.tackle, acc.tackleTry),
    aerialRate: ratio(acc.aerialSuccess, acc.aerialTry),
    intercept: acc.intercept,
    block: acc.block,
    defending: acc.defending,
    yellowCards: acc.yellowCards,
    redCards: acc.redCards,
    positions: [...acc.positionCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .map(([position]) => position),
    grades: [...acc.grades].sort((a, b) => a - b),
  };
}

/**
 * 내 선수들만 골라 경기별 스탯을 누적한다.
 * 정렬: 출전 수 → 경기당 공격P → 평균 평점.
 */
export function buildPlayerPerformance(
  details: MatchDetail[],
  ouid: string,
): PlayerPerformance[] {
  const accumulators = new Map<number, Accumulator>();

  for (const detail of details) {
    const me = mySide(detail, ouid);
    if (!me) continue;
    for (const player of me.player) {
      let acc = accumulators.get(player.spId);
      if (!acc) {
        acc = newAccumulator(player.spId);
        accumulators.set(player.spId, acc);
      }
      accumulate(acc, player);
    }
  }

  return [...accumulators.values()]
    .map(finalize)
    .sort(
      (a, b) =>
        b.apps - a.apps ||
        b.contributionPerApp - a.contributionPerApp ||
        b.avgRating - a.avgRating,
    );
}

/* ── 경기별 추이 (차트용) ──────────────────────────────────── */

export interface FormPoint {
  matchId: string;
  matchDate: string;
  result: ResultKind;
  goalsFor: number;
  goalsAgainst: number;
  possession: number;
  rating: number;
}

/** 오래된 경기 → 최신 순으로 뒤집어 반환한다 (차트는 왼쪽이 과거). */
export function buildFormTimeline(details: MatchDetail[], ouid: string): FormPoint[] {
  const points: FormPoint[] = [];

  for (const detail of details) {
    const me = mySide(detail, ouid);
    if (!me) continue;
    const opponent = opponentSide(detail, me);
    points.push({
      matchId: detail.matchId,
      matchDate: detail.matchDate,
      result: classifyResult(me.matchDetail.matchResult),
      goalsFor: me.shoot.goalTotal,
      goalsAgainst: opponent?.shoot.goalTotal ?? 0,
      possession: me.matchDetail.possession,
      rating: me.matchDetail.averageRating,
    });
  }

  return points.sort((a, b) => a.matchDate.localeCompare(b.matchDate));
}
