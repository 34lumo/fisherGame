export interface Fish {
  id: number;
  x: number;
  y: number;
  size: number;     // base size; drawn width = size*2, drawn height = size*0.65
  speed: number;    // px/s, always negative (swims left)
  state: "swimming" | "hooked" | "escaping";
}

const SPAWN_DELAY = 1.5;

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

    // drawn width = size * 2; despawn when fully past left boundary
    if (this.fish.x + this.fish.size * 2 < leftBound) {
      this.fish = null;
      this.spawnTimer = SPAWN_DELAY;
    }
  }

  private spawnFish(_W: number, H: number, horizonY: number,
                    _leftBound: number, rightBound: number): void {
    const oceanH = H - horizonY;
    const minY   = horizonY + oceanH * 0.10;
    const maxY   = H * 0.80;
    const y      = minY + Math.random() * (maxY - minY);

    // size 12-26 → drawn width 24-52 px
    const depthT = (y - minY) / (maxY - minY);
    const size   = 12 + depthT * 14;

    this.fish = {
      id:    this.nextId++,
      x:     rightBound,
      y,
      size,
      speed: -(80 + Math.random() * 60),
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
      this.fish = null;
      this.spawnTimer = SPAWN_DELAY;
    }
  }
}
