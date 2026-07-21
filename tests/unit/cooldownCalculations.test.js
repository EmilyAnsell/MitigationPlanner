import {
  canPlaceAbilityAt,
  hasCooldownConflict,
  getAbilitiesForSlot,
  formatTime,
  getEffectiveDuration,
} from "../../src/utils/cooldownCalculations";
import { getJobAbilities } from "../../src/data/jobs";

/**
 * Mocking a minimum JOBS object for testing purposes.
 * @returns jobs object with a few sample jobs.
 */
function mockJOBS() {
  const jobs = {
    PLD: {
      name: "Paladin",
      role: "Tank",
      color: "#A8D2E6",
      abilities: [
        {
          id: "holy-sheltron",
          name: "Holy Sheltron",
        },
        {
          id: "bulwark",
          name: "Bulwark",
        },
      ],
    },
    WHM: {},
    DRG: {},
    BRD: {},
    BLM: {},
  };
  return jobs;
}

vi.mock("../../src/data/jobs", () => ({
  getJobAbilities: vi.fn(),
}));

describe("canPlaceAbilityAt", () => {
  test("accepts a placement when no existing placements are present", () => {
    const existingPlacements = [];
    const ability = {
      slot: "tank1",
      id: "rampart",
      cooldown: 90,
      duration: 20,
    };
    const testTime = 10;
    const maxCharges = 1;
    expect(
      canPlaceAbilityAt(existingPlacements, ability, testTime, maxCharges),
    ).toBe(true);
  });

  test("accepts a placement when no maxCharges are specified (defaults to 1)", () => {
    const existingPlacements = [];
    const ability = {
      slot: "tank1",
      id: "rampart",
      cooldown: 90,
      duration: 20,
    };
    const testTime = 10;
    expect(canPlaceAbilityAt(existingPlacements, ability, testTime)).toBe(true);
  });

  test("accepts a placement when charge has come off cooldown", () => {
    const existingPlacements = [
      {
        id: "oblation",
        name: "Oblation",
        slot: "tank1",
        charges: 2,
        cooldown: 60,
        duration: 8,
        startTime: 5,
      },
      {
        charges: 2,
        cooldown: 60,
        duration: 8,
        id: "oblation",
        name: "Oblation",
        slot: "tank1",
        startTime: 12,
      },
    ];
    const ability = {
      slot: "tank1",
      id: "oblation",
      cooldown: 60,
      duration: 8,
      charges: 2,
    };
    const testTime = 65;
    const maxCharges = ability.charges;
    expect(
      canPlaceAbilityAt(existingPlacements, ability, testTime, maxCharges),
    ).toBe(true);
  });

  test.each([
    [0, "before the first charge is used"],
    [10, "after the first charge, before the second"],
    [20, "after both charges are used"],
  ])("conflict when no charges remain (testTime=%i, %s)", (testTime) => {
    const existingPlacements = [
      {
        id: "oblation",
        name: "Oblation",
        slot: "tank1",
        charges: 2,
        cooldown: 60,
        duration: 8,
        startTime: 5,
      },
      {
        id: "rampart",
        name: "Rampart",
        slot: "tank1",
        cooldown: 90,
        duration: 20,
        startTime: 6,
      },
      {
        charges: 2,
        cooldown: 60,
        duration: 8,
        id: "oblation",
        name: "Oblation",
        slot: "tank1",
        startTime: 12,
      },
    ];
    const ability = {
      slot: "tank1",
      id: "oblation",
      cooldown: 60,
      duration: 8,
      charges: 2,
    };
    const maxCharges = ability.charges;
    expect(
      canPlaceAbilityAt(existingPlacements, ability, testTime, maxCharges),
    ).toBe(false);
  });

  test("sorts placements internally so out-of-order input is handled", () => {
    const existingPlacements = [
      {
        id: "rampart",
        name: "Rampart",
        slot: "tank1",
        cooldown: 90,
        duration: 20,
        startTime: 100, // later than the candidate time below, so input is out of order
      },
    ];
    const ability = {
      slot: "tank1",
      id: "rampart",
      cooldown: 90,
      duration: 20,
    };
    const testTime = 10; // one cooldown (90s) before the placed Rampart, so a charge is free
    expect(canPlaceAbilityAt(existingPlacements, ability, testTime)).toBe(true);
  });
});

