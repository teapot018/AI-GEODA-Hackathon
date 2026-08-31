'use client';

import { Activity, TrendingUp } from 'lucide-react';

import { Badge, Card, CardHeader, EmptyState, Skeleton, StatTile } from '@/components/ui';
import { FreshnessNote } from '@/components/ui/FreshnessNote';
import { Sparkline } from '@/components/ui/Sparkline';
import type { ResultKind } from '@/lib/analytics/form';
import type { ManagerAnalytics, PlayerPerformanceRow } from '@/lib/nexon/insights';
import { cn } from '@/lib/utils/cn';
import { formatPercent } from '@/lib/utils/format';

/**
 * 매치 상세 N건을 겹쳐 만든 전적 분석.
 * 승률·득실 같은 팀 지표와 선수별 실전 성능을 한 카드에 담는다.
 */
export function AnalyticsPanel({
  analytics,
  loading,
}: {
  analytics: ManagerAnalytics | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <Card>
        <CardHeader title="전적 분석" description="매치 상세를 겹쳐 계산하는 중…" />
        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      </Card>
    );
  }

  if (!analytics || analytics.form.played === 0) {
    return (
      <Card>
        <CardHeader title="전적 분석" />
        <EmptyState
          icon={<Activity size={32} />}
          title="분석할 경기가 없습니다"
          description="해당 매치 종류의 최근 기록이 없어 승률·선수 성능을 계산할 수 없습니다."
        />
      </Card>
    );
  }

  const { form, timeline, players, matchTypeName, analyzed } = analytics;

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-1.5">
            <TrendingUp size={14} className="text-neon-cyan" /> 전적 분석
          </span>
        }
        description={`${matchTypeName} 최근 ${analyzed}경기를 겹쳐 계산했습니다`}
        action={
          form.streak ? (
            <Badge tone={form.streak.kind === '승' ? 'lime' : form.streak.kind === '패' ? 'rose' : 'neutral'}>
              {form.streak.length}연{form.streak.kind}
            </Badge>
          ) : null
        }
      />

      {/*
        경기 데이터에는 2시간 집계 주기가 없다 (그건 기준가 쪽 이야기다).
        여기서는 "언제까지의 경기를 본 분석인가"만 밝힌다.
      */}
      <FreshnessNote
        dates={timeline.map((point) => point.matchDate)}
        noun="경기"
        showNextRefresh={false}
        className="mb-3"
      />

      <div className="space-y-3 p-3">
        <ResultStrip results={form.results} />

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile
            label="승률"
            value={formatPercent(form.winRate, 0)}
            sub={`${form.wins}승 ${form.draws}무 ${form.losses}패`}
            tone={form.winRate >= 0.5 ? 'good' : 'bad'}
          />
          <StatTile
            label="득실"
            value={`${form.goalDiff >= 0 ? '+' : ''}${form.goalDiff}`}
            sub={`${form.goalsFor}득 ${form.goalsAgainst}실`}
            tone={form.goalDiff >= 0 ? 'good' : 'bad'}
          />
          <StatTile
            label="경기당 득점"
            value={form.avgGoalsFor.toFixed(1)}
            sub={`실점 ${form.avgGoalsAgainst.toFixed(1)}`}
          />
          <StatTile label="평균 점유율" value={`${form.avgPossession}%`} sub={`평점 ${form.avgRating.toFixed(1)}`} />
          <StatTile label="패스 성공률" value={formatPercent(form.avgPassRate, 1)} sub={`${form.played}경기 누적`} />
          <StatTile
            label="슛 정확도"
            value={formatPercent(form.shotAccuracy, 1)}
            sub={`유효 ${form.totalShotsOnTarget}/${form.totalShots}`}
          />
          <StatTile
            label="결정력"
            value={formatPercent(form.conversionRate, 1)}
            sub="유효슛 대비 득점"
          />
          <StatTile
            label="무실점 / 무득점"
            value={`${form.cleanSheets} / ${form.blanks}`}
            sub={`경고 ${form.yellowCards} · 퇴장 ${form.redCards}`}
          />
        </div>

        {timeline.length > 1 ? (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <p className="mb-1.5 text-[10px] uppercase tracking-wider text-slate-500">
              경기별 득점 추이 (왼쪽이 과거)
            </p>
            <Sparkline
              values={timeline.map((point) => point.goalsFor)}
              className="h-8 w-full"
              stroke="#c6ff3d"
            />
          </div>
        ) : null}

        <PlayerPerformanceTable players={players} />
      </div>
    </Card>
  );
}

