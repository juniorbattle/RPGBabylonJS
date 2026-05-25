/**
 * SceneBackdropManager.ts — Single-plane backdrop for HD-2D diorama scenery.
 *
 * Replaces the deprecated SceneLayerManager "panel stack" with one billboarded
 * plane positioned at a fixed distance from the camera. The plane is either :
 *
 *   - textured with a backdrop painting (`BackdropConfig.image`), OR
 *   - filled with a procedural vertical gradient generated on the fly into a
 *     DynamicTexture (no asset required).
 *
 * The plane size is computed from the camera's vertical FOV so that it always
 * fills the visible viewport, multiplied by `oversize` to absorb Overview
 * FOV widening and horizontal parallax sliding.
 *
 * Horizontal parallax : every frame, the X position of the backdrop is
 * recomputed from the camera X position scaled by `parallaxFactor`. The Y
 * and Z are kept fixed relative to the camera frustum.
 */

import {
    Scene,
    TransformNode,
    Mesh,
    MeshBuilder,
    StandardMaterial,
    Color3,
    Texture,
    DynamicTexture,
    Vector3,
    Camera,
    Observer,
} from '@babylonjs/core';

import type { BackdropConfig } from './SceneryTypes';

const PUBLIC_BACKDROPS = 'assets/backdrops/';

export class SceneBackdropManager {
    private scene: Scene;
    private root: TransformNode;
    private camera: Camera;

    private plane: Mesh | null = null;
    private material: StandardMaterial | null = null;
    private silhouette: Mesh | null = null;
    private silhouetteMat: StandardMaterial | null = null;

    private config: Required<Omit<BackdropConfig, 'image' | 'silhouette'>> & {
        image?: string;
        silhouette?: BackdropConfig['silhouette'];
    };
    private cameraStartX = 0;
    private parallaxObserver: Observer<Scene> | null = null;

    constructor(scene: Scene, parent: TransformNode, camera: Camera) {
        this.scene = scene;
        this.root = new TransformNode('BackdropRoot', scene);
        this.root.parent = parent;
        this.camera = camera;

        this.config = {
            gradient: { top: [0.04, 0.08, 0.10], bottom: [0.10, 0.20, 0.14] },
            distance: 80,
            parallaxFactor: 0.15,
            oversize: 1.3,
        };
    }

    /**
     * Build / rebuild the backdrop from the given configuration.
     * Calling this disposes any previous backdrop mesh.
     */
    setup(config: BackdropConfig): void {
        // Merge with defaults.
        this.config = {
            gradient: config.gradient ?? this.config.gradient,
            distance: config.distance ?? 80,
            parallaxFactor: config.parallaxFactor ?? 0.15,
            oversize: config.oversize ?? 1.3,
            image: config.image,
            silhouette: config.silhouette,
        };

        this.disposeMeshes();
        this.cameraStartX = this.camera.position.x;

        const { width, height } = this.computePlaneSize();
        const plane = MeshBuilder.CreatePlane('backdropPlane', { width, height }, this.scene);
        plane.parent = this.root;
        plane.isPickable = false;
        plane.renderingGroupId = 0;
        plane.alwaysSelectAsActiveMesh = true;
        // Place backdrop at distance behind camera (along +Z in world).
        plane.position = new Vector3(this.camera.position.x, this.camera.position.y, this.camera.position.z + this.config.distance);

        const mat = new StandardMaterial('backdropMat', this.scene);
        mat.disableLighting = true;
        mat.backFaceCulling = false;
        mat.specularColor = Color3.Black();
        mat.diffuseColor = Color3.White();
        mat.emissiveColor = Color3.White();
        mat.disableDepthWrite = false;

        if (config.image) {
            const url = `${PUBLIC_BACKDROPS}${config.image}`;
            const tex = new Texture(url, this.scene, false, false, Texture.TRILINEAR_SAMPLINGMODE);
            tex.hasAlpha = false;
            mat.diffuseTexture = tex;
            mat.emissiveTexture = tex;
        } else {
            // Procedural vertical gradient.
            mat.diffuseTexture = this.buildGradientTexture();
            mat.emissiveTexture = mat.diffuseTexture;
        }

        plane.material = mat;
        this.plane = plane;
        this.material = mat;

        if (config.silhouette?.image) {
            this.buildSilhouette(config.silhouette, width, height);
        }

        this.startParallax();
    }

    /**
     * Re-tints the procedural gradient at runtime. No-op if a textured image
     * backdrop is in use.
     */
    setGradient(top: [number, number, number], bottom: [number, number, number]): void {
        this.config.gradient = { top, bottom };
        if (!this.material || this.config.image) return;
        this.material.diffuseTexture?.dispose();
        const tex = this.buildGradientTexture();
        this.material.diffuseTexture = tex;
        this.material.emissiveTexture = tex;
    }

    dispose(): void {
        if (this.parallaxObserver) {
            this.scene.onBeforeRenderObservable.remove(this.parallaxObserver);
            this.parallaxObserver = null;
        }
        this.disposeMeshes();
        this.root.dispose();
    }

    private disposeMeshes(): void {
        this.silhouette?.dispose();
        this.silhouetteMat?.dispose();
        this.silhouette = null;
        this.silhouetteMat = null;

        this.plane?.dispose();
        this.material?.diffuseTexture?.dispose();
        this.material?.dispose();
        this.plane = null;
        this.material = null;
    }

