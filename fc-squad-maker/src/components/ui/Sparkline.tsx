'use client';

/**
 * 의존성 없는 초소형 라인 차트.
 *
 * 차트 라이브러리를 하나 더 얹을 만큼 복잡한 그림이 아니라서
 * viewBox 안에 polyline 하나로 그린다. preserveAspectRatio 를 끄면
 * 컨테이너 너비에 맞춰 자유롭게 늘어난다.
 */
export function Sparkline({
  values,
  width = 120,
  height = 28,
  stroke = '#22e1ff',
  fill = true,
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: boolean;
  className?: string;
}) {
  if (values.length === 0) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  // 값이 전부 같으면 0으로 나누게 되므로 가운데 높이로 눕힌다.
  const y = (value: number) =>
    span === 0 ? height / 2 : height - ((value - min) / span) * (height - 2) - 1;
  const x = (index: number) =>
    values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;

  const points = values.map((value, index) => `${x(index)},${y(value)}`).join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      role="img"
      aria-label={`추이 그래프 (최저 ${min}, 최고 ${max})`}
    >
      {fill ? (
        <polygon
          points={`0,${height} ${points} ${width},${height}`}
          fill={stroke}
          fillOpacity={0.12}
        />
      ) : null}
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
