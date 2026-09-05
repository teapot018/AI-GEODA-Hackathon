import type { Metadata } from 'next';

import { CardPriceSearch } from '@/components/market/CardPriceSearch';
import { MarketObservatory } from '@/components/market/MarketObservatory';

export const metadata: Metadata = {
  title: '거래 관측소',
  description:
    '넥슨 Open API 로 조회 가능한 이적시장 거래 기록을 모아 카드별 가격대·변동폭·추세를 관측합니다. 시장 전수 데이터가 아닙니다.',
};

export default function MarketPage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold text-slate-50">거래 관측소</h1>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          넥슨 Open API 는 현재 이적시장 매물을 제공하지 않습니다. 대신 API 로{' '}
          <b className="text-slate-400">조회 가능한 거래 기록</b>을 과거까지 모아 카드별 가격대를
          관측합니다 — 시장 전체의 전수 거래가 아니라 표본입니다. 크롤링 없이 공식 API 만 사용합니다.
        </p>
      </header>
      {/*
        선수 이름 검색을 위에 둔다. 사람이 먼저 떠올리는 질문이 "이 선수 얼마야"
        쪽이고, 아래 구단주 조회는 그 답을 채우는 표본 공급원이다.
      */}
      <CardPriceSearch />
      <MarketObservatory />
    </div>
  );
}
