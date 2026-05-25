/**
 * StageGeometry.ts
 * --------------------------------------------------------------------------
 * Computes the *target* world-space geometry of each composition role from
 * the map dimensions, independently of any image asset. The image then has
 * to fit this box via `imageFit` (cover / contain / stretch / tile).
 *
 * The design intent is the opposite of the previous JSON-driven approach:
 * the layered diorama imposes its proportions on the artwork, not the other
 * way around. This guarantees a coherent HD-2D framing across Normal /
 * Overview / Focus camera modes regardless of which textures are dropped in.
 *
 * Adjusting visual scale is now a one-place edit (ROLE_PROPORTIONS below).
 */
import { SceneLayerCompositionRole } from './SceneLayerTypes';

/**
 * World-space target box for a composition role. All values are in world
 * units (Babylon scene units) and absolute, not relative to baseSurfaceY.
 *
 * `aspectRatio` is the recommended image aspect (width / height) for any
 * texture occupying this role. Artists / generators should match this ratio
 * to avoid `cover` cropping or `contain` letterboxing surprises.
 */
export interface RoleStageBox {
    role: SceneLayerCompositionRole;
    width: number;
    height: number;
    /** Absolute world-Y of the plane center. */
    yCenter: number;
    /** Z offset relative to the map center (passed through to computePosition). */
    zOffset: number;
    /** Recommended source-image aspect ratio (width / height). */
    aspectRatio: number;
}

export type StageGeometry = Partial<Record<SceneLayerCompositionRole, RoleStageBox>>;

/**
 * Proportions applied to `stageWidth` (= mapW in world units). Tweak here to
 * tune the entire diorama scale. Heights are also expressed relative to
 * stageWidth so the layout scales uniformly with the playfield.
 *
 *  - widthMul  : plane width   = stageWidth * widthMul
 *  - heightMul : plane height  = stageWidth * heightMul
 *  - yCenter   : absolute world-Y of the plane center (anchored above the
 *                ground; tuned for the default tactical camera tilt).
 *  - zOffset   : distance behind the plateau center along +Z (back layers)
 *                or in front of it along -Z (foreground / overlays).
 *
 * NOTE: groundBlend is intentionally absent — it is computed dynamically by
 * SceneLayerManager.applyAutoFit() from the active mainMidground box.
 */
const ROLE_PROPORTIONS: Record<
    Exclude<SceneLayerCompositionRole, 'groundBlend'>,
    { widthMul: number; heightMul: number; yCenter: number; zOffset: number }
> = {
    // Solid color backstop. Covers every camera angle including overview
    // plunge and focus tight crop. Largest plane in the diorama.
    skyVoidFill:        { widthMul: 2.5,  heightMul: 1.80, yCenter: 15, zOffset: 50 },

    // Distant atmosphere band: sky / far canopy / mist. Wide-but-short:
    // a thin horizon strip aligned with the upper third of the frame.
    backAtmosphere:     { widthMul: 1.6,  heightMul: 0.50, yCenter: 8,  zOffset: 32 },

    // Hero backdrop: dense forest just behind the combat plateau. Centered
    // on the sprite chest height so silhouettes read cleanly.
    mainMidground:      { widthMul: 1.3,  heightMul: 0.45, yCenter: 5,  zOffset: 22 },

    // Foreground frame: trees / pillars / vignette corners. In front of the
    // plateau (negative zOffset) and slightly wider than the midground.
    foregroundCorners:  { widthMul: 1.6,  heightMul: 0.70, yCenter: 4,  zOffset: -3 },

    // Upper canopy: branches / leaves overhanging the frame from the top.
    // Wide and short, sits high above the sprites.
    upperCanopy:        { widthMul: 1.3,  heightMul: 0.35, yCenter: 12, zOffset: -3 },

    // FX overlay: particles, glow, mist. Often additive, in front of all
    // backdrop layers, intended to be subtle (low alpha by default).
    fxOverlay:          { widthMul: 1.4,  heightMul: 0.55, yCenter: 6,  zOffset: -1 },
};

/**
 * Computes the target geometry for every supported composition role on a
 * map of the given dimensions.
 *
 * @param mapW         Map width in world units (= number of tiles, since
 *                     tileSize == 1 in the current combat scene).
 * @param _mapD        Map depth in world units. Currently unused but kept
 *                     in the signature for forward compatibility (e.g. when
 *                     non-square stages start influencing the geometry).
 * @param baseSurfaceY World-Y of the playable ground plane. yCenter values
 *                     in ROLE_PROPORTIONS are anchored *above* this value.
 */
export function computeStageGeometry(
    mapW: number,
    _mapD: number,
    baseSurfaceY: number = 0
): StageGeometry {
    const stageWidth = Math.max(1, mapW);
    const out: StageGeometry = {};

    for (const role of Object.keys(ROLE_PROPORTIONS) as Array<keyof typeof ROLE_PROPORTIONS>) {
        const p = ROLE_PROPORTIONS[role];
        const width = stageWidth * p.widthMul;
        const height = stageWidth * p.heightMul;
        out[role] = {
            role: role as SceneLayerCompositionRole,
            width,
            height,
            yCenter: baseSurfaceY + p.yCenter,
            zOffset: p.zOffset,
            aspectRatio: width / Math.max(0.01, height),
        };
    }
    return out;
}

/**
 * Convenience accessor: returns the recommended source-image aspect ratio
 * for each role. Useful for documentation, asset-pipeline checks, and UI
 * hints in the map editor.
 */
export function getRecommendedAspectRatios(mapW: number): Partial<Record<SceneLayerCompositionRole, number>> {
    const geom = computeStageGeometry(mapW, mapW);
    const out: Partial<Record<SceneLayerCompositionRole, number>> = {};
    for (const [role, box] of Object.entries(geom) as Array<[SceneLayerCompositionRole, RoleStageBox]>) {
        out[role] = Number(box.aspectRatio.toFixed(2));
    }
    return out;
}
