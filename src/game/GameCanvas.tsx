"use client";

import { Application } from "pixi.js";
import { useEffect, useRef } from "react";
import { pressButton } from "./buttonPress";
import { advance, createClock } from "./clock";
import { areaDisplayNames, createShippedWorld } from "./content";
import {
  type CursorPoint,
  clickCursor,
  createCursor,
  forTheWorld,
  pressCursor,
  releaseCursor,
  settleCursor,
} from "./cursor";
import { screenOf, walkToOrders } from "./devAim";
import { devOptionsOf } from "./devOptions";
import { buildSave, type SaveOptions } from "./devSave";
import { devStartOf, skipsStartScreen } from "./devStart";
import { devStateOf } from "./devState";
import { browserFullscreen, fullscreenPointerEvent } from "./fullscreen";
import {
  createActiveInput,
  padTouched,
  pointerWay,
  reportInput,
} from "./input/activeInput";
import { readGamepad } from "./input/gamepad";
import { castKeyOrder, drinkKeyOrder, townPortalKeyOrder } from "./input/keys";
import {
  bothPads,
  createPadInput,
  hideFocus,
  type PadButton,
  pollPad,
} from "./input/pad";
import {
  attachPointer,
  cancel,
  claimPress,
  createPointerInput,
  poll,
  takeRelease,
  takeRightClick,
} from "./input/pointer";
import {
  cancelTap,
  createTapInput,
  tapDown,
  tapPointer,
  tapUp,
} from "./input/tap";
import {
  attachTapToClose,
  attachTouch,
  createTouchControls,
  readTouch,
  touchOnButton,
} from "./input/touch";
import { drawLoadingScreen, onRetryClick } from "./loadingScreen";
import {
  clickLoading,
  clickPaused,
  clickStart,
  createMenus,
  currentPanel,
  failLoad,
  finishLoading,
  fitMenus,
  followHero,
  isLoading,
  loadingScreen,
  MAP_KEY,
  type MenuRequest,
  type Menus,
  pauseForLostController,
  pressKey,
  pressPad,
  quitToStart,
  reactMenus,
  reportLoad,
  startLoad,
  tapMapOverlay,
  tapRotateNotice,
} from "./menus";
import { gameTime } from "./pause";
import { createFrameStats, recordFrame } from "./render/frameStats";
import { inventoryRightClickOrder } from "./render/inventoryPanel";
import { panelFocusSpots } from "./render/panelFocus";
import { createRenderer } from "./render/renderer";
import { createStatsPanel, showReading } from "./render/statsPanel";
import {
  touchControlsLayout,
  touchControlsShown,
} from "./render/touchControls";
import {
  browserStorage,
  changesSave,
  readSave,
  removeSave,
  saveOf,
  writeSave,
  writeSaveText,
} from "./save";
import { isFloor, TOWN } from "./sim/area";
import { cursorItemOf, type ItemId } from "./sim/inventory";
import type { Vec } from "./sim/vec";
import {
  type MonsterId,
  type Order,
  step,
  type World,
  waypointUnderHero,
  withinNpcReach,
} from "./sim/world";
import { type Viewport, viewportOf } from "./viewport";
import { screenToTile, worldCameraOn } from "./world3d/camera";
import { createSharedCanvas } from "./world3d/sharedCanvas";
import { startFocusAt, startViewOf } from "./world3d/startView";
import { type PointerState, worldViewOf } from "./world3d/view";
import {
  createWorld3d,
  disposeOf,
  drawnBy,
  drawWorld3d,
  loadModels,
  type World3d,
} from "./world3d/world3d";

/**
 * Mounts the Pixi Application, which draws the HUD over the 3D World on one
 * canvas, and runs the fixed-step loop.
 */
