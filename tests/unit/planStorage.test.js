import {
  getAllPlans,
  getPlansByBoss,
  savePlan,
  loadPlan,
  generatePlanId,
  sanitizeName,
  getDraft,
  saveDraft,
  deleteDraft,
  commitDraft,
} from "../../src/utils/planStorage";

/**
 * Minimal in-memory Web Storage implementation. The `node` test project has no
 * real `localStorage`, so this stands in for it.
 * `length` and `key` read `store` live (via a getter and Object.keys) rather
 * than snapshotting it once, so they stay correct as entries are added/removed.
 * @returns {Storage} - An object shaped like the global `localStorage`.
 */
function createLocalStorageMock() {
  let store = {};
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => {
      store[key] = String(value);
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (index) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };
}

beforeEach(() => {
  globalThis.localStorage = createLocalStorageMock();
});

afterEach(() => {
  globalThis.localStorage.clear();
});

describe("sanitizeName", () => {
  test.each([
    { input: "Foo", expected: "foo", description: "lowercases simple names" },
    {
      input: "New Plan",
      expected: "new-plan",
      description: "replaces spaces with dashes",
    },
    {
      input: "Foo (draft)",
      expected: "foo--draft-",
      description: "replaces each non-alphanumeric character individually",
    },
    {
      input: "Boss 2.0!",
      expected: "boss-2-0-",
      description: "replaces punctuation and symbols",
    },
  ])("$description", ({ input, expected }) => {
    expect(sanitizeName(input)).toBe(expected);
  });
});

describe("generatePlanId", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("combines bossId, the sanitized plan name, and a timestamp", () => {
    vi.spyOn(Date, "now").mockReturnValue(123456789);
    expect(generatePlanId("dancing-green", "My Plan!")).toBe(
      "dancing-green-my-plan--123456789",
    );
  });

  test("sanitizes punctuation the same way as sanitizeName", () => {
    vi.spyOn(Date, "now").mockReturnValue(1);
    expect(generatePlanId("boss", "Foo Bar (2)")).toBe("boss-foo-bar--2--1");
  });
});

describe("saveDraft", () => {
  test("creates exactly one key tagged isDraft: true", () => {
    const id = saveDraft({
      bossId: "dancing-green",
      planName: "New Plan",
      partyComp: { tank1: "PLD" },
      placements: [],
      sourcePlanId: null,
    });

    const draftEntries = Object.entries(getAllPlans()).filter(
      ([_, plan]) => plan.isDraft === true,
    );
    expect(draftEntries).toHaveLength(1);
    expect(draftEntries[0][0]).toBe(id);
  });

  test("builds the id from the sanitized base name, following `${bossId}-<sanitized>-draft`", () => {
    const id = saveDraft({
      bossId: "dancing-green",
      planName: "New Plan",
      partyComp: {},
      placements: [],
      sourcePlanId: null,
    });
    expect(id).toBe("dancing-green-new-plan-draft");
  });

  test("stores the plan name with a (draft) suffix", () => {
    saveDraft({
      bossId: "dancing-green",
      planName: "Foo",
      partyComp: {},
      placements: [],
      sourcePlanId: "foo-id",
    });
    expect(getDraft().planName).toBe("Foo (draft)");
  });

  test("replaces an existing draft instead of creating a second one", () => {
    saveDraft({
      bossId: "dancing-green",
      planName: "Foo",
      partyComp: { tank1: "PLD" },
      placements: [],
      sourcePlanId: "foo-id",
    });
    saveDraft({
      bossId: "dancing-green",
      planName: "Bar",
      partyComp: { tank1: "WAR" },
      placements: [],
      sourcePlanId: "bar-id",
    });

    const draftEntries = Object.entries(getAllPlans()).filter(
      ([_, plan]) => plan.isDraft === true,
    );
    expect(draftEntries).toHaveLength(1);
    expect(draftEntries[0][1].planName).toBe("Bar (draft)");
  });

  test("saving a draft with a new placement does not write it to the source plan", () => {
    savePlan("foo-id", {
      bossId: "dancing-green",
      planName: "Foo",
      partyComp: {},
      placements: [],
    });

    saveDraft({
      bossId: "dancing-green",
      planName: "Foo",
      partyComp: {},
      placements: [{ id: "rampart", startTime: 5 }],
      sourcePlanId: "foo-id",
    });

    expect(loadPlan("foo-id").placements).toEqual([]);
  });
});

