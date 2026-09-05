import type { Metadata } from 'next';

import { TradeCalculator } from '@/components/trade/TradeCalculator';
import { BASE_FEE_RATE, breakEvenSellPrice } from '@/lib/trade/calculator';

/*
 * 수수료율을 문장에 그대로 적어 두지 않는다.
 *
 * 상수는 rules.ts 에 한 곳뿐인데 화면 문구에는 "40%" 가 손으로 적혀
 * 있었다. 게임이 수수료를 바꾸면 계산기는 새 값으로 계산하면서 문장은
 * 옛 값을 말하게 된다 — 숫자 하나가 두 곳에 있는 흔한 실패다.
 */
const FEE_PERCENT = BASE_FEE_RATE * 100;
/** 본전을 맞추려면 매입가의 몇 배인가. 1/(1-수수료율) 이라 요율에서 유도된다. */
const BREAK_EVEN_MULTIPLE = breakEvenSellPrice(1_000_000) / 1_000_000;

export const metadata: Metadata = {
  title: '트레이드 계산기',
  description: `이적시장 판매 수수료 ${FEE_PERCENT}% 와 PC방·TOP CLASS·쿠폰 감면을 반영해 실수령액과 손익분기 매도가를 계산합니다.`,
};

export default function TradePage() {
  return (
    <div className="mx-auto max-w-md space-y-5">
      <header>
        <h1 className="text-xl font-bold text-slate-50">트레이드 계산기</h1>
        <p className="mt-1 text-xs text-slate-500">
          매입가·매도가를 넣고 PC방·TOP CLASS 여부만 고르면 실현 손익과 수익률이 바로 나옵니다.
          이적시장 기본 수수료는 <b className="text-slate-300">{FEE_PERCENT}%</b> 라, 본전을
          맞추려면 매입가의 약 {BREAK_EVEN_MULTIPLE.toFixed(2)}배에 팔아야 합니다.
        </p>
      </header>
      <TradeCalculator />
    </div>
  );
}
