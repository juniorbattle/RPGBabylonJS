/**
 * SceneDioramaManager.ts — Loads a single `.glb` mega-prop into the combat
 * scenery.
 *
 * Pipeline :
 *   1. `setup(config)` resolves the file URL from `config.file` and calls
 *      `SceneLoader.ImportMeshAsync`.
 *   2. All imported meshes are gathered under a single anchor TransformNode
 *      (`DioramaRoot`) parented under the scenery root.
 *   3. The anchor is positioned / rotated / scaled per the `DioramaConfig`.
 *   4. Imported materials/textures are tracked for explicit disposal in
 *      `dispose()`.
 *
 * Asset workflow :
 *   - Generate an isometric concept image (AI, photo, etc.).
 *   - Upload to Tripo3D ( https://www.tripo3d.ai ) → download `.glb`.
 *   - Drop the file in `public/assets/dioramas/<name>.glb`.
 *   - Reference it from `forestBiome.ts` or `map_<x>.json` via
 *     `scenery.diorama = { file: '<name>.glb', ... }`.
 *
 * See `public/assets/dioramas/README.md` for the full workflow.
 */

import {
    Scene,
    SceneLoader,
    TransformNode,
    Vector3,
    AbstractMesh,
    Material,
    BaseTexture,
} from '@babylonjs/core';

// Side-effect import : registers the glTF / glb file loader plugin so that
// SceneLoader.ImportMeshAsync('.glb') resolves. Without this import the
// loader throws "Unable to find a plugin to load .glb files".
import '@babylonjs/loaders/glTF';

import type { DioramaConfig } from './SceneryTypes';

const PUBLIC_DIORAMAS = 'assets/dioramas/';

export class SceneDioramaManager {
    private scene: Scene;
    private parent: TransformNode;
    private anchor: TransformNode | null = null;
    private importedMeshes: AbstractMesh[] = [];
    private importedMaterials: Material[] = [];
    private importedTextures: BaseTexture[] = [];

    constructor(scene: Scene, parent: TransformNode) {
        this.scene = scene;
        this.parent = parent;
    }

    /**
     * Loads the .glb file referenced by `config.file` and applies the
     * placement transform. Safe to await multiple times — subsequent calls
     * dispose the previous diorama first.
     */
    async setup(config: DioramaConfig): Promise<void> {
        this.dispose();
        if (config.enabled === false) return;

        const url = PUBLIC_DIORAMAS;
        const fileName = config.file;

        let result;
        try {
            result = await SceneLoader.ImportMeshAsync('', url, fileName, this.scene);
        } catch (err) {
            console.warn(
                `[SceneDioramaManager] Failed to load ${url}${fileName} :`,
                err,
            );
            return;
        }

        this.anchor = new TransformNode('DioramaRoot', this.scene);
        this.anchor.parent = this.parent;

        const [x, y, z] = config.position ?? [8, 0, 6];
        this.anchor.position = new Vector3(x, y, z);
        this.anchor.rotation.y = ((config.rotationY ?? 0) * Math.PI) / 180;
        const scale = config.scale ?? 1;
        this.anchor.scaling = new Vector3(scale, scale, scale);

        // Reparent every imported root-level mesh under our anchor. Children
        // already-parented to those roots follow automatically.
        const roots = result.meshes.filter((m) => !m.parent);
        for (const mesh of roots) {
            mesh.parent = this.anchor;
        }

        // Track everything for cleanup.
        this.importedMeshes = result.meshes.slice();
        for (const mesh of this.importedMeshes) {
            mesh.isPickable = false;
            mesh.alwaysSelectAsActiveMesh = true;
            mesh.renderingGroupId = 0;
            // Apply lighting toggle : if the diorama already bakes lighting
            // into its textures, disable scene lighting on its materials so
            // they don't get re-shaded by sun + rim + spot.
            if (config.receivesLighting === false && mesh.material) {
                const mat = mesh.material as Material & { disableLighting?: boolean };
                if ('disableLighting' in mat) mat.disableLighting = true;
            }
            if (mesh.material && !this.importedMaterials.includes(mesh.material)) {
                this.importedMaterials.push(mesh.material);
                this.collectMaterialTextures(mesh.material);
            }
        }
    }

    dispose(): void {
        for (const tex of this.importedTextures) tex.dispose();
        this.importedTextures = [];

        for (const mat of this.importedMaterials) mat.dispose();
        this.importedMaterials = [];

        for (const mesh of this.importedMeshes) mesh.dispose();
        this.importedMeshes = [];

        if (this.anchor) {
            this.anchor.dispose();
            this.anchor = null;
        }
    }

    /**
     * Walks the public texture slots of a StandardMaterial / PBRMaterial to
     * register any texture that should be disposed alongside the material.
     * Babylon doesn't auto-dispose textures shared by other materials, so we
     * track each one explicitly.
     */
    private collectMaterialTextures(material: Material): void {
        const candidates = [
            'diffuseTexture',
            'emissiveTexture',
            'ambientTexture',
            'specularTexture',
            'bumpTexture',
            'opacityTexture',
            'reflectivityTexture',
            'lightmapTexture',
            'metallicTexture',
            'albedoTexture',
            'microSurfaceTexture',
        ];
        for (const key of candidates) {
            const tex = (material as unknown as Record<string, BaseTexture | null | undefined>)[key];
            if (tex && !this.importedTextures.includes(tex)) {
                this.importedTextures.push(tex);
            }
        }
    }
}
