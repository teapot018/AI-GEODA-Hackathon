/**
 * ══════════════════════════════════════════════════════════
 *  데이터 출처 계층
 * ══════════════════════════════════════════════════════════
 *
 * 이 프로젝트의 화면에는 성격이 전혀 다른 숫자가 나란히 뜬다.
 *
 *   손흥민  OVR 121   가치 1,240만 BP   +5 관측가 980만 BP   +5 시 OVR +6
 *
 * 이 한 줄에서 121 은 우리가 시즌·포지션으로 **추정**한 값이고,
 * 1,240만은 우리 가치 모델이 **지어낸** 값이며, 980만은 우리가 실제로
 * **관측한** 거래가고, +6 은 넥슨이 정한 **공식 규칙**이다. 넷 다 그냥
 * 검은 배경에 흰 숫자로 뜨면 보는 사람은 전부 "게임에서 온 값" 으로
 * 읽는다 — 그리고 우리 추정치로 실제 거래를 한다.
 *
 * 그래서 숫자 옆에 어디서 왔는지를 붙인다. 계층은 일곱뿐이고, 여기서만
 * 정의한다. 화면마다 "추정", "예상", "약", "*" 처럼 제각각 표시하면
 * 어느 것이 같은 뜻인지 아무도 모른다.
 *
 * ── 일곱으로 나눈 이유 ──
 * 한때 넷(공식 API / 공식 규칙 / 관측 / 추정)뿐이었는데, 그러면 갈 곳
 * 없는 값들이 '추정' 으로 몰렸다. 캐시 30분은 추정이 아니라 **우리가
 * 정한 정책**이고, 데모 카드는 추정이 아니라 **지어낸 표본**이며,
 * 검증 못 한 파서가 잡아 온 값은 추정도 관측도 아닌 **미검증**이다.
 * 세 가지를 '추정' 한 칸에 넣으면 그 칸이 아무 뜻도 없어진다.
 */

export type DataLayer =
  /** A — 넥슨 Open API 가 응답으로 준 값. 우리가 만지지 않았다. */
  | 'official-api'
  /** B — 넥슨이 공지·공개한 게임 규칙 (fconline/rules.ts) */
  | 'official-rule'
  /** C — 우리가 API 응답을 모아 **관측**한 것. 사실이되 표본이다. */
  | 'observation'
  /** D — 이 프로젝트가 만들어 낸 추정. 게임의 값이 아니다. */
  | 'project-estimate'
  /** E — 이 프로젝트가 정한 운영값(캐시·동시성·보관 기한 등) */
  | 'project-policy'
  /** F — 실데이터가 아닌 샘플. 실제 게임에 존재한다는 보장이 없다. */
  | 'demo'
  /**
   * 값은 나왔지만 **맞는지 확인하지 못한** 것.
   *
   * 추정과 다르다 — 추정은 우리가 계산했다고 밝히는 값이고, 이쪽은
   * 출처는 진짜인데 우리가 제대로 읽었는지를 모르는 값이다.
   * (예: 실제 페이지로 검증되지 않은 데이터센터 파서의 기준가)
   */
  | 'unverified';

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
  observation: {
    label: '관측 표본',
    dot: '🟡',
    description:
      'Open API 로 조회 가능한 거래 기록을 누적한 표본입니다. 시장 전수 데이터가 아닙니다.',
  },
  'project-estimate': {
    label: '프로젝트 추정',
    dot: '⚪',
    description:
      '이 프로젝트가 자체 모델로 계산한 값입니다. 게임의 공식 수치가 아니며 실제와 다를 수 있습니다.',
  },
  'project-policy': {
    label: '프로젝트 정책',
    dot: '🟣',
    description:
      '이 프로젝트가 정한 운영값입니다(캐시 시간·동시 요청 수·보관 기한 등). 넥슨이 정한 제한이 아닙니다.',
  },
  demo: {
    label: '데모 데이터',
    dot: '🟠',
    description:
      '실데이터가 아닌 샘플입니다. 실제 게임에 존재한다는 보장이 없습니다.',
  },
  unverified: {
    label: '미검증',
    dot: '🔴',
    description:
      '값은 받아 왔지만 우리가 제대로 읽었는지 확인하지 못했습니다. 다른 값일 수 있습니다.',
  },
};

/** 화면 밖(문서·로그)에서 한 줄로 쓸 때 */
export function layerLine(layer: DataLayer): string {
  const info = DATA_LAYER[layer];
  return `${info.dot} ${info.label} — ${info.description}`;
}

/**
 * 두 계층이 한 값에 섞였을 때, **약한 쪽**을 고른다.
 *
 * 예: 추정 기본 오버롤 + 공식 강화 상승분 = 추정. 강한 쪽으로 표기하면
 * 섞였다는 사실이 사라지고, 사용자는 전부 공식값으로 읽는다.
 * 아래로 갈수록 약하다.
 */
const STRENGTH: readonly DataLayer[] = [
  'official-api',
  'official-rule',
  'observation',
  'project-estimate',
  'project-policy',
  'demo',
  'unverified',
];

export function weakerLayer(a: DataLayer, b: DataLayer): DataLayer {
  return STRENGTH.indexOf(a) >= STRENGTH.indexOf(b) ? a : b;
}
