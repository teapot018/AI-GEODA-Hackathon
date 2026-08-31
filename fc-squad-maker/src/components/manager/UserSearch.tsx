'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search, UserRound } from 'lucide-react';

import { AnalyticsPanel } from '@/components/manager/AnalyticsPanel';
import { AssetPanel } from '@/components/manager/AssetPanel';
import { ManagerProfile } from '@/components/manager/ManagerProfile';
import { MatchHistory } from '@/components/manager/MatchHistory';
import { Button, Card, EmptyState, ErrorNote, Input, SourceBadge, Spinner } from '@/components/ui';
import { apiGet, ApiError } from '@/lib/client/api';
import type { ManagerAnalytics } from '@/lib/nexon/insights';
import type { AssetSnapshot, ManagerOverview, MatchSummary } from '@/lib/nexon/service';

const SUGGESTED = ['페이커', '아이유', '손흥민', '테스트구단주'];

/**
 * 구단주 검색 화면 전체를 담당하는 클라이언트 컴포넌트.
 *
 * 흐름: 닉네임 -> /api/manager (ouid + 기본정보)
 *              -> ouid 확보 후 매치 기록 / 거래 내역을 병렬로 추가 조회
 */
export function UserSearch() {
  const [nickname, setNickname] = useState('');
  const [submitted, setSubmitted] = useState('');

  const [overview, setOverview] = useState<ManagerOverview | null>(null);
  const [source, setSource] = useState<string | undefined>();
  const [note, setNote] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [matchType, setMatchType] = useState(50);
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);

  const [assets, setAssets] = useState<AssetSnapshot | null>(null);
  const [assetsLoading, setAssetsLoading] = useState(false);

  const [analytics, setAnalytics] = useState<ManagerAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const search = useCallback(async (value: string) => {
    const target = value.trim();
    if (!target) return;

    setSubmitted(target);
    setLoading(true);
    setError(null);
    setOverview(null);
    setMatches([]);
    setAssets(null);
    setAnalytics(null);

    try {
      const res = await apiGet<ManagerOverview>(
        `/api/manager?nickname=${encodeURIComponent(target)}`,
      );
      setOverview(res.data);
      setSource(res.source);
      setNote(res.note);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.status === 404
            ? `'${target}' 구단주를 찾을 수 없습니다. 닉네임을 다시 확인해 주세요.`
            : err.message,
        );
      } else {
        setError('구단주 정보를 불러오지 못했습니다.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // 구단주가 확정되면 매치 기록을 가져온다 (매치 종류 변경 시에도 재조회)
  useEffect(() => {
    if (!overview) return;
    const controller = new AbortController();

    setMatchesLoading(true);
    apiGet<MatchSummary[]>(
      `/api/manager/matches?ouid=${encodeURIComponent(overview.ouid)}&nickname=${encodeURIComponent(
        overview.nickname,
      )}&matchType=${matchType}&limit=8`,
      controller.signal,
    )
      .then((res) => setMatches(res.data))
      .catch(() => setMatches([]))
      .finally(() => setMatchesLoading(false));

    return () => controller.abort();
  }, [overview, matchType]);

  // 전적 분석 — 경기당 1콜이라 매치 목록보다 느리게 도착한다.
  useEffect(() => {
    if (!overview) return;
    const controller = new AbortController();

    setAnalyticsLoading(true);
    apiGet<ManagerAnalytics>(
      `/api/manager/analytics?ouid=${encodeURIComponent(overview.ouid)}&nickname=${encodeURIComponent(
        overview.nickname,
      )}&matchType=${matchType}&limit=20`,
      controller.signal,
    )
      .then((res) => setAnalytics(res.data))
      .catch(() => setAnalytics(null))
      .finally(() => setAnalyticsLoading(false));

    return () => controller.abort();
  }, [overview, matchType]);

  // 거래 내역(자금 흐름)
  useEffect(() => {
    if (!overview) return;
    const controller = new AbortController();

    setAssetsLoading(true);
    apiGet<AssetSnapshot>(
      `/api/manager/trades?ouid=${encodeURIComponent(overview.ouid)}&nickname=${encodeURIComponent(
        overview.nickname,
      )}&limit=30`,
      controller.signal,
    )
      .then((res) => setAssets(res.data))
      .catch(() => setAssets(null))
      .finally(() => setAssetsLoading(false));

    return () => controller.abort();
  }, [overview]);

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void search(nickname);
          }}
          className="flex flex-col gap-3 sm:flex-row"
        >
          <div className="relative flex-1">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
            />
            <Input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="구단주 닉네임을 입력하세요"
              className="pl-9"
              aria-label="구단주 닉네임"
              maxLength={24}
            />
          </div>
          <Button type="submit" disabled={loading || !nickname.trim()} className="sm:w-32">
            {loading ? <Spinner className="border-t-pitch-950" /> : '검색'}
          </Button>
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-slate-500">예시</span>
          {SUGGESTED.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => {
                setNickname(name);
                void search(name);
              }}
              className="rounded-md border border-white/[0.08] px-2 py-0.5 text-[10px] text-slate-400 transition-colors hover:border-neon-cyan/40 hover:text-neon-cyan"
            >
              {name}
            </button>
          ))}
        </div>
      </Card>

      {error ? <ErrorNote message={error} /> : null}

      {!overview && !loading && !error ? (
        <Card>
          <EmptyState
            icon={<UserRound size={32} />}
            title="구단주를 검색해 주세요"
            description="닉네임으로 OUID 를 조회한 뒤 레벨, 역대 최고 등급, 최근 매치 기록, 이적시장 거래 내역을 함께 보여줍니다."
          />
        </Card>
      ) : null}

      {overview ? (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              검색 결과 <span className="text-slate-300">{submitted}</span>
            </p>
            <SourceBadge source={source} note={note} />
          </div>

          <ManagerProfile overview={overview} />

          <AnalyticsPanel analytics={analytics} loading={analyticsLoading} />

          <div className="grid gap-5 lg:grid-cols-2">
            <MatchHistory
              matches={matches}
              nickname={overview.nickname}
              loading={matchesLoading}
              matchType={matchType}
              onMatchTypeChange={setMatchType}
            />
            <AssetPanel snapshot={assets} loading={assetsLoading} />
          </div>
        </>
      ) : null}
    </div>
  );
}
