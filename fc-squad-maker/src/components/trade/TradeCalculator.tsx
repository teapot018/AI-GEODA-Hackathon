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

  /*
    즉시 판매(방출) 가격. 0 이면 비교를 띄우지 않는다.

    이 값을 우리가 계산하지 않는 이유를 화면에도 적는다 — 넥슨이 공식을
    공개한 적이 없다. 게임 화면에는 그대로 떠 있으므로 읽어서 넣게 한다.
    모르는 값을 지어내 "즉시 판매하면 12만" 이라고 적지 않는다.
  */
  const [quickPrice, setQuickPrice] = useState(0);

  const discounts = {
    pcCafe,
    topClass,
    coupon: Math.max(0, Math.min(100, couponPercent)) / 100,
  };
  const feeRate = effectiveFeeRate(discounts);
  const result = computeTradeProfit({ buyPrice, sellPrice, discounts, quantity });
  const breakEven = breakEvenSellPrice(buyPrice, feeRate);

  // 즉시 판매에는 이적시장 수수료가 붙지 않는다 — 같은 감면 설정이어도 0 이다.
  const quick =
    quickPrice > 0
      ? computeTradeProfit({ buyPrice, sellPrice: quickPrice, path: 'quick', quantity })
      : null;

  return (
    <Card className="space-y-3 p-3">
      <CardHeader
        title={
          <span className="flex items-center gap-1.5">
            <Calculator size={14} className="text-neon-lime" /> 트레이드 손익 계산기
          </span>
        }
        description="이적시장 판매 수수료를 반영한 실현 손익을 계산합니다"
        /*
          배지는 기본 수수료율(40%)과 PC방·TOP CLASS 감면에만 걸린다.
          쿠폰은 규칙이 아니라 그때그때 열리는 이벤트 값이라 이 배지가
          덮지 않는다 — 아래 문구에서 따로 밝힌다.
        */
        action={<DataLayerTag layer="official-rule">기본 수수료율</DataLayerTag>}
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

      <Field label="즉시 판매가 (BP · 게임 화면에 뜨는 값)">
        <Input
          type="number"
          min={0}
          value={quickPrice}
          onChange={(e) => setQuickPrice(Math.max(0, Number(e.target.value) || 0))}
        />
      </Field>

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
        "30% 쿠폰" 은 수수료가 30% 가 된다는 뜻이 아니라 기본 수수료에서 30% 를 깎는다는 뜻이다.
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
        <br />
        {/*
          쿠폰 값을 코드에 박아 두면, 이벤트가 끝난 뒤에도 계산기가 그
          할인을 영구 규칙처럼 계속 적용한다. 그래서 이 앱은 쿠폰을
          어떤 값도 알고 있지 않고, 매번 입력받는다.
        */}
        <span className="text-slate-600">
          쿠폰 감면율은 <b>기간 한정 이벤트 값</b>이라 이 앱이 미리 알고 있지 않습니다. 지금 가진
          쿠폰의 %를 직접 넣으세요 — 값을 코드에 박아 두면 이벤트가 끝난 뒤에도 없는 할인을 계속
          적용하게 됩니다.
        </span>
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

      {/*
        파는 길은 둘이고 수수료 규칙이 다르다. 이적시장만 계산하면 값싼
        카드에서 틀린 조언을 한다 — 40% 를 떼고 나면 즉시 판매가 더
        남는 구간이 실제로 있는데, 한쪽만 보면 그 구간이 안 보인다.
      */}
      {quick ? (
        <div className="space-y-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-xs">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">즉시 판매와 비교</p>
          <Row label="즉시 판매 실수령" value={formatBP(quick.sellNet)} />
          <Row label="이적시장 실수령" value={formatBP(result.sellNet)} />
          <div className="my-1 border-t border-white/[0.06]" />
          <Row
            label={quick.sellNet > result.sellNet ? '즉시 판매가 더 남음' : '이적시장이 더 남음'}
            value={`${formatBP(Math.abs(quick.sellNet - result.sellNet))} 차이`}
            tone={quick.sellNet > result.sellNet ? 'amber' : 'lime'}
            bold
          />
          <p className="pt-1 text-[10px] leading-relaxed text-slate-600">
            즉시 판매에는 이적시장 수수료가 붙지 않습니다. 다만 <b>이적시장 쪽은 그 가격에 팔렸을
            때</b>의 값이고, 즉시 판매는 지금 확정되는 값입니다 — 팔릴지 모르는 금액과 확정 금액을
            나란히 둔 비교라는 점을 감안하세요.
          </p>
        </div>
      ) : null}

      <p className="text-[10px] leading-relaxed text-slate-500">
        즉시 판매가는 <b>계산하지 않습니다</b> — 넥슨이 공식을 공개한 적이 없어서, 게임 화면에 뜨는
        값을 그대로 넣으셔야 합니다. 비워 두면 비교를 띄우지 않습니다.
      </p>

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
  tone?: 'lime' | 'rose' | 'amber';
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
          tone === 'amber' && 'text-neon-amber',
          !tone && 'text-slate-200',
        )}
      >
        {value}
      </span>
    </div>
  );
}
