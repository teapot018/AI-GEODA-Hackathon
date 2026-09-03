'use client';

import { cn } from '@/lib/utils/cn';

/**
 * 강화 등급 선택기.
 *
 * ── 왜 등급을 고르게 하는가 ──
 * +1 카드와 +6 카드는 이름만 같지 다른 물건이다. 게임 안에서 +6은 +1의 몇
 * 배에 거래되는데, 둘을 한 통에 넣고 낸 중앙값은 어느 쪽 시세도 아니다.
 * 흥정 범위(사분위)는 더 나쁘다 — 등급 차이가 그대로 범위로 잡혀서, 실제로는
 * 좁은 시세를 폭이 몇 배인 것처럼 보여 준다.
 *
 * 그래서 기본값을 '전체'가 아니라 **+1** 로 둔다. 거래가 가장 많이 도는
 * 등급이고, 게임 안에서도 값을 말할 때의 기준점이다.
 *
 * '전체'를 남겨 둔 이유는 카드가 어떤 등급으로 돌고 있는지 훑어볼 때 쓸모가
 * 있어서다. 다만 그건 '이 카드의 시세'가 아니라 '이 카드의 거래 전반'이라
 * 라벨과 도움말에서 그렇게 부른다.
 */

/** 등급을 가리지 않는 모드 */
export const ALL_GRADES = null;

interface Props {
  /** 지금 고른 등급. null 이면 전체 */
  value: number | null;
  onChange: (grade: number | null) => void;
  /**
   * 표본에 실제로 있는 등급들. 비어 있으면 +1 만 보여 준다 —
   * 표본도 없는 +9 를 눌러 놓고 빈 표를 보게 만들 이유가 없다.
   */
  available: number[];
  className?: string;
}

export function GradeSelect({ value, onChange, available, className }: Props) {
  const grades = available.length > 0 ? available : [1];

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <span className="text-[10px] text-slate-500">강화 등급</span>

      {grades.map((grade) => (
        <button
          key={grade}
          type="button"
          onClick={() => onChange(grade)}
          className={cn(
            'rounded-lg border px-2 py-1 text-[11px] font-medium tabular-nums transition-colors',
            value === grade
              ? 'border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan'
              : 'border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200',
          )}
        >
          +{grade}
        </button>
      ))}

      <button
        type="button"
        onClick={() => onChange(ALL_GRADES)}
        title="등급을 가리지 않고 합칩니다. +1 과 고강화가 한 숫자에 섞이므로 시세로 읽으면 안 됩니다."
        className={cn(
          'rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors',
          value === ALL_GRADES
            ? 'border-amber-400/40 bg-amber-400/10 text-amber-300'
            : 'border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-200',
        )}
      >
        전체
      </button>
    </div>
  );
}

/** 등급이 섞인 표를 보고 있을 때 띄우는 경고. 문구를 한 곳에 둔다. */
export function MixedGradeWarning({ className }: { className?: string }) {
  return (
    <p className={cn('text-[10px] leading-relaxed text-amber-300/80', className)}>
      지금은 <b>등급을 가리지 않은</b> 값입니다. +1 과 고강화 체결이 한 중앙값에 섞여 있어
      어느 등급의 시세도 아닙니다 — 흥정 범위도 등급 차이만큼 넓어 보입니다. 값을 쓰려면 등급을
      하나 고르세요.
    </p>
  );
}