describe("hasCooldownConflict", () => {
  let placements = [];
  beforeEach(() => {
    placements = [
      {
        id: "oblation",
        name: "Oblation",
        slot: "tank1",
        charges: 2,
        cooldown: 60,
        duration: 8,
        startTime: 5,
        placementId: 0,
      },
      {
        id: "rampart",
        name: "Rampart",
        slot: "tank1",
        cooldown: 90,
        duration: 20,
        startTime: 6,
        placementId: 1,
      },
    ];
  });

  test("conflict detected when ability is placed within cooldown of a placed ability", () => {
    const ability = {
      slot: "tank1",
      id: "rampart",
      cooldown: 90,
      duration: 20,
    };
    const startTime = 10;
    expect(hasCooldownConflict(placements, ability, startTime, null)).toBe(
      true,
    );
  });

  test("conflict detected when ability is placed with a cooldown which extends past the start of a placed ability", () => {
    const ability = {
      slot: "tank1",
      id: "rampart",
      cooldown: 90,
      duration: 20,
    };
    const startTime = 1;
    expect(hasCooldownConflict(placements, ability, startTime, null)).toBe(
      true,
    );
  });

  test("no conflict when ability is placed outside of cooldown of a placed ability", () => {
    const ability = {
      slot: "tank1",
      id: "rampart",
      cooldown: 90,
      duration: 20,
    };
    const startTime = 120;
    expect(hasCooldownConflict(placements, ability, startTime, null)).toBe(
      false,
    );
  });

  test("no conflict when ability is placed with a start time that is exactly at the end of a placed ability's cooldown", () => {
    const ability = {
      slot: "tank1",
      id: "rampart",
      cooldown: 90,
      duration: 20,
    };
    const startTime = 96;
    expect(hasCooldownConflict(placements, ability, startTime, null)).toBe(
      false,
    );
  });

  test("no conflict when ability with multiple charges is placed with charges remaining", () => {
    const ability = {
      slot: "tank1",
      id: "oblation",
      cooldown: 60,
      duration: 8,
      charges: 2,
    };
    const startTime = 10;
    expect(hasCooldownConflict(placements, ability, startTime, null)).toBe(
      false,
    );
  });

  test("no conflict when placed ability is dragged to a new time which does not conflict with other cooldowns", () => {
    const ability = {
      slot: "tank1",
      id: "rampart",
      cooldown: 90,
      duration: 20,
      placementId: 1,
    };
    const startTime = 11;
    const excludePlacementId = ability.placementId;
    expect(
      hasCooldownConflict(placements, ability, startTime, excludePlacementId),
    ).toBe(false);
  });

  test("conflict detected when placed ability is dragged to a new time which conflicts with other cooldowns", () => {
    const placementsTwoRampart = [
      ...placements,
      {
        id: "rampart",
        name: "Rampart",
        slot: "tank1",
        cooldown: 90,
        duration: 20,
        startTime: 120,
        placementId: 2,
      },
    ];
    const ability = {
      slot: "tank1",
      id: "rampart",
      cooldown: 90,
      duration: 20,
      placementId: 1,
    };
    const startTime = 100;
    const excludePlacementId = ability.placementId;
    expect(
      hasCooldownConflict(
        placementsTwoRampart,
        ability,
        startTime,
        excludePlacementId,
      ),
    ).toBe(true);
  });

  test("no conflict when the same ability is placed in a different party slot", () => {
    const ability = {
      slot: "tank2",
      id: "rampart",
      cooldown: 90,
      duration: 20,
    };
    const startTime = 10; // would conflict if this were tank1
    expect(hasCooldownConflict(placements, ability, startTime, null)).toBe(
      false,
    );
  });

  test("no conflict when a different ability shares the slot and start time", () => {
    const ability = {
      slot: "tank1",
      id: "reprisal",
      cooldown: 60,
      duration: 15,
    };
    const startTime = 6; // same slot and time as the placed Rampart
    expect(hasCooldownConflict(placements, ability, startTime, null)).toBe(
      false,
    );
  });

  test("conflict detected when a pre-pull placement falls within cooldown of an on-pull placement", () => {
    const ability = {
      slot: "tank1",
      id: "rampart",
      cooldown: 90,
      duration: 20,
    };
    const startTime = -5; // 11s before the placed Rampart at t=6, inside its 90s cooldown
    expect(hasCooldownConflict(placements, ability, startTime, null)).toBe(
      true,
    );
  });
});

