import {
  ACESFilmicToneMapping,
  Color,
  Group,
  type Object3D,
  OrthographicCamera,
  Scene,
  Vector2,
  WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Area } from "../sim/area";
import { type Atmosphere, createAtmosphere, driftEmbers } from "./atmosphere";
import { type BoneAltarMeshes, boneAltarMeshesOf } from "./boneAltarMeshes";
import { type BoneWallMeshes, boneWallMeshesOf } from "./boneWallMeshes";
import { placeCamera, type WorldCamera } from "./camera";
import { type ExitMeshes, exitMeshesOf } from "./exitMeshes";
import {
  FLOOR_MIX,
  type FloorPieces,
  floorOf,
  GRASS_FLOOR,
  PIECE_SCALE,
  TOWN_FLOOR,
} from "./floor";
import {
  type FloorEffectMeshes,
  floorEffectMeshesOf,
} from "./floorEffectMeshes";
import { floorPiecesOf } from "./floorPieces";
import { type HeroActor, heroActorOf, poseHero } from "./heroActor";
import { createLighting, type Lighting, lightScene } from "./lighting";
import {
  GEM,
  goldPlacement,
  groundPlacement,
  LOOT_MODELS,
  type Placement,
  projectilePlacements,
} from "./lootLook";
import { type Instances, instancesOf, outlineInstances } from "./lootMeshes";
import { createMarkers, type Markers, showMarkers } from "./markers";
import { mergeSkinned } from "./mergeSkinned";
import { MINION_LOOKS } from "./minionLook";
import {
  type MonsterActor,
  type MonsterModels,
  monsterActorOf,
  poseMonster,
} from "./monsterActor";
import { MONSTER_LOOKS } from "./monsterLook";
import { NPC_LOOKS } from "./npcLook";
import { propMeshesOf, scaleOf } from "./propMeshes";
import type { SharedCanvas } from "./sharedCanvas";
import { lookOf, outline, toonShade } from "./toon";
import { type TorchMeshes, torchMeshesOf } from "./torchMeshes";
import { type TownPortalMeshes, townPortalMeshesOf } from "./townPortalMesh";
import type { WorldView } from "./view";
import { type WallMeshes, wallMeshesOf } from "./wallMeshes";
import { wallPlacementsOf } from "./walls";
import { type WaterMeshes, waterMeshesOf } from "./waterMeshes";

/**
 * The 3D World's three.js side. Its renderer draws on the canvas and the
 * WebGL context Pixi shares to draw the HUD on top (ADR 0004).
 */
export type World3d = {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: OrthographicCamera;
  markers: Markers;
  lighting: Lighting;
  atmosphere: Atmosphere;
  /** The Town Portal ends, drawn as gateways. */
  townPortals: TownPortalMeshes;
  /** The Bone Altars standing in the Area. */
  boneAltars: BoneAltarMeshes;
  boneWalls: BoneWallMeshes;
  /** Telegraphs, Curses, Corpse bursts and the Level-Up ring on the floor. */
  floorEffects: FloorEffectMeshes;
  /** Set once `loadModels` is done. */
  models: Models | null;
  /** The Area whose floor, Walls and Props are in the scene, if any. */
  shown: {
    area: Area;
    floor: Group;
    /** The Area's ponds, one shimmering plane each. */
    water: WaterMeshes;
    /** The ways out of the Area, glowing. */
    exits: ExitMeshes;
    /** Null until the pieces the Area's Walls and Props use are loaded. */
    scenery: {
      walls: WallMeshes;
      props: Group;
      torches: TorchMeshes;
    } | null;
  } | null;
  /** The Monsters and Corpses in the scene, by id. */
  monsters: Map<number, MonsterActor>;
  /** The Minions in the scene, by id. */
  minions: Map<number, MonsterActor>;
  /** Town's NPCs in the scene, by their place in the Area's NPCs. */
  npcs: Map<string, MonsterActor>;
  /** The Wall and Prop pieces loaded so far, by piece name. */
  pieces: Record<string, Object3D | undefined>;
  /** The pieces asked for, so each is loaded once. */
  loading: Set<string>;
  /** When the last frame was drawn (ms), for easing. */
  drawnAtMs: number | null;
};

