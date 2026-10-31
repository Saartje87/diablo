// @vitest-environment node
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { arenaWith } from "../input/testArena";
import { GOLD_PILE_SIZES, goldPileLooks, goldPileSize } from "../tuning/gold";
import { GOLD_LOOKS, goldPlacement, LOOT_MODELS } from "./lootLook";
import { type PointerState, worldViewOf } from "./view";

const NO_POINTER: PointerState = {
  click: null,
  highlight: null,
};

describe("which coin stack a Gold Pile shows", () => {
  it("is the biggest size whose threshold its amount reaches", () => {
    for (const [i, { from, size }] of goldPileLooks.entries()) {
      expect(goldPileSize(from)).toBe(size);
      const next = goldPileLooks[i + 1];
      if (next) expect(goldPileSize(next.from - 1)).toBe(size);
    }
  });

  it("starts at the single coin and grows with the amount", () => {
    expect(goldPileSize(1)).toBe("single");
    const sizes = [1, 30, 100, 500].map(goldPileSize);
    expect(sizes.map((size) => GOLD_PILE_SIZES.indexOf(size))).toEqual([
      0, 1, 2, 3,
    ]);
  });

  it("is placed as a Resource Bits coin stack of that size", () => {
    const at = (amount: number) =>
      goldPlacement({ id: 1, amount, pos: { x: 3, y: 4 } });

    expect(at(1).model).toBe("loot/Money_Coins_Stack_Single");
    expect(at(30).model).toBe("loot/Money_Coins_Stack_Small");
    expect(at(100).model).toBe("loot/Money_Coins_Stack_Medium");
    expect(at(500).model).toBe("loot/Money_Coins_Stack_Large");
    expect(at(1)).toMatchObject({ x: 3, y: 4 });
  });

  it("has every size's model loaded and in the import", () => {
    for (const size of GOLD_PILE_SIZES) {
      const { model } = GOLD_LOOKS[size];
      expect(LOOT_MODELS).toContain(model);
      expect(existsSync(`public/assets/models/${model}.glb`)).toBe(true);
    }
  });
});

describe("the 3D World view of Gold Piles", () => {
  it("shows each Gold Pile where it lies, with its amount", () => {
    const world = arenaWith([], { combat: true });
    world.goldPiles.push({ id: 3, amount: 42, pos: { x: 11, y: 12 } });

    const { goldPiles, groundItems } = worldViewOf(world, 1, NO_POINTER);

    expect(goldPiles).toEqual([{ id: 3, amount: 42, pos: { x: 11, y: 12 } }]);
    expect(groundItems).toEqual([]);
  });
});
