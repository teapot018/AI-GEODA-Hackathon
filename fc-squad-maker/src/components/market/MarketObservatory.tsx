'use client';

import { useCallback, useState } from 'react';
import { ChevronDown, LineChart, Minus, Search, TrendingDown, TrendingUp } from 'lucide-react';

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
import { Sparkline } from '@/components/ui/Sparkline';
import { apiGet, ApiError } from '@/lib/client/api';
import { judgePrice, type PriceVerdict, type Trend } from '@/lib/market/observations';
import type { MarketCardStat, MarketReport } from '@/lib/nexon/insights';
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

  const [report, setReport] = useState<MarketReport | null>(null);
  const [source, setSource] = useState<string | undefined>();
  const [note, setNote] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(
    async (value: string, pageCount: number) => {
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
          )}&nickname=${encodeURIComponent(target)}&pages=${pageCount}`,
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
            void search(nickname, pages);
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
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {formatDateTime(summary.from)} ~ {formatDateTime(summary.to)} 구간의 체결가
        </p>
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

      <Card>
        <CardHeader
          title="카드별 실거래 가격"
          description={
            report.cardsTotal > cards.length
              ? `표본이 많은 상위 ${cards.length}종 (전체 ${report.cardsTotal}종). 행을 펼치면 등급별 가격과 판정기가 나옵니다.`
              : '표본이 많은 카드부터. 행을 펼치면 강화 등급별 가격과 가격 판정기가 나옵니다.'
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
