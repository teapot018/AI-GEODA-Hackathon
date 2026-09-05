/**
 * ══════════════════════════════════════════════════════════
 *  규칙의 출처 장부
 * ══════════════════════════════════════════════════════════
 *
 * rules.ts 에는 "게임이 이렇다" 는 숫자들이 들어 있다. 각 숫자가 어디서
 * 왔고 우리가 그걸 **직접 확인했는지**는 그동안 주석에만 있었다.
 * 주석은 검사할 수 없고, 시간이 지나면 값만 바뀌고 주석은 남는다.
 *
 * 이 파일은 그 주장들을 한 곳에 모아 기계가 볼 수 있게 만든다. 목적은
 * 두 가지다.
 *
 *  1. **확인 안 한 것을 확인한 것처럼 두지 않는다.** 지금 이 저장소에서
 *     `verifiedAt` 이 채워진 항목은 하나도 없다. 이 개발 환경은 넥슨
 *     도메인이 이그레스 정책에 막혀 있어(CONNECT 403) 원문을 한 번도
 *     열지 못했다. 우회하지 않고, 못 했다고 적는다.
 *
 *  2. **다음 사람에게 확인할 목록을 남긴다.** 넥슨에 닿을 수 있는
 *     환경에서 이 표를 위에서부터 훑으면 무엇을 대조해야 하는지가
 *     그대로 할 일 목록이 된다.
 *
 * 여기 URL 을 적어 둔 것은 자동으로 긁으라는 뜻이 아니다. 사람이 열어
 * 보라는 뜻이다 — 공식 문서를 확인하지 않고 규칙을 확정하지 않기 위한
 * 표지이지, 크롤러의 시작점이 아니다.
 */

export type SourceKind =
  /** 넥슨 Open API 개발자 문서 */
  | 'openapi-docs'
  /** 넥슨 공지·패치노트 */
  | 'notice'
  /** 데이터센터 웹 페이지 */
  | 'datacenter'
  /** 게임 클라이언트 화면 */
  | 'in-game'
  /** 커뮤니티 정리글 — 여러 곳이 일치해도 공식이 되지는 않는다 */
  | 'community'
  /** 이 프로젝트가 계산으로 도출 */
  | 'derived';

export interface SourceRef {
  kind: SourceKind;
  /** 사람이 열어 볼 자리 */
  where: string;
}

export interface RuleClaim {
  /** 무엇에 대한 주장인가 */
  what: string;
  /** rules.ts 등에서 이 주장을 담고 있는 이름 */
  symbol: string;
  source: SourceRef;
  /**
   * 우리가 원문을 열어 대조한 날 (YYYY-MM-DD). 대조 못 했으면 null.
   *
   * **null 을 부끄러워하지 않는다.** 날짜를 채우는 유일한 조건은
   * 사람이 실제로 그 자리를 열어 값을 맞춰 본 것이다.
   */
  verifiedAt: string | null;
  /** 게임에 이 규칙이 적용된 날. 모르면 null. */
  effectiveDate: string | null;
  /** 확인 못 했다면 왜 */
  blockedBy?: string;
  note?: string;
}

/** 이 환경에서 넥슨 도메인이 막혀 있다는 사실 — 같은 말을 여러 번 적지 않는다. */
export const EGRESS_BLOCKED =
  '이 개발 환경의 이그레스 정책이 넥슨 도메인을 막는다 (CONNECT 403). 우회하지 않는다.';

