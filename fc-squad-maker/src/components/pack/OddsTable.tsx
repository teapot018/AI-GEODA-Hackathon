'use client';

import { Info } from 'lucide-react';

import { Badge, Card, CardHeader, Skeleton, StatTile } from '@/components/ui';
import type { BoxExpectation } from '@/lib/pack/simulator';
import { formatBP, formatNumber, formatPercent } from '@/lib/utils/format';

/**
 * 확률/기대값 공개 테이블.
 *
 * 확률형 아이템은 확률을 감추지 않는 게 원칙이라, 열기 전에 항상 보이게 둔다.
 * (게임물관리위원회 고시·전자상거래법상 실제 서비스는 확률 표시가 의무다.)
 */
export function OddsTable({
  expectation,
  price,
  currency,
}: {
  expectation: BoxExpectation | null;
  price: number;
  currency: string;
}) {
  if (!expectation) {
    return (
      <Card className="p-4">
        <Skeleton className="h-40 w-full" />
      </Card>
    );
  }

  const ratio = expectation.valueRatio;

  return (
    <Card>
      <CardHeader
        title="확률 및 기대값"
        description={`1회 개봉 = ${expectation.drawCount}장`}
        action={
          Math.abs(expectation.probabilitySum - 1) > 1e-6 ? (
            <Badge tone="rose">확률 합 {formatPercent(expectation.probabilitySum, 3)}</Badge>
          ) : (
            <Badge tone="lime">확률 합 100%</Badge>
          )
        }
      />

      <div className="grid grid-cols-3 gap-2 p-4">
        <StatTile label="가격" value={`${formatNumber(price)}`} sub={currency} />
        <StatTile label="기대 가치" value={formatBP(expectation.expectedValue)} sub="BP (추정)" />
        <StatTile
          label="가치 / 가격"
          value={ratio === null ? '—' : `${ratio.toFixed(2)}배`}
          sub={ratio === null ? '캐시 상자' : ratio >= 1 ? '기대상 이득' : '기대상 손해'}
          tone={ratio === null ? 'neutral' : ratio >= 1 ? 'good' : 'bad'}
        />
      </div>

      <div className="overflow-x-auto border-t border-white/[0.06]">
        <table className="w-full text-left text-xs">
          <thead className="text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">등급</th>
              <th className="px-2 py-2 text-right font-medium">확률</th>
              <th className="px-2 py-2 text-right font-medium">1회 내 등장</th>
              <th className="px-2 py-2 text-right font-medium">풀 크기</th>
              <th className="px-4 py-2 text-right font-medium">평균 가치</th>
            </tr>
          </thead>
          <tbody>
            {expectation.tiers.map((tier) => (
              <tr key={tier.tierId} className="border-t border-white/[0.04]">
                <td className="px-4 py-2">
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: tier.color }}
                    />
                    <span className="text-slate-200">{tier.label}</span>
                  </span>
                </td>
                <td className="num px-2 py-2 text-right font-semibold text-slate-100">
                  {formatPercent(tier.probability, 3)}
                </td>
                <td className="num px-2 py-2 text-right text-slate-400">
                  {formatPercent(tier.atLeastOnce, 2)}
                </td>
                <td className="num px-2 py-2 text-right text-slate-500">
                  {formatNumber(tier.poolSize)}장
                </td>
                <td className="num px-4 py-2 text-right text-neon-lime">
                  {formatBP(tier.averageValue)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="flex items-start gap-1.5 border-t border-white/[0.06] px-4 py-3 text-[10px] leading-relaxed text-slate-500">
        <Info size={11} className="mt-0.5 shrink-0" />
        <span>
          위 확률은 <b className="text-slate-400">이 프로젝트가 정의한 샘플 값</b>입니다. 실제 FC 온라인의
          확률은 게임 내 &lsquo;확률 공개&rsquo; 페이지에 공시되며 Open API 로 제공되지 않습니다. 실제
          값을 쓰려면 <code className="text-slate-400">src/lib/pack/boxes.ts</code> 만 교체하세요.
        </span>
      </p>
    </Card>
  );
}
