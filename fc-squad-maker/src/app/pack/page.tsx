import type { Metadata } from 'next';

import { BoxSimulator } from '@/components/pack/BoxSimulator';

export const metadata: Metadata = {
  title: '모의 상자 개봉',
  description:
    'FC 온라인 확률표를 참고해 만든 모의 상자를 가중 추첨으로 열어 봅니다. 실제 상품이 아닙니다.',
};

export default function PackPage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold text-slate-50">모의 상자 개봉</h1>
        <p className="mt-1 text-xs text-slate-500">
          실제 결제나 아이템 획득이 없는 <b className="text-slate-400">시뮬레이션</b>입니다. 여기 상자는
          FC 온라인 확률표를 참고해 만든 <b className="text-slate-400">모의 상자</b>이며, 이름·가격·확률
          모두 이 프로젝트가 정한 값이라 실제 상품과 다릅니다. 확률과 기대값을 열기 전에 모두
          공개하며, 추첨은 서버에서 처리해 결과를 시드로 재현할 수 있습니다.
        </p>
      </header>
      <BoxSimulator />
    </div>
  );
}
