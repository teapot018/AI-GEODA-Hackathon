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
    statSource: 'seed',
    ...over,
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
