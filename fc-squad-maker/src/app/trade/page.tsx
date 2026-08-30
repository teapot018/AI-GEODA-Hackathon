import type { Metadata } from 'next';

import { TradeCalculator } from '@/components/trade/TradeCalculator';

export const metadata: Metadata = {
  title: '트레이드 계산기',
  description: '이적시장 판매 수수료를 반영한 매입/매도 손익과 손익분기 매도가를 계산합니다.',
};

export default function TradePage() {
  return (
    <div className="mx-auto max-w-md space-y-5">
      <header>
        <h1 className="text-xl font-bold text-slate-50">트레이드 계산기</h1>
        <p className="mt-1 text-xs text-slate-500">
          매입가·매도가·수수료를 입력하면 실현 손익과 수익률을 바로 계산합니다.
        </p>
      </header>
      <TradeCalculator />
    </div>
  );
}