/** 최근 경기가 오른쪽에 오도록 뒤집어 보여준다 (읽는 방향과 시간 흐름을 맞춤). */
function ResultStrip({ results }: { results: ResultKind[] }) {
  const tone: Record<ResultKind, string> = {
    승: 'bg-neon-lime/20 text-neon-lime',
    무: 'bg-white/10 text-slate-400',
    패: 'bg-neon-rose/20 text-neon-rose',
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-1 text-[10px] text-slate-500">과거</span>
      {[...results].reverse().map((result, index) => (
        <span
          key={index}
          className={cn(
            'grid h-5 w-5 place-items-center rounded text-[10px] font-bold',
            tone[result],
          )}
        >
          {result}
        </span>
      ))}
      <span className="ml-1 text-[10px] text-slate-500">최근</span>
    </div>
  );
}

/** 출전 수 상위 선수의 실전 성능. 넓은 화면에서만 세부 성공률까지 보여준다. */
function PlayerPerformanceTable({ players }: { players: PlayerPerformanceRow[] }) {
  if (players.length === 0) return null;
  const rows = players.slice(0, 15);

  return (
    <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
      <table className="w-full min-w-[520px] text-left text-[11px]">
        <thead className="bg-white/[0.03] text-[10px] uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-2.5 py-2 font-medium">선수</th>
            <th className="px-2 py-2 text-right font-medium">출전</th>
            <th className="px-2 py-2 text-right font-medium">골</th>
            <th className="px-2 py-2 text-right font-medium">도움</th>
            <th className="px-2 py-2 text-right font-medium">경기당 P</th>
            <th className="px-2 py-2 text-right font-medium">평점</th>
            <th className="hidden px-2 py-2 text-right font-medium sm:table-cell">패스</th>
            <th className="hidden px-2 py-2 text-right font-medium sm:table-cell">태클</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {rows.map((player) => (
            <tr key={player.spid} className="transition-colors hover:bg-white/[0.02]">
              <td className="px-2.5 py-1.5">
                <p className="truncate font-medium text-slate-200">{player.name}</p>
                <p className="truncate text-[10px] text-slate-500">
                  {player.topPositionName} · {player.seasonName}
                </p>
              </td>
              <td className="num px-2 py-1.5 text-right text-slate-300">{player.apps}</td>
              <td className="num px-2 py-1.5 text-right text-slate-300">{player.goals}</td>
              <td className="num px-2 py-1.5 text-right text-slate-300">{player.assists}</td>
              <td
                className={cn(
                  'num px-2 py-1.5 text-right font-semibold',
                  player.contributionPerApp >= 1 ? 'text-neon-lime' : 'text-slate-400',
                )}
              >
                {player.contributionPerApp.toFixed(1)}
              </td>
              <td
                className={cn(
                  'num px-2 py-1.5 text-right font-semibold',
                  player.avgRating >= 7.5 ? 'text-neon-cyan' : 'text-slate-300',
                )}
              >
                {player.avgRating.toFixed(1)}
              </td>
              <td className="num hidden px-2 py-1.5 text-right text-slate-400 sm:table-cell">
                {formatPercent(player.passRate, 0)}
              </td>
              <td className="num hidden px-2 py-1.5 text-right text-slate-400 sm:table-cell">
                {player.tackleRate > 0 ? formatPercent(player.tackleRate, 0) : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
