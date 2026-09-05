'use client';

import { PlayerCard } from '@/components/squad/PlayerCard';
import { Badge } from '@/components/ui';
import type { PulledCard } from '@/lib/pack/simulator';
import { formatBP } from '@/lib/utils/format';

/** 개봉 결과 카드들. 등급이 높을수록 늦게, 화려하게 등장한다. */
export function PackResultGrid({ cards }: { cards: PulledCard[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] justify-items-center gap-3">
      {cards.map((pulled, index) => (
        <div
          key={`${pulled.card.spid}-${index}`}
          className="animate-card-reveal"
          style={{ animationDelay: `${Math.min(index * 90, 900)}ms` }}
        >
          <div className="relative">
            {pulled.rarity >= 4 ? (
              <span
                className="pointer-events-none absolute inset-0 -z-10 rounded-xl blur-xl"
                style={{ backgroundColor: `${pulled.tierColor}55` }}
              />
            ) : null}
            <PlayerCard card={pulled.card} grade={pulled.grade} size="md" showValue />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1">
            <span
              className="rounded px-1.5 py-0.5 text-[9px] font-bold text-pitch-950"
              style={{ backgroundColor: pulled.tierColor }}
            >
              {pulled.tierLabel}
            </span>
            {/*
              '천장' 만 띄우면 게임의 공식 제도처럼 읽힌다. 이건 이
              시뮬레이터가 넣은 규칙이다(boxes.ts PITY_IS_PROJECT_RULE).
            */}
            {pulled.fromPity ? (
              <Badge tone="violet">
                <span title="이 시뮬레이터의 규칙입니다. FC 온라인의 공식 천장 제도가 아닙니다.">
                  천장 (모의)
                </span>
              </Badge>
            ) : null}
          </div>
          <p className="num mt-0.5 text-center text-[10px] text-slate-500">
            {formatBP(pulled.value)} BP
          </p>
        </div>
      ))}
    </div>
  );
}
