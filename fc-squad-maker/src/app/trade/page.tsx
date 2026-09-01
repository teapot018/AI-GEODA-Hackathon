import type { Metadata } from 'next';

import { TradeCalculator } from '@/components/trade/TradeCalculator';

export const metadata: Metadata = {
  title: '트레이드 계산기',
  description:
    '이적시장 판매 수수료 40% 와 PC방·TOP CLASS·쿠폰 감면을 반영해 실수령액과 손익분기 매도가를 계산합니다.',
};

export default function TradePage() {
  return (
    <div className="mx-auto max-w-md space-y-5">
      <header>
        <h1 className="text-xl font-bold text-slate-50">트레이드 계산기</h1>
        <p className="mt-1 text-xs text-slate-500">
          매입가·매도가를 넣고 PC방·TOP CLASS 여부만 고르면 실현 손익과 수익률이 바로 나옵니다.
          이적시장 기본 수수료는 <b className="text-slate-300">40%</b> 라, 본전을 맞추려면
          매입가의 약 1.67배에 팔아야 합니다.
        </p>
      </header>
      <TradeCalculator />
    </div>
  );
}
