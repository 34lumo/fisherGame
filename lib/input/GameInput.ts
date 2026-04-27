export interface NormalizedPoint {
  x: number; // 0-1 across canvas width
  y: number; // 0-1 across canvas height
}

/**
 * Abstraction over input sources (mouse/keyboard, hand tracking, gamepad).
 * All position values are normalized to [0, 1] relative to the game canvas.
 */
export interface GameInput {
  /** Must be called once per frame before reading any state. */
  update(): void;

  /** Primary pointer/hand position, normalized. */
  getHandPosition(hand?: "left" | "right"): NormalizedPoint;

  /** True while the primary action is held (pinch or mouse button). */
  isPinching(hand?: "left" | "right"): boolean;

  /** True only on the first frame the pinch begins. */
  isPinchStart(hand?: "left" | "right"): boolean;

  /** True only on the first frame the pinch ends. */
  isPinchEnd(hand?: "left" | "right"): boolean;

  /** Two-hand grab gesture — false for non-gesture inputs. */
  isGrabbing(): boolean;

  /** Release event listeners and any held resources. */
  dispose(): void;
}
