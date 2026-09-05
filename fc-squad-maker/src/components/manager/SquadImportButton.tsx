'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Download } from 'lucide-react';

import { Spinner } from '@/components/ui';
import { apiGet } from '@/lib/client/api';
import type { ImportedSquad } from '@/lib/nexon/insights';
import { useSquadStore } from '@/lib/squad/store';
import { cn } from '@/lib/utils/cn';

/**
 * 실제 경기의 선발 11명을 스쿼드 빌더로 옮긴다.
 *
 * 상대 쪽 ouid 를 넘기면 나를 이긴 스쿼드를 그대로 뜯어볼 수 있다.
 * 기존 편집 내용을 덮어쓰므로 한 번 확인을 받는다.
 */
export function SquadImportButton({
  matchId,
  ouid,
  nickname,
  className,
}: {
  matchId: string;
  ouid: string;
  nickname: string;
  className?: string;
}) {
  const router = useRouter();
  const importSquad = useSquadStore((state) => state.importSquad);
  const hasSquad = useSquadStore((state) => Object.keys(state.assignments).length > 0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (loading) return;
    if (
      hasSquad &&
      !window.confirm('지금 편집 중인 스쿼드를 덮어씁니다. 계속할까요?')
    ) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<ImportedSquad>(
        `/api/manager/squad?matchId=${encodeURIComponent(matchId)}&ouid=${encodeURIComponent(
          ouid,
        )}&nickname=${encodeURIComponent(nickname)}`,
      );
      importSquad(res.data.formationId, res.data.slots, {
        matchId: res.data.matchId,
        nickname: res.data.nickname,
        formationConfidence: res.data.formationConfidence,
        starters: res.data.starters,
        missing: res.data.missing.length,
      });
      router.push('/squad');
    } catch (err) {
      setError(err instanceof Error ? err.message : '스쿼드를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={run}
        disabled={loading}
        title={`${nickname} 의 이 경기 스쿼드를 빌더로 가져옵니다`}
        className={cn(
          'inline-flex items-center gap-1 rounded-md border border-white/[0.08] px-1.5 py-0.5',
          'text-[10px] text-slate-400 transition-colors',
          'hover:border-neon-cyan/40 hover:text-neon-cyan disabled:opacity-40',
          className,
        )}
      >
        {loading ? <Spinner className="h-3 w-3 border" /> : <Download size={10} />}
        스쿼드 가져오기
      </button>
      {error ? <span className="text-[10px] text-neon-rose">{error}</span> : null}
    </span>
  );
}
