'use client';

import { useEffect, useState } from 'react';
import { Clock, RefreshCw } from 'lucide-react';

import {
  formatDuration,
  measureFreshness,
  REFRESH_INTERVAL_HOURS,
  STALENESS_LABEL,
  type Staleness,
} from '@/lib/data/freshness';
import { formatDateTime } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { Badge } from './index';

const TONE: Record<Staleness, 'lime' | 'cyan' | 'amber' | 'rose'> = {
  fresh: 'lime',
  recent: 'cyan',
  aging: 'amber',
  stale: 'rose',
};

/** 화면에 떠 있는 동안 "3분 전"이 늙는다. 30초마다 다시 센다. */
const TICK_MS = 30_000;

interface Props {
  /** 신선도를 잴 시각들 (체결 시각, 경기 시각 …) */
  dates: Array<string | null | undefined>;
  /** 무엇의 신선도인지 — "체결", "경기" 처럼 */
  noun?: string;
  /**
   * 기준가 집계 주기를 같이 밝힐지.
   * 경기 기록처럼 집계 주기가 없는 데이터에서는 꺼 둔다.
   */
  showInterval?: boolean;
  className?: string;
}

/**
 * 데이터가 언제 것인지 밝히는 줄.
 *
 * 이 프로젝트는 과거값을 보여 주면서 현재값인 척하지 않는 걸 원칙으로
 * 삼는다. 시세 관측소가 "현재 호가가 아니다"라고 적어 둔 것의 연장선 —
 * 숫자 옆에 "언제 것인지"를 같이 두어야 보는 사람이 오해하지 않는다.
 *
 * 상대 시각("2시간 전")은 마운트 뒤에 계산한다. 서버에서 Date.now() 를
 * 부르면 SSR 결과와 첫 클라이언트 렌더가 어긋나 하이드레이션 경고가
 * 나고, 무엇보다 그 값이 그 시점에 얼어붙는다. 마운트 전에는 절대
 * 시각만 보여 주고, 붙은 뒤부터 상대 시각을 얹는다.
 */
export function FreshnessNote({ dates, noun = '체결', showInterval = true, className }: Props) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // 마운트 전에는 시간을 모르는 셈 치고 기준을 0 으로 둔다.
  // (measureFreshness 는 순수 함수라 now 가 뭐든 안전하게 돈다.)
  const freshness = measureFreshness(dates, now ?? new Date(0));

  if (!freshness.latest) {
    return (
      <p className={cn('text-[11px] text-slate-500', className)}>
        표본이 없어 갱신 시각을 알 수 없습니다.
      </p>
    );
  }

  const mounted = now !== null;

  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]', className)}>
      <span className="inline-flex items-center gap-1 text-slate-400">
        <Clock size={11} className="shrink-0" />
        마지막 {noun}
        <span className="font-medium text-slate-300">{formatDateTime(freshness.latest.toISOString())}</span>
      </span>

      {mounted && freshness.staleness ? (
        <Badge tone={TONE[freshness.staleness]}>
          {freshness.ageLabel} · {STALENESS_LABEL[freshness.staleness]}
        </Badge>
      ) : null}

      {freshness.spanMs !== null && freshness.spanMs > 0 ? (
        <span className="text-slate-500">
          표본 {formatDuration(freshness.spanMs)}치
        </span>
      ) : null}

      {showInterval ? (
        <span
          className="inline-flex items-center gap-1 text-slate-500"
          title={
            `넥슨 데이터센터 기준가는 약 ${REFRESH_INTERVAL_HOURS}시간 주기로 집계됩니다. ` +
            '다만 집계가 몇 시에 도는지는 공개돼 있지 않고 카드마다 갱신 시각도 달라, ' +
            '다음 갱신 시각은 표시하지 않습니다.'
          }
        >
          <RefreshCw size={11} className="shrink-0" />
          기준가 집계 약 {REFRESH_INTERVAL_HOURS}시간 주기
        </span>
      ) : null}
    </div>
  );
}
