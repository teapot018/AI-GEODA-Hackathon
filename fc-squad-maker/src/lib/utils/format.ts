const BP_UNITS: Array<[number, string]> = [
  [1_0000_0000, '억'],
  [1_0000, '만'],
];

/** 1234567 -> "123만 4,567" 처럼 한국식으로 축약 */
export function formatBP(value: number): string {
  if (!Number.isFinite(value)) return '-';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  for (const [unit, label] of BP_UNITS) {
    if (abs >= unit) {
      const head = Math.floor(abs / unit);
      const tail = abs % unit;
      if (tail === 0) return `${sign}${head.toLocaleString('ko-KR')}${label}`;
      const tailStr =
        label === '억'
          ? `${Math.floor(tail / 1_0000).toLocaleString('ko-KR')}만`
          : tail.toLocaleString('ko-KR');
      return `${sign}${head.toLocaleString('ko-KR')}${label} ${tailStr}`;
    }
  }
  return `${sign}${abs.toLocaleString('ko-KR')}`;
}

export function formatNumber(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '-';
  return value.toLocaleString('ko-KR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** 0.0042 -> "0.42%" */
export function formatPercent(ratio: number, digits = 2): string {
  if (!Number.isFinite(ratio)) return '-';
  return `${(ratio * 100).toFixed(digits)}%`;
}

/** Open API 의 "2024-06-01T12:34:56" 형태를 한국 표기로 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const date = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Seoul',
  }).format(date);
}

/** 경기 시간(분) -> "90'" */
export function formatMinutes(seconds: number): string {
  if (!Number.isFinite(seconds)) return '-';
  return `${Math.round(seconds / 60)}'`;
}
