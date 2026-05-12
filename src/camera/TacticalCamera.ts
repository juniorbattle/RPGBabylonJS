/**
 * TacticalCamera.ts
 * Manages tactical view modes for the HD-2D combat scene.
 * Focus is the cinematic stage view used by attacks, skills, and dramatic close-ups.
 * Updated for HD-2D Diorama Style.
 */

import {
  Scene, Vector3, FreeCamera, Observer,
} from '@babylonjs/core';

export enum CameraMode {
  Overview = 'Overview',
  Normal   = 'Normal',
  Focus    = 'Focus',
}

export interface CameraConfig {
  distanceMultiplier: number;
  fixedHeight:        number;
  tiltAngle:          number;
  fieldOfView:        number;
  overviewYOffset:    number;
  overviewZOffset:    number;
  overviewRotationX:  number;
  focusYOffset:       number;
  focusZOffset:       number;
  focusRotationX:     number;
  focusFOV:           number;
  normalFramingOffsetZ: number;
  normalFollowXFactor: number;
  smoothSpeed:        number;
  zFollowFactor:      number;
  zoomSensitivity:    number;
}

const DEFAULT_CONFIG: CameraConfig = {
  distanceMultiplier: 3.5,
  fixedHeight:        6.2,
  tiltAngle:          10,
  fieldOfView:        25,
  overviewYOffset:    18,
  overviewZOffset:   -4,
  overviewRotationX:  34,
  focusYOffset:      -5,
  focusZOffset:       5,
  focusRotationX:     30,
  focusFOV:           12,
  normalFramingOffsetZ: -10.2,
  normalFollowXFactor: 0.55,
  smoothSpeed:        0.2,
  zFollowFactor:      1.0,  // Keep Z movement 1:1 with target
  zoomSensitivity:    4.0,
};

export class TacticalCamera {

  private scene: Scene;
  private cam:   FreeCamera;
  readonly config: CameraConfig;

  // ─── Public Stage Overrides ──────────────────────────────────────────────
  // Focus / Cinematic Stage Mode for Attacks (Frontal & Close-up)
  public stageRotationX: number = 4;    // Very low tilt, looking almost flat
  public stageHeight:    number = 1.35; // Chest level
  public stageDistance:  number = 7.2;  // Close frontal stage with room for full sprites
  public stageFOV:       number = 42;   // Widen FOV for dramatic 3D depth

  // ─── Internal State ──────────────────────────────────────────────────────
  private basePosition: Vector3 = Vector3.Zero();
  private baseFOV:      number  = 15;
  private mapCenterZ:   number  = 0;

  private currentMode: CameraMode = CameraMode.Normal;
  private followTarget: Vector3 | null = null;
  private followEnabled: boolean = true;
  private transitioning: boolean = false;

  private isDragging:       boolean = false;
  private dragStartX:       number  = 0;
  private dragStartCamX:    number  = 0;

  private shaking:      boolean = false;
  private shakeOrigin:  Vector3 = Vector3.Zero();
  private canvas: HTMLCanvasElement | null = null;
  private wheelHandler: ((e: WheelEvent) => void) | null = null;
  private mouseDownHandler: ((e: MouseEvent) => void) | null = null;
  private mouseMoveHandler: ((e: MouseEvent) => void) | null = null;
  private mouseUpHandler: ((e: MouseEvent) => void) | null = null;
  private followObserver: Observer<Scene> | null = null;

  constructor(scene: Scene, config: Partial<CameraConfig> = {}) {
    this.scene  = scene;
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.cam = new FreeCamera('TacticalCamera', new Vector3(0, 10, -15), scene);
    this.cam.setTarget(Vector3.Zero());
    this.cam.fov = (this.config.fieldOfView * Math.PI) / 180;
    this.cam.minZ = 0.5;
    this.cam.inputs.clear();

    this.bindInput();
  }

  // ─── Map Configuration ──────────────────────────────────────────────────

  configureForMap(width: number, depth: number, tileSize: number, _maxHeight: number = 0): void {
    const mapDepth = depth * tileSize;
    const mapWidth = width * tileSize;

    this.mapCenterZ = mapDepth / 2;
    
    // Trigonometric centering to frame map
    const tiltRad = (this.config.tiltAngle * Math.PI) / 180;
    const zOffset = this.config.fixedHeight / Math.tan(tiltRad);

    // Negative Z offset pushes camera forward, lowering the stage in frame.
    const framingOffsetZ = this.config.normalFramingOffsetZ; 

    this.basePosition = new Vector3(0, this.config.fixedHeight, this.mapCenterZ - zOffset - framingOffsetZ);
    this.baseFOV = Math.max(this.config.fieldOfView, (width * tileSize) * 0.98);
    this.baseFOV = Math.min(this.baseFOV, 27);

    this.cam.position.copyFrom(this.basePosition);
    this.cam.rotation.x = tiltRad;
    this.cam.fov        = (this.baseFOV * Math.PI) / 180;
    
    console.log(`📷 Diorama Camera configured for ${width}x${depth} map`);
  }

