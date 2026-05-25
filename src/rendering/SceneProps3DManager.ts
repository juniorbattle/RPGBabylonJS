/**
 * SceneProps3DManager.ts — 3D prop placement for HD-2D diorama scenery.
 *
 * Replaces the deprecated SceneLayerManager's panel-based decoration system
 * with real 3D meshes (or primitive placeholders) positioned in world space.
 *
 * Pipeline :
 *   1. `placeProps(placements)` iterates the placement list.
 *   2. For each placement :
 *      - If `placement.asset` is registered → load .glb via SceneLoader
 *      - Else use `placement.primitive` to draw a placeholder primitive
 *      - Else fallback to `'tree-blob'` placeholder.
 *   3. Each prop is parented under the scenery root and grouped by
 *      `depth` (`mid` = renderingGroupId 0, `foreground` = renderingGroupId 1).
 *
 * For now NO real `.glb` assets are registered. Every placement renders as a
 * placeholder primitive, which gives a clean colored low-poly diorama that
 * matches the target HD-2D style well enough to validate the rendering
 * pipeline before producing final art.
 */

import {
    Scene,
    TransformNode,
    Mesh,
    MeshBuilder,
    StandardMaterial,
    Color3,
    Vector3,
} from '@babylonjs/core';

import type { Prop3DPlacement, PrimitiveShape } from './SceneryTypes';

/**
 * Asset registry mapping logical asset keys to .glb URLs.
 * Empty by default. Will be populated when Kenney / Quaternius assets are
 * downloaded into `public/assets/props/<biome>/`.
 *
 * Example future registration :
 *   { tree_oak_01: 'assets/props/forest/tree_oak_01.glb' }
 */
export const PROP_ASSET_REGISTRY: Record<string, string> = {};

const DEFAULT_PRIMITIVE_BY_ASSET_PREFIX: Array<[RegExp, PrimitiveShape]> = [
    [/^tree_pine|^tree_fir|^tree_spruce/i, 'tree-cone'],
    [/^tree/i, 'tree-blob'],
    [/^rock|^stone|^boulder/i, 'rock'],
    [/^bush|^fern|^grass/i, 'bush'],
    [/^pillar|^column/i, 'pillar'],
    [/^crystal|^shard/i, 'crystal'],
];

export class SceneProps3DManager {
    private scene: Scene;
    private root: TransformNode;
    private spawned: Mesh[] = [];
    private materials: StandardMaterial[] = [];

    constructor(scene: Scene, parent: TransformNode) {
        this.scene = scene;
        this.root = new TransformNode('Props3DRoot', scene);
        this.root.parent = parent;
    }

    /**
     * Places every prop in the given list. Idempotent : calling twice clears
     * previously placed props.
     */
    async placeProps(placements: Prop3DPlacement[]): Promise<void> {
        this.clear();
        for (const placement of placements) {
            try {
                await this.placeOne(placement);
            } catch (err) {
                console.warn('[SceneProps3DManager] failed to place prop', placement, err);
            }
        }
    }

    clear(): void {
        for (const mesh of this.spawned) mesh.dispose();
        for (const mat of this.materials) mat.dispose();
        this.spawned = [];
        this.materials = [];
    }

    dispose(): void {
        this.clear();
        this.root.dispose();
    }

    private async placeOne(placement: Prop3DPlacement): Promise<void> {
        const mesh = this.buildPrimitive(this.resolveShape(placement), placement);
        if (!mesh) return;

        const [px, py, pz] = placement.position;
        mesh.position.set(px, py, pz);
        mesh.rotation.y = ((placement.rotationY ?? 0) * Math.PI) / 180;
        const scale = placement.scale ?? 1;
        mesh.scaling.scaleInPlace(scale);
        mesh.isPickable = false;
        mesh.parent = this.root;
        mesh.renderingGroupId = placement.depth === 'foreground' ? 1 : 0;

        // Cheap ground-contact shadow disc parented to the prop. Sized to the
        // visible footprint of the merged primitive (~1.4x the base radius).
        const shadowRadius = this.shadowRadiusFor(this.resolveShape(placement));
        if (shadowRadius > 0) {
            const shadow = this.buildShadowDisc(`${mesh.name}_shadow`, shadowRadius);
            shadow.parent = mesh;
            // Shadow sits in world Y=0 regardless of where the mesh origin is.
            // Since we parent to the mesh (already at world position), shadow
            // position is the *negation* of mesh.position.y to land back on ground.
            shadow.position.y = -py + 0.02;
            // Counter the parent's uniform scale so the shadow keeps a consistent
            // perceived size despite the prop scale variations.
            const inv = 1 / scale;
            shadow.scaling.set(inv, inv, inv);
            shadow.renderingGroupId = mesh.renderingGroupId;
            this.spawned.push(shadow);
        }

        this.spawned.push(mesh);
    }

