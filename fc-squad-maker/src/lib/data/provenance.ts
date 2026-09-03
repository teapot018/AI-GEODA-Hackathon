/**
 * ══════════════════════════════════════════════════════════
 *  데이터 출처 계층
 * ══════════════════════════════════════════════════════════
 *
 * 이 프로젝트의 화면에는 성격이 전혀 다른 네 종류의 숫자가 나란히 뜬다.
 *
 *   손흥민  OVR 121   가치 1,240만 BP   +5 관측가 980만 BP   +5 시 OVR +6
 *
 * 이 한 줄에서 121 은 우리가 시즌·포지션으로 **추정**한 값이고,
 * 1,240만은 우리 가치 모델이 **지어낸** 값이며, 980만은 우리가 실제로
 * **관측한** 거래가고, +6 은 넥슨이 정한 **공식 규칙**이다. 넷 다 그냥
 * 검은 배경에 흰 숫자로 뜨면 보는 사람은 전부 "게임에서 온 값" 으로
 * 읽는다 — 그리고 우리 추정치로 실제 거래를 한다.
 *
 * 그래서 숫자 옆에 어디서 왔는지를 붙인다. 계층은 넷뿐이고, 여기서만
 * 정의한다. 화면마다 "추정", "예상", "약", "*" 처럼 제각각 표시하면
 * 어느 것이 같은 뜻인지 아무도 모른다.
 */

export type DataLayer =
  /** A — 넥슨 Open API 가 응답으로 준 값. 우리가 만지지 않았다. */
  | 'official-api'
  /** B — 넥슨이 공지·공개한 게임 규칙 (fconline/rules.ts) */
  | 'official-rule'
  /** 우리가 API 응답을 모아 **관측**한 것. 사실이되 표본이다. */
  | 'observed'
  /** C — 이 프로젝트가 만들어 낸 추정. 게임의 값이 아니다. */
  | 'estimated';

export interface DataLayerInfo {
  /** 배지에 쓰는 짧은 말 */
  label: string;
  /** 색점. 배지가 흑백으로 인쇄돼도 label 만으로 구분되게 짧게 유지한다 */
  dot: string;
  /** 툴팁 — 이게 무슨 뜻인지 한 문장 */
  description: string;
}

export const DATA_LAYER: Readonly<Record<DataLayer, DataLayerInfo>> = {
  'official-api': {
    label: '공식 API',
    dot: '🟢',
    description: '넥슨 Open API 응답값을 그대로 표시합니다.',
  },
  'official-rule': {
    label: '공식 규칙',
    dot: '🔵',
    description: '넥슨이 공지·공개한 게임 규칙입니다.',
  },
  observed: {
    label: '관측 표본',
    dot: '🟡',
    description:
      'Open API 로 조회 가능한 거래 기록을 누적한 표본입니다. 시장 전수 데이터가 아닙니다.',
  },
  estimated: {
    label: '프로젝트 추정',
    dot: '⚪',
    description:
      '이 프로젝트가 자체 모델로 계산한 값입니다. 게임의 공식 수치가 아니며 실제와 다를 수 있습니다.',
  },
};

/** 화면 밖(문서·로그)에서 한 줄로 쓸 때 */
export function layerLine(layer: DataLayer): string {
  const info = DATA_LAYER[layer];
  return `${info.dot} ${info.label} — ${info.description}`;
}
