import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { RULE_CLAIMS, unverifiedClaims, EGRESS_BLOCKED } from '@/lib/fconline/sources';

/**
 * 출처 장부 검사.
 *
 * 이 파일이 지키는 것은 값이 아니라 **정직함**이다. 확인 안 한 것을
 * 확인한 것처럼 두지 않았는가, 장부에 적힌 이름이 실제로 코드에 있는가.
 */

describe('RULE_CLAIMS', () => {
  it('비어 있지 않다', () => {
    expect(RULE_CLAIMS.length).toBeGreaterThan(5);
  });

  it('장부에 적힌 이름이 실제 코드에 있다', () => {
    /*
     * 장부가 코드와 어긋나면 최악이다 — 확인했다고 적힌 규칙이 정작
     * 코드에는 없거나, 이름만 바뀌어 다른 값을 가리키게 된다.
     */
    const haystack = [
      'src/lib/fconline/rules.ts',
      'src/lib/trade/calculator.ts',
      'src/lib/market/datacenter.ts',
      'src/lib/pack/boxes.ts',
    ]
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');

    for (const claim of RULE_CLAIMS) {
      expect(haystack, `${claim.symbol} 이(가) 코드에 없다`).toContain(claim.symbol);
    }
  });

  it('같은 규칙을 두 번 적지 않는다', () => {
    const symbols = RULE_CLAIMS.map((c) => c.symbol);
    expect(new Set(symbols).size).toBe(symbols.length);
  });

  it('확인 못 한 주장에는 그 이유가 적혀 있다', () => {
    for (const claim of unverifiedClaims()) {
      expect(claim.blockedBy, `${claim.symbol} 에 이유가 없다`).toBeTruthy();
    }
  });

  it('확인한 날이 있으면 이유 칸은 비어 있어야 한다', () => {
    // "확인했는데 막혀서 못 했다" 는 앞뒤가 맞지 않는다.
    for (const claim of RULE_CLAIMS) {
      if (claim.verifiedAt !== null) {
        expect(claim.blockedBy, `${claim.symbol} 가 확인됐다면서 막혔다고도 적혀 있다`).toBeUndefined();
      }
    }
  });

  it('verifiedAt 은 날짜 꼴이거나 null 이다', () => {
    for (const claim of RULE_CLAIMS) {
      if (claim.verifiedAt !== null) {
        expect(claim.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it('지금 이 저장소에서는 원문을 대조한 규칙이 하나도 없다', () => {
    /*
     * 부끄러운 사실이 아니라 **기록해야 하는 사실**이다. 이 개발 환경은
     * 넥슨 도메인이 막혀 있어 원문을 한 번도 열지 못했다. 우회하지 않고,
     * 못 했다고 적는다.
     *
     * 넥슨에 닿는 환경에서 실제로 대조하고 verifiedAt 을 채우는 날,
     * 이 테스트가 깨진다. 그때 이 기대값을 지우면 된다 — 테스트가 깨지는
     * 것이 곧 "이제 확인된 규칙이 생겼다" 는 신호다.
     */
    expect(unverifiedClaims()).toHaveLength(RULE_CLAIMS.length);
    expect(EGRESS_BLOCKED).toContain('403');
  });

  it('커뮤니티 출처는 공식으로 승격되지 않는다', () => {
    // 여러 곳이 일치해도 공식이 되지 않는다. 물결이 그 예다.
    const community = RULE_CLAIMS.filter((c) => c.source.kind === 'community');
    expect(community.length).toBeGreaterThan(0);
    for (const claim of community) {
      expect(claim.verifiedAt).toBeNull();
    }
  });
});
