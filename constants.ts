import { BuildingType, Cost, UnitType } from "./types";

export const FPS = 60;
export const GRID_SIZE = 40;
export const MAP_WIDTH = 2400; // Slightly larger map
export const MAP_HEIGHT = 2400;

export const INITIAL_RESOURCES = {
  metal: 200,
  energy: 100,
};

export const RESOURCE_GENERATION_RATE = {
  metal: 2, // Rare, making metal extractors extremely valuable!
  energy: 4, // Energy Generator provides +4 energy generation
};

export const CAMERA_SPEED = 30; // Faster camera

export const BUILDING_STATS: Record<BuildingType, { cost: Cost; width: number; height: number; health: number; buildTime: number }> = {
  [BuildingType.GENERATOR]: { cost: { metal: 40, energy: 0 }, width: 1.0, height: 1.0, health: 250, buildTime: 2500 }, // 1x1 Power Generator
  [BuildingType.EXTRACTOR]: { cost: { metal: 0, energy: 50 }, width: 1.5, height: 1.5, health: 300, buildTime: 3000 },
  [BuildingType.BARRACKS_A]: { cost: { metal: 150, energy: 50 }, width: 2.2, height: 2.2, health: 650, buildTime: 5000 },
  [BuildingType.BARRACKS_B]: { cost: { metal: 150, energy: 100 }, width: 2.2, height: 2.2, health: 650, buildTime: 5000 },
  [BuildingType.ARMOURY]: { cost: { metal: 250, energy: 200 }, width: 2.2, height: 2.2, health: 800, buildTime: 8000 },
  [BuildingType.TURRET]: { cost: { metal: 100, energy: 40 }, width: 1.0, height: 1.0, health: 400, buildTime: 4000 }, // Sleek, smaller 1x1 Laser Turret
};

// Unit speeds reduced for tactical pacing and fluid formation tracking (halved speed as requested)
export const UNIT_STATS: Record<UnitType, { cost: Cost; health: number; damage: number; range: number; speed: number; cooldown: number; buildTime: number }> = {
  [UnitType.SOLDIER]: { cost: { metal: 60, energy: 10 }, health: 120, damage: 12, range: 100, speed: 0.175, cooldown: 1000, buildTime: 2000 },
  [UnitType.SNIPER]: { cost: { metal: 110, energy: 50 }, health: 80, damage: 45, range: 250, speed: 0.125, cooldown: 2500, buildTime: 4000 },
  [UnitType.TANK]: { cost: { metal: 220, energy: 120 }, health: 500, damage: 35, range: 120, speed: 0.75, cooldown: 1800, buildTime: 5000 },
  [UnitType.COMMANDER]: { cost: { metal: 1000, energy: 1000 }, health: 2500, damage: 70, range: 190, speed: 0.15, cooldown: 1200, buildTime: 99999 }, // Unbuildable commander
};

export const ARMOURY_UPGRADE_COST: Cost = { metal: 200, energy: 200 };
export const UPGRADE_MULTIPLIER = 0.20; // 20% increase per level

export const SPAWN_THRESHOLD = 10; // Every 10 units, spawn a stronger one

export const ENEMY_SPAWN_INTERVAL = 12000; // Enemy spawns units every 12s
export const ENEMY_WAVE_SIZE = 2; // Enemy spawns 2 units at a time