'use client';

import { Crown, Fingerprint, Trophy } from 'lucide-react';

import { Badge, Card, StatTile } from '@/components/ui';
import type { ManagerOverview } from '@/lib/nexon/service';
import { formatDateTime } from '@/lib/utils/format';

/**
 * 구단주 기본 정보 카드.
 *
 * 표시 항목은 공개 API 가 실제로 주는 것만 담았다:
 *   ouid / 닉네임 / 레벨 / 역대 최고 등급.
 * (BP·캐시 보유량은 Open API 로 제공되지 않으므로 자산 패널에서
 *  거래 내역 기반 추정으로 대신 보여준다.)
 */
export function ManagerProfile({ overview }: { overview: ManagerOverview }) {
  const best = overview.divisions
    .slice()
    .sort((a, b) => a.division - b.division)[0];

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-4 border-b border-white/[0.06] bg-gradient-to-r from-neon-cyan/[0.08] to-transparent px-5 py-4">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-neon-cyan/15 text-2xl font-black text-neon-cyan">
          {overview.nickname.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-bold text-slate-50">{overview.nickname}</h1>
            <Badge tone="cyan">Lv. {overview.level}</Badge>
            {best ? <Badge tone="amber">{best.divisionName}</Badge> : null}
          </div>
          <p className="mt-1 flex items-center gap-1 font-mono text-[10px] text-slate-500">
            <Fingerprint size={11} />
            <span className="truncate">{overview.ouid}</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
        <StatTile label="최고 레벨" value={overview.level} sub="계정 레벨" />
        <StatTile
          label="역대 최고 등급"
          value={best?.divisionName ?? '기록 없음'}
          sub={best ? best.matchTypeName : undefined}
        />
        <StatTile
          label="등급 달성일"
          value={best ? formatDateTime(best.achievementDate).split(' ')[0] : '-'}
          sub={best ? '최초 달성' : undefined}
        />
        <StatTile label="기록된 매치 종류" value={overview.divisions.length} sub="등급 기록 보유" />
      </div>

      {overview.divisions.length > 0 ? (
        <div className="border-t border-white/[0.06] px-4 py-3">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
            <Trophy size={12} /> 매치 종류별 역대 최고 등급
          </p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {overview.divisions.map((division) => (
              <li
                key={`${division.matchType}-${division.division}`}
                className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2"
              >
                <span className="text-xs text-slate-400">{division.matchTypeName}</span>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-100">
                  <Crown size={12} className="text-neon-amber" />
                  {division.divisionName}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
