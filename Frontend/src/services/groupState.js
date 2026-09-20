/**
 * Pure group-state transitions (shared by App.jsx and the regression tests).
 *
 * Extracted so the create-group state update is a single, testable rule:
 * a server group is inserted EXACTLY once — a re-submit, a re-render race,
 * or a duplicate POST response can never produce two entries with the same
 * server id.
 */

/**
 * Append a group to state unless a group with the same id already exists.
 * Returns a new array (never mutates the input).
 */
export function appendGroupOnce(groups, group) {
  const safeGroups = Array.isArray(groups) ? groups : [];
  if (!group || !group.id) return safeGroups;
  if (safeGroups.some((g) => g && g.id === group.id)) return safeGroups;
  return [...safeGroups, group];
}
