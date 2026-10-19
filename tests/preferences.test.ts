import { describe, expect, it } from "vitest";
import { InMemoryPreferenceStore } from "../src/preferences/InMemoryPreferenceStore.js";

describe("InMemoryPreferenceStore", () => {
  it("enables every category by default", () => {
    const store = new InMemoryPreferenceStore();
    expect(store.get(1)).toEqual({ GAME: true, SOCIAL: true });
    expect(store.isEnabled(1, "SOCIAL")).toBe(true);
  });

  it("applies partial updates per player without affecting others", () => {
    const store = new InMemoryPreferenceStore();
    expect(store.update(1, { SOCIAL: false })).toEqual({ GAME: true, SOCIAL: false });
    store.update(1, { GAME: false });
    expect(store.get(1)).toEqual({ GAME: false, SOCIAL: false });
    expect(store.get(2)).toEqual({ GAME: true, SOCIAL: true });
  });

  it("returns copies so callers cannot mutate stored state", () => {
    const store = new InMemoryPreferenceStore();
    const prefs = store.get(1);
    prefs.GAME = false;
    expect(store.isEnabled(1, "GAME")).toBe(true);
  });
});
