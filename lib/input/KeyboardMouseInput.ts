import type { GameInput, NormalizedPoint } from "./GameInput";

export class KeyboardMouseInput implements GameInput {
  private canvasWidth: number;
  private canvasHeight: number;

  private mouseX = 0;
  private mouseY = 0;

  private buttonDown = false;
  private prevButtonDown = false;
  private _pinchStarted = false;

  private keysDown    = new Set<string>();
  private pressBuffer = new Map<string, number>();

  private onMouseMove: (e: MouseEvent) => void;
  private onMouseDown: (e: MouseEvent) => void;
  private onMouseUp:   (e: MouseEvent) => void;
  private onKeyDown:   (e: KeyboardEvent) => void;
  private onKeyUp:     (e: KeyboardEvent) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvasWidth  = canvas.width;
    this.canvasHeight = canvas.height;

    this.onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      this.mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
      this.mouseY = (e.clientY - rect.top)  * (canvas.height / rect.height);
    };
    this.onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) { this.buttonDown = true; this._pinchStarted = true; }
    };
    this.onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) this.buttonDown = false;
    };
    this.onKeyDown = (e: KeyboardEvent) => {
      if (!this.keysDown.has(e.code)) {
        this.keysDown.add(e.code);
        this.pressBuffer.set(e.code, (this.pressBuffer.get(e.code) ?? 0) + 1);
      }
    };
    this.onKeyUp = (e: KeyboardEvent) => {
      this.keysDown.delete(e.code);
    };

    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup",   this.onMouseUp);
    window.addEventListener("keydown",   this.onKeyDown);
    window.addEventListener("keyup",     this.onKeyUp);
  }

  update(): void {
    this.prevButtonDown = this.buttonDown;
  }

  getHandPosition(_hand?: "left" | "right"): NormalizedPoint {
    return {
      x: this.mouseX / this.canvasWidth,
      y: this.mouseY / this.canvasHeight,
    };
  }

  isPinching(_hand?: "left" | "right"): boolean {
    return this.buttonDown;
  }

  isPinchStart(_hand?: "left" | "right"): boolean {
    if (this._pinchStarted) { this._pinchStarted = false; return true; }
    return false;
  }

  isPinchEnd(_hand?: "left" | "right"): boolean {
    return !this.buttonDown && this.prevButtonDown;
  }

  isGrabbing(): boolean { return false; }

  isKeyDown(code: string): boolean {
    return this.keysDown.has(code);
  }

  consumeKeyPresses(code: string): number {
    const count = this.pressBuffer.get(code) ?? 0;
    this.pressBuffer.delete(code);
    return count;
  }

  dispose(): void {
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup",   this.onMouseUp);
    window.removeEventListener("keydown",   this.onKeyDown);
    window.removeEventListener("keyup",     this.onKeyUp);
  }
}
