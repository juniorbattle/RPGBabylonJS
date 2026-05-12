/**
 * ProceduralComposer.ts — GPA Tactics HD-2D
 *
 * Système de composition procédurale intentionnelle :
 *  - Groupes composites (anchor imposant + entourage cohérent)
 *  - Règles de placement par layer (back / mid / front)
 *  - Variation d'échelle hiérarchique (dominant → fill → accent)
 *  - Clearance stricte de la grille de combat
 *  - Compatible avec PropDef / AnimatedPropDef du manifest
 */

import { TransformNode } from '@babylonjs/core';

// ---------------------------------------------------------------------------
// Types locaux (ré-exportés pour MapEditor)
// ---------------------------------------------------------------------------

export type PropLayer = "back" | "mid" | "front";

export interface PropDef {
    file:       string;
    type:       string;
    biomes?:    string[];
    scaleRange: [number, number];
}

export interface AnimatedPropDef extends PropDef {
    cols: number;
    rows: number;
    fps:  number;
    animations?: Record<string, { frames: number[]; fps?: number; loop?: boolean }>;
}

export interface BiomeDef {
    propWeights:         Record<string, number>;
    animatedPropWeights?: Record<string, number>;
    [key: string]: any;
}

// ---------------------------------------------------------------------------
// Définition d'un groupe composite
// ---------------------------------------------------------------------------

/**
 * Un CompositeGroup décrit UNE composition visuelle :
 *   - anchor  : prop dominant (grand arbre, rocher imposant, ruine…)
 *   - fills   : props moyens placés en anneau autour de l'anchor
 *   - accents : petits props (fleurs, herbes) saupoudrés dans le groupe
 *
 * Les positions fill/accent sont relatives à l'anchor, exprimées en
 * "unités monde" avant application de l'échelle finale.
 */
interface CompositeGroup {
    /** Type d'anchor attendu (doit exister dans le manifest) */
    anchorType: string;
    /** Échelle de l'anchor (multiplicateur SUPPLÉMENTAIRE au scaleRange) */
    anchorScaleMult: [number, number];

    fills: {
        type: string;
        count: [number, number];        // [min, max]
        radiusRange: [number, number];  // distance à l'anchor en unités monde
        scaleMult: [number, number];
        angularSpread?: number;         // 0–360 (défaut 360)
    }[];

    accents: {
        type: string;
        count: [number, number];
        radiusRange: [number, number];
        scaleMult: [number, number];
    }[];

    /** Layers autorisés pour ce groupe (anchor hérite du layer) */
    allowedLayers: PropLayer[];
}

// ---------------------------------------------------------------------------
// Bibliothèque de groupes composites
// ---------------------------------------------------------------------------

/**
 * Définitions statiques des groupes.
 * Elles sont filtrées au runtime selon les types disponibles dans le biome.
 */
