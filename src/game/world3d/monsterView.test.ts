import { describe, expect, it } from "vitest";
import { arenaWith } from "../input/testArena";
import { msToSteps } from "../sim/units";
import { monsterTuning } from "../tuning/monsters";
import { MINION_LOOKS } from "./minionLook";
import { MONSTER_LOOKS } from "./monsterLook";
import { type Effects, type PointerState, worldViewOf } from "./view";

const NO_POINTER: PointerState = {
  click: null,
  highlight: null,
};
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

const withSkeleton = () => {
  const world = arenaWith([{ x: 12, y: 10 }], { combat: true });
  return { world, monster: world.monsters[0] };
};

const firstMonster = (
  world: ReturnType<typeof withSkeleton>["world"],
  effects = NO_EFFECTS,
) => worldViewOf(world, 1, NO_POINTER, effects).monsters[0];

describe("the 3D World view of the Monsters", () => {
  it("scrubs a winding-up Monster's attack clip up to contact as the wind-up ends", () => {
    const { world, monster } = withSkeleton();
    monster.state = "windup";
    monster.attack = 0;
    const start = firstMonster(world);
    monster.attack = msToSteps(monsterTuning.skeleton.windUpMs) - 1;
    const end = firstMonster(world);

    expect(start.animation).toEqual({ clip: "attack", progress: 0 });
    expect(end.animation.clip).toBe("attack");
    const reached = "progress" in end.animation ? end.animation.progress : -1;
    expect(reached).toBeLessThan(MONSTER_LOOKS.skeleton.contact);
    expect(reached).toBeGreaterThan(MONSTER_LOOKS.skeleton.contact * 0.9);
  });

  it("plays the rest of the attack clip during the recovery", () => {
    const { world, monster } = withSkeleton();
    monster.state = "recover";
    monster.attack = msToSteps(monsterTuning.skeleton.rootMs);
    const rooted = firstMonster(world);
    monster.attack = 0;
    const done = firstMonster(world);

    expect(rooted.animation).toEqual({
      clip: "attack",
      progress: expect.closeTo(MONSTER_LOOKS.skeleton.contact, 5),
    });
    expect(done.animation).toEqual({
      clip: "attack",
      progress: expect.closeTo(1, 5),
    });
  });

  it("gives a Monster the clip of its state", () => {
    const { world, monster } = withSkeleton();
    expect(firstMonster(world).animation.clip).toBe("idle");

    monster.prevPos = { x: 12.1, y: 10 };
    monster.state = "wander";
    expect(firstMonster(world).animation.clip).toBe("walk");

    monster.state = "chase";
    expect(firstMonster(world).animation.clip).toBe("run");

    monster.flinch = 5;
    expect(firstMonster(world).animation.clip).toBe("flinch");
  });

  it("draws Grave Wockington as the Skeleton_Mage with a staff, a fire tint and a Spellcast clip for a wave", () => {
    const { world, monster } = withSkeleton();
    monster.type = "grave_wockington";

    const look = MONSTER_LOOKS.grave_wockington;
    expect(look.model).toBe("Skeleton_Mage");
    expect(look.weapons).toEqual([
      { slot: "handslot.r", model: "Skeleton_Staff" },
    ]);
    expect(look.look).toBe("fire");
    expect(look.scale).toBeGreaterThan(MONSTER_LOOKS.skeleton.scale);
    expect(look.clips.cast).toMatch(/^Spellcast_/);
    expect(firstMonster(world).animation.clip).toBe("idle");

    const casts = new Map([[monster.id, 200]]);
    const cast = firstMonster(world, { ...NO_EFFECTS, casts }).animation;
    expect(cast.clip).toBe("cast");
    // Over once the cast has played.
    const done = new Map([[monster.id, 60_000]]);
    expect(
      firstMonster(world, { ...NO_EFFECTS, casts: done }).animation.clip,
    ).toBe("idle");
  });

  it("shows Grave Wockington's flare on his model from the turn on", () => {
    const { world, monster } = withSkeleton();
    monster.type = "grave_wockington";
    monster.waves = { cooldown: 100, raised: [], stage: 0 };
    expect(firstMonster(world).flared).toBe(false);

    monster.waves.stage = 1;
    expect(firstMonster(world).flared).toBe(true);
    expect(worldViewOf(world, 1, NO_POINTER, NO_EFFECTS).monsters).toHaveLength(
      1,
    );
  });

  it("plays Grave Wockington's Spellcast clip while he casts Gravefire, and his melee clip for his swing", () => {
    const { world, monster } = withSkeleton();
    monster.type = "grave_wockington";
    monster.state = "windup";

    expect(MONSTER_LOOKS.grave_wockington.clips.lob).toMatch(/^Spellcast_/);
    expect(firstMonster(world).animation.clip).toBe("lob");
    monster.state = "recover";
    expect(firstMonster(world).animation.clip).toBe("lob");
    monster.swinging = true;
    expect(firstMonster(world).animation.clip).toBe("attack");
  });

  it("draws a Wockwolf as the Werewolf, scaled down, with the clip of its state", () => {
    const { world, monster } = withSkeleton();
    monster.type = "wockwolf";

    const look = MONSTER_LOOKS.wockwolf;
    expect(look.model).toBe("Werewolf");
    expect(look.scale).toBeLessThan(1);
    expect(look.height).toBeLessThan(1.2);
    expect(firstMonster(world).type).toBe("wockwolf");
    expect(firstMonster(world).animation.clip).toBe("idle");
    monster.state = "chase";
    monster.prevPos = { x: 12.1, y: 10 };
    expect(firstMonster(world).animation.clip).toBe("run");
    monster.state = "windup";
    monster.attack = 0;
    expect(firstMonster(world).animation.clip).toBe("attack");
    monster.state = "wander";
    monster.flinch = 3;
    expect(firstMonster(world).animation.clip).toBe("flinch");
    for (const clip of [
      "idle",
      "walk",
      "run",
      "attack",
      "flinch",
      "death",
    ] as const) {
      expect(look.clips[clip]).toBeTruthy();
    }
  });

  it("draws a Bog Spitter as the Plant Warrior, with the clip of its state", () => {
    const { world, monster } = withSkeleton();
    monster.type = "bog_spitter";

    const look = MONSTER_LOOKS.bog_spitter;
    expect(look.model).toBe("PlantWarrior");
    expect(firstMonster(world).type).toBe("bog_spitter");
    expect(firstMonster(world).animation.clip).toBe("idle");
    monster.state = "chase";
    monster.prevPos = { x: 12.1, y: 10 };
    // At 1.2 tiles/s it shambles rather than runs.
    expect(firstMonster(world).animation.clip).toBe("run");
    expect(look.clips.run).toBe(look.clips.walk);
    monster.state = "windup";
    monster.attack = 0;
    expect(firstMonster(world).animation.clip).toBe("attack");
    monster.state = "wander";
    monster.flinch = 3;
    expect(firstMonster(world).animation.clip).toBe("flinch");
    for (const clip of [
      "idle",
      "walk",
      "run",
      "attack",
      "flinch",
      "death",
    ] as const) {
      expect(look.clips[clip]).toBeTruthy();
    }
  });

  it("draws a Wockbrute as the scaled-up Orc Brute, its attack clip scrubbing to contact as the wind-up ends", () => {
    const { world, monster } = withSkeleton();
    monster.type = "wockbrute";

    const look = MONSTER_LOOKS.wockbrute;
    expect(look.model).toBe("OrcBrute");
    expect(look.scale).toBeGreaterThan(MINION_LOOKS.golem.scale);
    expect(firstMonster(world).type).toBe("wockbrute");
    expect(firstMonster(world).animation.clip).toBe("idle");
    monster.state = "chase";
    monster.prevPos = { x: 12.1, y: 10 };
    expect(firstMonster(world).animation.clip).toBe("run");
    expect(look.clips.run).toBe(look.clips.walk);
    monster.state = "wander";
    monster.flinch = 3;
    expect(firstMonster(world).animation.clip).toBe("flinch");
    monster.flinch = 0;

    monster.state = "windup";
    monster.attack = 0;
    expect(firstMonster(world).animation).toEqual({
      clip: "attack",
      progress: 0,
    });
    monster.attack = msToSteps(monsterTuning.wockbrute.windUpMs) - 1;
    const end = firstMonster(world).animation;
    const reached = "progress" in end ? end.progress : -1;
    expect(reached).toBeLessThan(look.contact);
    expect(reached).toBeGreaterThan(look.contact * 0.95);
    for (const clip of [
      "idle",
      "walk",
      "run",
      "attack",
      "flinch",
      "death",
    ] as const) {
      expect(look.clips[clip]).toBeTruthy();
    }
  });

  it("flashes a hit Monster by the strength it is given", () => {
    const { world, monster } = withSkeleton();
    const effects = { ...NO_EFFECTS, flashes: new Map([[monster.id, 0.8]]) };

    expect(firstMonster(world, effects).flash).toBe(0.8);
    expect(firstMonster(world).flash).toBe(0);
  });

  it("lays a killed Monster down as a Corpse where it died, falling and then lying still", () => {
    const { world, monster } = withSkeleton();
    world.monsters = [];
    world.corpses.push({
      id: monster.id,
      type: monster.type,
      monsterLevel: 1,
      pos: { x: 12.5, y: 10.5 },
    });
    const falling = {
      ...NO_EFFECTS,
      deadForMs: new Map([[monster.id, 400]]),
    };

    const lying = firstMonster(world);
    const dying = firstMonster(world, falling);

    expect(lying.corpse).toBe(true);
    expect(lying.pos).toEqual({ x: 12.5, y: 10.5 });
    expect(lying.animation).toEqual({ clip: "death", progress: 1 });
    expect(dying.animation).toEqual({
      clip: "death",
      progress: expect.closeTo(0.5, 5),
    });
  });
});

describe("the 3D World view of a Unique Monster", () => {
  it("draws it about 1.2x its type's scale and an ordinary Monster at 1x", () => {
    const { world, monster } = withSkeleton();
    expect(firstMonster(world).scale).toBe(1);

    monster.unique = "Bob";

    expect(firstMonster(world).scale).toBeCloseTo(1.2);
    expect(firstMonster(world).type).toBe("skeleton");
  });
});