/** What the 3D World is made of, loaded. */
type Models = {
  hero: HeroActor;
  /** The floor pieces an Area is drawn with, in its look. */
  floorPiecesFor: (area: Area) => FloorPieces;
  monsters: MonsterModels;
  /** Ground Items and Projectiles, one instanced draw per model. */
  loot: Record<string, Instances>;
};

/** Where `import:kaykit` puts the models, served from `public/`. */
const MODELS = "/assets/models";

/** The dark the 3D World is drawn on. */
const BACKGROUND = 0x07060b;

/** The torch's model, which hangs on Walls. */
const TORCH_PIECE = "dungeon/torch_mounted";

/** How wide the outlines on Walls and Props are, in tiles. */
const OUTLINE = 0.02;

/** Creates the 3D World's renderer, its canvas and an empty scene. */
export function createWorld3d(shared: SharedCanvas): World3d {
  // Draws on the canvas and context Pixi already draws the HUD on.
  const renderer = new WebGLRenderer({
    canvas: shared.canvas,
    context: shared.context,
  });
  renderer.toneMapping = ACESFilmicToneMapping;
  // The vignette draws over the World, so each frame clears by hand.
  renderer.autoClear = false;
  renderer.info.autoReset = false;
  const scene = new Scene();
  scene.background = new Color(BACKGROUND);
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  // All the lights exist from the start and only move, so no shader ever
  // recompiles for a light that came or went.
  const lighting = createLighting(scene);
  const atmosphere = createAtmosphere();
  scene.add(atmosphere.embers);
  const markers = createMarkers();
  scene.add(markers.click);
  const townPortals = townPortalMeshesOf();
  scene.add(townPortals.group);
  const boneAltars = boneAltarMeshesOf();
  scene.add(boneAltars.group);
  const boneWalls = boneWallMeshesOf();
  scene.add(boneWalls.group);
  const floorEffects = floorEffectMeshesOf();
  scene.add(floorEffects.group);
  return {
    renderer,
    scene,
    camera,
    markers,
    lighting,
    atmosphere,
    townPortals,
    boneAltars,
    boneWalls,
    floorEffects,
    models: null,
    monsters: new Map(),
    minions: new Map(),
    npcs: new Map(),
    shown: null,
    pieces: {},
    loading: new Set(),
    drawnAtMs: null,
  };
}

/** How far loading has got: files loaded out of all of them. */
export type LoadProgress = { loaded: number; total: number };

/**
 * Loads the models into the scene: the Hero, and the pieces of the floor,
 * plus the Walls and Props pieces `town` uses, so its first frame is built
 * whole. Calls `onProgress` as each file arrives. Rejects if any file
 * won't load, leaving the scene as it was, so it can be called again.
 */
