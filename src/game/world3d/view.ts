import { corpseBurst, tileRadiusOf } from "../render/corpseBurst";
import { curseCircle, curseLook } from "../render/curse";
import type { CharacterId } from "../render/hover";
import { LEVEL_UP, levelRing, levelUpLeft } from "../render/levelUp";
import type { ShownTownPortal } from "../render/townPortalLook";
import { type Area, type Placed, TOWN } from "../sim/area";
import type { ItemId } from "../sim/inventory";
import { minionRecoveryProgress, minionWindUpProgress } from "../sim/minions";
import { recoveryProgress, windUpProgress } from "../sim/monsters";
import { isLobbed } from "../sim/projectiles";
import { msToSteps, STEP_MS } from "../sim/units";
import type { Vec } from "../sim/vec";
import {
  burningCircles,
  CAST_STEPS,
  DEATH_STEPS,
  FLINCH_STEPS,
  HERO_FLINCH_STEPS,
  hasQuestToDeal,
  type Minion,
  type MinionId,
  type Monster,
  type MonsterId,
  npcsIn,
  OPENING_STEPS,
  type Swing,
  type World,
} from "../sim/world";
import { boneAltarTuning } from "../tuning/boneAltars";
import { inputTuning } from "../tuning/input";
import type { ItemType } from "../tuning/items";
import type { MinionType } from "../tuning/minions";
import { type MonsterType, monsterTuning } from "../tuning/monsters";
import type { ProjectileKind } from "../tuning/projectiles";
import { type Skill, skillTuning } from "../tuning/skills";
import { uniqueTuning } from "../tuning/uniqueMonsters";
import type { BoneAltarView } from "./boneAltarMeshes";
import type { BoneWallView } from "./boneWallMeshes";
import { ATTACK_CONTACT, type HeroClip } from "./clips";
import { type Crumble, crumbleOf } from "./crumble";
import { MINION_LOOKS } from "./minionLook";
import {
  MONSTER_DEATH_SECONDS,
  MONSTER_LOOKS,
  type MonsterClip,
} from "./monsterLook";
import { type Torch, torchesOf } from "./torches";

/**
 * What the Hero is doing, as the clip to show and how far into it: idle and
 * run loop, and `seconds` is the time the World has been running; the others
 * play once, scrubbed to `progress` (0..1) of their clip.
 */
export type HeroAnimation =
  | { clip: "idle" | "run"; seconds: number }
  | { clip: Exclude<HeroClip, "idle" | "run">; progress: number };

/** The Hero as the 3D World shows them. */
export type HeroView = {
  /** Interpolated, in tile units. */
  pos: Vec;
  /** Radians in tile space, as the World's `facing`. */
  facing: number;
  animation: HeroAnimation;
  /** How gold the Hero is washed after a Level-Up, 0..1. */
  glow: number;
  /** Whether the Hero is drawn: not on the Start Screen. */
  visible: boolean;
};

/** What a Monster is doing, as `HeroAnimation` says for the Hero. */
export type MonsterAnimation =
  | { clip: "idle" | "walk" | "run"; seconds: number }
  | { clip: Exclude<MonsterClip, "idle" | "walk" | "run">; progress: number };

/** A Monster, or the Corpse it left, as the 3D World shows it. */
export type MonsterView = {
  id: MonsterId;
  type: MonsterType;
  /** Interpolated, in tile units. */
  pos: Vec;
  /** Radians in tile space; null for a Corpse, which lies as it last stood. */
  facing: number | null;
  animation: MonsterAnimation;
  /** How white a hit Monster is washed, 0..1. */
  flash: number;
  corpse: boolean;
  /** Whether it has flared up, as Grave Wockington does past half his Life. */
  flared: boolean;
  /** Times its type's own scale: a Unique Monster's, else 1. */
  scale: number;
  /** Whether it is outlined as hovered or targeted. */
  highlighted: boolean;
};

