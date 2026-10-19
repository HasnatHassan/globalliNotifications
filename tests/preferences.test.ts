import { describe, expect, it } from "vitest";
import { InMemoryPreferenceStore } from "../src/preferences/InMemoryPreferenceStore.js";
import type { CategoryPreferences } from "../src/preferences/PreferenceStore.js";

describe("InMemoryPreferenceStore", () => {
  it("enables every category by default", async () => {
    const store = new InMemoryPreferenceStore();
    expect(await store.get(1)).toEqual({ GAME: true, SOCIAL: true });
    expect(await store.isEnabled(1, "SOCIAL")).toBe(true);
  });

  it("applies partial updates per player without affecting others", async () => {
    const store = new InMemoryPreferenceStore();
    expect(await store.update(1, { SOCIAL: false })).toEqual({ GAME: true, SOCIAL: false });
    await store.update(1, { GAME: false });
    expect(await store.get(1)).toEqual({ GAME: false, SOCIAL: false });
    expect(await store.get(2)).toEqual({ GAME: true, SOCIAL: true });
  });

  it("ignores non-boolean values that bypass the type system", async () => {
    const store = new InMemoryPreferenceStore();
    const sneaky = { GAME: undefined, SOCIAL: "no" } as unknown as Partial<CategoryPreferences>;
    expect(await store.update(1, sneaky)).toEqual({ GAME: true, SOCIAL: true });
    expect(await store.isEnabled(1, "GAME")).toBe(true);
  });

  it("returns copies so callers cannot mutate stored state", async () => {
    const store = new InMemoryPreferenceStore();
    const prefs = await store.get(1);
    prefs.GAME = false;
    expect(await store.isEnabled(1, "GAME")).toBe(true);
  });
});
