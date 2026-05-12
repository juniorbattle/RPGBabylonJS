src/
  scenes/
    CombatScene.ts
  rendering/
    SceneLayerManager.ts
    SceneLayerTypes.ts
  biomes/
    magicalForestLayers.ts
  assets/
    backgrounds/
      magical_forest/
        background.png
        midground.png
        foreground_frame.png
        platform_blend_fog.png
        magic_fog_particles.png




export const magicalForestLayers = [
  {
    id: "background_forest",
    textureUrl: "/assets/backgrounds/magical_forest/background.png",
    width: 22,
    height: 12,
    position: { x: 0, y: 3.0, z: 10 },
    rotation: { x: 0, y: 0, z: 0 },
    alpha: {
      front: 1.0,
      overview: 0.95,
    },
    parallax: 0.05,
    blendMode: "alpha",
  },
  {
    id: "midground_forest",
    textureUrl: "/assets/backgrounds/magical_forest/midground.png",
    width: 20,
    height: 9,
    position: { x: 0, y: 1.7, z: 6 },
    rotation: { x: 0, y: 0, z: 0 },
    alpha: {
      front: 0.95,
      overview: 0.8,
    },
    parallax: 0.12,
    blendMode: "alpha",
  },
  {
    id: "foreground_frame",
    textureUrl: "/assets/backgrounds/magical_forest/foreground_frame.png",
    width: 20,
    height: 10,
    position: { x: 0, y: 0.5, z: 2.8 },
    rotation: { x: 0, y: 0, z: 0 },
    alpha: {
      front: 0.85,
      overview: 0.45,
    },
    parallax: 0.25,
    blendMode: "alpha",
  },
  {
    id: "platform_blend_fog",
    textureUrl: "/assets/backgrounds/magical_forest/platform_blend_fog.png",
    width: 16,
    height: 6,
    position: { x: 0, y: 0.1, z: 1.8 },
    rotation: { x: 0, y: 0, z: 0 },
    alpha: {
      front: 0.38,
      overview: 0.25,
    },
    parallax: 0.08,
    blendMode: "additive",
  },
  {
    id: "magic_fog_particles",
    textureUrl: "/assets/backgrounds/magical_forest/magic_fog_particles.png",
    width: 18,
    height: 8,
    position: { x: 0, y: 0.2, z: 1.2 },
    rotation: { x: 0, y: 0, z: 0 },
    alpha: {
      front: 0.32,
      overview: 0.22,
    },
    parallax: 0.18,
    blendMode: "additive",
  },
];