const COMPOSITE_LIBRARY: CompositeGroup[] = [

    // ── Arbre solitaire majestueux ─────────────────────────────────────────
    {
        anchorType: "tree",
        anchorScaleMult: [1.4, 2.2],
        fills: [
            { type: "bush",  count: [2, 4], radiusRange: [1.8, 3.2], scaleMult: [0.6, 1.0] },
            { type: "grass", count: [3, 6], radiusRange: [2.0, 4.5], scaleMult: [0.5, 0.9] },
        ],
        accents: [
            { type: "flower", count: [2, 5], radiusRange: [1.5, 4.0], scaleMult: [0.4, 0.7] },
        ],
        allowedLayers: ["back", "mid"],
    },

    // ── Bosquet dense (trio d'arbres serrés) ──────────────────────────────
    {
        anchorType: "tree",
        anchorScaleMult: [1.0, 1.6],
        fills: [
            { type: "tree",  count: [2, 3],  radiusRange: [2.5, 4.5], scaleMult: [0.7, 1.0], angularSpread: 240 },
            { type: "bush",  count: [2, 4],  radiusRange: [3.5, 6.0], scaleMult: [0.5, 0.8] },
        ],
        accents: [
            { type: "grass",  count: [3, 7], radiusRange: [2.0, 5.5], scaleMult: [0.4, 0.7] },
            { type: "flower", count: [1, 3], radiusRange: [3.0, 5.0], scaleMult: [0.4, 0.6] },
        ],
        allowedLayers: ["back", "mid"],
    },

    // ── Rocher dominant entouré de végétation ─────────────────────────────
    {
        anchorType: "rock",
        anchorScaleMult: [1.3, 2.0],
        fills: [
            { type: "grass",  count: [3, 6], radiusRange: [1.5, 3.0], scaleMult: [0.5, 0.8] },
            { type: "bush",   count: [1, 3], radiusRange: [2.0, 4.0], scaleMult: [0.6, 0.9] },
        ],
        accents: [
            { type: "flower", count: [2, 4], radiusRange: [2.5, 4.5], scaleMult: [0.4, 0.6] },
        ],
        allowedLayers: ["back", "mid"],
    },

    // ── Falaise imposante avec plantes des fissures ────────────────────────
    {
        anchorType: "cliff",
        anchorScaleMult: [1.5, 2.5],
        fills: [
            { type: "rock",  count: [2, 4], radiusRange: [2.5, 5.0], scaleMult: [0.5, 0.9] },
            { type: "grass", count: [4, 8], radiusRange: [1.5, 4.5], scaleMult: [0.4, 0.7] },
        ],
        accents: [
            { type: "bush",   count: [1, 3], radiusRange: [3.0, 5.5], scaleMult: [0.4, 0.7] },
        ],
        allowedLayers: ["back"],
    },

    // ── Ruines mystérieuses (piliers + autel + herbe) ─────────────────────
    {
        anchorType: "ruins",
        anchorScaleMult: [1.2, 2.0],
        fills: [
            { type: "pillar", count: [2, 4], radiusRange: [2.0, 4.5], scaleMult: [0.6, 1.0], angularSpread: 180 },
            { type: "rock",   count: [2, 4], radiusRange: [3.0, 6.0], scaleMult: [0.5, 0.8] },
        ],
        accents: [
            { type: "grass",  count: [3, 7], radiusRange: [2.0, 5.0], scaleMult: [0.4, 0.6] },
            { type: "bush",   count: [1, 3], radiusRange: [3.5, 6.0], scaleMult: [0.4, 0.7] },
        ],
        allowedLayers: ["back", "mid"],
    },

    // ── Autel sacré avec torches et entourage végétal ─────────────────────
    {
        anchorType: "altar",
        anchorScaleMult: [1.0, 1.5],
        fills: [
            { type: "torch",  count: [2, 2], radiusRange: [1.5, 2.5], scaleMult: [0.8, 1.1], angularSpread: 90 },
            { type: "pillar", count: [1, 3], radiusRange: [2.5, 4.5], scaleMult: [0.6, 1.0] },
        ],
        accents: [
            { type: "flower", count: [3, 6], radiusRange: [2.0, 5.0], scaleMult: [0.4, 0.7] },
            { type: "grass",  count: [2, 5], radiusRange: [3.0, 5.5], scaleMult: [0.4, 0.6] },
        ],
        allowedLayers: ["back", "mid"],
    },

    // ── Statue isolée sur promontoire de rochers ──────────────────────────
    {
        anchorType: "statue",
        anchorScaleMult: [1.2, 1.8],
        fills: [
            { type: "rock",  count: [3, 6], radiusRange: [1.5, 3.5], scaleMult: [0.5, 0.9] },
            { type: "pillar",count: [0, 2], radiusRange: [2.5, 4.5], scaleMult: [0.6, 1.0] },
        ],
        accents: [
            { type: "grass",  count: [2, 5], radiusRange: [2.0, 4.5], scaleMult: [0.3, 0.6] },
        ],
        allowedLayers: ["back", "mid"],
    },

    // ── Unique : asset spécial entouré d'un écrin végétal ─────────────────
    {
        anchorType: "unique",
        anchorScaleMult: [1.0, 1.6],
        fills: [
            { type: "bush",   count: [3, 5], radiusRange: [2.0, 4.0], scaleMult: [0.5, 0.9] },
            { type: "flower", count: [4, 8], radiusRange: [1.5, 4.5], scaleMult: [0.4, 0.7] },
        ],
        accents: [
            { type: "grass",  count: [3, 6], radiusRange: [1.5, 4.0], scaleMult: [0.3, 0.6] },
        ],
        allowedLayers: ["back", "mid"],
    },

    // ── Torche animée entourée de murs/piliers (biome ruines/cité) ─────────
    {
        anchorType: "torch_flicker",  // type animé
        anchorScaleMult: [0.9, 1.3],
        fills: [
            { type: "pillar", count: [1, 3], radiusRange: [1.5, 3.5], scaleMult: [0.7, 1.1] },
            { type: "rock",   count: [1, 2], radiusRange: [2.0, 4.0], scaleMult: [0.5, 0.8] },
        ],
        accents: [
            { type: "grass",  count: [2, 4], radiusRange: [2.5, 4.5], scaleMult: [0.3, 0.5] },
        ],
        allowedLayers: ["back", "mid"],
    },

    // ── Tapis de fleurs (composition basse, layer front/mid) ───────────────
    {
        anchorType: "flower",
        anchorScaleMult: [0.7, 1.1],
        fills: [
            { type: "flower", count: [4, 8], radiusRange: [1.0, 3.0], scaleMult: [0.5, 0.9] },
            { type: "grass",  count: [3, 6], radiusRange: [1.5, 3.5], scaleMult: [0.4, 0.7] },
        ],
        accents: [],
        allowedLayers: ["front", "mid"],
    },

    // ── Herbes folles (layer front, très petites) ──────────────────────────
    {
        anchorType: "grass",
        anchorScaleMult: [0.5, 0.9],
        fills: [
            { type: "grass",  count: [4, 9], radiusRange: [0.8, 2.5], scaleMult: [0.4, 0.8] },
            { type: "flower", count: [1, 3], radiusRange: [1.0, 3.0], scaleMult: [0.4, 0.6] },
        ],
        accents: [],
        allowedLayers: ["front"],
    },

    // ── Buisson isolé avec petites plantes ────────────────────────────────
    {
        anchorType: "bush",
        anchorScaleMult: [0.8, 1.3],
        fills: [
            { type: "grass",  count: [2, 5], radiusRange: [1.2, 2.8], scaleMult: [0.4, 0.7] },
            { type: "flower", count: [1, 3], radiusRange: [1.5, 3.0], scaleMult: [0.4, 0.6] },
        ],
        accents: [],
        allowedLayers: ["front", "mid"],
    },
];