    private computePlaneSize(): { width: number; height: number } {
        // For a PerspectiveCamera with fov in radians (Babylon vertical FOV) :
        //   visibleHeight = 2 * distance * tan(fov / 2)
        //   visibleWidth  = visibleHeight * aspectRatio
        const fov = (this.camera as any).fov ?? 0.8; // ~46° fallback
        const engine = this.scene.getEngine();
        const aspect = engine.getRenderWidth() / Math.max(1, engine.getRenderHeight());
        const distance = this.config.distance;
        const oversize = this.config.oversize;
        const visibleHeight = 2 * distance * Math.tan(fov / 2);
        const visibleWidth = visibleHeight * aspect;
        return {
            width: visibleWidth * oversize,
            height: visibleHeight * oversize,
        };
    }

    private buildGradientTexture(): DynamicTexture {
        const size = 256;
        const tex = new DynamicTexture('backdropGradientTex', { width: 16, height: size }, this.scene, false);
        const ctx = tex.getContext() as CanvasRenderingContext2D;
        const [tr, tg, tb] = this.config.gradient.top;
        const [br, bg, bb] = this.config.gradient.bottom;
        const grad = ctx.createLinearGradient(0, 0, 0, size);
        grad.addColorStop(0, `rgb(${Math.round(tr * 255)}, ${Math.round(tg * 255)}, ${Math.round(tb * 255)})`);
        grad.addColorStop(1, `rgb(${Math.round(br * 255)}, ${Math.round(bg * 255)}, ${Math.round(bb * 255)})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 16, size);
        tex.update(false);
        tex.hasAlpha = false;
        tex.wrapU = Texture.CLAMP_ADDRESSMODE;
        tex.wrapV = Texture.CLAMP_ADDRESSMODE;
        return tex;
    }

    private buildSilhouette(
        cfg: NonNullable<BackdropConfig['silhouette']>,
        width: number,
        height: number,
    ): void {
        // Silhouette plane sits slightly in front of the backdrop (closer to camera).
        const silDist = this.config.distance - 6;
        const ratio = silDist / this.config.distance;
        const w = width * ratio;
        const h = height * ratio;
        const plane = MeshBuilder.CreatePlane('backdropSilhouette', { width: w, height: h * 0.55 }, this.scene);
        plane.parent = this.root;
        plane.isPickable = false;
        plane.renderingGroupId = 0;
        plane.alwaysSelectAsActiveMesh = true;
        plane.position = new Vector3(
            this.camera.position.x,
            this.camera.position.y - h * 0.15,
            this.camera.position.z + silDist,
        );

        const mat = new StandardMaterial('backdropSilhouetteMat', this.scene);
        mat.disableLighting = true;
        mat.backFaceCulling = false;
        mat.useAlphaFromDiffuseTexture = true;
        mat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
        mat.disableDepthWrite = true;
        const tex = new Texture(`${PUBLIC_BACKDROPS}${cfg.image}`, this.scene, false, false, Texture.TRILINEAR_SAMPLINGMODE);
        tex.hasAlpha = true;
        mat.diffuseTexture = tex;
        const tint = cfg.tint ?? [1, 1, 1];
        mat.emissiveColor = new Color3(tint[0], tint[1], tint[2]);
        mat.alpha = cfg.opacity ?? 1;

        plane.material = mat;
        this.silhouette = plane;
        this.silhouetteMat = mat;
    }

    private startParallax(): void {
        if (this.parallaxObserver) return;
        this.parallaxObserver = this.scene.onBeforeRenderObservable.add(() => this.update());
    }

    private update(): void {
        if (!this.plane) return;
        // The backdrop tracks the camera with a parallax-attenuated X offset.
        // parallaxFactor = 0 → fully glued to the camera frame (no scrolling).
        // parallaxFactor = 1 → backdrop is world-fixed, slides across the screen freely.
        const camX = this.camera.position.x;
        const camY = this.camera.position.y;
        const camZ = this.camera.position.z;
        const dx = camX - this.cameraStartX;
        const newX = camX - dx * this.config.parallaxFactor; // = cameraStartX + (1-p)*(camX-cameraStartX) ... refined below
        // The intended behavior : backdrop world X drifts SLOWER than camera by factor parallaxFactor.
        // So screen-relative offset = (1 - parallaxFactor) * dx.
        // World position = camX - screenOffset = camX - (1 - parallaxFactor) * dx = cameraStartX + parallaxFactor * dx.
        const worldX = this.cameraStartX + this.config.parallaxFactor * dx;
        this.plane.position.set(worldX, camY, camZ + this.config.distance);

        if (this.silhouette) {
            // Silhouette parallax is slightly stronger (closer to camera = bigger apparent motion).
            const silDist = this.config.distance - 6;
            const silFactor = Math.min(1, this.config.parallaxFactor * 1.6);
            const silWorldX = this.cameraStartX + silFactor * dx;
            this.silhouette.position.set(silWorldX, camY - this.silhouette.scaling.y * 0.5, camZ + silDist);
        }

        // Use newX in a no-op assignment to silence unused-var warnings if any.
        void newX;
    }
}
