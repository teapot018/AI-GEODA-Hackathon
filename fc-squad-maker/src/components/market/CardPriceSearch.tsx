'use client';

import { useCallback, useEffect, useState } from 'react';
import { Clock, Database, Search, UserSearch } from 'lucide-react';

import { Badge, Button, Card, CardHeader, Input, SourceBadge, Spinner } from '@/components/ui';
import { GradeSelect, MixedGradeWarning } from './GradeSelect';
import { apiGet, ApiError } from '@/lib/client/api';
import type { CardLookupResult, CardPrice } from '@/lib/market/lookup';
import { MIN_SAMPLES } from '@/lib/market/observations';
import { formatAge, formatDuration } from '@/lib/data/freshness';
import { formatBP } from '@/lib/utils/format';

/**
 * 선수 이름으로 시세 찾기.
 *
 * 이 화면의 원래 입구는 구단주 닉네임이었다. 관측이 거래 내역에서 나오니
 * 구현 순서로는 자연스러웠지만, 사람이 실제로 던지는 질문은 "손흥민 얼마야?"
 * 이지 "누구 거래 내역에 손흥민이 있지?"가 아니다. 다른 시세 사이트가 전부
 * 선수 이름 검색으로 시작하는 이유고, 여기 없던 게 제일 큰 구멍이었다.
 *
 * 넥슨을 부르지 않는다. 이미 쌓인 관측 풀을 카드 기준으로 다시 자를 뿐이라
 * 호출량을 한 톨도 쓰지 않고, 그래서 마음껏 눌러도 된다.
 *
 * 없는 건 없다고 적는다. 풀에 그 카드가 없으면 "관측 없음"이라고 쓰고
 * 어떻게 하면 표본이 쌓이는지를 안내한다 — 빈칸을 추정치로 메우면 그 순간
 * 이 표는 시세표가 아니라 추측표가 된다.
 */
export function CardPriceSearch() {
  const [query, setQuery] = useState('');
  /**
   * 기본값을 +1 로 둔다. 거래가 가장 많이 도는 등급이고, 등급을 안 고르면
   * +1 과 고강화가 한 중앙값에 섞여 어느 쪽 시세도 아닌 숫자가 나온다.
   */
  const [grade, setGrade] = useState<number | null>(1);
  const [result, setResult] = useState<CardLookupResult | null>(null);
  const [source, setSource] = useState<string | undefined>();
  const [note, setNote] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = useCallback(async (value: string, forGrade: number | null) => {
    const target = value.trim();
    if (!target) return;

    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<CardLookupResult>(
        `/api/market/card?q=${encodeURIComponent(target)}${forGrade ? `&grade=${forGrade}` : ''}`,
      );
      setResult(res.data);
      setSource(res.source);
      setNote(res.note);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '시세를 찾지 못했습니다.');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <Card className="p-5">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void lookup(query, grade);
        }}
        className="flex flex-col gap-3 sm:flex-row"
      >
        <div className="relative flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="선수 이름으로 시세 찾기 (초성 가능 · 예: ㅅㅎㅁ)"
            className="pl-9"
            aria-label="선수 이름"
            maxLength={24}
          />
        </div>
        <Button type="submit" disabled={loading || !query.trim()} className="sm:w-32">
          {loading ? <Spinner className="border-t-pitch-950" /> : '시세 찾기'}
        </Button>
      </form>

      <GradeSelect
        className="mt-3"
        value={grade}
        available={result?.availableGrades ?? []}
        onChange={(next) => {
          setGrade(next);
          // 이미 결과가 떠 있으면 등급만 바꿔 바로 다시 찾는다.
          // 넥슨을 부르지 않는 조회라 눌러도 호출량이 늘지 않는다.
          if (result) void lookup(query, next);
        }}
      />

      <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
        아래 구단주 조회로 쌓인 <b className="text-slate-400">누적 관측 풀</b>에서 찾습니다. 넥슨을
        새로 부르지 않으므로 호출량을 쓰지 않습니다.
      </p>

      {error ? <p className="mt-3 text-[11px] text-rose-300">{error}</p> : null}

      {result ? (
        <LookupResult result={result} source={source} note={note} />
      ) : null}
    </Card>
  );
}