// ---------------------------------------------------------------------------
// Helpers RNG
// ---------------------------------------------------------------------------

function makeRng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s += 0x6D2B79F5;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function weightedPick(w: Record<string, number>, rng: () => number): string | null {
    const e = Object.entries(w).filter(([, v]) => v > 0);
    if (!e.length) return null;
    const t = e.reduce((s, [, v]) => s + v, 0);
    let r = rng() * t;
    for (const [k, v] of e) { r -= v; if (r <= 0) return k; }
    return e[e.length - 1][0];
}

function randBetween(a: number, b: number, rng: () => number): number {
    return a + rng() * (b - a);
}

function randInt(a: number, b: number, rng: () => number): number {
    return a + Math.floor(rng() * (b - a + 1));
}

// ---------------------------------------------------------------------------
// Interface vers MapEditor (callbacks de spawn)
// ---------------------------------------------------------------------------

export interface ComposerSpawnCallbacks {
    /** Spawn un prop statique */
    spawnStatic(
        file: string,
        x: number, y: number, z: number,
        mirror: boolean,
        scale: number,
        isProcedural: boolean,
        layer: PropLayer
    ): void;

    /** Spawn un prop animé */
    spawnAnimated(
        def: AnimatedPropDef,
        x: number, y: number, z: number,
        mirror: boolean,
        scale: number,
        isProcedural: boolean,
        layer: PropLayer
    ): void;

