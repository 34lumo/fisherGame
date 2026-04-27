# SteadyArc Fishing Game — Progress Log

## Current State (April 27, 2026)

### What's built
- Fullscreen canvas (100vw × 100vh), resizes correctly on window resize
- Scene: sky gradient, ocean with wave dashes, side mountain sprites (ladoIzq.png, ladoder.png)
- Player: muchacho.png sprite, bottom-center, 25% canvas width
- Fishing rod: tracks mouse angle in real time, casts on click with bezier arc animation, bobber sprite, auto-retracts
- Distant boat: pixel art sprite, top-right, bobs on sine wave
- Input layer: KeyboardMouseInput implements GameInput interface. CVInput stub ready for Álvaro.

### What's NOT built yet (next steps)
- Fish spawning and swimming
- Hook collision detection with fish
- Challenge system (PINCH, FINGERS_N, SMILE, etc.)
- Struggling mechanic (fish travels to boat while player holds challenge)
- Score counter and boat fill animation
- Results screen (session ends at 5 caught fish)
- Sound (v2)

### Architecture
Read CLAUDE.md for full spec. Three-layer architecture:
- `/lib/input/` — input abstraction (swap KeyboardMouseInput for CVInput when Álvaro is ready)
- `/lib/game/` — game logic (not yet implemented, next priority)
- `/lib/render/` — rendering (currently all in GameCanvas.tsx, refactor when game logic is added)

### Key files
- `components/GameCanvas.tsx` — main game loop and rendering
- `lib/input/InputInterface.ts` — GameInput interface
- `lib/input/KeyboardMouseInput.ts` — mouse/keyboard implementation
- `lib/input/CVInput.ts` — stub for computer vision (Álvaro fills this in)
- `public/muchacho.png` — player boat sprite
- `public/ladoIzq.png` — left mountain sprite  
- `public/ladoder.png` — right mountain sprite
- `CLAUDE.md` — full project spec, read this first

### For Marco / new contributors
1. Read CLAUDE.md completely before touching any code
2. Run `npm install && npm run dev`
3. Next task: implement fish spawning in `/lib/game/FishManager.ts` following the spec in CLAUDE.md
