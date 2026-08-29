import type { Metadata } from 'next';

import { UserSearch } from '@/components/manager/UserSearch';

export const metadata: Metadata = {
  title: '구단주 조회',
  description: '닉네임으로 FC 온라인 구단주의 OUID, 레벨, 최고 등급, 매치 기록, 거래 내역을 조회합니다.',
};

export default function ManagerPage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold text-slate-50">구단주 조회</h1>
        <p className="mt-1 text-xs text-slate-500">
          닉네임 → OUID → 계정 정보 순으로 조회합니다. 모든 호출은 서버 프록시(/api/manager)를 거치므로
          API 키가 브라우저에 노출되지 않습니다.
        </p>
      </header>
      <UserSearch />
    </div>
  );
}
