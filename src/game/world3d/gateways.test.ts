import type { Material, Mesh } from "three";
import { describe, expect, it } from "vitest";
import { areas, tilesets } from "../content";
import { createWorld } from "../sim/world";
import { exitMeshesOf } from "./exitMeshes";
import { townPortalMeshesOf } from "./townPortalMesh";
import { type PointerState, worldViewOf } from "./view";

const NO_POINTER: PointerState = {
  click: null,
  highlight: null,
};

describe("Exits in the 3D World", () => {
  it("are in the view of every Area that has one", () => {
    const world = createWorld({ areas, tilesets, seed: 1 });

    expect(worldViewOf(world, 1, NO_POINTER).exits).toEqual([
      { x: 27, y: 14, width: 2, height: 2, to: "cozy-plains" },
    ]);

    world.areaName = "crypt";
    const exits = worldViewOf(world, 1, NO_POINTER).exits;
    expect(exits.map((exit) => exit.to).sort()).toEqual([
      "catacombs",
      "ossuary",
    ]);
  });

  it("stand over the whole zone, one gateway for each", () => {
    const exits = [
      { x: 27, y: 14, width: 2, height: 2, to: "catacombs" },
      { x: 5, y: 4, width: 4, height: 4, to: "town" },
    ];

    const meshes = exitMeshesOf(exits);

    expect(meshes.group.children).toHaveLength(2);
    const [small, large] = meshes.group.children;
    expect(small.position.x).toBeCloseTo(28);
    expect(small.position.z).toBeCloseTo(15);
    expect(large.position.x).toBeCloseTo(7);
    expect(large.position.z).toBeCloseTo(6);
  });
});

describe("glows that must not hide", () => {
  it("lifts an Exit pool above Town's raised paths", () => {
    const [exit] = exitMeshesOf([
      { x: 27, y: 14, width: 2, height: 2, to: "catacombs" },
    ]).group.children;
    const pool = exit.children[0] as Mesh;

    expect((pool.material as Material).depthTest).toBe(true);
    expect(pool.position.y).toBeGreaterThan(0.05);
  });

  it("lifts a Town Portal's pool of light clear of Town's raised paths", () => {
    const meshes = townPortalMeshesOf();
    const [gateway] = meshes.group.children;
    const floor = gateway.children[1] as Mesh;

    expect(floor.position.y).toBeGreaterThan(0.05);
    expect((floor.material as Material).depthTest).toBe(true);
  });
});

describe("Town Portals in the 3D World", () => {
  const portal = (x: number, y: number, scale: number) => ({
    pos: { x, y },
    scale,
    msOpen: Number.POSITIVE_INFINITY,
  });

  it("show a gateway at each end, shrunk to a point when bursting open", () => {
    const meshes = townPortalMeshesOf();

    meshes.show([portal(18.5, 17.5, 1), portal(5, 6, 0.5)], 1);

    const [first, second] = meshes.group.children;
    expect(first.visible).toBe(true);
    expect(first.position.x).toBeCloseTo(18.5);
    expect(first.position.z).toBeCloseTo(17.5);
    expect(second.visible).toBe(true);
    expect(second.scale.y).toBeCloseTo(first.scale.y * 0.5);
  });

  it("hide the gateways with no end to show", () => {
    const meshes = townPortalMeshesOf();
    meshes.show([portal(1, 1, 1)], 1);

    meshes.show([], 2);

    expect(meshes.group.children.every((child) => !child.visible)).toBe(true);
  });
});
