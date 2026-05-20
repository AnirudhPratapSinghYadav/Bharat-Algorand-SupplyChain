import { useEffect, useRef } from 'react';

/** Renders a QR code for a Lora URL (canvas, no external CDN). */
export function CertificateQr({ url, size = 96 }: { url: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const QR = await import('qrcode');
        if (cancelled || !canvasRef.current) return;
        await QR.toCanvas(canvasRef.current, url, {
          width: size,
          margin: 1,
          color: { dark: '#0f172a', light: '#ffffff' },
        });
      } catch {
        /* optional dependency missing at build time */
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [url, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ borderRadius: 6, border: '1px solid var(--border)', background: '#fff' }}
      aria-label="QR code for certificate link"
    />
  );
}
