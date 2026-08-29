import type { Metadata } from 'next';

import { BoxSimulator } from '@/components/pack/BoxSimulator';

export const metadata: Metadata = {
  title: '모의 상자 개봉',
  description: '확률 테이블 기반 가중 추첨으로 FC 온라인 상자 개봉을 시뮬레이션합니다.',
};

export default function PackPage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold text-slate-50">모의 상자 개봉</h1>
        <p className="mt-1 text-xs text-slate-500">
          실제 결제나 아이템 획득이 없는 <b className="text-slate-400">시뮬레이션</b>입니다. 확률과 기대값을
          열기 전에 모두 공개하며, 추첨은 서버에서 처리해 결과를 시드로 재현할 수 있습니다.
        </p>
      </header>
      <BoxSimulator />
    </div>
  );
}
