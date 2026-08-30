'use client';

import { useState } from 'react';
import { AlertTriangle, Gauge } from 'lucide-react';

import { Badge, Button, Card, CardHeader, Input } from '@/components/ui';
import { UpgradeModal } from '@/components/UpgradeModal';
import type { Formation } from '@/lib/squad/formations';
import { useSquadStore } from '@/lib/squad/store';
import { optimizeSquad } from '@/utils/squadOptimizer';
import { formatBP } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

const DEFAULT_BUDGET = 1_000_000_000; // 10억 BP

export function SquadOptimizerPanel({ formation }: { formation: Formation }) {
  const assignments = useSquadStore((state) => state.assignments);
  const [budget, setBudget] = useState(DEFAULT_BUDGET);
  const [upgradeSlot, setUpgradeSlot] = useState<string | null>(null);

  const report = optimizeSquad(formation, assignments, budget);
  const remainingBudget = Math.max(0, budget - report.budget.totalCost);

  return (
    <Card className="space-y-3 p-3">
      <CardHeader
        title="스쿼드 최적화"
        description="예산·케미스트리·포지션 적합도를 종합 평가합니다"
        action={
          <div className="flex items-center gap-1.5">
            <Gauge size={13} className="text-slate-500" />
            <span
              className={cn(
                'text-lg font-black',
                report.score >= 70 ? 'text-neon-cyan' : report.score >= 40 ? 'text-neon-amber' : 'text-neon-rose',
              )}
            >
              {report.score}
            </span>
            <span className="text-[10px] text-slate-500">/100</span>
          </div>
        }
      />

      <div className="flex items-center gap-2">
        <label className="text-[10px] text-slate-500" htmlFor="budget-input">
          BP 예산
        </label>
        <Input
          id="budget-input"
          type="number"
          value={budget}
          onChange={(e) => setBudget(Math.max(0, Number(e.target.value) || 0))}
          className="h-8 flex-1 text-xs"
        />
      </div>

      <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] p-2 text-xs">
        <span className="text-slate-400">추정 총 가치</span>
        <span className={report.budget.overBudget ? 'font-bold text-neon-rose' : 'font-bold text-slate-200'}>
          {formatBP(report.budget.totalCost)}
        </span>
      </div>

      {report.budget.overBudget ? (
        <div className="flex items-center gap-1.5 rounded-lg bg-neon-rose/10 p-2 text-[11px] text-neon-rose">
          <AlertTriangle size={13} />
          예산 초과 {formatBP(report.budget.overBy)}
        </div>
      ) : null}

      {report.positionIssues.length > 0 ? (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">포지션 부적합</p>
          {report.positionIssues.map((issue) => (
            <div key={issue.slotId} className="flex items-center justify-between text-[11px]">
              <span className="text-slate-300">{issue.playerName}</span>
              <div className="flex items-center gap-1.5">
                <Badge tone={issue.severity === 'bad' ? 'rose' : 'amber'}>
                  적합도 {Math.round(issue.fit * 100)}%
                </Badge>
                <Button size="sm" variant="outline" onClick={() => setUpgradeSlot(issue.slotId)}>
                  후보 보기
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {report.chemistry.colors.length > 0 ? (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">팀 컬러</p>
          <div className="flex flex-wrap gap-1">
            {report.chemistry.colors.map((c) => (
              <Badge key={c.label} tone="cyan">
                {c.label} Lv.{c.level}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      {report.chemistry.emptySlots > 0 ? (
        <p className="text-[10px] text-slate-500">빈 자리 {report.chemistry.emptySlots}개</p>
      ) : null}

      {upgradeSlot ? (
        <UpgradeModal
          formation={formation}
          slotId={upgradeSlot}
          remainingBudget={remainingBudget}
          onClose={() => setUpgradeSlot(null)}
        />
      ) : null}
    </Card>
  );
}