/** One of the Hero's Minions as the 3D World shows it. */
export type MinionView = {
  id: MinionId;
  type: MinionType;
  /** Interpolated, in tile units. */
  pos: Vec;
  /** Radians in tile space. */
  facing: number;
  animation: MonsterAnimation;
  /** Whether it is outlined as hovered. */
  highlighted: boolean;
  /** How small it has shrunk and how far it has sunk: whole when alive. */
  crumble: Crumble;
};

/** One of Town's NPCs as the 3D World shows it. */
export type NpcView = {
  /** Its place in the Area's NPCs, which keeps its actor. */
  id: number;
  name: string;
  /** In tile units. */
  pos: Vec;
  /** Radians in tile space: towards a Hero who is near, else the camera. */
  facing: number;
  animation: MonsterAnimation;
  highlighted: false;
  /** Whether a Quest mark floats over its head: a Quest to give or take back. */
  questMark: boolean;
};

/** An Exit out of the Area: a zone of tiles, leading to the Area `to`. */
export type ExitView = {
  x: number;
  y: number;
  width: number;
  height: number;
  to: string;
};

/** A lantern standing in Town, which gives light like a torch. */
export type Lamp = { pos: Vec };

/**
 * What the 3D World shows that the World doesn't hold, because it lasts
 * milliseconds rather than steps: kept by the renderer from the events.
 */
export type Effects = {
  /** The flash strength (0..1) of each Monster just hit. */
  flashes: ReadonlyMap<MonsterId, number>;
  /** How long ago (ms) each Monster just killed died; others lie still. */
  deadForMs: ReadonlyMap<MonsterId, number>;
  /** How long ago (ms) each Monster just raised a wave; others have not. */
  casts: ReadonlyMap<MonsterId, number>;
  /** The Town Portal ends of the Area, bursting open, standing or closing. */
  portals: ShownTownPortal[];
  /** The Corpse bursts so far, with how long ago each began. */
  bursts: AgedCircle[];
  /** The Curses cast so far, with how long ago each was cast. */
  curses: (AgedCircle & { skill: Skill })[];
  /** How long ago (ms) the Hero reached a Level, if the ring may still show. */
  levelUpAgoMs: number | null;
  /**
   * The Minions that died or were replaced a moment ago and are crumbling
   * where they stood. The World forgets a Minion the step it leaves, so the
   * renderer keeps just these, from the events.
   */
  departedMinions: DepartedMinion[];
};

/** A Minion that left the World `ageMs` ago, as it last stood. */
export type DepartedMinion = {
  id: MinionId;
  type: MinionType;
  /** In tile units. */
  pos: Vec;
  /** Radians in tile space. */
  facing: number;
  ageMs: number;
};

/** A circle of `radius` tiles on the floor at `pos`, `ageMs` into its play. */
export type AgedCircle = { pos: Vec; radius: number; ageMs: number };

/** A melee Monster's wind-up on the floor: its reach and arc, filling. */
export type TelegraphView = {
  /** Interpolated, in tile units. */
  pos: Vec;
  /** Radians in tile space. */
  facing: number;
  /** In tiles. */
  reach: number;
  /** Half the wedge's angle, in radians. */
  arc: number;
  /** How far the wind-up has filled the wedge, 0..1. */
  progress: number;
};

/** A ring or disc flat on the floor, in tiles, and how opaque it is. */
export type FloorCircle = { radius: number; alpha: number };

/** What the World draws flat on the floor, apart from its pieces. */
export type FloorEffectsView = {
  telegraphs: TelegraphView[];
  curses: (FloorCircle & { pos: Vec; colour: number })[];
  /** Where each Muck in flight will land, from loosing until it does. */
  marks: LandingMarkView[];
  /** Each burning circle Gravefire left, from landing until it burns out. */
  burns: BurnView[];
  /** A flash disc and a spreading ring round a burst Corpse. */
  bursts: { pos: Vec; flash: FloorCircle; ring: FloorCircle }[];
  /** The gold ring round the Hero's feet on a Level-Up. */
  levelRing: (FloorCircle & { pos: Vec }) | null;
};

