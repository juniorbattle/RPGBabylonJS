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

    /**
     * Paints a full atmospheric backdrop on a 1024x1024 dynamic texture :
     *   1. Vertical sky gradient (top -> bottom config colors).
     *   2. Soft moonlight halo near the top centre, suggesting an off-screen
     *      key light source above the camera.
     *   3. Horizontal fog bands in the lower-mid section to fake aerial
     *      perspective.
     *   4. Three layers of procedural distant tree silhouettes
     *      (background / mid-back / foreground), each darker and taller than
     *      the one behind it. Stochastic but deterministic per session.
     *   5. Ground haze at the bottom that blends the backdrop into the
     *      combat plateau ground colour.
     *
     * The result is a single self-contained painting that ships ZERO image
     * assets and still gives the scene 5+ depth cues out of the box.
     */
    private buildGradientTexture(): DynamicTexture {
        const W = 1024;
        const H = 1024;
        const tex = new DynamicTexture(
            'backdropGradientTex',
            { width: W, height: H },
            this.scene,
            false,
        );
        const ctx = tex.getContext() as CanvasRenderingContext2D;
        const [tr, tg, tb] = this.config.gradient.top;
        const [br, bg, bb] = this.config.gradient.bottom;
        const topRGB = `rgb(${(tr * 255) | 0}, ${(tg * 255) | 0}, ${(tb * 255) | 0})`;
        const botRGB = `rgb(${(br * 255) | 0}, ${(bg * 255) | 0}, ${(bb * 255) | 0})`;
        // Tertiary "horizon glow" colour : a lifted, slightly warmer interpolation
        // of top + bottom so the sky reads as deeper at the zenith and brighter
        // where it meets the tree line.
        const horR = Math.min(255, ((tr + br) * 0.5 * 255 + 18) | 0);
        const horG = Math.min(255, ((tg + bg) * 0.5 * 255 + 28) | 0);
        const horB = Math.min(255, ((tb + bb) * 0.5 * 255 + 16) | 0);
        const horizonRGB = `rgb(${horR}, ${horG}, ${horB})`;

        // 1. Base vertical gradient : zenith dark → horizon lifted → ground.
        const sky = ctx.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0.00, topRGB);
        sky.addColorStop(0.40, topRGB);
        sky.addColorStop(0.62, horizonRGB);
        sky.addColorStop(1.00, botRGB);
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, H);

        // 2a. Central moonlight halo : a soft, large radial glow dead-center
        //     high in the frame. This is the new focal hero light source.
        const haloX = W * 0.50;
        const haloY = H * 0.18;
        const halo = ctx.createRadialGradient(haloX, haloY, 20, haloX, haloY, H * 0.65);
        halo.addColorStop(0.00, 'rgba(220, 220, 200, 0.22)');
        halo.addColorStop(0.20, 'rgba(180, 210, 200, 0.13)');
        halo.addColorStop(0.55, 'rgba(120, 180, 180, 0.05)');
        halo.addColorStop(1.00, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = halo;
        ctx.fillRect(0, 0, W, H);

        // 2b. Off-screen rim hint : preserved upper-right small halo so the
        //     scene still feels like it has a directional sun outside the
        //     frame, not just a centered moon.
        const moonX = W * 0.88;
        const moonY = H * 0.10;
        const moon = ctx.createRadialGradient(moonX, moonY, 8, moonX, moonY, H * 0.40);
        moon.addColorStop(0.0, 'rgba(220, 200, 170, 0.14)');
        moon.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = moon;
        ctx.fillRect(0, 0, W, H);

        // 3. Aurora streak : two diagonal soft colour bands across the upper
        //    half. One mauve, one teal, both very low opacity so they read
        //    as magical atmosphere rather than literal aurora ribbons.
        ctx.save();
        ctx.translate(W * 0.5, H * 0.30);
        ctx.rotate(-0.12);
        const aurora1 = ctx.createLinearGradient(-W * 0.6, -40, W * 0.6, 40);
        aurora1.addColorStop(0.0, 'rgba(110,  80, 180, 0.00)');
        aurora1.addColorStop(0.5, 'rgba(160, 110, 220, 0.10)');
        aurora1.addColorStop(1.0, 'rgba(110,  80, 180, 0.00)');
        ctx.fillStyle = aurora1;
        ctx.fillRect(-W * 0.6, -40, W * 1.2, 80);
        ctx.restore();

        ctx.save();
        ctx.translate(W * 0.5, H * 0.42);
        ctx.rotate(0.08);
        const aurora2 = ctx.createLinearGradient(-W * 0.6, -25, W * 0.6, 25);
        aurora2.addColorStop(0.0, 'rgba( 60, 200, 200, 0.00)');
        aurora2.addColorStop(0.5, 'rgba(110, 240, 230, 0.09)');
        aurora2.addColorStop(1.0, 'rgba( 60, 200, 200, 0.00)');
        ctx.fillStyle = aurora2;
        ctx.fillRect(-W * 0.6, -25, W * 1.2, 50);
        ctx.restore();

        // 4. Horizontal fog bands (aerial perspective on the back row).
        for (let i = 0; i < 6; i++) {
            const y = H * (0.50 + i * 0.07);
            const band = ctx.createLinearGradient(0, y - 30, 0, y + 30);
            band.addColorStop(0, 'rgba(255, 255, 255, 0)');
            band.addColorStop(0.5, `rgba(${(tr * 255 + 30) | 0}, ${(tg * 255 + 40) | 0}, ${(tb * 255 + 30) | 0}, 0.10)`);
            band.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = band;
            ctx.fillRect(0, y - 30, W, 60);
        }

        // 5. Procedural tree silhouettes — three depth layers with branching
        //    forks instead of plain triangles, for a more organic horizon.
        const rng = this.seededRng(20260524);
        const drawSilhouetteRow = (
            row: number,
            count: number,
            baseHeight: number,
            heightVariance: number,
            opacity: number,
            tintFactor: number,
        ) => {
            const baseline = H * (0.62 + row * 0.08);
            const darkR = (((tr * 255) | 0) * tintFactor) | 0;
            const darkG = (((tg * 255) | 0) * tintFactor) | 0;
            const darkB = (((tb * 255) | 0) * tintFactor) | 0;
            ctx.fillStyle = `rgba(${darkR}, ${darkG}, ${darkB}, ${opacity})`;
            for (let i = 0; i < count; i++) {
                const cx = (i + rng() * 0.8) * (W / count);
                const treeH = baseHeight + rng() * heightVariance;
                const treeW = treeH * (0.32 + rng() * 0.28);
                const lean = (rng() - 0.5) * 0.15;
                // Main trunk + canopy : irregular pentagon for a hand-drawn feel.
                ctx.beginPath();
                ctx.moveTo(cx - treeW / 2, baseline);
                ctx.lineTo(cx - treeW * (0.30 + lean), baseline - treeH * (0.55 + rng() * 0.10));
                ctx.lineTo(cx + lean * treeH, baseline - treeH);
                ctx.lineTo(cx + treeW * (0.30 - lean), baseline - treeH * (0.55 + rng() * 0.10));
                ctx.lineTo(cx + treeW / 2, baseline);
                ctx.closePath();
                ctx.fill();
                // Side branch puff (only on larger trees, ~half the row).
                if (rng() > 0.5 && row > 0) {
                    const bx = cx + (rng() > 0.5 ? 1 : -1) * treeW * 0.4;
                    const by = baseline - treeH * (0.55 + rng() * 0.15);
                    const br_ = treeW * (0.22 + rng() * 0.12);
                    ctx.beginPath();
                    ctx.arc(bx, by, br_, 0, Math.PI * 2);
                    ctx.fill();
                }
                // Trunk base.
                ctx.fillRect(cx - treeW * 0.04, baseline - 4, treeW * 0.08, 8);
            }
        };
        // Back layer : thin, low, faint.
        drawSilhouetteRow(0, 22, 70, 50, 0.55, 0.45);
        // Mid layer : medium height, more opaque.
        drawSilhouetteRow(1, 16, 120, 80, 0.72, 0.30);
        // Front layer : tall, dark, defines the horizon line of the backdrop.
        drawSilhouetteRow(2, 12, 180, 110, 0.88, 0.15);

        // 6. Ground haze : strong horizontal band at the very bottom blending
        //    the backdrop colour into the combat plateau colour.
        const haze = ctx.createLinearGradient(0, H * 0.78, 0, H);
        haze.addColorStop(0, 'rgba(0, 0, 0, 0)');
        haze.addColorStop(1, `rgba(${(br * 255 * 0.5) | 0}, ${(bg * 255 * 0.6) | 0}, ${(bb * 255 * 0.6) | 0}, 0.85)`);
        ctx.fillStyle = haze;
        ctx.fillRect(0, H * 0.78, W, H * 0.22);

        // 7. Stars : a small set of crisp pinpoints in the upper half. They
        //    sit on top of the larger pollen dust below.
        ctx.fillStyle = 'rgba(255, 250, 220, 0.85)';
        for (let i = 0; i < 60; i++) {
            const x = rng() * W;
            const y = rng() * H * 0.42;
            const r = 0.4 + rng() * 0.8;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        // 8. Pollen / dust speckles to break the flat gradient.
        ctx.fillStyle = 'rgba(255, 245, 200, 0.06)';
        for (let i = 0; i < 220; i++) {
            const x = rng() * W;
            const y = rng() * H * 0.85;
            const r = 0.6 + rng() * 1.4;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        // 9. Corner vignette : darken the four corners for a cinematic
        //    framing. Subtle so it complements the post-FX vignette without
        //    doubling up too obviously.
        const corner = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.72);
        corner.addColorStop(0.0, 'rgba(0, 0, 0, 0.00)');
        corner.addColorStop(1.0, 'rgba(0, 0, 0, 0.32)');
        ctx.fillStyle = corner;
        ctx.fillRect(0, 0, W, H);

        tex.update(false);
        tex.hasAlpha = false;
        tex.wrapU = Texture.CLAMP_ADDRESSMODE;
        tex.wrapV = Texture.CLAMP_ADDRESSMODE;
        return tex;
    }

    /** Mulberry32-style deterministic PRNG for the backdrop painter. */
    private seededRng(seed: number): () => number {
        let s = seed >>> 0;
        return () => {
            s = (s + 0x6D2B79F5) >>> 0;
            let t = s;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
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
