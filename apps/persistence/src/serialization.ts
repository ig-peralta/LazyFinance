export type WireValue<T> = T extends Date
  ? string
  : T extends readonly (infer Item)[]
    ? WireValue<Item>[]
    : T extends object
      ? { [Key in keyof T]: WireValue<T[Key]> }
      : T;

/** JSON-safe stored facts, with timestamps represented as ISO strings. */
export function wireValue<T>(value: T): WireValue<T> {
  // pg numeric/int8 values are strings; only timestamps require JSON adaptation.
  return JSON.parse(JSON.stringify(value)) as WireValue<T>;
}
