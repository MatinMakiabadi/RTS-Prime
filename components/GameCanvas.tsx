import React, { useRef, useEffect, useState } from 'react';
import { GameState, Team, EntityType, Building, BuildingType, UnitType, Vector, Entity, Cost } from '../types';
import { GRID_SIZE, MAP_WIDTH, MAP_HEIGHT, BUILDING_STATS, UNIT_STATS, SPAWN_THRESHOLD, ARMOURY_UPGRADE_COST, UPGRADE_MULTIPLIER, INITIAL_RESOURCES, RESOURCE_GENERATION_RATE, ENEMY_SPAWN_INTERVAL, CAMERA_SPEED } from '../constants';
import { Menu, Zap, Hammer, Shield, Crosshair, TrendingUp, AlertTriangle, CheckCircle, Volume2, VolumeX } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface CombatLogItem {
  id: string;
  text: string;
  type: 'info' | 'danger' | 'warning' | 'success';
  timestamp: number;
}

interface BuildButtonProps {
  label: string;
  cost: Cost & { buildTime?: number };
  icon: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  compact?: boolean;
  tooltip?: string;
}

export const BuildButton = ({
  label,
  cost,
  icon,
  onClick,
  active = false,
  disabled = false,
  compact = false,
  tooltip,
}: BuildButtonProps) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`relative group flex flex-col items-center justify-center p-2 ${
      compact ? 'w-16 h-16' : 'w-20 h-20'
    } rounded-xl transition-all duration-150 ${
      active
        ? 'bg-cyan-950/80 border-2 border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.35)]'
        : 'bg-slate-900/90 border border-slate-800 hover:bg-slate-800/80'
    } ${disabled ? 'opacity-35 cursor-not-allowed grayscale' : 'cursor-pointer active:scale-95'}`}
  >
    <div className={`${compact ? 'mb-0.5' : 'mb-1.5'} ${active ? 'text-cyan-400' : 'text-slate-300'}`}>
      {icon}
    </div>
    <span className="text-[9px] font-mono font-bold uppercase tracking-tight text-slate-400">
      {label}
    </span>

    {/* Cost Tooltip */}
    <div className="absolute bottom-full mb-3 left-1/2 transform -translate-x-1/2 bg-slate-950 text-white text-[10px] px-3 py-2 rounded-lg shadow-2xl border border-slate-800 hidden group-hover:block whitespace-nowrap z-50 pointer-events-none min-w-[110px] uppercase font-mono tracking-wider">
      {tooltip && (
        <div className="mb-1 text-slate-300 border-b border-slate-800 pb-1 font-bold">{tooltip}</div>
      )}
      <div className="flex items-center gap-3 font-semibold">
        <span className="flex items-center text-slate-300">
          <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full mr-1"></span> {cost.metal}
        </span>
        {cost.energy > 0 && (
          <span className="flex items-center text-yellow-400">
            <Zap size={9} className="mr-0.5 text-yellow-500" /> {cost.energy}
          </span>
        )}
      </div>
      {cost.buildTime && (
        <div className="text-slate-500 mt-1 italic text-[9px] lowercase">
          {cost.buildTime / 1000}s build time
        </div>
      )}
    </div>
  </button>
);

interface CombatLogProps {
  logs: CombatLogItem[];
}

export const CombatLog = ({ logs }: CombatLogProps) => {
  return (
    <div className="absolute top-24 left-6 z-40 flex flex-col gap-1.5 pointer-events-none max-w-sm">
      <AnimatePresence>
        {logs.map((log) => {
          let badgeColor = 'bg-slate-900/90 text-slate-300 border-slate-800';
          if (log.type === 'danger') badgeColor = 'bg-rose-950/80 text-rose-300 border-rose-800/60 shadow-[0_0_10px_rgba(239,68,68,0.15)]';
          if (log.type === 'warning') badgeColor = 'bg-yellow-950/80 text-yellow-300 border-yellow-800/60 shadow-[0_0_10px_rgba(234,179,8,0.1)]';
          if (log.type === 'success') badgeColor = 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60 shadow-[0_0_10px_rgba(16,185,129,0.15)]';
          if (log.type === 'info') badgeColor = 'bg-cyan-950/80 text-cyan-300 border-cyan-800/60 shadow-[0_0_10px_rgba(6,182,212,0.15)]';

          return (
            <motion.div
              key={log.id}
              initial={{ opacity: 0, x: -20, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -10, transition: { duration: 0.15 } }}
              className={`flex items-center px-3.5 py-2 text-xs rounded-lg border shadow-lg font-mono tracking-wide ${badgeColor} backdrop-blur-sm pointer-events-none select-none`}
            >
              <span className="w-1.5 h-1.5 rounded-full mr-2 bg-current animate-pulse"></span>
              {log.text}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

// --- MATH HELPERS ---
const dist = (v1: Vector, v2: Vector) => Math.sqrt((v1.x - v2.x) ** 2 + (v1.y - v2.y) ** 2);
const normalize = (v: Vector): Vector => {
  const d = Math.sqrt(v.x ** 2 + v.y ** 2);
  return d === 0 ? { x: 0, y: 0 } : { x: v.x / d, y: v.y / d };
};

// --- ID GENERATOR ---
let idCounter = 0;
const generateId = () => `id_${idCounter++}_${Date.now()}`;

// --- AUDIO SYNTHESIS ENGINE (ZERO-DEPENDENCY) ---
let audioCtx: AudioContext | null = null;
let userMutedGlobal = false; // Module-level flag to sync with audio callbacks safely

function getAudioContext() {
  if (userMutedGlobal) return null;
  if (!audioCtx) {
     const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
     if (AudioContextClass) {
        audioCtx = new AudioContextClass();
     }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
     audioCtx.resume();
  }
  return audioCtx;
}

const playSelectSound = () => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.05);
    
    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.08);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  } catch (e) {}
};

const playMoveSound = () => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(330, ctx.currentTime);
    osc.frequency.setValueAtTime(440, ctx.currentTime + 0.04);
    
    gain.gain.setValueAtTime(0.03, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch (e) {}
};

const playFormationSound = () => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [0, 0.06].forEach((delay, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(idx === 0 ? 580 : 700, now + delay);
        gain.gain.setValueAtTime(0.03, now + delay);
        gain.gain.linearRampToValueAtTime(0, now + delay + 0.08);
        osc.start(now + delay);
        osc.stop(now + delay + 0.08);
    });
  } catch (e) {}
};

const playLaserSound = (isSniper = false) => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.type = isSniper ? 'sawtooth' : 'triangle';
    const startFreq = isSniper ? 820 : 540;
    const duration = isSniper ? 0.25 : 0.12;
    
    osc.frequency.setValueAtTime(startFreq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + duration);
    
    gain.gain.setValueAtTime(isSniper ? 0.03 : 0.04, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
    
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {}
};

const playExplosionSound = () => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(35, ctx.currentTime + 0.45);
    
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.45);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.45);
  } catch (e) {}
};

const playBuildStartSound = () => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(330, ctx.currentTime + 0.2);
    
    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  } catch (e) {}
};

const playBuildFinishSound = () => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(392, ctx.currentTime);
    osc.frequency.setValueAtTime(523, ctx.currentTime + 0.1);
    osc.frequency.setValueAtTime(659, ctx.currentTime + 0.2);
    
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) {}
};


