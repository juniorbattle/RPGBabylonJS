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

        this.spawned.push(mesh);
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
        const tint = placement.tint ?? this.defaultTintFor(shape);

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

    private buildTreeCone(id: string, tint: [number, number, number], dark: boolean): Mesh {
        const trunk = MeshBuilder.CreateCylinder(`${id}_trunk`, {
            diameterTop: 0.4, diameterBottom: 0.6, height: 1.8, tessellation: 8,
        }, this.scene);
        trunk.position.y = 0.9;
        trunk.material = this.mat(`${id}_trunkMat`, [0.18, 0.10, 0.06], dark);

        const foliage = MeshBuilder.CreateCylinder(`${id}_foliage`, {
            diameterTop: 0, diameterBottom: 3.2, height: 7.5, tessellation: 12,
        }, this.scene);
        foliage.position.y = 1.8 + 7.5 / 2 - 0.6;
        foliage.material = this.mat(`${id}_foliageMat`, tint, dark);

        const merged = Mesh.MergeMeshes([trunk, foliage], true, true, undefined, false, true);
        if (!merged) return foliage; // fallback
        merged.name = id;
        return merged;
    }

    private buildTreeBlob(id: string, tint: [number, number, number], dark: boolean): Mesh {
        const trunk = MeshBuilder.CreateCylinder(`${id}_trunk`, {
            diameterTop: 0.5, diameterBottom: 0.8, height: 2.5, tessellation: 8,
        }, this.scene);
        trunk.position.y = 1.25;
        trunk.material = this.mat(`${id}_trunkMat`, [0.20, 0.12, 0.07], dark);

        const foliage = MeshBuilder.CreateSphere(`${id}_foliage`, {
            diameter: 5.5, segments: 8,
        }, this.scene);
        foliage.scaling.y = 0.9;
        foliage.position.y = 2.5 + 2.2;
        foliage.material = this.mat(`${id}_foliageMat`, tint, dark);

        const merged = Mesh.MergeMeshes([trunk, foliage], true, true, undefined, false, true);
        if (!merged) return foliage;
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
