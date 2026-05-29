import { Color3, Color4, Vector3 } from '@babylonjs/core';

export interface FloorConfig {
  baseColor: string;
  stripeColor: string;
  accentColor: string;
  stripeWidth: number;
  noiseAmp: number;
  noiseFreq: number;
}

export interface SkyColors {
  zenith: string;
  horizon: string;
  ground: string;
}

export interface SunConfig {
  color: string;
  x: number;
  y: number;
  radius: number;
  glowRadius: number;
}

export interface CombatArtPreset {
  id: string;
  clearColor: Color4;
  terrainTint: Color3;
  terrainEmissive: Color3;
  backgroundEmissive: Color3;
  ambient: {
    diffuse: Color3;
    ground: Color3;
    intensity: number;
  };
  sun: {
    direction: Vector3;
    position: Vector3;
    diffuse: Color3;
    specular: Color3;
    intensity: number;
  };
  post: {
    contrast: number;
    exposure: number;
    bloomThreshold: number;
    bloomWeight: number;
    dofFStop: number;
    dofFocalLength: number;
    dofLensSize: number;
  };
  floor: FloorConfig;
  sky: SkyColors;
  skySun: SunConfig;
  depth: {
    foregroundEmissive: Color3;
    foregroundAlpha: number;
    grassEmissive: Color3;
    grassAlpha: number;
    hazeEmissive: Color3;
    hazeAlpha: number;
  };
  particles: {
    count: number;
    color: Color3;
    alphaMin: number;
    alphaMax: number;
  };
}

const FOREST_STAGE: CombatArtPreset = {
  id: 'forest',
  clearColor: new Color4(0.018, 0.045, 0.028, 1),
  terrainTint: new Color3(0.15, 0.24, 0.12),
  terrainEmissive: new Color3(0.010, 0.026, 0.012),
  backgroundEmissive: new Color3(0.10, 0.16, 0.13),
  ambient: {
    diffuse: new Color3(0.40, 0.50, 0.68),
    ground: new Color3(0.025, 0.055, 0.035),
    intensity: 0.48,
  },
  sun: {
    direction: new Vector3(-0.8, -1.2, 0.6).normalize(),
    position: new Vector3(-24, 38, -22),
    diffuse: new Color3(1.0, 0.78, 0.42),
    specular: new Color3(0.7, 0.55, 0.32),
    intensity: 1.08,
  },
  post: {
    contrast: 1.14,
    exposure: 0.98,
    bloomThreshold: 0.72,
    bloomWeight: 0.32,
    dofFStop: 1.35,
    dofFocalLength: 54,
    dofLensSize: 48,
  },
  floor: {
    baseColor: '#4c5b3b',
    stripeColor: '#2f412d',
    accentColor: '#68734b',
    stripeWidth: 3,
    noiseAmp: 6,
    noiseFreq: 0.08,
  },
  sky: { zenith: '#0d1f3c', horizon: '#2a5a7a', ground: '#1a3a28' },
  skySun: {
    color: '#fff5cc',
    x: 0.75,
    y: 0.28,
    radius: 20,
    glowRadius: 54,
  },
  depth: {
    foregroundEmissive: new Color3(0.025, 0.07, 0.035),
    foregroundAlpha: 0.72,
    grassEmissive: new Color3(0.018, 0.055, 0.025),
    grassAlpha: 0.56,
    hazeEmissive: new Color3(0.34, 0.48, 0.36),
    hazeAlpha: 0.30,
  },
  particles: {
    count: 52,
    color: new Color3(0.65, 1.0, 0.34),
    alphaMin: 0.22,
    alphaMax: 0.77,
  },
};

const RUINS_STAGE: CombatArtPreset = {
  ...FOREST_STAGE,
  id: 'ruins',
  clearColor: new Color4(0.035, 0.04, 0.045, 1),
  terrainTint: new Color3(0.24, 0.23, 0.20),
  terrainEmissive: new Color3(0.025, 0.025, 0.022),
  backgroundEmissive: new Color3(0.13, 0.13, 0.12),
  floor: {
    baseColor: '#5e594e',
    stripeColor: '#3f3b34',
    accentColor: '#82785f',
    stripeWidth: 3,
    noiseAmp: 6,
    noiseFreq: 0.08,
  },
  sky: { zenith: '#182038', horizon: '#5a6578', ground: '#3d403f' },
  depth: {
    ...FOREST_STAGE.depth,
    foregroundAlpha: 0.54,
    grassAlpha: 0.42,
    hazeEmissive: new Color3(0.48, 0.48, 0.42),
    hazeAlpha: 0.26,
  },
};

const MOUNTAIN_STAGE: CombatArtPreset = {
  ...FOREST_STAGE,
  id: 'mountain',
  clearColor: new Color4(0.08, 0.10, 0.13, 1),
  terrainTint: new Color3(0.24, 0.24, 0.22),
  terrainEmissive: new Color3(0.022, 0.024, 0.026),
  backgroundEmissive: new Color3(0.13, 0.15, 0.17),
  ambient: {
    diffuse: new Color3(0.48, 0.54, 0.68),
    ground: new Color3(0.045, 0.045, 0.048),
    intensity: 0.38,
  },
  floor: {
    baseColor: '#5b5b52',
    stripeColor: '#4a4a42',
    accentColor: '#737168',
    stripeWidth: 3,
    noiseAmp: 8,
    noiseFreq: 0.08,
  },
  sky: { zenith: '#111824', horizon: '#45556b', ground: '#2c3136' },
  depth: {
    ...FOREST_STAGE.depth,
    foregroundAlpha: 0.42,
    grassAlpha: 0.35,
    hazeEmissive: new Color3(0.46, 0.52, 0.58),
    hazeAlpha: 0.30,
  },
  particles: {
    count: 28,
    color: new Color3(0.72, 0.86, 1.0),
    alphaMin: 0.12,
    alphaMax: 0.42,
  },
};

export function getCombatArtPreset(biome: string): CombatArtPreset {
  switch (biome) {
    case 'mountain':
      return MOUNTAIN_STAGE;
    case 'city':
    case 'ruins':
      return RUINS_STAGE;
    case 'forest':
    default:
      return FOREST_STAGE;
  }
}
