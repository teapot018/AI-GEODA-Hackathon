'use client';

import { useState } from 'react';
import { Calculator } from 'lucide-react';

import { Card, CardHeader, DataLayerTag, Input } from '@/components/ui';
import { formatBP } from '@/lib/utils/format';
import {
  BASE_FEE_RATE,
  breakEvenSellPrice,
  computeTradeProfit,
  effectiveFeeRate,
  FEE_DISCOUNT,
  totalDiscount,
} from '@/lib/trade/calculator';
import { cn } from '@/lib/utils/cn';

export function TradeCalculator() {
  const [buyPrice, setBuyPrice] = useState(1_000_000);
  const [sellPrice, setSellPrice] = useState(1_200_000);
  const [quantity, setQuantity] = useState(1);

  // 수수료는 직접 입력받지 않는다. 이적시장에서 사용자가 실제로 아는 건
  // "PC방인가 / 탑클인가 / 쿠폰 몇 %인가" 이지 최종 수수료율이 아니다.
  const [pcCafe, setPcCafe] = useState(false);
  const [topClass, setTopClass] = useState(false);
  const [couponPercent, setCouponPercent] = useState(0);

  const discounts = {
    pcCafe,
    topClass,
    coupon: Math.max(0, Math.min(100, couponPercent)) / 100,
  };
  const feeRate = effectiveFeeRate(discounts);
  const result = computeTradeProfit({ buyPrice, sellPrice, discounts, quantity });
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
        action={<DataLayerTag layer="official-rule">공식 수수료율</DataLayerTag>}
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
        <Field label={`수수료 감면 쿠폰 (%)`}>
          <Input
            type="number"
            min={0}
            max={100}
            step="5"
            value={couponPercent}
            onChange={(e) => setCouponPercent(Number(e.target.value) || 0)}
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Toggle
          checked={pcCafe}
          onChange={setPcCafe}
          label={`프리미엄 PC방 (−${FEE_DISCOUNT.pcCafe * 100}%)`}
        />
        <Toggle
          checked={topClass}
          onChange={setTopClass}
          label={`TOP CLASS (−${FEE_DISCOUNT.topClass * 100}%)`}
        />
      </div>

      {/*
        감면율(%)과 수수료율(%)을 헷갈리기 쉬워서 식을 그대로 펼쳐 보여 준다.
        "30% 쿠폰" 은 수수료가 30% 가 된다는 뜻이 아니라 40% 에서 30% 를 깎는다는 뜻이다.
      */}
      <p className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[10px] leading-relaxed text-slate-400">
        실효 수수료{' '}
        <span className="num font-semibold text-neon-amber">{(feeRate * 100).toFixed(1)}%</span>
        {' = '}기본 {BASE_FEE_RATE * 100}% × (1 − 감면{' '}
        {(totalDiscount(discounts) * 100).toFixed(0)}%)
        <br />
        감면율은 서로 <b>더해서</b> 적용됩니다 — PC방+TOP CLASS 면 50% 감면이라 수수료가 20% 가 됩니다.
        <br />
        수수료는 <b>판매자에게서만</b> 뗍니다. 매입가에는 붙지 않습니다.
      </p>

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

      <p className="text-[10px] leading-relaxed text-slate-500">
        손익분기 매도가: <span className="num font-semibold text-slate-300">{formatBP(breakEven)}</span> 이상이어야
        수수료를 떼고도 손해가 없습니다.
        {/*
          손익분기는 계산식이지 예측이 아니다. 무엇을 가정하고 나온
          숫자인지 적지 않으면, 이 값 이상으로만 팔면 반드시 남는다는
          뜻으로 읽힌다 — 그 가격에 사 줄 사람이 있는지는 다른 문제다.
        */}
        <br />
        <span className="text-slate-600">
          가정: 위 수수료 외에 다른 비용이 없고, 입력한 매입가에 실제로 샀으며, 매도가에 팔린다는
          전제의 계산입니다. 그 가격에 거래가 성사될지는 이 계산이 말해 주지 않습니다.
        </span>
      </p>
    </Card>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <label
      className={cn(
        'inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors',
        checked
          ? 'border-neon-lime/40 bg-neon-lime/10 text-neon-lime'
          : 'border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3 w-3 accent-neon-lime"
      />
      {label}
    </label>
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
