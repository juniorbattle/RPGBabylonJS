/**
 * generate-manifest.js
 * GPA Tactics — Asset Scanner
 * Structure /public/assets/decorations/ :
 *   tree/ rock/ grass/ bush/ flower/ cliff/ ruins/ pillar/ unique/
 *   altar/ torch/ statue/ building/
 *   flr_*.jpg  bg_*.jpg à la racine
 */

const fs   = require('fs');
const path = require('path');

const DECORATIONS_DIR = path.join(__dirname, 'public', 'assets', 'decorations');
const BACKGROUNDS_DIR = path.join(__dirname, 'public', 'assets', 'backgrounds');
const MANIFEST_FILE   = path.join(__dirname, 'public', 'data', 'editor_manifest.json');
const IMG_EXTS        = ['.png', '.jpg', '.jpeg', '.webp'];

const ANIMATED_DIR = 'animated';
const KNOWN_ANIMATED_PROPS = [
    {
        file: `${ANIMATED_DIR}/torch_flicker_sheet.png`,
        type: "torch_flicker",
        scaleRange: [0.9, 1.9],
        cols: 4,
        rows: 1,
        fps: 8,
        animations: {
            idle: { frames: [0, 1, 2, 3], fps: 8, loop: true }
        }
    }
];

const ALL_BIOMES = ["forest", "plains", "mountain", "swamp", "ruins", "city"];

const TYPE_BIOMES = {
    tree:   ALL_BIOMES,
    rock:   ALL_BIOMES,
    grass:  ALL_BIOMES,
    bush:   ALL_BIOMES,
    flower: ALL_BIOMES,
    cliff:  ALL_BIOMES,
    ruins:  ALL_BIOMES,
    altar:  ALL_BIOMES,
    torch:  ALL_BIOMES,
    statue: ALL_BIOMES,
    building: ALL_BIOMES,
    pillar: ALL_BIOMES,
    unique: ALL_BIOMES,
};

// ScaleRange: imposants avec variation forte pour immersion HD-2D
const TYPE_SCALE_RANGES = {
    tree:   [1.6, 3.2],   // grands arbres avec forte variation
    rock:   [0.6, 1.6],
    grass:  [0.8, 1.4],
    bush:   [0.7, 1.3],
    flower: [0.5, 1.0],
    cliff:  [1.8, 3.5],
    ruins:  [1.0, 2.2],
    altar:  [1.1, 2.2],
    torch:  [0.9, 1.9],
    statue: [1.2, 2.8],
    building: [1.4, 2.8],
    pillar: [0.8, 1.8],
    unique: [0.8, 1.6],
};

// Palettes sol par biome — procédural, pas d'image
const FLOOR_CONFIGS = {
    forest:   { baseColor: "#2a5c18", stripeColor: "#1e4a10", accentColor: "#3a7020", stripeWidth: 2, noiseAmp: 10, noiseFreq: 0.09 },
    plains:   { baseColor: "#4a8c28", stripeColor: "#3a7020", accentColor: "#5aa030", stripeWidth: 4, noiseAmp:  6, noiseFreq: 0.06 },
    mountain: { baseColor: "#5a5248", stripeColor: "#464038", accentColor: "#6a6258", stripeWidth: 6, noiseAmp: 14, noiseFreq: 0.11 },
    swamp:    { baseColor: "#2a4020", stripeColor: "#1e3018", accentColor: "#354828", stripeWidth: 3, noiseAmp: 12, noiseFreq: 0.10 },
    ruins:    { baseColor: "#5a4830", stripeColor: "#483c24", accentColor: "#6a5838", stripeWidth: 5, noiseAmp: 16, noiseFreq: 0.08 },
    city:     { baseColor: "#484848", stripeColor: "#383838", accentColor: "#585858", stripeWidth: 8, noiseAmp:  5, noiseFreq: 0.05 },
};

