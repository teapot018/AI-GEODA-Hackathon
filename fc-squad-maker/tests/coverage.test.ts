import { describe, expect, it } from 'vitest';

import { coverageNote } from '@/lib/nexon/coverage';

const full = { ok: true, truncated: false };
const cut = { ok: true, truncated: true };
const missing = { ok: false, truncated: false };

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

  it('문장은 마침표로 끝난다', () => {
    expect(coverageNote(missing, full)?.endsWith('.')).toBe(true);
  });
});
