'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

import { Button, Spinner } from '@/components/ui';
import { apiGet } from '@/lib/client/api';
import { formatBP } from '@/lib/utils/format';
import type { PlayerCardData } from '@/lib/players/types';
import type { Formation } from '@/lib/squad/formations';
import { useSquadStore } from '@/lib/squad/store';
import { suggestUpgrades, type UpgradeCandidate } from '@/utils/squadOptimizer';

interface SearchPayload {
  cards: PlayerCardData[];
}

/** 예산 내에서 선택한 슬롯의 대체 후보를 보여주는 모달. */
export function UpgradeModal({
  formation,
  slotId,
  remainingBudget,
  onClose,
}: {
  formation: Formation;
  slotId: string;
  remainingBudget: number;
  onClose: () => void;
}) {
  const assignments = useSquadStore((state) => state.assignments);
  const assign = useSquadStore((state) => state.assign);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<UpgradeCandidate[]>([]);
  const [byId, setById] = useState<Map<number, PlayerCardData>>(new Map());

  const slot = formation.slots.find((s) => s.id === slotId);

  useEffect(() => {
    if (!slot) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    apiGet<SearchPayload>(`/api/players?position=${slot.position}&limit=60`, controller.signal)
      .then((res) => {
        const pool = res.data.cards.map((c) => ({
          spid: c.spid,
          name: c.name,
          ovr: c.ovr,
          seasonName: c.seasonName,
          positions: c.positions as string[],
        }));
        const result = suggestUpgrades(formation, assignments, pool, remainingBudget);
        setCandidates(result.filter((c) => c.slotId === slotId));
        setById(new Map(res.data.cards.map((c) => [c.spid, c])));
      })
      .catch((err) => {
        if ((err as Error)?.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : '후보를 불러오지 못했습니다.');
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotId]);

  if (!slot) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="card-surface max-h-[80dvh] w-full max-w-md overflow-y-auto p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-100">
            {slot.position} 대체 후보 <span className="text-slate-500">(예산 {formatBP(remainingBudget)})</span>
          </h3>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-slate-500 hover:text-slate-200">
            <X size={16} />
          </button>
        </div>

        {error ? (
          <p className="text-xs text-neon-rose">{error}</p>
        ) : loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-slate-400">
            <Spinner /> 후보 검색 중…
          </div>
        ) : candidates.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500">예산 내 적합도 개선 후보가 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {candidates.map((c) => {
              const card = byId.get(c.candidateSpid);
              return (
                <div
                  key={c.candidateSpid}
                  className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] p-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-100">{c.candidateName}</p>
                    <p className="text-[10px] text-slate-500">
                      {formatBP(c.cost)} · 적합도 +{Math.round(c.fitGain * 100)}%
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      if (card) {
                        assign(slotId, card);
                        onClose();
                      }
                    }}
                    disabled={!card}
                  >
                    교체
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