export async function loadModels(
  world3d: World3d,
  town: Area,
  onProgress: (progress: LoadProgress) => void,
) {
  const loader = new GLTFLoader();
  const monsterFiles = [
    ...new Set(
      [
        ...Object.values(MONSTER_LOOKS),
        ...Object.values(MINION_LOOKS),
        ...Object.values(NPC_LOOKS),
      ].flatMap((look) => [
        look.model,
        ...look.weapons.map((weapon) => weapon.model),
      ]),
    ),
  ];
  const floorNames = [
    ...Object.values(FLOOR_MIX),
    ...TOWN_FLOOR,
    ...GRASS_FLOOR,
  ];
  const pieceNames = sceneryPiecesOf(town).filter(
    (name) => !world3d.pieces[name],
  );
  const total =
    1 +
    floorNames.length +
    monsterFiles.length +
    LOOT_MODELS.length +
    pieceNames.length;
  let loaded = 0;
  onProgress({ loaded, total });
  const load = async (path: string) => {
    const gltf = await loader.loadAsync(`${MODELS}/${path}.glb`);
    loaded += 1;
    onProgress({ loaded, total });
    return gltf;
  };
  const [knight, ...rest] = await Promise.all([
    load("characters/Knight"),
    ...floorNames.map((name) => load(name)),
    ...monsterFiles.map((file) => load(`characters/${file}`)),
    ...LOOT_MODELS.map((file) => load(file)),
    ...pieceNames.map((name) => load(name)),
  ]);
  const floorGltfs = rest.slice(0, floorNames.length);
  const monsterGltfs = rest.slice(
    floorNames.length,
    floorNames.length + monsterFiles.length,
  );
  const lootStart = floorNames.length + monsterFiles.length;
  const lootGltfs = rest.slice(lootStart, lootStart + LOOT_MODELS.length);
  const pieceGltfs = rest.slice(lootStart + LOOT_MODELS.length);
  pieceNames.forEach((name, i) => {
    toonShade(pieceGltfs[i].scene, lookOf(name));
    world3d.pieces[name] = pieceGltfs[i].scene;
  });
  const monsters: MonsterModels = {};
  monsterFiles.forEach((file, i) => {
    monsters[file] = monsterGltfs[i];
    // A draw call for a body rather than for each limb.
    mergeSkinned(monsterGltfs[i].scene);
  });
  const floorScenes: FloorPieces = {};
  floorNames.forEach((name, i) => {
    floorScenes[name] = floorGltfs[i].scene;
  });
  const floorPiecesFor = floorPiecesOf(floorScenes);
  const hero = heroActorOf(knight);
  world3d.scene.add(hero.root);
  const loot: Record<string, Instances> = {};
  [GEM, ...LOOT_MODELS].forEach((file, i) => {
    const instances = instancesOf(
      file,
      i === 0 ? null : lootGltfs[i - 1].scene,
    );
    outlineInstances(instances, 0.4);
    loot[file] = instances;
    world3d.scene.add(instances.group);
  });
  world3d.models = { hero, floorPiecesFor, monsters, loot };
}

/** Puts `area`'s floor in the scene in place of the last Area's. */
function showFloor(world3d: World3d, area: Area) {
  if (world3d.shown?.area === area || !world3d.models) return;
  const { shown, scene } = world3d;
  if (shown) {
    scene.remove(shown.floor, shown.water.group, shown.exits.group);
    if (shown.scenery) {
      scene.remove(
        shown.scenery.walls.group,
        shown.scenery.props,
        shown.scenery.torches.group,
      );
    }
  }
  const floor = floorOf(area, world3d.models.floorPiecesFor(area));
  const exits = exitMeshesOf(
    area.exits.map(({ x, y, width, height, area: to }) => ({
      x,
      y,
      width,
      height,
      to,
    })),
    area.waypoint,
  );
  const water = waterMeshesOf(area);
  scene.add(floor, water.group, exits.group);
  world3d.shown = { area, floor, water, exits, scenery: null };
}

/** The pieces `area`'s Walls, Props and torches are made of. */
function sceneryPiecesOf(area: Area, torches = true): string[] {
  return [
    ...new Set([
      ...wallPlacementsOf(area.walls).map((placement) => placement.piece),
      ...area.props.map((prop) => prop.piece),
      ...(torches ? [TORCH_PIECE] : []),
    ]),
  ];
}

/**
 * Puts the shown Area's Walls and Props in the scene once their pieces are
 * loaded, asking for the ones that aren't.
 */