    private shadowRadiusFor(shape: PrimitiveShape): number {
        switch (shape) {
            case 'tree-cone': return 1.3;
            case 'tree-blob': return 1.6;
            case 'rock':      return 1.0;
            case 'bush':      return 0.8;
            case 'pillar':    return 0.7;
            case 'crystal':   return 0.7;
        }
    }

    private buildShadowDisc(id: string, radius: number): Mesh {
        const disc = MeshBuilder.CreateDisc(id, { radius, tessellation: 16 }, this.scene);
        disc.rotation.x = Math.PI / 2; // lay flat on XZ
        disc.isPickable = false;
        const mat = new StandardMaterial(`${id}_mat`, this.scene);
        mat.diffuseColor = new Color3(0, 0, 0);
        mat.emissiveColor = new Color3(0, 0, 0);
        mat.specularColor = new Color3(0, 0, 0);
        mat.alpha = 0.35;
        mat.disableLighting = true;
        mat.backFaceCulling = false;
        mat.disableDepthWrite = true;
        mat.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
        disc.material = mat;
        this.materials.push(mat);
        return disc;
    }

    private resolveShape(placement: Prop3DPlacement): PrimitiveShape {
        if (placement.primitive) return placement.primitive;
        if (placement.asset && PROP_ASSET_REGISTRY[placement.asset]) {
            // Real .glb loading would happen here in the future. For now we
            // still fall through to a primitive placeholder based on naming
            // heuristics.
        }
        if (placement.asset) {
            for (const [regex, shape] of DEFAULT_PRIMITIVE_BY_ASSET_PREFIX) {
                if (regex.test(placement.asset)) return shape;
            }
        }
        return 'tree-blob';
    }

    private buildPrimitive(shape: PrimitiveShape, placement: Prop3DPlacement): Mesh | null {
        const id = `prop_${placement.asset ?? shape}_${this.spawned.length}`;
        // Seed-stable variation : per-placement tint perturbation in [-0.06..+0.06]
        // on each channel. Avoids monotone blocks of identical colors without
        // overriding the author's explicit tint intent.
        const baseTint = placement.tint ?? this.defaultTintFor(shape);
        const seed = this.spawned.length * 9301 + 49297;
        const rng = () => {
            // Linear congruential generator, deterministic per-prop.
            const next = (seed * (this.spawned.length + 7)) % 233280;
            return (next / 233280);
        };
        const jitter = () => (rng() - 0.5) * 0.12;
        const tint: [number, number, number] = [
            Math.max(0, Math.min(1, baseTint[0] + jitter() * 0.6)),
            Math.max(0, Math.min(1, baseTint[1] + jitter())),
            Math.max(0, Math.min(1, baseTint[2] + jitter() * 0.6)),
        ];

        switch (shape) {
            case 'tree-cone': return this.buildTreeCone(id, tint, placement.depth === 'foreground');
            case 'tree-blob': return this.buildTreeBlob(id, tint, placement.depth === 'foreground');
            case 'rock':      return this.buildRock(id, tint);
            case 'bush':      return this.buildBush(id, tint);
            case 'pillar':    return this.buildPillar(id, tint);
            case 'crystal':   return this.buildCrystal(id, tint);
        }
    }

    /* ---------------------------------------------------------------------- */
    /* Primitive builders                                                      */
    /* ---------------------------------------------------------------------- */

    /**
     * Conifer / fir silhouette : single tapered cylinder grounded at Y=0.
     * No visible trunk — distant trees in HD-2D Octopath look like pure foliage
     * silhouettes anyway, and removing the trunk eliminates the visible gap
     * we used to get from imperfect cylinder/cone merging.
     */
    private buildTreeCone(id: string, tint: [number, number, number], dark: boolean): Mesh {
        const cone = MeshBuilder.CreateCylinder(id, {
            diameterTop: 0,
            diameterBottom: 2.4,
            height: 5.5,
            tessellation: 10,
        }, this.scene);
        cone.position.y = 5.5 / 2;
        cone.material = this.mat(`${id}_mat`, tint, dark);
        return cone;
    }

