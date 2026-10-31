import type { Vec } from "../sim/vec";
import type { World } from "../sim/world";
import { type PointerState, type WorldView, worldViewOf } from "./view";

/**
 * How the Start Screen's camera drifts: it circles a point `radius` tiles
 * out (squashed to `squash` of that in the other direction so the path
 * isn't a ring), once every `periodMs`, which is slow.
 */
export const START_DRIFT = { radius: 3, squash: 0.6, periodMs: 90_000 };

/** The camera's focus `nowMs` into the Start Screen, drifting about `centre`. */
export function startFocusAt(centre: Vec, nowMs: number): Vec {
  const turn = (nowMs / START_DRIFT.periodMs) * 2 * Math.PI;
  return {
    x: centre.x + Math.cos(turn) * START_DRIFT.radius,
    y: centre.y + Math.sin(turn) * START_DRIFT.radius * START_DRIFT.squash,
  };
}

const NO_POINTER: PointerState = {
  click: null,
  highlight: null,
};

/**
 * What the 3D World shows on the Start Screen: Town's scenery and NPCs, who
 * stand idle (the World isn't stepped, so their clip follows `nowMs`) and
 * turn towards the camera, with no Hero. The Hero's place is the camera's
 * `focus`, which lowers the Walls and lights the torches nearest it.
 */
export function startViewOf(
  world: World,
  focus: Vec,
  nowMs: number,
): WorldView {
  const looking = {
    ...world,
    hero: { ...world.hero, pos: focus, prevPos: focus },
    monsters: [],
    corpses: [],
    minions: [],
    projectiles: [],
  };
  const view = worldViewOf(looking, 1, NO_POINTER);
  return {
    ...view,
    hero: { ...view.hero, visible: false },
    townPortals: [],
    npcs: view.npcs.map((npc) => ({
      ...npc,
      animation: { clip: "idle", seconds: nowMs / 1000 },
    })),
  };
}