/** A Projectile in flight as the 3D World shows it. */
export type ProjectileView = {
  kind: ProjectileKind;
  /** Interpolated, in tile units. */
  pos: Vec;
  /** The way it flies, radians in tile space. */
  facing: number;
  /** How far above its flying height it is on its arc, in tiles; 0 if straight. */
  lift: number;
};

/** The highest a lobbed Projectile's arc rises above its flying height (tiles). */
export const LOB_ARC_HEIGHT = 2;

/** The mark a lobbed Projectile (Muck) will land on, drawn on the ground. */
export type LandingMarkView = {
  /** What was lobbed, which sets the mark's colour. */
  kind: ProjectileKind;
  /** Where it will land, in tile units. */
  pos: Vec;
  /** The circle it hits within (tiles). */
  radius: number;
  /** How far the Projectile is along its arc, 0..1. */
  progress: number;
};

/** A burning circle on the ground as the 3D World shows it. */
export type BurnView = {
  pos: Vec;
  /** The circle it burns within (tiles). */
  radius: number;
  /** How much of its burn is left, 1 when it lands to 0 when it is out. */
  left: number;
};

/** A Ground Item lying on the floor as the 3D World shows it. */
export type GroundItemView = { id: ItemId; type: ItemType; pos: Vec };

/** A Gold Pile lying on the floor as the 3D World shows it. */
export type GoldPileView = { id: number; amount: number; pos: Vec };

/** The click marker on the floor, `progress` of the way through its life. */
export type ClickMarkerView = { at: Vec; progress: number };

/** What the pointer shows in the World. */
export type PointerState = {
  /** The last click on the floor and how long ago it was. */
  click: { at: Vec; ageMs: number } | null;
  /** The Monster or Minion to outline: the hovered one, else the Target. */
  highlight: CharacterId | null;
};

/** Everything the 3D World shows, as plain data. */
export type WorldView = {
  hero: HeroView;
  /** The living Monsters, then the Corpses. */
  monsters: MonsterView[];
  /** The Hero's living Minions, then those crumbling away. */
  minions: MinionView[];
  /** The Area's NPCs: Town's. */
  npcs: NpcView[];
  /** The Town Portal ends in the Area. */
  townPortals: ShownTownPortal[];
  /** The Bone Altars still standing in the Area. */
  boneAltars: BoneAltarView[];
  /** The Bone Wall pieces standing in the Area. */
  boneWalls: BoneWallView[];
  /** The Exits out of the Area. */
  exits: ExitView[];
  projectiles: ProjectileView[];
  groundItems: GroundItemView[];
  goldPiles: GoldPileView[];
  clickMarker: ClickMarkerView | null;
  /**
   * The Area's Walls drawn lowered to stubs, so they don't hide the Hero:
   * indices into its `walls`, ascending.
   */
  loweredWalls: number[];
  /**
   * The torches on the Area's Walls. A torch is lit unless its Wall is
   * lowered; the scene gives its light to the lit ones nearest the Hero.
   */
  torches: (Torch & { lit: boolean })[];
  /** The Area's standing lanterns, each lit all the time. */
  lamps: Lamp[];
  /**
   * Whether the Area is an indoor Combat Area, which has embers, a vignette
   * and a dark mood; Town and outdoor Areas are lit by day.
   */
  combat: boolean;
  floorEffects: FloorEffectsView;
};

/** An Area's torches, worked out once. */
const torchCache = new WeakMap<Area, Torch[]>();

/** The piece of Town's standing lanterns. */
const LANTERN_PIECE = "halloween/lantern_standing";

/** How close the Hero must be (tiles) for an NPC to turn to them. */
const NPC_NOTICE = 4;

