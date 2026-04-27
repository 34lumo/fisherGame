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

// Wave positions as fractions: [x/W, (y − horizonY) / oceanH, len/W]
const WAVES = [
  [0.094, 0.086, 0.015], [0.615, 0.105, 0.010], [0.865, 0.094, 0.017],
  [0.260, 0.297, 0.019], [0.719, 0.277, 0.015],
  [0.135, 0.512, 0.023], [0.510, 0.492, 0.019],
  [0.323, 0.727, 0.027], [0.677, 0.703, 0.023], [0.875, 0.746, 0.021],
] as const;

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
    const pez = new Image(); pez.src = "/pez.png";       pezRef.current = pez;

    // ── Layout ────────────────────────────────────────────────────────────
    let W = 0, H = 0, hz = 0;
    let sprW = 0, sprH = 0, sprX = 0, sprY = 0;
    let rodX = 0, rodY = 0, rodLen = 0;
    let dbX  = 0, dbY  = 0;

    function applyLayout() {
      W = canvas!.width;  H = canvas!.height;
      hz = Math.round(H * 0.20);
      sprW = Math.round(W * 0.25);
      sprH = Math.round(sprW * MUC_HW);
      sprX = Math.round((W - sprW) / 2);
      sprY = H - sprH;
      rodLen = Math.round(sprW * 0.22);
      rodX   = Math.round(W / 2);
      rodY   = Math.round(sprY + sprH * 0.38);
      dbX = Math.round(W * 0.87);
      dbY = Math.round(hz + H * 0.02);
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
      const g = ctx.createLinearGradient(0, 0, 0, hz);
      g.addColorStop(0,    "#87ceeb");
      g.addColorStop(0.55, "#55b8d8");
      g.addColorStop(1,    "#2b9fc4");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, hz);
    }

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

    function drawMuchacho(t: number) {
      const i = mucRef.current;
      if (!i?.complete || !i.naturalWidth) return;
      const bob = Math.sin(t * 0.9) * 2;
      ctx.drawImage(i, sprX, sprY + bob, sprW, sprH);
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
      const pos   = inp.getHandPosition();
      const mx    = pos.x * W;
      const my    = pos.y * H;
      const angle = Math.atan2(my - rodY, mx - rodX);

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
              const ang    = Math.atan2(fishCY - rodY, fishCX - rodX);
              const origin: Pt = {
                x: rodX + Math.cos(ang) * rodLen,
                y: rodY + Math.sin(ang) * rodLen,
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
              y: rodY + Math.sin(angle) * rodLen,
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

      ctx.clearRect(0, 0, W, H);
      drawSky();
      drawOcean();
      drawSides();
      drawDistantBoat(now / 1000);
      if (fish) drawFish(fish, now / 1000);
      drawRod(angle);
      drawCastLine();
      drawMuchacho(now / 1000);
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
