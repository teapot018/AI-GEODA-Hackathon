'use client';

import { useState } from 'react';

import { enhanceCard } from '@/lib/players/enhance';
import { seasonRule } from '@/lib/players/seasons';
import type { PlayerCardData } from '@/lib/players/types';
import { formatBP } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

/**
 * FC 온라인 스타일 선수 카드.
 *
 * 이미지는 넥슨 CDN 을 직접 참조한다. next/image 대신 <img> 를 쓰는 이유:
 * 넥슨 CDN 이 막힌 환경(사내망/오프라인)에서 next/image 최적화가 실패하면
 * 페이지 전체가 에러를 내지만, <img> + onError 는 이니셜 폴백으로 넘어간다.
 */

export type CardSize = 'xs' | 'sm' | 'md';

const SIZE_CLASS: Record<CardSize, string> = {
  xs: 'w-[68px] text-[9px]',
  sm: 'w-[92px] text-[10px]',
  md: 'w-[132px] text-xs',
};

const IMAGE_CLASS: Record<CardSize, string> = {
  xs: 'h-12',
  sm: 'h-16',
  md: 'h-24',
};

function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return trimmed.length <= 2 ? trimmed : trimmed.slice(0, 2);
}

export interface PlayerCardProps {
  card: PlayerCardData;
  grade?: number;
  size?: CardSize;
  /** 포지션 적합도 (0~1). 주면 카드 테두리에 반영 */
  fit?: number;
  showValue?: boolean;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

export function PlayerCard({
  card,
  grade = 1,
  size = 'md',
  fit,
  showValue = false,
  selected = false,
  onClick,
  className,
}: PlayerCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const tier = seasonRule(card.seasonName);
  const enhanced = enhanceCard(card, grade);

  const fitTone =
    fit === undefined
      ? 'border-white/10'
      : fit >= 0.94
        ? 'border-neon-lime/50'
        : fit >= 0.8
          ? 'border-neon-amber/50'
          : 'border-neon-rose/60';

  const Wrapper = onClick ? 'button' : 'div';

  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={`${card.name} · ${card.seasonName} · OVR ${enhanced.ovr}`}
      className={cn(
        'group relative overflow-hidden rounded-xl border bg-pitch-850 text-left shadow-card transition-all',
        SIZE_CLASS[size],
        fitTone,
        selected && 'ring-2 ring-neon-cyan ring-offset-2 ring-offset-pitch-950',
        onClick && 'hover:-translate-y-0.5 hover:shadow-glow focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon-cyan',
        className,
      )}
      style={{
        background: `linear-gradient(160deg, ${tier.color}1f 0%, rgba(14,21,34,0.96) 55%)`,
      }}
    >
      {/* 상단 등급 라인 */}
      <span className="absolute inset-x-0 top-0 h-[2px]" style={{ backgroundColor: tier.color }} />

      <div className="flex items-start justify-between px-1.5 pt-1.5">
        <div className="leading-none">
          <span className="num block text-[1.35em] font-black text-slate-50">{enhanced.ovr}</span>
          <span className="block font-semibold text-slate-400">{card.positions[0] ?? '-'}</span>
        </div>
        {grade > 1 ? (
          <span className="num rounded bg-neon-amber/20 px-1 font-bold text-neon-amber">
            +{grade}
          </span>
        ) : null}
      </div>

      <div className={cn('flex items-end justify-center px-1', IMAGE_CLASS[size])}>
        {imageFailed ? (
          <span className="mb-1 grid h-full w-full place-items-center rounded-lg bg-white/[0.04] text-[1.1em] font-bold text-slate-500">
            {initials(card.name)}
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
            className="h-full w-auto max-w-full object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.55)]"
          />
        )}
      </div>

      <div className="border-t border-white/[0.07] px-1.5 py-1">
        <p className="truncate font-bold text-slate-100">{card.name}</p>
        <p className="truncate text-[0.85em] text-slate-500">{card.seasonName.split(' ')[0]}</p>
        {showValue ? (
          <p className="num mt-0.5 truncate text-[0.85em] font-semibold text-neon-lime">
            {formatBP(enhanced.value)} BP
          </p>
        ) : null}
      </div>

      {/*
        오버롤·능력치는 **어느 경로로 왔든** 이 프로젝트가 만든 값이다.
        넥슨 Open API 는 카드 능력치를 주지 않는다. 한때 시드 프로필에는
        이 표시를 달지 않았는데, 그러면 손으로 적어 둔 표가 공식값처럼
        보였다 — 손으로 적었다고 공식이 되지 않는다.
      */}
      <span
        className="absolute bottom-1 right-1 rounded bg-black/50 px-1 text-[0.8em] text-slate-400"
        title={
          card.statSource === 'project-seed'
            ? '공개 API 에 능력치가 없어 이 프로젝트가 정리해 둔 프로필 값을 씁니다. 게임의 공식 수치가 아닙니다.'
            : '공개 API 에 능력치가 없어 포지션 기반으로 추정한 값입니다. 게임의 공식 수치가 아닙니다.'
        }
      >
        추정
      </span>
    </Wrapper>
  );
}