function showScenery(world3d: World3d, view: WorldView) {
  const { shown, pieces, loading } = world3d;
  if (!shown || shown.scenery) return;
  const { area } = shown;
  const names = sceneryPiecesOf(area, view.torches.length > 0);
  const missing = [...names].filter((name) => !pieces[name]);
  if (missing.length > 0) {
    const loader = new GLTFLoader();
    for (const name of missing) {
      if (loading.has(name)) continue;
      loading.add(name);
      loader.loadAsync(`${MODELS}/${name}.glb`).then(
        (gltf) => {
          toonShade(gltf.scene, lookOf(name));
          pieces[name] = gltf.scene;
        },
        () => {
          // A piece that won't load is left out; the rest still draws.
          pieces[name] = new Group();
        },
      );
    }
    return;
  }
  const walls = wallMeshesOf(area.walls, pieces);
  const props = propMeshesOf(area.props, pieces);
  const torches = torchMeshesOf(
    view.torches,
    pieces[TORCH_PIECE] ?? new Group(),
  );
  // Floors go without outlines; Walls and Props have them.
  for (const mesh of [...walls.group.children]) {
    outline(mesh, OUTLINE, PIECE_SCALE);
  }
  for (const mesh of [...props.children]) {
    outline(mesh, OUTLINE, scaleOf(mesh.userData.piece));
  }
  world3d.scene.add(walls.group, props, torches.group);
  shown.scenery = { walls, props, torches };
}

/**
 * Puts a Monster or Corpse actor in the scene for each in `view`, posed as it
 * says, and takes away those no longer there.
 */
function poseMonsters(world3d: World3d, view: WorldView, dt: number) {
  const { models, monsters, scene } = world3d;
  if (!models) return;
  const seen = new Set<number>();
  for (const monster of view.monsters) {
    seen.add(monster.id);
    let actor = monsters.get(monster.id);
    if (!actor) {
      actor = monsterActorOf(MONSTER_LOOKS[monster.type], models.monsters);
      monsters.set(monster.id, actor);
      scene.add(actor.root);
    }
    poseMonster(actor, monster, dt);
  }
  for (const [id, actor] of monsters) {
    if (seen.has(id)) continue;
    scene.remove(actor.root);
    // The geometry and textures are the models' own; the materials are not.
    for (const material of actor.materials) material.dispose();
    monsters.delete(id);
  }
}

/**
 * Puts a Minion actor in the scene for each Minion in `view`, posed as it
 * says, and takes away those that crumbled.
 */
function poseMinions(world3d: World3d, view: WorldView, dt: number) {
  const { models, minions, scene } = world3d;
  if (!models) return;
  const seen = new Set<number>();
  for (const minion of view.minions) {
    seen.add(minion.id);
    let actor = minions.get(minion.id);
    if (!actor) {
      actor = monsterActorOf(MINION_LOOKS[minion.type], models.monsters);
      minions.set(minion.id, actor);
      scene.add(actor.root);
    }
    poseMonster(actor, minion, dt);
    // Poses put it on the floor; a crumbling Minion sinks into it.
    actor.root.scale.setScalar(minion.crumble.scale);
    actor.root.position.y = -minion.crumble.sink;
  }
  for (const [id, actor] of minions) {
    if (seen.has(id)) continue;
    scene.remove(actor.root);
    for (const material of actor.materials) material.dispose();
    minions.delete(id);
  }
}

/**
 * Puts an NPC actor in the scene for each of Town's NPCs in `view`, posed as
 * it says, and takes away those of an Area left behind.
 */
function poseNpcs(world3d: World3d, view: WorldView, dt: number) {
  const { models, npcs, scene } = world3d;
  if (!models) return;
  // By name: an NPC's index in its Area can be another Area's NPC's.
  const seen = new Set<string>();
  for (const npc of view.npcs) {
    seen.add(npc.name);
    let actor = npcs.get(npc.name);
    if (!actor) {
      actor = monsterActorOf(NPC_LOOKS[npc.name], models.monsters);
      npcs.set(npc.name, actor);
      scene.add(actor.root);
    }
    poseMonster(actor, npc, dt);
  }
  for (const [name, actor] of npcs) {
    if (seen.has(name)) continue;
    scene.remove(actor.root);
    for (const material of actor.materials) material.dispose();
    npcs.delete(name);
  }
}

