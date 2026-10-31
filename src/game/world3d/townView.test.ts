import { describe, expect, it } from "vitest";
import { areas, tilesets } from "../content";
import { createWorld, type World } from "../sim/world";
import { NPC_LOOKS } from "./npcLook";
import { type PointerState, worldViewOf } from "./view";

const NO_POINTER: PointerState = {
  click: null,
  highlight: null,
};

const shipped = (): World => createWorld({ areas, tilesets, seed: 1 });

describe("the 3D World view of Town", () => {
  it("shows each NPC where it stands, as a character of its own", () => {
    const world = shipped();

    const { npcs } = worldViewOf(world, 1, NO_POINTER);

    expect(npcs.map((npc) => npc.name).sort()).toEqual([
      "Elder",
      "Smith",
      "Trader",
    ]);
    const smith = npcs.find((npc) => npc.name === "Smith");
    expect(smith?.pos).toEqual({ x: 12.5, y: 15.5 });
    const models = npcs.map((npc) => NPC_LOOKS[npc.name].model);
    expect(new Set(models).size).toBe(3);
  });

  it("marks the NPCs with a Quest to give, and none once they are all Given", () => {
    const world = shipped();
    const marks = () =>
      worldViewOf(world, 1, NO_POINTER).npcs.map((npc) => npc.questMark);

    expect(marks()).toEqual([true, true, true]);

    for (const quest of Object.values(world.hero.progress.quests)) {
      quest.state = "given";
    }
    expect(marks()).toEqual([false, false, false]);

    world.hero.progress.quests["bog-off"].state = "ready";
    const trader = worldViewOf(world, 1, NO_POINTER).npcs.find(
      (npc) => npc.name === "Trader",
    );
    expect(trader?.questMark).toBe(true);
  });

  it("turns an NPC towards a Hero who is near, else to the camera", () => {
    const world = shipped();
    const smith = world.areas.town.npcs.find((npc) => npc.name === "Smith");
    if (!smith) throw new Error("no Smith");

    world.hero.pos = { x: smith.pos.x + 2, y: smith.pos.y };
    world.hero.prevPos = world.hero.pos;
    const near = worldViewOf(world, 1, NO_POINTER).npcs;
    expect(near.find((npc) => npc.name === "Smith")?.facing).toBeCloseTo(0);

    world.hero.pos = { x: smith.pos.x + 20, y: smith.pos.y };
    world.hero.prevPos = world.hero.pos;
    const far = worldViewOf(world, 1, NO_POINTER).npcs;
    expect(far.find((npc) => npc.name === "Smith")?.facing).toBeCloseTo(
      Math.PI / 4,
    );
  });

  it("has no NPCs in a Combat Area", () => {
    const world = shipped();
    world.areaName = "catacombs";

    expect(worldViewOf(world, 1, NO_POINTER).npcs).toEqual([]);
  });

  it("lights the Cozy Plains, Soggy Bog and Wockyard by day, as outdoors, and the Catacombs in the dark of a Combat Area", () => {
    const world = shipped();
    expect(worldViewOf(world, 1, NO_POINTER).combat).toBe(false);

    for (const outdoors of ["cozy-plains", "soggy-bog", "wockyard"]) {
      world.areaName = outdoors;
      expect(worldViewOf(world, 1, NO_POINTER).combat).toBe(false);
    }

    world.areaName = "catacombs";
    expect(worldViewOf(world, 1, NO_POINTER).combat).toBe(true);
  });

  it("hangs a light on each of Town's lanterns, and none in a Combat Area", () => {
    const world = shipped();

    expect(worldViewOf(world, 1, NO_POINTER).lamps).toHaveLength(5);

    world.areaName = "catacombs";
    expect(worldViewOf(world, 1, NO_POINTER).lamps).toEqual([]);
  });
});
