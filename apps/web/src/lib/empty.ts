/** Stable empty arrays so `data ?? EMPTY` keeps hook dependencies referentially stable. */
export const EMPTY: never[] = [];
