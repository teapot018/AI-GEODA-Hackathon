'use client';

import { ArrowDownRight, ArrowUpRight, Info, Wallet } from 'lucide-react';

import { Badge, Card, CardHeader, EmptyState, Spinner, StatTile } from '@/components/ui';
import type { AssetSnapshot } from '@/lib/nexon/service';
import { formatBP, formatDateTime } from '@/lib/utils/format';

/**
 * 구단 자산 패널.
 *
 * 솔직한 한계: 넥슨 Open API 는 **보유 BP/캐시 잔액을 제공하지 않는다.**
 * 제공되는 건 이적시장 거래 내역(구매/판매)뿐이라, 여기서는 최근 거래
 * 기록으로 "자금 흐름"을 계산해 자산 상황을 간접적으로 보여준다.
 */
export function AssetPanel({
  snapshot,
  loading,
}: {
  snapshot: AssetSnapshot | null;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-1.5">
            <Wallet size={14} className="text-neon-lime" /> 구단 자금 흐름
          </span>
        }
        description="최근 이적시장 거래 기준"
        action={
          <span
            className="inline-flex items-center gap-1 text-[10px] text-slate-500"
            title="넥슨 Open API 는 보유 BP/캐시 잔액을 제공하지 않습니다. 거래 내역으로 계산한 값입니다."
          >
            <Info size={11} /> 잔액 아님
          </span>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-xs text-slate-400">
          <Spinner /> 거래 내역 불러오는 중…
        </div>
      ) : !snapshot || snapshot.recent.length === 0 ? (
        <EmptyState
          title="거래 내역이 없습니다"
          description="최근 이적시장에서 사고판 기록이 없거나, 공개 설정이 꺼져 있습니다."
        />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 p-4">
            <StatTile
              label="매입 총액"
              value={formatBP(snapshot.buyTotal)}
              sub={`${snapshot.buyCount}건`}
              tone="bad"
            />
            <StatTile
              label="매도 총액"
              value={formatBP(snapshot.sellTotal)}
              sub={`${snapshot.sellCount}건`}
              tone="good"
            />
            <StatTile
              label="순손익"
              value={`${snapshot.net >= 0 ? '+' : ''}${formatBP(snapshot.net)}`}
              sub="매도 − 매입"
              tone={snapshot.net >= 0 ? 'good' : 'bad'}
            />
          </div>

          <div className="max-h-80 overflow-y-auto border-t border-white/[0.06]">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-pitch-850/95 text-[10px] uppercase tracking-wider text-slate-500 backdrop-blur">
                <tr>
                  <th className="px-4 py-2 font-medium">선수</th>
                  <th className="px-2 py-2 font-medium">시즌</th>
                  <th className="px-2 py-2 text-center font-medium">강화</th>
                  <th className="px-2 py-2 text-right font-medium">거래가</th>
                  <th className="px-4 py-2 text-right font-medium">일시</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.recent.map((row) => (
                  <tr
                    key={`${row.saleSn}-${row.tradeDate}-${row.spid}`}
                    className="border-t border-white/[0.04] hover:bg-white/[0.02]"
                  >
                    <td className="px-4 py-2 font-medium text-slate-200">
                      <span className="flex items-center gap-1.5">
                        {row.ovr > 0 ? (
                          <span className="num rounded bg-white/[0.06] px-1 text-[10px] text-slate-400">
                            {row.ovr}
                          </span>
                        ) : null}
                        <span className="truncate">{row.name}</span>
                      </span>
                    </td>
                    <td className="max-w-[8rem] truncate px-2 py-2 text-slate-500">
                      {row.seasonName.split(' ')[0]}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {row.grade > 1 ? (
                        <Badge tone="amber">+{row.grade}</Badge>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                    <td className="num px-2 py-2 text-right font-semibold text-slate-100">
                      {formatBP(row.value)}
                    </td>
                    <td className="px-4 py-2 text-right text-[10px] text-slate-500">
                      {formatDateTime(row.tradeDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="flex items-start gap-1.5 border-t border-white/[0.06] px-4 py-3 text-[10px] leading-relaxed text-slate-500">
            <ArrowUpRight size={11} className="mt-0.5 shrink-0 text-neon-lime" />
            <span>
              매도는 자금 유입, <ArrowDownRight size={11} className="inline text-neon-rose" /> 매입은
              유출입니다. 순손익이 곧 현재 보유 BP 는 아닙니다.
            </span>
          </p>
        </>
      )}
    </Card>
  );
}
