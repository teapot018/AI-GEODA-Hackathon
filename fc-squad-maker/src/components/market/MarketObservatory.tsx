'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Database, LineChart, Minus, RefreshCw, Scale, Search, TrendingDown, TrendingUp, TriangleAlert } from 'lucide-react';

import {
  Badge,
  Button,
  Card,
  CardHeader,
  DataLayerTag,
  EmptyState,
  ErrorNote,
  Input,
  SourceBadge,
  Spinner,
  StatTile,
} from '@/components/ui';
import { FreshnessNote } from '@/components/ui/FreshnessNote';
import { GradeSelect, MixedGradeWarning } from './GradeSelect';
import { TradeSampleNote } from './TradeSampleNote';
import { Sparkline } from '@/components/ui/Sparkline';
import { apiGet, ApiError } from '@/lib/client/api';
import { formatAge, formatDuration, parseApiDate } from '@/lib/data/freshness';
import type { OfficialPrice, PriceComparison } from '@/lib/market/datacenter';
import type { RefreshConfidence, RefreshEstimate } from '@/lib/market/refresh';
import { canRefresh, msUntilRefresh, DEFAULT_POLL_MS, MIN_POLL_MS } from '@/lib/market/livefeed';
import { judgePrice, MIN_SAMPLES, type PriceVerdict, type Trend } from '@/lib/market/observations';

/** /api/market/official 응답 모양 */
interface OfficialLookup extends OfficialPrice {
  comparison: PriceComparison | null;
  refresh: RefreshEstimate;
  checks: number;
}
import type { MarketCardStat, MarketReport, MarketScope } from '@/lib/nexon/insights';
import type { ManagerOverview } from '@/lib/nexon/service';
import { cn } from '@/lib/utils/cn';
import { formatBP, formatDateTime, formatPercent } from '@/lib/utils/format';

/**
 * 거래 관측소.
 *
 * 넥슨은 "지금 이적시장에 올라온 매물" 을 API 로 주지 않는다. 대신
 * 거래 내역(/user/trade)이 **실제 체결가**를 주므로, 한 구단주의 기록을
 * 과거까지 긁어 카드별 가격대를 재구성한다. 현재 호가가 아니라
 * 과거 체결가라는 점을 화면에 계속 밝혀 둔다.
 */