    /** Renvoie la taille de base (width, height) d'un type de prop */
    getBasePropSize(type: string): { width: number; height: number };
}

// ---------------------------------------------------------------------------
// ProceduralComposer — moteur principal
// ---------------------------------------------------------------------------

export class ProceduralComposer {

    // -------------------------------------------------------------------------
    // Pools — construits depuis le manifest filtré par biome
    // -------------------------------------------------------------------------

    private staticPool:   Map<string, PropDef[]>         = new Map();
    private animatedPool: Map<string, AnimatedPropDef[]> = new Map();

    /**
     * Reconstruit les pools depuis le manifest.
     * À appeler quand le biome ou le manifest change.
     */
    public buildPools(
        allStatic:   PropDef[],
        allAnimated: AnimatedPropDef[],
        biomeDef:    BiomeDef
    ): void {
        this.staticPool.clear();
        this.animatedPool.clear();

        // Pool statique : tous les types avec poids > 0 dans le biome
        for (const [type, weight] of Object.entries(biomeDef.propWeights ?? {})) {
            if (weight <= 0) continue;
            const arr = allStatic.filter(p => p.type === type);
            if (arr.length) this.staticPool.set(type, arr);
        }

        // Pool animé
        for (const [type, weight] of Object.entries(biomeDef.animatedPropWeights ?? {})) {
            if (weight <= 0) continue;
            const arr = allAnimated.filter(p => p.type === type);
            if (arr.length) this.animatedPool.set(type, arr);
        }
    }

    // -------------------------------------------------------------------------
    // Sélection d'un def aléatoire dans un pool (statique ou animé)
    // -------------------------------------------------------------------------

    private pickDef(type: string, rng: () => number): { def: PropDef | AnimatedPropDef; animated: boolean } | null {
        const anim = this.animatedPool.get(type);
        if (anim?.length) {
            return { def: anim[Math.floor(rng() * anim.length)], animated: true };
        }
        const stat = this.staticPool.get(type);
        if (stat?.length) {
            return { def: stat[Math.floor(rng() * stat.length)], animated: false };
        }
        return null;
    }

    private hasType(type: string): boolean {
        return this.staticPool.has(type) || this.animatedPool.has(type);
    }

    // -------------------------------------------------------------------------
    // Sélection d'un groupe composite compatible avec le biome et le layer
    // -------------------------------------------------------------------------

    private selectGroup(
        layer:      PropLayer,
        biomeDef:   BiomeDef,
        rng:        () => number
    ): CompositeGroup | null {
        // Poids du groupe = poids de l'anchor dans le biome
        const allWeights = { ...biomeDef.propWeights, ...biomeDef.animatedPropWeights };
        const eligible = COMPOSITE_LIBRARY.filter(g =>
            g.allowedLayers.includes(layer) &&
            this.hasType(g.anchorType) &&
            (allWeights[g.anchorType] ?? 0) > 0
        );
        if (!eligible.length) return null;

        const w: Record<string, number> = {};
        eligible.forEach((g, i) => { w[String(i)] = allWeights[g.anchorType] ?? 0; });
        const picked = weightedPick(w, rng);
        if (picked === null) return null;
        return eligible[parseInt(picked)];
    }

    // -------------------------------------------------------------------------
    // Spawn d'un prop unique (interne)
    // -------------------------------------------------------------------------