describe("getDraft", () => {
  test("returns null when no draft exists", () => {
    expect(getDraft()).toBe(null);
  });

  test("returns the draft, including its planId, when one exists", () => {
    const id = saveDraft({
      bossId: "dancing-green",
      planName: "Foo",
      partyComp: { tank1: "PLD" },
      placements: [{ id: "rampart", startTime: 5 }],
      sourcePlanId: "foo-id",
    });

    expect(getDraft()).toMatchObject({
      planId: id,
      bossId: "dancing-green",
      planName: "Foo (draft)",
      partyComp: { tank1: "PLD" },
      placements: [{ id: "rampart", startTime: 5 }],
      sourcePlanId: "foo-id",
      isDraft: true,
    });
  });
});

describe("deleteDraft", () => {
  test("is a safe no-op when there's no draft", () => {
    expect(() => deleteDraft()).not.toThrow();
    expect(getDraft()).toBe(null);
  });

  test("removes an existing draft", () => {
    saveDraft({
      bossId: "dancing-green",
      planName: "Foo",
      partyComp: {},
      placements: [],
      sourcePlanId: "foo-id",
    });

    deleteDraft();

    expect(getDraft()).toBe(null);
  });

  test("does not remove non-draft plans", () => {
    savePlan("foo-id", {
      bossId: "dancing-green",
      planName: "Foo",
      partyComp: {},
      placements: [],
    });
    saveDraft({
      bossId: "dancing-green",
      planName: "Foo",
      partyComp: {},
      placements: [],
      sourcePlanId: "foo-id",
    });

    deleteDraft();

    expect(loadPlan("foo-id")).not.toBe(null);
  });
});

describe("commitDraft", () => {
  test("writes partyComp/placements onto sourcePlanId, preserving the original's planName and bossId", () => {
    savePlan("foo-id", {
      bossId: "dancing-green",
      planName: "Foo",
      partyComp: { tank1: "PLD" },
      placements: [],
    });
    saveDraft({
      bossId: "dancing-green",
      planName: "Foo",
      partyComp: { tank1: "WAR" },
      placements: [{ id: "rampart", startTime: 5 }],
      sourcePlanId: "foo-id",
    });

    commitDraft(getDraft());

    expect(loadPlan("foo-id")).toMatchObject({
      bossId: "dancing-green",
      planName: "Foo",
      partyComp: { tank1: "WAR" },
      placements: [{ id: "rampart", startTime: 5 }],
    });
  });

  test("leaves no draft behind after committing", () => {
    savePlan("foo-id", {
      bossId: "dancing-green",
      planName: "Foo",
      partyComp: {},
      placements: [],
    });
    saveDraft({
      bossId: "dancing-green",
      planName: "Foo",
      partyComp: { tank1: "WAR" },
      placements: [],
      sourcePlanId: "foo-id",
    });

    commitDraft(getDraft());

    expect(getDraft()).toBe(null);
  });

  test("clears isDraft on the committed plan so it isn't mistaken for a draft later", () => {
    savePlan("foo-id", {
      bossId: "dancing-green",
      planName: "Foo",
      partyComp: {},
      placements: [],
    });
    saveDraft({
      bossId: "dancing-green",
      planName: "Foo",
      partyComp: { tank1: "WAR" },
      placements: [],
      sourcePlanId: "foo-id",
    });

    commitDraft(getDraft());

    expect(loadPlan("foo-id").isDraft).toBe(false);
  });

  test("throws when the draft has no sourcePlanId", () => {
    saveDraft({
      bossId: "dancing-green",
      planName: "New Plan",
      partyComp: {},
      placements: [],
      sourcePlanId: null,
    });

    expect(() => commitDraft(getDraft())).toThrow();
  });
});

describe("getPlansByBoss", () => {
  test("includes the draft alongside saved plans for the same boss", () => {
    savePlan("foo-id", {
      bossId: "dancing-green",
      planName: "Foo",
      partyComp: {},
      placements: [],
    });
    saveDraft({
      bossId: "dancing-green",
      planName: "Foo",
      partyComp: {},
      placements: [],
      sourcePlanId: "foo-id",
    });

    const plans = getPlansByBoss("dancing-green");
    expect(plans.some((plan) => plan.isDraft === true)).toBe(true);
  });

  test("excludes drafts belonging to a different boss", () => {
    saveDraft({
      bossId: "other-boss",
      planName: "Foo",
      partyComp: {},
      placements: [],
      sourcePlanId: null,
    });

    expect(
      getPlansByBoss("dancing-green").some((plan) => plan.isDraft === true),
    ).toBe(false);
  });
});
