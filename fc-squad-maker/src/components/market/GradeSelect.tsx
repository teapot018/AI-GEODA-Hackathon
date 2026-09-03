'use client';

import { ENHANCEMENT_STEPS } from '@/lib/fconline/rules';
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

/*
 * 단계 목록은 공식 규칙에서 읽는다. 여기 배열을 따로 적어 두면 게임에
 * 단계가 추가될 때(실제로 +11~+13 이 그렇게 추가됐다) 화면만 옛 게임에
 * 머문다. ALL_GRADES 는 '등급 무관' 센티넬이라 이름을 나눠 둔다.
 */

interface Props {
  /** 지금 고른 등급. null 이면 전체 */
  value: number | null;
  onChange: (grade: number | null) => void;
  /**
   * 표본이 실제로 있는 등급들. 버튼을 숨기는 데 쓰지 않고 **표시**에만 쓴다 —
   * 아래 주석 참고.
   */
  available: number[];
  className?: string;
}

export function GradeSelect({ value, onChange, available, className }: Props) {
  const hasSamples = new Set(available);

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <span className="text-[10px] text-slate-500">강화 등급</span>

      {/*
        +1 ~ +13 을 전부 띄운다. 표본이 있는 등급만 보여 주려다 보니, 풀에
        +1 과 +4 밖에 없으면 "+7 은 얼마지?" 를 물어볼 방법 자체가 사라졌다.
        게임에는 +13 까지 있고 사람은 그 기준으로 생각하므로 선택지는 그대로
        두고, 표본이 없는 등급은 눌렀을 때 '관측 없음' 으로 답한다 —
        고를 수 없게 막는 것과 골랐더니 없다고 말해 주는 것은 다르다.

        표본이 있는 등급에는 점을 찍어, 누르기 전에도 어디에 데이터가 있는지
        보이게 한다.
      */}
      {ENHANCEMENT_STEPS.map((grade) => (
        <button
          key={grade}
          type="button"
          title={hasSamples.has(grade) ? `+${grade} 체결 표본 있음` : `+${grade} 관측 표본 없음`}
          onClick={() => onChange(grade)}
          className={cn(
            'relative rounded-lg border px-2 py-1 text-[11px] font-medium tabular-nums transition-colors',
            value === grade
              ? 'border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan'
              : hasSamples.has(grade)
                ? 'border-white/10 text-slate-300 hover:border-white/20 hover:text-slate-100'
                : 'border-white/[0.06] text-slate-600 hover:border-white/15 hover:text-slate-400',
          )}
        >
          +{grade}
          {hasSamples.has(grade) ? (
            <span className="absolute right-1 top-1 h-1 w-1 rounded-full bg-neon-lime" />
          ) : null}
        </button>
      ))}

      <button
        type="button"
        onClick={() => onChange(ALL_GRADES)}
        title="등급을 가리지 않고 합칩니다. +1 과 고강화가 한 숫자에 섞이므로 특정 등급의 가격으로 읽으면 안 됩니다."
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

/**
 * 등급이 섞인 표를 보고 있을 때 띄우는 경고. 문구를 한 곳에 둔다.
 *
 * 한때 이 경고는 "넓어 보이는 폭은 전부 등급 때문" 이라고 단정했다.
 * 그건 우리가 아는 것보다 많이 말한 것이다 — 섞인 표만 봐서는 폭의
 * 얼마가 등급 차이고 얼마가 실제 가격 변동인지 가를 수 없다. 아는 것은
 * "이 숫자로는 가를 수 없다" 까지고, 딱 거기까지 적는다.
 */
export function MixedGradeWarning({ className }: { className?: string }) {
  return (
    <p className={cn('text-[10px] leading-relaxed text-amber-300/80', className)}>
      지금은 <b>등급을 가리지 않은</b> 값입니다. +1 과 고강화 관측이 한 중앙값에 섞여 있어 어느
      등급의 가격도 아닙니다. 넓어 보이는 흥정 범위 중 얼마가 등급 차이고 얼마가 실제 가격
      변동인지는 <b>이 숫자만으로 가를 수 없습니다</b> — 값을 쓰려면 등급을 하나 고르세요.
    </p>
  );
}