const DEFAULT_BIOMES = {
    forest: {
        floor: FLOOR_CONFIGS.forest,
        skyColors:   { zenith: "#0d1f3c", horizon: "#2a5a7a", ground: "#1a3a28" },
        sun:         { color: "#fff5cc", x: 0.75, y: 0.72, radius: 28, glowRadius: 60 },
        clouds:      { color: "#c8dce8", count: 5 },
        silhouettes: [
            { shape: "tree_line", color: "#0a2010", y: 0.62, density: 0.8 },
            { shape: "tree_line", color: "#081808", y: 0.70, density: 0.5 }
        ],
        fog: { color: "#2a4a5a", opacity: 0.18 },
        propWeights: { tree: 0.55, grass: 0.60, bush: 0.45, flower: 0.30, rock: 0.15, pillar: 0.08, unique: 0.12, cliff: 0.04, ruins: 0.00, altar: 0.01, torch: 0.03, statue: 0.02, building: 0.08 },
        animatedPropWeights: { torch_flicker: 0.08 }
    },
    plains: {
        floor: FLOOR_CONFIGS.plains,
        skyColors:   { zenith: "#0a1a3a", horizon: "#4a8ab8", ground: "#2a4a20" },
        sun:         { color: "#fffae0", x: 0.70, y: 0.68, radius: 32, glowRadius: 72 },
        clouds:      { color: "#ddeef8", count: 7 },
        silhouettes: [
            { shape: "hill",      color: "#1a3018", y: 0.68, density: 1.0 },
            { shape: "tree_line", color: "#0f2010", y: 0.74, density: 0.3 }
        ],
        fog: { color: "#4a7a9a", opacity: 0.10 },
        propWeights: { tree: 0.25, grass: 0.70, bush: 0.40, flower: 0.55, rock: 0.20, pillar: 0.05, unique: 0.08, cliff: 0.08, ruins: 0.00, altar: 0.03, torch: 0.04, statue: 0.05, building: 0.06 },
        animatedPropWeights: { torch_flicker: 0.04 }
    },
    mountain: {
        floor: FLOOR_CONFIGS.mountain,
        skyColors:   { zenith: "#060d18", horizon: "#1a3050", ground: "#2a2a2a" },
        sun:         { color: "#e8e0d0", x: 0.65, y: 0.60, radius: 24, glowRadius: 50 },
        clouds:      { color: "#a0b0c0", count: 3 },
        silhouettes: [
            { shape: "mountain", color: "#0a0f18", y: 0.55, density: 1.0 },
            { shape: "mountain", color: "#060a10", y: 0.65, density: 0.7 }
        ],
        fog: { color: "#1a2a40", opacity: 0.28 },
        propWeights: { tree: 0.08, grass: 0.20, bush: 0.12, flower: 0.03, rock: 0.65, pillar: 0.10, unique: 0.05, cliff: 0.62, ruins: 0.10, altar: 0.09, torch: 0.08, statue: 0.18, building: 0.04 },
        animatedPropWeights: { torch_flicker: 0.06 }
    },
    swamp: {
        floor: FLOOR_CONFIGS.swamp,
        skyColors:   { zenith: "#0a1008", horizon: "#1e3022", ground: "#0f1a10" },
        sun:         { color: "#c8d890", x: 0.60, y: 0.55, radius: 20, glowRadius: 55 },
        clouds:      { color: "#607060", count: 4 },
        silhouettes: [
            { shape: "tree_line", color: "#060e06", y: 0.58, density: 0.9 },
            { shape: "tree_line", color: "#040a04", y: 0.68, density: 0.6 }
        ],
        fog: { color: "#1a3020", opacity: 0.35 },
        propWeights: { tree: 0.42, grass: 0.50, bush: 0.55, flower: 0.10, rock: 0.12, pillar: 0.05, unique: 0.18, cliff: 0.03, ruins: 0.00, altar: 0.03, torch: 0.09, statue: 0.02, building: 0.02 },
        animatedPropWeights: { torch_flicker: 0.12 }
    },
    ruins: {
        floor: FLOOR_CONFIGS.ruins,
        skyColors:   { zenith: "#1a0a08", horizon: "#3a2018", ground: "#2a1a10" },
        sun:         { color: "#e09060", x: 0.68, y: 0.52, radius: 26, glowRadius: 65 },
        clouds:      { color: "#806050", count: 3 },
        silhouettes: [
            { shape: "ruins_line", color: "#100808", y: 0.60, density: 0.8 },
            { shape: "hill",       color: "#0a0505", y: 0.70, density: 0.6 }
        ],
        fog: { color: "#3a2010", opacity: 0.30 },
        propWeights: { tree: 0.12, grass: 0.25, bush: 0.18, flower: 0.04, rock: 0.38, pillar: 0.22, unique: 0.22, cliff: 0.24, ruins: 0.62, altar: 0.45, torch: 0.35, statue: 0.52, building: 0.08 },
        animatedPropWeights: { torch_flicker: 0.28 }
    },
    city: {
        floor: FLOOR_CONFIGS.city,
        skyColors:   { zenith: "#0a0f1a", horizon: "#253045", ground: "#1a1f28" },
        sun:         { color: "#d8e8f8", x: 0.72, y: 0.65, radius: 22, glowRadius: 48 },
        clouds:      { color: "#909aaa", count: 4 },
        silhouettes: [
            { shape: "city_line", color: "#0a0d14", y: 0.55, density: 1.0 },
            { shape: "city_line", color: "#060810", y: 0.65, density: 0.6 }
        ],
        fog: { color: "#1a2030", opacity: 0.22 },
        propWeights: { tree: 0.04, grass: 0.10, bush: 0.06, flower: 0.02, rock: 0.28, pillar: 0.32, unique: 0.16, cliff: 0.04, ruins: 0.38, altar: 0.22, torch: 0.40, statue: 0.50, building: 0.55 },
        animatedPropWeights: { torch_flicker: 0.32 }
    }
};

