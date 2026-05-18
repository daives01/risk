import { useEffect, useRef, useCallback } from "react";
import globeTextureUrl from "./ascii-globe-2.jpeg?inline";

const CHARS = ".-:=+*#%@";

type GlobeTexture = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

type GlobeTuning = {
  tiltXDeg: number;
  tiltZDeg: number;
  speed: number;
  resolution: number;
  sunX: number;
  sunY: number;
  sunZ: number;
};

const GLOBE_TUNING: GlobeTuning = {
  tiltXDeg: 6,
  tiltZDeg: 17,
  speed: 0.008,
  resolution: 1.25,
  sunX: 0.25,
  sunY: 0,
  sunZ: -0.05,
};
const DRAG_SENSITIVITY = 0.008;
const MAX_SPIN_VELOCITY = 0.08;
const SPIN_RETURN_EASE = 0.035;
const SIXTY_FPS_FRAME_MS = 1000 / 60;
const MAX_FRAME_SCALE = 4;

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
    image.src = globeTextureUrl;
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
  tuning: GlobeTuning,
) {
  ctx.clearRect(0, 0, w, h);

  const tiltX = (tuning.tiltXDeg * Math.PI) / 180;
  const tiltZ = (tuning.tiltZDeg * Math.PI) / 180;
  const fontSize = Math.max(5, Math.min(w, h) / (68 * tuning.resolution));
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
  const cTiltX = Math.cos(tiltX), sTiltX = Math.sin(tiltX);
  const cTiltZ = Math.cos(tiltZ), sTiltZ = Math.sin(tiltZ);

  const lx = tuning.sunX, ly = tuning.sunY, lz = tuning.sunZ;
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

      const xRolled = dx * cTiltZ - dy * sTiltZ;
      const yRolled = dx * sTiltZ + dy * cTiltZ;

      const xTilted = xRolled;
      const yTilted = yRolled * cTiltX - dz * sTiltX;
      const zTilted = yRolled * sTiltX + dz * cTiltX;

      const ox = xTilted * cSpin + zTilted * sSpin;
      const oy = yTilted;
      const oz = -xTilted * sSpin + zTilted * cSpin;

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
    spinVelocity: -GLOBE_TUNING.speed,
    isDragging: false,
    lastX: 0,
  });
  const textureRef = useRef<GlobeTexture | null>(null);
  const frameIdRef = useRef(0);
  const lastFrameTimeRef = useRef<number | null>(null);

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

    const render = (timestamp: number) => {
      const previousTimestamp = lastFrameTimeRef.current ?? timestamp;
      lastFrameTimeRef.current = timestamp;
      const frameScale = Math.min(
        MAX_FRAME_SCALE,
        (timestamp - previousTimestamp) / SIXTY_FPS_FRAME_MS,
      );
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
          const returnEase = 1 - Math.pow(1 - SPIN_RETURN_EASE, frameScale);
          s.spinVelocity +=
            (-GLOBE_TUNING.speed - s.spinVelocity) * returnEase;
          s.spin += s.spinVelocity * frameScale;
        }

        renderGlobe(ctx, w, h, s.spin, textureRef.current, GLOBE_TUNING);
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
    s.spinVelocity = 0;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const s = stateRef.current;
    if (!s.isDragging) return;
    const dx = e.clientX - s.lastX;
    const dragSpin = -dx * DRAG_SENSITIVITY;
    s.spin += dragSpin;
    s.spinVelocity = Math.max(
      -MAX_SPIN_VELOCITY,
      Math.min(MAX_SPIN_VELOCITY, dragSpin),
    );
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