  // ─── View Modes ──────────────────────────────────────────────────────────

  async setNormalMode(): Promise<void> {
    this.followEnabled = true;
    this.currentMode   = CameraMode.Normal;
    
    if (!this.followTarget) return Promise.resolve();

    const tiltRad = (this.config.tiltAngle * Math.PI) / 180;
    const framingOffsetZ = this.config.normalFramingOffsetZ;
    
    const target = new Vector3(
      this.followTarget.x * this.config.normalFollowXFactor,
      this.config.fixedHeight, 
      this.followTarget.z - (this.config.fixedHeight / Math.tan(tiltRad)) - framingOffsetZ
    );
    return this.transitionTo(target, this.config.tiltAngle, this.baseFOV, 0.4);
  }

  async setOverviewMode(): Promise<void> {
    this.followEnabled = false;
    this.currentMode   = CameraMode.Overview;

    const overviewRotation = this.config.overviewRotationX;
    const tiltRad = (overviewRotation * Math.PI) / 180;
    
    // Lift the camera for tactical clarity without losing the frontal theater read.
    const h = this.basePosition.y + this.config.overviewYOffset;
    const zOff = h / Math.tan(tiltRad);

    // Aim right at the center of the map
    const target = new Vector3(
      this.cam.position.x,
      h,
      this.mapCenterZ - zOff + this.config.overviewZOffset
    );
    
    return this.transitionTo(target, overviewRotation, this.baseFOV * 1.45, 0.5);
  }

  async setFocusMode(): Promise<void> {
    this.followEnabled = true;
    this.currentMode   = CameraMode.Focus;

    if (!this.followTarget) return Promise.resolve();

    const target = new Vector3(
      this.followTarget.x,
      this.followTarget.y + this.stageHeight,
      this.followTarget.z - this.stageDistance
    );
    return this.transitionTo(target, this.stageRotationX, this.stageFOV, 0.35);
  }

  // ─── Smooth Transition Engine ───────────────────────────────────────────

  private async transitionTo(
    targetPos: Vector3,
    rotXDeg:   number,
    fovDeg:    number,
    duration:  number
  ): Promise<void> {
    if (this.transitioning) return;
    this.transitioning = true;

    const startPos = this.cam.position.clone();
    const startRot = this.cam.rotation.x * (180 / Math.PI);
    const startFov = (this.cam.fov * 180) / Math.PI;
    let elapsed = 0;

    return new Promise(resolve => {
        const obs = this.scene.onBeforeRenderObservable.add(() => {
            elapsed += this.scene.getEngine().getDeltaTime() / 1000;
            const t = Math.min(elapsed / duration, 1);
            const s = t * t * (3 - 2 * t); // smoothstep

            this.cam.position = Vector3.Lerp(startPos, targetPos, s);
            this.cam.rotation.x = ((startRot + (rotXDeg - startRot) * s) * Math.PI) / 180;
            this.cam.fov         = ((startFov + (fovDeg - startFov) * s) * Math.PI) / 180;

            if (t >= 1) {
                this.scene.onBeforeRenderObservable.remove(obs);
                this.transitioning = false;
                resolve();
            }
        });
    });
  }

  // ─── Cinematic Stage Methods ──────────────────────────────────────────────

  /** Position camera precisely for Focus / Combat Stage. */
  async slideToStage(targetWorldPos: Vector3, isAOE: boolean = false, duration: number = 0.5): Promise<void> {
      this.disableFollow();
      
      const dist = isAOE ? this.stageDistance * 1.2 : this.stageDistance;
      const targetPos = new Vector3(
          targetWorldPos.x,
          targetWorldPos.y + this.stageHeight,
          targetWorldPos.z - dist
      );
      
      const fov = isAOE ? this.stageFOV + 8 : this.stageFOV;
      return this.transitionTo(targetPos, this.stageRotationX, fov, duration);
  }

  /** Soft snap for start of sequences */
  snapToPosition(targetWorldPos: Vector3, fovDeg: number): void {
      this.cam.position.copyFrom(new Vector3(
          targetWorldPos.x,
          targetWorldPos.y + this.stageHeight,
          targetWorldPos.z - this.stageDistance
      ));
      this.cam.rotation.x = (this.stageRotationX * Math.PI) / 180;
      this.cam.fov         = (fovDeg * Math.PI) / 180;
  }

  // ─── Effects ──────────────────────────────────────────────────────────────

  async shakeCamera(duration = 0.3, intensity = 0.15): Promise<void> {
    if (this.shaking) return;
    this.shaking = true;
    this.shakeOrigin.copyFrom(this.cam.position);
    let elapsed = 0;

    return new Promise(resolve => {
      const obs = this.scene.onBeforeRenderObservable.add(() => {
        elapsed += this.scene.getEngine().getDeltaTime() / 1000;
        if (elapsed < duration) {
          this.cam.position.x = this.shakeOrigin.x + (Math.random() - 0.5) * intensity;
          this.cam.position.y = this.shakeOrigin.y + (Math.random() - 0.5) * intensity;
        } else {
          this.cam.position.copyFrom(this.shakeOrigin);
          this.shaking = false;
          this.scene.onBeforeRenderObservable.remove(obs);
          resolve();
        }
      });
    });
  }

