import { computed, signal } from "@angular/core";

/** Page-local continuation. A new stable selection object hides all old cursors. */
export function createCursorTrail<Entry = string>(selection: () => unknown) {
  const first: (Entry | undefined)[] = [undefined];
  const state = signal<
    { key: unknown; entries: (Entry | undefined)[] } | undefined
  >(undefined);
  const entries = computed(() =>
    state()?.key === selection() ? (state()?.entries ?? first) : first,
  );

  return {
    entry: computed(() => entries().at(-1)),
    number: computed(() => entries().length),
    next: (entry: Entry) =>
      state.set({ key: selection(), entries: [...entries(), entry] }),
    previous: () => {
      if (entries().length > 1)
        state.set({ key: selection(), entries: entries().slice(0, -1) });
    },
    reset: () => state.set({ key: selection(), entries: first }),
  };
}
