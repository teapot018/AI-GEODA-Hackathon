import { describe, expect, it } from 'vitest';

import {
  buildFormTimeline,
  buildManagerForm,
  buildPlayerPerformance,
  classifyResult,
  currentStreak,
  mySide,
} from '@/lib/analytics/form';
import { makeMatch, makeMatchPlayer } from './helpers';

describe('classifyResult', () => {
  it('승/무/패를 그대로 읽는다', () => {
    expect(classifyResult('승')).toBe('승');
    expect(classifyResult('무')).toBe('무');
    expect(classifyResult('패')).toBe('패');
  });

  it('몰수승/몰수패 같은 변형도 분류한다', () => {
    expect(classifyResult('몰수승')).toBe('승');
    expect(classifyResult('몰수패')).toBe('패');
  });

  it('모르는 문자열은 무승부로 본다', () => {
    expect(classifyResult('기권')).toBe('무');
  });
});

describe('mySide', () => {
  it('ouid 가 일치하는 쪽을 고른다', () => {
    const side = mySide(makeMatch(), 'foe');
    expect(side?.nickname).toBe('상대');
  });

  it('ouid 가 없으면 첫 번째를 나로 본다', () => {
    const side = mySide(makeMatch(), '없는-ouid');
    expect(side?.nickname).toBe('나');
  });

  it('매치 정보가 비면 null', () => {
    expect(mySide(makeMatch({ matchInfo: [] }), 'me')).toBeNull();
  });
});

describe('currentStreak', () => {
  it('최신부터 같은 결과가 이어진 만큼 센다', () => {
    expect(currentStreak(['승', '승', '패', '승'])).toEqual({ kind: '승', length: 2 });
  });

  it('첫 경기에서 끊기면 1연속', () => {
    expect(currentStreak(['패', '승', '승'])).toEqual({ kind: '패', length: 1 });
  });

  it('기록이 없으면 null', () => {
    expect(currentStreak([])).toBeNull();
  });
});

describe('buildManagerForm', () => {
  const matches = [
    makeMatch({
      matchId: 'm1',
      me: { matchDetail: { matchResult: '승' }, shoot: { goalTotal: 3 } },
      opponent: { matchDetail: { matchResult: '패' }, shoot: { goalTotal: 1 } },
    }),
    makeMatch({
      matchId: 'm2',
      me: { matchDetail: { matchResult: '패' }, shoot: { goalTotal: 0 } },
      opponent: { matchDetail: { matchResult: '승' }, shoot: { goalTotal: 2 } },
    }),
    makeMatch({
      matchId: 'm3',
      me: { matchDetail: { matchResult: '무' }, shoot: { goalTotal: 1 } },
      opponent: { matchDetail: { matchResult: '무' }, shoot: { goalTotal: 1 } },
    }),
  ];

  it('승/무/패와 승률을 센다', () => {
    const form = buildManagerForm(matches, 'me');
    expect(form.played).toBe(3);
    expect(form.wins).toBe(1);
    expect(form.draws).toBe(1);
    expect(form.losses).toBe(1);
    expect(form.winRate).toBeCloseTo(1 / 3);
  });

  it('득실을 합산한다', () => {
    const form = buildManagerForm(matches, 'me');
    expect(form.goalsFor).toBe(4);
    expect(form.goalsAgainst).toBe(4);
    expect(form.goalDiff).toBe(0);
  });

  it('무실점 경기와 무득점 경기를 따로 센다', () => {
    const form = buildManagerForm(matches, 'me');
    expect(form.blanks).toBe(1); // m2 에서 0골
    expect(form.cleanSheets).toBe(0);
  });

  it('패스 성공률은 전체 시도 대비 전체 성공이다 (경기별 평균이 아니라)', () => {
    const form = buildManagerForm(
      [
        makeMatch({ me: { pass: { passTry: 100, passSuccess: 90 } } }),
        makeMatch({ me: { pass: { passTry: 900, passSuccess: 450 } } }),
      ],
      'me',
    );
    // 경기별 평균이면 0.70, 누적이면 540/1000 = 0.54
    expect(form.avgPassRate).toBeCloseTo(0.54);
  });

  it('슛 정확도와 결정력을 낸다', () => {
    const form = buildManagerForm(
      [
        makeMatch({
          me: {
            shoot: { shootTotal: 10, effectiveShootTotal: 4, goalTotal: 2 },
          },
        }),
      ],
      'me',
    );
    expect(form.shotAccuracy).toBeCloseTo(0.4);
    expect(form.conversionRate).toBeCloseTo(0.5);
  });

  it('최신 경기 기준 연속 기록을 붙인다', () => {
    const form = buildManagerForm(matches, 'me');
    expect(form.results[0]).toBe('승');
    expect(form.streak).toEqual({ kind: '승', length: 1 });
  });

  it('경기가 없으면 0으로 채운 폼을 준다 (0으로 나누기 없음)', () => {
    const form = buildManagerForm([], 'me');
    expect(form.played).toBe(0);
    expect(form.winRate).toBe(0);
    expect(form.avgPassRate).toBe(0);
    expect(Number.isFinite(form.avgGoalsFor)).toBe(true);
    expect(form.streak).toBeNull();
  });

  it('상대 시점으로도 집계된다', () => {
    const form = buildManagerForm(matches, 'foe');
    expect(form.wins).toBe(1);
    expect(form.losses).toBe(1);
    expect(form.goalsFor).toBe(4);
  });
});

