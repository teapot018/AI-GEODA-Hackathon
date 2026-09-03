import { Info } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { TRADE_SAMPLE_DISCLAIMER } from '@/lib/market/observations';

/**
 * 이 화면의 거래 데이터가 **무엇이 아닌지** 먼저 적는다.
 *
 * `/user/trade` 가 주는 것은 전체 이적시장의 전수 거래가 아니라, 현재
 * Open API 인증 주체에서 조회 가능한 거래 기록이다. 그런데 화면에
 * "관측 거래 3,412건" 만 띄워 두면 사람은 그걸 시장 전체의 거래량으로
 * 읽는다 — 표본 몇 건을 근거로 "요즘 이 카드 많이 팔리네" 라고 판단하게
 * 되고, 그건 우리가 준 오해다.
 *
 * 그래서 숫자 옆이 아니라 숫자 **위**에 놓는다. 각주로 내리면 아무도
 * 읽지 않고, 각주로 내려도 될 만큼 사소한 사실이 아니다.
 */
export function TradeSampleNote({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        'flex gap-1.5 rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-3 text-[10px] leading-relaxed text-amber-200/80',
        className,
      )}
    >
      <Info size={12} className="mt-px shrink-0" />
      <span>{TRADE_SAMPLE_DISCLAIMER}</span>
    </p>
  );
}