/** Puts the Ground Items on the floor and the Projectiles in the air. */
function showLoot(models: Models, view: WorldView) {
  const placed: Record<string, Placement[]> = {};
  const add = (placement: Placement) => {
    placed[placement.model] ??= [];
    placed[placement.model].push(placement);
  };
  for (const item of view.groundItems) add(groundPlacement(item));
  for (const pile of view.goldPiles) add(goldPlacement(pile));
  for (const projectile of view.projectiles) {
    for (const placement of projectilePlacements(projectile)) add(placement);
  }
  for (const [model, instances] of Object.entries(models.loot)) {
    instances.show(placed[model] ?? []);
  }
}

/** The size three.js last drew at, reused each frame. */
const drawnSize = new Vector2();

/**
 * Draws the 3D World into the shared canvas, as `view` shows it from
 * `camera` in `area`, `width` × `height` CSS px at `resolution`, as Pixi
 * sized it. Pixi then draws the HUD over it.
 */
export function drawWorld3d(
  world3d: World3d,
  frame: {
    area: Area;
    view: WorldView;
    camera: WorldCamera;
    nowMs: number;
    resolution: number;
  },
) {
  const { renderer, scene } = world3d;
  const { area, view, camera, nowMs, resolution } = frame;
  const { width, height } = camera;
  if (renderer.getPixelRatio() !== resolution) {
    renderer.setPixelRatio(resolution);
  }
  // Pixi owns the canvas's size and style, so three.js only follows it.
  const size = renderer.getSize(drawnSize);
  if (size.x !== width || size.y !== height) {
    renderer.setSize(width, height, false);
  }
  showFloor(world3d, area);
  showScenery(world3d, view);
  world3d.shown?.scenery?.walls.lower(view.loweredWalls);
  const dt =
    world3d.drawnAtMs === null ? 0 : (nowMs - world3d.drawnAtMs) / 1000;
  world3d.drawnAtMs = nowMs;
  if (world3d.models) poseHero(world3d.models.hero, view.hero, dt);
  poseMonsters(world3d, view, dt);
  poseMinions(world3d, view, dt);
  poseNpcs(world3d, view, dt);
  if (world3d.models) showLoot(world3d.models, view);
  const seconds = nowMs / 1000;
  world3d.shown?.scenery?.torches.show(view.torches, seconds);
  lightScene(world3d.lighting, view, seconds, scene);
  world3d.townPortals.show(view.townPortals, seconds);
  world3d.boneAltars.show(view.boneAltars, seconds);
  world3d.boneWalls.show(view.boneWalls);
  world3d.floorEffects.show(view.floorEffects);
  world3d.shown?.exits.update(seconds);
  world3d.shown?.water.update(seconds);
  driftEmbers(world3d.atmosphere, view.hero.pos, dt, view.combat);
  showMarkers(world3d.markers, view);
  placeCamera(world3d.camera, camera);
  renderer.resetState();
  renderer.info.reset();
  renderer.clear();
  renderer.render(scene, world3d.camera);
  if (view.combat) {
    const { vignette } = world3d.atmosphere;
    renderer.render(vignette.scene, vignette.camera);
  }
}

/** What the 3D World drew last frame, for the stats panel. */
export function drawnBy(world3d: World3d) {
  const { calls, triangles } = world3d.renderer.info.render;
  return { calls, triangles };
}

/**
 * Frees the 3D World's renderer and its WebGL context, once Pixi is done
 * with it, so remounts don't pile up contexts.
 */
export function disposeOf(world3d: World3d) {
  world3d.renderer.dispose();
  world3d.renderer.forceContextLoss();
}
