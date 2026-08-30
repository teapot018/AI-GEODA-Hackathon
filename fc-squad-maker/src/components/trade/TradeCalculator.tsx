'use client';

import { useState } from 'react';
import { Calculator } from 'lucide-react';

import { Card, CardHeader, Input } from '@/components/ui';
import { formatBP } from '@/lib/utils/format';
import { breakEvenSellPrice, computeTradeProfit, DEFAULT_FEE_RATE } from '@/lib/trade/calculator';
import { cn } from '@/lib/utils/cn';

export function TradeCalculator() {
  const [buyPrice, setBuyPrice] = useState(1_000_000);
  const [sellPrice, setSellPrice] = useState(1_200_000);
  const [feePercent, setFeePercent] = useState(DEFAULT_FEE_RATE * 100);
  const [quantity, setQuantity] = useState(1);

  const feeRate = Math.max(0, Math.min(100, feePercent)) / 100;
  const result = computeTradeProfit({ buyPrice, sellPrice, feeRate, quantity });
  const breakEven = breakEvenSellPrice(buyPrice, feeRate);

  return (
    <Card className="space-y-3 p-3">
      <CardHeader
        title={
          <span className="flex items-center gap-1.5">
            <Calculator size={14} className="text-neon-lime" /> 트레이드 손익 계산기
          </span>
        }
        description="이적시장 판매 수수료를 반영한 실현 손익을 계산합니다"
      />

      <div className="grid grid-cols-2 gap-2">
        <Field label="매입가 (BP)">
          <Input
            type="number"
            value={buyPrice}
            onChange={(e) => setBuyPrice(Math.max(0, Number(e.target.value) || 0))}
          />
        </Field>
        <Field label="매도가 (BP)">
          <Input
            type="number"
            value={sellPrice}
            onChange={(e) => setSellPrice(Math.max(0, Number(e.target.value) || 0))}
          />
        </Field>
        <Field label="수량">
          <Input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
          />
        </Field>
        <Field label="수수료 (%)">
          <Input
            type="number"
            step="0.1"
            value={feePercent}
            onChange={(e) => setFeePercent(Number(e.target.value) || 0)}
          />
        </Field>
      </div>

      <div className="space-y-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-xs">
        <Row label="매입 총액" value={formatBP(result.buyTotal)} />
        <Row label="매도 총액" value={formatBP(result.sellGross)} />
        <Row label="수수료" value={`-${formatBP(result.fee)}`} tone="rose" />
        <Row label="실수령액" value={formatBP(result.sellNet)} />
        <div className="my-1 border-t border-white/[0.06]" />
        <Row
          label="순손익"
          value={`${result.profit >= 0 ? '+' : ''}${formatBP(result.profit)}`}
          tone={result.profit >= 0 ? 'lime' : 'rose'}
          bold
        />
        <Row
          label="수익률"
          value={`${result.roi >= 0 ? '+' : ''}${result.roi.toFixed(1)}%`}
          tone={result.roi >= 0 ? 'lime' : 'rose'}
        />
      </div>

      <p className="text-[10px] text-slate-500">
        손익분기 매도가: <span className="num font-semibold text-slate-300">{formatBP(breakEven)}</span> 이상이어야
        수수료를 떼고도 손해가 없습니다.
      </p>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1 text-[10px] text-slate-500">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Row({
  label,
  value,
  tone,
  bold,
}: {
  label: string;
  value: string;
  tone?: 'lime' | 'rose';
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-400">{label}</span>
      <span
        className={cn(
          'num',
          bold ? 'font-bold' : 'font-medium',
          tone === 'lime' && 'text-neon-lime',
          tone === 'rose' && 'text-neon-rose',
          !tone && 'text-slate-200',
        )}
      >
        {value}
      </span>
    </div>
  );
}
