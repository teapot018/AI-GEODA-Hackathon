'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Dices, PackageOpen, RotateCcw, Sparkles } from 'lucide-react';

import { OddsTable } from '@/components/pack/OddsTable';
import { PackResultGrid } from '@/components/pack/PackResultGrid';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorNote, Spinner, StatTile } from '@/components/ui';
import { apiGet, apiPost } from '@/lib/client/api';
import type { PackBox } from '@/lib/pack/boxes';
import type { BoxExpectation, OpenResult, PulledCard } from '@/lib/pack/simulator';
import { formatBP, formatNumber, formatPercent } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

type Phase = 'idle' | 'opening' | 'revealed';

interface SessionStats {
  opens: number;
  cards: number;
  spentBP: number;
  spentCash: number;
  gainedValue: number;
  byTier: Record<string, number>;
  best: PulledCard | null;
}

const EMPTY_STATS: SessionStats = {
  opens: 0,
  cards: 0,
  spentBP: 0,
  spentCash: 0,
  gainedValue: 0,
  byTier: {},
  best: null,
};

/**
 * 모의 상자 개봉 시뮬레이터.
 *
 * 추첨은 전부 서버(/api/pack/open)에서 한다. 클라이언트는 결과를 받아
 * 연출만 담당한다. 시드를 함께 돌려받으므로 같은 결과를 재현할 수 있다.
 */