export function MarketObservatory() {
  const [nickname, setNickname] = useState('');
  const [pages, setPages] = useState(3);
  const [scope, setScope] = useState<MarketScope>('pool');
  /**
   * 기본값 +1. 등급을 안 고르면 +1 과 고강화가 한 중앙값에 섞여 어느 쪽
   * 가격도 아닌 숫자가 나오고, 관측 범위는 등급 차이만큼 넓어 보인다.
   */
  const [grade, setGrade] = useState<number | null>(1);

  const [report, setReport] = useState<MarketReport | null>(null);
  const [source, setSource] = useState<string | undefined>();
  const [note, setNote] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [auto, setAuto] = useState(false);
  /**
   * 실제로 조회한 조건. 갱신은 입력창의 현재 값이 아니라 이걸 다시 쓴다 —
   * 자동 갱신을 켜 둔 채로 다음 닉네임을 타이핑하면, 절반쯤 친 이름으로
   * 조회가 나가 버린다.
   */
  const [lastQuery, setLastQuery] = useState<{
    nickname: string;
    pages: number;
    scope: MarketScope;
    grade: number | null;
  } | null>(null);

  /**
   * keepPrevious: 갱신일 때는 표를 지우지 않는다. 매번 비우면 1초쯤
   * 빈 화면이 번쩍이고, 보고 있던 카드 행이 접혀 버린다.
   */
  const search = useCallback(
    async (
      value: string,
      pageCount: number,
      sampleScope: MarketScope,
      sampleGrade: number | null,
      keepPrevious = false,
    ) => {
      const target = value.trim();
      if (!target) return;

      setLoading(true);
      setError(null);
      setLastQuery({ nickname: target, pages: pageCount, scope: sampleScope, grade: sampleGrade });
      if (!keepPrevious) setReport(null);

      try {
        // 닉네임 -> ouid 는 기존 구단주 조회를 그대로 재사용한다.
        const manager = await apiGet<ManagerOverview>(
          `/api/manager?nickname=${encodeURIComponent(target)}`,
        );
        const res = await apiGet<MarketReport>(
          `/api/market/observations?ouid=${encodeURIComponent(
            manager.data.ouid,
          )}&nickname=${encodeURIComponent(target)}&pages=${pageCount}&scope=${sampleScope}${
            sampleGrade ? `&grade=${sampleGrade}` : ''
          }`,
        );
        setReport(res.data);
        setSource(res.source);
        setNote(res.note);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(
            err.status === 404
              ? `'${target}' 구단주를 찾을 수 없습니다.`
              : err.message,
          );
        } else {
          setError('시세를 불러오지 못했습니다.');
        }
      } finally {
        setLoading(false);
        // 성공했을 때만 찍으면 안 된다. 자동 갱신이 켜져 있는데 호출이
        // 실패하면 쿨다운이 시작되지 않아 1초마다 재시도하게 된다.
        // 간격 제한은 '성공한 조회'가 아니라 '넥슨을 부른 것'을 센다.
        setFetchedAt(new Date());
      }
    },
    [],
  );

  const refresh = useCallback(() => {
    if (!lastQuery) return;
    void search(lastQuery.nickname, lastQuery.pages, lastQuery.scope, lastQuery.grade, true);
  }, [search, lastQuery]);

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void search(nickname, pages, scope, grade);
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
              placeholder="거래 기록을 볼 구단주 닉네임"
              className="pl-9"
              aria-label="구단주 닉네임"
              maxLength={24}
            />
          </div>
          <label className="flex items-center gap-2 text-[10px] text-slate-500">
            조회 깊이
            <Input
              type="number"
              min={1}
              max={10}
              value={pages}
              onChange={(event) =>
                setPages(Math.max(1, Math.min(10, Number(event.target.value) || 1)))
              }
              className="w-16"
              aria-label="조회 깊이 (페이지)"
            />
          </label>
          <Button type="submit" disabled={loading || !nickname.trim()} className="sm:w-32">
            {loading ? <Spinner className="border-t-pitch-950" /> : '시세 조회'}
          </Button>
        </form>
        <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
          조회 깊이 1 = 매입·매도 각 100건. 깊이를 올리면 표본이 늘지만 넥슨 API 호출 수도 그만큼 늘어납니다.
        </p>

        {/*
          가격은 계정이 아니라 시장의 속성이라 기본값을 누적 풀로 둔다.
          다만 "내가 산 값만 보고 싶다" 도 정당한 요구라 고를 수 있게 한다.
        */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[10px] text-slate-500">가격표 표본</span>
          {(
            [
              ['pool', '누적 풀', '조회할수록 넓어짐 · 통계가 안정적'],
              ['account', '이 계정만', '출처가 분명함 · 표본은 얕음'],
            ] as const
          ).map(([value, label, hint]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setScope(value);
                if (report) void search(nickname, pages, value, grade);
              }}
              title={hint}
              className={cn(
                'rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors',
                scope === value
                  ? 'border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan'
                  : 'border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <GradeSelect
          className="mt-3"
          value={grade}
          available={report?.availableGrades ?? []}
          onChange={(next) => {
            setGrade(next);
            if (report) void search(nickname, pages, scope, next);
          }}
        />

        <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
          위 매입·매도 총액은 표본 범위와 무관하게 <b>조회한 계정의 거래</b>만 셉니다 — 그 계정의
          현금 흐름이라 섞으면 뜻이 달라집니다.
        </p>

        {report ? (
          <RefreshControl
            fetchedAt={fetchedAt}
            loading={loading}
            auto={auto}
            onToggleAuto={() => setAuto((on) => !on)}
            onRefresh={refresh}
          />
        ) : null}
      </Card>

      {error ? <ErrorNote message={error} /> : null}

      {!report && !loading && !error ? (
        <Card>
          <EmptyState
            icon={<LineChart size={32} />}
            title="구단주의 거래 기록으로 가격 표본을 쌓습니다"
            description="넥슨 Open API 는 현재 매물을 주지 않지만, 조회 가능한 거래 기록을 모으면 카드별 가격대를 관측할 수 있습니다. 시장 전체가 아니라 표본입니다."
          />
        </Card>
      ) : null}

      {report ? <ReportView report={report} source={source} note={note} /> : null}
    </div>
  );
}

function ReportView({
  report,
  source,
  note,
}: {
  report: MarketReport;
  source?: string;
  note?: string;
}) {
  const { summary, cards } = report;

  /**
   * 관측 구간의 길이. "600건" 만 보면 그게 하루치인지 두 달치인지 알 수
   * 없는데, 중앙값을 읽을 때는 그 차이가 크다.
   */
  const from = parseApiDate(summary.from);
  const to = parseApiDate(summary.to);
  const spanDays =
    from && to ? Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000)) : null;

  if (summary.samples === 0) {
    return (
      <Card>
        <EmptyState
          title="관측된 거래가 없습니다"
          description="이 구단주는 이적시장 거래 기록이 없거나, 조회 범위 안에 기록이 없습니다."
        />
      </Card>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <FreshnessNote dates={[summary.from, summary.to]} noun="체결" />
        <SourceBadge source={source} note={note} />
      </div>

      {/*
        숫자 위에 놓는다. "관측 거래 3,412건" 을 시장 전체의 거래량으로
        읽는 순간 아래 통계 전부가 다른 뜻이 되기 때문이다.
      */}
      <TradeSampleNote />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile
          label="관측 거래"
          value={summary.samples.toLocaleString('ko-KR')}
          sub={spanDays ? `${summary.cards}종 · ${spanDays}일 구간` : `${summary.cards}종 카드`}
        />
        <StatTile label="매입 총액" value={formatBP(summary.buyTotal)} sub={`${summary.buyCount}건`} />
        <StatTile label="매도 총액" value={formatBP(summary.sellTotal)} sub={`${summary.sellCount}건`} />
        <StatTile
          label="순유출입"
          value={`${summary.netFlow >= 0 ? '+' : ''}${formatBP(summary.netFlow)}`}
          tone={summary.netFlow >= 0 ? 'good' : 'bad'}
          sub="매도 - 매입"
        />
      </div>

      <PoolPanel report={report} />

      <Card>
        <CardHeader
          title="거래 관측 가격 지수"
          description={
            report.cardsTotal > cards.length
              ? `표본이 많은 상위 ${cards.length}종 (전체 ${report.cardsTotal}종). 행을 펼치면 등급별 가격과 판정기가 나옵니다.`
              : '표본이 많은 카드부터. 행을 펼치면 강화 등급별 가격과 가격 판정기가 나옵니다.'
          }
          action={
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone={report.grade === null ? 'amber' : 'cyan'}>
                {report.grade === null ? '등급 전체' : `+${report.grade}`}
              </Badge>
              <Badge tone={report.scope === 'pool' ? 'violet' : 'neutral'}>
                {report.scope === 'pool' ? '누적 풀' : '이 계정만'}
              </Badge>
            </div>
          }
        />
        {/*
          "가격 지수" 라는 말은 공식 지수를 연상시킨다. 넥슨도 데이터센터에
          가격지수를 공시하는데 이건 그게 아니다 — 우리가 조회할 수 있었던
          거래만 접은 값이고, 다른 구단주를 조회했다면 다른 숫자가 나온다.
        */}
        <p className="px-3 pt-1 text-[10px] leading-relaxed text-slate-500">
          <DataLayerTag layer="observed" className="mr-1 align-middle" />
          넥슨이 공시하는 가격지수가 아닙니다. 이 표는 조회로 모은 거래 기록을 카드별로 접은
          값이며, 표본에 없는 거래는 반영되지 않습니다.
        </p>
        {report.grade === null ? <MixedGradeWarning className="px-3 pt-1" /> : null}
        <ul className="space-y-1.5 p-3">
          {cards.map((card) => (
            <PriceRow key={card.spid} card={card} />
          ))}
        </ul>
      </Card>

      <p className="text-[10px] leading-relaxed text-slate-500">
        ※ 여기 수치는 <b className="text-slate-400">현재 호가가 아니라 과거 체결가</b>입니다. 조회한
        구단주가 실제로 사고판 카드만 나오며, 표본이 적을수록 오차가 큽니다.
      </p>
    </>
  );
}

/**
 * 갱신 컨트롤.
 *
 * 풀은 조회를 거듭해야 넓어지는데, 정작 다시 조회할 방법이 검색 버튼을
 * 또 누르는 것뿐이었다. 여기서 갱신을 하나로 모으고, 넥슨을 부르는 간격에
 * 하한(MIN_POLL_MS)을 둔다 — 호출량은 약관과 별개로 지켜야 할 예의고,
 * 남은 시간을 보여 줘야 사용자도 버튼이 왜 안 눌리는지 안다.
 *
 * 1초 타이머를 이 컴포넌트 안에 가둔 이유: 위쪽에 두면 카드 60행이
 * 매초 다시 그려진다.
 */
function RefreshControl({
  fetchedAt,
  loading,
  auto,
  onToggleAuto,
  onRefresh,
}: {
  fetchedAt: Date | null;
  loading: boolean;
  auto: boolean;
  onToggleAuto: () => void;
  onRefresh: () => void;
}) {
  const [now, setNow] = useState<Date | null>(null);

  // 서버 렌더 결과와 어긋나지 않도록 시계는 마운트 후에만 돈다.
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const cooling = now ? msUntilRefresh(fetchedAt, now) : 0;
  const ready = !loading && cooling === 0;

  // 자동 갱신은 기본 간격(5분)을 따로 쓴다. 최소 간격(1분)으로 돌리면
  // 하루 종일 켜 둔 탭 하나가 넥슨 호출을 계속 먹는다.
  useEffect(() => {
    if (!auto || loading || !now) return;
    if (canRefresh(fetchedAt, now, DEFAULT_POLL_MS)) onRefresh();
  }, [auto, loading, now, fetchedAt, onRefresh]);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onRefresh}
        disabled={!ready}
        className="gap-1.5 text-[11px]"
      >
        <RefreshCw size={12} className={loading ? 'animate-spin' : undefined} />
        {loading ? '갱신 중' : cooling > 0 ? `${Math.ceil(cooling / 1000)}초 후 갱신` : '지금 갱신'}
      </Button>

      <button
        type="button"
        onClick={onToggleAuto}
        title={`${DEFAULT_POLL_MS / 60_000}분마다 자동으로 다시 조회합니다`}
        className={cn(
          'rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors',
          auto
            ? 'border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan'
            : 'border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200',
        )}
      >
        자동 갱신 {DEFAULT_POLL_MS / 60_000}분 {auto ? 'ON' : 'OFF'}
      </button>

      <span className="text-[10px] text-slate-500">
        {fetchedAt ? `마지막 조회 ${fetchedAt.toLocaleTimeString('ko-KR')}` : null}
        {` · 최소 ${MIN_POLL_MS / 1000}초 간격`}
      </span>
    </div>
  );
}