/** The way an NPC faces by default: down the camera's line of sight. */
const TOWARDS_CAMERA = Math.PI / 4;

const lampCache = new WeakMap<Area, Lamp[]>();

function lampsIn(area: Area): Lamp[] {
  let lamps = lampCache.get(area);
  if (!lamps) {
    lamps = area.props
      .filter((prop) => prop.piece === LANTERN_PIECE)
      .map((prop) => ({ pos: { x: prop.x + 0.5, y: prop.y + 0.5 } }));
    lampCache.set(area, lamps);
  }
  return lamps;
}

function torchesIn(area: Area): Torch[] {
  let torches = torchCache.get(area);
  if (!torches) {
    torches = torchesOf(area);
    torchCache.set(area, torches);
  }
  return torches;
}

/**
 * The Walls between the camera and the Hero: those a few tiles on the
 * camera's side of the Hero's tile, in a band across the screen. The camera
 * looks from tile +x +y, so "nearer the camera" is a greater x + y.
 */
function loweredWallsOf(walls: Placed[], hero: Vec): number[] {
  const hx = Math.floor(hero.x) + 0.5;
  const hy = Math.floor(hero.y) + 0.5;
  const lowered: number[] = [];
  walls.forEach((wall, i) => {
    const dx = wall.x + 0.5 - hx;
    const dy = wall.y + 0.5 - hy;
    const nearer = dx + dy;
    if (nearer > 0.5 && nearer < 7 && Math.abs(dx - dy) < 5) lowered.push(i);
  });
  return lowered;
}

/**
 * What the 3D World shows of `world`, `alpha` (0..1) of the way from the
 * previous step to the current one, and of the pointer. A pure function of
 * them: the three.js layer applies it to the scene and holds no game logic.
 */
export function worldViewOf(
  world: World,
  alpha: number,
  pointer: PointerState,
  effects: Effects = {
    flashes: new Map(),
    deadForMs: new Map(),
    casts: new Map(),
    portals: [],
    bursts: [],
    curses: [],
    levelUpAgoMs: null,
    departedMinions: [],
  },
): WorldView {
  const { hero } = world;
  const pos = {
    x: hero.prevPos.x + (hero.pos.x - hero.prevPos.x) * alpha,
    y: hero.prevPos.y + (hero.pos.y - hero.prevPos.y) * alpha,
  };
  const area = world.areas[world.areaName];
  const loweredWalls = loweredWallsOf(area.walls, pos);
  return {
    hero: {
      pos,
      facing: hero.facing,
      animation: heroAnimationOf(world),
      glow: heroGlowOf(effects),
      visible: true,
    },
    monsters: [
      ...world.monsters.map((monster) =>
        monsterViewOf(world, monster, alpha, effects, pointer.highlight),
      ),
      ...world.corpses.map(
        (corpse): MonsterView => ({
          id: corpse.id,
          type: corpse.type,
          pos: corpse.pos,
          facing: null,
          animation: corpseAnimationOf(effects.deadForMs.get(corpse.id)),
          flash: 0,
          corpse: true,
          flared: false,
          scale: 1,
          highlighted: false,
        }),
      ),
    ],
    minions: [
      ...world.minions.map((minion) =>
        minionViewOf(world, minion, alpha, pointer.highlight),
      ),
      ...effects.departedMinions.map((minion) =>
        crumblingMinionOf(world, minion),
      ),
    ],
    npcs: npcsIn(world).map((npc): NpcView => {
      const { id } = npc;
      const apart = Math.hypot(pos.x - npc.pos.x, pos.y - npc.pos.y);
      return {
        id,
        name: npc.name,
        pos: npc.pos,
        facing:
          apart <= NPC_NOTICE
            ? Math.atan2(pos.y - npc.pos.y, pos.x - npc.pos.x)
            : TOWARDS_CAMERA,
        animation: { clip: "idle", seconds: (world.tick * STEP_MS) / 1000 },
        highlighted: false,
        questMark: hasQuestToDeal(world, id),
      };
    }),
    townPortals: effects.portals,
    boneAltars: world.boneAltars.map((altar) => ({
      id: altar.id,
      pos: altar.pos,
      fraction: altar.life / boneAltarTuning.life,
    })),
    boneWalls: world.boneWalls.map((piece) => ({
      id: piece.id,
      pos: piece.pos,
      fraction: piece.life / boneWallLife(),
      sunk: Math.max(0, 1 - piece.left / BONE_WALL_SINK_STEPS),
    })),
    exits: area.exits.map(({ x, y, width, height, area: to }) => ({
      x,
      y,
      width,
      height,
      to,
    })),
    projectiles: world.projectiles.map((projectile) => ({
      kind: projectile.kind,
      pos: {
        x:
          projectile.prevPos.x +
          (projectile.pos.x - projectile.prevPos.x) * alpha,
        y:
          projectile.prevPos.y +
          (projectile.pos.y - projectile.prevPos.y) * alpha,
      },
      facing: Math.atan2(projectile.direction.y, projectile.direction.x),
      lift: isLobbed(projectile)
        ? LOB_ARC_HEIGHT * Math.sin(Math.PI * projectile.progress)
        : 0,
    })),
    groundItems: world.groundItems.map(({ item, pos }) => ({
      id: item.id,
      type: item.type,
      pos: { ...pos },
    })),
    goldPiles: world.goldPiles.map(({ id, amount, pos }) => ({
      id,
      amount,
      pos: { ...pos },
    })),
    clickMarker: clickMarkerOf(pointer.click),
    loweredWalls,
    torches: torchesIn(area).map((torch) => ({
      ...torch,
      lit: !loweredWalls.includes(torch.wall),
    })),
    lamps: lampsIn(area),
    combat: world.areaName !== TOWN && !area.outdoors,
    floorEffects: floorEffectsOf(world, alpha, effects, pos),
  };
}