  // ─── Follow & Logic ────────────────────────────────────────────────────────

  setFollowTarget(pos: Vector3 | null): void {
    this.followTarget = pos;
  }

  enableFollow():  void { this.followEnabled = true; }
  disableFollow(): void { this.followEnabled = false; }

  private updateFollow(): void {
    if (!this.followEnabled || !this.followTarget || this.transitioning || this.isDragging) return;

    const dt = this.scene.getEngine().getDeltaTime() / 1000;
    const lerpSpeed = this.config.smoothSpeed * 60 * dt;

    const targetX = this.currentMode === CameraMode.Normal
      ? this.followTarget.x * this.config.normalFollowXFactor
      : this.followTarget.x;
    this.cam.position.x += (targetX - this.cam.position.x) * Math.min(lerpSpeed, 1.0);

    // Follow Z dynamically using trigonometric projection to the target 
    const tiltRad = this.cam.rotation.x;
    
    // Check if we are in normal mode to apply the framing offset smoothly
    const offsetZ = (this.currentMode === CameraMode.Normal) ? this.config.normalFramingOffsetZ : 0;
    const targetCamZ = this.followTarget.z - (this.cam.position.y / Math.tan(tiltRad)) - offsetZ;
    
    this.cam.position.z += (targetCamZ - this.cam.position.z) * Math.min(lerpSpeed * 0.6, 1.0);
  }

  // ─── Input & Lifecycle ────────────────────────────────────────────────────

  private bindInput(): void {
    const canvas = this.scene.getEngine().getRenderingCanvas();
    if (!canvas) return;
    this.canvas = canvas;

    // Zoom (Wheel)
    this.wheelHandler = (e: WheelEvent) => {
        if (this.transitioning) return;
        const delta = e.deltaY * 0.005 * (this.config.zoomSensitivity * 0.5); // Tune zoom for FOV
        // For Diorama, we zoom by adjusting the FOV rather than displacing the camera
        const currentFovDeg = (this.cam.fov * 180) / Math.PI;
        const newFovDeg = Math.min(45, Math.max(5, currentFovDeg + delta));
        this.cam.fov = (newFovDeg * Math.PI) / 180;
    };
    canvas.addEventListener('wheel', this.wheelHandler, { passive: false });

    // Middle-click Pan
    this.mouseDownHandler = (e: MouseEvent) => {
        if (e.button !== 1) return;
        this.isDragging = true;
        this.dragStartX = e.clientX;
        this.dragStartCamX = this.cam.position.x;
        this.disableFollow();
    };
    canvas.addEventListener('mousedown', this.mouseDownHandler);

    this.mouseMoveHandler = (e: MouseEvent) => {
        if (!this.isDragging) return;
        const dx = (e.clientX - this.dragStartX) * 0.025;
        this.cam.position.x = this.dragStartCamX - dx;
    };
    window.addEventListener('mousemove', this.mouseMoveHandler);

    this.mouseUpHandler = (e: MouseEvent) => {
        if (e.button === 1) this.isDragging = false;
    };
    window.addEventListener('mouseup', this.mouseUpHandler);

    this.followObserver = this.scene.onBeforeRenderObservable.add(() => this.updateFollow());
  }

  getCurrentState() {
      return {
          position: this.cam.position.clone(),
          rotation: this.cam.rotation.clone(),
          fov:      this.cam.fov,
          mode:     this.currentMode,
          followTarget: this.followTarget
      };
  }

  async restoreState(state: any, duration: number = 0.5): Promise<void> {
      this.currentMode = state.mode;
      this.followTarget = state.followTarget;
      this.followEnabled = true;
      return this.transitionTo(state.position, state.rotation.x * (180/Math.PI), state.fov * (180/Math.PI), duration);
  }

  get babylonCamera(): FreeCamera { return this.cam; }
  dispose(): void {
    if (this.canvas && this.wheelHandler) {
      this.canvas.removeEventListener('wheel', this.wheelHandler);
    }
    if (this.canvas && this.mouseDownHandler) {
      this.canvas.removeEventListener('mousedown', this.mouseDownHandler);
    }
    if (this.mouseMoveHandler) {
      window.removeEventListener('mousemove', this.mouseMoveHandler);
    }
    if (this.mouseUpHandler) {
      window.removeEventListener('mouseup', this.mouseUpHandler);
    }
    if (this.followObserver) {
      this.scene.onBeforeRenderObservable.remove(this.followObserver);
      this.followObserver = null;
    }

    this.canvas = null;
    this.wheelHandler = null;
    this.mouseDownHandler = null;
    this.mouseMoveHandler = null;
    this.mouseUpHandler = null;
    this.cam.dispose();
  }
}
