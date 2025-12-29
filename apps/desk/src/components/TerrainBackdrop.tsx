import { useEffect, useRef } from "react";

type TerrainBackdropProps = {
  className?: string;
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

    const cols = 220;
    const rows = 160;
    const count = cols * rows;

    const worldScale = 1.72;
    const heightScale = 1.55;

    const xs = new Float32Array(count);
    const zs = new Float32Array(count);
    const ys = new Float32Array(count);
    const ds = new Float32Array(count);
    const height01s = new Float32Array(count);
    const fillStyles = new Array<string>(count);
    const ridgeIndexByCol = new Uint32Array(cols);

    const terrainHeight = (x: number, z: number, seed: number) => {
      const mx = x * 1.1;
      const mz = z * 1.32;

      const r = Math.sqrt(mx * mx + mz * mz);
      const falloff = smoothstep(1.48, 0.16, r);

      const bumpA = Math.exp(-((mx + 0.22) * (mx + 0.22) * 2.1 + (mz - 0.08) * (mz - 0.08) * 2.4));
      const bumpB = Math.exp(-((mx - 0.28) * (mx - 0.28) * 2.8 + (mz + 0.26) * (mz + 0.26) * 2.15));
      const bumpC = Math.exp(-((mx + 0.06) * (mx + 0.06) * 2.3 + (mz + 0.62) * (mz + 0.62) * 3.2));
      const massif = clamp(bumpA * 1.12 + bumpB * 0.95 + bumpC * 0.65, 0, 2.2);

      const warp = fbm(mx * 0.82 + seed * 0.35, mz * 0.82 - seed * 0.24) * 0.22;
      const wx = mx + warp * 1.25;
      const wz = mz - warp * 0.95;

      const rg = ridged(wx * 2.85, wz * 2.85);
      const n = fbm(wx * 5.8, wz * 5.8) * 0.22 + fbm(wx * 11.5, wz * 11.5) * 0.075;

      const ridgeLine = Math.exp(-Math.pow(mx * 0.62 + mz * 0.34, 2) * 6.0) * 0.28;

      let h = massif * (0.72 + rg * 0.78 + n) + ridgeLine;
      h *= falloff;
      h = Math.max(0, h);
      h = Math.pow(h, 1.08);
      return h - 0.06;
    };

    let minY = Infinity;
    let maxY = -Infinity;

    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const i = r * cols + c;
        const nx = (c / (cols - 1)) * 2 - 1;
        const nz = (r / (rows - 1)) * 2 - 1;
        const seed = fract(Math.sin((c + 1) * 12.9898 + (r + 1) * 78.233) * 43758.5453);

        const y = terrainHeight(nx, nz, seed);

        xs[i] = nx * worldScale;
        zs[i] = nz * worldScale;
        ys[i] = y * heightScale;
        ds[i] = Math.sqrt(nx * nx + nz * nz);

        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }

    const ySpan = Math.max(0.0001, maxY - minY);

    for (let c = 0; c < cols; c += 1) {
      let best = 0;
      let bestY = -Infinity;
      for (let r = 0; r < rows; r += 1) {
        const i = r * cols + c;
        const y = ys[i]!;
        if (y > bestY) {
          bestY = y;
          best = i;
        }
      }
      ridgeIndexByCol[c] = best;
    }

    const light = (() => {
      const lx = 0.58;
      const ly = 0.82;
      const lz = 0.28;
      const len = Math.sqrt(lx * lx + ly * ly + lz * lz);
      return { x: lx / len, y: ly / len, z: lz / len };
    })();

    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const i = r * cols + c;

        const yRaw = ys[i]! / heightScale;
        const h01 = clamp((yRaw - minY) / ySpan, 0, 1);
        height01s[i] = h01;

        const cL = Math.max(0, c - 1);
        const cR = Math.min(cols - 1, c + 1);
        const rU = Math.max(0, r - 1);
        const rD = Math.min(rows - 1, r + 1);

        const yL = ys[r * cols + cL]! / heightScale;
        const yR = ys[r * cols + cR]! / heightScale;
        const yU = ys[rU * cols + c]! / heightScale;
        const yD = ys[rD * cols + c]! / heightScale;

        const sx = 2.2;
        const sz = 2.2;
        let nx = -(yR - yL) * sx;
        let ny = 1.0;
        let nz = -(yD - yU) * sz;
        const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
        nx /= nLen;
        ny /= nLen;
        nz /= nLen;

        const ndotl = clamp(nx * light.x + ny * light.y + nz * light.z, 0, 1);
        const shade = clamp(0.62 + ndotl * 0.55 + h01 * 0.12, 0, 1.15);

        const base = heightColor(h01);
        const rr = clamp(Math.round(base.r * shade), 0, 255);
        const gg = clamp(Math.round(base.g * shade), 0, 255);
        const bb = clamp(Math.round(base.b * shade), 0, 255);
        fillStyles[i] = `rgb(${rr}, ${gg}, ${bb})`;
      }
    }

    const draw = (t: number) => {
      ctx.clearRect(0, 0, width, height);

      const vignette = ctx.createRadialGradient(width * 0.5, height * 0.5, 20, width * 0.5, height * 0.55, Math.max(width, height));
      vignette.addColorStop(0, "rgba(2, 6, 23, 0.00)");
      vignette.addColorStop(1, "rgba(2, 6, 23, 0.45)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);

      const scan = (t * 0.000085) % 1.55;

      const yaw = Math.PI / 4 + Math.sin(t * 0.00005) * 0.06;
      const pitch = -0.62 + Math.sin(t * 0.000035) * 0.01;

      const csY = Math.cos(yaw);
      const snY = Math.sin(yaw);
      const csX = Math.cos(pitch);
      const snX = Math.sin(pitch);

      const camZ = 3.85;
      const scale = Math.min(width, height);
      const pxScale = scale * 0.74;
      const cx = width * 0.5;
      const cy = height * 0.66;

      const project = (x: number, y: number, z: number) => {
        const x1 = x * csY - z * snY;
        const z1 = x * snY + z * csY;

        const y2 = y * csX - z1 * snX;
        const z2 = y * snX + z1 * csX + camZ;

        const depth = Math.max(0.7, z2);
        const persp = 1 / (depth * 0.92);
        const sx = cx + x1 * persp * pxScale;
        const sy = cy - y2 * persp * pxScale;
        return { sx, sy, depth };
      };

      const ridgePts: { sx: number; sy: number }[] = [];
      ridgePts.length = cols;
      for (let c = 0; c < cols; c += 1) {
        const i = ridgeIndexByCol[c]!;
        const p3 = project(xs[i]!, ys[i]!, zs[i]!);
        ridgePts[c] = { sx: p3.sx, sy: p3.sy };
      }
      ridgePts.sort((a, b) => a.sx - b.sx);

      ctx.save();
      const ridgeFill = ctx.createLinearGradient(0, height * 0.2, 0, height);
      ridgeFill.addColorStop(0, "rgba(34, 211, 238, 0.12)");
      ridgeFill.addColorStop(1, "rgba(2, 6, 23, 0.00)");
      ctx.fillStyle = ridgeFill;
      ctx.beginPath();
      for (let i = 0; i < ridgePts.length; i += 1) {
        const p = ridgePts[i]!;
        if (i === 0) ctx.moveTo(p.sx, p.sy);
        else ctx.lineTo(p.sx, p.sy);
      }
      ctx.lineTo(ridgePts[ridgePts.length - 1]!.sx, height);
      ctx.lineTo(ridgePts[0]!.sx, height);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      const rowStep = 3;
      const colStep = 4;

      ctx.lineWidth = 1;
      for (let r = 0; r < rows; r += rowStep) {
        ctx.beginPath();
        for (let c = 0; c < cols; c += 1) {
          const i = r * cols + c;
          const p3 = project(xs[i]!, ys[i]!, zs[i]!);
          if (c === 0) ctx.moveTo(p3.sx, p3.sy);
          else ctx.lineTo(p3.sx, p3.sy);
        }
        ctx.strokeStyle = "rgba(34, 211, 238, 0.11)";
        ctx.stroke();
      }

      for (let c = 0; c < cols; c += colStep) {
        ctx.beginPath();
        for (let r = 0; r < rows; r += 1) {
          const i = r * cols + c;
          const p3 = project(xs[i]!, ys[i]!, zs[i]!);
          if (r === 0) ctx.moveTo(p3.sx, p3.sy);
          else ctx.lineTo(p3.sx, p3.sy);
        }
        ctx.strokeStyle = "rgba(96, 165, 250, 0.06)";
        ctx.stroke();
      }

      ctx.beginPath();
      for (let i = 0; i < ridgePts.length; i += 1) {
        const rp = ridgePts[i]!;
        if (i === 0) ctx.moveTo(rp.sx, rp.sy);
        else ctx.lineTo(rp.sx, rp.sy);
      }
      ctx.strokeStyle = "rgba(34, 211, 238, 0.28)";
      ctx.lineWidth = 1.45;
      ctx.stroke();

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const ringFill = "rgb(249, 115, 22)";
      for (let i = 0; i < count; i += 1) {
        const p3 = project(xs[i]!, ys[i]!, zs[i]!);
        const ring = Math.abs(ds[i]! - scan);
        const ringHit = ring < 0.028;

        const depthFade = clamp(1.35 - p3.depth * 0.33, 0, 1);
        const height01 = height01s[i]!;
        const heightGlow = clamp(0.22 + height01 * 1.05, 0, 1);
        const baseAlpha = 0.03 + 0.34 * depthFade * heightGlow;

        const alpha = ringHit ? clamp(baseAlpha + 0.26, 0, 0.78) : clamp(baseAlpha, 0, 0.54);
        const size = clamp(0.85 + height01 * 2.6 + (ringHit ? 0.9 : 0), 0.8, 3.8);

        ctx.globalAlpha = alpha;
        ctx.fillStyle = ringHit ? ringFill : fillStyles[i]!;
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