/** The wedges, circles and rings on the floor. */
function floorEffectsOf(
  world: World,
  alpha: number,
  effects: Effects,
  heroPos: Vec,
): FloorEffectsView {
  const telegraphs: TelegraphView[] = [];
  for (const monster of world.monsters) {
    const { attack } = monsterTuning[monster.type];
    // A ranged attack has no reach to show: the drawn bow is the tell. A
    // swing by one that also casts does.
    if (monster.state !== "windup") continue;
    const swing =
      attack.kind === "melee"
        ? attack
        : monster.swinging && attack.melee
          ? { ...attack.melee, slam: undefined }
          : null;
    if (!swing) continue;
    telegraphs.push({
      pos: {
        x: monster.prevPos.x + (monster.pos.x - monster.prevPos.x) * alpha,
        y: monster.prevPos.y + (monster.pos.y - monster.prevPos.y) * alpha,
      },
      facing: monster.facing,
      // A Slam fills the whole circle it hits within.
      reach: swing.slam ? swing.slam.radius : swing.reach,
      arc: swing.slam ? Math.PI : (swing.arcDegrees * Math.PI) / 180,
      progress: windUpProgress(monster),
    });
  }
  const curses: FloorEffectsView["curses"] = [];
  for (const { pos, radius, ageMs, skill } of effects.curses) {
    const circle = curseCircle(ageMs, radius);
    if (circle) {
      const { circle: colour } = curseLook(skill);
      curses.push({ pos, radius, alpha: circle.alpha, colour });
    }
  }
  const bursts: FloorEffectsView["bursts"] = [];
  for (const { pos, radius, ageMs } of effects.bursts) {
    const burst = corpseBurst(ageMs, radius);
    if (!burst) continue;
    bursts.push({
      pos,
      flash: { radius: tileRadiusOf(burst.flash), alpha: burst.flash.alpha },
      ring: { radius: tileRadiusOf(burst.ring), alpha: burst.ring.alpha },
    });
  }
  const ring =
    effects.levelUpAgoMs === null ? null : levelRing(effects.levelUpAgoMs);
  const marks: LandingMarkView[] = world.projectiles
    .filter(isLobbed)
    .map(({ kind, landing, radius, progress }) => ({
      kind,
      pos: { ...landing },
      radius,
      progress,
    }));
  const burns: BurnView[] = burningCircles(world).map(
    ({ pos, radius, leftMs, lengthMs }) => ({
      pos,
      radius,
      left: leftMs / lengthMs,
    }),
  );
  return {
    telegraphs,
    curses,
    marks,
    burns,
    bursts,
    levelRing: ring && { pos: heroPos, ...ring },
  };
}