// ---------------------------------------------------------------------------
console.log('--- 🛠️  GPA Tactics — Asset Scanner ---');

if (!fs.existsSync(DECORATIONS_DIR)) {
    fs.mkdirSync(DECORATIONS_DIR, { recursive: true });
}
if (!fs.existsSync(BACKGROUNDS_DIR)) {
    fs.mkdirSync(BACKGROUNDS_DIR, { recursive: true });
}
const dataDir = path.dirname(MANIFEST_FILE);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

let backgrounds = [], floors = [], props = [];
let preservedAnimatedProps = [];

if (fs.existsSync(BACKGROUNDS_DIR)) {
    const bgFiles = fs.readdirSync(BACKGROUNDS_DIR)
        .filter(f => !f.startsWith('.') && IMG_EXTS.includes(path.extname(f).toLowerCase()))
        .sort((a, b) => a.localeCompare(b));
    backgrounds = bgFiles;
    console.log(`  🖼️  backgrounds/  →  ${bgFiles.length} asset(s)`);
}

if (fs.existsSync(MANIFEST_FILE)) {
    try {
        const existing = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
        preservedAnimatedProps = Array.isArray(existing.animatedProps) ? existing.animatedProps : [];
    } catch {
        preservedAnimatedProps = [];
    }
}

const animatedPropsByFile = new Map();
[...KNOWN_ANIMATED_PROPS, ...preservedAnimatedProps].forEach(prop => {
    if (!prop?.file) return;
    if (!fs.existsSync(path.join(DECORATIONS_DIR, prop.file))) return;
    animatedPropsByFile.set(prop.file, prop);
});

const entries = fs.readdirSync(DECORATIONS_DIR, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));

for (const entry of entries) {
    if (entry.isDirectory()) {
        const typeName   = entry.name.toLowerCase();
        if (typeName === ANIMATED_DIR) {
            console.log(`  animated/  ->  ${animatedPropsByFile.size} animated asset(s)`);
            continue;
        }
        const typeDir    = path.join(DECORATIONS_DIR, entry.name);
        const typeFiles  = fs.readdirSync(typeDir).sort((a, b) => a.localeCompare(b));
        const biomes     = TYPE_BIOMES[typeName]       || ["forest", "plains"];
        const scaleRange = TYPE_SCALE_RANGES[typeName] || [0.6, 1.2];
        let count = 0;
        typeFiles.forEach(file => {
            if (file.startsWith('.')) return;
            if (!IMG_EXTS.includes(path.extname(file).toLowerCase())) return;
            props.push({ file: `${entry.name}/${file}`, type: typeName, biomes, scaleRange });
            count++;
        });
        console.log(`  📁 ${entry.name}/  →  ${count} asset(s)`);
    } else if (entry.isFile()) {
        const file = entry.name;
        if (file.startsWith('.')) continue;
        if (!IMG_EXTS.includes(path.extname(file).toLowerCase())) continue;
        if (file.startsWith('bg_')) {
            // Compat legacy : les nouveaux backgrounds vivent dans /assets/backgrounds/.
            if (!backgrounds.includes(file)) backgrounds.push(file);
        } else if (file.startsWith('flr_')) floors.push(file);
    }
}

