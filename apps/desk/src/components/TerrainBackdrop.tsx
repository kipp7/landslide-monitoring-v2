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

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function fract(n: number) {
  return n - Math.floor(n);
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function hash2(ix: number, iz: number) {
  return fract(Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453123);
}

function valueNoise2(x: number, z: number) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);

  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

function fbm(x: number, z: number) {
  let sum = 0;
  let amp = 0.6;
  let freq = 1;
  for (let i = 0; i < 5; i += 1) {
    const n = valueNoise2(x * freq, z * freq) * 2 - 1;
    sum += n * amp;
    freq *= 2;
    amp *= 0.5;
  }
  return sum;
}

function ridged(x: number, z: number) {
  let sum = 0;
  let amp = 0.8;
  let freq = 1;
  for (let i = 0; i < 4; i += 1) {
    const n = valueNoise2(x * freq, z * freq) * 2 - 1;
    const v = 1 - Math.abs(n);
    sum += v * v * amp;
    freq *= 2;
    amp *= 0.5;
  }
  return sum;
}

export function TerrainBackdrop(props: TerrainBackdropProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const points: Point[] = [];
    const cols = 120;
    const rows = 86;

    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const nx = (c / (cols - 1)) * 2 - 1;
        const nz = (r / (rows - 1)) * 2 - 1;
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
      const mx = x * 1.15;
      const mz = z * 1.4;
      const r2 = mx * mx + mz * mz;
      const bump = Math.exp(-r2 * 1.9);
      const warp = fbm(x * 0.9 + seed * 0.4 + t * 0.00003, z * 0.9 - seed * 0.2) * 0.22;

      const n = fbm(x * 2.0 + warp, z * 2.0 - warp);
      const rg = ridged(x * 3.0 - warp, z * 3.0 + warp);

      let h = bump * (0.95 + 0.55 * rg + 0.18 * n);
      h = Math.max(0, h);
      h = Math.pow(h, 1.1);
      const base = 0.08;
      return h - base;
    };

    const project = (x: number, y: number, z: number, t: number) => {
      const rotY = t * 0.00006;
      const cs = Math.cos(rotY);
      const sn = Math.sin(rotY);

      const tilt = 0.85;
      const cst = Math.cos(tilt);
      const snt = Math.sin(tilt);

      const x1 = x * cs - z * sn;
      const z1 = x * sn + z * cs;

      const y2 = y * cst - z1 * snt;
      const z2 = y * snt + z1 * cst + 3.1;

      const depth = z2;
      const persp = 1 / (depth * 0.88);
      const sx = width * (0.5 + x1 * persp * 0.62);
      const sy = height * (0.58 - y2 * persp * 0.85);
      return { sx, sy, depth };
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, width, height);

      const vignette = ctx.createRadialGradient(width * 0.5, height * 0.5, 20, width * 0.5, height * 0.55, Math.max(width, height));
      vignette.addColorStop(0, "rgba(2, 6, 23, 0.00)");
      vignette.addColorStop(1, "rgba(2, 6, 23, 0.45)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);

      const scan = (t * 0.000085) % 1.55;
      const scanCenterX = 0;
      const scanCenterZ = 0;

      const rowStep = 2;
      const colStep = 3;

      ctx.lineWidth = 1;
      for (let r = 0; r < rows; r += rowStep) {
        ctx.beginPath();
        for (let c = 0; c < cols; c += 1) {
          const p = points[r * cols + c]!;
          const y = terrainHeight(p.x, p.z, t, p.seed);
          const p3 = project(p.x * 1.55, y * 1.25, p.z * 1.55, t);
          if (c === 0) ctx.moveTo(p3.sx, p3.sy);
          else ctx.lineTo(p3.sx, p3.sy);
        }
        ctx.strokeStyle = "rgba(34, 211, 238, 0.10)";
        ctx.stroke();
      }

      for (let c = 0; c < cols; c += colStep) {
        ctx.beginPath();
        for (let r = 0; r < rows; r += 1) {
          const p = points[r * cols + c]!;
          const y = terrainHeight(p.x, p.z, t, p.seed);
          const p3 = project(p.x * 1.55, y * 1.25, p.z * 1.55, t);
          if (r === 0) ctx.moveTo(p3.sx, p3.sy);
          else ctx.lineTo(p3.sx, p3.sy);
        }
        ctx.strokeStyle = "rgba(96, 165, 250, 0.06)";
        ctx.stroke();
      }

      const ridgePts: { sx: number; sy: number }[] = [];
      for (let c = 0; c < cols; c += 1) {
        let bestIdx = 0;
        let bestH = -999;
        for (let r = 0; r < rows; r += 1) {
          const p = points[r * cols + c]!;
          const y = terrainHeight(p.x, p.z, t, p.seed);
          if (y > bestH) {
            bestH = y;
            bestIdx = r * cols + c;
          }
        }
        const p = points[bestIdx]!;
        const y = bestH;
        const p3 = project(p.x * 1.55, y * 1.25, p.z * 1.55, t);
        ridgePts.push({ sx: p3.sx, sy: p3.sy });
      }

      ctx.beginPath();
      for (let i = 0; i < ridgePts.length; i += 1) {
        const rp = ridgePts[i]!;
        if (i === 0) ctx.moveTo(rp.sx, rp.sy);
        else ctx.lineTo(rp.sx, rp.sy);
      }
      ctx.strokeStyle = "rgba(34, 211, 238, 0.26)";
      ctx.lineWidth = 1.4;
      ctx.stroke();

      type Dot = { sx: number; sy: number; depth: number; alpha: number; size: number; color: string };
      const dots: Dot[] = [];

      for (let i = 0; i < points.length; i += 1) {
        const p = points[i]!;
        const y = terrainHeight(p.x, p.z, t, p.seed);
        const p3 = project(p.x * 1.55, y * 1.25, p.z * 1.55, t);

        const dx = p.x - scanCenterX;
        const dz = p.z - scanCenterZ;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const ring = Math.abs(dist - scan);
        const ringHit = ring < 0.03;

        const depthFade = clamp(1.35 - p3.depth * 0.33, 0, 1);
        const heightGlow = clamp(0.18 + y * 1.05, 0, 1);
        const baseAlpha = 0.03 + 0.32 * depthFade * heightGlow;

        const alpha = ringHit ? clamp(baseAlpha + 0.26, 0, 0.78) : clamp(baseAlpha, 0, 0.52);
        const size = clamp(0.9 + heightGlow * 2.3 + (ringHit ? 0.9 : 0), 0.8, 3.6);
        const base = ringHit ? "249, 115, 22" : "34, 211, 238";
        const color = `rgba(${base}, ${alpha})`;

        dots.push({ sx: p3.sx, sy: p3.sy, depth: p3.depth, alpha, size, color });
      }

      dots.sort((a, b) => b.depth - a.depth);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const d of dots) {
        ctx.fillStyle = d.color;
        ctx.fillRect(d.sx, d.sy, d.size, d.size);
      }
      ctx.restore();

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