export const RULE_CLAIMS: readonly RuleClaim[] = [
  {
    what: '강화 상한 +13',
    symbol: 'MAX_ENHANCEMENT',
    source: { kind: 'notice', where: 'FC 온라인 공지 — 강화 단계 확장 안내' },
    verifiedAt: null,
    effectiveDate: null,
    blockedBy: EGRESS_BLOCKED,
    note: '+11~+13 이 추가되기 전 코드가 +10 을 상한으로 알고 있었다. 상한이 다시 바뀌면 여기부터 확인한다.',
  },
  {
    what: '강화 단계별 누적 오버롤 상승표',
    symbol: 'ENHANCEMENT_OVR_BONUS',
    source: { kind: 'in-game', where: '게임 내 강화 화면의 단계별 능력치 표기' },
    verifiedAt: null,
    effectiveDate: null,
    blockedBy: EGRESS_BLOCKED,
  },
  {
    what: '이적시장 판매 수수료 40%',
    symbol: 'BASE_TRADE_FEE_RATE',
    source: { kind: 'in-game', where: '이적시장 판매 등록 화면의 수수료 표기' },
    verifiedAt: null,
    effectiveDate: null,
    blockedBy: EGRESS_BLOCKED,
    note: '실수령 비율(PC방 72%, PC방+TOP 80%)과 앞뒤가 맞는 것까지는 확인했다. 다만 그건 자체 정합성이지 원문 대조가 아니다.',
  },
  {
    what: '수수료 감면은 곱이 아니라 합 (PC방 30% + TOP CLASS 20%)',
    symbol: 'FEE_DISCOUNT',
    source: { kind: 'in-game', where: '이적시장 판매 등록 화면의 감면 표기' },
    verifiedAt: null,
    effectiveDate: null,
    blockedBy: EGRESS_BLOCKED,
  },
  {
    what: '수수료 끝수 처리 방식 (내림/반올림/올림)',
    symbol: 'FEE_ROUNDING',
    source: { kind: 'in-game', where: '판매 결과 화면의 실수령액과 대조' },
    verifiedAt: null,
    effectiveDate: null,
    blockedBy: EGRESS_BLOCKED,
    note: '반올림은 고른 값이지 확인한 값이 아니다. 어긋나 봐야 1 BP 지만, 고른 것과 확인한 것을 섞지 않는다.',
  },
  {
    what: '즉시 판매에는 이적시장 수수료가 붙지 않는다',
    symbol: 'PATH_HAS_MARKET_FEE',
    source: { kind: 'in-game', where: '즉시 판매 확인 창의 수령 금액' },
    verifiedAt: null,
    effectiveDate: null,
    blockedBy: EGRESS_BLOCKED,
    note: '즉시 판매 가격 자체는 우리가 계산하지 않는다 — 공식이 공개된 적 없다.',
  },
  {
    what: '강화 팀컬러(물결) 단계·인원 조건과 보너스',
    symbol: 'ENHANCE_TEAMCOLOR_TIERS',
    source: { kind: 'community', where: '여러 커뮤니티 정리글' },
    verifiedAt: null,
    effectiveDate: null,
    blockedBy: EGRESS_BLOCKED,
    note: '여러 곳이 일치해도 공식이 되지는 않는다. 그래서 점수에 더하지 않고 화면에만 띄운다.',
  },
  {
    what: 'Open API 는 매시 정각 갱신하며 2시간 전 데이터를 준다',
    symbol: 'OPEN_API_UPDATE',
    source: { kind: 'openapi-docs', where: 'https://openapi.nexon.com/game/fconline/ 의 갱신 주기 안내' },
    verifiedAt: null,
    effectiveDate: null,
    blockedBy: EGRESS_BLOCKED,
  },
  {
    what: '데이터센터 기준가 순위는 하루 한 번 00~01시에 갱신된다',
    symbol: 'BASELINE_RANK_UPDATE',
    source: { kind: 'datacenter', where: 'https://fconline.nexon.com/datacenter 안내 문구' },
    verifiedAt: null,
    effectiveDate: null,
    blockedBy: EGRESS_BLOCKED,
    note: '기준가 집계 주기와 다른 것이다. 이 프로젝트는 순위를 읽지 않는다.',
  },
  {
    what: '데이터센터 기준가 페이지의 HTML 구조 (파서가 무엇을 잡는가)',
    symbol: 'PARSER_VERIFIED',
    source: { kind: 'datacenter', where: 'https://fconline.nexon.com/DataCenter/PlayerInfo' },
    verifiedAt: null,
    effectiveDate: null,
    blockedBy: EGRESS_BLOCKED,
    note: 'HTML 을 한 번도 열지 못했다. 파서가 값을 뽑아도 그게 가격이라는 보장이 없다 — npm run probe:datacenter 로 확인한다.',
  },
  {
    what: '선수팩 상자 확률',
    symbol: 'PACK_BOXES',
    source: { kind: 'notice', where: '넥슨 확률형 아이템 확률 공개 페이지' },
    verifiedAt: null,
    effectiveDate: null,
    blockedBy: EGRESS_BLOCKED,
    note: '지금 상자들은 공식 확률이 아니라 모의값이다(probabilitySource: project-sample).',
  },
];

/** 아직 원문을 대조하지 못한 주장들 — 넥슨에 닿는 환경에서의 할 일 목록. */
export function unverifiedClaims(): readonly RuleClaim[] {
  return RULE_CLAIMS.filter((claim) => claim.verifiedAt === null);
}
