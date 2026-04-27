"use client";

import { useEffect, useRef } from "react";
import { KeyboardMouseInput } from "@/lib/input/KeyboardMouseInput";
import { FishManager, type Fish } from "@/lib/game/FishManager";

// h/w ratios for each source PNG
const MUC_HW = 376 / 856;   // muchacho  856×376
const IZQ_WH = 802 / 1696;  // ladoIzq   802×1696  (w per unit of h)
const DER_WH = 642 / 1696;  // ladoder   642×1696

const CAST_OUT_S  = 0.45;
const CAST_HOLD_S = 0.50;
const CAST_IN_S   = 0.35;

interface Pt { x: number; y: number }
type Phase = "idle" | "out" | "hold" | "in";
interface Cast {
  phase: Phase;
  origin: Pt; target: Pt; control: Pt;
  progress: number; phaseStart: number;
  hookedFishId?: number;
}

// Wave positions as fractions: [x/W, (y − horizonY) / oceanH, len/W]
const WAVES = [
  [0.094, 0.086, 0.015], [0.615, 0.105, 0.010], [0.865, 0.094, 0.017],
  [0.260, 0.297, 0.019], [0.719, 0.277, 0.015],
  [0.135, 0.512, 0.023], [0.510, 0.492, 0.019],
  [0.323, 0.727, 0.027], [0.677, 0.703, 0.023], [0.875, 0.746, 0.021],
] as const;

