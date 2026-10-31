/** Mouse, controller and touch input and its feedback, in human units. */
export type InputTuning = {
  /** While the button is held, how often the Hero re-targets the cursor (ms). */
  retargetMs: number;
  /** How long the click marker shows (ms). */
  clickMarkerMs: number;
  /**
   * How far the stick must be pushed (0 at rest to 1 all the way) before it
   * walks the Hero, so a worn stick doesn't drift.
   */
  stickDeadZone: number;
  /**
   * How wide the cone ahead of the stick is that auto-aim picks the Target
   * in while the stick walks the Hero, from one edge to the other (degrees).
   * With the stick at rest there is no cone: the Target is the nearest
   * Monster within reach, whichever way it lies.
   */
  targetConeDegrees: number;
  /** How far from the Hero auto-aim picks the Target (tiles). */
  targetRange: number;
  /**
   * How near the Hero a Ground Item must lie for A, with no Target, to pick
   * it up (tiles).
   */
  groundItemReach: number;
  /**
   * How near the Hero an NPC must stand for A, with no Target, to talk to
   * it (tiles).
   */
  npcReach: number;
  /**
   * How far ahead of the Hero a controller casts a Skill when there is no
   * Target (tiles).
   */
  castDistance: number;
  /**
   * How long a touch on an Item or Skill must stay down to show its tooltip
   * instead of tapping it (ms).
   */
  longPressMs: number;
  /** The bone-ash puff the click marker shows. */
  clickPuff: {
    /** How many motes it has. */
    motes: number;
    /** How far a mote spreads from the click point at most (tiles). */
    reach: number;
    /** How high a mote rises at most (tiles). */
    rise: number;
    /** How big a mote is at most (tiles across). */
    size: number;
    /** The motes' colour, the same in every Area. */
    colour: number;
  };
};

export const inputTuning: InputTuning = {
  retargetMs: 120,
  clickMarkerMs: 400,
  stickDeadZone: 0.2,
  targetConeDegrees: 90,
  targetRange: 6,
  groundItemReach: 1.5,
  npcReach: 2,
  castDistance: 3,
  longPressMs: 450,
  clickPuff: {
    motes: 8,
    reach: 0.5,
    rise: 0.15,
    size: 0.09,
    colour: 0xe6dcc3,
  },
};
