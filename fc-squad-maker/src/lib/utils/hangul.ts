/**
 * 한글 초성 검색 유틸.
 *
 * 완성형 한글(가~힣)은 유니코드상 아래 규칙으로 배열되어 있다.
 *   code = 0xAC00 + (초성 * 21 + 중성) * 28 + 종성
 * 이 규칙을 역산해 초성만 뽑아내면 "ㅅㅇㄹㄷ" 같은 질의로 "손흥민"을 찾을 수 있다.
 */

const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;
const JUNG_COUNT = 21;
const JONG_COUNT = 28;

export const CHOSEONG = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ',
  'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
] as const;

/** 쌍자음을 단자음으로 접어 "ㄱㅅ"로 "낚시"까지 잡아준다. */
const COMPAT_FOLD: Record<string, string> = {
  ㄲ: 'ㄱ', ㄸ: 'ㄷ', ㅃ: 'ㅂ', ㅆ: 'ㅅ', ㅉ: 'ㅈ',
};

const CHOSEONG_SET = new Set<string>([...CHOSEONG, ...Object.keys(COMPAT_FOLD)]);

/** 문자열이 전부 초성(자음)으로만 이루어져 있는지. 공백은 무시한다. */
export function isChoseongOnly(query: string): boolean {
  const compact = query.replace(/\s+/g, '');
  if (!compact) return false;
  return [...compact].every((ch) => CHOSEONG_SET.has(ch));
}

/** "손흥민" -> "ㅅㅎㅁ". 한글이 아닌 문자는 소문자로 그대로 남긴다. */
export function toChoseong(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= HANGUL_BASE && code <= HANGUL_LAST) {
      const index = Math.floor((code - HANGUL_BASE) / (JUNG_COUNT * JONG_COUNT));
      out += CHOSEONG[index];
    } else {
      out += ch.toLowerCase();
    }
  }
  return out;
}

/** 검색 인덱스에 쓰는 정규화: 공백/기호 제거 + 소문자. */
export function normalize(text: string): string {
  return text.toLowerCase().replace(/[\s.'`·・-]/g, '');
}

/** 쌍자음 접기까지 적용한 초성 키. */
export function choseongKey(text: string): string {
  return [...toChoseong(normalize(text))]
    .map((ch) => COMPAT_FOLD[ch] ?? ch)
    .join('');
}

/**
 * 질의가 초성만이면 초성 키에, 아니면 정규화된 이름에 매칭한다.
 * 반환값은 매칭 점수(0이면 불일치, 클수록 좋은 매칭).
 */
export function matchScore(name: string, query: string): number {
  const q = normalize(query);
  if (!q) return 0;

  if (isChoseongOnly(query)) {
    const key = choseongKey(name);
    const qKey = [...q].map((ch) => COMPAT_FOLD[ch] ?? ch).join('');
    if (key === qKey) return 100;
    if (key.startsWith(qKey)) return 80;
    if (key.includes(qKey)) return 55;
    return 0;
  }

  const target = normalize(name);
  if (target === q) return 100;
  if (target.startsWith(q)) return 85;
  if (target.includes(q)) return 60;

  // 초성 혼용 질의("ㅅ흥민") 대비 폴백
  const key = choseongKey(name);
  if (key.includes(choseongKey(query))) return 30;
  return 0;
}
