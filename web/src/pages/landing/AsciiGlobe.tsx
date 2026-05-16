import { useEffect, useRef, useCallback } from "react";
import globeTextureSource from "../../../ascii-globe.txt?raw";

const CHARS = ".-:=+*#%@";

const AXIAL_TILT = (23 * Math.PI) / 180;
type GlobeTexture = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

function extractTextureUrl(source: string): string {
  const match = source.match(/data:image\/jpeg;base64,[^']+/);
  if (!match) {
    throw new Error("Missing ASCII globe texture data.");
  }
  return match[0];
}

function loadGlobeTexture(): Promise<GlobeTexture> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const textureCanvas = document.createElement("canvas");
      textureCanvas.width = image.naturalWidth;
      textureCanvas.height = image.naturalHeight;
      const textureCtx = textureCanvas.getContext("2d");
      if (!textureCtx) {
        reject(new Error("Unable to read ASCII globe texture."));
        return;
      }
      textureCtx.drawImage(image, 0, 0);
      const { data, width, height } = textureCtx.getImageData(
        0,
        0,
        textureCanvas.width,
        textureCanvas.height,
      );
      resolve({ data, width, height });
    };
    image.onerror = () => reject(new Error("Unable to load ASCII globe texture."));
    image.src = extractTextureUrl(globeTextureSource);
  });
}

function sampleTexture(texture: GlobeTexture | null, lon: number, lat: number): number {
  if (!texture) return 0;

  const u = 1 - (lon + Math.PI) / (Math.PI * 2);
  const v = (lat + Math.PI / 2) / Math.PI;
  const x = Math.max(0, Math.min(texture.width - 1, Math.floor(u * texture.width)));
  const y = Math.max(0, Math.min(texture.height - 1, Math.floor(v * texture.height)));
  const index = (y * texture.width + x) * 4;
  const r = texture.data[index];
  const g = texture.data[index + 1];
  const b = texture.data[index + 2];
  return (r + g + b) / (255 * 3);
}

function renderGlobe(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  spin: number,
  texture: GlobeTexture | null,
) {
  ctx.clearRect(0, 0, w, h);

  const fontSize = Math.max(7, Math.min(w, h) / 68);
  const cellW = fontSize * 0.58;
  const cellH = fontSize * 1.0;

  ctx.font = `${fontSize}px "SF Mono", "JetBrains Mono", "Menlo", "Consolas", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const cols = Math.floor(w / cellW);
  const rows = Math.floor(h / cellH);
  const radiusPx = Math.min(w, h) * 0.38;
  const cxPx = w / 2;
  const cyPx = h / 2;

  const cSpin = Math.cos(spin), sSpin = Math.sin(spin);
  const cTilt = Math.cos(AXIAL_TILT), sTilt = Math.sin(AXIAL_TILT);

  const lx = 0.4, ly = 0.35, lz = 0.85;
  const ll = Math.sqrt(lx * lx + ly * ly + lz * lz);
  const lnx = lx / ll, lny = ly / ll, lnz = lz / ll;

  for (let row = 0; row < rows; row++) {
    const py = row * cellH + cellH / 2;
    const dy = (py - cyPx) / radiusPx;
    if (Math.abs(dy) >= 1) continue;

    for (let col = 0; col < cols; col++) {
      const px = col * cellW + cellW / 2;
      const dx = (px - cxPx) / radiusPx;
      const d2 = dx * dx + dy * dy;
      if (d2 >= 1) continue;

      const dz = Math.sqrt(1 - d2);

      const tiltedX = dx * cTilt + dy * sTilt;
      const tiltedY = -dx * sTilt + dy * cTilt;

      const ox = tiltedX * cSpin + dz * sSpin;
      const oy = tiltedY;
      const oz = -tiltedX * sSpin + dz * cSpin;

      const sunlight = Math.max(0, dx * lnx + dy * lny + dz * lnz);
      const light = 0.18 + Math.pow(sunlight, 0.55) * 0.82;

      const lat = Math.asin(Math.max(-1, Math.min(1, oy)));
      const lon = Math.atan2(oz, ox);
      const land = sampleTexture(texture, lon, lat);
      const landPresence = Math.max(0, Math.min(1, (land - 0.16) / 0.42));

      const glyphValue = 0.18 + landPresence * 0.72;

      const idx = Math.floor(glyphValue * (CHARS.length - 1));
      const ch = CHARS[Math.min(idx, CHARS.length - 1)];
      const alpha = Math.min(1, 0.05 + light * (0.2 + landPresence * 0.55));

      ctx.fillStyle = `rgba(242, 191, 98, ${alpha})`;
      ctx.fillText(ch, px, py);
    }
  }
}

export function AsciiGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    spin: 0,
    isDragging: false,
    lastX: 0,
  });
  const textureRef = useRef<GlobeTexture | null>(null);
  const frameIdRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let isMounted = true;

    void loadGlobeTexture()
      .then((texture) => {
        if (isMounted) textureRef.current = texture;
      })
      .catch(() => {
        if (isMounted) textureRef.current = null;
      });

    let prevW = 0;
    let prevH = 0;

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = rect.width;
      const h = rect.height;

      if (w > 0 && h > 0) {
        const pw = Math.floor(w * dpr);
        const ph = Math.floor(h * dpr);
        if (canvas.width !== pw || canvas.height !== ph) {
          canvas.width = pw;
          canvas.height = ph;
        }

        if (w !== prevW || h !== prevH) {
          prevW = w;
          prevH = h;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        const s = stateRef.current;
        if (!s.isDragging) {
          s.spin += 0.005;
        }

        renderGlobe(ctx, w, h, s.spin, textureRef.current);
      }

      frameIdRef.current = requestAnimationFrame(render);
    };

    frameIdRef.current = requestAnimationFrame(render);

    return () => {
      isMounted = false;
      cancelAnimationFrame(frameIdRef.current);
    };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const s = stateRef.current;
    s.isDragging = true;
    s.lastX = e.clientX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const s = stateRef.current;
    if (!s.isDragging) return;
    const dx = e.clientX - s.lastX;
    s.spin += dx * 0.008;
    s.lastX = e.clientX;
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    stateRef.current.isDragging = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full cursor-grab active:cursor-grabbing"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    />
  );
}