const TREND_STYLE: Record<Trend, { icon: typeof TrendingUp; tone: 'lime' | 'rose' | 'neutral'; label: string }> = {
  up: { icon: TrendingUp, tone: 'rose', label: '상승' },
  down: { icon: TrendingDown, tone: 'lime', label: '하락' },
  flat: { icon: Minus, tone: 'neutral', label: '보합' },
};

/**
 * 누적 관측 풀.
 *
 * 한 계정의 거래 내역만 보면 표본이 얕다. 조회할 때마다 체결 기록을
 * 풀에 합쳐 두면 카드별 가격 분포가 점점 촘촘해진다 — 다른 시세
 * 사이트와의 차이는 값이 진짜냐가 아니라 표본이 얼마나 넓으냐였다.
 */
function PoolPanel({ report }: { report: MarketReport }) {
  const { pool, movers, poolAdded, excluded, retentionDays, summary } = report;
  if (pool.observations === 0) return null;

  return (
    <Card className="space-y-2.5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-200">
          <Database size={13} className="text-neon-violet" />
          누적 관측 풀
        </span>
        <span className="text-[11px] text-slate-400">
          체결 <span className="num font-semibold text-slate-200">{pool.observations.toLocaleString('ko-KR')}</span>건
          {' · '}카드 <span className="num font-semibold text-slate-200">{pool.cards.toLocaleString('ko-KR')}</span>종
          {poolAdded > 0 ? (
            <span className="ml-1.5 text-neon-lime">+{poolAdded.toLocaleString('ko-KR')} 신규</span>
          ) : null}
        </span>
      </div>

      {movers.length > 0 ? (
        <div className="space-y-1">
          <p className="text-[10px] text-slate-500">직전 조회 대비 움직인 카드</p>
          <div className="flex flex-wrap gap-1.5">
            {movers.map((mover) => (
              <span
                key={mover.spid}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px]',
                  mover.direction === 'up'
                    ? 'border-neon-lime/30 bg-neon-lime/10 text-neon-lime'
                    : 'border-neon-rose/30 bg-neon-rose/10 text-neon-rose',
                )}
                title={`${formatBP(mover.before ?? 0)} → ${formatBP(mover.after)}`}
              >
                {mover.direction === 'up' ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                {mover.name}
                <span className="num font-semibold">
                  {mover.percent >= 0 ? '+' : ''}
                  {mover.percent.toFixed(1)}%
                </span>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <p className="text-[10px] leading-relaxed text-slate-500">
        조회할수록 표본이 쌓여 가격 분포가 촘촘해집니다. 보관 기한 {retentionDays}일(이 프로젝트가
        정한 값)이 지난 관측은 자동으로 빠지며, 서버 인스턴스가 재활용되면 풀은 비워집니다.
        {/*
          위 요약 타일은 받아온 전체 건수, 여기 풀은 기한 안에 남은 건수라
          두 숫자가 다르다. 왜 다른지 화면에서 설명하지 않으면 사용자는
          어느 쪽이 틀렸는지 알 수 없다.
        */}
        {excluded > 0 ? (
          <>
            {' '}이번 조회 {summary.samples.toLocaleString('ko-KR')}건 중{' '}
            <span className="num text-slate-400">{excluded.toLocaleString('ko-KR')}</span>건은
            기한이 지나 가격 계산에서 빠졌습니다.
          </>
        ) : null}
      </p>
    </Card>
  );
}

function PriceRow({ card }: { card: MarketCardStat }) {
  const [open, setOpen] = useState(false);
  const trend = TREND_STYLE[card.trend];
  const TrendIcon = trend.icon;

  return (
    <li className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-100">{card.name}</p>
          <p className="truncate text-[10px] text-slate-500">
            {card.seasonName} · 표본 {card.samples}건 (매입 {card.buyCount} / 매도 {card.sellCount})
          </p>
        </div>

        <Sparkline
          values={card.series.map((point) => point.value)}
          className="hidden h-7 w-20 shrink-0 sm:block"
        />

        <div className="shrink-0 text-right">
          <p className="num text-sm font-bold text-slate-100">{formatBP(card.median)}</p>
          <p className="text-[10px] text-slate-500">중앙값</p>
        </div>

        <Badge tone={trend.tone} className="shrink-0">
          <TrendIcon size={10} />
          {card.trend === 'flat' ? trend.label : `${Math.abs(card.trendPercent).toFixed(0)}% ${trend.label}`}
        </Badge>

        <ChevronDown
          size={16}
          className={cn('shrink-0 text-slate-500 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open ? (
        <div className="space-y-3 border-t border-white/[0.06] px-3 py-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {/*
              여기 네 숫자는 전부 **우리 표본의 분포**다. 게임이 정하는
              등록 가격대(하한가/상한가)와는 아무 관계가 없다 —
              fconline/rules.ts 의 LISTING_BAND 주석 참고.
            */}
            <StatTile label="관측 최저" value={formatBP(card.min)} layer="observed" />
            <StatTile
              label="하위 25%"
              value={formatBP(card.p25)}
              sub="이보다 싼 관측이 1/4"
              layer="observed"
            />
            <StatTile
              label="상위 25%"
              value={formatBP(card.p75)}
              sub="이보다 비싼 관측이 1/4"
              layer="observed"
            />
            <StatTile label="관측 최고" value={formatBP(card.max)} layer="observed" />
          </div>

          <p className="text-[10px] leading-relaxed text-slate-500">
            위 네 값은 우리가 관측한 거래의 분포입니다. 게임이 정하는 등록 가격대
            (<b className="text-slate-400">하한가·상한가</b>)와는 다른 값이며, 그 선이 어디인지는 이
            프로젝트가 알지 못합니다.
          </p>

          <SideSpread card={card} />

          <OfficialPriceCheck card={card} />

          <p className="text-[10px] text-slate-500">
            평균 <b className="num text-slate-300">{formatBP(card.avg)}</b> · 변동폭{' '}
            <b className="num text-slate-300">{formatPercent(card.spread, 0)}</b> · 최근 체결{' '}
            <b className="num text-slate-300">{formatBP(card.latest.value)}</b> (
            {formatDateTime(card.latest.date)})
          </p>

          {card.byGrade.length > 1 ? (
            <div className="flex flex-wrap gap-1.5">
              {card.byGrade.map((grade) => (
                <span
                  key={grade.grade}
                  className="rounded-md border border-white/[0.08] px-2 py-1 text-[10px] text-slate-400"
                >
                  <b className="text-slate-200">+{grade.grade}</b> {formatBP(grade.median)}{' '}
                  <span className="text-slate-600">({grade.samples}건)</span>
                </span>
              ))}
            </div>
          ) : null}

          <PriceJudge card={card} />
        </div>
      ) : null}
    </li>
  );
}

const VERDICT: Record<PriceVerdict, { text: string; className: string }> = {
  cheap: { text: '시세보다 쌉니다 — 매수 고려', className: 'text-neon-lime' },
  fair: { text: '적정 가격대입니다', className: 'text-slate-300' },
  expensive: { text: '시세보다 비쌉니다 — 매도 고려', className: 'text-neon-rose' },
  unknown: { text: '표본이 부족해 판단할 수 없습니다', className: 'text-slate-500' },
};

/** 입력한 가격이 관측된 사분위 범위 어디에 놓이는지 알려준다. */
/**
 * 넥슨 공시 기준가와 대조.
 *
 * 우리가 가진 건 실제 체결가고, 저쪽은 2시간 주기 집계값이다. 어느 쪽이
 * 옳다기보다 **어긋나는 폭 자체가 정보**라서 한 칸에 섞지 않고 나란히 둔다.
 * 체결가가 기준가보다 계속 높으면 그 카드는 지금 기준가로는 못 산다는 뜻이다.
 *
 * 카드마다 넥슨 페이지를 한 번씩 부르는 구조라 자동으로 훑지 않는다.
 * 사용자가 눌렀을 때만 1회 — 남의 서버에 예의를 지키는 선이 이 정도다.
 */
/**
 * 매입 중앙가와 매도 중앙가를 나란히.
 *
 * 합친 중앙값 하나만 보면 두 가지를 구분할 수 없다 — 이 구단주가 싸게
 * 사서 비싸게 파는 것인지, 아니면 매도 쪽 숫자가 애초에 다른 기준으로
 * 오는 것인지. 어느 쪽인지 단정하지 않고 두 값을 그대로 보여 준다.
 */
function SideSpread({ card }: { card: MarketCardStat }) {
  const { buyMedian, sellMedian } = card;
  if (buyMedian === null || sellMedian === null) return null;

  const gapPercent = buyMedian > 0 ? ((sellMedian - buyMedian) / buyMedian) * 100 : 0;
  /**
   * 한쪽이 한 건뿐이면 그 % 는 시세 차이가 아니라 그냥 그 한 건이다.
   * 값은 그대로 보여 주되(사실이니까), 차이율은 표본이 설 때만 붙인다.
   */
  const gapMeansSomething = card.buyCount >= MIN_SAMPLES && card.sellCount >= MIN_SAMPLES;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-white/[0.06] px-2.5 py-2 text-[10px]">
      <span className="text-slate-500">
        매입 중앙 <b className="num text-slate-300">{formatBP(buyMedian)}</b>
      </span>
      <span className="text-slate-500">
        매도 중앙 <b className="num text-slate-300">{formatBP(sellMedian)}</b>
      </span>
      {gapMeansSomething ? (
        <span
          className={cn(
            'num font-semibold',
            gapPercent > 0 ? 'text-neon-lime' : gapPercent < 0 ? 'text-neon-rose' : 'text-slate-500',
          )}
        >
          {gapPercent >= 0 ? '+' : ''}
          {gapPercent.toFixed(0)}%
        </span>
      ) : (
        <span className="text-slate-600">표본이 얕아 차이율은 생략</span>
      )}
      <span className="text-slate-600">
        매도가 낮게 나오면 이 구단주가 싸게 넘겼거나, 넥슨이 주는 매도 금액 기준이 다른 것입니다.
      </span>
    </div>
  );
}

/**
 * 넥슨 공시 기준가와 맞대 본다.
 *
 * 등급을 반드시 같이 넘겨야 한다. 예전에는 grade=1 로 고정해 놓고 우리 쪽
 * 중앙값(등급이 섞인 값)과 비교했다 — 서로 다른 물건의 값을 나란히 놓고
 * "몇 % 차이"라고 적고 있었던 셈이다. 지금은 표가 보고 있는 등급 그대로
 * 물어본다. 등급을 안 고른 상태(혼합)라면 기준가 쪽도 기준을 잡을 수 없어
 * +1 로 물어보되, 그 사실을 화면에 적는다.
 */
function OfficialPriceCheck({ card }: { card: MarketCardStat }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<OfficialLookup | null>(null);
  const [note, setNote] = useState<string | undefined>();

  const check = async () => {
    setState('loading');
    try {
      const res = await apiGet<OfficialLookup>(
        `/api/market/official?spid=${card.spid}&grade=${card.grade ?? 1}&observed=${Math.round(
          card.median,
        )}`,
      );
      setResult(res.data);
      setNote(res.note);
      setState('done');
    } catch (error) {
      setNote(error instanceof ApiError ? error.message : '기준가를 불러오지 못했습니다.');
      setState('error');
    }
  };

  if (state === 'idle') {
    return (
      <button
        type="button"
        onClick={check}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-medium text-slate-400 transition-colors hover:border-neon-cyan/40 hover:text-neon-cyan"
      >
        <Scale size={12} /> 넥슨 공시 기준가와 비교
      </button>
    );
  }

  if (state === 'loading') {
    return <p className="text-[11px] text-slate-500">기준가를 확인하는 중…</p>;
  }

  const comparison = result?.comparison;
  const verdict = comparison?.verdict ?? 'unknown';

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px]">
      {result?.price ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-slate-400">
            넥슨 기준가 <b className="num text-slate-200">{formatBP(result.price)}</b>
            <span className="text-slate-600"> (+{card.grade ?? 1})</span>
          </span>
          <span className="text-slate-400">
            우리 체결 중앙값 <b className="num text-slate-200">{formatBP(card.median)}</b>
            <span className="text-slate-600">
              {card.grade === null ? ' (등급 혼합)' : ` (+${card.grade})`}
            </span>
          </span>
          {comparison?.gapPercent !== null && comparison?.gapPercent !== undefined ? (
            <Badge tone={VERDICT_TONE[verdict]}>
              {comparison.gapPercent >= 0 ? '+' : ''}
              {comparison.gapPercent.toFixed(1)}% {VERDICT_LABEL[verdict]}
            </Badge>
          ) : null}
        </div>
      ) : (
        <p className="text-neon-amber">
          {note ?? '기준가를 읽지 못했습니다.'}
        </p>
      )}

      {/*
        등급을 안 고른 상태면 두 숫자의 기준이 서로 다르다. 그걸 밝히지 않고
        "몇 % 차이"만 띄우면 없는 정보를 만들어 주는 셈이다.
      */}
      {card.grade === null ? (
        <p className="mt-1 text-[10px] leading-relaxed text-amber-300/80">
          지금 관측 중앙값은 등급이 섞인 값이고 기준가는 +1 입니다 — 서로 다른 물건이라, 위
          차이율에는 등급 차이가 섞여 있습니다. 그중 얼마가 가격 차이인지는 이 숫자만으로 가를 수
          없습니다. 등급을 골라 다시 보세요.
        </p>
      ) : null}

      {/*
        파서가 숫자를 뱉었다는 것과 그 숫자가 맞다는 것은 다른 얘기다.
        이 파서는 실제 데이터센터 페이지로 검증된 적이 없어서(넥슨 도메인이
        막혀 HTML 을 한 번도 못 열었다), 잡아 온 값이 옆 칸의 다른 숫자일
        수 있다. 값 옆에 그 사실을 적지 않으면 화면은 검증된 공시가처럼
        보인다 — 그게 우리가 주는 오해다.
      */}
      {result?.price && result.parserVerified === false ? (
        <p className="mt-1 flex gap-1.5 text-[10px] leading-relaxed text-amber-300/80">
          <TriangleAlert size={11} className="mt-px shrink-0" />
          <span>
            이 기준가를 읽어 온 <b>파서는 실제 페이지로 검증되지 않았습니다</b> (전략:{' '}
            {result.strategy}). 페이지 구조가 다르면 가격이 아닌 다른 숫자를 잡았을 수 있습니다.
          </span>
        </p>
      ) : null}

      {result?.price ? <RefreshNote refresh={result.refresh} checks={result.checks} /> : null}

      <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
        기준가는 넥슨이 2시간 주기로 집계·공시하는 값이고, 위 가격은 우리가 관측한 거래 기록입니다.
        둘은 서로를 대체하지 않으며 어긋나는 폭이 곧 정보입니다.
      </p>
    </div>
  );
}

