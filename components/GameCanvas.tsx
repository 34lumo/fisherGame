"use client";

import { useEffect, useRef } from "react";
import { KeyboardMouseInput } from "@/lib/input/KeyboardMouseInput";

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
  const castRef   = useRef<Cast>({
    phase: "idle", origin: {x:0,y:0}, target: {x:0,y:0},
    control: {x:0,y:0}, progress: 0, phaseStart: 0,
  });

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
        if (e >= CAST_HOLD_S) { c.phase = "in"; c.phaseStart = now; }
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

    // ── Muchacho ───────────────────────────────────────────────────────────
    function drawMuchacho() {
      const i = mucRef.current;
      if (!i?.complete || !i.naturalWidth) return;
      ctx.drawImage(i, sprX, sprY, sprW, sprH);
    }

    // ── Main loop ──────────────────────────────────────────────────────────
    function frame() {
      const now = performance.now();
      const inp = inputRef.current;
      if (!inp) { rafRef.current = requestAnimationFrame(frame); return; }

      inp.update();
      const pos   = inp.getHandPosition();
      const mx    = pos.x * W;
      const my    = pos.y * H;
      const angle = Math.atan2(my - rodY, mx - rodX);

      if (inp.isPinchStart() && castRef.current.phase === "idle") {
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
      }

      tickCast(now);

      ctx.clearRect(0, 0, W, H);
      drawSky();
      drawOcean();
      drawSides();
      drawDistantBoat(now / 1000);
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
