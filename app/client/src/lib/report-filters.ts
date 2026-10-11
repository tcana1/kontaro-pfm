// Report filter arrays use string ids with 'all' (or empty) meaning "no filter".
// Returns null for "no filter" so it can be passed straight to the DB functions.
export function getDbFilterArray(filterArray: string[]): number[] | null {
  if (filterArray.includes('all') || filterArray.length === 0) return null;
  return filterArray.map((id) => parseInt(id, 10));
}