/** The Hero's gold wash: the Level-Up's strength, fading out like its ring. */
function heroGlowOf(effects: Effects): number {
  if (effects.levelUpAgoMs === null) return 0;
  return LEVEL_UP.strength * Math.max(0, levelUpLeft(effects.levelUpAgoMs));
}

/** A Corpse's fall: `ms` into it if it just died, else it lies still. */
function corpseAnimationOf(ms: number | undefined): MonsterAnimation {
  const progress =
    ms === undefined ? 1 : Math.min(1, ms / 1000 / MONSTER_DEATH_SECONDS);
  return { clip: "death", progress };
}

/** How long (ms) a Monster's cast clip plays when it raises a wave. */
const CAST_MS = 1200;

/** A living Monster as shown: its animation chosen by its state. */
function monsterViewOf(
  world: World,
  monster: Monster,
  alpha: number,
  effects: Effects,
  highlight: CharacterId | null,
): MonsterView {
  const look = MONSTER_LOOKS[monster.type];
  // One that casts its ranged attack plays its Spellcast clip for it, but not
  // for its swing.
  const casting = look.clips.lob !== undefined && !monster.swinging;
  const contact = casting ? (look.lobContact ?? look.contact) : look.contact;
  const attackClip = casting ? "lob" : "attack";
  const castAgo = effects.casts.get(monster.id);
  const moving =
    monster.pos.x !== monster.prevPos.x || monster.pos.y !== monster.prevPos.y;
  let animation: MonsterAnimation;
  if (monster.state === "windup") {
    // A flinch doesn't stop a wind-up, so it shows over one.
    animation = {
      clip: attackClip,
      progress: windUpProgress(monster) * contact,
    };
  } else if (monster.flinch > 0) {
    animation = {
      clip: "flinch",
      progress:
        (FLINCH_STEPS[monster.type] - monster.flinch) /
        FLINCH_STEPS[monster.type],
    };
  } else if (monster.state === "recover") {
    animation = {
      clip: attackClip,
      progress: contact + recoveryProgress(monster) * (1 - contact),
    };
  } else if (castAgo !== undefined && castAgo < CAST_MS) {
    animation = { clip: "cast", progress: castAgo / CAST_MS };
  } else {
    const seconds = (world.tick * STEP_MS) / 1000;
    const clip = !moving
      ? "idle"
      : monster.state === "chase" || monster.state === "flee"
        ? "run"
        : "walk";
    animation = { clip, seconds };
  }
  return {
    id: monster.id,
    type: monster.type,
    pos: {
      x: monster.prevPos.x + (monster.pos.x - monster.prevPos.x) * alpha,
      y: monster.prevPos.y + (monster.pos.y - monster.prevPos.y) * alpha,
    },
    facing: monster.facing,
    animation,
    flash: effects.flashes.get(monster.id) ?? 0,
    corpse: false,
    flared: (monster.waves?.stage ?? 0) > 0,
    scale: monster.unique === null ? 1 : uniqueTuning.scale,
    highlighted: highlight === monster.id,
  };
}

