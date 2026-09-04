import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ENHANCE_TEAMCOLOR_COUNTS,
  ENHANCE_TEAMCOLOR_TIERS,
  ENHANCE_TEAMCOLOR_VERIFIED,
  ENHANCEMENT_OVR_BONUS,
  MAX_ENHANCEMENT,
} from '@/lib/fconline/rules';
import { GRADE_VALUE_MULTIPLIER } from '@/lib/players/value';
import { MAX_ESTIMATED_OVR, MIN_ESTIMATED_OVR } from '@/lib/players/seasons';

/**
 * ── 데모와 본 앱이 같은 게임을 말하는가 ───────────────────
 *
 * `demo/index.html` 은 **파일 하나로 도는** 것이 존재 이유라 빌드도
 * import 도 없다. 그래서 게임 규칙을 복사해 들고 있다.
 *
 * demo/README.md 는 "두 판은 같은 로직을 공유합니다" 라고 적어 두었는데,
 * 그 말을 지키는 장치가 없었다. 한쪽만 고쳐지면 데모는 조용히 옛 게임을
 * 말하게 된다 — 실제로 이 저장소에는 강화 상한이 +10 에서 멈춰 있던
 * 시절이 있었고, 그때 두 판이 서로 다른 상한을 알고 있었다.
 *
 * 복사 자체를 없앨 수는 없다(그러면 파일 하나가 아니게 된다). 대신
 * **어긋나는 것을 막는다.** 여기서 데모의 상수를 읽어 본 앱과 맞대 본다.
 */

const html = readFileSync(resolve(__dirname, '../../demo/index.html'), 'utf8');

/** `const NAME = ...;` 한 줄에서 값 부분을 떼어 온다. */
function literal(name: string): string {
  const match = new RegExp(`const\\s+${name}\\s*=\\s*([^;]+);`).exec(html);
  if (!match) throw new Error(`데모에서 ${name} 을 찾지 못했다`);
  return match[1].trim();
}

const numberArray = (name: string): number[] =>
  JSON.parse(literal(name).replace(/\s+/g, ''));

describe('데모 ↔ 본 앱 규칙 일치', () => {
  it('강화 상한이 같다', () => {
    expect(Number(literal('MAX_GRADE'))).toBe(MAX_ENHANCEMENT);
  });

  it('강화 누적 오버롤 상승표가 같다', () => {
    /*
     * ENHANCEMENT_OVR_BONUS 는 1-based(인덱스 = 강화 단계)이고 데모의
     * OVR_GAIN 은 0-based 라, 앞의 빈 칸을 떼고 맞댄다.
     */
    const app = Array.from({ length: MAX_ENHANCEMENT }, (_, i) => ENHANCEMENT_OVR_BONUS[i + 1]);
    expect(numberArray('OVR_GAIN')).toEqual(app);
  });

  it('강화 단계별 가치 배수가 같다', () => {
    expect(numberArray('GRADE_MUL')).toEqual([...GRADE_VALUE_MULTIPLIER]);
  });

  it('오버롤 표기 범위가 같다', () => {
    // 데모는 `const MIN_OVR = 60, MAX_OVR = 155;` 처럼 한 줄에 둘을 적는다.
    const line = /const\s+MIN_OVR\s*=\s*(\d+)\s*,\s*MAX_OVR\s*=\s*(\d+)\s*;/.exec(html);
    expect(line, '데모에서 OVR 범위를 찾지 못했다').not.toBeNull();
    expect(Number(line![1])).toBe(MIN_ESTIMATED_OVR);
    expect(Number(line![2])).toBe(MAX_ESTIMATED_OVR);
  });

  it('가치 곡선의 pivot 이 같다', () => {
    /*
     * pivot 은 카드 오버롤 표기와 함께 움직여야 한다. 한쪽만 올리면
     * 지수가 커져 +1 카드 하나가 수백억 BP 로 튄다 — 실제로 겪은 일이라
     * 두 판이 같은 값을 쓰는지 확인한다.
     */
    const demoPivot = /Math\.max\(0,\s*ovr\s*-\s*(\d+)\)/.exec(html);
    const appPivot = /const pivot = (\d+);/.exec(
      readFileSync(resolve(__dirname, '../src/lib/players/value.ts'), 'utf8'),
    );
    expect(demoPivot, '데모에서 pivot 을 찾지 못했다').not.toBeNull();
    expect(appPivot, '본 앱에서 pivot 을 찾지 못했다').not.toBeNull();
    expect(demoPivot![1]).toBe(appPivot![1]);
  });

  it('강화 팀컬러(물결) 표가 같다', () => {
    const tiers = literal('WAVE_TIERS');
    for (const tier of ENHANCE_TEAMCOLOR_TIERS) {
      expect(tiers, `${tier.name} 이(가) 데모에 없다`).toContain(tier.name);
      expect(tiers).toContain(`minGrade:${tier.minGrade}`);
      expect(tiers).toContain(`at5:${tier.bonusAt5}`);
      expect(tiers).toContain(`at8:${tier.bonusAt8}`);
    }
  });

  it('물결 인원 조건이 같다', () => {
    const counts = literal('WAVE_COUNTS').replace(/\s/g, '');
    expect(counts).toContain(`t1:${ENHANCE_TEAMCOLOR_COUNTS.tier1}`);
    expect(counts).toContain(`t2:${ENHANCE_TEAMCOLOR_COUNTS.tier2}`);
  });

  it('물결이 미검증이라는 사실도 같이 복사돼 있다', () => {
    /*
     * 값만 맞고 "확인 못 했다" 는 사실이 빠지면, 데모는 같은 숫자를
     * 더 센 말투로 말하게 된다. 그게 이 프로젝트가 제일 피하려는 것이다.
     */
    expect(literal('WAVE_VERIFIED')).toBe(String(ENHANCE_TEAMCOLOR_VERIFIED));
    expect(ENHANCE_TEAMCOLOR_VERIFIED).toBe(false);
  });

  it('데모가 +10 을 상한처럼 적어 두지 않았다', () => {
    // 예전에 두 판이 서로 다른 상한을 알고 있던 흔적이 남아 있는지.
    expect(html).not.toMatch(/\+1\s*~\s*\+10\b/);
    expect(html).not.toMatch(/const\s+MAX_GRADE\s*=\s*10\b/);
  });
});