export default function GameCanvas() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = host.current;
    if (!container) return;

    const app = new Application();
    // Dev builds and Vercel previews can show stats.
    const dev = devOptionsOf(
      window.location.search,
      process.env.NODE_ENV === "development" ||
        process.env.WOCKSTRUCTION_PREVIEW === "true",
    );
    // Pixi and the 3D World draw on one canvas, made up front.
    const shared = createSharedCanvas();
    if (!shared) {
      container.textContent =
        "Lord of Wockstruction needs a browser with WebGL 2.";
      return;
    }
    /** The 3D World, once it is made. */
    let world3d: World3d | null = null;
    const statsPanel = dev.stats ? createStatsPanel(container) : null;
    const listeners = new AbortController();
    let cancelled = false;
    let frame = 0;

    // StrictMode and `cacheComponents` can run this cleanup before `init()`
    // settles, so destroy only once it has.
    const init = app.init({
      resizeTo: window,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio, 2),
      background: 0x0b0a08,
      autoStart: false,
      // Pixi draws the HUD into the canvas and WebGL context the 3D World
      // shares, over it (ADR 0004).
      preference: "webgl",
      canvas: shared.canvas,
      context: shared.context,
    });
    init.then(() => {
      if (cancelled) return;
      const storage = browserStorage();
      const development = process.env.NODE_ENV === "development";
      // The Save's Hero, or a fresh one when there's no Save.
      const save = readSave(storage);
      let world = createShippedWorld({
        seed: Date.now(),
        progress: save?.progress,
        belongings: save?.belongings,
        // Playtests can skip the walk from Town. Production builds ignore it.
        start: development ? devStartOf(window.location.search) : null,
      });
      const loaded = createWorld3d(shared);
      world3d = loaded;
      // The 3D World draws first and Pixi's HUD over it, so Pixi clears
      // nothing.
      app.renderer.background.clearBeforeRender = false;
      container.appendChild(app.canvas);

      // The way the player last played, which the hints name the buttons of:
      // touch from the start where the main pointer is a finger.
      const activeInput = createActiveInput(
        matchMedia("(pointer: coarse)").matches,
      );
      // What the fingers hold of the touch controls.
      const touch = createTouchControls();
      /** Where the 3D World's camera was last drawn, which input reads. */
      let worldCamera = worldCameraOn(viewportOf(app.screen), world.hero.pos);
      const renderer = createRenderer(
        app,
        () => worldCamera,
        areaDisplayNames,
        activeInput,
        touch,
      );
      /** The tile under a point on the canvas (CSS px), through the camera. */
      const toTile = (at: Vec) => screenToTile(worldCamera, at);
      /** The last click on the floor, which the 3D World marks. */
      let lastClick: { at: Vec; atMs: number } | null = null;
      const frameStats = createFrameStats(performance.now());
      const clock = createClock();
      const input = createPointerInput();
      // The Loading Screen shows from the start, drawn by the page itself;
      // play begins once the models are in.
      const menus = createMenus(loadingScreen());
      const { pause } = menus;
      const fullscreen = browserFullscreen(listeners.signal);
      let orders: Order[] = [];
      const padInput = createPadInput();
      /** The controller's buttons held last frame. */
      let padHeld: readonly PadButton[] = [];
      let last = performance.now();
      /** What the cursor holds besides the Held Item. */
      let cursor = createCursor();
      /** A touch on the panels and the HUD, acted on as it lifts. */
      const tap = createTapInput();
      /** The Target as last drawn. */
      let drawnTarget: MonsterId | null = null;
      let drawnItemInReach: ItemId | null = null;
      /** Where `walkTo` asked the Hero to walk, carried out next frame. */
      let devWalks: Vec[] = [];
      // Playtests read the game from here instead of by eye. Production
      // builds don't have it.
      if (process.env.NODE_ENV === "development") {
        window.__wockstruction = {
          state: () => devStateOf(world, drawnTarget, drawnItemInReach),
          screenOf: (pos: Vec, height?: number) =>
            screenOf(worldCamera, pos, height),
          walkTo: (pos: Vec) => {
            // Only in play, as a click on the floor walks only there; the
            // pause and the Hero's Death are checked as it is carried out.
            if (menus.screen.type === "playing") devWalks.push(pos);
          },
          loadSave: (options?: SaveOptions) => {
            writeSaveText(storage, buildSave(options));
            window.location.reload();
          },
        };
      }

      // Each input event tells the Active Input the way it came by, first,
      // so the touch that makes it touch can already be the touch
      // controls'. The controller is told of in the loop, as it's read there.
      for (const type of ["pointerdown", "pointermove"] as const) {
        window.addEventListener(
          type,
          (e) => {
            if (e.target !== app.canvas) return;
            reportInput(activeInput, {
              type: "used",
              way: pointerWay(e.pointerType),
            });
          },
          { capture: true, signal: listeners.signal },
        );
      }
      // A touch on the open Map Overlay, away from every control, closes it
      // and is that alone. Before `attachTouch`, so it sees a touch first.
      attachTapToClose(
        app.canvas,
        (at) =>
          menus.mapOpen &&
          touchControlsShown(activeInput.way, menus, world.death !== null) &&
          !renderer.panelAt(at) &&
          renderer.groundLabelAt(at) === null &&
          !touchOnButton(
            touchControlsLayout(viewportOf(app.screen), menus),
            at,
          ),
        () => tapMapOverlay(menus),
        listeners.signal,
      );
      // A touch on the touch controls, shown and not under a panel, the HUD
      // or a Ground Item's label, is theirs and never the pointer's.
      attachTouch(
        app.canvas,
        touch,
        (at) =>
          touchControlsShown(activeInput.way, menus, world.death !== null) &&
          !renderer.panelAt(at) &&
          renderer.groundLabelAt(at) === null
            ? touchControlsLayout(viewportOf(app.screen), menus)
            : null,
        listeners.signal,
      );
      attachPointer(app.canvas, input, listeners.signal);
      // Keys and clicks on the pause menu go to the menus; a click anywhere
      // else on it resumes. Any other click or key press goes on from the
      // Hero's Death, but for a click on the Hero panel or the Level Up
      // button.
      let clickedAt: Vec | null = null;
      let keys: string[] = [];
      /**
       * Whether `at` is on the Fullscreen button, of the Rotate Notice or
       * the pause menu, as last drawn.
       */
      const onFullscreenButton = (at: Vec): boolean => {
        const { screen } = menus;
        if (menus.rotateNotice) {
          return (
            renderer.rotateNoticeChoiceAt(at, menus.fullscreen) === "fullscreen"
          );
        }
        if (screen.type === "start") {
          return (
            renderer.startChoiceAt(at, screen, menus.fullscreen) ===
            "fullscreen"
          );
        }
        return (
          pause.paused &&
          renderer.menuChoiceAt(at, menus.fullscreen) === "fullscreen"
        );
      };
      /**
       * Presses the Fullscreen button and carries out the menus' request at
       * once, inside the event handler: browsers allow fullscreen only
       * there.
       */
      const pressFullscreen = () => {
        const asked = menus.rotateNotice
          ? tapRotateNotice(menus, "fullscreen")
          : menus.screen.type === "start"
            ? clickStart(menus, "fullscreen")
            : clickPaused(menus, "fullscreen", performance.now());
        if (asked === "fullscreen") fullscreen.toggle();
      };
      /** The finger or pen pressed on the Fullscreen button, till it lifts. */
      let fullscreenPointer: number | null = null;
      app.canvas.addEventListener(
        "pointerdown",
        (e) => {
          const at = { x: e.offsetX, y: e.offsetY };
          if (!onFullscreenButton(at)) {
            clickedAt = at;
          } else if (fullscreenPointerEvent(e.pointerType) === "pointerdown") {
            pressFullscreen();
          } else {
            fullscreenPointer = e.pointerId;
          }
        },
        { signal: listeners.signal },
      );
      // A finger or pen presses the Fullscreen button as it lifts there.
      app.canvas.addEventListener(
        "pointerup",
        (e) => {
          if (e.pointerId !== fullscreenPointer) return;
          fullscreenPointer = null;
          if (onFullscreenButton({ x: e.offsetX, y: e.offsetY })) {
            pressFullscreen();
          }
        },
        { signal: listeners.signal },
      );
      app.canvas.addEventListener(
        "pointercancel",
        (e) => {
          if (e.pointerId === fullscreenPointer) fullscreenPointer = null;
        },
        { signal: listeners.signal },
      );
      window.addEventListener(
        "keydown",
        (e) => {
          // Tab would move the browser's focus off the game.
          if (e.key === MAP_KEY) e.preventDefault();
          if (!e.repeat) keys.push(e.key);
        },
        { signal: listeners.signal },
      );
      window.addEventListener(
        "keydown",
        () =>
          reportInput(activeInput, { type: "used", way: "mouseAndKeyboard" }),
        { signal: listeners.signal },
      );
      /** Whether the controller went while it was the Active Input. */
      let controllerLost = false;
      window.addEventListener(
        "gamepaddisconnected",
        () => {
          const event = { type: "controllerDisconnected" } as const;
          if (reportInput(activeInput, event).pause) controllerLost = true;
        },
        { signal: listeners.signal },
      );
      window.addEventListener(
        "gamepadconnected",
        () => {
          reportInput(activeInput, { type: "controllerConnected" });
        },
        { signal: listeners.signal },
      );

      /**
       * Loads the models and the Town's Walls and Props, the bar following,
       * then lets play begin. A failure stays on the Loading Screen until
       * Retry loads again.
       */
      const load = async () => {
        startLoad(menus);
        drawLoadingScreen(menus.screen);
        try {
          await loadModels(loaded, world.areas[TOWN], (progress) => {
            if (cancelled) return;
            reportLoad(menus, progress);
            drawLoadingScreen(menus.screen);
          });
        } catch (error) {
          if (cancelled) return;
          console.error("The 3D World failed to load", error);
          failLoad(menus);
          drawLoadingScreen(menus.screen);
          return;
        }
        if (cancelled) return;
        // The clock owes nothing for the time spent loading.
        last = gameTime(pause, performance.now());
        finishLoading(menus, {
          hasSave: save !== null,
          skipStart: skipsStartScreen(window.location.search, development),
        });
        drawLoadingScreen(menus.screen);
      };
      onRetryClick(() => {
        if (clickLoading(menus, "retry") === "retry") void load();
      }, listeners.signal);

      const tick = (realNow: number) => {
        if (isLoading(menus)) {
          // Nothing is drawn or simulated yet; the keys and the controller
          // may ask for Retry, and everything else does nothing. A failed
          // load turned upright shows the Rotate Notice over the page's
          // Loading Screen, which then hides.
          fitMenus(menus, viewportOf(app.screen), realNow);
          menus.fullscreen = fullscreen.read();
          const { screen } = menus;
          const covered =
            menus.rotateNotice && screen.type === "loading" && screen.failed;
          drawLoadingScreen(menus.screen, covered);
          if (covered) {
            renderer.drawRotateNoticeOnly(menus.fullscreen);
            app.render();
          }
          const asked = drainMenuInput(realNow);
          if (asked === "retry") void load();
          frame = requestAnimationFrame(tick);
          return;
        }
        if (menus.screen.type === "start") {
          tickStart(realNow, viewportOf(app.screen));
          return;
        }
        const wasPaused = pause.paused;
        const inventoryWasOpen = menus.inventoryOpen || menus.vendorOpen;
        // Read every frame, so a resize into the Compact Layout shuts all
        // but the latest panel at once, the Inventory's Held Item going back
        // as it would by hand, and the Rotate Notice pauses the World before
        // any key or click this frame, which it then takes for nothing.
        const viewport = viewportOf(app.screen);
        fitMenus(menus, viewport, realNow);
        // Read every frame too, so leaving fullscreen the browser's way (Esc,
        // the back gesture) turns the Fullscreen button back at once.
        menus.fullscreen = fullscreen.read();
        // A controller gone while it was played opens the pause menu, so the
        // Hero isn't killed while it's plugged back in.
        if (controllerLost) pauseForLostController(menus, realNow);
        controllerLost = false;
        let pressed = clickedAt !== null;
        /** What the menus asked for this frame, carried out below. */
        const requests = new Set<MenuRequest>();
        for (const key of keys) {
          const hero = { heroDead: world.death !== null };
          const used = pressKey(menus, key, realNow, hero);
          if (used === null) {
            pressed = true;
            // Keys Q/W/E/R cast at the cursor.
            const cursor = input.screen && toTile(input.screen);
            const cast = castKeyOrder(key, cursor);
            if (cast) orders.push(cast);
            // Keys 1–4 drink from the Belt Columns.
            const drink = drinkKeyOrder(key);
            if (drink) orders.push(drink);
            // Key P opens a Town Portal.
            const townPortal = townPortalKeyOrder(key);
            if (townPortal) orders.push(townPortal);
          }
          if (used !== null && used !== "handled") requests.add(used);
        }
        // The controller, read every frame so its buttons' presses and
        // releases are seen, and polled with the panels as the keys left
        // them, before its own presses open or shut any: B shutting a panel
        // casts nothing. It auto-aims from the World as last stepped (ADR
        // 0002).
        // The touch controls stand in for the same pad, and were told of as
        // touches.
        const controller = readGamepad(padHeld);
        padHeld = controller.held;
        if (padTouched(controller)) {
          reportInput(activeInput, { type: "used", way: "controller" });
        }
        const pad = bothPads(controller, readTouch(touch));
        // The Focus shows only while the controller is the Active Input, so
        // the mouse's pointer shows otherwise.
        if (activeInput.way !== "controller") hideFocus(padInput);
        const polled = pollPad(padInput, pad, gameTime(pause, realNow), {
          toTile,
          world,
          menus,
          focusSpots: panelFocusSpots(
            currentPanel(menus),
            world,
            viewport,
            menus.pendingPoints,
            menus.dialogueNpc,
            menus.dialoguePage,
            menus.skillTreeBranch,
          ),
        });
        for (const button of polled.presses) {
          const hero = { heroDead: world.death !== null };
          const used = pressPad(menus, button, realNow, hero);
          if (used !== null && used !== "handled") requests.add(used);
        }
        if (clickedAt && wasPaused && pause.paused) {
          const choice = renderer.menuChoiceAt(clickedAt, menus.fullscreen);
          const asked = clickPaused(menus, choice, realNow);
          if (asked !== null) requests.add(asked);
        }
        // A click or tap on the Fullscreen button never gets here: its
        // event handler carried it out, as the browser asks. The Rotate
        // Notice takes every other click for nothing.
        if (requests.has("fullscreen")) {
          // Only from the controller's A, which browsers don't count as the
          // player's own action, so one may refuse it.
          fullscreen.toggle();
        }
        if (wasPaused || pause.paused) {
          // Neither a click on the menu nor a hold from before the pause
          // orders the Hero about.
          cancel(input);
          cancelTap(tap);
          pressed = false;
        }
        clickedAt = null;
        keys = [];
        if (requests.has("quit")) {
          // Quit to Start Screen: the World is made again from the Save, as
          // after any load, so the Town Portal, every kept Area, Minions and Bone
          // Ward are gone. Nothing is simulated until Continue.
          const saved = readSave(storage);
          world = createShippedWorld({
            seed: Date.now(),
            progress: saved?.progress,
            belongings: saved?.belongings,
          });
          orders = [];
          drawnTarget = null;
          drawnItemInReach = null;
          quitToStart(menus, saved !== null);
          last = gameTime(pause, realNow);
          frame = requestAnimationFrame(tick);
          return;
        }
        // Stands still while paused, so the clock owes no steps for it and
        // the World and every effect hold still.
        const now = gameTime(pause, realNow);
        const scene = { world, screen: viewport, way: activeInput.way };
        // Whether the Hero lies in Death, for the cursor; the World doesn't
        // step again until after it.
        const heroDead = world.death !== null;
        // The cursor sees a press first: one on the panels and HUD, or one
        // that puts down or drops what it holds, is not for the World.
        const pressedAt = input.pressedAt;
        const panel = pressedAt && renderer.panelAt(pressedAt);
        // A press that puts down or lets go of a Held Skill does only that.
        const heldSkillAtPress = cursor.heldSkill;
        // On touch, a touch on the panels and the HUD acts only as it lifts:
        // a tap clicks there, a long press shows the tooltip.
        const tapping =
          pressedAt !== null && panel !== null && activeInput.way === "touch";
        if (pressedAt && tapping) {
          tapDown(tap, { at: pressedAt, hit: panel }, realNow);
          claimPress(input);
          pressed = false;
        } else if (pressedAt) {
          const press = { at: pressedAt, hit: panel };
          const outcome = pressCursor(cursor, press, scene);
          cursor = outcome.cursor;
          orders.push(...outcome.orders);
          if (outcome.taken) {
            claimPress(input);
            pressed = false;
          }
        }
        const { orders: newOrders, click: clickedTile } = poll(input, now, {
          toTile,
          monsterAt: renderer.monsterAt,
          npcAt: renderer.npcAt,
          groundLabelAt: renderer.groundLabelAt,
          groundItemAt: renderer.groundItemAt,
          panelAt: (at) => forTheWorld(renderer.panelAt(at)),
        });
        orders.push(...newOrders);
        // `walkTo` walks as a click on its tile would, and marks the floor
        // there unless a real click did this frame.
        const walked = devWalks.flatMap((pos) =>
          walkToOrders(pos, { paused: wasPaused || pause.paused, heroDead }),
        );
        devWalks = [];
        orders.push(...walked);
        const lastWalk = walked.at(-1);
        const click =
          clickedTile ?? (lastWalk?.type === "MoveTo" ? lastWalk.target : null);
        // A walk in a direction is for the steps of this frame only, each of
        // them, so it goes apart from the other orders. The controller orders
        // nothing while paused, nor for the Rotate Notice.
        const padOrders = wasPaused || pause.paused ? [] : polled.orders;
        const walking = padOrders.filter((order) => order.type === "Walk");
        orders.push(...padOrders.filter((order) => order.type !== "Walk"));
        // A press on a button on a panel or the HUD changes the menus or
        // orders a point spent. A press that put down or let go of a Held Skill does none
        // of that; one on a Panel button keeps it held, as the key would.
        const landedSkill =
          heldSkillAtPress !== null && cursor.heldSkill === null;
        if (panel && "button" in panel && !landedSkill && !tapping) {
          orders.push(...pressButton(menus, world, panel.button));
        }
        // A pause or the Hero's Death lets go of a Held Skill, before its
        // release could land it.
        cursor = settleCursor(cursor, { paused: pause.paused, heroDead });
        // Clicks the cursor at `point`, as a tap or the Focus pressed does,
        // pressing the button there unless it lands a Held Skill.
        const clickAt = (point: CursorPoint) => {
          const landing = cursor.heldSkill;
          const outcome = clickCursor(cursor, point, scene);
          cursor = outcome.cursor;
          orders.push(...outcome.orders);
          const { hit } = point;
          const landed = landing !== null && cursor.heldSkill === null;
          if (hit && "button" in hit && !landed) {
            orders.push(...pressButton(menus, world, hit.button));
          }
        };
        // Where the left button went up, even off the canvas; a touch on
        // the panels, lifting, taps there unless it was a long press.
        const released = takeRelease(input);
        if (released && tap.down) {
          const tapped = tapUp(tap, realNow);
          if (tapped) clickAt(tapped);
        } else if (released) {
          const hit = released.at && renderer.panelAt(released.at);
          const release = { ...released, hit };
          const outcome = releaseCursor(cursor, release, scene);
          cursor = outcome.cursor;
          orders.push(...outcome.orders);
        }
        // A right-click on the Inventory equips or unequips the Item under
        // it, and on any other panel does nothing; off the panels, `poll`
        // made it a cast.
        const rightAt = takeRightClick(input);
        const rightHit = rightAt && renderer.panelAt(rightAt);
        if (rightHit && !("button" in rightHit)) {
          const order = inventoryRightClickOrder(world, rightHit);
          if (order) orders.push(order);
        }
        // The Focus pressed clicks or right-clicks its spot, as the mouse
        // would there; nothing while paused.
        const focusClick = pause.paused || wasPaused ? null : polled.click;
        if (focusClick) clickAt(focusClick);
        const focusRight = pause.paused || wasPaused ? null : polled.rightClick;
        if (focusRight?.hit && !("button" in focusRight.hit)) {
          const order = inventoryRightClickOrder(world, focusRight.hit);
          if (order) orders.push(order);
        }
        // After the keys and clicks, any of which may have shut it: I, its
        // × or Panel button, or T, Level Up or the Skill Tree's Panel button
        // opening the Skill Tree in its place.
        returnOnShut(orders, inventoryWasOpen, menus);
        if (pressed && world.death && !pause.paused) {
          orders.push({ type: "Continue" });
          // So holding on after the click doesn't steer in Town.
          claimPress(input);
        }
        pressed = false;
        const area = world.areas[world.areaName];
        if (click && !world.death && isFloor(area, click)) {
          lastClick = { at: click, atMs: now };
        }

        // Orders wait for the next step, which may be a frame away.
        const { steps, alpha } = advance(clock, now - last);
        last = now;
        for (let i = 0; i < steps; i++) {
          const events = step(world, [
            ...tradeOrders(world, menus),
            ...orders,
            ...walking,
          ]);
          if (changesSave(events)) writeSave(storage, saveOf(world));
          renderer.react(events, now);
          // The Hero's Death closes the panels. The World has already put
          // back an Item held then, so the return sent as the Inventory
          // shuts finds nothing to do, and is harmless.
          const inventoryOpen = menus.inventoryOpen || menus.vendorOpen;
          reactMenus(menus, events);
          // The Waypoint list stays open only while the Hero stands on it, and
          // the Dialogue panel while they are near the NPC.
          followHero(menus, {
            standingOnWaypoint: waypointUnderHero(world) !== null,
            withinReachOf: (npc) => withinNpcReach(world, npc),
          });
          orders = [];
          returnOnShut(orders, inventoryOpen, menus);
        }
        // No hover outline, nameplate or tooltip under the menu. While it
        // shows, the Focus stands in for the pointer, so its Item's tooltip
        // and the Held Item show there.
        const focus =
          pause.paused || currentPanel(menus) === null ? null : polled.focus;
        // On touch, a long press shows the tooltip, and a Held Item or Held
        // Skill stays where it was tapped up once the finger lifts.
        const holding =
          cursorItemOf(world) !== null || cursor.heldSkill !== null;
        const touched = tapPointer(tap, realNow, {
          holding,
          screen: input.screen,
        });
        const pointing = activeInput.way === "touch" ? touched : input.screen;
        const pointer = pause.paused ? null : (focus?.at ?? pointing);
        drawnTarget = pause.paused ? null : polled.target;
        // Unlike the Target, the Item in Reach shows only to a controller or
        // touch screen: the pad itself doesn't know the Active Input.
        const itemInReach =
          pause.paused || activeInput.way === "mouseAndKeyboard"
            ? null
            : polled.itemInReach;
        drawnItemInReach = itemInReach;
        // Before the HUD draws, which places the labels through it.
        const { hero } = world;
        worldCamera = worldCameraOn(viewport, {
          x: hero.prevPos.x + (hero.pos.x - hero.prevPos.x) * alpha,
          y: hero.prevPos.y + (hero.pos.y - hero.prevPos.y) * alpha,
        });
        renderer.draw(
          world,
          alpha,
          pointer,
          now,
          menus,
          cursor.heldSkill,
          cursor.heldSkillSlot,
          drawnTarget,
          focus?.rect ?? null,
          itemInReach,
        );
        const shown = world.areas[world.areaName];
        const pointerState: PointerState = {
          highlight: renderer.highlightedCharacter(),
          click: lastClick && {
            at: lastClick.at,
            ageMs: now - lastClick.atMs,
          },
        };
        drawWorld3d(loaded, {
          area: shown,
          view: worldViewOf(
            world,
            alpha,
            pointerState,
            renderer.effectsAt(now, world),
          ),
          camera: worldCamera,
          nowMs: now,
          resolution: app.renderer.resolution,
        });
        app.renderer.resetState();
        app.render();
        if (statsPanel) {
          const reading = recordFrame(
            frameStats,
            performance.now(),
            drawnBy(loaded),
          );
          if (reading) showReading(statsPanel, reading);
        }
        frame = requestAnimationFrame(tick);
      };
      /**
       * A frame on the Start Screen: the keys and clicks choose, and until
       * they do the camera drifts over Town, its NPCs idle. Nothing is
       * stepped. Continue or New Hero begins play next frame, the camera on
       * the Hero at the start Entry and the Area Banner showing.
       */
      const tickStart = (realNow: number, viewport: Viewport) => {
        const start = menus.screen;
        if (start.type !== "start") return;
        // Nothing runs, so the Rotate Notice pauses nothing here; it only
        // takes the input and covers the screen.
        fitMenus(menus, viewport, realNow);
        menus.fullscreen = fullscreen.read();
        const asked = drainMenuInput(realNow, (at) =>
          clickStart(
            menus,
            renderer.startChoiceAt(at, start, menus.fullscreen),
          ),
        );
        // No click on the Start Screen steers the Hero once play begins.
        cancel(input);
        cancelTap(tap);
        last = gameTime(pause, realNow);
        if (asked === "fullscreen") {
          // Only from a key or the controller's A, which browsers don't
          // count as the player's own action, so one may refuse it.
          fullscreen.toggle();
        } else if (asked === "continue" || asked === "newHero") {
          if (asked === "newHero") {
            removeSave(storage);
            world = createShippedWorld({ seed: Date.now() });
            orders = [];
          }
          frame = requestAnimationFrame(tick);
          return;
        }
        const focus = startFocusAt(world.hero.pos, realNow);
        worldCamera = worldCameraOn(viewport, focus);
        drawnTarget = null;
        drawnItemInReach = null;
        renderer.drawStart(
          start,
          world.hero.progress.level,
          menus.fullscreen,
          menus.menuFocus,
        );
        drawWorld3d(loaded, {
          area: world.areas[world.areaName],
          view: startViewOf(world, focus, realNow),
          camera: worldCamera,
          nowMs: realNow,
          resolution: app.renderer.resolution,
        });
        app.renderer.resetState();
        app.render();
        if (statsPanel) {
          const reading = recordFrame(
            frameStats,
            performance.now(),
            drawnBy(loaded),
          );
          if (reading) showReading(statsPanel, reading);
        }
        frame = requestAnimationFrame(tick);
      };
      /** The controller buttons pressed this frame, for the screens before play. */
      const readPadPresses = (): readonly PadButton[] => {
        const controller = readGamepad(padHeld);
        padHeld = controller.held;
        return controller.pressed;
      };
      /** What the menus read of a Hero who isn't playing yet: alive. */
      const heroNotPlaying = { heroDead: false };
      /**
       * Feeds this frame's keys, controller buttons and (through `onClick`,
       * when given) click to the menus before play, and drops them. Returns
       * the first request the menus made, which the caller carries out.
       */
      const drainMenuInput = (
        realNow: number,
        onClick?: (at: Vec) => MenuRequest | null,
      ): MenuRequest | null => {
        let firstRequest: MenuRequest | null = null;
        const take = (request: MenuRequest | "handled" | null) => {
          if (
            firstRequest === null &&
            request !== null &&
            request !== "handled"
          ) {
            firstRequest = request;
          }
        };
        // Once one asked, the rest is dropped: the screen may be moving on.
        for (const key of keys) {
          if (firstRequest === null) {
            take(pressKey(menus, key, realNow, heroNotPlaying));
          }
        }
        for (const button of readPadPresses()) {
          if (firstRequest === null) {
            take(pressPad(menus, button, realNow, heroNotPlaying));
          }
        }
        if (clickedAt && onClick && firstRequest === null) {
          take(onClick(clickedAt));
        }
        clickedAt = null;
        keys = [];
        last = gameTime(pause, realNow);
        return firstRequest;
      };
      void load();
      frame = requestAnimationFrame(tick);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      listeners.abort();
      delete window.__wockstruction;
      // A failed `init()` already surfaces through the chain above.
      // The context is shared, so it goes last: three.js frees it.
      const disposeWorld3d = () => {
        if (world3d) disposeOf(world3d);
        else shared.context.getExtension("WEBGL_lose_context")?.loseContext();
      };
      init.then(() => {
        app.destroy(true, { children: true });
        disposeWorld3d();
      }, disposeWorld3d);
      statsPanel?.remove();
    };
  }, []);

  return <div ref={host} />;
}

/**
 * The order bringing Trade in step with the Vendor panel: open as the panel
 * opens, shut as it shuts any way.
 */
function tradeOrders(world: World, menus: Menus): Order[] {
  if (menus.vendorOpen === world.trading) return [];
  return [{ type: menus.vendorOpen ? "OpenTrade" : "CloseTrade" }];
}

/**
 * Orders an Item held as the Inventory or Vendor panel shuts back where it
 * came from (a good back to the Vendor at no cost), if one `wasOpen` and the
 * menus have both shut now.
 */
function returnOnShut(orders: Order[], wasOpen: boolean, menus: Menus) {
  if (wasOpen && !menus.inventoryOpen && !menus.vendorOpen) {
    orders.push({ type: "ReturnCursorItem" });
  }
}