describe("getAbilitiesForSlot", () => {
  afterEach(() => {
    vi.resetAllMocks(); // resetAllMocks clears return values too; clearAllMocks only clears call history
  });

  test("returns abilities for a valid job in the party composition", () => {
    const partyComp = { tank1: "PLD" };
    const slot = "tank1";
    const jobs = mockJOBS();
    getJobAbilities.mockReturnValue(jobs.PLD.abilities);
    expect(getAbilitiesForSlot(partyComp, slot, jobs)).toEqual([
      {
        id: "holy-sheltron",
        name: "Holy Sheltron",
        jobId: "PLD",
        jobName: "Paladin",
        color: "#A8D2E6",
        slot: "tank1",
      },
      {
        id: "bulwark",
        name: "Bulwark",
        jobId: "PLD",
        jobName: "Paladin",
        color: "#A8D2E6",
        slot: "tank1",
      },
    ]);
  });

  test("returns empty array when no job is assigned to the slot", () => {
    const partyComp = { tank1: "PLD", tank2: null, healer1: "WHM" };
    const slot = "tank2";
    const jobs = mockJOBS();
    expect(getAbilitiesForSlot(partyComp, slot, jobs)).toEqual([]);
  });

  test("returns empty array when job ID is invalid", () => {
    const partyComp = { dps1: "BLU" };
    const slot = "dps1";
    const jobs = mockJOBS();
    expect(getAbilitiesForSlot(partyComp, slot, jobs)).toEqual([]);
  });
});

describe("formatTime", () => {
  test.each([
    { seconds: 65, expected: "1:05", description: "positive seconds" },
    { seconds: -4, expected: "-0:04", description: "negative seconds" },
    { seconds: -0, expected: "0:00", description: "zero seconds" },
    { seconds: 60, expected: "1:00", description: "exact minute boundary" },
    {
      seconds: 600,
      expected: "10:00",
      description: "exact multi-digit minutes",
    },
  ])("formats $description", ({ seconds, expected }) => {
    expect(formatTime(seconds)).toBe(expected);
  });
});

describe("getEffectiveDuration", () => {
  test("returns the full duration when placement is completely within timeline", () => {
    const placement = { startTime: 2, duration: 5 };
    const timelineDuration = 10;
    expect(getEffectiveDuration(placement, timelineDuration)).toBe(5);
  });

  test("returns the clipped duration when placement extends beyond timeline", () => {
    const placement = { startTime: 8, duration: 5 };
    const timelineDuration = 10;
    expect(getEffectiveDuration(placement, timelineDuration)).toBe(2);
  });

  test("returns 0 when placement starts at the final second of the timeline", () => {
    const placement = { startTime: 10, duration: 5 };
    const timelineDuration = 10;
    expect(getEffectiveDuration(placement, timelineDuration)).toBe(0);
  });

  test("returns the full duration when placement ends exactly at the timeline end", () => {
    const placement = { startTime: 5, duration: 5 };
    const timelineDuration = 10;
    expect(getEffectiveDuration(placement, timelineDuration)).toBe(5);
  });

  /* Abilities with no duration, like Second Wind, have not been handled in UX design yet.
  When they are, I suspect the duration will be null rather than 0, so this test is written to expect null. */
  test("returns null when an ability with no duration is placed", () => {
    const placement = { startTime: 1, duration: null };
    const timelineDuration = 10;
    expect(getEffectiveDuration(placement, timelineDuration)).toBe(null);
  });

  test("allows for negative start times (pre-pull) and returns the full duration if within timeline", () => {
    const placement = { startTime: -3, duration: 5 };
    const timelineDuration = 10;
    expect(getEffectiveDuration(placement, timelineDuration)).toBe(5);
  });
});