function LookupResult({
  result,
  source,
  note,
}: {
  result: CardLookupResult;
  source?: string;
  note?: string;
}) {
  if (result.cards.length === 0) {
    return (
      <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-[11px] text-slate-400">
        <b className="text-slate-300">&#39;{result.query}&#39;</b> 와 맞는 카드를 찾지 못했습니다.
        선수 이름을 다시 확인해 주세요.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardHeader
          title={`'${result.query}' 검색 결과`}
          description={[
            result.grade === null ? '등급 전체' : `+${result.grade} 기준`,
            result.matched > result.cards.length
              ? `${result.matched}종 중 ${result.cards.length}종`
              : `${result.cards.length}종`,
            `관측 풀 ${result.poolSamples.toLocaleString('ko-KR')}건`,
          ].join(' · ')}
        />
        <SourceBadge source={source} note={note} />
      </div>

      {result.grade === null ? <MixedGradeWarning /> : null}

      <ul className="space-y-1.5">
        {result.cards.map((card) => (
          <CardPriceRow key={card.spid} card={card} />
        ))}
      </ul>

      {/*
        표본이 없는 카드가 섞여 있으면 왜 없는지, 어떻게 하면 생기는지 적는다.
        빈칸만 보여 주고 끝내면 사용자는 기능이 고장 났다고 읽는다.
      */}
      {result.withoutSamples > 0 ? (
        <p className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-[10px] leading-relaxed text-slate-500">
          <UserSearch size={11} className="mr-1 inline shrink-0" />
          {result.withoutSamples}종은 아직 관측 표본이 없습니다. 시세는 조회된 구단주가 실제로
          사고판 기록에서만 나오므로, <b className="text-slate-400">아래에서 구단주를 조회</b>할수록
          풀이 넓어지고 이 카드도 채워집니다.
        </p>
      ) : null}
    </div>
  );
}

function CardPriceRow({ card }: { card: CardPrice }) {
  const { stat } = card;

  return (
    <li className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-slate-100">
            {card.name}
            {card.ovr > 0 ? <span className="ml-1.5 text-[10px] text-slate-500">OVR {card.ovr}</span> : null}
          </p>
          <p className="truncate text-[10px] text-slate-500">{card.seasonName}</p>
        </div>

        {stat ? (
          <>
            <div className="text-right">
              <p className="text-xs font-bold text-neon-cyan">{formatBP(stat.median)}</p>
              <p className="text-[10px] text-slate-500">
                {stat.grade === null ? '중앙가 (등급 혼합)' : `+${stat.grade} 중앙가`}
              </p>
            </div>
            <div className="hidden text-right sm:block">
              <p className="text-[11px] text-slate-300">
                {formatBP(stat.p25)} ~ {formatBP(stat.p75)}
              </p>
              <p className="text-[10px] text-slate-500">흥정 범위</p>
            </div>
            <Badge tone={stat.samples >= MIN_SAMPLES ? 'violet' : 'amber'}>
              <Database size={10} className="mr-1 inline shrink-0" />
              표본 {stat.samples}
            </Badge>
          </>
        ) : (
          <Badge tone="neutral">관측 없음</Badge>
        )}
      </div>

      {/*
        등급 사다리. 고른 등급 하나만 보여 주면 "+5는 얼마인데?"에 다시
        검색을 시켜야 한다. 표본이 있는 등급은 여기서 바로 비교된다.
        한 등급뿐이면 사다리가 아니라 같은 숫자의 반복이라 접는다.
      */}
      {stat && stat.byGrade.length > 1 ? (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-white/5 pt-2">
          {stat.byGrade.map((row) => (
            <span key={row.grade} className="text-[10px] text-slate-500">
              <b className="text-slate-300">+{row.grade}</b> {formatBP(row.median)}
              <span className="text-slate-600"> ({row.samples}건)</span>
            </span>
          ))}
        </div>
      ) : null}

      <CadenceNote cadence={card.cadence} />
    </li>
  );
}

/**
 * 이 카드가 마지막으로 언제, 얼마나 자주 거래됐나.
 *
 * 시각은 넥슨이 체결 기록에 적어 준 값이라 추정이 아니다. 다만 표본은 조회된
 * 구단주가 사고판 것뿐이라, 우리가 재는 간격은 **실제보다 길게** 나온다 —
 * 중간 거래를 못 봤을 뿐이므로. 그래서 '최소' 라고 적는다.
 *
 * 다음 체결 시각은 찍지 않는다. 체결은 주기가 아니라 사람이 사고파는
 * 사건이라, 평균 4시간이라고 다음이 4시간 뒤인 게 아니다.
 */
function CadenceNote({ cadence }: { cadence: CardPrice['cadence'] }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);

  if (!cadence.lastTradeAt) return null;
  const last = new Date(cadence.lastTradeAt);

  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[10px] text-slate-600">
      <span className="inline-flex items-center gap-1">
        <Clock size={10} className="shrink-0" />
        마지막 체결
        <b className="text-slate-400">
          {now ? formatAge(Math.max(0, now.getTime() - last.getTime())) : '-'}
        </b>
      </span>
      {cadence.intervalMs !== null ? (
        <span>
          체결 간격 최소 <b className="text-slate-400">{formatDuration(cadence.intervalMs)}</b>
          <span className="text-slate-700"> ({cadence.samples}건 기준)</span>
        </span>
      ) : null}
    </p>
  );
}
