'use client';

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

import { cn } from '@/lib/utils/cn';
import { DATA_LAYER, type DataLayer } from '@/lib/data/provenance';

/* ── Button ───────────────────────────────────────────────── */

type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-neon-cyan text-pitch-950 font-semibold hover:bg-cyan-300 active:bg-cyan-400 disabled:bg-pitch-600 disabled:text-slate-400',
  ghost: 'bg-white/5 text-slate-200 hover:bg-white/10 disabled:text-slate-500',
  outline:
    'border border-white/15 text-slate-200 hover:border-neon-cyan/60 hover:text-neon-cyan disabled:opacity-40',
  danger: 'bg-neon-rose/90 text-white hover:bg-neon-rose disabled:opacity-40',
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon-cyan',
        'disabled:cursor-not-allowed',
        BUTTON_VARIANT[variant],
        BUTTON_SIZE[size],
        className,
      )}
      {...props}
    />
  );
}

/* ── Card ─────────────────────────────────────────────────── */

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('card-surface', className)}>{children}</div>;
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-wide text-slate-100">{title}</h2>
        {description ? <p className="mt-1 text-xs text-slate-400">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/* ── Badge ────────────────────────────────────────────────── */

type BadgeTone = 'neutral' | 'cyan' | 'lime' | 'amber' | 'rose' | 'violet';

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: 'bg-white/8 text-slate-300 border-white/10',
  cyan: 'bg-neon-cyan/10 text-neon-cyan border-neon-cyan/30',
  lime: 'bg-neon-lime/10 text-neon-lime border-neon-lime/30',
  amber: 'bg-neon-amber/10 text-neon-amber border-neon-amber/30',
  rose: 'bg-neon-rose/10 text-neon-rose border-neon-rose/30',
  violet: 'bg-neon-violet/10 text-neon-violet border-neon-violet/30',
};

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-4',
        BADGE_TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * 이 숫자가 **어느 계층에서 왔는지** 밝히는 태그.
 *
 * 화면에는 공식 API 값, 공식 규칙, 우리가 모은 관측, 우리가 지어낸 추정이
 * 나란히 뜬다. 표시가 없으면 넷 다 "게임에서 온 값" 으로 읽히고, 사람은
 * 우리 추정치로 실제 거래를 한다(data/provenance.ts 주석 참고).
 *
 * 색점만 두지 않고 글자를 같이 둔다 — 색으로만 구분하면 색각 이상이 있는
 * 사용자에게는 아무 정보도 아니다.
 */
const LAYER_TONE: Readonly<Record<DataLayer, BadgeTone>> = {
  'official-api': 'lime',
  'official-rule': 'cyan',
  observed: 'violet',
  estimated: 'neutral',
};

export function DataLayerTag({
  layer,
  className,
  children,
}: {
  layer: DataLayer;
  className?: string;
  /** 계층 이름 대신 쓸 말 (예: '추정 OVR'). 툴팁은 그대로 유지된다 */
  children?: ReactNode;
}) {
  const info = DATA_LAYER[layer];
  return (
    <Badge tone={LAYER_TONE[layer]} className={cn('whitespace-nowrap', className)}>
      <span title={info.description}>
        {info.dot} {children ?? info.label}
      </span>
    </Badge>
  );
}

/** 데이터 출처 표시 — 실데이터인지 데모인지 항상 밝힌다. */
export function SourceBadge({ source, note }: { source?: string; note?: string }) {
  if (!source || source === 'nexon') {
    return (
      <Badge tone="lime" className="whitespace-nowrap">
        넥슨 API
      </Badge>
    );
  }
  return (
    <Badge tone="amber" className="whitespace-nowrap" >
      <span title={note}>데모 데이터</span>
    </Badge>
  );
}

/* ── Form ─────────────────────────────────────────────────── */

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-xl border border-white/10 bg-pitch-900/80 px-3 text-sm text-slate-100',
        'placeholder:text-slate-500 focus:border-neon-cyan/60 focus:outline-none focus:ring-1 focus:ring-neon-cyan/40',
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-10 w-full rounded-xl border border-white/10 bg-pitch-900/80 px-3 text-sm text-slate-100',
        'focus:border-neon-cyan/60 focus:outline-none focus:ring-1 focus:ring-neon-cyan/40',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

/* ── 상태 표시 ────────────────────────────────────────────── */

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="불러오는 중"
      className={cn(
        'inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-neon-cyan',
        className,
      )}
    />
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {icon ? <div className="mb-1 text-slate-600">{icon}</div> : null}
      <p className="text-sm font-medium text-slate-300">{title}</p>
      {description ? <p className="max-w-sm text-xs text-slate-500">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-neon-rose/30 bg-neon-rose/10 px-4 py-3 text-xs text-rose-200">
      {message}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-white/[0.06]', className)} />;
}

/* ── 스탯 바 ──────────────────────────────────────────────── */

function statColor(value: number): string {
  if (value >= 90) return '#22e1ff';
  if (value >= 80) return '#c6ff3d';
  if (value >= 70) return '#ffc542';
  return '#8b98ab';
}

export function StatBar({
  label,
  value,
  max = 110,
  compact = false,
}: {
  label: string;
  value: number;
  max?: number;
  compact?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={cn('flex items-center gap-2', compact ? 'text-[10px]' : 'text-xs')}>
      <span className="w-10 shrink-0 text-slate-400">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%`, backgroundColor: statColor(value) }}
        />
      </div>
      <span className="num w-7 shrink-0 text-right font-semibold text-slate-200">{value}</span>
    </div>
  );
}

/* ── 수치 타일 ────────────────────────────────────────────── */

export function StatTile({
  label,
  value,
  sub,
  tone = 'neutral',
  layer,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'neutral' | 'good' | 'bad';
  /**
   * 이 숫자가 어느 계층에서 왔는지. 지정하면 라벨 옆에 색점이 붙는다.
   *
   * 생략은 "표시할 필요가 없다"(예: 우리가 센 건수)는 뜻이지 "공식"이라는
   * 뜻이 아니다 — 추정값 타일에는 반드시 넣는다.
   */
  layer?: DataLayer;
}) {
  const valueTone =
    tone === 'good' ? 'text-neon-lime' : tone === 'bad' ? 'text-neon-rose' : 'text-slate-100';
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500">
        {label}
        {layer ? (
          <span title={DATA_LAYER[layer].description} className="cursor-help not-italic">
            {DATA_LAYER[layer].dot}
          </span>
        ) : null}
      </p>
      <p className={cn('num mt-0.5 text-lg font-bold leading-tight', valueTone)}>{value}</p>
      {sub ? <p className="mt-0.5 text-[10px] text-slate-500">{sub}</p> : null}
    </div>
  );
}
