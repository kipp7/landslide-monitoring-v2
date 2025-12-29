import { useEffect, useRef } from "react";

type TerrainBackdropProps = {
  className?: string;
};

type Point = {
  x: number;
  z: number;
  seed: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function TerrainBackdrop(props: TerrainBackdropProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const points: Point[] = [];
    const cols = 92;
    const rows = 56;

    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const nx = (c / (cols - 1)) * 2 - 1;
        const nz = r / (rows - 1);
        const seed = (Math.sin((c + 1) * 12.9898 + (r + 1) * 78.233) * 43758.5453) % 1;
        points.push({ x: nx, z: nz, seed });
      }
    }

    let raf = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const terrainHeight = (x: number, z: number, t: number, seed: number) => {
      const wave1 = Math.sin(x * 2.1 + z * 5.2);
      const wave2 = Math.sin(z * 7.6 - x * 1.7);
      const wave3 = Math.sin(x * 8.2 + t * 0.0007 + seed * 3.1);
      const ridge = Math.sin((x * 1.2 + z * 3.3) * 2.8);
      const base = 0.28 * wave1 + 0.22 * wave2 + 0.10 * wave3 + 0.18 * ridge;
      const lift = smoothstep(0.05, 0.9, z);
      const taper = 1 - smoothstep(0.75, 1.0, z);
      return base * lift * taper;
    };

    const project = (x: number, y: number, z: number, t: number) => {
      const rot = t * 0.00003;
      const cs = Math.cos(rot);
      const sn = Math.sin(rot);

      const px = x * cs - z * sn;
      const pz = x * sn + z * cs;

      const depth = pz + 2.2;
      const persp = 1 / (depth * 0.95);
      const sx = width * (0.5 + px * persp * 0.82);
      const sy = height * (0.58 - y * persp * 1.2 - (pz - 0.6) * 0.03);
      return { sx, sy, depth };
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, width, height);

      const scan = (t * 0.00009) % 2.8;
      const scanCenterX = -0.12;
      const scanCenterZ = 0.42;

      ctx.lineWidth = 1;
      for (let r = 0; r < rows; r += 1) {
        ctx.beginPath();
        for (let c = 0; c < cols; c += 1) {
          const p = points[r * cols + c]!;
          const y = terrainHeight(p.x, p.z, t, p.seed);
          const p3 = project(p.x * 1.25, y * 0.9, p.z * 2.0, t);
          if (c === 0) ctx.moveTo(p3.sx, p3.sy);
          else ctx.lineTo(p3.sx, p3.sy);
        }
        ctx.strokeStyle = "rgba(34, 211, 238, 0.07)";
        ctx.stroke();
      }

      for (let i = 0; i < points.length; i += 1) {
        const p = points[i]!;
        const y = terrainHeight(p.x, p.z, t, p.seed);
        const p3 = project(p.x * 1.25, y * 0.9, p.z * 2.0, t);

        const dx = p.x - scanCenterX;
        const dz = p.z - scanCenterZ;
        const dist = Math.sqrt(dx * dx + dz * dz) * 1.45;
        const ring = Math.abs(dist - scan);
        const ringHit = ring < 0.05;

        const depthFade = clamp(1.2 - p3.depth * 0.35, 0, 1);
        const heightGlow = clamp(0.35 + y * 1.8, 0, 1);
        const baseAlpha = 0.05 + 0.22 * depthFade * heightGlow;

        const alpha = ringHit ? clamp(baseAlpha + 0.22, 0, 0.65) : clamp(baseAlpha, 0, 0.45);
        const size = ringHit ? 2.0 : 1.2;
        const color = ringHit ? `rgba(249, 115, 22, ${alpha})` : `rgba(34, 211, 238, ${alpha})`;

        ctx.fillStyle = color;
        ctx.fillRect(p3.sx, p3.sy, size, size);
      }

      ctx.beginPath();
      const r = scan * 200;
      ctx.arc(width * 0.44, height * 0.54, r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(249, 115, 22, 0.06)";
      ctx.stroke();

      raf = window.requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize);
    raf = window.requestAnimationFrame(draw);
    return () => {
      window.removeEventListener("resize", resize);
      window.cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas ref={canvasRef} className={props.className} aria-hidden="true" />;
}
