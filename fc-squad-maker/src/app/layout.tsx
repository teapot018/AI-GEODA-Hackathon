import type { Metadata, Viewport } from 'next';

import { SiteHeader } from '@/components/layout/SiteHeader';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'FC 스쿼드 메이커',
    template: '%s · FC 스쿼드 메이커',
  },
  description:
    '넥슨 FC 온라인 Open API 기반 구단주 조회 · 선수 검색 · 스쿼드 빌더 · 모의 상자 개봉 시뮬레이터',
};

export const viewport: Viewport = {
  themeColor: '#06090f',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-dvh app-backdrop">
        <SiteHeader />
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-7xl px-4 pb-10 pt-4">
          <p className="text-[11px] leading-relaxed text-slate-600">
            본 서비스는 넥슨 FC 온라인 Open API 를 이용한 비공식 팬 프로젝트입니다. 능력치·오버롤·가치·상자
            확률은 공개 API 에 없는 항목이라 자체 추정 모델과 샘플 확률표를 사용하며, 실제 게임 내 수치와
            다를 수 있습니다. 상자 개봉은 <strong className="text-slate-500">시뮬레이션</strong>이며 실제
            결제나 아이템 획득과 무관합니다.
          </p>
        </footer>
      </body>
    </html>
  );
}
