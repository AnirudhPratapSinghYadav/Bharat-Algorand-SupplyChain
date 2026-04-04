import type { CSSProperties, ReactNode } from 'react';

type CardProps = {
  children: ReactNode;
  className?: string;
  padding?: 'md' | 'lg' | 'none';
  style?: CSSProperties;
};

export function Card({ children, className = '', padding = 'md', style }: CardProps) {
  const padClass = padding === 'none' ? 'nt-card--flush' : padding === 'lg' ? 'nt-card--lg' : 'nt-card--md';
  return (
    <div className={`nt-card ${padClass} ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}