describe('buildPlayerPerformance', () => {
  const spid = 300_000_007;

  const twoMatches = [
    makeMatch({
      matchId: 'm1',
      me: {
        player: [
          makeMatchPlayer({
            spId: spid,
            spPosition: 25,
            spGrade: 1,
            status: { goal: 2, assist: 1, spRating: 9, passTry: 10, passSuccess: 8 },
          }),
        ],
      },
    }),
    makeMatch({
      matchId: 'm2',
      me: {
        player: [
          makeMatchPlayer({
            spId: spid,
            spPosition: 27,
            spGrade: 5,
            status: { goal: 0, assist: 1, spRating: 7, passTry: 10, passSuccess: 2 },
          }),
        ],
      },
    }),
  ];

  it('여러 경기의 같은 선수를 하나로 합친다', () => {
    const [player] = buildPlayerPerformance(twoMatches, 'me');
    expect(player.spid).toBe(spid);
    expect(player.apps).toBe(2);
    expect(player.goals).toBe(2);
    expect(player.assists).toBe(2);
  });

  it('경기당 공격 포인트를 낸다', () => {
    const [player] = buildPlayerPerformance(twoMatches, 'me');
    expect(player.contributionPerApp).toBe(2); // (2골+2도움)/2경기
  });

  it('평균/최고 평점을 낸다', () => {
    const [player] = buildPlayerPerformance(twoMatches, 'me');
    expect(player.avgRating).toBe(8);
    expect(player.bestRating).toBe(9);
  });

  it('평점 0 은 데이터 누락으로 보고 평균에서 뺀다', () => {
    const [player] = buildPlayerPerformance(
      [
        makeMatch({
          me: { player: [makeMatchPlayer({ spId: spid, status: { spRating: 8 } })] },
        }),
        makeMatch({
          me: { player: [makeMatchPlayer({ spId: spid, status: { spRating: 0 } })] },
        }),
      ],
      'me',
    );
    expect(player.apps).toBe(2);
    expect(player.avgRating).toBe(8);
  });

  it('성공률은 누적 시도 대비 누적 성공이다', () => {
    const [player] = buildPlayerPerformance(twoMatches, 'me');
    expect(player.passRate).toBeCloseTo(0.5); // (8+2)/(10+10)
  });

  it('시도가 0이면 성공률도 0 (NaN 아님)', () => {
    const [player] = buildPlayerPerformance(
      [makeMatch({ me: { player: [makeMatchPlayer({ spId: spid })] } })],
      'me',
    );
    expect(player.tackleRate).toBe(0);
    expect(Number.isFinite(player.aerialRate)).toBe(true);
  });

  it('선 자리는 많이 선 순으로, 등급은 낮은 순으로 모은다', () => {
    const [player] = buildPlayerPerformance(
      [
        ...twoMatches,
        makeMatch({
          matchId: 'm3',
          me: { player: [makeMatchPlayer({ spId: spid, spPosition: 25, spGrade: 1 })] },
        }),
      ],
      'me',
    );
    expect(player.positions[0]).toBe(25); // ST 두 번, LW 한 번
    expect(player.grades).toEqual([1, 5]);
  });

  it('출전 수가 많은 선수가 앞에 온다', () => {
    const rows = buildPlayerPerformance(
      [
        makeMatch({
          me: {
            player: [makeMatchPlayer({ spId: 1 }), makeMatchPlayer({ spId: 2 })],
          },
        }),
        makeMatch({ matchId: 'm2', me: { player: [makeMatchPlayer({ spId: 2 })] } }),
      ],
      'me',
    );
    expect(rows[0].spid).toBe(2);
  });

  it('상대 선수는 섞이지 않는다', () => {
    const rows = buildPlayerPerformance(
      [
        makeMatch({
          me: { player: [makeMatchPlayer({ spId: 1 })] },
          opponent: { player: [makeMatchPlayer({ spId: 99 })] },
        }),
      ],
      'me',
    );
    expect(rows.map((r) => r.spid)).toEqual([1]);
  });

  it('경기가 없으면 빈 배열', () => {
    expect(buildPlayerPerformance([], 'me')).toEqual([]);
  });
});

describe('buildFormTimeline', () => {
  it('오래된 경기부터 정렬해 준다 (차트는 왼쪽이 과거)', () => {
    const timeline = buildFormTimeline(
      [
        makeMatch({ matchId: 'new', matchDate: '2024-06-03T00:00:00' }),
        makeMatch({ matchId: 'old', matchDate: '2024-06-01T00:00:00' }),
      ],
      'me',
    );
    expect(timeline.map((p) => p.matchId)).toEqual(['old', 'new']);
  });

  it('상대 득점을 실점으로 담는다', () => {
    const [point] = buildFormTimeline(
      [
        makeMatch({
          me: { shoot: { goalTotal: 3 } },
          opponent: { shoot: { goalTotal: 1 } },
        }),
      ],
      'me',
    );
    expect(point.goalsFor).toBe(3);
    expect(point.goalsAgainst).toBe(1);
  });

  it('상대가 없는 경기는 실점 0 으로 둔다', () => {
    const [point] = buildFormTimeline(
      [makeMatch({ matchInfo: [makeMatch().matchInfo[0]] })],
      'me',
    );
    expect(point.goalsAgainst).toBe(0);
  });
});
