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

function heightColor(height01: number) {
  const low = { r: 30, g: 58, b: 138 };
  const mid = { r: 34, g: 211, b: 238 };
  const high = { r: 226, g: 232, b: 240 };

  if (height01 < 0.55) {
    const t = height01 / 0.55;
    return {
      r: Math.round(lerp(low.r, mid.r, t)),
      g: Math.round(lerp(low.g, mid.g, t)),
      b: Math.round(lerp(low.b, mid.b, t))
    };
  }

  const t = (height01 - 0.55) / 0.45;
  return {
    r: Math.round(lerp(mid.r, high.r, t)),
    g: Math.round(lerp(mid.g, high.g, t)),
    b: Math.round(lerp(mid.b, high.b, t))
  };
}

export function TerrainBackdrop(props: TerrainBackdropProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const points: Point[] = [];
    const cols = 160;
    const rows = 120;

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
      const mx = x * 1.05;
      const mz = z * 1.2;
      const bump1 = Math.exp(-((mx + 0.32) * (mx + 0.32) * 2.2 + (mz + 0.08) * (mz + 0.08) * 2.6));
      const bump2 = Math.exp(-((mx - 0.18) * (mx - 0.18) * 2.9 + (mz - 0.22) * (mz - 0.22) * 2.3));
      const bump3 = Math.exp(-((mx + 0.05) * (mx + 0.05) * 2.3 + (mz - 0.52) * (mz - 0.52) * 3.4));
      const bump = clamp(bump1 * 1.08 + bump2 * 0.86 + bump3 * 0.62, 0, 1.8);

      const warp = fbm(x * 0.95 + seed * 0.35 + t * 0.00002, z * 0.95 - seed * 0.22) * 0.22;
      const n = fbm(x * 2.6 + warp, z * 2.6 - warp);
      const rg = ridged(x * 4.2 - warp, z * 4.2 + warp);

      const ridgeLine = Math.exp(-Math.pow(mx * 0.72 + mz * 0.38, 2) * 6.5) * 0.22;

      let h = bump * (0.78 + 0.62 * rg + 0.22 * n) + ridgeLine;
      h = Math.max(0, h);
      h = Math.pow(h, 1.05);
      return h - 0.10;
    };

    const project = (x: number, y: number, z: number, t: number) => {
      const rotY = t * 0.000045;
      const pitch = -0.76 + Math.sin(t * 0.00007) * 0.02;

      const csY = Math.cos(rotY);
      const snY = Math.sin(rotY);

      const csX = Math.cos(pitch);
      const snX = Math.sin(pitch);

      const x1 = x * csY - z * snY;
      const z1 = x * snY + z * csY;

      const y2 = y * csX - z1 * snX;
      const z2 = y * snX + z1 * csX + 3.35;

      const depth = Math.max(0.9, z2);
      const scale = Math.min(width, height);
      const persp = 1 / (depth * 0.92);
      const sx = width * 0.5 + x1 * persp * scale * 0.72;
      const sy = height * 0.62 - y2 * persp * scale * 0.72;
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

      const rowStep = 3;
      const colStep = 4;

      ctx.lineWidth = 1;
      for (let r = 0; r < rows; r += rowStep) {
        ctx.beginPath();
        for (let c = 0; c < cols; c += 1) {
          const p = points[r * cols + c]!;
          const y = terrainHeight(p.x, p.z, t, p.seed);
          const p3 = project(p.x * 1.72, y * 1.28, p.z * 1.72, t);
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
          const p3 = project(p.x * 1.72, y * 1.28, p.z * 1.72, t);
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
        const p3 = project(p.x * 1.72, y * 1.28, p.z * 1.72, t);
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

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < points.length; i += 1) {
        const p = points[i]!;
        const y = terrainHeight(p.x, p.z, t, p.seed);
        const p3 = project(p.x * 1.72, y * 1.28, p.z * 1.72, t);

        const dx = p.x - scanCenterX;
        const dz = p.z - scanCenterZ;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const ring = Math.abs(dist - scan);
        const ringHit = ring < 0.028;

        const depthFade = clamp(1.35 - p3.depth * 0.33, 0, 1);
        const height01 = clamp((y + 0.08) / 1.25, 0, 1);
        const heightGlow = clamp(0.22 + height01 * 1.05, 0, 1);
        const baseAlpha = 0.03 + 0.34 * depthFade * heightGlow;

        const alpha = ringHit ? clamp(baseAlpha + 0.26, 0, 0.78) : clamp(baseAlpha, 0, 0.54);
        const size = clamp(0.85 + height01 * 2.6 + (ringHit ? 0.9 : 0), 0.8, 3.8);

        if (ringHit) {
          ctx.fillStyle = `rgba(249, 115, 22, ${alpha})`;
        } else {
          const rgb = heightColor(height01);
          ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
        }

        ctx.fillRect(p3.sx, p3.sy, size, size);
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
