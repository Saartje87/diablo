import { describe, expect, it } from "vitest";
import { arenaWith } from "../input/testArena";
import { ITEM_TYPES } from "../tuning/items";
import { PROJECTILE_KINDS } from "../tuning/projectiles";
import { tileToScreen, type WorldCamera } from "./camera";
import { groundSpotsOf } from "./groundSpots";
import { LOOT_LOOKS, PROJECTILE_LOOKS, projectilePlacements } from "./lootLook";
import { type PointerState, worldViewOf } from "./view";

const NO_POINTER: PointerState = {
  click: null,
  highlight: null,
};

describe("the 3D World view of Projectiles", () => {
  it("shows a Projectile between its steps' positions, facing its flight", () => {
    const world = arenaWith([], { combat: true });
    world.projectiles.push({
      kind: "arrow",
      pos: { x: 14, y: 10 },
      prevPos: { x: 12, y: 10 },
      direction: { x: 0, y: 1 },
      speed: 0.3,
      rangeLeft: 5,
      from: 1,
      attackRating: 10,
      damage: [1, 2],
    });

    const [arrow] = worldViewOf(world, 0.5, NO_POINTER).projectiles;

    expect(arrow.kind).toBe("arrow");
    expect(arrow.pos).toEqual({ x: 13, y: 10 });
    expect(arrow.facing).toBeCloseTo(Math.PI / 2, 5);
  });

  it("shows none where the World has none", () => {
    const world = arenaWith([], { combat: true });
    expect(worldViewOf(world, 1, NO_POINTER).projectiles).toEqual([]);
  });

  it("knows how to draw every kind of Projectile", () => {
    for (const kind of PROJECTILE_KINDS) {
      expect(PROJECTILE_LOOKS[kind]).toBeDefined();
    }
  });
});

describe("the 3D World view of Ground Items", () => {
  it("shows each Ground Item where it lies", () => {
    const world = arenaWith([], { combat: true });
    world.groundItems.push(
      {
        item: { id: 7, type: "axe", rarity: "normal", affixes: [] },
        pos: { x: 11, y: 12 },
      },
      {
        item: { id: 8, type: "lifePotion", rarity: "normal", affixes: [] },
        pos: { x: 9.5, y: 8.5 },
      },
    );

    const { groundItems } = worldViewOf(world, 1, NO_POINTER);

    expect(groundItems).toEqual([
      { id: 7, type: "axe", pos: { x: 11, y: 12 } },
      { id: 8, type: "lifePotion", pos: { x: 9.5, y: 8.5 } },
    ]);
  });

  it("gives every Item type something to lie on the floor as", () => {
    for (const type of ITEM_TYPES) {
      expect(LOOT_LOOKS[type]).toBeDefined();
    }
  });
});

describe("how Projectiles are placed", () => {
  it("draws an arrow alone and a Bone Spear with a shrinking trail behind it", () => {
    const flying = (kind: "arrow" | "boneSpear") => ({
      kind,
      pos: { x: 10, y: 10 },
      facing: 0,
      lift: 0,
    });

    const arrow = projectilePlacements(flying("arrow"));
    const spear = projectilePlacements(flying("boneSpear"));

    expect(arrow).toHaveLength(1);
    expect(spear.length).toBeGreaterThan(2);
    // Behind the head (it flies towards +x), and smaller the further back.
    expect(spear[1].x).toBeLessThan(spear[0].x);
    expect(spear[2].x).toBeLessThan(spear[1].x);
    expect(spear[1].scale).toBeLessThan(spear[0].scale);
    expect(spear[2].scale).toBeLessThan(spear[1].scale);
  });
});

describe("Ground Item spots on the screen", () => {
  const camera: WorldCamera = {
    focus: { x: 10, y: 10 },
    width: 1000,
    height: 700,
    zoom: 1,
  };

  it("sits each Item's spot on its model, a little above the floor", () => {
    const [spot] = groundSpotsOf(camera, [
      { id: 7, type: "axe", pos: { x: 12, y: 11 } },
    ]);

    const floor = tileToScreen(camera, { x: 12, y: 11 });
    expect(spot.id).toBe(7);
    expect(spot.at.x).toBeCloseTo(floor.x, 5);
    expect(spot.at.y).toBeLessThan(floor.y);
    expect(floor.y - spot.at.y).toBeLessThan(40);
  });
});
