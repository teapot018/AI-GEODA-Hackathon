import { describe, expect, it } from 'vitest';

import { coverageNote } from '@/lib/nexon/coverage';

const full = { ok: true, truncated: false, shiftedRows: 0, droppedRows: 0 };
const cut = { ok: true, truncated: true, shiftedRows: 0, droppedRows: 0 };
const missing = { ok: false, truncated: false, shiftedRows: 0, droppedRows: 0 };
/** 페이지를 넘기는 사이 새 거래가 들어와 목록이 밀린 경우 */
const shifted = { ok: true, truncated: false, shiftedRows: 7, droppedRows: 0 };
/** 넥슨이 예상과 다른 모양의 행을 섞어 보낸 경우 */
const malformed = { ok: true, truncated: false, shiftedRows: 0, droppedRows: 4 };

describe('coverageNote', () => {
  it('둘 다 온전하면 붙일 말이 없다', () => {
    expect(coverageNote(full, full)).toBeUndefined();
  });

  it('매입이 빠지면 매도만으로 냈다고 밝힌다', () => {
    expect(coverageNote(missing, full)).toContain('매입 내역을 받지 못해');
  });

  it('매도가 빠지면 매입만으로 냈다고 밝힌다', () => {
    expect(coverageNote(full, missing)).toContain('매도 내역을 받지 못해');
  });

  it('페이지가 잘리면 표본이 적다고 밝힌다', () => {
    expect(coverageNote(cut, full)).toContain('일부 페이지');
    expect(coverageNote(full, cut)).toContain('일부 페이지');
  });

  it('한쪽이 통째로 빠졌으면 "일부 페이지" 를 덧붙이지 않는다', () => {
    // 매입이 아예 없는데 "일부 페이지가 빠졌다" 까지 붙으면 무엇이
    // 부족한지 흐려진다. 남은 쪽이 잘렸을 때만 따로 말한다.
    const note = coverageNote(missing, full);
    expect(note).not.toContain('일부 페이지');
  });

  it('한쪽이 빠지고 남은 쪽도 잘리면 둘 다 밝힌다', () => {
    const note = coverageNote(missing, cut);
    expect(note).toContain('매입 내역을 받지 못해');
    expect(note).toContain('남은 쪽도 일부 페이지');
  });

  it('목록이 밀리면 겹친 건수와 그 결과를 밝힌다', () => {
    const note = coverageNote(shifted, full);
    expect(note).toContain('목록이 밀렸습니다');
    expect(note).toContain('7건');
    // 밀림은 '누락' 이 아니라 '덜 깊이 봤다' 다. 거래 내역은 앞쪽에만
    // 쌓이므로 밀려도 사이가 비지 않는다 — 문구가 그 둘을 뒤섞으면 안 된다.
    expect(note).toContain('덜 내려갔습니다');
    expect(note).not.toContain('받지 못해');
  });

  it('양쪽이 밀리면 건수를 합쳐 말한다', () => {
    expect(coverageNote(shifted, shifted)).toContain('14건');
  });

  it('받지 못한 쪽의 밀림은 세지 않는다', () => {
    // ok:false 면 그 방향은 아예 못 읽은 것이라 셀 겹침도 없다.
    expect(coverageNote({ ok: false, truncated: false, shiftedRows: 5, droppedRows: 0 }, full)).not.toContain(
      '목록이 밀렸습니다',
    );
  });

  it('모양이 다른 행을 버렸으면 몇 건인지 밝힌다', () => {
    /*
     * 조용히 줄어드는 표본이 제일 위험하다. 응답 형식이 바뀌어 절반이
     * 버려지고 있어도, 말하지 않으면 화면은 그냥 "표본이 적네" 로 보인다.
     */
    const note = coverageNote(malformed, full);
    expect(note).toContain('4건');
    expect(note).toContain('예상과 다른 형태');
  });

  it('밀림과 형식 오류는 서로 다른 말로 적는다', () => {
    // 하나는 "그 사이 거래가 있었다", 하나는 "응답이 이상하다" 다.
    const note = coverageNote({ ...malformed, shiftedRows: 2 }, full);
    expect(note).toContain('목록이 밀렸습니다');
    expect(note).toContain('예상과 다른 형태');
  });

  it('문장은 마침표로 끝난다', () => {
    expect(coverageNote(missing, full)?.endsWith('.')).toBe(true);
  });
});