    private spawnOne(
        type:    string,
        px:      number,
        py:      number,
        pz:      number,
        scale:   number,
        layer:   PropLayer,
        rng:     () => number,
        cb:      ComposerSpawnCallbacks,
        isProcedural: boolean = true
    ): void {
        const result = this.pickDef(type, rng);
        if (!result) return;

        const { def, animated } = result;
        const [sMin, sMax] = def.scaleRange;
        const baseScale = sMin + rng() * (sMax - sMin);
        const finalScale = baseScale * scale;
        const mirror = rng() > 0.5;

        if (animated) {
            cb.spawnAnimated(
                def as AnimatedPropDef,
                px, py, pz, mirror, finalScale, isProcedural, layer
            );
        } else {
            cb.spawnStatic(
                def.file, px, py, pz, mirror, finalScale, isProcedural, layer
            );
        }
    }

    // -------------------------------------------------------------------------
    // Spawn d'un groupe composite complet
    // -------------------------------------------------------------------------

    private spawnGroup(
        group:  CompositeGroup,
        cx:     number,
        cy:     number,
        cz:     number,
        layer:  PropLayer,
        rng:    () => number,
        cb:     ComposerSpawnCallbacks
    ): void {
        // 1. Anchor
        const anchorScaleMult = randBetween(...group.anchorScaleMult, rng);
        this.spawnOne(group.anchorType, cx, cy, cz, anchorScaleMult, layer, rng, cb);

        // 2. Fills (anneau autour de l'anchor)
        for (const fill of group.fills) {
            if (!this.hasType(fill.type)) continue;
            const count = randInt(...fill.count, rng);
            const spread = (fill.angularSpread ?? 360) * (Math.PI / 180);
            const baseAngle = rng() * Math.PI * 2;

            for (let i = 0; i < count; i++) {
                const angle = baseAngle + (i / count) * spread + (rng() - 0.5) * 0.8;
                const radius = randBetween(...fill.radiusRange, rng);
                const fx = cx + Math.cos(angle) * radius;
                const fz = cz + Math.sin(angle) * radius;
                const scaleMult = randBetween(...fill.scaleMult, rng);
                this.spawnOne(fill.type, fx, cy, fz, scaleMult, layer, rng, cb);
            }
        }

        // 3. Accents (saupoudrage aléatoire)
        for (const accent of group.accents) {
            if (!this.hasType(accent.type)) continue;
            const count = randInt(...accent.count, rng);
            for (let i = 0; i < count; i++) {
                const angle = rng() * Math.PI * 2;
                const radius = randBetween(...accent.radiusRange, rng);
                const ax = cx + Math.cos(angle) * radius;
                const az = cz + Math.sin(angle) * radius;
                const scaleMult = randBetween(...accent.scaleMult, rng);
                this.spawnOne(accent.type, ax, cy, az, scaleMult, layer, rng, cb);
            }
        }
    }

    // -------------------------------------------------------------------------
    // Point d'entrée principal — remplace runProceduralGroundProps
    // -------------------------------------------------------------------------

