import Link from 'next/link';
import { ArrowRight, Box, LayoutGrid, Search, ShieldCheck, TerminalSquare } from 'lucide-react';

import { hasApiKey } from '@/lib/env';

const FEATURES = [
  {
    href: '/manager',
    icon: Search,
    title: '구단주 조회',
    description:
      '닉네임으로 OUID 를 찾아 레벨, 역대 최고 등급, 최근 매치 기록, 이적시장 거래 내역까지 한 화면에서 봅니다.',
    points: ['닉네임 → OUID → 계정 정보', '매치 상세 출전 명단', '거래 기반 자금 흐름'],
  },
  {
    href: '/squad',
    icon: LayoutGrid,
    title: '스쿼드 메이커',
    description:
      '초성 검색으로 선수를 찾아 6가지 포메이션에 드래그 배치하고, 강화 단계별 오버롤과 가치를 시뮬레이션합니다.',
    points: ['초성 검색 (ㅅㅎㅁ → 손흥민)', '드래그 & 클릭 배치', '+1~+10 강화 곡선'],
  },
  {
    href: '/pack',
    icon: Box,
    title: '모의 상자 개봉',
    description:
      '확률 테이블 기반 가중 추첨을 서버에서 돌리고, 개봉 연출과 함께 회수율·등급 분포를 누적 집계합니다.',
    points: ['확률·기대값 사전 공개', '천장(pity) 지원', '시드로 결과 재현'],
  },
];

export default function HomePage() {
  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-gradient-to-br from-neon-cyan/[0.09] via-pitch-900 to-pitch-950 px-6 py-12 sm:px-10 sm:py-16">
        <span className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-neon-cyan/10 blur-3xl" />
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neon-cyan">
          Nexon FC Online Open API
        </p>
        <h1 className="mt-3 max-w-2xl text-3xl font-black leading-tight text-slate-50 sm:text-4xl">
          구단주 조회부터 스쿼드 빌드,
          <br />
          모의 상자 개봉까지 한 번에
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-400">
          넥슨 공식 Open API 를 서버 프록시로 안전하게 호출하고, 공개 API 에 없는 능력치·가치·확률은
          교체 가능한 로컬 모델로 채운 FC 온라인 팬 서비스입니다.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/squad"
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-neon-cyan px-5 text-sm font-semibold text-pitch-950 transition-colors hover:bg-cyan-300"
          >
            스쿼드 만들기 <ArrowRight size={16} />
          </Link>
          <Link
            href="/manager"
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/15 px-5 text-sm font-semibold text-slate-200 transition-colors hover:border-neon-cyan/50 hover:text-neon-cyan"
          >
            구단주 검색
          </Link>
        </div>

        {!hasApiKey ? (
          <div className="mt-6 inline-flex max-w-xl items-start gap-2 rounded-xl border border-neon-amber/30 bg-neon-amber/10 px-4 py-3 text-xs leading-relaxed text-amber-200">
            <TerminalSquare size={14} className="mt-0.5 shrink-0" />
            <span>
              <b>데모 모드로 실행 중입니다.</b> <code>.env.local</code> 에{' '}
              <code>NX_API_KEY</code> 를 넣으면 실제 넥슨 데이터로 전환됩니다. 지금은 결정적으로
              생성된 목업 데이터가 표시됩니다.
            </span>
          </div>
        ) : (
          <div className="mt-6 inline-flex items-center gap-2 rounded-xl border border-neon-lime/30 bg-neon-lime/10 px-4 py-2.5 text-xs font-medium text-lime-200">
            <ShieldCheck size={14} /> 넥슨 Open API 키가 설정되어 있습니다.
          </div>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {FEATURES.map(({ href, icon: Icon, title, description, points }) => (
          <Link
            key={href}
            href={href}
            className="card-surface group flex flex-col p-5 transition-all hover:-translate-y-0.5 hover:border-neon-cyan/40 hover:shadow-glow"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-neon-cyan/10 text-neon-cyan">
              <Icon size={18} />
            </span>
            <h2 className="mt-3 text-base font-bold text-slate-100">{title}</h2>
            <p className="mt-1.5 flex-1 text-xs leading-relaxed text-slate-400">{description}</p>
            <ul className="mt-3 space-y-1">
              {points.map((point) => (
                <li key={point} className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  <span className="h-1 w-1 rounded-full bg-neon-cyan" />
                  {point}
                </li>
              ))}
            </ul>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-neon-cyan opacity-0 transition-opacity group-hover:opacity-100">
              바로가기 <ArrowRight size={13} />
            </span>
          </Link>
        ))}
      </section>

      <section className="card-surface p-5">
        <h2 className="text-sm font-bold text-slate-100">데이터 출처를 구분해서 보여줍니다</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-neon-lime/20 bg-neon-lime/[0.04] p-3">
            <p className="text-xs font-semibold text-neon-lime">넥슨 공식 API</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
              OUID·닉네임·레벨·최고 등급·매치 기록·매치 상세·거래 내역, 그리고 선수 카드 목록(spid)과
              시즌 메타.
            </p>
          </div>
          <div className="rounded-xl border border-neon-amber/20 bg-neon-amber/[0.04] p-3">
            <p className="text-xs font-semibold text-neon-amber">자체 추정 모델</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
              능력치·오버롤·BP 가치·강화 상승폭·팀컬러. 공개 API 에 없는 항목이라 로컬 데이터셋과 추정
              공식으로 채웠습니다.
            </p>
          </div>
          <div className="rounded-xl border border-neon-violet/20 bg-neon-violet/[0.04] p-3">
            <p className="text-xs font-semibold text-neon-violet">샘플 확률표</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
              상자 확률은 이 프로젝트가 정한 샘플 값입니다. 실제 공시 확률로 교체하려면 파일 하나만
              바꾸면 됩니다.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