const VERDICT_TONE = {
  above: 'rose',
  below: 'lime',
  near: 'neutral',
  unknown: 'neutral',
} as const;

const VERDICT_LABEL = {
  above: '기준가보다 비쌈',
  below: '기준가보다 쌈',
  near: '기준가 수준',
  unknown: '비교 불가',
} as const;

function PriceJudge({ card }: { card: MarketCardStat }) {
  const [price, setPrice] = useState(card.median);
  const verdict = VERDICT[judgePrice(card, price)];

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <label className="flex items-center gap-2 text-[10px] text-slate-500">
        이 가격은 어떨까?
        <Input
          type="number"
          value={price}
          onChange={(event) => setPrice(Math.max(0, Number(event.target.value) || 0))}
          className="h-8 flex-1 text-xs"
          aria-label="판정할 가격 (BP)"
        />
      </label>
      <p className={cn('mt-1.5 text-[11px] font-medium', verdict.className)}>{verdict.text}</p>
    </div>
  );
}

const CONFIDENCE_LABEL: Record<RefreshConfidence, string> = {
  none: '관측 부족',
  weak: '대략',
  fair: '관측 기준',
};

const CONFIDENCE_TONE: Record<RefreshConfidence, 'neutral' | 'amber' | 'cyan'> = {
  none: 'neutral',
  weak: 'amber',
  fair: 'cyan',
};

