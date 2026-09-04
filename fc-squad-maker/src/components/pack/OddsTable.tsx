'use client';

import { Info } from 'lucide-react';

import { Badge, Card, CardHeader, DataLayerTag, Skeleton, StatTile } from '@/components/ui';
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
        title={expectation.officialOdds ? '공시 확률 및 기대값' : '표본 확률 및 기대값'}
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
        <StatTile
          label="기대 가치"
          value={formatBP(expectation.expectedValue)}
          sub="BP"
          layer="project-estimate"
        />
        <StatTile
          label="가치 / 가격"
          value={ratio === null ? '—' : `${ratio.toFixed(2)}배`}
          sub={ratio === null ? '캐시 상자' : ratio >= 1 ? '기대상 이득' : '기대상 손해'}
          layer="project-estimate"
          tone={ratio === null ? 'neutral' : ratio >= 1 ? 'good' : 'bad'}
        />
      </div>

      <div className="overflow-x-auto border-t border-white/[0.06]">
        <table className="w-full text-left text-xs">
          <thead className="text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">등급</th>
              <th className="px-2 py-2 text-right font-medium">확률</th>
              <th className="px-2 py-2 text-right font-medium">출처</th>
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
                {/*
                  줄마다 적는다. 상자 단위로 한 번만 적으면, 나중에 공시표를
                  일부만 옮겨 넣었을 때 어느 줄이 공식이고 어느 줄이 표본인지
                  화면에서 구별되지 않는다.
                */}
                <td className="px-2 py-2 text-right">
                  <DataLayerTag
                    layer={tier.probabilitySource === 'official' ? 'official-rule' : 'project-estimate'}
                  >
                    {tier.probabilitySource === 'official' ? '공시' : '표본'}
                  </DataLayerTag>
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
          이 상자는 <b className="text-slate-400">FC 온라인 확률표를 참고해 만든 모의 상자</b>이지 실제
          상품이 아닙니다 — 이름·가격·확률 모두 이 프로젝트가 정했습니다. 실제 확률은 게임 내
          &lsquo;확률 공개&rsquo; 페이지에 공시되며 Open API 로는 제공되지 않아 가져올 방법이
          없습니다. 공시 값을 쓰려면 <code className="text-slate-400">src/lib/pack/boxes.ts</code> 의
          확률과 <code className="text-slate-400">probabilitySource</code> 를 같이 고치세요.
          <br />
          기대 가치는 이 프로젝트의 가치 모델(추정)로 낸 값이고, 기대값이 가격보다 낮게 잡혀 있는
          것도 <b className="text-slate-400">상자를 설계하며 건 가정</b>이지 실제 상품이 그렇다는
          뜻이 아닙니다.
        </span>
      </p>
    </Card>
  );
}
