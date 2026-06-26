interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  radius?: string | number;
  className?: string;
}

export function Skeleton({ width, height = 16, radius = 'var(--hydro-radius-md)', className = '' }: SkeletonProps) {
  return (
    <div
      className={className}
      style={{
        width,
        height,
        borderRadius: radius,
        background: `linear-gradient(90deg, var(--hydro-surface-muted) 25%, var(--hydro-surface-tint) 50%, var(--hydro-surface-muted) 75%)`,
        backgroundSize: '200% 100%',
        animation: 'hydro-shimmer 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite',
      }}
    />
  );
}

interface SkeletonGroupProps {
  lines?: number;
  widths?: (string | number)[];
  gap?: number;
  className?: string;
}

export function SkeletonGroup({ lines = 3, widths, gap = 8, className = '' }: SkeletonGroupProps) {
  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          width={widths?.[i] ?? (i === lines - 1 ? '60%' : '100%')}
        />
      ))}
    </div>
  );
}
