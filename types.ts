export type Vector = { x: number; y: number };

export enum EntityType {
  UNIT = 'UNIT',
  BUILDING = 'BUILDING',
}

export enum Team {
  PLAYER = 'PLAYER',
  ENEMY = 'ENEMY',
}

export enum BuildingType {
  GENERATOR = 'Generator', // Energy
  EXTRACTOR = 'Extractor', // Metal
  BARRACKS_A = 'Barracks A', // Basic Unit
  BARRACKS_B = 'Barracks B', // Ranged/Alt Unit
  ARMOURY = 'Armoury', // Upgrades
  TURRET = 'Turret', // Defensive Turret
}

export enum UnitType {
  SOLDIER = 'Soldier', // Barracks A
  SNIPER = 'Sniper',   // Barracks B
  TANK = 'Tank',       // Strong variant
  COMMANDER = 'Commander', // Epic commander
}

export interface Entity {
  id: string;
  type: EntityType;
  subType: string;
  team: Team;
  position: Vector;
  radius: number;
  health: number;
  maxHealth: number;
  isSelected?: boolean;
}

export interface Unit extends Entity {
  type: EntityType.UNIT;
  subType: UnitType;
  targetPosition: Vector | null; // Moving to
  targetEntityId: string | null; // Attacking
  attackRange: number;
  attackDamage: number;
  attackCooldown: number;
  lastAttackTime: number;
  moveSpeed: number;
  state: 'IDLE' | 'MOVE' | 'ATTACK' | 'CHASE';
  heading?: number; // Dynamic rotation angle in radians
  turretHeading?: number; // Smooth turret facing (for Tank)
}

export interface Building extends Entity {
  type: EntityType.BUILDING;
  subType: BuildingType;
  
  // Construction
  isUnderConstruction: boolean;
  isWaitingForClearance?: boolean;
  constructionTimer: number; // Counts down to 0
  maxConstructionTime: number;

  // Unit Production
  unitQueue: UnitType[];
  productionTimer: number; // Time remaining for current unit
  totalProductionTime: number; // Max time for current unit
  
  unitsProducedCount: number; // For the 1 in 10 logic
  width: number;
  height: number;
  rallyPoint?: Vector | null;

  // Defensive Turret fields
  turretHeading?: number;
  attackRange?: number;
  attackDamage?: number;
  attackCooldown?: number;
  lastAttackTime?: number;
}

export interface Particle {
  id: string;
  position: Vector;
  velocity: Vector;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface GameState {
  money: {
    metal: number;
    energy: number;
  };
  income: {
    metal: number;
    energy: number;
  };
  units: Unit[];
  buildings: Building[];
  particles: Particle[];
  selection: {
    active: boolean;
    start: Vector;
    end: Vector;
  };
  camera: Vector;
  mapSize: { width: number; height: number };
  upgrades: {
    damageLevel: number;
    healthLevel: number;
  };
  gameOver: boolean;
  victory: boolean;
  zoom: number;
}

export interface Cost {
  metal: number;
  energy: number;
}