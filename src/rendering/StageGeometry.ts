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
 *  - yCenter   : absolute world-Y of the plane center (in WORLD units, NOT
 *                relative to baseSurfaceY). Tuned so that the visible band
 *                of the plane intersects both the Normal-camera ray
 *                (looking ~10deg down at chest height) and the Overview-
 *                camera ray (plunging ~34deg from y=24). Negative values
 *                are normal and expected: the Normal camera's gaze at
 *                z=+30 hits y~-4, so planes parked at y=+8 fly out of
 *                frame entirely.
 *  - zOffset   : distance behind the plateau center along +Z (back layers)
 *                or in front of it along -Z (foreground / overlays).
 *
 * Plane aspect ratios are intentionally kept close to 1:1 because the
 * available PNG library is square. When commissioning new artwork at the
 * documented diorama ratios (3:1 horizon bands, etc.), update widthMul /
 * heightMul accordingly and set imageAspectRatio on each layer.
 *
 * NOTE: groundBlend is intentionally absent — it is computed dynamically by
 * SceneLayerManager.applyAutoFit() from the active mainMidground box.
 */
const ROLE_PROPORTIONS: Record<
    Exclude<SceneLayerCompositionRole, 'groundBlend'>,
    { widthMul: number; heightMul: number; yCenter: number; zOffset: number }
> = {
    // Solid color backstop. Largest plane, covers every camera angle.
    // Centered just below combat level so the Overview plunge still sees
    // the lower half of it.
    skyVoidFill:        { widthMul: 4.5, heightMul: 4.0, yCenter: -5, zOffset: 50 },

    // Distant atmosphere: sky / far canopy / mist. Large square plane so
    // the Normal-camera gaze (y~-4 at this depth) lands near the lower
    // third of the painting.
    backAtmosphere:     { widthMul: 4.5, heightMul: 3.8, yCenter: -5, zOffset: 32 },

    // Hero backdrop: dense forest behind the combat plateau. Slightly
    // higher than the back layer because the Normal-camera gaze at z=25
    // sits a couple units higher (y~-2).
    mainMidground:      { widthMul: 4.3, heightMul: 3.3, yCenter: -3, zOffset: 22 },

    // Foreground frame: trees / pillars / vignette corners. Sits in front
    // of the plateau (zOffset<0), wider than the midground.
    foregroundCorners:  { widthMul: 5.0, heightMul: 4.5, yCenter: -4, zOffset: -3 },

    // Upper canopy: branches overhanging from the top of the frame. Sits
    // high above the action (yCenter > 0) so it never occludes sprites.
    upperCanopy:        { widthMul: 4.4, heightMul: 2.7, yCenter:  8, zOffset: -3 },

    // FX overlay: particles, glow, mist. Centered around sprite chest
    // height for additive lighting effects.
    fxOverlay:          { widthMul: 5.0, heightMul: 4.0, yCenter: -3, zOffset: -1 },
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
