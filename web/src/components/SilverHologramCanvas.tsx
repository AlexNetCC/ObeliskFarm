import { useEffect, useRef } from "react";
import { createSilverHologramGL } from "../shaders/runSilverHologram";

/**
 * Canvas overlay that runs the silver hologram WebGL shader.
 * Sizes to its container (e.g. collapse header); use inside a position:absolute wrapper.
 */
export function SilverHologramCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runnerRef = useRef<ReturnType<typeof createSilverHologramGL> | null>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(2, window.devicePixelRatio ?? 1);
      const w = Math.max(1, Math.floor(parent.clientWidth * dpr));
      const h = Math.max(1, Math.floor(parent.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        canvas.style.width = `${parent.clientWidth}px`;
        canvas.style.height = `${parent.clientHeight}px`;
      }
    };

    resize();
    runnerRef.current = createSilverHologramGL(canvas);

    const raf = (t: number) => {
      if (runnerRef.current) runnerRef.current.draw(t);
      frameRef.current = requestAnimationFrame(raf);
    };
    frameRef.current = requestAnimationFrame(raf);

    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(frameRef.current);
      runnerRef.current?.destroy();
      runnerRef.current = null;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    />
  );
}