/** A Minion as shown: its animation chosen by its state, as a Monster's. */
function minionViewOf(
  world: World,
  minion: Minion,
  alpha: number,
  highlight: CharacterId | null,
): MinionView {
  const { contact } = MINION_LOOKS[minion.type];
  const moving =
    minion.pos.x !== minion.prevPos.x || minion.pos.y !== minion.prevPos.y;
  let animation: MonsterAnimation;
  if (minion.state === "windup") {
    animation = {
      clip: "attack",
      progress: minionWindUpProgress(minion) * contact,
    };
  } else if (minion.state === "recover") {
    animation = {
      clip: "attack",
      progress: contact + minionRecoveryProgress(minion) * (1 - contact),
    };
  } else {
    const seconds = (world.tick * STEP_MS) / 1000;
    const clip = !moving ? "idle" : minion.state === "chase" ? "run" : "walk";
    animation = { clip, seconds };
  }
  return {
    id: minion.id,
    type: minion.type,
    pos: {
      x: minion.prevPos.x + (minion.pos.x - minion.prevPos.x) * alpha,
      y: minion.prevPos.y + (minion.pos.y - minion.prevPos.y) * alpha,
    },
    facing: minion.facing,
    animation,
    highlighted:
      typeof highlight === "object" &&
      highlight !== null &&
      highlight.minion === minion.id,
    crumble: crumbleOf(0),
  };
}

/** A Minion that left the World, standing idle where it fell as it crumbles. */
function crumblingMinionOf(world: World, minion: DepartedMinion): MinionView {
  return {
    id: minion.id,
    type: minion.type,
    pos: minion.pos,
    facing: minion.facing,
    animation: { clip: "idle", seconds: (world.tick * STEP_MS) / 1000 },
    highlighted: false,
    crumble: crumbleOf(minion.ageMs / 1000),
  };
}

/** The Hero's animation, the World's state deciding which. */
function heroAnimationOf(world: World): HeroAnimation {
  const { hero, death } = world;
  if (death) {
    return {
      clip: "death",
      progress: Math.min(1, death.elapsed / DEATH_STEPS),
    };
  }
  if (hero.swing) {
    return { clip: "swing", progress: swingProgress(hero.swing) };
  }
  if (hero.cast) {
    return {
      clip: "cast",
      progress: hero.cast.elapsed / CAST_STEPS[hero.cast.skill],
    };
  }
  if (hero.opening) {
    return { clip: "cast", progress: hero.opening.elapsed / OPENING_STEPS };
  }
  if (hero.flinch > 0) {
    return {
      clip: "flinch",
      progress: (HERO_FLINCH_STEPS - hero.flinch) / HERO_FLINCH_STEPS,
    };
  }
  const moving = hero.pos.x !== hero.prevPos.x || hero.pos.y !== hero.prevPos.y;
  return {
    clip: moving ? "run" : "idle",
    seconds: (world.tick * STEP_MS) / 1000,
  };
}

/**
 * How far through the attack clip a swing `elapsed` steps in is: the clip's
 * contact frame falls on the step the hit lands, the rest of the clip on the
 * steps after it.
 */
function swingProgress({ elapsed, steps, hitStep }: Swing): number {
  if (elapsed <= hitStep) return (elapsed / hitStep) * ATTACK_CONTACT;
  return (
    ATTACK_CONTACT +
    ((elapsed - hitStep) / (steps - hitStep)) * (1 - ATTACK_CONTACT)
  );
}

/** The click marker `click` makes, fading out over the tuned time. */
function clickMarkerOf(click: PointerState["click"]): ClickMarkerView | null {
  if (!click) return null;
  const progress = click.ageMs / inputTuning.clickMarkerMs;
  return progress < 1 ? { at: click.at, progress } : null;
}

/** How long a Bone Wall piece sinks away as it crumbles (steps). */
const BONE_WALL_SINK_STEPS = msToSteps(400);

/** The Life a fresh Bone Wall piece has. */
function boneWallLife(): number {
  const { effect } = skillTuning.boneWall;
  return effect.type === "wall" ? effect.pieceLife : 1;
}