/**
 * 이 카드의 기준가가 언제 갱신되는지 — **관측된 것만** 말한다.
 *
 * 예전에 있던 "다음 집계 예상 14:00" 은 2시간 주기가 UTC 정각에 떨어진다고
 * 가정하고 찍은 값이었다. 근거가 없어 지웠고, 대신 값이 실제로 달라진 순간을
 * 세기 시작했다. 여기 뜨는 숫자는 전부 우리가 본 것에서 나온다.
 *
 * 우리 확인은 사용자가 이 버튼을 눌렀을 때만 일어나므로 촘촘하지 않다.
 * 그래서 "몇 시에 바뀌었다"가 아니라 "이 구간 안에서 바뀐 걸 확인했다"로
 * 말하고, 구간이 넓으면 예측도 흐리다고 적는다.
 */
function RefreshNote({ refresh, checks }: { refresh: RefreshEstimate; checks: number }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);

  // 변경을 한 번도 못 봤으면 할 말이 없다. 없는 걸 지어내지 않고,
  // 어떻게 하면 쌓이는지만 알려 준다.
  if (!refresh.lastChangeAt) {
    return (
      <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
        <RefreshCw size={10} className="mr-1 inline shrink-0" />
        아직 이 카드의 기준가가 바뀌는 걸 본 적이 없습니다 (확인 {checks}회). 갱신 주기는
        추측하지 않고, 값이 실제로 달라진 걸 확인할 때부터 세기 시작합니다.
      </p>
    );
  }

  const lastChange = new Date(refresh.lastChangeAt);
  const ago = now ? formatAge(Math.max(0, now.getTime() - lastChange.getTime())) : null;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-slate-500">
      <span className="inline-flex items-center gap-1">
        <RefreshCw size={10} className="shrink-0" />
        마지막 갱신 확인
        <b className="text-slate-300">{formatDateTime(lastChange.toISOString())}</b>
        {ago ? <span className="text-slate-600">({ago})</span> : null}
      </span>

      {refresh.intervalMs !== null ? (
        <>
          <Badge tone={CONFIDENCE_TONE[refresh.confidence]}>
            {CONFIDENCE_LABEL[refresh.confidence]} {formatDuration(refresh.intervalMs)} 주기
          </Badge>
          <span className="text-slate-600">
            변경 {refresh.intervalSamples + 1}회 관측
            {refresh.windowMs !== null ? ` · 확인 간격 ±${formatDuration(refresh.windowMs)}` : ''}
          </span>
        </>
      ) : (
        <span className="text-slate-600">
          변경을 한 번만 봐서 주기는 아직 말할 수 없습니다 (간격은 두 번째 변경부터 나옵니다).
        </span>
      )}

      {/*
        예상 시각은 관측된 주기가 있을 때만 찍는다. 그마저도 우리가 알아챈
        시각에서 센 값이라, 실제 갱신은 그보다 앞섰을 수 있다고 밝힌다.
      */}
      {refresh.nextAt && now ? (
        <span className={cn('inline-flex items-center gap-1', refresh.overdue && 'text-neon-amber')}>
          {refresh.overdue
            ? '예상 시각은 이미 지났습니다 — 곧 바뀔 때가 됐습니다'
            : `다음 예상 ${formatDateTime(new Date(refresh.nextAt).toISOString())}`}
        </span>
      ) : null}

      <span className="w-full text-slate-600">
        위 시각은 <b className="text-slate-500">우리가 값이 달라진 걸 확인한 때</b>입니다. 확인은
        이 버튼을 누를 때만 하므로 실제 갱신은 그보다 앞섰을 수 있고, 기록은 서버가 재시작되면
        비워집니다.
      </span>
    </div>
  );
}
