"use client";

import { useEffect, useRef } from "react";
import { KeyboardMouseInput } from "@/lib/input/KeyboardMouseInput";
import { FishManager, type Fish } from "@/lib/game/FishManager";

// h/w ratios for each source PNG
const MUC_HW = 376 / 856;
const IZQ_WH = 802 / 1696;
const DER_WH = 642 / 1696;

// pez.png sprite dimensions
const PEZ_HW    = 469 / 642; // height/width of the sprite
const PEZ_SCALE = 5;         // drawn width = fish.size * PEZ_SCALE (must match DRAW_SCALE in FishManager)

function pezW(size: number) { return size * PEZ_SCALE; }
function pezH(size: number) { return pezW(size) * PEZ_HW; }
function pezCX(fish: { x: number; size: number }) { return fish.x + pezW(fish.size) / 2; }
function pezCY(fish: { y: number; size: number }) { return fish.y + pezH(fish.size) / 2; }

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

type ChallengeType = "TYPE_NUMBER" | "HOLD_KEY" | "MASH_KEY";
interface ReelingState {
  active: boolean;
  fishId: number;
  fishStartX: number; fishStartY: number;
  challengeDone: number;
  currentChallenge: ChallengeType;
  challengeStart: number;
  targetDigit: number;
  holdAccum: number;
  mashCount: number;
  lerpFromX: number;   lerpFromY: number;
  lerpTargetX: number; lerpTargetY: number;
  lerpStartTime: number;
}
interface FloatingText { text: string; x: number; y: number; startTime: number; }


