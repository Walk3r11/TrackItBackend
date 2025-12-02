type SparklineProps = {
  data: { label: string; value: number }[];
  className?: string;
};

export function Sparkline({ data, className }: SparklineProps) {
  if (!data.length) return null;

  const max = Math.max(...data.map((point) => point.value), 1);
  const step = data.length > 1 ? 100 / (data.length - 1) : 100;

  const points = data.map((point, index) => {
    const x = index * step;
    const y = 100 - (point.value / max) * 100;
    return { x, y };
  });

  const areaPath = [
    `M 0 100`,
    ...points.map((point) => `L ${point.x} ${point.y}`),
    `L 100 100 Z`
  ].join(" ");

  const linePoints = points.map((point) => `${point.x},${point.y}`).join(" ");

  const lastPoint = points[points.length - 1];

  return (
    <svg viewBox="0 0 100 110" className={className} preserveAspectRatio="none">
      <defs>
        <linearGradient id="sparklineGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4fd1c5" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#4fd1c5" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#sparklineGradient)" stroke="none" />
      <polyline
        points={linePoints}
        fill="none"
        stroke="#b0ff6d"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={lastPoint.x} cy={lastPoint.y} r="2.5" fill="#b0ff6d" />
    </svg>
  );
}
//vercel e hui