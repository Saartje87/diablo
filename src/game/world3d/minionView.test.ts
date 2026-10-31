import { describe, expect, it } from "vitest";
import { arenaWith } from "../input/testArena";
import { newMinion } from "../sim/minions";
import { msToSteps } from "../sim/units";
import { type MinionType, minionTuning } from "../tuning/minions";
import { CRUMBLE_SECONDS } from "./crumble";
import { MINION_LOOKS } from "./minionLook";
import { pickablesOf } from "./pickables";
import { type Effects, type PointerState, worldViewOf } from "./view";

const NO_POINTER: PointerState = {
  click: null,
  highlight: null,
};

const withMinion = (type: MinionType) => {
  const world = arenaWith([{ x: 14, y: 10 }], { combat: true });
  const minion = newMinion(7, type, "raiseSkeleton", 1, { x: 9, y: 10 }, 0);
  world.minions.push(minion);
  return { world, minion };
};

const minionView = (world: ReturnType<typeof withMinion>["world"]) =>
  worldViewOf(world, 1, NO_POINTER).minions[0];

describe("the 3D World view of the Minions", () => {
  it("shows each Minion where it stands, as its type", () => {
    const { world } = withMinion("golem");

    expect(minionView(world)).toMatchObject({
      id: 7,
      type: "golem",
      pos: { x: 9, y: 10 },
      facing: 0,
    });
  });

  it("gives a Minion the clip of its state", () => {
    const { world, minion } = withMinion("raisedSkeleton");
    expect(minionView(world).animation.clip).toBe("idle");

    minion.prevPos = { x: 8.9, y: 10 };
    expect(minionView(world).animation.clip).toBe("walk");

    minion.state = "chase";
    expect(minionView(world).animation.clip).toBe("run");
  });

  it("scrubs a winding-up Minion's attack up to its type's contact", () => {
    for (const type of ["golem", "raisedSkeleton"] as const) {
      const { world, minion } = withMinion(type);
      minion.state = "windup";
      minion.attackSteps = msToSteps(minionTuning[type].windUpMs);

      expect(minionView(world).animation).toEqual({
        clip: "attack",
        progress: expect.closeTo(MINION_LOOKS[type].contact, 5),
      });
    }
  });

  it("plays the rest of the attack clip while the Minion is rooted", () => {
    const { world, minion } = withMinion("golem");
    minion.state = "recover";
    minion.attackSteps = msToSteps(minionTuning.golem.rootMs);
    const rooted = minionView(world).animation;
    minion.attackSteps = 0;
    const done = minionView(world).animation;

    expect(rooted).toEqual({
      clip: "attack",
      progress: expect.closeTo(MINION_LOOKS.golem.contact, 5),
    });
    expect(done).toEqual({ clip: "attack", progress: expect.closeTo(1, 5) });
  });

  it("draws the Golem as the Monstrosity, whose slam lands later than a chop", () => {
    expect(MINION_LOOKS.golem.model).toBe("Monstrosity");
    expect(MINION_LOOKS.golem.contact).toBeGreaterThan(0.5);
  });
});

describe("the highlight outline", () => {
  it("marks the hovered Monster and no other", () => {
    const { world } = withMinion("golem");
    const pointer = { ...NO_POINTER, highlight: world.monsters[0].id };
    const view = worldViewOf(world, 1, pointer);

    expect(view.monsters.map((monster) => monster.highlighted)).toEqual([true]);
    expect(view.minions.map((minion) => minion.highlighted)).toEqual([false]);
  });

  it("marks the hovered Minion", () => {
    const { world } = withMinion("golem");
    const pointer = { ...NO_POINTER, highlight: { minion: 7 } };
    const view = worldViewOf(world, 1, pointer);

    expect(view.minions[0].highlighted).toBe(true);
    expect(view.monsters[0].highlighted).toBe(false);
  });

  it("marks no Corpse, even one with the id of the Monster hovered", () => {
    const { world } = withMinion("golem");
    const [monster] = world.monsters;
    world.monsters = [];
    world.corpses.push({
      id: monster.id,
      type: monster.type,
      monsterLevel: 1,
      pos: monster.pos,
    });
    const view = worldViewOf(world, 1, {
      ...NO_POINTER,
      highlight: monster.id,
    });

    expect(view.monsters.map((one) => one.highlighted)).toEqual([false]);
  });
});

describe("what can be picked", () => {
  it("includes the Minions at their own height, the Golem the tallest", () => {
    const { world } = withMinion("golem");
    world.minions.push(
      newMinion(8, "raisedSkeleton", "raiseSkeleton", 1, { x: 8, y: 10 }, 0),
    );
    const picked = pickablesOf(world, 1);
    const heightOf = (minion: number) =>
      picked.find(
        (one) => typeof one.id === "object" && one.id.minion === minion,
      )?.height;

    expect(heightOf(7)).toBe(MINION_LOOKS.golem.height);
    expect(heightOf(8)).toBe(MINION_LOOKS.raisedSkeleton.height);
    expect(MINION_LOOKS.golem.height).toBeGreaterThan(
      MINION_LOOKS.raisedSkeleton.height,
    );
    expect(picked.some((one) => one.id === world.monsters[0].id)).toBe(true);
  });
});

describe("the 3D World view of crumbling Minions", () => {
  const departed = (ageMs: number) => ({
    id: 3,
    type: "golem" as const,
    pos: { x: 4, y: 5 },
    facing: 1,
    ageMs,
  });
  const NO_EFFECTS: Effects = {
    flashes: new Map(),
    deadForMs: new Map(),
    casts: new Map(),
    portals: [],
    bursts: [],
    curses: [],
    levelUpAgoMs: null,
    departedMinions: [],
  };
  const viewWith = (ageMs: number) => {
    const { world } = withMinion("raisedSkeleton");
    return worldViewOf(world, 1, NO_POINTER, {
      ...NO_EFFECTS,
      departedMinions: [departed(ageMs)],
    }).minions;
  };

  it("shows a living Minion whole", () => {
    const { world } = withMinion("golem");
    expect(minionView(world).crumble).toEqual({ scale: 1, sink: 0 });
  });

  it("keeps a departed Minion where it stood, after the living", () => {
    const [living, gone] = viewWith(0);
    expect(living.id).toBe(7);
    expect(gone).toMatchObject({
      id: 3,
      type: "golem",
      pos: { x: 4, y: 5 },
      facing: 1,
      highlighted: false,
    });
  });

  it("shrinks and sinks a departed Minion as it ages", () => {
    const early = viewWith(CRUMBLE_SECONDS * 250)[1].crumble;
    const late = viewWith(CRUMBLE_SECONDS * 750)[1].crumble;
    expect(early.scale).toBeLessThan(1);
    expect(late.scale).toBeLessThan(early.scale);
    expect(late.sink).toBeGreaterThan(early.sink);
  });
});
