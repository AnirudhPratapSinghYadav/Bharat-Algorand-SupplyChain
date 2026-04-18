import './skeleton.css';

type Props = {
  height?: number;
  className?: string;
};

/** Shimmer placeholder for loading states (Phase 5). */
export function SkeletonCard({ height = 80, className = '' }: Props) {
  return <div className={`skeleton-block ${className}`.trim()} style={{ height }} aria-hidden />;
}