export function BoxSimulator() {
  const [boxes, setBoxes] = useState<PackBox[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [expectation, setExpectation] = useState<BoxExpectation | null>(null);

  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<OpenResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [stats, setStats] = useState<SessionStats>(EMPTY_STATS);
  const pityRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const selected = useMemo(
    () => boxes.find((box) => box.id === selectedId) ?? null,
    [boxes, selectedId],
  );

  // 상자 목록
  useEffect(() => {
    const controller = new AbortController();
    apiGet<{ boxes: PackBox[] }>('/api/pack', controller.signal)
      .then((res) => {
        setBoxes(res.data.boxes);
        setSelectedId((current) => current || res.data.boxes[0]?.id || '');
      })
      .catch((err) => setError(err instanceof Error ? err.message : '상자 목록을 불러오지 못했습니다.'));
    return () => controller.abort();
  }, []);

  // 선택한 상자의 확률/기대값
  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    setExpectation(null);
    apiGet<BoxExpectation>(`/api/pack?box=${encodeURIComponent(selectedId)}`, controller.signal)
      .then((res) => setExpectation(res.data))
      .catch(() => setExpectation(null));
    return () => controller.abort();
  }, [selectedId]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const open = useCallback(
    async (times: number) => {
      if (!selected || phase === 'opening') return;

      setPhase('opening');
      setError(null);
      setResult(null);

      // 연출용 최소 대기와 실제 요청을 함께 기다린다 (둘 중 늦은 쪽 기준).
      const minDelay = new Promise((resolve) => {
        timerRef.current = setTimeout(resolve, times === 1 ? 900 : 500);
      });

      try {
        const [res] = await Promise.all([
          apiPost<OpenResult>('/api/pack/open', {
            boxId: selected.id,
            times,
            pityCounter: pityRef.current,
          }),
          minDelay,
        ]);

        const opened = res.data;
        setResult(opened);
        setPhase('revealed');

        // 천장 카운터 갱신
        if (selected.pity) {
          const target = selected.tiers.find((tier) => tier.id === selected.pity!.tierId);
          for (const pulled of opened.cards) {
            if (target && pulled.rarity >= target.rarity) pityRef.current = 0;
            else pityRef.current += 1;
          }
        }

        setStats((prev) => {
          const byTier = { ...prev.byTier };
          let best = prev.best;
          for (const pulled of opened.cards) {
            byTier[pulled.tierLabel] = (byTier[pulled.tierLabel] ?? 0) + 1;
            if (!best || pulled.value > best.value) best = pulled;
          }
          return {
            opens: prev.opens + times,
            cards: prev.cards + opened.cards.length,
            spentBP: prev.spentBP + (opened.cost.currency === 'BP' ? opened.cost.amount : 0),
            spentCash: prev.spentCash + (opened.cost.currency === '캐시' ? opened.cost.amount : 0),
            gainedValue: prev.gainedValue + opened.totalValue,
            byTier,
            best,
          };
        });
      } catch (err) {
        setPhase('idle');
        setError(err instanceof Error ? err.message : '상자를 여는 중 오류가 발생했습니다.');
      }
    },
    [selected, phase],
  );

  const resetSession = () => {
    setStats(EMPTY_STATS);
    setResult(null);
    setPhase('idle');
    pityRef.current = 0;
  };

  const roi = stats.spentBP > 0 ? stats.gainedValue / stats.spentBP : null;

  return (
    <div className="space-y-5">
      {/* 상자 선택 */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {boxes.map((box) => (
          <button
            key={box.id}
            type="button"
            onClick={() => setSelectedId(box.id)}
            className={cn(
              'card-surface group relative overflow-hidden p-4 text-left transition-all',
              box.id === selectedId
                ? 'border-neon-cyan/60 shadow-glow'
                : 'hover:border-white/20 hover:bg-pitch-800/60',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <Box
                size={20}
                className={cn(
                  'shrink-0',
                  box.id === selectedId ? 'text-neon-cyan' : 'text-slate-500',
                )}
              />
              <Badge tone={box.currency === '캐시' ? 'violet' : 'lime'}>{box.currency}</Badge>
            </div>
            <p className="mt-2 text-sm font-bold text-slate-100">{box.name}</p>
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-slate-500">
              {box.subtitle}
            </p>
            <p className="num mt-2 text-xs font-semibold text-slate-300">
              {formatNumber(box.price)} {box.currency} · {box.drawCount}장
            </p>
            {box.pity ? (
              <p className="mt-1 text-[10px] text-neon-violet">천장 {box.pity.after}회</p>
            ) : null}
          </button>
        ))}
      </div>

      {error ? <ErrorNote message={error} /> : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* 개봉 무대 */}
        <Card className="min-h-[420px]">
          <CardHeader
            title={selected ? selected.name : '상자를 선택하세요'}
            description={
              selected
                ? `1회 개봉 시 ${selected.drawCount}장 · ${formatNumber(selected.price)} ${selected.currency}`
                : undefined
            }
            action={
              selected?.pity ? (
                <Badge tone="violet">
                  천장까지 {Math.max(0, selected.pity.after - pityRef.current)}회
                </Badge>
              ) : null
            }
          />

          <div className="flex min-h-[280px] flex-col items-center justify-center p-6">
            {phase === 'opening' ? (
              <div className="relative flex flex-col items-center gap-4">
                <span className="absolute inset-0 -z-10 animate-pulse-ring rounded-full bg-neon-cyan/25" />
                <div className="animate-pack-shake">
                  <PackageOpen size={72} className="text-neon-cyan drop-shadow-[0_0_18px_rgba(34,225,255,0.6)]" />
                </div>
                <p className="flex items-center gap-2 text-xs text-slate-400">
                  <Spinner /> 상자를 여는 중…
                </p>
              </div>
            ) : phase === 'revealed' && result ? (
              <div className="w-full animate-pack-burst space-y-4">
                <PackResultGrid cards={result.cards} />
                <div className="flex flex-wrap items-center justify-center gap-3 border-t border-white/[0.06] pt-3 text-xs">
                  <span className="text-slate-400">
                    이번 개봉 총 가치{' '}
                    <b className="num text-neon-lime">{formatBP(result.totalValue)} BP</b>
                  </span>
                  <span className="num text-[10px] text-slate-600" title="같은 시드로 같은 결과를 재현할 수 있습니다.">
                    seed: {result.seed.slice(0, 12)}
                  </span>
                </div>
              </div>
            ) : (
              <EmptyState
                icon={<Box size={40} />}
                title="아직 연 상자가 없습니다"
                description="아래 버튼으로 개봉을 시작하세요. 추첨은 서버에서 처리되며 결과는 시드로 재현할 수 있습니다."
              />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] p-4">
            <Button
              size="lg"
              onClick={() => void open(1)}
              disabled={!selected || phase === 'opening'}
              className="flex-1"
            >
              <Dices size={16} /> 1회 개봉
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => void open(10)}
              disabled={!selected || phase === 'opening'}
              className="flex-1"
            >
              <Sparkles size={16} /> 10회 연속
            </Button>
          </div>
        </Card>

        {/* 우측: 확률표 + 세션 통계 */}
        <div className="space-y-4">
          <OddsTable
            expectation={expectation}
            price={selected?.price ?? 0}
            currency={selected?.currency ?? 'BP'}
          />

          <Card>
            <CardHeader
              title="이번 세션 누적"
              description="새로고침하면 초기화됩니다"
              action={
                <Button size="sm" variant="ghost" onClick={resetSession} disabled={stats.opens === 0}>
                  <RotateCcw size={12} /> 리셋
                </Button>
              }
            />

            <div className="grid grid-cols-2 gap-2 p-4">
              <StatTile label="개봉 횟수" value={formatNumber(stats.opens)} sub={`${stats.cards}장`} />
              <StatTile
                label="획득 가치"
                value={formatBP(stats.gainedValue)}
                sub="BP (추정)"
                tone="good"
              />
              <StatTile label="BP 지출" value={formatBP(stats.spentBP)} tone="bad" />
              <StatTile
                label="회수율"
                value={roi === null ? '—' : formatPercent(roi, 1)}
                sub={roi === null ? '캐시 상자만 개봉' : roi >= 1 ? '본전 이상' : '본전 미만'}
                tone={roi === null ? 'neutral' : roi >= 1 ? 'good' : 'bad'}
              />
            </div>

            {stats.spentCash > 0 ? (
              <p className="px-4 pb-2 text-[10px] text-slate-500">
                캐시 지출 {formatNumber(stats.spentCash)}원 (시뮬레이션 · 실제 결제 아님)
              </p>
            ) : null}

            {Object.keys(stats.byTier).length > 0 ? (
              <div className="border-t border-white/[0.06] p-4">
                <p className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">등급별 획득</p>
                <ul className="space-y-1">
                  {Object.entries(stats.byTier)
                    .sort((a, b) => b[1] - a[1])
                    .map(([label, count]) => (
                      <li key={label} className="flex items-center justify-between text-xs">
                        <span className="truncate text-slate-400">{label}</span>
                        <span className="num shrink-0 font-semibold text-slate-200">
                          {count}장{' '}
                          <span className="text-[10px] font-normal text-slate-500">
                            ({formatPercent(count / Math.max(1, stats.cards), 1)})
                          </span>
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}

            {stats.best ? (
              <div className="border-t border-white/[0.06] p-4">
                <p className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">최고 획득</p>
                <p className="text-sm font-bold text-slate-100">
                  {stats.best.card.name}{' '}
                  <span className="num text-neon-amber">OVR {stats.best.card.ovr}</span>
                </p>
                <p className="num text-xs text-neon-lime">{formatBP(stats.best.value)} BP</p>
              </div>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  );
}
