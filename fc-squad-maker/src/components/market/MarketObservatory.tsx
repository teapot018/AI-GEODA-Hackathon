'use client';

import { useCallback, useState } from 'react';
import { ChevronDown, Database, LineChart, Minus, Scale, Search, TrendingDown, TrendingUp } from 'lucide-react';

import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorNote,
  Input,
  SourceBadge,
  Spinner,
  StatTile,
} from '@/components/ui';
import { FreshnessNote } from '@/components/ui/FreshnessNote';
import { Sparkline } from '@/components/ui/Sparkline';
import { apiGet, ApiError } from '@/lib/client/api';
import type { OfficialPrice, PriceComparison } from '@/lib/market/datacenter';
import { judgePrice, type PriceVerdict, type Trend } from '@/lib/market/observations';

/** /api/market/official 응답 모양 */
interface OfficialLookup extends OfficialPrice {
  comparison: PriceComparison | null;
}
import type { MarketCardStat, MarketReport, MarketScope } from '@/lib/nexon/insights';
import type { ManagerOverview } from '@/lib/nexon/service';
import { cn } from '@/lib/utils/cn';
import { formatBP, formatDateTime, formatPercent } from '@/lib/utils/format';

/**
 * 시세 관측소.
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

  const [report, setReport] = useState<MarketReport | null>(null);
  const [source, setSource] = useState<string | undefined>();
  const [note, setNote] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(
    async (value: string, pageCount: number, sampleScope: MarketScope) => {
      const target = value.trim();
      if (!target) return;

      setLoading(true);
      setError(null);
      setReport(null);

      try {
        // 닉네임 -> ouid 는 기존 구단주 조회를 그대로 재사용한다.
        const manager = await apiGet<ManagerOverview>(
          `/api/manager?nickname=${encodeURIComponent(target)}`,
        );
        const res = await apiGet<MarketReport>(
          `/api/market/observations?ouid=${encodeURIComponent(
            manager.data.ouid,
          )}&nickname=${encodeURIComponent(target)}&pages=${pageCount}&scope=${sampleScope}`,
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
      }
    },
    [],
  );

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void search(nickname, pages, scope);
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
                if (report) void search(nickname, pages, value);
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

        <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
          위 매입·매도 총액은 표본 범위와 무관하게 <b>조회한 계정의 거래</b>만 셉니다 — 그 계정의
          현금 흐름이라 섞으면 뜻이 달라집니다.
        </p>
      </Card>

      {error ? <ErrorNote message={error} /> : null}

      {!report && !loading && !error ? (
        <Card>
          <EmptyState
            icon={<LineChart size={32} />}
            title="구단주의 거래 기록으로 시세를 재구성합니다"
            description="넥슨 Open API 는 현재 매물을 주지 않지만, 거래 내역의 체결가를 모으면 카드별 실제 거래 가격대를 알 수 있습니다."
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

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label="관측 거래" value={summary.samples.toLocaleString('ko-KR')} sub={`${summary.cards}종 카드`} />
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
          title="카드별 실거래 가격"
          description={
            report.cardsTotal > cards.length
              ? `표본이 많은 상위 ${cards.length}종 (전체 ${report.cardsTotal}종). 행을 펼치면 등급별 가격과 판정기가 나옵니다.`
              : '표본이 많은 카드부터. 행을 펼치면 강화 등급별 가격과 가격 판정기가 나옵니다.'
          }
          action={
            <Badge tone={report.scope === 'pool' ? 'violet' : 'neutral'}>
              {report.scope === 'pool' ? '누적 풀' : '이 계정만'}
            </Badge>
          }
        />
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
  const { pool, movers, poolAdded } = report;
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
        조회할수록 표본이 쌓여 시세가 촘촘해집니다. 보관 기한 30일이 지난 관측은 자동으로
        빠지며, 서버 인스턴스가 재활용되면 풀은 비워집니다.
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
            <StatTile label="최저" value={formatBP(card.min)} />
            <StatTile label="하위 25%" value={formatBP(card.p25)} sub="흥정 하단" />
            <StatTile label="상위 25%" value={formatBP(card.p75)} sub="흥정 상단" />
            <StatTile label="최고" value={formatBP(card.max)} />
          </div>

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
                  <b className="text-slate-200">+{grade.grade}</b> {formatBP(grade.avg)}{' '}
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
function OfficialPriceCheck({ card }: { card: MarketCardStat }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<OfficialLookup | null>(null);
  const [note, setNote] = useState<string | undefined>();

  const check = async () => {
    setState('loading');
    try {
      const res = await apiGet<OfficialLookup>(
        `/api/market/official?spid=${card.spid}&grade=1&observed=${Math.round(card.median)}`,
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
          </span>
          <span className="text-slate-400">
            우리 체결 중앙값 <b className="num text-slate-200">{formatBP(card.median)}</b>
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

      <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
        기준가는 넥슨이 2시간 주기로 집계·공시하는 값이고, 위 체결가는 실제 거래 기록입니다.
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
