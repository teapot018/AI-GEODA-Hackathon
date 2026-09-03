'use client';

import { useEffect, useState } from 'react';
import { Info, RotateCcw } from 'lucide-react';

import { Pitch } from '@/components/squad/Pitch';
import { PlayerSearchPanel } from '@/components/squad/PlayerSearchPanel';
import { SquadOptimizerPanel } from '@/components/SquadOptimizerPanel';
import { SquadSummary } from '@/components/squad/SquadSummary';
import { Button, Card, Skeleton } from '@/components/ui';
import { FORMATIONS, findFormation } from '@/lib/squad/formations';
import { useSquadStore, type ImportProvenance } from '@/lib/squad/store';
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
  const imported = useSquadStore((state) => state.imported);

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

      {imported ? <ImportedNote imported={imported} /> : null}

      <p className="text-xs text-slate-500">{formation.description}</p>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <Pitch formation={formation} />
          <SquadOptimizerPanel formation={formation} />
          <SquadSummary formation={formation} />
        </div>
        <div className="h-[min(60dvh,600px)] lg:sticky lg:top-20 lg:h-[calc(100dvh-6rem)]">
          <PlayerSearchPanel />
        </div>
      </div>
    </div>
  );
}

/**
 * 가져온 스쿼드가 **어디까지 사실인지** 적는다.
 *
 * 넥슨 `/match-detail` 이 준 것은 선발 선수와 각자의 포지션 코드다.
 * 포메이션 이름은 주지 않는다 — 위에 뜬 포메이션은 그 포지션 구성으로
 * 우리가 **골라 낸** 것이고, 4-2-3-1 로 세운 스쿼드가 4-2-1-3 으로 읽히는
 * 일이 얼마든지 있다. 그래서 "복원했습니다" 가 아니라 "추정했습니다" 라고
 * 쓰고 일치도를 같이 적는다.
 *
 * 인원도 11명이라고 가정하지 않는다. 응답이 잘리거나 포지션 코드가 우리
 * 표에 없으면 그보다 적게 오고, 그때 빈 자리를 아무 카드로 메우면 그
 * 스쿼드는 그 경기의 스쿼드가 아니다.
 */
function ImportedNote({ imported }: { imported: ImportProvenance }) {
  const percent = Math.round(imported.formationConfidence * 100);
  const placed = imported.starters - imported.missing;

  return (
    <p className="flex gap-1.5 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-[10px] leading-relaxed text-slate-400">
      <Info size={12} className="mt-px shrink-0" />
      <span>
        <b className="text-slate-300">{imported.nickname}</b> 의 경기에서 가져온 스쿼드입니다. 선수와
        포지션은 넥슨이 준 값이지만, <b className="text-slate-300">포메이션은 추정</b>입니다 — 넥슨은
        포메이션 이름을 주지 않으므로 포지션 구성으로 가장 잘 맞는 것을 골랐습니다 (일치도{' '}
        <b className="text-slate-300">{percent}%</b>).
        <br />
        넥슨이 준 선발 {imported.starters}명 중 {placed}명을 배치했습니다
        {imported.missing > 0 ? (
          <>
            {' '}— 나머지 {imported.missing}명은 카탈로그에서 카드를 찾지 못해 빈 자리로 두었습니다.
            빈 자리를 다른 카드로 메우면 그 경기의 스쿼드가 아니게 됩니다.
          </>
        ) : (
          '.'
        )}
      </span>
    </p>
  );
}
