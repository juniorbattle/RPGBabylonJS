/**
 * WorldMapManager.ts
 * Manages the interactive World Map POI and transitions to BattleMaps.
 */

export enum BiomeType {
  Plain = 'Plain',
  Forest = 'Forest',
  Dungeon = 'Dungeon',
  Boss = 'Boss'
}

export interface BattleMapConfig {
  id: string;
  name: string;
  biome: BiomeType;
  gridSize: { width: number, depth: number };
  enemyIds: string[]; // IDs from bestiary.json
  recommendedLevel: number;
}

export class WorldMapManager {
  // POI configurations
  private locations: BattleMapConfig[] = [
    {
      id: 'forest_1',
      name: 'Whispering Woods',
      biome: BiomeType.Forest,
      gridSize: { width: 10, depth: 10 },
      enemyIds: ['enemy_wolf', 'enemy_wolf'],
      recommendedLevel: 5
    },
    {
      id: 'plains_1',
      name: 'Sun-drenched Meadow',
      biome: BiomeType.Plain,
      gridSize: { width: 12, depth: 12 },
      enemyIds: ['enemy_wolf', 'enemy_wolf', 'enemy_wolf'],
      recommendedLevel: 3
    }
  ];

  public getLocations(): BattleMapConfig[] {
    return this.locations;
  }
}