    /**
     * Génère tous les décors autour de la grille de combat.
     *
     * @param gridBounds   Bords exacts de la grille {xMin, xMax, zMin, zMax}
     * @param tileSize     Taille d'une tuile (pour calculer les marges)
     * @param biomeDef     Définition du biome actif
     * @param allStatic    Tous les PropDef statiques du manifest
     * @param allAnimated  Tous les AnimatedPropDef du manifest
     * @param floorY       Hauteur Y du sol
     * @param density      Facteur densité global (0.1 → 2.0)
     * @param seed         Graine RNG principale
     * @param cb           Callbacks vers MapEditor (spawn)
     */
    public generate(
        gridBounds:  { xMin: number; xMax: number; zMin: number; zMax: number },
        tileSize:    number,
        biomeDef:    BiomeDef,
        allStatic:   PropDef[],
        allAnimated: AnimatedPropDef[],
        floorY:      number,
        density:     number,
        seed:        number,
        cb:          ComposerSpawnCallbacks
    ): void {
        this.buildPools(allStatic, allAnimated, biomeDef);

        const rng = makeRng(seed);
        const { xMin, xMax, zMin, zMax } = gridBounds;

        // Marge de sécurité autour de la grille (aucun anchor ne la franchit)
        const SAFE = 2.5;

        // Marges de zone par direction
        const mBack  = tileSize * 5.5;
        const mSide  = tileSize * 5.0;
        const mFront = tileSize * 2.5;

        // ── BACK (derrière la grille) — groupes imposants ──────────────────
        this.fillZone(
            xMin - mSide,  xMax + mSide,
            zMax + SAFE,   zMax + mBack,
            "back", biomeDef, density * 1.0,
            rng, floorY, SAFE, cb
        );

        // ── CÔTÉ GAUCHE — groupes moyens ───────────────────────────────────
        this.fillZone(
            xMin - mSide,  xMin - SAFE,
            zMin - mSide * 0.4, zMax + mBack * 0.6,
            "mid", biomeDef, density * 0.9,
            rng, floorY, SAFE, cb
        );

        // ── CÔTÉ DROIT ─────────────────────────────────────────────────────
        this.fillZone(
            xMax + SAFE,   xMax + mSide,
            zMin - mSide * 0.4, zMax + mBack * 0.6,
            "mid", biomeDef, density * 0.9,
            rng, floorY, SAFE, cb
        );

        // ── AVANT GAUCHE — végétation basse ────────────────────────────────
        this.fillZone(
            xMin - mSide * 0.6, xMin - SAFE,
            zMin - mFront,      zMin - SAFE,
            "front", biomeDef, density * 0.5,
            rng, floorY, SAFE, cb
        );

        // ── AVANT DROIT ────────────────────────────────────────────────────
        this.fillZone(
            xMax + SAFE,        xMax + mSide * 0.6,
            zMin - mFront,      zMin - SAFE,
            "front", biomeDef, density * 0.5,
            rng, floorY, SAFE, cb
        );

        // ── AVANT CENTRE — herbes/fleurs clairsemées ───────────────────────
        this.fillZone(
            xMin - SAFE * 0.5,  xMax + SAFE * 0.5,
            zMin - mFront,      zMin - SAFE,
            "front", biomeDef, density * 0.3,
            rng, floorY, SAFE, cb
        );
    }

    // -------------------------------------------------------------------------
    // Remplissage d'une zone rectangulaire avec des groupes
    // -------------------------------------------------------------------------

    /**
     * Distribue des groupes composites dans une zone.
     * La densité contrôle le nombre de groupes par unité de surface.
     */
    private fillZone(
        x0: number, x1: number,
        z0: number, z1: number,
        layer:    PropLayer,
        biomeDef: BiomeDef,
        density:  number,
        rng:      () => number,
        floorY:   number,
        safe:     number,
        cb:       ComposerSpawnCallbacks
    ): void {
        const w = x1 - x0;
        const d = z1 - z0;
        if (w <= 0 || d <= 0) return;

        // Nombre de groupes proportionnel à la surface et à la densité
        // La constante 14 est calibrée pour une densité=1 → couverture naturelle
        const count = Math.max(0, Math.floor((w * d / 14) * density));

        // Poisson-disc simplifié : on garde une liste de centres placés
        // pour éviter les superpositions entre anchors (rayon minimal = 2.5 u.)
        const placed: [number, number][] = [];
        const MIN_ANCHOR_DIST = 2.5;

        for (let i = 0; i < count * 4 && placed.length < count; i++) {
            const cx = x0 + rng() * w;
            const cz = z0 + rng() * d;

            // Rejet si trop proche d'un anchor déjà placé
            let tooClose = false;
            for (const [px, pz] of placed) {
                const dx = cx - px, dz = cz - pz;
                if (Math.sqrt(dx * dx + dz * dz) < MIN_ANCHOR_DIST) {
                    tooClose = true;
                    break;
                }
            }
            if (tooClose) continue;

            const group = this.selectGroup(layer, biomeDef, rng);
            if (!group) continue;

            placed.push([cx, cz]);
            this.spawnGroup(group, cx, floorY, cz, layer, rng, cb);
        }
    }
}
