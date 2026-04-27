export interface Fish {
  id: number;
  x: number;
  y: number;
  size: number;   // base size; drawn width = size * DRAW_SCALE
  speed: number;  // px/s — positive = moving right, negative = moving left
  state: "swimming" | "hooked" | "escaping";
}

const SPAWN_DELAY = 1.5;
const DRAW_SCALE  = 5; // must match PEZ_SCALE in GameCanvas

export class FishManager {
  private fish: Fish | null = null;
  private nextId = 0;
  private spawnTimer = 0;

  update(dt: number, W: number, H: number, horizonY: number,
         leftBound: number, rightBound: number): void {
    if (!this.fish) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) this.spawnFish(W, H, horizonY, leftBound, rightBound);
      return;
    }

    if (this.fish.state !== "swimming") return;

    this.fish.x += this.fish.speed * dt;

    const drawnW = this.fish.size * DRAW_SCALE;

    // Bounce off mountain boundaries
    if (this.fish.speed < 0 && this.fish.x <= leftBound) {
      this.fish.x     = leftBound;
      this.fish.speed = Math.abs(this.fish.speed);
    } else if (this.fish.speed > 0 && this.fish.x + drawnW >= rightBound) {
      this.fish.x     = rightBound - drawnW;
      this.fish.speed = -Math.abs(this.fish.speed);
    }
  }

  private spawnFish(_W: number, H: number, horizonY: number,
                    leftBound: number, rightBound: number): void {
    const oceanH = H - horizonY;
    const minY   = horizonY + oceanH * 0.10;
    const maxY   = H * 0.80;
    const y      = minY + Math.random() * (maxY - minY);

    // size 20-40 → drawn width 100-200px at DRAW_SCALE 5
    const depthT = (y - minY) / (maxY - minY);
    const size   = 20 + depthT * 20;
    const drawnW = size * DRAW_SCALE;

    // Start at a random x within bounds, pick a random direction
    const spawnX  = leftBound + Math.random() * Math.max(0, rightBound - leftBound - drawnW);
    const goRight = Math.random() > 0.5;
    const speed   = 40 + Math.random() * 30; // 40–70 px/s

    this.fish = {
      id:    this.nextId++,
      x:     spawnX,
      y,
      size,
      speed: goRight ? speed : -speed,
      state: "swimming",
    };
  }

  getFish(): Fish | null { return this.fish; }

  hookFish(id: number): void {
    if (this.fish?.id === id) this.fish.state = "hooked";
  }

  releaseFish(id: number): void {
    if (this.fish?.id === id) this.fish.state = "swimming";
  }

  catchFish(id: number): void {
    if (this.fish?.id === id) {
      this.fish        = null;
      this.spawnTimer  = SPAWN_DELAY;
    }
  }
}
