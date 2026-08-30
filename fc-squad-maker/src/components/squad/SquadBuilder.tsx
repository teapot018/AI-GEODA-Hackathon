'use client';

import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';

import { Pitch } from '@/components/squad/Pitch';
import { PlayerSearchPanel } from '@/components/squad/PlayerSearchPanel';
import { SquadSummary } from '@/components/squad/SquadSummary';
import { Button, Card, Skeleton } from '@/components/ui';
import { FORMATIONS, findFormation } from '@/lib/squad/formations';
import { useSquadStore } from '@/lib/squad/store';
import { cn } from '@/lib/utils/cn';

/**
 * 스쿼드 메이커 화면.
 *
 * 스토어가 localStorage 에서 복원되기 전에 그리면 서버 HTML 과 달라져
 * hydration 경고가 나므로, mounted 이후에만 실제 내용을 렌더한다.
 */
export function SquadBuilder() {
  const [mounted, setMounted] = useState(false);
  const formationId = useSquadStore((state) => state.formationId);
  const setFormation = useSquadStore((state) => state.setFormation);
  const clear = useSquadStore((state) => state.clear);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Skeleton className="aspect-[4/5] w-full" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  const formation = findFormation(formationId);

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <span className="mr-1 text-[10px] uppercase tracking-wider text-slate-500">포메이션</span>
        <div className="flex flex-wrap gap-1.5">
          {FORMATIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFormation(item.id)}
              title={item.description}
              className={cn(
                'rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors',
                item.id === formationId
                  ? 'bg-neon-cyan text-pitch-950'
                  : 'bg-white/5 text-slate-300 hover:bg-white/10',
              )}
            >
              {item.name}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={clear} className="ml-auto">
          <RotateCcw size={13} /> 초기화
        </Button>
      </Card>

      <p className="text-xs text-slate-500">{formation.description}</p>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <Pitch formation={formation} />
          <SquadSummary formation={formation} />
        </div>
        <div className="h-[min(60dvh,600px)] lg:sticky lg:top-20 lg:h-[calc(100dvh-6rem)]">
          <PlayerSearchPanel />
        </div>
      </div>
    </div>
  );
}