export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  
  // Game State Ref
  const gameState = useRef<GameState>({
    money: { ...INITIAL_RESOURCES },
    income: { metal: 0, energy: 0 },
    units: [],
    buildings: [],
    particles: [],
    selection: { active: false, start: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
    camera: { x: 0, y: 0 },
    mapSize: { width: MAP_WIDTH, height: MAP_HEIGHT },
    upgrades: { damageLevel: 0, healthLevel: 0 },
    gameOver: false,
    victory: false,
    zoom: 1.0,
  });

  // UI State
  const [resources, setResources] = useState(gameState.current.money);
  const [income, setIncome] = useState(gameState.current.income);
  const [placementMode, setPlacementMode] = useState<BuildingType | null>(null);
  const [upgrades, setUpgrades] = useState(gameState.current.upgrades);
  const [hasBarracks, setHasBarracks] = useState(false);
  const [gameOverState, setGameOverState] = useState<{over: boolean, win: boolean}>({over: false, win: false});
  const [isMuted, setIsMuted] = useState(false);
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [zoomValue, setZoomValue] = useState(1.0);
  const [selectionChangeCounter, setSelectionChangeCounter] = useState(0);

  // Hover Info Card State
  const [hoveredID, setHoveredID] = useState<string | null>(null);
  const [hoveredMousePos, setHoveredMousePos] = useState<{ x: number; y: number } | null>(null);
  const pressedKeys = useRef<{ [key: string]: boolean }>({});
  const targetZoomValue = useRef<number>(1.0);
  const hasInitializedRef = useRef<boolean>(false);

  // Auto Unit Production Targets (RTS-style!)
  const [productionTargets, setProductionTargets] = useState<{ [key in UnitType]?: number }>({
    [UnitType.SOLDIER]: 0,
    [UnitType.SNIPER]: 0,
  });
  const productionTargetsRef = useRef<{ [key in UnitType]?: number }>({
    [UnitType.SOLDIER]: 0,
    [UnitType.SNIPER]: 0,
  });

  useEffect(() => {
    productionTargetsRef.current = productionTargets;
  }, [productionTargets]);

  // Map Mineral Deposits Reference (Decorative & Gameplay Context)
  const mineralDeposits = useRef<{ x: number; y: number; size: number; rotation: number }[]>([]);

  // Right-Click Drag Formation Tracker
  const rightDrag = useRef<{ active: boolean; start: Vector; end: Vector }>({
    active: false,
    start: { x: 0, y: 0 },
    end: { x: 0, y: 0 },
  });
  
  const mousePos = useRef<Vector>({ x: 0, y: 0 });
  const lastTime = useRef<number>(0);
  const tickAccumulator = useRef<number>(0);
  
  // Real-time Event Logger state & refs
  const logsRef = useRef<CombatLogItem[]>([]);
  const [combatLogs, setCombatLogs] = useState<CombatLogItem[]>([]);
  const lastBuildingAttackLogTime = useRef<{ [key: string]: number }>({});

  const addCombatLog = (text: string, type: 'info' | 'danger' | 'warning' | 'success' = 'info') => {
      const newLog: CombatLogItem = {
          id: Math.random().toString(),
          text,
          type,
          timestamp: Date.now()
      };
      logsRef.current = [newLog, ...logsRef.current].slice(0, 8);
      setCombatLogs([...logsRef.current]);
  };
  const enemySpawnTick = useRef<number>(0);

  // Sync mute state with global module audio flag
  useEffect(() => {
    userMutedGlobal = isMuted;
  }, [isMuted]);

  // Responsive Canvas Resize Listener
  useEffect(() => {
    const handleResize = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- GAME INITIALIZATION ---
  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    // Reset game state entities to prevent double spawning in StrictMode or on remount!
    gameState.current.buildings = [];
    gameState.current.units = [];
    gameState.current.particles = [];

    const startX = 300;
    const startY = 300;
    
    // Helper to instant spawn for initial setup
    const instantBuild = (type: BuildingType, pos: Vector, team: Team) => {
        const b = createBuilding(type, pos, team);
        b.isUnderConstruction = false;
        b.constructionTimer = 0;
        gameState.current.buildings.push(b);
    };

    // Pre-generate ore deposits in an orderly, symmetrical grid across the map (one extractor per deposit)
    const deposits = [];
    const cols = [400, 850, 1300, 1750, 2150];
    const rows = [400, 850, 1300, 1750, 2150];
    
    cols.forEach(cx => {
       rows.forEach(ry => {
          // Keep away from the extreme immediate starting bases corners
          const distToPlayer = Math.hypot(cx - startX, ry - startY);
          const distToEnemy = Math.hypot(cx - (MAP_WIDTH - 300), ry - (MAP_HEIGHT - 300));
          if (distToPlayer > 180 && distToEnemy > 180) {
             deposits.push({
                x: cx,
                y: ry,
                size: 26,
                rotation: 0,
             });
          }
       });
    });
    // Add 2 special balanced pocket deposits near player and enemy bases for early game access
    deposits.push({ x: startX + 180, y: startY + 60, size: 26, rotation: 0 }); // Player pocket field
    deposits.push({ x: MAP_WIDTH - 300 - 180, y: MAP_HEIGHT - 300 - 60, size: 26, rotation: 0 }); // Enemy pocket field

    mineralDeposits.current = deposits;

    // Only Commanders Spawn (No starting buildings or starting soldier units)
    spawnUnit(UnitType.COMMANDER, { x: startX + 60, y: startY + 145 }, Team.PLAYER);
    const enemyX = MAP_WIDTH - 300;
    const enemyY = MAP_HEIGHT - 300;
    spawnUnit(UnitType.COMMANDER, { x: enemyX - 60, y: enemyY - 105 }, Team.ENEMY);

  }, []);

  // --- FACTORY FUNCTIONS ---

  // Helper to find safe coordinate unoccupied by ANY building
  const findSafeSpawnPosition = (startPos: Vector, radius: number, buildings: Building[]): Vector => {
    const isOccupied = (pos: Vector) => {
      return buildings.some(b => {
        const bx = b.position.x;
        const by = b.position.y;
        const bw = b.width * GRID_SIZE;
        const bh = b.height * GRID_SIZE;
        // closest point on building AABB
        const closestX = Math.max(bx, Math.min(pos.x, bx + bw));
        const closestY = Math.max(by, Math.min(pos.y, by + bh));
        const dx = pos.x - closestX;
        const dy = pos.y - closestY;
        return (dx*dx + dy*dy) < (radius + 2) * (radius + 2); // 2px safety padding
      });
    };

    // concentric spiral search for an open slot around original point
    if (!isOccupied(startPos)) return { ...startPos };

    const steps = [15, 30, 45, 60, 75, 90, 110, 130, 150];
    const angles = [
      Math.PI / 2, // Prefer spawning downward
      Math.PI / 4, 3 * Math.PI / 4, // Diagonals down
      0, Math.PI, // Left / Right
      -Math.PI / 4, -Math.PI * 3 / 4, // Diagonals up
      -Math.PI / 2 // Upward
    ];

    for (const dVal of steps) {
      for (const angle of angles) {
        const candidate = {
          x: startPos.x + Math.cos(angle) * dVal,
          y: startPos.y + Math.sin(angle) * dVal
        };
        if (!isOccupied(candidate)) {
          return candidate;
        }
      }
    }
    return { ...startPos }; // safety fallback
  };

  const spawnUnit = (subType: UnitType, position: Vector, team: Team) => {
    const stats = UNIT_STATS[subType];
    const isPlayer = team === Team.PLAYER;
    
    const hpMult = 1 + (isPlayer ? gameState.current.upgrades.healthLevel * UPGRADE_MULTIPLIER : 0);
    const dmgMult = 1 + (isPlayer ? gameState.current.upgrades.damageLevel * UPGRADE_MULTIPLIER : 0);

    const radius = subType === UnitType.COMMANDER ? 24 : (subType === UnitType.TANK ? 18 : 12);
    const safePos = findSafeSpawnPosition(position, radius, gameState.current.buildings);

    gameState.current.units.push({
      id: generateId(),
      type: EntityType.UNIT,
      subType,
      team,
      position: safePos,
      radius,
      health: stats.health * hpMult,
      maxHealth: stats.health * hpMult,
      attackDamage: stats.damage * dmgMult,
      attackRange: stats.range,
      attackCooldown: stats.cooldown,
      moveSpeed: stats.speed,
      state: 'IDLE',
      targetPosition: null,
      targetEntityId: null,
      lastAttackTime: 0,
      isSelected: false,
      heading: team === Team.PLAYER ? 0 : Math.PI, // Initial heading angles
    });
  };

  const createBuilding = (subType: BuildingType, position: Vector, team: Team): Building => {
    const stats = BUILDING_STATS[subType];
    const gridX = Math.floor(position.x / GRID_SIZE) * GRID_SIZE;
    const gridY = Math.floor(position.y / GRID_SIZE) * GRID_SIZE;

    // Defense turret specific enhancements
    const turretProps = subType === BuildingType.TURRET ? {
       attackRange: 220,
       attackDamage: 14,
       attackCooldown: 850,
       lastAttackTime: 0,
       turretHeading: team === Team.PLAYER ? 0 : Math.PI,
    } : {};

    return {
      id: generateId(),
      type: EntityType.BUILDING,
      subType,
      team,
      position: { x: gridX, y: gridY },
      radius: Math.max(stats.width, stats.height) * GRID_SIZE / 2,
      width: stats.width,
      height: stats.height,
      health: stats.health,
      maxHealth: stats.health,
      
      isUnderConstruction: true,
      constructionTimer: stats.buildTime,
      maxConstructionTime: stats.buildTime,
      
      unitQueue: [],
      productionTimer: 0,
      totalProductionTime: 0,
      unitsProducedCount: 0,
      ...turretProps,
    };
  };

  const spawnParticle = (position: Vector, color: string, count: number = 5, speedMult: number = 1) => {
    for (let i = 0; i < count; i++) {
       const angle = Math.random() * Math.PI * 2;
       const speed = (Math.random() * 2 + 1) * speedMult;
       gameState.current.particles.push({
         id: generateId(),
         position: { ...position },
         velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
         life: 1.0,
         maxLife: 1.0,
         color,
         size: Math.random() * 3 + 1,
       });
    }
  };

  // --- ACTIONS ---

  const buyUpgrade = () => {
    const cost = ARMOURY_UPGRADE_COST;
    if (gameState.current.money.metal >= cost.metal && gameState.current.money.energy >= cost.energy) {
      gameState.current.money.metal -= cost.metal;
      gameState.current.money.energy -= cost.energy;
      gameState.current.upgrades.damageLevel++;
      gameState.current.upgrades.healthLevel++;
      spawnParticle({ x: gameState.current.camera.x + window.innerWidth/2, y: gameState.current.camera.y + window.innerHeight/2 }, '#ffff00', 30, 5); 
      setResources({...gameState.current.money});
      setUpgrades({...gameState.current.upgrades});
      playBuildFinishSound();
    }
  };

  const queueUnit = (type: UnitType) => {
    const cost = UNIT_STATS[type].cost;
    const state = gameState.current;
    
    // Find active barracks
    const barracksType = type === UnitType.SOLDIER ? BuildingType.BARRACKS_A : BuildingType.BARRACKS_B;
    let producers = state.buildings.filter(b => b.team === Team.PLAYER && b.subType === barracksType && !b.isUnderConstruction && b.isSelected);
    if (producers.length === 0) {
        producers = state.buildings.filter(b => b.team === Team.PLAYER && b.subType === barracksType && !b.isUnderConstruction);
    }

    if (producers.length > 0 && state.money.metal >= cost.metal && state.money.energy >= cost.energy) {
      // Pick the shortest queue
      producers.sort((a, b) => a.unitQueue.length - b.unitQueue.length);
      const chosen = producers[0];

      state.money.metal -= cost.metal;
      state.money.energy -= cost.energy;
      
      chosen.unitQueue.push(type);
      setResources({...state.money});
      playBuildStartSound();
    }
  };

  const canPlaceBuilding = (type: BuildingType, gridX: number, gridY: number): { valid: boolean; reason?: string } => {
    const state = gameState.current;
    const stats = BUILDING_STATS[type];

    // 1. Resource check
    const hasResources = state.money.metal >= stats.cost.metal && state.money.energy >= stats.cost.energy;
    if (!hasResources) {
      return { valid: false, reason: 'INSUFFICIENT RESOURCES' };
    }

    // 2. Build range check (Must be near player buildings or player commander!)
    const isSelfStarting = state.buildings.filter(b => b.team === Team.PLAYER).length === 0;
    if (!isSelfStarting) {
      const nearPlayerBase = state.buildings.some(b => {
        if (b.team !== Team.PLAYER) return false;
        const bCenterX = b.position.x + (b.width * GRID_SIZE) / 2;
        const bCenterY = b.position.y + (b.height * GRID_SIZE) / 2;
        const clickCenterX = gridX + (stats.width * GRID_SIZE) / 2;
        const clickCenterY = gridY + (stats.height * GRID_SIZE) / 2;
        return dist({ x: bCenterX, y: bCenterY }, { x: clickCenterX, y: clickCenterY }) < 500;
      }) || state.units.some(u => {
        if (u.team !== Team.PLAYER || u.subType !== UnitType.COMMANDER) return false;
        const clickCenterX = gridX + (stats.width * GRID_SIZE) / 2;
        const clickCenterY = gridY + (stats.height * GRID_SIZE) / 2;
        return dist(u.position, { x: clickCenterX, y: clickCenterY }) < 500;
      });

      if (!nearPlayerBase) {
        return { valid: false, reason: 'OUT OF BUILD RANGE (NEEDS COMMANDER OR ALLIED BASE)' };
      }
    }

    // 3. Collision with existing buildings
    const buildingOverlap = state.buildings.some(b => {
      const bx = b.position.x;
      const by = b.position.y;
      const bw = b.width * GRID_SIZE;
      const bh = b.height * GRID_SIZE;
      return (
        gridX < bx + bw && gridX + stats.width * GRID_SIZE > bx &&
        gridY < by + bh && gridY + stats.height * GRID_SIZE > by
      );
    });

    if (buildingOverlap) {
      return { valid: false, reason: 'ALREADY OCCUPIED BY STRUCTURE' };
    }

    // 4. Extractor on Ore spot check (Only supports ONE extractor per deposit)
    if (type === BuildingType.EXTRACTOR) {
      const centerPX = gridX + (stats.width * GRID_SIZE) / 2;
      const centerPY = gridY + (stats.height * GRID_SIZE) / 2;
      
      const matchedDeposit = mineralDeposits.current.find(dep => {
        return dist({ x: centerPX, y: centerPY }, dep) < dep.size + 15;
      });
      
      if (!matchedDeposit) {
        return { valid: false, reason: 'REQUIRES ORE FIELD' };
      }

      // Check if any existing building is an extractor standing on this specific ore deposit
      const alreadyHasExtractor = state.buildings.some(b => {
        if (b.subType !== BuildingType.EXTRACTOR) return false;
        const bCenterX = b.position.x + (b.width * GRID_SIZE) / 2;
        const bCenterY = b.position.y + (b.height * GRID_SIZE) / 2;
        return dist({ x: bCenterX, y: bCenterY }, matchedDeposit) < matchedDeposit.size + 15;
      });

      if (alreadyHasExtractor) {
        return { valid: false, reason: 'ORE SPOT DEPOSIT ALREADY OCCUPIED' };
      }
    }

    return { valid: true };
  };

  const handlePlaceBuilding = (type: BuildingType) => {
    setPlacementMode(prev => prev === type ? null : type);
  };

  // --- GAME LOOP ---
  const update = (dt: number) => {
    const state = gameState.current;
    if (state.gameOver || state.victory) return;

    // Smooth Zoom Interpolation
    const zoomDiff = targetZoomValue.current - state.zoom;
    if (Math.abs(zoomDiff) > 0.001) {
        state.zoom += zoomDiff * 0.12;
        setZoomValue(state.zoom);
    } else if (state.zoom !== targetZoomValue.current) {
        state.zoom = targetZoomValue.current;
        setZoomValue(state.zoom);
    }

    // Continuous keyboard Q/E zoom (No delays on hold!)
    if (pressedKeys.current['q']) {
        targetZoomValue.current = Math.max(0.4, targetZoomValue.current - 0.002 * dt);
    }
    if (pressedKeys.current['e']) {
        targetZoomValue.current = Math.min(2.5, targetZoomValue.current + 0.002 * dt);
    }

    const now = Date.now();

    // 1. Edge-Scrolling & Smooth Keyboard Camera
    const mouseX = mousePos.current.x;
    const mouseY = mousePos.current.y;
    const scrollEdge = 35;
    const scrollSpeed = 0.45 * dt;

    if (mouseX >= 0 && mouseX < scrollEdge) {
        state.camera.x -= scrollSpeed;
    } else if (mouseX <= window.innerWidth && mouseX > window.innerWidth - scrollEdge) {
        state.camera.x += scrollSpeed;
    }

    if (mouseY >= 0 && mouseY < scrollEdge) {
        state.camera.y -= scrollSpeed;
    } else if (mouseY <= window.innerHeight && mouseY > window.innerHeight - scrollEdge) {
        state.camera.y += scrollSpeed;
    }

    // 1b. Smooth Keyboard Camera Movement
    let camDX = 0;
    let camDY = 0;
    if (pressedKeys.current['w'] || pressedKeys.current['arrowup']) camDY -= 1;
    if (pressedKeys.current['s'] || pressedKeys.current['arrowdown']) camDY += 1;
    if (pressedKeys.current['a'] || pressedKeys.current['arrowleft']) camDX -= 1;
    if (pressedKeys.current['d'] || pressedKeys.current['arrowright']) camDX += 1;

    if (camDX !== 0 || camDY !== 0) {
        const len = Math.sqrt(camDX * camDX + camDY * camDY);
        const shiftSpeedMultiplier = pressedKeys.current['shift'] ? 2.5 : 1.0;
        const speed = 0.65 * dt * shiftSpeedMultiplier; // Smooth keyboard speed relative to frame time
        state.camera.x += (camDX / len) * speed;
        state.camera.y += (camDY / len) * speed;
    }

    // Clamp camera taking current zoom level into account
    const zoom = state.zoom || 1.0;
    const maxCamX = Math.max(0, state.mapSize.width - window.innerWidth / zoom);
    const maxCamY = Math.max(0, state.mapSize.height - window.innerHeight / zoom);
    state.camera.x = Math.max(0, Math.min(state.camera.x, maxCamX));
    state.camera.y = Math.max(0, Math.min(state.camera.y, maxCamY));

    // 1c. Find Hovered Entity (Dividing client mouse position by zoom value)
    const worldX = mousePos.current.x / zoom + state.camera.x;
    const worldY = mousePos.current.y / zoom + state.camera.y;

    let foundId: string | null = null;
    const hoverUnit = state.units.find(u => dist({ x: worldX, y: worldY }, u.position) <= u.radius + 6);
    if (hoverUnit) {
      foundId = hoverUnit.id;
    } else {
      const hoverBuilding = state.buildings.find(b => {
        const bx = b.position.x;
        const by = b.position.y;
        const bw = b.width * GRID_SIZE;
        const bh = b.height * GRID_SIZE;
        return worldX >= bx && worldX <= bx + bw && worldY >= by && worldY <= by + bh;
      });
      if (hoverBuilding) {
        foundId = hoverBuilding.id;
      }
    }
    setHoveredID(prev => {
       if (prev !== foundId) return foundId;
       return prev;
    });

    // 2. Calculate Income & Process Economy
    tickAccumulator.current += dt;
    if (tickAccumulator.current >= 1000) {
       tickAccumulator.current -= 1000;
       
       let metalGen = 0;
       let energyGen = 0;
       
       state.buildings.forEach(b => {
         if (b.team === Team.PLAYER && !b.isUnderConstruction) {
            if (b.subType === BuildingType.GENERATOR) energyGen += RESOURCE_GENERATION_RATE.energy;
            if (b.subType === BuildingType.EXTRACTOR) metalGen += RESOURCE_GENERATION_RATE.metal;
         }
       });

       state.money.metal += metalGen;
       state.money.energy += energyGen;
       state.income = { metal: metalGen, energy: energyGen };

       // Process auto production targets (RTS Style!)
       [UnitType.SOLDIER, UnitType.SNIPER].forEach(type => {
         const target = productionTargets[type] || 0;
         if (target <= 0) return;

         const alive = state.units.filter(u => u.team === Team.PLAYER && u.subType === type).length;
         const barracksType = type === UnitType.SOLDIER ? BuildingType.BARRACKS_A : BuildingType.BARRACKS_B;
         const queued = state.buildings
           .filter(b => b.team === Team.PLAYER && b.subType === barracksType)
           .reduce((sum, b) => sum + (b.unitQueue ? b.unitQueue.filter(q => q === type).length : 0), 0);

         const total = alive + queued;
         if (total < target) {
           let factories = state.buildings.filter(b => b.team === Team.PLAYER && b.subType === barracksType && !b.isUnderConstruction);
           if (factories.length > 0) {
             const cost = UNIT_STATS[type].cost;
             if (state.money.metal >= cost.metal && state.money.energy >= cost.energy) {
               // Pick factory with shortest queue
               factories.sort((a, b) => (a.unitQueue ? a.unitQueue.length : 0) - (b.unitQueue ? b.unitQueue.length : 0));
               const chosen = factories[0];
               
               state.money.metal -= cost.metal;
               state.money.energy -= cost.energy;
               if (!chosen.unitQueue) chosen.unitQueue = [];
               chosen.unitQueue.push(type);
               
               setResources({...state.money});
               playBuildStartSound();
             }
           }
         }
       });

       // UI Updates
       setResources({...state.money});
       setIncome({...state.income});
       
       const hasB = state.buildings.some(b => b.team === Team.PLAYER && (b.subType === BuildingType.BARRACKS_A || b.subType === BuildingType.BARRACKS_B));
       setHasBarracks(hasB);
    }

    // 3. Building Logic (Construction, Production, and Defense Turret)
    state.buildings.forEach(b => {
        // Construction
        if (b.isUnderConstruction) {
            const bw = b.width * GRID_SIZE;
            const bh = b.height * GRID_SIZE;
            const bx = b.position.x;
            const by = b.position.y;

            const overlappingUnits = state.units.filter(u => {
                return (
                    u.position.x + u.radius > bx && u.position.x - u.radius < bx + bw &&
                    u.position.y + u.radius > by && u.position.y - u.radius < by + bh
                );
            });

            if (overlappingUnits.length > 0) {
                b.isWaitingForClearance = true;
                const centerBX = bx + bw / 2;
                const centerBY = by + bh / 2;
                overlappingUnits.forEach(u => {
                    const dx = u.position.x - centerBX;
                    const dy = u.position.y - centerBY;
                    const distToCenter = Math.sqrt(dx * dx + dy * dy) || 1;
                    const pushDistance = Math.max(bw, bh) * 0.8 + 25;
                    u.targetPosition = {
                        x: centerBX + (dx / distToCenter) * pushDistance,
                        y: centerBY + (dy / distToCenter) * pushDistance
                    };
                    u.targetEntityId = null;
                    u.state = 'MOVE';
                });
                return;
            } else {
                b.isWaitingForClearance = false;
            }
            b.constructionTimer -= dt;
            if (b.constructionTimer <= 0) {
                b.isUnderConstruction = false;
                spawnParticle({ x: b.position.x + (b.width * GRID_SIZE)/2, y: b.position.y + (b.height * GRID_SIZE)/2 }, '#ffffff', 15);
                playBuildFinishSound();
            }
        } 
        // Operational Status
        else {
            // Defensive Turret shooting logic
            if (b.subType === BuildingType.TURRET && b.attackRange !== undefined) {
                const bCenter = {
                    x: b.position.x + (b.width * GRID_SIZE) / 2,
                    y: b.position.y + (b.height * GRID_SIZE) / 2
                };
                
                // Scan hostile targets
                const targets = state.units.filter(u => u.team !== b.team && dist(bCenter, u.position) <= b.attackRange!);
                if (targets.length > 0) {
                    // Lock onto closest enemy
                    const target = targets.sort((a,b) => dist(bCenter, a.position) - dist(bCenter, b.position))[0];
                    
                    // Rotate turret smooth head towards lock-on
                    const targetAngle = Math.atan2(target.position.y - bCenter.y, target.position.x - bCenter.x);
                    if (b.turretHeading === undefined) b.turretHeading = targetAngle;
                    else {
                        let diff = targetAngle - b.turretHeading;
                        while(diff < -Math.PI) diff += Math.PI * 2;
                        while(diff > Math.PI) diff -= Math.PI * 2;
                        b.turretHeading += diff * 0.12;
                    }

                    // Fire laser on reloading cooldown
                    if (now - (b.lastAttackTime || 0) > (b.attackCooldown || 850)) {
                        b.lastAttackTime = now;
                        target.health -= b.attackDamage || 14;
                        spawnParticle(target.position, '#22d3ee', 4);
                        playLaserSound(false);

                        // If targeted entity neutralized
                        if (target.health <= 0) {
                            state.units = state.units.filter(u => u.id !== target.id);
                            spawnParticle(target.position, '#ff5500', 14, 1.4);
                            playExplosionSound();
                        }
                    }
                }
            }

            // Production bays
            if (b.unitQueue.length > 0) {
                if (b.productionTimer <= 0) {
                    // Start next queue unit
                    const nextUnit = b.unitQueue[0];
                    b.totalProductionTime = UNIT_STATS[nextUnit].buildTime;
                    b.productionTimer = b.totalProductionTime;
                } else {
                    b.productionTimer -= dt;
                    if (b.productionTimer <= 0) {
                        // Spawn complete unit
                        const finishedUnit = b.unitQueue.shift();
                        if (finishedUnit) {
                            b.unitsProducedCount++;
                            let spawnType = finishedUnit;
                            if (b.unitsProducedCount % SPAWN_THRESHOLD === 0) spawnType = UnitType.TANK;
                            
                            const exitPos = { 
                                x: b.position.x + (b.width * GRID_SIZE) / 2, 
                                y: b.position.y + (b.height * GRID_SIZE) + 20 
                            };
                            spawnUnit(spawnType, exitPos, b.team);

                            // Order the newly spawned unit to automatically step away from the factory gate
                            const lastUnit = state.units[state.units.length - 1];
                            if (lastUnit && lastUnit.team === b.team) {
                                if (b.rallyPoint) {
                                    lastUnit.targetPosition = { ...b.rallyPoint };
                                    lastUnit.state = 'MOVE';
                                } else {
                                    lastUnit.targetPosition = {
                                        x: lastUnit.position.x,
                                        y: lastUnit.position.y + 45
                                    };
                                    lastUnit.state = 'MOVE';
                                }
                            }
                            // End of rally point order block (temporary flag to prevent matching original tail)
                        }
                        b.productionTimer = 0;
                    }
                }
            }
        }
    });

  // 4. Enemy AI Command Center (Passive & defensive for now, no active attacks or invasions!)
  enemySpawnTick.current += dt;
  if (enemySpawnTick.current > ENEMY_SPAWN_INTERVAL) {
    enemySpawnTick.current = 0;
    const enemyBarracks = state.buildings.filter(b => b.team === Team.ENEMY && !b.isUnderConstruction && (b.subType === BuildingType.BARRACKS_A || b.subType === BuildingType.BARRACKS_B));
    
    // Spawn defensive guard units
    enemyBarracks.forEach(b => {
       spawnUnit(Math.random() > 0.4 ? UnitType.SOLDIER : UnitType.SNIPER, { x: b.position.x, y: b.position.y + 50 }, Team.ENEMY);
    });

    // Enemy units stand on guard and do NOT attack/advance proactively
    state.units.filter(u => u.team === Team.ENEMY).forEach(u => {
        if (u.state === 'CHASE') {
             u.state = 'IDLE';
             u.targetEntityId = null;
        }
    });
  }

    // 5. Units State Machine Processing
    const allEntities = [...state.units, ...state.buildings];
    state.units.forEach(unit => {
      // Auto seek hostiles ONLY if IDLE. If manually ordered to MOVE, let units move and disengage without distraction!
      if (unit.state === 'IDLE') {
          // Player units scan full range. Passive Enemy units defend only close-quarters
          const searchRange = unit.team === Team.ENEMY ? Math.min(unit.attackRange, 120) : unit.attackRange;
          const enemies = allEntities.filter(e => e.team !== unit.team && dist(unit.position, e.position) <= searchRange);
          if (enemies.length > 0) {
              const target = enemies.sort((a,b) => dist(unit.position, a.position) - dist(unit.position, b.position))[0];
              unit.targetEntityId = target.id;
              unit.state = 'CHASE';
          }
      }

      // Process Combat Turret Heading & Target Tracker
      if (unit.targetEntityId) {
         const target = allEntities.find(e => e.id === unit.targetEntityId);
         if (target) {
             const targetAngle = Math.atan2(target.position.y - unit.position.y, target.position.x - unit.position.x);
             if (unit.turretHeading === undefined) {
                 unit.turretHeading = targetAngle;
             } else {
                 let diff = targetAngle - unit.turretHeading;
                 while (diff < -Math.PI) diff += Math.PI * 2;
                 while (diff > Math.PI) diff -= Math.PI * 2;
                 unit.turretHeading += diff * 0.22; // Snappy turret lock onto enemies
             }
         }
      } else {
          // Align turret back core
          if (unit.heading !== undefined) {
              const targetAngle = unit.heading;
              if (unit.turretHeading === undefined) {
                  unit.turretHeading = targetAngle;
              } else {
                  let diff = targetAngle - unit.turretHeading;
                  while (diff < -Math.PI) diff += Math.PI * 2;
                  while (diff > Math.PI) diff -= Math.PI * 2;
                  unit.turretHeading += diff * 0.12;
              }
          }
      }

      let moveTarget: Vector | null = unit.targetPosition;
      
      if (unit.state === 'REPAIR' && unit.targetEntityId) {
         const targetBuilding = state.buildings.find(b => b.id === unit.targetEntityId);
         if (!targetBuilding || targetBuilding.health >= targetBuilding.maxHealth) {
             if (targetBuilding && targetBuilding.health >= targetBuilding.maxHealth) {
                 addCombatLog(`Repair complete: ${targetBuilding.subType}`, 'success');
             }
             unit.state = 'IDLE';
             unit.targetEntityId = null;
         } else {
             const bx = targetBuilding.position.x + targetBuilding.width * GRID_SIZE / 2;
             const by = targetBuilding.position.y + targetBuilding.height * GRID_SIZE / 2;
             const d = dist(unit.position, { x: bx, y: by });
             const targetRadius = Math.max(targetBuilding.width, targetBuilding.height) * GRID_SIZE / 2;
             const repairRange = 145;
             
             if (d > repairRange + targetRadius) {
                 moveTarget = { x: bx, y: by };
             } else {
                 moveTarget = null;
                 
                 // Face target building
                 const targetAngle = Math.atan2(by - unit.position.y, bx - unit.position.x);
                 unit.heading = targetAngle;
                 unit.turretHeading = targetAngle;
                 
                 // Perform repair tick: heals and consumes metal
                 const repairHealRate = 1.0; // 1 HP per tick
                 const repairCost = 0.12; // 0.12 metal per tick
                 
                 if (state.money.metal >= repairCost) {
                     state.money.metal -= repairCost;
                     targetBuilding.health = Math.min(targetBuilding.maxHealth, targetBuilding.health + repairHealRate);
                     
                     if (Math.random() < 0.12) {
                         spawnParticle({
                             x: targetBuilding.position.x + Math.random() * targetBuilding.width * GRID_SIZE,
                             y: targetBuilding.position.y + Math.random() * targetBuilding.height * GRID_SIZE
                         }, '#22d3ee', 1, 0.4);
                     }
                 } else {
                     if (Math.random() < 0.05) {
                         spawnParticle(unit.position, '#ef4444', 1, 0.5);
                     }
                 }
             }
         }
      } else if (unit.targetEntityId) {
        const target = allEntities.find(e => e.id === unit.targetEntityId);
        if (target) {
           const d = dist(unit.position, target.position);
           const targetRadius = target.type === EntityType.BUILDING ? Math.max(target.width, target.height) * GRID_SIZE / 2 : target.radius;
           
           if (d <= unit.attackRange + targetRadius) {
             moveTarget = null;
             unit.state = 'ATTACK';
             
             // Attack deployment on cooldown
             if (now - unit.lastAttackTime > unit.attackCooldown) {
               unit.lastAttackTime = now;
               target.health -= unit.attackDamage;
               spawnParticle(target.position, '#ef4444', 3);
               playLaserSound(unit.subType === UnitType.SNIPER);
               
               // Add building under attack alert
               if (target.type === 'BUILDING' && target.team === Team.PLAYER) {
                   const lastLogTime = lastBuildingAttackLogTime.current[target.id] || 0;
                   if (now - lastLogTime > 4000) {
                       lastBuildingAttackLogTime.current[target.id] = now;
                       addCombatLog(`Building under attack: Allied ${target.subType}!`, 'warning');
                   }
               }
               
               if (target.health <= 0) {
                 unit.targetEntityId = null;
                 unit.state = 'IDLE';
                 
                 // Erase entity from simulation
                 if (target.type === EntityType.BUILDING) {
                    state.buildings = state.buildings.filter(b => b.id !== target.id);
                    spawnParticle(target.position, '#ff7700', 32, 1.3);
                    playExplosionSound();
                    const isAllied = target.team === Team.PLAYER;
                    addCombatLog(`Building destroyed: ${isAllied ? 'Allied' : 'Enemy'} ${target.subType}`, isAllied ? 'danger' : 'success');
                 } else {
                    state.units = state.units.filter(u => u.id !== target.id);
                    spawnParticle(target.position, '#ee4444', 8, 1);
                    playExplosionSound();
                    const isAllied = target.team === Team.PLAYER;
                    addCombatLog(`Unit destroyed: ${isAllied ? 'Allied' : 'Enemy'} ${target.subType}`, isAllied ? 'danger' : 'success');
                 }
               }
             }
           } else {
             moveTarget = target.position;
             unit.state = 'CHASE';
           }
        } else {
          unit.targetEntityId = null;
          unit.state = 'IDLE';
        }
      }

      // Motor & Collision Dynamics
      if (moveTarget) {
        const dToTarget = dist(unit.position, moveTarget);
        if (dToTarget > 1.5) {
            const dir = normalize({ x: moveTarget.x - unit.position.x, y: moveTarget.y - unit.position.y });
            
            // Soft separation buffer
            let sepX = 0, sepY = 0;
            state.units.forEach(other => {
            if (other.id !== unit.id) {
                const d = dist(unit.position, other.position);
                const minSep = unit.radius + other.radius + 3;
                if (d < minSep) {
                    const push = normalize({ x: unit.position.x - other.position.x, y: unit.position.y - other.position.y });
                    const force = (minSep - d) / minSep;
                    sepX += push.x * force * 5.2;
                    sepY += push.y * force * 5.2;
                }
            }
            });

            const moveVec = {
                x: (dir.x + sepX) * unit.moveSpeed,
                y: (dir.y + sepY) * unit.moveSpeed
            };
            
            unit.position.x += moveVec.x;
            unit.position.y += moveVec.y;

            // Heading smooth direction faces
            if (moveVec.x !== 0 || moveVec.y !== 0) {
                 const targetHeading = Math.atan2(moveVec.y, moveVec.x);
                 if (unit.heading === undefined) {
                     unit.heading = targetHeading;
                 } else {
                     let diff = targetHeading - unit.heading;
                     while (diff < -Math.PI) diff += Math.PI * 2;
                     while (diff > Math.PI) diff -= Math.PI * 2;
                     unit.heading += diff * 0.16;
                 }
            }
            
            // Hard AABB limits collision with buildings
            state.buildings.forEach(b => {
               const bx = b.position.x;
               const by = b.position.y;
               const bw = b.width * GRID_SIZE;
               const bh = b.height * GRID_SIZE;
               const closestX = Math.max(bx, Math.min(unit.position.x, bx + bw));
               const closestY = Math.max(by, Math.min(unit.position.y, by + bh));
               const dx = unit.position.x - closestX;
               const dy = unit.position.y - closestY;
               const d = Math.sqrt(dx*dx + dy*dy);
               
               if (d < unit.radius) {
                   const overlap = unit.radius - d;
                   const pushDir = d === 0 ? {x:1, y:0} : {x: dx/d, y: dy/d};
                   unit.position.x += pushDir.x * overlap;
                   unit.position.y += pushDir.y * overlap;
               }
            });
        } else if (!unit.targetEntityId) {
            unit.state = 'IDLE';
        }
      }
    });

    // 6. Win-Lose Termination Verifies based on Commander survival (BAR-style!)
    const playerCommanderAlive = state.units.some(u => u.team === Team.PLAYER && u.subType === UnitType.COMMANDER);
    const enemyCommanderAlive = state.units.some(u => u.team === Team.ENEMY && u.subType === UnitType.COMMANDER);
    
    if (!playerCommanderAlive) {
        state.gameOver = true;
        setGameOverState({ over: true, win: false });
    } else if (!enemyCommanderAlive) {
        state.victory = true;
        setGameOverState({ over: true, win: true });
    }

    // 7. Render Spark Particles
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.life -= dt / 1000;
      p.position.x += p.velocity.x;
      p.position.y += p.velocity.y;
      if (p.life <= 0) state.particles.splice(i, 1);
    }
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    const state = gameState.current;
    const { width, height } = ctx.canvas;
    
    // Grid dark metallic base background
    ctx.fillStyle = '#111827'; 
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    // Applying zoom scaling to the canvas viewport
    const zoom = state.zoom || 1.0;
    ctx.scale(zoom, zoom);
    ctx.translate(-state.camera.x, -state.camera.y);

    // Grid lines (Covering entire visible world viewport based on zoom)
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    const visibleWidth = width / zoom;
    const visibleHeight = height / zoom;
    const startX = Math.floor(state.camera.x / GRID_SIZE) * GRID_SIZE;
    const startY = Math.floor(state.camera.y / GRID_SIZE) * GRID_SIZE;
    for (let x = startX; x < startX + visibleWidth + GRID_SIZE; x += GRID_SIZE) {
      ctx.beginPath(); ctx.moveTo(x, startY); ctx.lineTo(x, startY + visibleHeight + GRID_SIZE); ctx.stroke();
    }
    for (let y = startY; y < startY + visibleHeight + GRID_SIZE; y += GRID_SIZE) {
      ctx.beginPath(); ctx.moveTo(startX, y); ctx.lineTo(startX + visibleWidth + GRID_SIZE, y); ctx.stroke();
    }

    // Draw Mineral/Ore deposits
    mineralDeposits.current.forEach(d => {
       ctx.save();
       ctx.translate(d.x, d.y);
       ctx.rotate(d.rotation);
       
       // Draw beautiful diamond crystal veins
       ctx.beginPath();
       ctx.moveTo(0, -d.size/2);
       ctx.lineTo(d.size/2, -d.size/4);
       ctx.lineTo(d.size/3, d.size/2);
       ctx.lineTo(-d.size/3, d.size/3);
       ctx.lineTo(-d.size/2, -d.size/4);
       ctx.closePath();
       ctx.fillStyle = 'rgba(14, 165, 233, 0.12)';
       ctx.fill();
       ctx.strokeStyle = 'rgba(6, 182, 212, 0.35)';
       ctx.lineWidth = 1.5;
       ctx.stroke();

       // Core bright shards
       ctx.fillStyle = '#0ea5e9';
       ctx.fillRect(-4, -6, 8, 12);
       ctx.fillStyle = '#fbbf24'; // Energy speckle
       ctx.fillRect(d.size/4, 2, 5, 5);
       
       ctx.restore();
    });

    // Draw Buildings
    state.buildings.forEach(b => {
      const bx = b.position.x;
      const by = b.position.y;
      const bw = b.width * GRID_SIZE;
      const bh = b.height * GRID_SIZE;
      const center = { x: bx + bw / 2, y: by + bh / 2 };
      const teamColor = b.team === Team.PLAYER ? '#38bdf8' : '#ef4444';
      const accentColor = b.team === Team.PLAYER ? '#22d3ee' : '#f87171';
      
      // Highlight selection ring
      if (b.isSelected) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(bx, by, bw, bh);

        // Show range ring for Laser Turrets
        if (b.subType === BuildingType.TURRET) {
            ctx.beginPath();
            ctx.arc(center.x, center.y, b.attackRange || 220, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(34, 211, 238, 0.25)'; // beautiful cyan glow
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Show rally point flag & animated crawling dash trace line (BAR-style!)
        if (b.team === Team.PLAYER && b.rallyPoint && (b.subType === BuildingType.BARRACKS_A || b.subType === BuildingType.BARRACKS_B)) {
            const rx = b.rallyPoint.x;
            const ry = b.rallyPoint.y;

            ctx.save();
            // Drawing dotted indicator line
            ctx.strokeStyle = '#22d3ee';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(center.x, center.y);
            ctx.lineTo(rx, ry);
            ctx.setLineDash([6, 5]);
            ctx.lineDashOffset = -(Date.now() / 32) % 11;
            ctx.stroke();
            ctx.setLineDash([]);

            // Pulse ring at origin base center
            const pulseRad = 12 + Math.sin(Date.now() / 120) * 4;
            ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(rx, ry, pulseRad, 0, Math.PI * 2);
            ctx.stroke();

            // Solid neon center anchor circle
            ctx.fillStyle = '#22d3ee';
            ctx.beginPath();
            ctx.arc(rx, ry, 4, 0, Math.PI * 2);
            ctx.fill();

            // Draw nice steel flagpole
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(rx, ry);
            ctx.lineTo(rx, ry - 22);
            ctx.stroke();

            // Draw neon pennant command triangular shape
            ctx.fillStyle = 'rgba(6, 182, 212, 0.85)';
            ctx.beginPath();
            ctx.moveTo(rx, ry - 22);
            ctx.lineTo(rx + 14, ry - 17);
            ctx.lineTo(rx, ry - 12);
            ctx.closePath();
            ctx.fill();
            
            ctx.strokeStyle = '#22d3ee';
            ctx.lineWidth = 1.2;
            ctx.stroke();

            // Subtle label indicator
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 9px monospace';
            ctx.fillText('RALLY', rx - 14, ry - 26);
            ctx.restore();
        }
      }

      // Draw Construction Status
      if (b.isUnderConstruction) {
          ctx.fillStyle = b.isWaitingForClearance ? 'rgba(239, 68, 68, 0.4)' : 'rgba(30, 41, 59, 0.82)';
          ctx.fillRect(bx + 2, by + 2, bw - 4, bh - 4);
          
          if (b.isWaitingForClearance) {
              // Draw caution stripes
              ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)';
              ctx.lineWidth = 3;
              ctx.save();
              ctx.beginPath();
              for (let offset = -bw; offset < bw + bh; offset += 15) {
                  ctx.moveTo(bx + offset, by);
                  ctx.lineTo(bx + offset + bh, by + bh);
              }
              ctx.stroke();
              ctx.restore();

              ctx.strokeStyle = '#ef4444';
              ctx.strokeRect(bx + 2, by + 2, bw - 4, bh - 4);

              ctx.fillStyle = '#ef4444';
              ctx.font = 'bold 9px monospace';
              ctx.textAlign = 'center';
              ctx.fillText("WAY BLOCKED", bx + bw / 2, by + bh / 2 + 3);
              ctx.textAlign = 'left';
          } else {
              ctx.strokeStyle = '#475569';
              ctx.lineWidth = 1.5;
              ctx.strokeRect(bx + 2, by + 2, bw - 4, bh - 4);
              
              const progress = 1 - (b.constructionTimer / b.maxConstructionTime);
              ctx.fillStyle = '#f59e0b';
              ctx.fillRect(bx + 10, by + bh/2 - 5, (bw-20) * progress, 10);
              ctx.strokeStyle = 'white';
              ctx.strokeRect(bx + 10, by + bh/2 - 5, bw-20, 10);
              ctx.fillStyle = 'white';
              ctx.font = '9px monospace';
              ctx.fillText("STRUCTURING...", bx + 10, by + bh/2 - 8);
          }
      } 

      // Draw fully built unique structures
      else {
          // Neon vector blueprint base footprint (No solid background fill for advanced aesthetics)
          ctx.strokeStyle = b.team === Team.PLAYER ? 'rgba(56, 189, 248, 0.3)' : 'rgba(239, 68, 68, 0.3)';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(bx + 2, by + 2, bw - 4, bh - 4);
          ctx.setLineDash([]);

          if (b.subType === BuildingType.GENERATOR) {
              // Concentric magnetic cylinders with pulsing dynamo
              ctx.beginPath();
              ctx.arc(center.x, center.y, bw / 3, 0, Math.PI * 2);
              ctx.strokeStyle = teamColor;
              ctx.lineWidth = 3;
              ctx.stroke();

              const pulse = Math.sin(Date.now() / 150) * 3 + 7;
              ctx.beginPath();
              ctx.arc(center.x, center.y, pulse, 0, Math.PI * 2);
              ctx.fillStyle = '#fbbf24'; // Energy Central Yellow Core
              ctx.fill();

              ctx.beginPath();
              for (let i = 0; i < 8; i++) {
                  const angle = i * Math.PI / 4 + (Date.now() / 1200);
                  ctx.moveTo(center.x + Math.cos(angle) * (pulse + 2), center.y + Math.sin(angle) * (pulse + 2));
                  ctx.lineTo(center.x + Math.cos(angle) * (bw / 3 - 2), center.y + Math.sin(angle) * (bw / 3 - 2));
              }
              ctx.strokeStyle = '#fbbf24';
              ctx.lineWidth = 1.3;
              ctx.stroke();

          } else if (b.subType === BuildingType.EXTRACTOR) {
              // Industrial drilling chassis with spinning gear blades
              ctx.beginPath();
              ctx.moveTo(center.x, by + 5);
              ctx.lineTo(bx + bw - 5, center.y);
              ctx.lineTo(center.x, by + bh - 5);
              ctx.lineTo(bx + 5, center.y);
              ctx.closePath();
              ctx.fillStyle = 'rgba(15, 23, 42, 0.2)';
              ctx.fill();
              ctx.strokeStyle = teamColor;
              ctx.lineWidth = 2;
              ctx.stroke();

              ctx.save();
              ctx.translate(center.x, center.y);
              ctx.rotate(Date.now() / 120); // drilling rotation
              ctx.fillStyle = '#64748b';
              for (let i = 0; i < 3; i++) {
                  ctx.rotate((Math.PI * 2) / 3);
                  ctx.fillRect(-5, -bw / 3.4, 10, bw / 3.4);
                  ctx.beginPath();
                  ctx.moveTo(-8, -bw / 3.4);
                  ctx.lineTo(0, -bw / 3.4 - 5);
                  ctx.lineTo(8, -bw / 3.4);
                  ctx.fillStyle = teamColor;
                  ctx.fill();
              }
              ctx.beginPath();
              ctx.arc(0, 0, 7, 0, Math.PI * 2);
              ctx.fillStyle = '#334155';
              ctx.fill();
              ctx.restore();

          } else if (b.subType === BuildingType.BARRACKS_A) {
              // Double hangar modules with strip gates
              const offset = bw / 4.2;
              ctx.fillStyle = 'rgba(15, 23, 42, 0.2)';
              ctx.fillRect(bx + 6, by + 6, offset * 1.6, bh - 12);
              ctx.strokeStyle = teamColor;
              ctx.strokeRect(bx + 6, by + 6, offset * 1.6, bh - 12);

              ctx.fillRect(bx + bw - 6 - offset * 1.6, by + 6, offset * 1.6, bh - 12);
              ctx.strokeRect(bx + bw - 6 - offset * 1.6, by + 6, offset * 1.6, bh - 12);

              ctx.fillStyle = teamColor;
              ctx.fillRect(bx + 8, by + bh - 12, offset * 1.2, 5);
              ctx.fillRect(bx + bw - 8 - offset * 1.2, by + bh - 12, offset * 1.2, 5);

              // Center chevron icon
              ctx.beginPath();
              ctx.moveTo(center.x - 8, center.y);
              ctx.lineTo(center.x, center.y - 12);
              ctx.lineTo(center.x + 8, center.y);
              ctx.lineTo(center.x + 8, center.y + 8);
              ctx.lineTo(center.x - 8, center.y + 8);
              ctx.closePath();
              ctx.fillStyle = teamColor;
              ctx.fill();

          } else if (b.subType === BuildingType.BARRACKS_B) {
              // Deep research tower with scoping radar receiver
              ctx.beginPath();
              ctx.arc(center.x, center.y, bw / 3.2, 0, Math.PI * 2);
              ctx.fillStyle = 'rgba(15, 23, 42, 0.2)';
              ctx.fill();
              ctx.strokeStyle = teamColor;
              ctx.lineWidth = 2.5;
              ctx.stroke();

              ctx.save();
              ctx.translate(center.x, center.y);
              const radarAngle = Date.now() / 700;
              ctx.rotate(radarAngle);
              ctx.strokeStyle = '#475569';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(0, 0, bw / 4.4, -0.6, 0.6);
              ctx.stroke();
              ctx.beginPath();
              ctx.moveTo(0, 0);
              ctx.lineTo(bw / 3.5, 0);
              ctx.strokeStyle = accentColor;
              ctx.lineWidth = 2;
              ctx.stroke();
              ctx.beginPath();
              ctx.arc(bw / 3.5, 0, 3, 0, Math.PI * 2);
              ctx.fillStyle = '#ef4444';
              ctx.fill();
              ctx.restore();

          } else if (b.subType === BuildingType.ARMOURY) {
              // Reinforced octagon structure with tech diamond core
              ctx.beginPath();
              const rad = bw / 2 - 4;
              for (let i = 0; i < 8; i++) {
                  const angle = i * Math.PI / 4;
                  const px = center.x + Math.cos(angle) * rad;
                  const py = center.y + Math.sin(angle) * rad;
                  if (i === 0) ctx.moveTo(px, py);
                  else ctx.lineTo(px, py);
              }
              ctx.closePath();
              ctx.fillStyle = 'rgba(30, 41, 59, 0.25)';
              ctx.fill();
              ctx.strokeStyle = teamColor;
              ctx.lineWidth = 3;
              ctx.stroke();

              // Cyclic upgrades pulsing glow
              ctx.beginPath();
              ctx.moveTo(center.x, center.y - 14);
              ctx.lineTo(center.x + 14, center.y);
              ctx.lineTo(center.x, center.y + 14);
              ctx.lineTo(center.x - 14, center.y);
              ctx.closePath();
              const coreColor = (Date.now() / 15) % 360;
              ctx.fillStyle = `hsla(${coreColor}, 85%, 60%, 0.75)`;
              ctx.fill();
              ctx.strokeStyle = 'white';
              ctx.stroke();

          } else if (b.subType === BuildingType.TURRET) {
              // Heavy defense base with tracking turret head
              ctx.beginPath();
              ctx.arc(center.x, center.y, bw / 2 - 4, 0, Math.PI * 2);
              ctx.fillStyle = 'rgba(15, 23, 42, 0.2)';
              ctx.fill();
              ctx.strokeStyle = '#475569';
              ctx.lineWidth = 2.5;
              ctx.stroke();

              // Top head rotation
              ctx.save();
              ctx.translate(center.x, center.y);
              const rotation = b.turretHeading || 0;
              ctx.rotate(rotation);

              // Heavy gun barrels
              ctx.fillStyle = '#475569';
              ctx.fillRect(2, -7, 18, 3.5);
              ctx.fillRect(2, 4.5, 18, 3.5);
              ctx.fillStyle = teamColor;
              ctx.fillRect(19, -7, 3, 3.5);
              ctx.fillRect(19, 4.5, 3, 3.5);

              // Center turret ball
              ctx.beginPath();
              ctx.arc(0, 0, 10, 0, Math.PI * 2);
              ctx.fillStyle = teamColor;
              ctx.fill();
              ctx.strokeStyle = 'white';
              ctx.lineWidth = 1.3;
              ctx.stroke();

              ctx.restore();
          }

          // Building health bars rendering
          const hpPct = b.health / b.maxHealth;
          ctx.fillStyle = 'black';
          ctx.fillRect(bx, by - 9, bw, 4);
          ctx.fillStyle = hpPct > 0.5 ? '#10b981' : '#ef4444';
          ctx.fillRect(bx, by - 9, bw * hpPct, 4);

          // Production bar queue rendering
          if (b.unitQueue.length > 0) {
              const pPct = 1 - (b.productionTimer / b.totalProductionTime);
              ctx.fillStyle = '#06b6d4';
              ctx.fillRect(bx, by + bh + 4, bw * pPct, 4);
              ctx.fillStyle = 'white';
              ctx.font = '10px monospace';
              ctx.fillText(`${b.unitQueue.length}`, bx + bw/2 - 3, by + bh + 14);
          }

          // Defensive Turret Laser Fire Draw
          if (b.subType === BuildingType.TURRET && (Date.now() - (b.lastAttackTime || 0) < 100)) {
              // Redraw bright discharge beam
              const targets = state.units.filter(u => u.team !== b.team && dist(center, u.position) <= b.attackRange!);
              if (targets.length > 0) {
                  const closest = targets.sort((a,b) => dist(center, a.position) - dist(center, b.position))[0];
                  ctx.beginPath();
                  ctx.moveTo(center.x, center.y);
                  ctx.lineTo(closest.position.x, closest.position.y);
                  ctx.strokeStyle = '#22d3ee'; // bright cyan electric lightning beam
                  ctx.lineWidth = 3;
                  ctx.stroke();
              }
          }
      }
    });

    // Draw Units
    state.units.forEach(u => {
      // Range indicator ring
      if (u.isSelected) {
          ctx.beginPath();
          ctx.arc(u.position.x, u.position.y, u.attackRange, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
          ctx.lineWidth = 1;
          ctx.setLineDash([5, 5]);
          ctx.stroke();
          ctx.setLineDash([]);
      }

      // Unit visual coordinates base rotate
      const heading = u.heading || 0;
      const teamColor = u.team === Team.PLAYER ? '#0a192f' : '#310000';
      const glowColor = u.team === Team.PLAYER ? '#0ea5e9' : '#ef4444';
      const accent = u.team === Team.PLAYER ? '#22d3ee' : '#f87171';

      ctx.save();
      ctx.translate(u.position.x, u.position.y);
      ctx.rotate(heading);

      if (u.subType === UnitType.SOLDIER) {
          // --- ROBOTIC MELEE PAWN STYLE ---
          const r = u.radius;
          const motionOsc = u.state !== 'IDLE' ? Math.sin(Date.now() / 90) * 0.15 : 0;

          // Flared mechanical circular battle skirt (Pawn base)
          ctx.beginPath();
          ctx.arc(0, 0, r * 0.85, 0.4, Math.PI * 2 - 0.4);
          ctx.lineTo(-r * 0.4, 0); // close keycap style back
          ctx.closePath();
          ctx.fillStyle = teamColor;
          ctx.fill();
          ctx.strokeStyle = glowColor;
          ctx.lineWidth = u.isSelected ? 2.5 : 1.5;
          ctx.stroke();

          // Left & Right hydraulic shoulders
          ctx.fillStyle = '#475569';
          ctx.fillRect(-r * 0.7, -r * 0.9, r * 0.4, r * 0.3);
          ctx.fillRect(-r * 0.7, r * 0.6, r * 0.4, r * 0.3);

          // Dual segmented forward combat pikes / energy blades
          ctx.strokeStyle = accent;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(r * 0.4, -r * 0.4 + motionOsc * r);
          ctx.lineTo(r * 1.25, -r * 0.25 + motionOsc * r * 0.5);
          ctx.lineTo(r * 0.3, -r * 0.1);
          ctx.moveTo(r * 0.4, r * 0.4 - motionOsc * r);
          ctx.lineTo(r * 1.25, r * 0.25 - motionOsc * r * 0.5);
          ctx.lineTo(r * 0.3, r * 0.1);
          ctx.stroke();

          // Centered spherical pawn mechanical head dome
          ctx.beginPath();
          ctx.arc(r * 0.1, 0, r * 0.42, 0, Math.PI * 2);
          ctx.fillStyle = '#1e293b';
          ctx.fill();
          ctx.strokeStyle = glowColor;
          ctx.stroke();

          // Eye sensor visor glowing
          ctx.beginPath();
          ctx.arc(r * 0.32, 0, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = accent;
          ctx.fill();

      } else if (u.subType === UnitType.SNIPER) {
          // --- ROBOTIC MACE / ROCKETEER STYLE ---
          const r = u.radius;
          const oscPulse = Math.sin(Date.now() / 120);

          // Heavy mace-like spiked casing frame (Hexagonal gear capsule)
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
              const angle = (i * Math.PI) / 3;
              const px = Math.cos(angle) * r * 0.85;
              const py = Math.sin(angle) * r * 0.85;
              if (i === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fillStyle = teamColor;
          ctx.fill();
          ctx.strokeStyle = glowColor;
          ctx.lineWidth = u.isSelected ? 2.5 : 1.5;
          ctx.stroke();

          // Spikes extending around mace rim back-to-side
          ctx.fillStyle = glowColor;
          for (let i = 2; i <= 4; i++) {
              const angle = (i * Math.PI) / 3;
              ctx.beginPath();
              ctx.moveTo(Math.cos(angle) * r * 0.8, Math.sin(angle) * r * 0.8);
              ctx.lineTo(Math.cos(angle) * r * 1.15, Math.sin(angle) * r * 1.15);
              ctx.lineTo(Math.cos(angle + 0.2) * r * 0.8, Math.sin(angle + 0.2) * r * 0.8);
              ctx.fill();
          }

          // Twin rocket launcher pods / pod bays (Rocketeer batteries)
          ctx.fillStyle = '#1e293b';
          ctx.strokeRect(-r * 0.65, -r * 0.8, r * 0.7, r * 0.4);
          ctx.fillRect(-r * 0.65, -r * 0.8, r * 0.7, r * 0.4);
          ctx.strokeRect(-r * 0.65, r * 0.4, r * 0.7, r * 0.4);
          ctx.fillRect(-r * 0.65, r * 0.4, r * 0.7, r * 0.4);

          // Multi-tube launch holes glowing with dynamic laser charging
          ctx.fillStyle = oscPulse > 0 ? '#ef4444' : '#1e293b';
          ctx.beginPath();
          ctx.arc(-r * 0.15, -r * 0.6, 2, 0, Math.PI * 2);
          ctx.arc(-r * 0.45, -r * 0.6, 2, 0, Math.PI * 2);
          ctx.arc(-r * 0.15, r * 0.6, 2, 0, Math.PI * 2);
          ctx.arc(-r * 0.45, r * 0.6, 2, 0, Math.PI * 2);
          ctx.fill();

          // Sleek central sniping rail muzz
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(r * 1.6, 0);
          ctx.stroke();

          // laser optics tip
          ctx.beginPath();
          ctx.arc(r * 1.6, 0, 2, 0, Math.PI * 2);
          ctx.fillStyle = oscPulse > 0.2 ? '#f43f5e' : '#fda4af';
          ctx.fill();

      } else if (u.subType === UnitType.COMMANDER) {
          // --- HEAVY HUMANOID BATTLE ROBOT STYLE (BAR DESIGNS) ---
          const r = u.radius;
          const osc = Math.sin(Date.now() / 110);
          const isMoving = u.state !== 'IDLE';

          // 1. Moving legs (oscillates if unit is in motion, mimicking humanoid strides!)
          ctx.save();
          ctx.strokeStyle = '#475569';
          ctx.lineWidth = 4;
          
          const leftStride = isMoving ? osc * r * 0.55 : 0;
          const rightStride = isMoving ? -osc * r * 0.55 : 0;

          // Left hip, leg, and foot
          ctx.beginPath();
          ctx.moveTo(-r * 0.25, -r * 0.4);
          ctx.lineTo(-r * 0.75 + leftStride, -r * 0.85); // knee
          ctx.lineTo(-r * 0.1 + leftStride, -r * 0.95);  // heavy mechanical foot anchor
          ctx.stroke();
          // Draw left armored foot plate
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(-r * 0.15 + leftStride, -r * 1.05, r * 0.4, r * 0.25);
          ctx.strokeRect(-r * 0.15 + leftStride, -r * 1.05, r * 0.4, r * 0.25);

          // Right hip, leg, and foot
          ctx.beginPath();
          ctx.moveTo(-r * 0.25, r * 0.4);
          ctx.lineTo(-r * 0.75 + rightStride, r * 0.85); // knee
          ctx.lineTo(-r * 0.1 + rightStride, r * 0.95);  // foot
          ctx.stroke();
          // Draw right foot plate 
          ctx.fillRect(-r * 0.15 + rightStride, r * 0.8, r * 0.4, r * 0.25);
          ctx.strokeRect(-r * 0.15 + rightStride, r * 0.8, r * 0.4, r * 0.25);
          ctx.restore();

          // 2. Broad mechanical shoulder-girdle / Humanoid Torso
          ctx.beginPath();
          ctx.moveTo(-r * 0.6, -r * 0.7);
          ctx.lineTo(r * 0.4, -r * 0.6); // robust armored chest plate
          ctx.lineTo(r * 0.6, 0);       // chest center ridge
          ctx.lineTo(r * 0.4, r * 0.6);
          ctx.lineTo(-r * 0.6, r * 0.7);
          ctx.closePath();
          ctx.fillStyle = teamColor;
          ctx.fill();
          ctx.strokeStyle = '#f8fafc';
          ctx.lineWidth = u.isSelected ? 2.5 : 1.8;
          ctx.stroke();

          // Metallic collar vents / heat sink grills
          ctx.fillStyle = '#334155';
          ctx.fillRect(-r * 0.42, -r * 0.3, r * 0.2, r * 0.6);

          // 3. Central Humanoid commander helmet dome
          ctx.beginPath();
          ctx.arc(r * 0.1, 0, r * 0.38, 0, Math.PI * 2);
          ctx.fillStyle = '#0f172a';
          ctx.fill();
          ctx.strokeStyle = glowColor;
          ctx.stroke();

          // Wide glowing cyber visor (Humanoid eye visor bar)
          ctx.beginPath();
          ctx.moveTo(r * 0.36, -r * 0.22);
          ctx.lineTo(r * 0.43, -r * 0.12);
          ctx.lineTo(r * 0.43, r * 0.12);
          ctx.lineTo(r * 0.36, r * 0.22);
          ctx.closePath();
          ctx.fillStyle = accent;
          ctx.fill();

          // Glowing nuclear reactor core chest orb
          const fusionFlux = 5 + Math.sin(Date.now() / 150) * 2;
          ctx.beginPath();
          ctx.arc(-r * 0.26, 0, fusionFlux, 0, Math.PI * 2);
          ctx.fillStyle = '#eab308'; // Uranium gold core
          ctx.fill();

          // Left Arm - Nanotech Construction Field Emitter & Heavy Shoulder Shield
          ctx.save();
          ctx.translate(-r * 0.1, -r * 0.75); // Pivot left shoulder
          ctx.fillStyle = '#334155';
          ctx.fillRect(-r * 0.25, -r * 0.20, r * 0.5, r * 0.22); // Arm hinge
          // Segmented mechanical builder arm with claws
          ctx.strokeStyle = '#64748b';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(r * 0.45, -r * 0.1);
          ctx.lineTo(r * 0.7, -r * 0.35 + osc * 3); // moving emitter
          ctx.stroke();
          // Glow spark
          ctx.beginPath();
          ctx.arc(r * 0.7, -r * 0.35 + osc * 3, 3, 0, Math.PI * 2);
          ctx.fillStyle = accent;
          ctx.fill();
          ctx.restore();

          // Right Arm - Mounted rail-cannon arm
          ctx.save();
          ctx.translate(-r * 0.1, r * 0.75); // Pivot right shoulder
          ctx.fillStyle = '#334155';
          ctx.fillRect(-r * 0.25, -r * 0.02, r * 0.5, r * 0.22);
          ctx.restore();

          // 4. Upper heavy weapon upper turret deck (attaches to weapon aiming)
          ctx.restore();
          ctx.save();
          ctx.translate(u.position.x, u.position.y);
          const tHeading = u.turretHeading !== undefined ? u.turretHeading : heading;
          ctx.rotate(tHeading);

          // Heavy dynamic mechanical cannon gun system (mace launcher / blast rail)
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(r * 0.31, r * 0.4, r * 1.35, 7); // heavy blast barrel right
          ctx.strokeRect(r * 0.31, r * 0.4, r * 1.35, 7);
          ctx.fillRect(0, -r * 0.12, r * 0.65, r * 0.24); // central battery booster
          ctx.strokeRect(0, -r * 0.12, r * 0.65, r * 0.24);

          ctx.fillStyle = accent;
          ctx.fillRect(r * 1.5, r * 0.4, 3, 7); // energizer muzzle tip

      } else if (u.subType === UnitType.TANK) {
          // Track parts
          const r = u.radius;
          ctx.fillStyle = '#1e293b';
          // Treads
          ctx.fillRect(-r * 1.1, -r * 0.9, r * 2.2, r * 0.33);
          ctx.strokeRect(-r * 1.1, -r * 0.9, r * 2.2, r * 0.33);
          ctx.fillRect(-r * 1.1, r * 0.57, r * 2.2, r * 0.33);
          ctx.strokeRect(-r * 1.1, r * 0.57, r * 2.2, r * 0.33);

          // Heavy armored frame
          ctx.beginPath();
          ctx.moveTo(r, 0);
          ctx.lineTo(r * 0.6, -r * 0.55);
          ctx.lineTo(-r * 0.8, -r * 0.55);
          ctx.lineTo(-r, 0);
          ctx.lineTo(-r * 0.8, r * 0.55);
          ctx.lineTo(r * 0.6, r * 0.55);
          ctx.closePath();

          ctx.fillStyle = teamColor;
          ctx.fill();
          ctx.strokeStyle = '#eab308'; // special Tank golden trim status
          ctx.lineWidth = u.isSelected ? 3.0 : 2.0;
          ctx.stroke();

          // Turret rotates independently
          ctx.restore();
          ctx.save();
          ctx.translate(u.position.x, u.position.y);
          const tHeading = u.turretHeading !== undefined ? u.turretHeading : heading;
          ctx.rotate(tHeading);

          // Gun barrel
          ctx.fillStyle = '#475569';
          ctx.fillRect(0, -3.5, r * 1.55, 7);
          ctx.strokeStyle = '#cbd5e1';
          ctx.strokeRect(0, -3.5, r * 1.55, 7);

          // Rotating turret head plate
          ctx.beginPath();
          ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
          ctx.fillStyle = glowColor;
          ctx.fill();
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 1.5;
          ctx.stroke();
      }

      ctx.restore();

      // Weapon beam lasers discharge rendering
      if (u.state === 'ATTACK' && u.targetEntityId && (Date.now() - u.lastAttackTime < 100)) {
         const target = [...state.units, ...state.buildings].find(e => e.id === u.targetEntityId);
         if (target) {
            ctx.beginPath();
            ctx.moveTo(u.position.x, u.position.y);
            
            const targetCenter = target.type === EntityType.BUILDING 
                ? { x: target.position.x + target.width*GRID_SIZE/2, y: target.position.y + target.height*GRID_SIZE/2 }
                : target.position;
                
            ctx.lineTo(targetCenter.x, targetCenter.y);
            ctx.strokeStyle = u.subType === UnitType.COMMANDER ? '#06b6d4' : (u.subType === UnitType.SNIPER ? '#e11d48' : '#fef08a');
            ctx.lineWidth = u.subType === UnitType.COMMANDER ? 5.0 : (u.subType === UnitType.SNIPER ? 3.5 : 2);
            ctx.stroke();
         }
      }

      // Unit HP Bar
      const hpPct = u.health / u.maxHealth;
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(u.position.x - 10, u.position.y - u.radius - 8, 20, 3);
      ctx.fillStyle = '#10b981';
      ctx.fillRect(u.position.x - 10, u.position.y - u.radius - 8, 20 * hpPct, 3);
    });

    // Particles draw
    state.particles.forEach(p => {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life;
      ctx.beginPath();
      ctx.arc(p.position.x, p.position.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    // Placement visual outlines
    if (placementMode) {
      // Draw light glowing build range circles centered at every Player building and Player Commander
      state.buildings.forEach(b => {
          if (b.team === Team.PLAYER && !b.isUnderConstruction) {
              ctx.save();
              ctx.beginPath();
              ctx.arc(b.position.x + (b.width * GRID_SIZE)/2, b.position.y + (b.height * GRID_SIZE)/2, 500, 0, Math.PI * 2);
              ctx.fillStyle = 'rgba(56, 189, 248, 0.015)';
              ctx.fill();
              ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
              ctx.lineWidth = 1;
              ctx.setLineDash([8, 6]);
              ctx.stroke();
              ctx.restore();
          }
      });
      state.units.forEach(u => {
          if (u.team === Team.PLAYER && u.subType === UnitType.COMMANDER) {
              ctx.save();
              ctx.beginPath();
              ctx.arc(u.position.x, u.position.y, 500, 0, Math.PI * 2);
              ctx.fillStyle = 'rgba(6, 182, 212, 0.025)';
              ctx.fill();
              ctx.strokeStyle = 'rgba(6, 182, 212, 0.12)';
              ctx.lineWidth = 1;
              ctx.setLineDash([8, 6]);
              ctx.stroke();
              ctx.restore();
          }
      });

      const { x, y } = mousePos.current;
      const zoom = state.zoom || 1.0;
      const camX = state.camera.x;
      const camY = state.camera.y;
      const gridX = Math.floor((x / zoom + camX) / GRID_SIZE) * GRID_SIZE;
      const gridY = Math.floor((y / zoom + camY) / GRID_SIZE) * GRID_SIZE;
      const stats = BUILDING_STATS[placementMode];

      const checkResult = canPlaceBuilding(placementMode, gridX, gridY);
      const isValidSpot = checkResult.valid;

      ctx.fillStyle = isValidSpot ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.45)';
      ctx.strokeStyle = isValidSpot ? '#10b981' : '#ef4444';
      ctx.lineWidth = 2.0;
      ctx.fillRect(gridX, gridY, stats.width * GRID_SIZE, stats.height * GRID_SIZE);
      ctx.strokeRect(gridX, gridY, stats.width * GRID_SIZE, stats.height * GRID_SIZE);

      if (!isValidSpot && checkResult.reason) {
        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(checkResult.reason, gridX + (stats.width * GRID_SIZE) / 2, gridY - 8);
        ctx.textAlign = 'left';
      }
    }

    // Box Drag Selection render
    if (state.selection.active) {
      const sx = state.selection.start.x;
      const sy = state.selection.start.y;
      const cw = state.selection.end.x - sx;
      const ch = state.selection.end.y - sy;
      
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(34, 211, 238, 0.16)';
      ctx.fillRect(sx, sy, cw, ch);
      ctx.strokeRect(sx, sy, cw, ch);
    }

    // Right Click Drag Line Command preview
    if (rightDrag.current.active) {
       const start = rightDrag.current.start;
       const end = rightDrag.current.end;
       
       // Draw beautiful vector guideline
       ctx.beginPath();
       ctx.moveTo(start.x, start.y);
       ctx.lineTo(end.x, end.y);
       ctx.strokeStyle = 'rgba(16, 185, 129, 0.7)';
       ctx.lineWidth = 2;
       ctx.setLineDash([4, 4]);
       ctx.stroke();
       ctx.setLineDash([]);

       const selectedUnits = state.units.filter(u => u.isSelected && u.team === Team.PLAYER);
       const numUnits = selectedUnits.length;
       
       // Highlight alignment placement ticks
       if (numUnits > 0) {
           for (let i = 0; i < numUnits; i++) {
               let dotX = end.x;
               let dotY = end.y;
               if (numUnits > 1) {
                   const ratio = i / (numUnits - 1);
                   dotX = start.x + ratio * (end.x - start.x);
                   dotY = start.y + ratio * (end.y - start.y);
               }
               ctx.beginPath();
               ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
               ctx.fillStyle = '#10b981';
               ctx.fill();
               ctx.strokeStyle = '#ffffff';
               ctx.stroke();
           }
       }
    }

    ctx.restore();
  };

  const drawMinimap = () => {
      if (!minimapRef.current) return;
      const ctx = minimapRef.current.getContext('2d');
      if (!ctx) return;
      const state = gameState.current;
      const cw = minimapRef.current.width;
      const ch = minimapRef.current.height;

      // Clear minimap
      ctx.fillStyle = '#0b0f19';
      ctx.fillRect(0, 0, cw, ch);

      const scaleX = cw / state.mapSize.width;
      const scaleY = ch / state.mapSize.height;

      // Draw ore veins on minimap
      ctx.fillStyle = 'rgba(6, 182, 212, 0.25)';
      mineralDeposits.current.forEach(d => {
         ctx.fillRect(d.x * scaleX, d.y * scaleY, 4, 4);
      });

      // Draw Buildings and Units
      [...state.buildings, ...state.units].forEach(e => {
          ctx.fillStyle = e.team === Team.PLAYER ? '#38bdf8' : '#ef4444';
          const size = e.type === EntityType.BUILDING ? 3 : 1.5;
          ctx.beginPath();
          ctx.arc(e.position.x * scaleX, e.position.y * scaleY, size, 0, Math.PI*2);
          ctx.fill();
      });

      // Draw camera bounding rect
      const zoom = state.zoom || 1.0;
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 1;
      ctx.strokeRect(state.camera.x * scaleX, state.camera.y * scaleY, (window.innerWidth / zoom) * scaleX, (window.innerHeight / zoom) * scaleY);
  };

  // --- HANDLERS ---
  
  const handleMouseDown = (e: React.MouseEvent) => {
    const state = gameState.current;
    const zoom = state.zoom || 1.0;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const worldX = x / zoom + state.camera.x;
    const worldY = y / zoom + state.camera.y;

    if (e.button === 2) {
       // Start right-click drag tracking (always active to support factory rally placement)
       rightDrag.current = {
          active: true,
          start: { x: worldX, y: worldY },
          end: { x: worldX, y: worldY },
       };
       return;
    }

    if (e.button !== 0) return;

    if (placementMode) {
      const stats = BUILDING_STATS[placementMode];
      const gridX = Math.floor(worldX / GRID_SIZE) * GRID_SIZE;
      const gridY = Math.floor(worldY / GRID_SIZE) * GRID_SIZE;
      
      const checkResult = canPlaceBuilding(placementMode, gridX, gridY);

      if (checkResult.valid) {
        state.money.metal -= stats.cost.metal;
        state.money.energy -= stats.cost.energy;
        
        const newB = createBuilding(placementMode, {x: worldX, y: worldY}, Team.PLAYER);
        state.buildings.push(newB);

        // Evict units immediately from the new construction footprint!
        const bw = newB.width * GRID_SIZE;
        const bh = newB.height * GRID_SIZE;
        const bx = newB.position.x;
        const by = newB.position.y;
        const centerBX = bx + bw / 2;
        const centerBY = by + bh / 2;

        state.units.forEach(u => {
          if (u.position.x + u.radius > bx && u.position.x - u.radius < bx + bw &&
              u.position.y + u.radius > by && u.position.y - u.radius < by + bh) {
            
            const dx = u.position.x - centerBX;
            const dy = u.position.y - centerBY;
            const distToCenter = Math.sqrt(dx * dx + dy * dy) || 1;
            const pushDistance = Math.max(bw, bh) * 0.8 + 25;
            u.targetPosition = {
              x: centerBX + (dx / distToCenter) * pushDistance,
              y: centerBY + (dy / distToCenter) * pushDistance
            };
            u.targetEntityId = null;
            u.state = 'MOVE';
          }
        });
        
        setResources({...state.money});
        setPlacementMode(null);
        playBuildStartSound();
      }
    } else {
      state.selection.active = true;
      state.selection.start = { x: worldX, y: worldY };
      state.selection.end = { x: worldX, y: worldY };
      state.units.forEach(u => u.isSelected = false);
      state.buildings.forEach(b => b.isSelected = false);
    }
    setSelectionChangeCounter(prev => prev + 1);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const state = gameState.current;
    const zoom = state.zoom || 1.0;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    mousePos.current = { x, y };

    // Track cursor client position for rendering hover tooltip card
    setHoveredMousePos({ x: e.clientX, y: e.clientY });

    if (rightDrag.current.active) {
       rightDrag.current.end = { x: x / zoom + state.camera.x, y: y / zoom + state.camera.y };
    }
    if (state.selection.active) {
       state.selection.end = { x: x / zoom + state.camera.x, y: y / zoom + state.camera.y };
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    const state = gameState.current;
    const zoom = state.zoom || 1.0;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const worldX = x / zoom + state.camera.x;
    const worldY = y / zoom + state.camera.y;

    if (e.button === 2) {
       if (rightDrag.current.active) {
          rightDrag.current.active = false;
          const selectedUnits = state.units.filter(u => u.isSelected && u.team === Team.PLAYER);
          const start = rightDrag.current.start;
          const end = rightDrag.current.end;
          const distance = dist(start, end);

          // If click was brief or no mobile/line formation was drawn, or no units are selected (meaning factory is selected):
          if (distance < 14 || selectedUnits.length === 0) {
              executeRightClick(end.x, end.y, selectedUnits);
          } else {
              // DRAG FORMATION ASSIGNMENT
                  const numUnits = selectedUnits.length;
                  selectedUnits.forEach((u, i) => {
                      let targetPos: Vector;
                      if (numUnits === 1) {
                          targetPos = { ...end };
                      } else {
                          const ratio = i / (numUnits - 1);
                          targetPos = {
                              x: start.x + ratio * (end.x - start.x),
                              y: start.y + ratio * (end.y - start.y),
                          };
                      }
                      u.targetPosition = targetPos;
                      u.targetEntityId = null;
                      u.state = 'MOVE';
                      spawnParticle(targetPos, '#10b981', 4);
                  });
                  playFormationSound();
              }
          }
          return;
       }

    if (e.button !== 0) return;

    if (state.selection.active) {
      state.selection.active = false;
      const endX = worldX;
      const endY = worldY;
      const startX = state.selection.start.x;
      const startY = state.selection.start.y;

      const minX = Math.min(startX, endX);
      const maxX = Math.max(startX, endX);
      const minY = Math.min(startY, endY);
      const maxY = Math.max(startY, endY);

      let selectSoundTriggered = false;

      if (maxX - minX < 5 && maxY - minY < 5) {
         const clickedEntity = [...state.units, ...state.buildings].find(ent => {
            const size = ent.type === EntityType.UNIT ? ent.radius : Math.max(ent.width, ent.height)*GRID_SIZE/2;
            const cx = ent.type === EntityType.UNIT ? ent.position.x : ent.position.x + ent.width*GRID_SIZE/2;
            const cy = ent.type === EntityType.UNIT ? ent.position.y : ent.position.y + ent.height*GRID_SIZE/2;
            return dist({x: endX, y: endY}, {x: cx, y: cy}) < size;
         });
         if (clickedEntity && clickedEntity.team === Team.PLAYER) {
             clickedEntity.isSelected = true;
             selectSoundTriggered = true;
         }
      } else {
         let unitSelected = false;
         state.units.forEach(u => {
           if (u.team === Team.PLAYER && u.position.x > minX && u.position.x < maxX && u.position.y > minY && u.position.y < maxY) {
             u.isSelected = true;
             unitSelected = true;
             selectSoundTriggered = true;
           }
         });
         if (!unitSelected) {
             state.buildings.forEach(b => {
                 const cx = b.position.x + b.width*GRID_SIZE/2;
                 const cy = b.position.y + b.height*GRID_SIZE/2;
                 if (b.team === Team.PLAYER && cx > minX && cx < maxX && cy > minY && cy < maxY) {
                     b.isSelected = true;
                     selectSoundTriggered = true;
                 }
             });
         }
      }

      if (selectSoundTriggered) {
          playSelectSound();
      }
    }
    setSelectionChangeCounter(prev => prev + 1);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (!canvasRef.current) return;
    const state = gameState.current;
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Word coordinates corresponding to cursor
    const zoom = state.zoom || 1.0;
    const worldX = mouseX / zoom + state.camera.x;
    const worldY = mouseY / zoom + state.camera.y;

    let nextZoom = zoom;
    if (e.deltaY < 0) {
      nextZoom = Math.min(2.5, zoom + 0.15);
    } else {
      nextZoom = Math.max(0.4, zoom - 0.15);
    }

    state.zoom = nextZoom;
    targetZoomValue.current = nextZoom;

    // Adjust camera so mouse coordinates remain at same world position
    state.camera.x = worldX - mouseX / nextZoom;
    state.camera.y = worldY - mouseY / nextZoom;

    // Clamp camera within map bounds
    state.camera.x = Math.max(0, Math.min(state.camera.x, state.mapSize.width - window.innerWidth / nextZoom));
    state.camera.y = Math.max(0, Math.min(state.camera.y, state.mapSize.height - window.innerHeight / nextZoom));

    setZoomValue(nextZoom);
  };

  const executeRightClick = (worldX: number, worldY: number, selectedUnits: any[]) => {
     const state = gameState.current;

     const selectedFactories = state.buildings.filter(b => b.isSelected && b.team === Team.PLAYER && (b.subType === BuildingType.BARRACKS_A || b.subType === BuildingType.BARRACKS_B));
     if (selectedUnits.length === 0 && selectedFactories.length > 0) {
        selectedFactories.forEach(b => {
           b.rallyPoint = { x: worldX, y: worldY };
        });
        spawnParticle({ x: worldX, y: worldY }, '#06b6d4', 8, 1.2);
        playMoveSound();
        setSelectionChangeCounter(prev => prev + 1);
        return;
     }

     // Check if we clicked an allied damaged building for repair instructions (Commander only)
     const clickedPlayerBuilding = state.buildings.find(b => {
          if (b.team !== Team.PLAYER) return false;
          const cx = b.position.x + b.width*GRID_SIZE/2;
          const cy = b.position.y + b.height*GRID_SIZE/2;
          const size = Math.max(b.width, b.height)*GRID_SIZE/2 + 25;
          const canBeRepaired = b.health < b.maxHealth || b.isUnderConstruction;
          return canBeRepaired && dist({x: worldX, y: worldY}, {x: cx, y: cy}) < size;
     });

     if (clickedPlayerBuilding && selectedUnits.some(u => u.subType === UnitType.COMMANDER)) {
         selectedUnits.forEach((u, i) => {
             if (u.subType === UnitType.COMMANDER) {
                 u.targetEntityId = clickedPlayerBuilding.id;
                 u.targetPosition = null;
                 u.state = 'REPAIR';
                 const cx = clickedPlayerBuilding.position.x + clickedPlayerBuilding.width * GRID_SIZE / 2;
                 const cy = clickedPlayerBuilding.position.y + clickedPlayerBuilding.height * GRID_SIZE / 2;
                 spawnParticle({ x: cx, y: cy }, '#22d3ee', 6, 1.2);
                 addCombatLog(`Commander assigned to repair ${clickedPlayerBuilding.subType}`, 'info');
             } else {
                 // Move non-commanders safely around
                 const row = Math.floor(i / 5);
                 const col = i % 5;
                 u.targetPosition = { x: worldX + col * 20 - 50, y: worldY + row * 20 - 50 };
                 u.targetEntityId = null;
                 u.state = 'MOVE';
                 spawnParticle(u.targetPosition, '#10b981', 1.5);
             }
         });
         playMoveSound();
         return;
     }

     const clickedEnemy = [...state.units, ...state.buildings].find(ent => {
          if (ent.team === Team.PLAYER) return false;
          const size = ent.type === EntityType.UNIT ? ent.radius + 10 : Math.max(ent.width, ent.height)*GRID_SIZE/2 + 10;
          const cx = ent.type === EntityType.UNIT ? ent.position.x : ent.position.x + ent.width*GRID_SIZE/2;
          const cy = ent.type === EntityType.UNIT ? ent.position.y : ent.position.y + ent.height*GRID_SIZE/2;
          return dist({x: worldX, y: worldY}, {x: cx, y: cy}) < size;
     });

     if (clickedEnemy) {
       selectedUnits.forEach(u => {
         u.targetEntityId = clickedEnemy.id;
         u.targetPosition = null;
         u.state = 'CHASE';
         spawnParticle(clickedEnemy.position, '#ee4444', 3);
       });
       playLaserSound(false);
     } else {
       selectedUnits.forEach((u, i) => {
         const row = Math.floor(i / 5);
         const col = i % 5;
         u.targetPosition = { x: worldX + col * 20 - 50, y: worldY + row * 20 - 50 };
         u.targetEntityId = null;
         u.state = 'MOVE';
         spawnParticle(u.targetPosition, '#10b981', 2);
       });
       playMoveSound();
     }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault(); // Unify right click interactions strictly through MouseDown & MouseUp
  };

  const handleMinimapClick = (e: React.MouseEvent) => {
      const rect = minimapRef.current!.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const state = gameState.current;
      
      const scaleX = state.mapSize.width / rect.width;
      const scaleY = state.mapSize.height / rect.height;
      
      state.camera.x = mx * scaleX - window.innerWidth / 2;
      state.camera.y = my * scaleY - window.innerHeight / 2;
      
      state.camera.x = Math.max(0, Math.min(state.camera.x, state.mapSize.width - window.innerWidth));
      state.camera.y = Math.max(0, Math.min(state.camera.y, state.mapSize.height - window.innerHeight));
  };

  // --- MAIN LOOP ---
  useEffect(() => {
    const loop = (timestamp: number) => {
      const dt = timestamp - lastTime.current;
      lastTime.current = timestamp;

      update(dt);
      
      if (canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) draw(ctx);
      }
      
      drawMinimap();
      requestAnimationFrame(loop);
    };
    
    const raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [placementMode]);

  // Camera Keyboard Controls (Tracking depressed keys)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        const key = e.key.toLowerCase();
        pressedKeys.current[key] = true;
        
        if (key === 'escape') {
            const state = gameState.current;
            state.units.forEach(u => u.isSelected = false);
            state.buildings.forEach(b => b.isSelected = false);
            setPlacementMode(null);
            setSelectionChangeCounter(prev => prev + 1);
        }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
        const key = e.key.toLowerCase();
        pressedKeys.current[key] = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Find live hovered info safely on every frame update
  let liveHovered: any = null;
  if (hoveredID) {
     const state = gameState.current;
     liveHovered = state.units.find(u => u.id === hoveredID) || state.buildings.find(b => b.id === hoveredID);
  }

  const selectedBuildings = gameState.current.buildings.filter(b => b.team === Team.PLAYER && b.isSelected);
  const isBarracksASelected = selectedBuildings.some(b => b.subType === BuildingType.BARRACKS_A);
  const isBarracksBSelected = selectedBuildings.some(b => b.subType === BuildingType.BARRACKS_B);
  const showUnitAssembleGroup = isBarracksASelected || isBarracksBSelected;

  return (
    <div className="relative w-full h-screen bg-slate-900 overflow-hidden font-sans select-none">
      
      {/* HOVER INFO CARD */}
      {liveHovered && (
        <div 
          className="absolute bottom-36 left-6 z-50 bg-slate-950/95 border-2 border-slate-800 rounded-xl p-4 shadow-[0_10px_35px_rgba(0,0,0,0.8)] backdrop-blur-md text-white w-64 pointer-events-none font-sans transition-all duration-200"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 mb-2">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-mono tracking-widest text-slate-500 font-bold">
                {liveHovered.type === EntityType.UNIT ? 'Core Unit' : 'Structure Info'}
              </span>
              <span className="text-sm font-bold text-cyan-400 font-sans tracking-wide">
                {liveHovered.subType}
              </span>
            </div>
            <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase ${liveHovered.team === Team.PLAYER ? 'bg-cyan-950 text-cyan-400 border border-cyan-800/30' : 'bg-red-950 text-red-400 border border-red-800/20'}`}>
              {liveHovered.team === Team.PLAYER ? 'Allied' : 'Hostile'}
            </span>
          </div>

          {/* Health Bar */}
          <div className="mb-3">
            <div className="flex justify-between items-center text-[10px] text-slate-400 mb-1 font-mono">
              <span>INTEGRITY</span>
              <span className="font-bold text-slate-200">
                {Math.ceil(liveHovered.health)} / {Math.ceil(liveHovered.maxHealth)}
              </span>
            </div>
            <div className="w-full bg-slate-900/80 rounded-full h-1.5 border border-slate-800 overflow-hidden">
              <div 
                style={{ width: `${Math.min(100, Math.max(0, (liveHovered.health / liveHovered.maxHealth) * 100))}%` }}
                className={`h-full rounded-full transition-all duration-100 ${liveHovered.health / liveHovered.maxHealth > 0.5 ? 'bg-emerald-500' : 'bg-rose-500'}`}
              />
            </div>
          </div>

          {/* Specific Stats */}
          <div className="space-y-1.5 text-xs text-slate-300 font-mono text-[11px]">
            {/* Resource Generator specific */}
            {(liveHovered.subType === BuildingType.GENERATOR || liveHovered.subType === BuildingType.EXTRACTOR) && (
              <>
                <div className="flex justify-between border-b border-slate-900/60 pb-1">
                  <span className="text-slate-500 font-semibold">UTILITY:</span>
                  <span className="text-emerald-400 font-bold">
                    {liveHovered.subType === BuildingType.GENERATOR ? '⚡ ENERGY SUPPLY' : '🛠️ METAL CORE'}
                  </span>
                </div>
                {!liveHovered.isUnderConstruction && (
                  <div className="flex justify-between border-b border-slate-900/60 pb-1">
                    <span className="text-slate-500 font-semibold">YIELD RATE:</span>
                    <span className="text-emerald-400 font-bold">
                      {liveHovered.subType === BuildingType.GENERATOR 
                        ? `+${RESOURCE_GENERATION_RATE.energy} Energy/s`
                        : `+${RESOURCE_GENERATION_RATE.metal} Metal/s`
                      }
                    </span>
                  </div>
                )}
              </>
            )}

            {/* Combat stats (Snipers, Soldiers, Tanks, and Defensive Laser Turrets) */}
            {(liveHovered.type === EntityType.UNIT || liveHovered.subType === BuildingType.TURRET) && (
              <>
                <div className="flex justify-between border-b border-slate-900/60 pb-1">
                  <span className="text-slate-500 font-semibold">DAMAGE:</span>
                  <span className="text-rose-400 font-bold">{liveHovered.attackDamage || (liveHovered.subType === BuildingType.TURRET ? 14 : 0)} Damage</span>
                </div>
                <div className="flex justify-between border-b border-slate-900/60 pb-1">
                  <span className="text-slate-500 font-semibold">ATTACK RATE:</span>
                  <span className="text-amber-400 font-bold">
                    {((1000 / (liveHovered.attackCooldown || (liveHovered.subType === BuildingType.TURRET ? 850 : 1000)))).toFixed(1)}/s
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-900/60 pb-1">
                  <span className="text-slate-500 font-semibold">FIRE RANGE:</span>
                  <span className="text-cyan-400 font-bold">{liveHovered.attackRange || (liveHovered.subType === BuildingType.TURRET ? 220 : 0)} px</span>
                </div>
                <div className="flex justify-between border-b border-slate-900/60 pb-1">
                  <span className="text-slate-500 font-semibold">EST. DPS:</span>
                  <span className="text-emerald-400 font-bold font-mono">
                    {(((liveHovered.attackDamage || (liveHovered.subType === BuildingType.TURRET ? 14 : 0)) * (1000 / (liveHovered.attackCooldown || (liveHovered.subType === BuildingType.TURRET ? 850 : 1000))))).toFixed(1)}
                  </span>
                </div>
              </>
            )}

            {/* General Queue / Progress representation */}
            {liveHovered.isUnderConstruction && (
              <div className="flex flex-col pt-1.5 space-y-1">
                <span className="text-yellow-500 font-bold uppercase tracking-wider text-[10px]">⚠️ UNDER CONSTRUCTION</span>
                <span className="text-slate-400">
                  Time left: {((liveHovered.constructionTimer) / 1000).toFixed(1)}s
                </span>
              </div>
            )}

            {/* Queue info */}
            {liveHovered.unitQueue && liveHovered.unitQueue.length > 0 && (
              <div className="flex flex-col pt-1.5 space-y-1">
                <span className="text-cyan-400 font-bold uppercase tracking-wider text-[10px]">🏭 ASSEMBLING INFANTRY</span>
                <div className="text-slate-400 text-[10px]">
                  <span>Next: {liveHovered.unitQueue[0]}</span>
                  <span className="ml-1">({((liveHovered.productionTimer) / 1000).toFixed(1)}s)</span>
                </div>
                <div className="text-slate-500 text-[8px] italic">
                  Queue size: {liveHovered.unitQueue.length} units
                </div>
              </div>
            )}

            {/* Unit speed and current action state */}
            {liveHovered.type === EntityType.UNIT && (
              <div className="flex justify-between border-b border-slate-900/60 pt-1 pb-1">
                <span className="text-slate-500 font-semibold">TACTICAL STATE:</span>
                <span className="text-slate-300 font-bold">{liveHovered.state}</span>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* GAME OVER MODAL */}
      {gameOverState.over && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-800 border-2 border-slate-600 p-8 rounded-xl text-center shadow-2xl">
                {gameOverState.win ? (
                    <>
                        <CheckCircle size={64} className="mx-auto text-emerald-400 mb-4 animate-bounce" />
                        <h2 className="text-4xl font-bold text-white mb-2">VICTORY</h2>
                        <p className="text-slate-300 mb-6 font-mono">Enemy base neutralized completely.</p>
                    </>
                ) : (
                    <>
                         <AlertTriangle size={64} className="mx-auto text-rose-500 mb-4 animate-pulse" />
                        <h2 className="text-4xl font-bold text-white mb-2">DEFEAT</h2>
                        <p className="text-slate-300 mb-6 font-mono">Your headquarters have been leveled.</p>
                    </>
                )}
                <button 
                    onClick={() => window.location.reload()}
                    className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 px-6 rounded transition font-mono uppercase tracking-wider shadow-lg"
                >
                    Rematch simulation
                </button>
            </div>
        </div>
      )}

      {/* COMBAT EVENTS LOGGER OVERLAY */}
      <CombatLog logs={combatLogs} />

      {/* TOP HUD */}
      <div className="absolute top-0 left-0 w-full h-18 bg-gradient-to-b from-slate-950/90 to-slate-950/0 flex items-center justify-between px-6 z-10 pointer-events-none">
        <div className="flex items-center space-x-6 pointer-events-auto mt-2">
           <h1 className="font-bold text-2xl tracking-widest text-cyan-400 drop-shadow-md select-none font-sans">RTS PRIME</h1>
           
           {/* Resources */}
           <div className="flex items-center space-x-3">
             <div className="flex flex-col bg-slate-900/90 backdrop-blur px-4 py-1.5 rounded-lg border border-slate-800 shadow-xl">
               <div className="flex items-center text-slate-300 text-xs uppercase tracking-wider font-semibold">
                 <span className="w-2 h-2 bg-cyan-400 rounded-full mr-2"></span>
                 Metal
               </div>
               <div className="flex items-end">
                   <span className="text-white font-mono text-lg font-bold">{Math.floor(resources.metal)}</span>
                   <span className="text-emerald-400 text-xs font-mono ml-2 mb-0.5 font-bold">+{income.metal}/s</span>
               </div>
             </div>
             
             <div className="flex flex-col bg-slate-900/90 backdrop-blur px-4 py-1.5 rounded-lg border border-slate-800 shadow-xl">
               <div className="flex items-center text-yellow-400 text-xs uppercase tracking-wider font-semibold">
                 <Zap size={11} className="mr-1 text-yellow-400" />
                 Energy
               </div>
               <div className="flex items-end">
                   <span className="text-white font-mono text-lg font-bold">{Math.floor(resources.energy)}</span>
                   <span className="text-yellow-500 text-xs font-mono ml-2 mb-0.5 font-bold">+{income.energy}/s</span>
               </div>
             </div>
           </div>
        </div>

        {/* Audio Mute & Guides */}
        <div className="flex items-center space-x-4 pointer-events-auto">
            <button 
                onClick={() => setIsMuted(prev => !prev)}
                className="mt-2 text-slate-400 hover:text-white bg-slate-900/90 hover:bg-slate-800 p-2.5 rounded-lg border border-slate-800 shadow-xl transition"
                title={isMuted ? "Unmute sound engine" : "Mute sound engine"}
            >
                {isMuted ? <VolumeX size={18} className="text-rose-500" /> : <Volume2 size={18} className="text-cyan-400" />}
            </button>
            <div className="mt-2 text-[11px] font-mono text-slate-400 bg-slate-950/80 px-4 py-2 border border-slate-800 rounded-lg shadow-xl uppercase tracking-wider">
                WASD: CAM | Left drag: select | Right click drag: line formation
            </div>
        </div>
      </div>

      {/* CANVAS */}
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className="cursor-crosshair block w-full h-full"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onContextMenu={handleContextMenu}
        onWheel={handleWheel}
      />

      {/* MINIMAP */}
      <div className="absolute bottom-36 right-6 w-48 h-48 bg-slate-950 border-2 border-slate-700 rounded-xl overflow-hidden shadow-2xl z-20 transition-all duration-300 hover:scale-105">
          <canvas 
            ref={minimapRef}
            width={200}
            height={200}
            className="w-full h-full cursor-pointer"
            onMouseDown={handleMinimapClick}
          />
          <div className="absolute bottom-1 left-2 text-[9px] font-mono text-slate-500 bg-black/60 px-1 rounded uppercase tracking-wider select-none pointer-events-none">MAP OVERVIEW</div>
      </div>

      {/* BOTTOM CONTROL PANEL */}
      <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-slate-950 to-slate-900 border-t border-slate-800 flex items-center justify-center z-10 px-8 space-x-8 shadow-2xl">
        
        {/* Buildings Group */}
        <div className="flex flex-col items-center">
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 mb-1.5 font-bold">Command Structures</span>
            <div className="flex space-x-1.5">
                <BuildButton 
                    label="Solar Gen" 
                    cost={BUILDING_STATS[BuildingType.GENERATOR].cost} 
                    icon={<Zap size={18} className="text-yellow-400" />} 
                    onClick={() => handlePlaceBuilding(BuildingType.GENERATOR)}
                    active={placementMode === BuildingType.GENERATOR}
                    disabled={resources.metal < BUILDING_STATS[BuildingType.GENERATOR].cost.metal || resources.energy < BUILDING_STATS[BuildingType.GENERATOR].cost.energy}
                    tooltip="Energy Generator"
                />
                <BuildButton 
                    label="Metal Ext" 
                    cost={BUILDING_STATS[BuildingType.EXTRACTOR].cost} 
                    icon={<Hammer size={18} className="text-cyan-400" />} 
                    onClick={() => handlePlaceBuilding(BuildingType.EXTRACTOR)}
                    active={placementMode === BuildingType.EXTRACTOR}
                    disabled={resources.metal < BUILDING_STATS[BuildingType.EXTRACTOR].cost.metal || resources.energy < BUILDING_STATS[BuildingType.EXTRACTOR].cost.energy}
                    tooltip="Metal Extraction Core"
                />
                <div className="w-1"></div>
                <BuildButton 
                    label="Inf Barracks" 
                    cost={BUILDING_STATS[BuildingType.BARRACKS_A].cost} 
                    icon={<Shield size={18} className="text-emerald-400" />} 
                    onClick={() => handlePlaceBuilding(BuildingType.BARRACKS_A)}
                    active={placementMode === BuildingType.BARRACKS_A}
                    disabled={resources.metal < BUILDING_STATS[BuildingType.BARRACKS_A].cost.metal || resources.energy < BUILDING_STATS[BuildingType.BARRACKS_A].cost.energy}
                    tooltip="Spawns basic soldiers"
                />
                <BuildButton 
                    label="Range Tech" 
                    cost={BUILDING_STATS[BuildingType.BARRACKS_B].cost} 
                    icon={<Crosshair size={18} className="text-rose-400" />} 
                    onClick={() => handlePlaceBuilding(BuildingType.BARRACKS_B)}
                    active={placementMode === BuildingType.BARRACKS_B}
                    disabled={resources.metal < BUILDING_STATS[BuildingType.BARRACKS_B].cost.metal || resources.energy < BUILDING_STATS[BuildingType.BARRACKS_B].cost.energy}
                    tooltip="Spawns high-range snipers"
                />
                 <BuildButton 
                    label="Armoury" 
                    cost={BUILDING_STATS[BuildingType.ARMOURY].cost} 
                    icon={<Menu size={18} className="text-amber-400" />} 
                    onClick={() => handlePlaceBuilding(BuildingType.ARMOURY)}
                    active={placementMode === BuildingType.ARMOURY}
                    disabled={resources.metal < BUILDING_STATS[BuildingType.ARMOURY].cost.metal || resources.energy < BUILDING_STATS[BuildingType.ARMOURY].cost.energy}
                    tooltip="Research global upgrades"
                />
                <BuildButton 
                    label="Laser Turret" 
                    cost={BUILDING_STATS[BuildingType.TURRET].cost} 
                    icon={<span className="font-bold text-sm text-cyan-400">⚡T</span>} 
                    onClick={() => handlePlaceBuilding(BuildingType.TURRET)}
                    active={placementMode === BuildingType.TURRET}
                    disabled={resources.metal < BUILDING_STATS[BuildingType.TURRET].cost.metal || resources.energy < BUILDING_STATS[BuildingType.TURRET].cost.energy}
                    tooltip="Defensive Tower. Shoots cyan laser bolts."
                />
            </div>
        </div>

        {/* Separator */}
        <div className="w-px h-16 bg-slate-800"></div>

        {/* Units Group - Permanent Automated Forces Factory Assembly Deck (Always visible!) */}
        <div className="flex flex-col items-center bg-slate-950/50 border border-slate-800/80 rounded-xl p-2 px-4 shadow-inner min-w-[360px] h-[92px] justify-center">
          <span className="text-[10px] uppercase font-mono tracking-wider text-cyan-400 mb-1.5 font-bold">Automated Forces Factory</span>
          <div className="flex flex-col space-y-1.5 w-full text-white">
            
            {/* Soldier (Pawn Melee) Target Row */}
            <div className="flex items-center justify-between space-x-2">
              <div className="flex flex-col items-start leading-none">
                <span className="text-[11px] font-bold text-slate-100 flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-0.5"></span>
                  Pawn (Melee)
                </span>
                <span className="text-[8px] text-slate-400 font-mono tracking-tighter mt-0.5">
                  Alive: {gameState.current.units.filter(u => u.team === Team.PLAYER && u.subType === UnitType.SOLDIER).length} | Q: {gameState.current.buildings.filter(b => b.team === Team.PLAYER && b.subType === BuildingType.BARRACKS_A).reduce((sum, b) => sum + (b.unitQueue ? b.unitQueue.filter(q => q === UnitType.SOLDIER).length : 0), 0)}
                </span>
              </div>
              
              <div className="flex items-center space-x-2">
                {/* Instant queue order manual buttons */}
                <button 
                  onClick={() => queueUnit(UnitType.SOLDIER)}
                  disabled={resources.metal < UNIT_STATS[UnitType.SOLDIER].cost.metal}
                  className="bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/35 hover:border-emerald-500/60 px-1.5 py-0.5 rounded text-[9px] font-bold font-mono transition text-emerald-300 disabled:opacity-20 disabled:pointer-events-none cursor-pointer"
                  title="Queue 1 Melee Soldier (+60M)"
                >
                  +1 Order
                </button>
                <div className="h-3.5 w-px bg-slate-800"></div>
                
                {/* Automation targets inputs */}
                <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Replenish Target:</span>
                <input 
                  type="number"
                  min="0"
                  max="50"
                  value={productionTargets[UnitType.SOLDIER] || 0}
                  onChange={(e) => {
                    const val = Math.max(0, parseInt(e.target.value) || 0);
                    setProductionTargets(prev => ({ ...prev, [UnitType.SOLDIER]: val }));
                  }}
                  className="w-10 bg-slate-900 border border-slate-700 px-1 py-0.5 rounded text-center text-[11px] font-mono text-emerald-400 font-bold focus:outline-none focus:border-cyan-500"
                />
                
                <div className="flex space-x-0.5 select-none text-[8px]">
                  <button 
                    onClick={() => {
                      setProductionTargets(prev => ({ ...prev, [UnitType.SOLDIER]: Math.max(0, (prev[UnitType.SOLDIER] || 0) + 5) }));
                    }}
                    className="bg-slate-800 hover:bg-slate-700 px-1 border border-slate-700 rounded text-slate-300 transition-colors font-mono font-bold"
                  >
                    +5
                  </button>
                  <button 
                    onClick={() => {
                      setProductionTargets(prev => ({ ...prev, [UnitType.SOLDIER]: Math.max(0, (prev[UnitType.SOLDIER] || 0) - 5) }));
                    }}
                    className="bg-slate-800 hover:bg-slate-700 px-1 border border-slate-700 rounded text-slate-300 transition-colors font-mono font-bold"
                  >
                    -5
                  </button>
                </div>
              </div>
            </div>

            {/* Sniper (Mace Ranged) Target Row */}
            <div className="flex items-center justify-between space-x-2">
              <div className="flex flex-col items-start leading-none">
                <span className="text-[11px] font-bold text-slate-100 flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-400 mr-0.5"></span>
                  Mace (Ranged)
                </span>
                <span className="text-[8px] text-slate-400 font-mono tracking-tighter mt-0.5">
                  Alive: {gameState.current.units.filter(u => u.team === Team.PLAYER && u.subType === UnitType.SNIPER).length} | Q: {gameState.current.buildings.filter(b => b.team === Team.PLAYER && b.subType === BuildingType.BARRACKS_B).reduce((sum, b) => sum + (b.unitQueue ? b.unitQueue.filter(q => q === UnitType.SNIPER).length : 0), 0)}
                </span>
              </div>
              
              <div className="flex items-center space-x-2">
                {/* Instant queue order manual buttons */}
                <button 
                  onClick={() => queueUnit(UnitType.SNIPER)}
                  disabled={resources.metal < UNIT_STATS[UnitType.SNIPER].cost.metal || resources.energy < UNIT_STATS[UnitType.SNIPER].cost.energy}
                  className="bg-rose-600/20 hover:bg-rose-600/40 border border-rose-500/35 hover:border-rose-500/60 px-1.5 py-0.5 rounded text-[9px] font-bold font-mono transition text-rose-300 disabled:opacity-20 disabled:pointer-events-none cursor-pointer"
                  title="Queue 1 Ranged Sniper (+110M/+50E)"
                >
                  +1 Order
                </button>
                <div className="h-3.5 w-px bg-slate-800"></div>
                
                {/* Automation targets inputs */}
                <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Replenish Target:</span>
                <input 
                  type="number"
                  min="0"
                  max="50"
                  value={productionTargets[UnitType.SNIPER] || 0}
                  onChange={(e) => {
                    const val = Math.max(0, parseInt(e.target.value) || 0);
                    setProductionTargets(prev => ({ ...prev, [UnitType.SNIPER]: val }));
                  }}
                  className="w-10 bg-slate-900 border border-slate-700 px-1 py-0.5 rounded text-center text-[11px] font-mono text-rose-400 font-bold focus:outline-none focus:border-cyan-500"
                />
                
                <div className="flex space-x-0.5 select-none text-[8px]">
                  <button 
                    onClick={() => {
                      setProductionTargets(prev => ({ ...prev, [UnitType.SNIPER]: Math.max(0, (prev[UnitType.SNIPER] || 0) + 5) }));
                    }}
                    className="bg-slate-800 hover:bg-slate-700 px-1 border border-slate-700 rounded text-slate-300 transition-colors font-mono font-bold"
                  >
                    +5
                  </button>
                  <button 
                    onClick={() => {
                      setProductionTargets(prev => ({ ...prev, [UnitType.SNIPER]: Math.max(0, (prev[UnitType.SNIPER] || 0) - 5) }));
                    }}
                    className="bg-slate-800 hover:bg-slate-700 px-1 border border-slate-700 rounded text-slate-300 transition-colors font-mono font-bold"
                  >
                    -5
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>

         {/* Upgrades Group */}
         <div className="flex flex-col items-center border-l border-slate-800 pl-8">
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 mb-1.5 font-bold">Research upgrade {upgrades.damageLevel}</span>
             <BuildButton 
                label="Global Upgrade" 
                cost={ARMOURY_UPGRADE_COST} 
                icon={<TrendingUp size={20} className="text-cyan-400" />} 
                onClick={buyUpgrade}
                disabled={resources.metal < ARMOURY_UPGRADE_COST.metal || resources.energy < ARMOURY_UPGRADE_COST.energy}
                compact
                tooltip="Increases health and damage stats of all units by 20%"
            />
         </div>

      </div>
    </div>
  );
}


