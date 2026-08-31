'use client';

import { useState } from 'react';
import { ChevronDown, Swords } from 'lucide-react';

import { SquadImportButton } from '@/components/manager/SquadImportButton';
import { PlayerCard } from '@/components/squad/PlayerCard';
import { Badge, Card, CardHeader, EmptyState, ErrorNote, Select, Spinner } from '@/components/ui';
import { apiGet } from '@/lib/client/api';
import type { MatchDetailView, MatchSummary } from '@/lib/nexon/service';
import { cn } from '@/lib/utils/cn';
import { formatDateTime } from '@/lib/utils/format';

const MATCH_TYPES = [
  { value: 50, label: '공식경기' },
  { value: 52, label: '감독모드' },
  { value: 40, label: '친선경기' },
  { value: 60, label: '볼타 공식경기' },
];

function resultTone(result: string): 'lime' | 'rose' | 'neutral' {
  if (result.includes('승')) return 'lime';
  if (result.includes('패')) return 'rose';
  return 'neutral';
}

/** 펼치면 그때 상세를 부른다 (매치 상세는 건당 1콜이라 미리 다 부르면 낭비) */
function MatchRow({ match, nickname }: { match: MatchSummary; nickname: string }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<MatchDetailView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next || detail || loading) return;

    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<MatchDetailView>(
        `/api/match/${encodeURIComponent(match.matchId)}?nickname=${encodeURIComponent(nickname)}`,
      );
      setDetail(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '매치 상세를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }

  const tone = resultTone(match.me.result);

  return (
    <li className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02]">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
      >
        <span
          className={cn(
            'grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-black',
            tone === 'lime' && 'bg-neon-lime/15 text-neon-lime',
            tone === 'rose' && 'bg-neon-rose/15 text-neon-rose',
            tone === 'neutral' && 'bg-white/8 text-slate-300',
          )}
        >
          {match.me.result}
        </span>

        <div className="min-w-0 flex-1">
          <p className="num text-sm font-bold text-slate-100">
            {match.me.goals}
            <span className="mx-1.5 text-slate-600">:</span>
            {match.opponent?.goals ?? '-'}
          </p>
          <p className="truncate text-[11px] text-slate-500">
            vs {match.opponent?.nickname ?? '알 수 없음'} · {formatDateTime(match.matchDate)}
          </p>
        </div>

        <div className="hidden shrink-0 gap-3 text-right text-[10px] text-slate-500 sm:flex">
          <span>
            점유 <b className="num text-slate-300">{match.me.possession}%</b>
          </span>
          <span>
            슛 <b className="num text-slate-300">{match.me.shoot}</b>
          </span>
          <span>
            패스 <b className="num text-slate-300">{match.me.passRate}%</b>
          </span>
          <span>
            평점 <b className="num text-slate-300">{match.me.rating.toFixed(1)}</b>
          </span>
        </div>

        <ChevronDown
          size={16}
          className={cn('shrink-0 text-slate-500 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open ? (
        <div className="border-t border-white/[0.06] px-3 py-3">
          {loading ? (
            <p className="flex items-center gap-2 text-xs text-slate-400">
              <Spinner /> 출전 명단 불러오는 중…
            </p>
          ) : error ? (
            <ErrorNote message={error} />
          ) : detail ? (
            <div className="space-y-4">
              {detail.sides.map((side) => (
                <div key={side.nickname}>
                  <p className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-slate-300">
                    <Swords size={11} className="text-slate-500" />
                    {side.nickname}
                    <Badge tone={resultTone(side.summary.result)}>{side.summary.result}</Badge>
                    <span className="text-slate-500">
                      평점 {side.summary.rating.toFixed(1)} · 점유 {side.summary.possession}%
                    </span>
                    <SquadImportButton
                      matchId={match.matchId}
                      ouid={side.ouid}
                      nickname={side.nickname}
                      className="ml-auto"
                    />
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {side.lineup.map((player) =>
                      player.card ? (
                        <div key={`${player.spid}-${player.position}`} className="relative">
                          <PlayerCard card={player.card} grade={player.grade} size="xs" />
                          {player.goal > 0 ? (
                            <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-neon-lime text-[9px] font-black text-pitch-950">
                              {player.goal}
                            </span>
                          ) : null}
                        </div>
                      ) : null,
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function MatchHistory({
  matches,
  nickname,
  loading,
  matchType,
  onMatchTypeChange,
}: {
  matches: MatchSummary[];
  nickname: string;
  loading: boolean;
  matchType: number;
  onMatchTypeChange: (value: number) => void;
}) {
  const wins = matches.filter((m) => m.me.result.includes('승')).length;
  const losses = matches.filter((m) => m.me.result.includes('패')).length;
  const draws = matches.length - wins - losses;

  return (
    <Card>
      <CardHeader
        title="최근 매치 기록"
        description={
          matches.length > 0
            ? `최근 ${matches.length}경기 · ${wins}승 ${draws}무 ${losses}패`
            : '매치 종류를 선택해 기록을 불러옵니다'
        }
        action={
          <Select
            className="h-8 w-32 text-xs"
            value={matchType}
            onChange={(e) => onMatchTypeChange(Number(e.target.value))}
            aria-label="매치 종류"
          >
            {MATCH_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </Select>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-xs text-slate-400">
          <Spinner /> 매치 기록 불러오는 중…
        </div>
      ) : matches.length === 0 ? (
        <EmptyState
          title="표시할 매치 기록이 없습니다"
          description="해당 매치 종류의 최근 기록이 없거나, 아직 경기를 치르지 않았습니다."
        />
      ) : (
        <ul className="space-y-1.5 p-3">
          {matches.map((match) => (
            <MatchRow key={match.matchId} match={match} nickname={nickname} />
          ))}
        </ul>
      )}
    </Card>
  );
}
