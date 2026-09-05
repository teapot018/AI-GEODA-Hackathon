import type { Metadata } from 'next';

import { SquadBuilder } from '@/components/squad/SquadBuilder';

export const metadata: Metadata = {
  title: '스쿼드 메이커',
  description: '초성 검색으로 선수를 찾아 포메이션에 배치하고 강화 단계별 오버롤과 가치를 시뮬레이션합니다.',
};

export default function SquadPage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold text-slate-50">스쿼드 메이커</h1>
        <p className="mt-1 text-xs text-slate-500">
          카드를 피치로 드래그하거나, 빈 자리를 클릭한 뒤 검색 결과에서 선수를 고르세요. 배치한 스쿼드는
          브라우저에 저장됩니다.
        </p>
      </header>
      <SquadBuilder />
    </div>
  );
}