function quadBez(t: number, P0: Pt, P1: Pt, P2: Pt): Pt {
  const m = 1 - t;
  return { x: m*m*P0.x + 2*m*t*P1.x + t*t*P2.x,
           y: m*m*P0.y + 2*m*t*P1.y + t*t*P2.y };
}
function arcMid(o: Pt, t: Pt): Pt {
  const d = Math.hypot(t.x - o.x, t.y - o.y);
  return { x: (o.x + t.x) / 2, y: (o.y + t.y) / 2 - d * 0.30 };
}

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef  = useRef<KeyboardMouseInput | null>(null);
  const rafRef    = useRef<number>(0);
  const mucRef    = useRef<HTMLImageElement | null>(null);
  const izqRef    = useRef<HTMLImageElement | null>(null);
  const derRef    = useRef<HTMLImageElement | null>(null);
  const castRef    = useRef<Cast>({
    phase: "idle", origin: {x:0,y:0}, target: {x:0,y:0},
    control: {x:0,y:0}, progress: 0, phaseStart: 0,
  });
  const fishMgrRef = useRef<FishManager>(new FishManager());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    // Load sprites once
    const muc = new Image(); muc.src = "/muchacho.png"; mucRef.current = muc;
    const izq = new Image(); izq.src = "/ladoIzq.png";  izqRef.current = izq;
    const der = new Image(); der.src = "/ladoder.png";   derRef.current = der;

    // ── Layout (recomputed on resize) ──────────────────────────────────────
    let W = 0, H = 0, hz = 0;
    let sprW = 0, sprH = 0, sprX = 0, sprY = 0;
    let rodX = 0, rodY = 0, rodLen = 0;
    let dbX = 0, dbY = 0;

    function applyLayout() {
      W = canvas!.width;
      H = canvas!.height;
      hz = Math.round(H * 0.20);

      // muchacho: 25% canvas width, bottom-center
      sprW = Math.round(W * 0.25);
      sprH = Math.round(sprW * MUC_HW);
      sprX = Math.round((W - sprW) / 2);
      sprY = H - sprH;

      // rod anchors: center-x, ~38% down from sprite top
      rodLen = Math.round(sprW * 0.22);
      rodX   = Math.round(W / 2);
      rodY   = Math.round(sprY + sprH * 0.38);

      // distant boat: top-right, just below horizon
      dbX = Math.round(W * 0.87);
      dbY = Math.round(hz + H * 0.02);
    }

    function resize() {
      canvas!.width  = window.innerWidth;
      canvas!.height = window.innerHeight;
      applyLayout();
      // Recreate input so normalized coords stay accurate
      inputRef.current?.dispose();
      inputRef.current = new KeyboardMouseInput(canvas!);
    }

    resize();
    window.addEventListener("resize", resize);

    // ── Sky ────────────────────────────────────────────────────────────────
    function drawSky() {
      const g = ctx.createLinearGradient(0, 0, 0, hz);
      g.addColorStop(0,    "#87ceeb");
      g.addColorStop(0.55, "#55b8d8");
      g.addColorStop(1,    "#2b9fc4");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, hz);
    }

    // ── Ocean + waves ──────────────────────────────────────────────────────
    function drawOcean() {
      ctx.fillStyle = "#1a6b8a";
      ctx.fillRect(0, hz, W, H - hz);
      const oH = H - hz;
      ctx.fillStyle = "#ffffff";
      for (const [rx, ry, rl] of WAVES) {
        const x   = Math.round(rx * W);
        const y   = Math.round(hz + ry * oH);
        const len = Math.max(3, Math.round(rl * W));
        ctx.globalAlpha = 0.35; ctx.fillRect(x, y, len, 1);
        ctx.globalAlpha = 0.15; ctx.fillRect(x + 1, y + 1, len - 2, 1);
      }
      ctx.globalAlpha = 1;
    }

    // ── Side sprites ───────────────────────────────────────────────────────
    function drawSides() {
      const oy = Math.round(H * 0.02);
      const dh = Math.round(H * 1.10);
      const l = izqRef.current;
      if (l?.complete && l.naturalWidth > 0) {
        const w = Math.ceil(IZQ_WH * H * 0.72);
        ctx.drawImage(l, 0, oy, w, dh);
      }
      const r = derRef.current;
      if (r?.complete && r.naturalWidth > 0) {
        const w = Math.ceil(DER_WH * H * 0.72);
        ctx.drawImage(r, W - w, oy, w, dh);
      }
    }

    // ── Distant boat (pixel grid, scales with H) ───────────────────────────
    function drawDistantBoat(t: number) {
      const ps = Math.max(2, Math.round(H / 110));
      const by = Math.round(dbY + Math.sin(t * 0.65) * 1.5);
      const SPR = [[0,0,1,1,1,1,0,0],[0,1,2,3,3,2,1,0],[1,2,3,4,4,3,2,1],
                   [1,2,2,2,2,2,2,1],[0,0,1,1,1,1,0,0]];
      const PAL = ["","#5c3208","#a0522d","#c8964a","#3d1a00"];
      for (let r = 0; r < SPR.length; r++)
        for (let c = 0; c < SPR[r].length; c++) {
          const ci = SPR[r][c]; if (!ci) continue;
          ctx.fillStyle = PAL[ci];
          ctx.fillRect(dbX + c * ps, by + r * ps, ps, ps);
        }
    }

    // ── Fishing rod ────────────────────────────────────────────────────────
    function drawRod(angle: number) {
      ctx.save();
      ctx.translate(rodX, rodY);
      ctx.rotate(angle);
      ctx.fillStyle = "#3d1a00"; ctx.fillRect(0, -2, 7, 3);
      ctx.fillStyle = "#7a4e12"; ctx.fillRect(7, -1, Math.round(rodLen * 0.5), 2);
      ctx.fillStyle = "#c8960a"; ctx.fillRect(7 + Math.round(rodLen * 0.5), 0,
                                               Math.round(rodLen * 0.5), 1);
      ctx.restore();

      if (castRef.current.phase === "idle") {
        const tx = rodX + Math.cos(angle) * rodLen;
        const ty = rodY + Math.sin(angle) * rodLen;
        ctx.strokeStyle = "#c8c8c8"; ctx.lineWidth = 1; ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx + Math.cos(angle) * rodLen * 0.7,
                   ty + Math.sin(angle) * rodLen * 0.7);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // ── Cast state machine ─────────────────────────────────────────────────
    function tickCast(now: number) {
      const c = castRef.current;
      if (c.phase === "idle") return;
      const e = (now - c.phaseStart) / 1000;
      if (c.phase === "out") {
        c.progress = Math.min(1, e / CAST_OUT_S);
        if (c.progress >= 1) { c.phase = "hold"; c.phaseStart = now; }
      } else if (c.phase === "hold") {
        if (e >= CAST_HOLD_S) { c.phase = "in"; c.phaseStart = now; c.hookedFishId = undefined; }
      } else if (c.phase === "in") {
        c.progress = Math.max(0, 1 - e / CAST_IN_S);
        if (c.progress <= 0) c.phase = "idle";
      }
    }

    // ── Cast line + bobber ─────────────────────────────────────────────────
    function drawCastLine() {
      const c = castRef.current;
      if (c.phase === "idle") return;
      ctx.strokeStyle = "#d0d0d0"; ctx.lineWidth = 1; ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(c.origin.x, c.origin.y);
      for (let i = 1; i <= 24; i++) {
        const p = quadBez((i / 24) * c.progress, c.origin, c.control, c.target);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      const tip = quadBez(c.progress, c.origin, c.control, c.target);
      const bx = Math.round(tip.x) - 3, by = Math.round(tip.y) - 3;
      ctx.fillStyle = "#ffffff"; ctx.fillRect(bx, by,     6, 3);
      ctx.fillStyle = "#e63946"; ctx.fillRect(bx, by + 3, 6, 3);
      ctx.fillStyle = "#222222";
      ctx.fillRect(bx - 1, by - 1, 8, 1); ctx.fillRect(bx - 1, by + 6, 8, 1);
      ctx.fillRect(bx - 1, by,     1, 6); ctx.fillRect(bx + 6, by,     1, 6);
    }

    // ── Fish ──────────────────────────────────────────────────────────────
    function drawFish(fish: Fish, t: number) {
      const oceanH = H - hz;
      const minY   = hz + oceanH * 0.10;
      const maxY   = H * 0.80;
      const depthT = Math.max(0, Math.min(1, (fish.y - minY) / (maxY - minY)));
      const alpha  = 0.70 + depthT * 0.30;
      const wiggle = Math.sin(t * 8 + fish.id) * 2;

      const fw  = Math.round(fish.size * 2);           // drawn width  24-52 px
      const fh  = Math.round(fish.size * 0.65);        // drawn height
      const fx  = Math.round(fish.x);
      const fy  = Math.round(fish.y + wiggle);
      const ind = Math.max(2, Math.round(fw * 0.12));  // row indent
      const r1  = Math.max(1, Math.round(fh * 0.28));  // top row h
      const r2  = Math.max(1, Math.round(fh * 0.44));  // mid row h
      const r3  = Math.max(1, fh - r1 - r2);           // bot row h

      ctx.globalAlpha = alpha;

      // Outline
      ctx.fillStyle = "#c45a00";
      ctx.fillRect(fx + ind - 1, fy - 1,       fw - (ind - 1) * 2, 1);  // top
      ctx.fillRect(fx + ind - 1, fy + fh,      fw - (ind - 1) * 2, 1);  // bottom
      ctx.fillRect(fx - 1,       fy + r1,      1, r2);                   // left
      ctx.fillRect(fx + fw,      fy + r1,      1, r2);                   // right

      // Body — 3 stacked rects (top/bottom narrower = rounded silhouette)
      ctx.fillStyle = "#c45a00";
      ctx.fillRect(fx + ind, fy,           fw - ind * 2, r1); // top row (dark)
      ctx.fillStyle = "#ff8c42";
      ctx.fillRect(fx,       fy + r1,      fw,           r2); // mid row (full)
      ctx.fillRect(fx + ind, fy + r1 + r2, fw - ind * 2, r3); // bot row

      // Belly highlight
      ctx.fillStyle = "#ffb347";
      ctx.fillRect(
        fx + Math.round(fw * 0.15),
        fy + r1 + Math.round(r2 * 0.35),
        Math.round(fw * 0.55),
        Math.max(1, Math.round(r2 * 0.32))
      );

      // Tail — two V fins right of body
      const tw = Math.max(3, Math.round(fw * 0.22));
      const th = Math.max(2, Math.round(fh * 0.32));
      ctx.fillStyle = "#e06820";
      ctx.fillRect(fx + fw, fy,           tw, th);
      ctx.fillRect(fx + fw, fy + fh - th, tw, th);

      // Eye — 2×2 white, 1×1 black pupil
      const ex = fx + Math.max(2, Math.round(fw * 0.10));
      const ey = fy + r1 + Math.max(1, Math.round(r2 * 0.15));
      ctx.fillStyle = "#ffffff"; ctx.fillRect(ex, ey, 2, 2);
      ctx.fillStyle = "#1a1a1a"; ctx.fillRect(ex, ey, 1, 1);

      // Mouth — 2px dark line front-left
      ctx.fillStyle = "#c45a00";
      ctx.fillRect(fx, fy + r1 + Math.round(r2 * 0.65), 2, 1);

      ctx.globalAlpha = 1;

      // HOOKED! label
      if (fish.state === "hooked") {
        ctx.font = '16px "Press Start 2P", monospace';
        ctx.textAlign = "center";
        ctx.fillStyle = "#ffeb3b";
        ctx.fillText("HOOKED!", Math.round(fx + fw / 2), fy - 8);
        ctx.textAlign = "left";
      }
    }

    // ── Muchacho ───────────────────────────────────────────────────────────
    function drawMuchacho() {
      const i = mucRef.current;
      if (!i?.complete || !i.naturalWidth) return;
      ctx.drawImage(i, sprX, sprY, sprW, sprH);
    }

    // ── Main loop ──────────────────────────────────────────────────────────
    let lastNow = performance.now();

    function frame() {
      const now = performance.now();
      const dt  = Math.min((now - lastNow) / 1000, 0.1);
      lastNow   = now;

      const inp = inputRef.current;
      if (!inp) { rafRef.current = requestAnimationFrame(frame); return; }

      inp.update();
      const pos   = inp.getHandPosition();
      const mx    = pos.x * W;
      const my    = pos.y * H;
      const angle = Math.atan2(my - rodY, mx - rodX);

      // Fish logic — must run before click check so fish ref is available
      const leftBound  = Math.ceil(IZQ_WH * H * 0.72);
      const rightBound = W - Math.ceil(DER_WH * H * 0.72);
      fishMgrRef.current.update(dt, W, H, hz, leftBound, rightBound);
      const fish = fishMgrRef.current.getFish();

      // On click: first try direct fish hook, then cast if no fish nearby
      if (inp.isPinchStart()) {
        let directHooked = false;
        if (fish?.state === "swimming") {
          const fishCX = fish.x + fish.size;
          const fishCY = fish.y + fish.size * 0.325;
          const dist   = Math.hypot(mx - fishCX, my - fishCY);
          if (dist < fish.size * 2) {
            fishMgrRef.current.hookFish(fish.id);
            console.log("FISH HOOKED at distance", dist);
            directHooked = true;
          }
        }
        if (!directHooked && castRef.current.phase === "idle") {
          const origin: Pt = {
            x: rodX + Math.cos(angle) * rodLen,
            y: rodY + Math.sin(angle) * rodLen,
          };
          castRef.current = {
            phase: "out", origin,
            target: { x: mx, y: my },
            control: arcMid(origin, { x: mx, y: my }),
            progress: 0, phaseStart: now,
          };
          console.log("CAST TRIGGERED");
        }
      }

      // Passive bobber collision during hold
      const c = castRef.current;
      if (c.phase === "hold" && c.hookedFishId === undefined && fish?.state === "swimming") {
        const tip    = quadBez(1.0, c.origin, c.control, c.target);
        const fishCX = fish.x + fish.size;
        const fishCY = fish.y + fish.size * 0.325;
        const dist   = Math.hypot(tip.x - fishCX, tip.y - fishCY);
        if (dist < fish.size * 1.5) {
          fishMgrRef.current.hookFish(fish.id);
          c.hookedFishId = fish.id;
          c.target       = { x: fishCX, y: fishCY };
          console.log("FISH HOOKED at distance", dist);
        }
      }

      tickCast(now);

      ctx.clearRect(0, 0, W, H);
      drawSky();
      drawOcean();
      drawSides();
      drawDistantBoat(now / 1000);
      if (fish) drawFish(fish, now / 1000);
      drawRod(angle);
      drawCastLine();
      drawMuchacho();

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      inputRef.current?.dispose();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: "block", width: "100vw", height: "100vh", cursor: "crosshair" }}
    />
  );
}