let existingBiomes = DEFAULT_BIOMES;
if (fs.existsSync(MANIFEST_FILE)) {
    try {
        const existing = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
        if (existing.biomes) {
            // Merge : garde les customisations manuelles mais applique les nouveaux floor configs
            existingBiomes = {};
            for (const key of Object.keys(DEFAULT_BIOMES)) {
                existingBiomes[key] = {
                    ...DEFAULT_BIOMES[key],
                    ...(existing.biomes[key] || {}),
                    floor: DEFAULT_BIOMES[key].floor, // toujours écraser le floor avec la palette à jour
                };
                existingBiomes[key].propWeights = {
                    ...DEFAULT_BIOMES[key].propWeights,
                    ...(existing.biomes[key]?.propWeights || {})
                };
                existingBiomes[key].animatedPropWeights = {
                    ...(DEFAULT_BIOMES[key].animatedPropWeights || {}),
                    ...(existing.biomes[key]?.animatedPropWeights || {})
                };
            }
            console.log('  ✅ Biomes préservés + floors mis à jour.');
        }
    } catch { console.warn('  ⚠️  Manifest illisible.'); }
}

const animatedProps = Array.from(animatedPropsByFile.values())
    .sort((a, b) => a.file.localeCompare(b.file));

function buildBiomeLayerPresets(backgroundFiles) {
    const available = new Set(backgroundFiles);
    const fallback = {
        background: 'bg_forest_v3_main.png',
        midground: 'mid_forest_v3_alpha.png',
        foreground: 'fore_forest_v3_alpha.png',
        fxOverlay: 'fx_forest_v3_alpha.png',
    };
    const filesByBiome = {
        forest: fallback,
        plains: {
            background: 'bg_plains_main.png',
            midground: 'mid_plains_hills.png',
            foreground: 'fore_plains_grass.png',
            fxOverlay: 'fx_plains_wind.png',
        },
        mountain: {
            background: 'bg_mountain_main.png',
            midground: 'mid_mountain_rocks.png',
            foreground: 'fore_mountain_cliffs.png',
            fxOverlay: 'fx_mountain_fog.png',
        },
        swamp: {
            background: 'bg_swamp_main.png',
            midground: 'mid_swamp_trees.png',
            foreground: 'fore_swamp_roots.png',
            fxOverlay: 'fx_swamp_mist.png',
        },
        ruins: {
            background: 'bg_ruins_main.png',
            midground: 'mid_ruins_pillars.png',
            foreground: 'fore_ruins_arches.png',
            fxOverlay: 'fx_ruins_dust.png',
        },
        city: {
            background: 'bg_city_main.png',
            midground: 'mid_city_buildings.png',
            foreground: 'fore_city_walls.png',
            fxOverlay: 'fx_city_smoke.png',
        },
    };
    const pick = (candidate, layer) => available.has(candidate) ? candidate : fallback[layer];
    return Object.fromEntries(ALL_BIOMES.map((biome) => {
        const files = filesByBiome[biome] || fallback;
        return [biome, {
            id: biome,
            background: { file: pick(files.background, 'background') },
            midground: { file: pick(files.midground, 'midground') },
            foreground: { file: pick(files.foreground, 'foreground') },
            fxOverlay: { file: pick(files.fxOverlay, 'fxOverlay') },
        }];
    }));
}

const biomeLayerPresets = buildBiomeLayerPresets(backgrounds);
const manifest = { version: "4.2", last_scan: new Date().toISOString(), backgrounds, floors, props, animatedProps, biomes: existingBiomes, biomeLayerPresets };
fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));

console.log(`\nDone. ${props.length} props, ${animatedProps.length} animated props, ${floors.length} floors, ${backgrounds.length} backgrounds`);
console.log(`   → ${MANIFEST_FILE}`);