    /**
     * Broadleaf silhouette : ORGANIC cluster of 4 sub-spheres at slight
     * horizontal/vertical offsets, on a tiny dark base. The cluster
     * approach kills the "perfect Babylon sphere" look that placeholder
     * primitives normally betray, and gives the foliage a believable
     * lumpy hand-painted Octopath silhouette.
     *
     * All four foliage spheres share the same tint so they merge with a
     * single material; a slightly brighter highlight sphere is added on
     * top to fake top-down sunlight catching the canopy.
     */
    private buildTreeBlob(id: string, tint: [number, number, number], dark: boolean): Mesh {
        const foliageMat   = this.mat(`${id}_foliageMat`,   tint, dark);
        const highlightMat = this.mat(`${id}_highlightMat`, [
            Math.min(1, tint[0] + 0.10),
            Math.min(1, tint[1] + 0.14),
            Math.min(1, tint[2] + 0.08),
        ], dark);
        const baseMat = this.mat(`${id}_baseMat`,
            [tint[0] * 0.45, tint[1] * 0.45, tint[2] * 0.35], dark);

        // Main lower blob — largest, defines the canopy footprint.
        const main = MeshBuilder.CreateSphere(`${id}_b0`, { diameter: 3.0, segments: 10 }, this.scene);
        main.scaling.set(1.0, 0.92, 1.0);
        main.position.set(0, 1.8, 0);
        main.material = foliageMat;

        // Side bulge — pushes outward on +X for asymmetric silhouette.
        const sideA = MeshBuilder.CreateSphere(`${id}_b1`, { diameter: 2.2, segments: 9 }, this.scene);
        sideA.scaling.set(0.95, 0.85, 1.0);
        sideA.position.set(0.85, 1.95, 0.10);
        sideA.material = foliageMat;

        // Side bulge — pushes -X, slightly lower than sideA.
        const sideB = MeshBuilder.CreateSphere(`${id}_b2`, { diameter: 1.9, segments: 9 }, this.scene);
        sideB.scaling.set(0.95, 0.85, 1.0);
        sideB.position.set(-0.80, 1.70, -0.05);
        sideB.material = foliageMat;

        // Top bulge — highlight catching sunlight from above.
        const top = MeshBuilder.CreateSphere(`${id}_b3`, { diameter: 1.6, segments: 9 }, this.scene);
        top.scaling.set(0.95, 0.95, 0.95);
        top.position.set(0.10, 2.85, 0.10);
        top.material = highlightMat;

        // Tiny dark base : kept SHORT and stuffed INTO the foliage so no gap
        // can appear regardless of camera angle.
        const base = MeshBuilder.CreateCylinder(`${id}_base`, {
            diameterTop: 1.1,
            diameterBottom: 0.7,
            height: 1.1,
            tessellation: 10,
        }, this.scene);
        base.position.y = 0.55;
        base.material = baseMat;

        const merged = Mesh.MergeMeshes(
            [base, main, sideA, sideB, top],
            true,    // disposeSource
            true,    // allow32BitsIndices
            undefined,
            false,
            true,    // multiMultiMaterials  -> keeps the base color distinct from foliage
        );
        if (!merged) return main;
        merged.name = id;
        return merged;
    }

    private buildRock(id: string, tint: [number, number, number]): Mesh {
        const rock = MeshBuilder.CreateSphere(id, { diameter: 1.8, segments: 6 }, this.scene);
        rock.scaling.set(1, 0.55, 1.1);
        rock.position.y = 0.4;
        rock.material = this.mat(`${id}_mat`, tint);
        return rock;
    }

    private buildBush(id: string, tint: [number, number, number]): Mesh {
        const bush = MeshBuilder.CreateSphere(id, { diameter: 1.2, segments: 6 }, this.scene);
        bush.scaling.set(1.2, 0.55, 1.2);
        bush.position.y = 0.3;
        bush.material = this.mat(`${id}_mat`, tint);
        return bush;
    }

    private buildPillar(id: string, tint: [number, number, number]): Mesh {
        const pillar = MeshBuilder.CreateCylinder(id, {
            diameterTop: 0.7, diameterBottom: 0.9, height: 5, tessellation: 12,
        }, this.scene);
        pillar.position.y = 2.5;
        pillar.material = this.mat(`${id}_mat`, tint);
        return pillar;
    }

    private buildCrystal(id: string, tint: [number, number, number]): Mesh {
        const crystal = MeshBuilder.CreateCylinder(id, {
            diameterTop: 0, diameterBottom: 1.0, height: 3, tessellation: 4,
        }, this.scene);
        crystal.position.y = 1.5;
        const mat = this.mat(`${id}_mat`, tint);
        mat.emissiveColor = new Color3(tint[0] * 0.8, tint[1] * 0.8, tint[2] * 0.8);
        crystal.material = mat;
        return crystal;
    }

    private mat(id: string, color: [number, number, number], dark = false): StandardMaterial {
        const m = new StandardMaterial(id, this.scene);
        const [r, g, b] = color;
        const factor = dark ? 0.55 : 1.0;
        m.diffuseColor = new Color3(r * factor, g * factor, b * factor);
        m.emissiveColor = new Color3(r * 0.12 * factor, g * 0.12 * factor, b * 0.12 * factor);
        m.specularColor = Color3.Black();
        this.materials.push(m);
        return m;
    }

    private defaultTintFor(shape: PrimitiveShape): [number, number, number] {
        switch (shape) {
            case 'tree-cone': return [0.22, 0.45, 0.28];
            case 'tree-blob': return [0.30, 0.55, 0.28];
            case 'rock':      return [0.42, 0.42, 0.44];
            case 'bush':      return [0.30, 0.50, 0.25];
            case 'pillar':    return [0.65, 0.62, 0.55];
            case 'crystal':   return [0.55, 0.80, 1.00];
        }
    }
}

// Re-export for downstream consumers that need it.
export type { Vector3 } from '@babylonjs/core';
