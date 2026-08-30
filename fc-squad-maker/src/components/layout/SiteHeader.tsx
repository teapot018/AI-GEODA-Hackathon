'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Box, Calculator, LayoutGrid, Search, ShieldCheck, TriangleAlert } from 'lucide-react';

import { apiGet } from '@/lib/client/api';
import { cn } from '@/lib/utils/cn';

const NAV = [
  { href: '/manager', label: '구단주 조회', icon: Search },
  { href: '/squad', label: '스쿼드 메이커', icon: LayoutGrid },
  { href: '/pack', label: '모의 상자 개봉', icon: Box },
  { href: '/trade', label: '트레이드 계산기', icon: Calculator },
];

interface Health {
  apiKeyConfigured: boolean;
  metaSource: 'nexon' | 'demo';
  playerCount: number;
}

export function SiteHeader() {
  const pathname = usePathname();
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiGet<Health>('/api/health', controller.signal)
      .then((res) => setHealth(res.data))
      .catch(() => setHealth(null));
    return () => controller.abort();
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-pitch-950/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4">
        <Link href="/" className="mr-2 flex shrink-0 items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-neon-cyan text-sm font-black text-pitch-950">
            FC
          </span>
          <span className="hidden text-sm font-bold tracking-tight text-slate-100 sm:inline">
            SQUAD MAKER
          </span>
        </Link>

        <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                  active
                    ? 'bg-neon-cyan/10 text-neon-cyan'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
                )}
              >
                <Icon size={14} />
                {label}
              </Link>
            );
          })}
        </nav>

        {health ? (
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-medium',
              health.apiKeyConfigured && health.metaSource === 'nexon'
                ? 'border-neon-lime/30 bg-neon-lime/10 text-neon-lime'
                : 'border-neon-amber/30 bg-neon-amber/10 text-neon-amber',
            )}
            title={
              health.apiKeyConfigured
                ? `넥슨 API 연결됨 · 카드 ${health.playerCount.toLocaleString('ko-KR')}장`
                : 'NX_API_KEY 가 없어 데모 데이터로 동작 중입니다.'
            }
          >
            {health.apiKeyConfigured && health.metaSource === 'nexon' ? (
              <>
                <ShieldCheck size={12} /> API 연결됨
              </>
            ) : (
              <>
                <TriangleAlert size={12} /> 데모 모드
              </>
            )}
          </span>
        ) : null}
      </div>
    </header>
  );
}
