'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Info, Search, Sparkles, Users } from 'lucide-react';

import { DRAG_CARD } from '@/components/squad/Pitch';
import { PlayerCard } from '@/components/squad/PlayerCard';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorNote, Input, Select, Spinner } from '@/components/ui';
import { apiGet } from '@/lib/client/api';
import type { MetaSeason } from '@/lib/nexon/types';
import type { PlayerCardData, PositionCode } from '@/lib/players/types';
import { useSquadStore } from '@/lib/squad/store';
import { cn } from '@/lib/utils/cn';

interface SearchPayload {
  cards: PlayerCardData[];
  total: number;
  seasons?: MetaSeason[];
}

const POSITION_OPTIONS: PositionCode[] = [
  'GK', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST',
];

/**
 * 선수 검색 패널.
 *
 * - 초성 검색: "ㅅㅎㅁ" 로 손흥민을 찾는다 (서버 /api/players 가 처리).
 * - 배치 방법 두 가지: 카드를 피치로 드래그, 또는 슬롯 선택 후 카드 클릭.
 */
export function PlayerSearchPanel() {
  const [query, setQuery] = useState('');
  const [season, setSeason] = useState('');
  const [position, setPosition] = useState('');
  const [seasons, setSeasons] = useState<MetaSeason[]>([]);
  const [cards, setCards] = useState<PlayerCardData[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * 카탈로그가 넥슨에서 왔는지 데모인지.
   *
   * 데모 카탈로그의 spid 는 시즌 번호와 이름 해시로 **만들어 낸 값**이라,
   * 여기 뜨는 카드 조합이 실제 FC 온라인에 존재한다는 보장이 없다.
   * 이름은 진짜 선수라 더 그럴듯해 보이는 게 문제다 — 밝히지 않으면
   * 사용자는 없는 카드를 찾아 이적시장을 뒤지게 된다.
   */
  const [source, setSource] = useState<'nexon' | 'mock' | 'demo' | undefined>();

  const selectedSlot = useSquadStore((state) => state.selectedSlot);
  const assign = useSquadStore((state) => state.assign);
  const autoFill = useSquadStore((state) => state.autoFill);

  const metaLoaded = useRef(false);

  const runSearch = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: '40' });
        if (query.trim()) params.set('q', query.trim());
        if (season) params.set('season', season);
        if (position) params.set('position', position);
        if (!metaLoaded.current) params.set('meta', '1');

        const res = await apiGet<SearchPayload>(`/api/players?${params}`, signal);
        setCards(res.data.cards);
        setTotal(res.data.total);
        setSource(res.source);
        if (res.data.seasons) {
          setSeasons(res.data.seasons);
          metaLoaded.current = true;
        }
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : '선수를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    },
    [query, season, position],
  );

  // 입력이 멈춘 뒤에만 호출 (디바운스 250ms)
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => void runSearch(controller.signal), 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [runSearch]);

  const sortedSeasons = useMemo(
    () => [...seasons].sort((a, b) => b.seasonId - a.seasonId),
    [seasons],
  );

  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        title="선수 검색"
        description={
          selectedSlot
            ? `‘${selectedSlot.toUpperCase()}’ 자리에 넣을 선수를 고르세요`
            : '카드를 피치로 드래그하거나, 자리를 먼저 선택하세요'
        }
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() => autoFill(cards)}
            disabled={cards.length === 0}
            title="현재 검색 결과에서 빈 자리를 오버롤 순으로 자동 배치"
          >
            <Sparkles size={13} /> 자동 배치
          </Button>
        }
      />

      {source === 'demo' ? (
        <p className="mx-3 mt-3 flex gap-1.5 rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-3 text-[10px] leading-relaxed text-amber-200/80">
          <Info size={12} className="mt-px shrink-0" />
          <span>
            넥슨 카드 목록을 받지 못해 <b>데모 카탈로그</b>를 보여 주고 있습니다. 선수 이름은
            실제지만 <b>시즌·카드 조합은 만들어 낸 것</b>이라, 여기 뜬 카드가 실제 FC 온라인에
            존재한다는 보장이 없습니다.
          </span>
        </p>
      ) : null}

      <div className="space-y-2 border-b border-white/[0.06] p-3">
        <div className="relative">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="선수 이름 또는 초성 (예: ㅅㅎㅁ)"
            className="pl-9"
            aria-label="선수 검색"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Select
            value={season}
            onChange={(event) => setSeason(event.target.value)}
            aria-label="시즌 필터"
            className="h-9 text-xs"
          >
            <option value="">전체 시즌</option>
            {sortedSeasons.map((item) => (
              <option key={item.seasonId} value={item.seasonId}>
                {item.className}
              </option>
            ))}
          </Select>
          <Select
            value={position}
            onChange={(event) => setPosition(event.target.value)}
            aria-label="포지션 필터"
            className="h-9 text-xs"
          >
            <option value="">전체 포지션</option>
            {POSITION_OPTIONS.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </Select>
        </div>

        <p className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <Users size={11} />
          {loading ? '검색 중…' : `${total.toLocaleString('ko-KR')}건 중 ${cards.length}건 표시`}
          {query.trim() && /^[ㄱ-ㅎ\s]+$/.test(query.trim()) ? (
            <Badge tone="cyan">초성 검색</Badge>
          ) : null}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {error ? (
          <ErrorNote message={error} />
        ) : loading && cards.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-slate-400">
            <Spinner /> 불러오는 중…
          </div>
        ) : cards.length === 0 ? (
          <EmptyState
            title="검색 결과가 없습니다"
            description="다른 이름이나 초성으로 검색하거나, 시즌·포지션 필터를 풀어 보세요."
          />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,minmax(92px,1fr))]">
            {cards.map((card) => (
              <div
                key={card.spid}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData(DRAG_CARD, JSON.stringify(card));
                  event.dataTransfer.effectAllowed = 'copy';
                }}
                className={cn(
                  'cursor-grab active:cursor-grabbing',
                  'touch-manipulation select-none',
                )}
              >
                <PlayerCard
                  card={card}
                  size="sm"
                  showValue
                  onClick={selectedSlot ? () => assign(selectedSlot, card) : undefined}
                  className="w-full"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
