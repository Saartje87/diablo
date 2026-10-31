import { describe, expect, it } from "vitest";
import { arenaWith } from "../input/testArena";
import { CORPSE_BURST } from "../render/corpseBurst";
import { CURSE_CIRCLE, curseLook } from "../render/curse";
import { LEVEL_UP } from "../render/levelUp";
import { isLobbed } from "../sim/projectiles";
import { msToSteps } from "../sim/units";
import { burningCircles, step } from "../sim/world";
import { monsterTuning } from "../tuning/monsters";
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

const viewOf = (world: ReturnType<typeof arenaWith>, effects = NO_EFFECTS) =>
  worldViewOf(world, 1, NO_POINTER, effects).floorEffects;

describe("the 3D World view of the floor effects", () => {
  describe("telegraphs", () => {
    it("shows a winding-up melee Monster's reach and arc, filled as far as the wind-up has got", () => {
      const world = arenaWith([{ x: 12, y: 10 }], { combat: true });
      const [monster] = world.monsters;
      monster.state = "windup";
      monster.facing = 0.5;
      monster.attack = msToSteps(monsterTuning.skeleton.windUpMs) / 2;
      const { attack } = monsterTuning.skeleton;
      if (attack.kind !== "melee") throw new Error("skeletons are melee");

      const [wedge] = viewOf(world).telegraphs;

      expect(wedge.pos).toEqual(monster.pos);
      expect(wedge.facing).toBe(0.5);
      expect(wedge.reach).toBe(attack.reach);
      expect(wedge.arc).toBeCloseTo((attack.arcDegrees * Math.PI) / 180);
      expect(wedge.progress).toBeCloseTo(0.5, 1);
    });

    it("shows a winding-up Wockbrute's Slam as the whole circle it hits within", () => {
      const world = arenaWith([{ x: 12, y: 10 }], { combat: true });
      const [monster] = world.monsters;
      monster.type = "wockbrute";
      monster.state = "windup";
      monster.attack = msToSteps(monsterTuning.wockbrute.windUpMs) / 2;
      const { attack } = monsterTuning.wockbrute;
      if (attack.kind !== "melee" || !attack.slam) throw new Error("a Slam");

      const [circle] = viewOf(world).telegraphs;

      expect(circle.pos).toEqual(monster.pos);
      expect(circle.reach).toBe(attack.slam.radius);
      expect(circle.arc).toBeCloseTo(Math.PI);
      expect(circle.progress).toBeCloseTo(0.5, 1);
    });

    it("follows the Monster between steps", () => {
      const world = arenaWith([{ x: 12, y: 10 }], { combat: true });
      const [monster] = world.monsters;
      monster.state = "windup";
      monster.prevPos = { x: 11, y: 10 };
      monster.pos = { x: 12, y: 10 };

      const [wedge] = worldViewOf(world, 0.5, NO_POINTER, NO_EFFECTS)
        .floorEffects.telegraphs;

      expect(wedge.pos).toEqual({ x: 11.5, y: 10 });
    });

    it("shows none for a Monster that isn't winding up", () => {
      const world = arenaWith([{ x: 12, y: 10 }], { combat: true });
      world.monsters[0].state = "chase";

      expect(viewOf(world).telegraphs).toEqual([]);
    });

    it("shows none for an Archer, whose drawn bow is the tell", () => {
      const world = arenaWith([{ x: 12, y: 10 }], { combat: true });
      world.monsters[0].type = "skeleton_archer";
      world.monsters[0].state = "windup";

      expect(viewOf(world).telegraphs).toEqual([]);
    });
  });

  describe("Muck's mark", () => {
    /** A Bog Spitter 4 tiles from the Hero, stepped until it looses Muck. */
    const loosed = () => {
      const world = arenaWith([{ x: 14, y: 10 }], { combat: true });
      world.monsters[0].type = "bog_spitter";
      for (let i = 0; !world.projectiles.length; i++) {
        if (i > 600) throw new Error("No Muck was loosed");
        step(world, []);
      }
      return world;
    };

    it("shows the landing point and circle from loosing, with progress along the arc", () => {
      const world = loosed();
      const [muck] = world.projectiles;
      if (!isLobbed(muck)) throw new Error("Muck is lobbed");

      const [mark] = viewOf(world).marks;

      expect(mark.pos).toEqual(muck.landing);
      expect(mark.radius).toBe(muck.radius);
      expect(mark.progress).toBe(0);
      for (let i = 0; i < 30; i++) step(world, []);
      expect(viewOf(world).marks[0].progress).toBeGreaterThan(0.1);
      expect(viewOf(world).marks[0].pos).toEqual(muck.landing);
    });

    it("draws the Muck over its arc, highest half way", () => {
      const world = loosed();
      const [muck] = world.projectiles;
      if (!isLobbed(muck)) throw new Error("Muck is lobbed");
      const lift = () =>
        worldViewOf(world, 1, NO_POINTER, NO_EFFECTS).projectiles[0].lift;

      expect(lift()).toBe(0);
      muck.progress = 0.5;
      const middle = lift();
      muck.progress = 0.9;

      expect(middle).toBeGreaterThan(1);
      expect(lift()).toBeLessThan(middle);
    });

    it("is gone once the Muck has landed", () => {
      const world = loosed();
      for (let i = 0; world.projectiles.length; i++) {
        if (i > 600) throw new Error("The Muck never landed");
        step(world, []);
      }

      expect(viewOf(world).marks).toEqual([]);
    });

    it("is not shown for an Arrow", () => {
      const world = arenaWith([{ x: 14, y: 10 }], { combat: true });
      world.monsters[0].type = "skeleton_archer";
      for (let i = 0; !world.projectiles.length; i++) {
        if (i > 600) throw new Error("No Arrow was loosed");
        step(world, []);
      }

      expect(viewOf(world).marks).toEqual([]);
    });
  });

  describe("Gravefire", () => {
    /** Grave Wockington 4 tiles from the Hero, stepped until he casts. */
    const cast = () => {
      const world = arenaWith([{ x: 14, y: 10 }], { combat: true });
      world.monsters[0].type = "grave_wockington";
      world.hero.life = 1e6;
      for (let i = 0; !world.projectiles.length; i++) {
        if (i > 600) throw new Error("No Gravefire was cast");
        step(world, []);
      }
      // Once is enough.
      world.monsters[0].cooldown = 1e9;
      return world;
    };

    it("marks its landing from casting, in fire and not Muck's green", () => {
      const world = cast();
      const [mark] = viewOf(world).marks;

      expect(mark.kind).toBe("gravefire");
      expect(viewOf(world).burns).toEqual([]);
    });

    it("shows the burning circle from landing until its burn ends, then removes it", () => {
      const world = cast();
      for (let i = 0; !world.burns.length; i++) {
        if (i > 600) throw new Error("It never landed");
        step(world, []);
      }
      const [burning] = burningCircles(world);

      const [shown] = viewOf(world).burns;
      expect(shown.pos).toEqual(burning.pos);
      expect(shown.radius).toBe(burning.radius);
      expect(shown.left).toBeGreaterThan(0.9);
      expect(viewOf(world).marks).toEqual([]);

      for (let i = 0; i < 60; i++) step(world, []);
      expect(viewOf(world).burns[0].left).toBeLessThan(shown.left);

      for (let i = 0; world.burns.length; i++) {
        if (i > 60 * 10) throw new Error("It never burnt out");
        step(world, []);
      }
      expect(viewOf(world).burns).toEqual([]);
    });
  });

  describe("Curse circles", () => {
    const world = () => arenaWith([], { combat: true });

    it("shows a cast Curse over its radius, fading as it plays", () => {
      const early = viewOf(world(), {
        ...NO_EFFECTS,
        curses: [
          { skill: "amplifyDamage", pos: { x: 8, y: 9 }, radius: 3, ageMs: 0 },
        ],
      }).curses;
      const late = viewOf(world(), {
        ...NO_EFFECTS,
        curses: [
          {
            skill: "amplifyDamage",
            pos: { x: 8, y: 9 },
            radius: 3,
            ageMs: 600,
          },
        ],
      }).curses;

      expect(early).toEqual([
        {
          pos: { x: 8, y: 9 },
          radius: 3,
          alpha: 1,
          colour: curseLook("amplifyDamage").circle,
        },
      ]);
      expect(late[0].alpha).toBeLessThan(early[0].alpha);
      expect(late[0].alpha).toBeGreaterThan(0);
    });

    it("colours each Curse's circle by the Curse", () => {
      const [circle] = viewOf(world(), {
        ...NO_EFFECTS,
        curses: [{ skill: "weaken", pos: { x: 8, y: 9 }, radius: 3, ageMs: 0 }],
      }).curses;

      expect(circle.colour).toBe(curseLook("weaken").circle);
      expect(curseLook("weaken").circle).not.toBe(
        curseLook("amplifyDamage").circle,
      );
    });

    it("drops a Curse once its circle has played", () => {
      const played = viewOf(world(), {
        ...NO_EFFECTS,
        curses: [
          {
            skill: "amplifyDamage",
            pos: { x: 8, y: 9 },
            radius: 3,
            ageMs: CURSE_CIRCLE.ms + 1,
          },
        ],
      });

      expect(played.curses).toEqual([]);
    });
  });

  describe("Corpse bursts", () => {
    const world = () => arenaWith([], { combat: true });

    it("spreads its ring out to the burst's radius in tiles while its flash fades", () => {
      const start = viewOf(world(), {
        ...NO_EFFECTS,
        bursts: [{ pos: { x: 5, y: 6 }, radius: 2, ageMs: 0 }],
      }).bursts[0];
      const end = viewOf(world(), {
        ...NO_EFFECTS,
        bursts: [
          { pos: { x: 5, y: 6 }, radius: 2, ageMs: CORPSE_BURST.ms * 0.99 },
        ],
      }).bursts[0];

      expect(start.pos).toEqual({ x: 5, y: 6 });
      expect(start.ring.radius).toBe(0);
      expect(start.flash.radius).toBeCloseTo(2 * CORPSE_BURST.flashFrom);
      expect(start.flash.alpha).toBeCloseTo(1);
      expect(end.ring.radius).toBeCloseTo(2, 1);
      expect(end.flash.alpha).toBeLessThan(start.flash.alpha);
      expect(end.ring.alpha).toBeLessThan(start.ring.alpha);
    });

    it("drops a burst once it has played", () => {
      const view = viewOf(world(), {
        ...NO_EFFECTS,
        bursts: [
          { pos: { x: 5, y: 6 }, radius: 2, ageMs: CORPSE_BURST.ms + 1 },
        ],
      });

      expect(view.bursts).toEqual([]);
    });
  });

  describe("the Level-Up ring", () => {
    const world = () => arenaWith([], { combat: true });

    it("spreads from the Hero's feet to its full radius as it fades", () => {
      const w = world();
      const start = viewOf(w, { ...NO_EFFECTS, levelUpAgoMs: 0 }).levelRing;
      const late = viewOf(w, {
        ...NO_EFFECTS,
        levelUpAgoMs: LEVEL_UP.ms * 0.9,
      }).levelRing;

      expect(start?.pos).toEqual(w.hero.pos);
      expect(start?.radius).toBe(0);
      expect(start?.alpha).toBe(1);
      expect(late?.radius).toBeCloseTo(LEVEL_UP.ringRadius * 0.9);
      expect(late?.alpha).toBeCloseTo(0.1);
    });

    it("is not there before a Level is reached or after the ring has played", () => {
      const w = world();

      expect(viewOf(w).levelRing).toBeNull();
      expect(
        viewOf(w, { ...NO_EFFECTS, levelUpAgoMs: LEVEL_UP.ms }).levelRing,
      ).toBeNull();
    });
  });

  describe("the Hero's gold glow", () => {
    const glowAt = (levelUpAgoMs: number | null) =>
      worldViewOf(arenaWith([], { combat: true }), 1, NO_POINTER, {
        ...NO_EFFECTS,
        levelUpAgoMs,
      }).hero.glow;

    it("starts at the Level-Up strength and fades out with the ring", () => {
      expect(glowAt(0)).toBeCloseTo(LEVEL_UP.strength);
      expect(glowAt(LEVEL_UP.ms / 2)).toBeCloseTo(LEVEL_UP.strength / 2);
      expect(glowAt(LEVEL_UP.ms)).toBe(0);
    });

    it("is absent without a Level-Up", () => {
      expect(glowAt(null)).toBe(0);
    });
  });
});