const CHALLENGE_TYPES: ChallengeType[] = ["TYPE_NUMBER", "HOLD_KEY", "MASH_KEY"];


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
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const inputRef     = useRef<KeyboardMouseInput | null>(null);
  const rafRef       = useRef<number>(0);
  const mucRef       = useRef<HTMLImageElement | null>(null);
  const izqRef       = useRef<HTMLImageElement | null>(null);
  const derRef       = useRef<HTMLImageElement | null>(null);
  const pezRef       = useRef<HTMLImageElement | null>(null);
  const nubesRef        = useRef<HTMLImageElement | null>(null);
  const barcolejanoRef  = useRef<HTMLImageElement | null>(null);
  const castRef      = useRef<Cast>({
    phase: "idle", origin: {x:0,y:0}, target: {x:0,y:0},
    control: {x:0,y:0}, progress: 0, phaseStart: 0,
  });
  const fishMgrRef       = useRef<FishManager>(new FishManager());
  const reelingRef       = useRef<ReelingState>({
    active: false, fishId: -1,
    fishStartX: 0, fishStartY: 0,
    challengeDone: 0, currentChallenge: "TYPE_NUMBER",
    challengeStart: 0, targetDigit: 1,
    holdAccum: 0, mashCount: 0,
    lerpFromX: 0, lerpFromY: 0,
    lerpTargetX: 0, lerpTargetY: 0,
    lerpStartTime: 0,
  });
  const scoreRef         = useRef<number>(0);
  const floatingTextsRef = useRef<FloatingText[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const muc = new Image(); muc.src = "/muchacho.png"; mucRef.current = muc;
    const izq = new Image(); izq.src = "/ladoIzq.png";  izqRef.current = izq;
    const der = new Image(); der.src = "/ladoder.png";   derRef.current = der;
    const pez   = new Image(); pez.src   = "/pez.png";    pezRef.current   = pez;
    const nubes       = new Image(); nubes.src       = "/nubes.png";       nubesRef.current       = nubes;
    const barcolejano = new Image(); barcolejano.src = "/barcolejano.png"; barcolejanoRef.current = barcolejano;

    // ── Layout ────────────────────────────────────────────────────────────
    let W = 0, H = 0, hz = 0;
    let sprW = 0, sprH = 0, sprY = 0;
    let rodX = 0, rodY = 0, rodLen = 0;
    let skyCanvas: HTMLCanvasElement | null = null;
    let seaCanvas: HTMLCanvasElement | null = null;

    function buildSkyCanvas(): void {
      const skc = document.createElement("canvas");
      skc.width = W; skc.height = hz;
      const skx = skc.getContext("2d")!;

      const g = skx.createLinearGradient(0, 0, 0, hz);
      g.addColorStop(0,    "#5c1a6e");
      g.addColorStop(0.30, "#b8365a");
      g.addColorStop(0.65, "#e0602a");
      g.addColorStop(1,    "#f5c043");
      skx.fillStyle = g;
      skx.fillRect(0, 0, W, hz);

      function hash2(a: number, b: number): number {
        return Math.abs(Math.sin(a * 127.1 + b * 311.7) * 43758.5453) % 1;
      }

      function cloudPuff(cx: number, cy: number, r: number, seed: number): void {
        const n = 5 + Math.floor(hash2(seed, 99) * 4);
        for (let i = 0; i < n; i++) {
          const bx = cx + (hash2(seed + i * 7, 1) - 0.5) * r * 2.4;
          const by = cy + (hash2(seed + i * 3, 2) - 0.55) * r * 0.9;
          const br = r  * (0.45 + hash2(seed + i * 11, 3) * 0.50);
          skx.globalAlpha = 0.28;
          skx.fillStyle   = "#c070a0";
          skx.beginPath(); skx.arc(bx + br * 0.25, by + br * 0.25, br * 1.05, 0, Math.PI * 2); skx.fill();
          skx.globalAlpha = 0.60 + hash2(seed + i, 4) * 0.22;
          skx.fillStyle   = "#fff0e8";
          skx.beginPath(); skx.arc(bx, by, br, 0, Math.PI * 2); skx.fill();
          skx.globalAlpha = 0.78;
          skx.fillStyle   = "#ffffff";
          skx.beginPath(); skx.arc(bx - br * 0.1, by - br * 0.18, br * 0.42, 0, Math.PI * 2); skx.fill();
        }
        skx.globalAlpha = 1;
      }

      // Scattered background cloud puffs flanking the central logo area
      const PUFFS: { x: number; y: number; r: number; s: number }[] = [
        { x: W * 0.07, y: hz * 0.14, r: hz * 0.072, s: 100 },
        { x: W * 0.17, y: hz * 0.38, r: hz * 0.052, s: 200 },
        { x: W * 0.09, y: hz * 0.60, r: hz * 0.038, s: 300 },
        { x: W * 0.26, y: hz * 0.74, r: hz * 0.028, s: 400 },
        { x: W * 0.81, y: hz * 0.11, r: hz * 0.080, s: 500 },
        { x: W * 0.89, y: hz * 0.42, r: hz * 0.055, s: 600 },
        { x: W * 0.74, y: hz * 0.63, r: hz * 0.036, s: 700 },
        { x: W * 0.93, y: hz * 0.70, r: hz * 0.026, s: 800 },
      ];
      for (const { x, y, r, s } of PUFFS) cloudPuff(x, y, r, s);

      // Tiny pixel bird silhouettes in loose V-formations
      const ps = Math.max(1, Math.round(W / 700));
      skx.fillStyle = "#2d1044";
      const FLOCKS: { cx: number; cy: number; n: number }[] = [
        { cx: W * 0.23, cy: hz * 0.20, n: 5 },
        { cx: W * 0.69, cy: hz * 0.27, n: 4 },
      ];
      for (const { cx, cy, n } of FLOCKS) {
        for (let i = 0; i < n; i++) {
          const spread = i - (n - 1) / 2;
          const bx = Math.round(cx + spread * ps * 9);
          const by = Math.round(cy + Math.abs(spread) * ps * 3);
          skx.fillRect(bx - ps * 2, by + ps, ps * 2, ps);
          skx.fillRect(bx,          by,      1,       1);
          skx.fillRect(bx + ps,     by + ps, ps * 2,  ps);
        }
      }

      skyCanvas = skc;
    }

    function buildSeaCanvas(): void {
      const swc = document.createElement("canvas");
      swc.width = W; swc.height = H - hz;
      const swx = swc.getContext("2d")!;

      function hash2(a: number, b: number): number {
        return Math.abs(Math.sin(a * 127.1 + b * 311.7) * 43758.5453) % 1;
      }

      const g = swx.createLinearGradient(0, 0, 0, H - hz);
      g.addColorStop(0,    "#2d7ab5");
      g.addColorStop(0.45, "#1a5e8a");
      g.addColorStop(1,    "#0c3858");
      swx.fillStyle = g;
      swx.fillRect(0, 0, W, H - hz);

      const COOL: string[] = ["#5db1e5", "#3a8fc1", "#4fa8d8", "#226090", "#2d7ab5", "#72c4f0"];
      const WARM: string[] = ["#c87040", "#d4885a", "#e09060", "#c84880", "#d45878", "#e87848"];
      const SHAPES: number[][][] = [
        [[0,1,1,0,0],[1,1,0,0,0]],
        [[0,0,1,1,0],[0,1,1,0,0]],
        [[1,1,1,0,0],[0,1,1,1,0]],
        [[0,1,0,0,0],[1,1,1,0,0]],
        [[1,1,0,0,0],[0,0,0,0,0]],
        [[1,1,1,1,0],[0,0,1,1,0]],
        [[0,1,1,1,0],[1,1,0,0,0]],
      ];

      const NUM_BANDS = 36;
      const oH = H - hz;

      for (let band = 0; band < NUM_BANDS; band++) {
        const t    = band / (NUM_BANDS - 1);
        const y    = Math.round(t * t * oH * 0.95);
        const ps   = Math.max(1, Math.round(1 + t * 3));

        const bandWarm    = (1 - t) * 0.55 + 0.05;
        const baseSpacing = Math.round(W / (14 + Math.floor(hash2(band, 0) * 8)));
        let x = Math.round(hash2(band, 1) * baseSpacing);

        while (x < W) {
          const centerProx = Math.max(0, 1 - Math.abs(x / W - 0.5) * 2.5);
          const warmChance = bandWarm + centerProx * 0.20;
          const isWarm     = hash2(x * 0.01 + band * 0.3, band * 0.7) < warmChance;
          const pal        = isWarm ? WARM : COOL;
          const cIdx       = Math.floor(hash2(x * 0.05 + band, band * 2) * pal.length);
          const sIdx       = Math.floor(hash2(band * 3 + x * 0.07, x * 0.02 + band * 5) * SHAPES.length);
          const shape      = SHAPES[sIdx];

          swx.fillStyle = pal[cIdx];
          for (let row = 0; row < shape.length; row++) {
            for (let col = 0; col < shape[row].length; col++) {
              if (!shape[row][col]) continue;
              swx.fillRect(x + col * ps, y + row * ps, ps, ps);
            }
          }

          x += baseSpacing + Math.round(hash2(x + band * 31, band + x * 17) * baseSpacing * 0.8);
        }
      }

      // Floating debris — pebbles, moss, twigs
      const DEBRIS: string[] = ["#4a3010", "#3a5a20", "#8a7040", "#5a4a28", "#2a4018", "#6a5a38"];
      for (let i = 0; i < 14; i++) {
        const dx = Math.round(hash2(i * 17 + 1000, 1) * W);
        const dy = Math.round(hash2(i * 13 + 1000, 2) * oH * 0.65 + oH * 0.06);
        const ds = Math.max(2, Math.round(2 + hash2(i * 7  + 1000, 3) * 3));
        swx.globalAlpha = 0.50 + hash2(i * 5 + 1000, 5) * 0.35;
        swx.fillStyle   = DEBRIS[Math.floor(hash2(i * 11 + 1000, 4) * DEBRIS.length)];
        swx.fillRect(dx, dy, ds, Math.max(1, Math.round(ds * 0.55)));
        if (hash2(i * 23 + 1000, 6) > 0.4)
          swx.fillRect(dx + Math.round(ds * 0.7), dy - 1, Math.round(ds * 0.8), 1);
      }
      swx.globalAlpha = 1;

      seaCanvas = swc;
    }

    function applyLayout() {
      W = canvas!.width;  H = canvas!.height;
      hz = Math.round(H * 0.20);
      sprW = Math.max(160, Math.round(W * 0.33));
      sprH = Math.round(sprW * MUC_HW);
      sprY = H - sprH;
      rodLen = Math.round(sprW * 0.22);
      rodX   = Math.round(W / 2);
      rodY   = Math.round(sprY + sprH * 0.38);
      buildSkyCanvas();
      buildSeaCanvas();
    }

    function resize() {
      canvas!.width  = window.innerWidth;
      canvas!.height = window.innerHeight;
      applyLayout();
      inputRef.current?.dispose();
      inputRef.current = new KeyboardMouseInput(canvas!);
    }

    resize();
    window.addEventListener("resize", resize);

    // ── Draw helpers ──────────────────────────────────────────────────────
    function drawSky() {
      if (skyCanvas) ctx.drawImage(skyCanvas, 0, 0);
      const nb = nubesRef.current;
      if (nb?.complete && nb.naturalWidth > 0) {
        const maxH = hz - Math.round(H * 0.05) - 6;
        const imgH = Math.min(Math.round(hz * 0.88), maxH);
        const imgW = Math.round(imgH * (nb.naturalWidth / nb.naturalHeight));
        const imgX = Math.round((W - imgW) / 2);
        const imgY = Math.round(H * 0.05);
        ctx.drawImage(nb, imgX, imgY, imgW, imgH);
      }
    }

    function drawOcean() {
      if (seaCanvas) ctx.drawImage(seaCanvas, 0, hz);
    }

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

    function drawDistantBoat(t: number) {
      const img = barcolejanoRef.current;
      if (!img?.complete || !img.naturalWidth) return;
      const leftBound = Math.ceil(IZQ_WH * H * 0.72);
      const bw  = Math.round(W * 0.13);
      const bh  = Math.round(bw * (img.naturalHeight / img.naturalWidth));
      const bx  = leftBound + Math.round(W * 0.028);
      const by  = Math.round(hz + (H - hz) * 0.07 + Math.sin(t * 0.65) * 1.5);
      ctx.drawImage(img, bx, by, bw, bh);
    }

    function drawRod(angle: number, bob: number) {
      const ry = rodY + bob;
      ctx.save();
      ctx.translate(rodX, ry);
      ctx.rotate(angle);
      ctx.fillStyle = "#3d1a00"; ctx.fillRect(0, -2, 7, 3);
      ctx.fillStyle = "#7a4e12"; ctx.fillRect(7, -1, Math.round(rodLen * 0.5), 2);
      ctx.fillStyle = "#c8960a"; ctx.fillRect(7 + Math.round(rodLen * 0.5), 0,
                                               Math.round(rodLen * 0.5), 1);
      ctx.restore();

      if (castRef.current.phase === "idle") {
        const tx = rodX + Math.cos(angle) * rodLen;
        const ty = ry  + Math.sin(angle) * rodLen;
        ctx.strokeStyle = "#c8c8c8"; ctx.lineWidth = 1; ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx + Math.cos(angle) * rodLen * 0.7,
                   ty + Math.sin(angle) * rodLen * 0.7);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

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

    function drawFish(fish: Fish, t: number) {
      const img = pezRef.current;
      if (!img?.complete || !img.naturalWidth) return;

      const oceanH  = H - hz;
      const minY    = hz + oceanH * 0.10;
      const maxY    = H * 0.80;
      const depthT  = Math.max(0, Math.min(1, (fish.y - minY) / (maxY - minY)));
      const alpha   = 0.70 + depthT * 0.30;
      const fw      = Math.round(pezW(fish.size));
      const fh      = Math.round(pezH(fish.size));
      const cx      = Math.round(fish.x + fw / 2);
      // pez.png faces RIGHT — flip horizontally when moving left
      const flipX   = fish.speed < 0;

      ctx.globalAlpha = alpha;
      ctx.save();
      ctx.translate(cx, Math.round(fish.y + fh / 2));

      if (fish.state === "hooked") {
        ctx.rotate(Math.sin(t * 25) * 0.4);
      } else {
        const wiggle = Math.sin(t * 8 + fish.id) * 2;
        ctx.translate(0, wiggle);
      }

      if (flipX) ctx.scale(-1, 1);
      ctx.drawImage(img, -Math.round(fw / 2), -Math.round(fh / 2), fw, fh);
      ctx.restore();

      ctx.globalAlpha = 1;
    }

    function drawMuchacho(bob: number) {
      const i = mucRef.current;
      if (!i?.complete || !i.naturalWidth) return;
      const boatWidth  = W * 0.25;
      const boatHeight = boatWidth * (i.naturalHeight / i.naturalWidth);
      const boatX      = Math.round((W - boatWidth) / 2);
      const boatY      = H - boatHeight;
      ctx.drawImage(i, boatX, boatY + bob, boatWidth, boatHeight);
    }

    function drawParticles(t: number): void {
      function hp(a: number, b: number): number {
        return Math.abs(Math.sin(a * 127.1 + b * 311.7) * 43758.5453) % 1;
      }
      for (let i = 0; i < 20; i++) {
        const spd = 0.6 + hp(i * 11, 3) * 1.6;
        const pha = hp(i * 7,  4) * Math.PI * 2;
        const a   = Math.abs(Math.sin(t * spd + pha));
        if (a < 0.12) continue;
        const inSky = hp(i * 3, 5) < 0.65;
        const px = Math.round(hp(i * 37, 1) * W);
        const py = inSky
          ? Math.round(hp(i * 17, 2) * hz * 0.92)
          : Math.round(hz + hp(i * 17, 2) * (H - hz) * 0.22);
        ctx.globalAlpha = a * 0.60;
        ctx.fillStyle   = hp(i * 13, 6) < 0.6 ? "#ffc85a" : "#ffe8c0";
        ctx.fillRect(px, py, 1, 1);
      }
      ctx.globalAlpha = 1;
    }

    // ── Reeling ───────────────────────────────────────────────────────────
    function pickChallenge(): ChallengeType {
      return CHALLENGE_TYPES[Math.floor(Math.random() * 3)];
    }

    function startChallenge(r: ReelingState, now: number): void {
      r.currentChallenge = pickChallenge();
      r.challengeStart   = now;
      r.targetDigit      = 1 + Math.floor(Math.random() * 5);
      r.holdAccum        = 0;
      r.mashCount        = 0;
    }

    function startReeling(fish: Fish, now: number): void {
      const r        = reelingRef.current;
      r.active       = true;
      r.fishId       = fish.id;
      r.fishStartX   = fish.x;
      r.fishStartY   = fish.y;
      r.challengeDone = 0;
      r.lerpFromX    = fish.x;
      r.lerpFromY    = fish.y;
      r.lerpTargetX  = fish.x;
      r.lerpTargetY  = fish.y;
      r.lerpStartTime = 0; // sentinel → lerpT = 1 immediately (no initial lerp)
      startChallenge(r, now);
    }

    function tickReeling(now: number, dt: number): void {
      const r = reelingRef.current;
      if (!r.active) return;
      const inp = inputRef.current;
      if (!inp) return;

      const fish = fishMgrRef.current.getFish();
      if (!fish || fish.id !== r.fishId) { r.active = false; return; }

      // Lerp fish toward current target position
      const lerpT = r.lerpStartTime === 0
        ? 1
        : Math.min(1, (now - r.lerpStartTime) / 500);
      fish.x = r.lerpFromX + (r.lerpTargetX - r.lerpFromX) * lerpT;
      fish.y = r.lerpFromY + (r.lerpTargetY - r.lerpFromY) * lerpT;

      // Freeze cast line at fish
      const fishCX = pezCX(fish);
      const fishCY = pezCY(fish);
      castRef.current.phase      = "hold";
      castRef.current.phaseStart = now; // reset to prevent auto-retract
      castRef.current.target     = { x: fishCX, y: fishCY };

      // Timeout → fish escapes
      if ((now - r.challengeStart) / 1000 >= 6) {
        fishMgrRef.current.catchFish(fish.id);
        r.active = false;
        castRef.current.phase      = "in";
        castRef.current.phaseStart = now;
        return;
      }

      // Challenge input
      let done = false;
      if (r.currentChallenge === "TYPE_NUMBER") {
        done = inp.consumeKeyPresses(`Digit${r.targetDigit}`) > 0;
      } else if (r.currentChallenge === "HOLD_KEY") {
        if (inp.isKeyDown("Space")) {
          r.holdAccum += dt;
          if (r.holdAccum >= 2) done = true;
        } else {
          r.holdAccum = 0;
        }
      } else {
        r.mashCount += inp.consumeKeyPresses("KeyF");
        if (r.mashCount >= 8) done = true;
      }

      if (!done) return;

      r.challengeDone++;
      r.lerpFromX    = fish.x;
      r.lerpFromY    = fish.y;
      r.lerpTargetX  = r.fishStartX + (rodX - r.fishStartX) * (r.challengeDone / 3);
      r.lerpTargetY  = r.fishStartY + (rodY - r.fishStartY) * (r.challengeDone / 3);
      r.lerpStartTime = now;

      if (r.challengeDone >= 3) {
        scoreRef.current += 100;
        floatingTextsRef.current.push({
          text: "+100", x: pezCX(fish), y: fish.y - 20, startTime: now,
        });
        fishMgrRef.current.catchFish(fish.id);
        r.active = false;
        castRef.current.phase      = "in";
        castRef.current.phaseStart = now;
        return;
      }

      startChallenge(r, now);
    }

    function drawChallengeUI(now: number): void {
      const r = reelingRef.current;
      if (!r.active) return;

      const timeLeft = Math.max(0, 6 - (now - r.challengeStart) / 1000);

      // Timeout bar
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(0, 0, W, 6);
      ctx.fillStyle = "#e63946";
      ctx.fillRect(0, 0, Math.round(W * (timeLeft / 6)), 6);

      // Instruction text
      let line = "";
      if      (r.currentChallenge === "TYPE_NUMBER") line = `PRESS  ${r.targetDigit} !`;
      else if (r.currentChallenge === "HOLD_KEY")    line = "HOLD SPACE 2s!";
      else                                            line = "MASH F  x8!";

      ctx.font = '20px "Press Start 2P", monospace';
      ctx.textAlign = "center";
      ctx.fillStyle = "#000000";
      ctx.fillText(line, W / 2 + 2, 62);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(line, W / 2, 60);

      // Sub-UI
      if (r.currentChallenge === "HOLD_KEY") {
        const bw = 320, bh = 14, bx = Math.round(W / 2 - 160), by = 70;
        ctx.fillStyle = "#333333";
        ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = "#4caf50";
        ctx.fillRect(bx, by, Math.round(bw * Math.min(1, r.holdAccum / 2)), bh);
        ctx.strokeStyle = "#aaaaaa"; ctx.lineWidth = 1;
        ctx.strokeRect(bx, by, bw, bh);
      } else if (r.currentChallenge === "MASH_KEY") {
        ctx.font = '14px "Press Start 2P", monospace';
        ctx.fillStyle = "#000000";
        ctx.fillText(`F  x${r.mashCount} / 8`, W / 2 + 2, 86);
        ctx.fillStyle = "#ffeb3b";
        ctx.fillText(`F  x${r.mashCount} / 8`, W / 2, 84);
      }

      // Progress pips
      ctx.font = '12px "Press Start 2P", monospace';
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i < r.challengeDone ? "#4caf50" : "#555555";
        ctx.fillText("■", W / 2 + (i - 1) * 20 - 5, 108);
      }

      ctx.textAlign = "left";
    }

    function drawScore(): void {
      ctx.font = '14px "Press Start 2P", monospace';
      ctx.textAlign = "left";
      ctx.fillStyle = "#000000";
      ctx.fillText(`SCORE: ${scoreRef.current}`, 22, 32);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(`SCORE: ${scoreRef.current}`, 20, 30);
    }

    function drawFloatingTexts(now: number): void {
      const DURATION = 1500;
      floatingTextsRef.current = floatingTextsRef.current.filter(
        ft => now - ft.startTime < DURATION
      );
      for (const ft of floatingTextsRef.current) {
        const t  = (now - ft.startTime) / DURATION;
        const fy = ft.y - t * 60;
        ctx.globalAlpha = 1 - t;
        ctx.font = '20px "Press Start 2P", monospace';
        ctx.textAlign = "center";
        ctx.fillStyle = "#000000";
        ctx.fillText(ft.text, ft.x + 2, fy + 2);
        ctx.fillStyle = "#ffeb3b";
        ctx.fillText(ft.text, ft.x, fy);
        ctx.textAlign = "left";
      }
      ctx.globalAlpha = 1;
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
      const bob   = Math.sin(Date.now() / 250) * 3;
      const pos   = inp.getHandPosition();
      const mx    = pos.x * W;
      const my    = pos.y * H;
      const angle = Math.atan2(my - (rodY + bob), mx - rodX);

      const leftBound  = Math.ceil(IZQ_WH * H * 0.72);
      const rightBound = W - Math.ceil(DER_WH * H * 0.72);
      fishMgrRef.current.update(dt, W, H, hz, leftBound, rightBound);
      const fish = fishMgrRef.current.getFish();

      // Hook detection — only when not already reeling
      if (!reelingRef.current.active) {
        if (inp.isPinchStart()) {
          let hooked = false;
          if (fish?.state === "swimming") {
            const fishCX = pezCX(fish);
            const fishCY = pezCY(fish);
            if (Math.hypot(mx - fishCX, my - fishCY) < 60) {
              fishMgrRef.current.hookFish(fish.id);
              const ang    = Math.atan2(fishCY - (rodY + bob), fishCX - rodX);
              const origin: Pt = {
                x: rodX + Math.cos(ang) * rodLen,
                y: (rodY + bob) + Math.sin(ang) * rodLen,
              };
              castRef.current = {
                phase: "hold", origin,
                target:  { x: fishCX, y: fishCY },
                control: arcMid(origin, { x: fishCX, y: fishCY }),
                progress: 1.0, phaseStart: now,
                hookedFishId: fish.id,
              };
              startReeling(fish, now);
              hooked = true;
            }
          }
          if (!hooked && castRef.current.phase === "idle") {
            const origin: Pt = {
              x: rodX + Math.cos(angle) * rodLen,
              y: (rodY + bob) + Math.sin(angle) * rodLen,
            };
            castRef.current = {
              phase: "out", origin,
              target:  { x: mx, y: my },
              control: arcMid(origin, { x: mx, y: my }),
              progress: 0, phaseStart: now,
            };
          }
        }

        // Bobber collision during hold
        const c = castRef.current;
        if (c.phase === "hold" && c.hookedFishId === undefined && fish?.state === "swimming") {
          const tip    = quadBez(1.0, c.origin, c.control, c.target);
          const fishCX = pezCX(fish);
          const fishCY = pezCY(fish);
          if (Math.hypot(tip.x - fishCX, tip.y - fishCY) < 60) {
            fishMgrRef.current.hookFish(fish.id);
            c.hookedFishId = fish.id;
            c.target       = { x: fishCX, y: fishCY };
            startReeling(fish, now);
          }
        }
      }

      tickReeling(now, dt);
      tickCast(now);

      // Keep line origin anchored to the live rod tip every frame
      if (castRef.current.phase !== "idle") {
        const tipX = rodX + Math.cos(angle) * rodLen;
        const tipY = (rodY + bob) + Math.sin(angle) * rodLen;
        castRef.current.origin  = { x: tipX, y: tipY };
        castRef.current.control = arcMid({ x: tipX, y: tipY }, castRef.current.target);
      }

      ctx.clearRect(0, 0, W, H);
      drawSky();
      drawOcean();
      drawParticles(now / 1000);
      drawSides();
      drawDistantBoat(now / 1000);
      if (fish) drawFish(fish, now / 1000);
      drawRod(angle, bob);
      drawCastLine();
      drawMuchacho(bob);
      drawFloatingTexts(now);
      drawScore();
      drawChallengeUI(now);

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
