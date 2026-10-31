import { Group, IcosahedronGeometry, Mesh, MeshBasicMaterial } from "three";
import { inputTuning } from "../tuning/input";
import { puffOf, puffOpacity, type Scatter, scatterOf } from "./puff";
import type { ClickMarkerView } from "./view";

/** The click marker: a pool of motes sharing one material, made once. */
export type Markers = {
  click: Group;
  material: MeshBasicMaterial;
  /** The scatter for the click point being shown, kept while the point stays. */
  scatter: { at: { x: number; y: number }; puff: Scatter } | null;
};

/** Makes the markers, hidden. */
export function createMarkers(): Markers {
  const { motes, colour } = inputTuning.clickPuff;
  const geometry = new IcosahedronGeometry(0.5, 0);
  const material = new MeshBasicMaterial({
    color: colour,
    transparent: true,
    depthWrite: false,
  });
  const click = new Group();
  for (let i = 0; i < motes; i++) {
    const mote = new Mesh(geometry, material);
    mote.renderOrder = 1;
    click.add(mote);
  }
  click.visible = false;
  return { click, material, scatter: null };
}

/** Shows the markers as the view says. */
export function showMarkers(
  markers: Markers,
  view: { clickMarker: ClickMarkerView | null },
) {
  const { click, material } = markers;
  const { clickMarker } = view;
  click.visible = clickMarker !== null;
  if (!clickMarker) return;
  const { at, progress } = clickMarker;
  let kept = markers.scatter;
  if (!kept || kept.at.x !== at.x || kept.at.y !== at.y) {
    kept = { at: { x: at.x, y: at.y }, puff: scatterOf(at) };
    markers.scatter = kept;
  }
  const motes = puffOf(kept.puff, progress);
  click.children.forEach((child, i) => {
    const mote = motes[i];
    child.position.set(at.x + mote.offset.x, mote.height, at.y + mote.offset.y);
    child.scale.setScalar(mote.size);
  });
  material.opacity = puffOpacity(progress);
}
