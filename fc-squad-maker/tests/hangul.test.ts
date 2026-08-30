import { describe, expect, it } from 'vitest';
import {
  CHOSEONG,
  choseongKey,
  isChoseongOnly,
  matchScore,
  normalize,
  toChoseong,
} from '@/lib/utils/hangul';

/**
 * 초성 검색은 이 서비스에서 사용자가 가장 먼저 만지는 기능이라
 * 조용히 깨지면 바로 티가 난다. 유니코드 산술을 직접 하고 있으므로
 * 경계값(가/힣, 종성 유무, 쌍자음)을 못 박아 둔다.
 */
describe('toChoseong — 완성형 한글에서 초성 뽑기', () => {
  it('종성이 있든 없든 초성만 남긴다', () => {
    expect(toChoseong('손흥민')).toBe('ㅅㅎㅁ');
    expect(toChoseong('호날두')).toBe('ㅎㄴㄷ');
    expect(toChoseong('음바페')).toBe('ㅇㅂㅍ');
  });

  it('한글 음절 블록의 양 끝을 정확히 처리한다', () => {
    expect(toChoseong('가')).toBe('ㄱ'); // U+AC00, 블록의 첫 글자
    expect(toChoseong('힣')).toBe('ㅎ'); // U+D7A3, 블록의 마지막 글자
  });

  it('19개 초성 전부를 왕복시킨다', () => {
    // 각 초성 + 중성 'ㅏ' + 종성 없음 = 0xAC00 + i*21*28
    CHOSEONG.forEach((cho, i) => {
      const syllable = String.fromCharCode(0xac00 + i * 21 * 28);
      expect(toChoseong(syllable)).toBe(cho);
    });
  });

  it('한글이 아닌 문자는 소문자로 그대로 통과시킨다', () => {
    expect(toChoseong('Messi')).toBe('messi');
    expect(toChoseong('손Son')).toBe('ㅅson');
    expect(toChoseong('7번')).toBe('7ㅂ');
  });
});

describe('isChoseongOnly — 질의가 초성뿐인지', () => {
  it('자음만 있으면 참', () => {
    expect(isChoseongOnly('ㅅㅎㅁ')).toBe(true);
    expect(isChoseongOnly('ㄲㅅ')).toBe(true); // 쌍자음도 초성으로 인정
    expect(isChoseongOnly('ㅅ ㅎ ㅁ')).toBe(true); // 공백은 무시
  });

  it('완성형 한글이나 영문이 섞이면 거짓', () => {
    expect(isChoseongOnly('손흥민')).toBe(false);
    expect(isChoseongOnly('ㅅ흥민')).toBe(false);
    expect(isChoseongOnly('messi')).toBe(false);
    expect(isChoseongOnly('')).toBe(false);
    expect(isChoseongOnly('   ')).toBe(false);
  });

  it('모음만 있는 질의는 초성 질의가 아니다', () => {
    expect(isChoseongOnly('ㅏㅑ')).toBe(false);
  });
});

describe('normalize / choseongKey', () => {
  it('공백과 흔한 구분 기호를 지운다', () => {
    expect(normalize('De  Bruyne')).toBe('debruyne');
    expect(normalize("O'Neill")).toBe('oneill');
    expect(normalize('반 다이크')).toBe('반다이크');
    expect(normalize('음바페·로탱')).toBe('음바페로탱');
    expect(normalize('Alexander-Arnold')).toBe('alexanderarnold');
  });

  it('쌍자음을 단자음으로 접어 준다', () => {
    expect(choseongKey('낚시')).toBe('ㄴㅅ');
    expect(choseongKey('뚜껑')).toBe('ㄷㄱ');
    expect(choseongKey('쌍용')).toBe('ㅅㅇ');
  });
});

describe('matchScore — 검색 순위 매기기', () => {
  it('완전 일치 > 접두 일치 > 부분 일치 순으로 점수가 높다', () => {
    const exact = matchScore('손흥민', '손흥민');
    const prefix = matchScore('손흥민', '손흥');
    const contains = matchScore('손흥민', '흥민');
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(contains);
    expect(contains).toBeGreaterThan(0);
  });

  it('초성 질의로도 같은 순위 구조가 유지된다', () => {
    expect(matchScore('손흥민', 'ㅅㅎㅁ')).toBe(100);
    expect(matchScore('손흥민', 'ㅅㅎ')).toBe(80);
    expect(matchScore('손흥민', 'ㅎㅁ')).toBe(55);
  });

  it('쌍자음으로 쳐도 단자음 이름을 찾는다', () => {
    expect(matchScore('강감찬', 'ㄲㄱㅊ')).toBeGreaterThan(0);
  });

  it('영문 이름은 대소문자와 공백을 무시하고 찾는다', () => {
    expect(matchScore('De Bruyne', 'debruyne')).toBe(100);
    expect(matchScore('De Bruyne', 'DE BRU')).toBe(85);
    expect(matchScore('De Bruyne', 'bruyne')).toBe(60);
  });

  it('관련 없는 질의는 0점', () => {
    expect(matchScore('손흥민', 'ㅁㅂㅍ')).toBe(0);
    expect(matchScore('손흥민', 'ronaldo')).toBe(0);
    expect(matchScore('손흥민', '')).toBe(0);
    expect(matchScore('손흥민', '   ')).toBe(0);
  });

  it('초성이 섞인 질의도 폴백 점수로 건진다', () => {
    // 'ㅅ흥민' 은 초성 전용 질의가 아니지만 초성 키 포함으로 걸린다.
    expect(matchScore('손흥민', 'ㅅㅎ민')).toBeGreaterThan(0);
  });
});
