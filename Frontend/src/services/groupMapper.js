/**
 * Task 8 mapper: Backend Group DTO → existing frontend group model.
 *
 * Precedence (Task 8 contract):
 *   Server group data > local cached group data
 *
 * The mapped object keeps the frontend's exact existing group shape
 * (id/name/currency/isRoommateGroup/members/expenses) plus additive fields, so
 * every existing component keeps working unchanged. The signed-in user's
 * member id stays the literal "you" (the app-wide convention used by balances,
 * filters and the PeopleManager), achieved by mapping only the viewer's server
 * user id to "you"; other members keep their server UUIDs as ids.
 *
 * Expenses remain LOCAL for now (Task 8 scope): the server has no expense data
 * the UI can consume yet, so mapped groups merge in the viewer's local
 * expenses for the matching local group (matched by server id when known,
 * else name) and default to none. Server groups are marked with
 * `isServerGroup: true` so App.jsx can protect them from local-only mutations
 * (member add/rename/remove, delete) that would silently diverge from the DB.
 */

/** GroupSummary/GroupDetails DTO → frontend group model. */
export function mapGroupFromApi(dto, { localGroup = null, myUserId = null } = {}) {
  if (!dto || typeof dto !== "object" || !dto.id) return null;

  const members = mapMembersFromApi(dto, myUserId);

  const mapped = {
    id: dto.id,
    name: dto.name,
    currency: dto.currencyCode || "INR",
    isRoommateGroup: Boolean(dto.isRoommateGroup),
    members,
    expenses: [],
    // --- additive server-group metadata (unknown to the old local model) ---
    isServerGroup: true,
    serverDescription: dto.description ?? null,
    viewerRole: dto.viewerRole ?? null,
    memberCount: dto.memberCount ?? members.length,
    joinedAt: dto.joinedAt ?? null,
  };

  // Local expenses carry over (kept local by design in Task 8). Match by
  // server id when the local group was previously mapped, else by name so
  // demo/local data still shows up under its server-backed group.
  if (localGroup && Array.isArray(localGroup.expenses)) {
    const sameIdentity =
      localGroup.id === dto.id ||
      (typeof localGroup.name === "string" && localGroup.name === dto.name);
    if (sameIdentity) {
      mapped.expenses = localGroup.expenses;
    }
  }
  return mapped;
}

/**
 * Member projection. The viewer becomes id "you" (existing convention);
 * everything else keeps the server UUID. Only minimum safe public fields are
 * exposed (userId/displayName/role) — no emails, no Firebase details.
 */
export function mapMembersFromApi(dto, myUserId) {
  const source =
    Array.isArray(dto.members) && dto.members.length > 0
      ? dto.members.map((m) => ({
          userId: m.userId,
          name: m.displayName,
          role: m.role,
        }))
      : Array.isArray(dto.memberships)
        ? dto.memberships.map((m) => ({
            userId: m.userId,
            name: m.displayName,
            role: m.role,
          }))
        : [];

  return source.map((m, idx) => {
    const isViewer =
      (myUserId && m.userId === myUserId) ||
      (!myUserId && source.length === 1 && dto.viewerRole === "OWNER");
    const memberId = isViewer ? "you" : m.userId || `m_${idx}_${Date.now()}`;
    const name = typeof m.name === "string" && m.name.trim().length > 0 ? m.name.trim() : "Member";

    return {
      id: memberId,
      name,
      role: m.role || "MEMBER",
      userId: m.userId || null,
      upiId: m.upiId || null,
      upiQrDataUrl: m.upiQrDataUrl || null,
    };
  });
}

/** Map a full groups list; `localGroups` provides the local-expense carryover. */
export function mapGroupsFromApi(list, { localGroups = [], myUserId = null } = {}) {
  if (!Array.isArray(list)) return [];
  const byName = new Map(
    localGroups.map((g) => [g.name, g]).filter(([name]) => typeof name === "string")
  );
  const byId = new Map(
    localGroups.map((g) => [g.id, g]).filter(([id]) => typeof id === "string")
  );
  const mapped = [];
  for (const dto of list) {
    const localGroup =
      byId.get(dto.id) ||
      (typeof dto.name === "string" ? byName.get(dto.name) : undefined) ||
      null;
    const group = mapGroupFromApi(dto, { localGroup, myUserId });
    if (group) mapped.push(group);
  }
  return mapped;
}

const SEED_GROUP_IDS = new Set(["g_goa", "g_flat", "g_college"]);

/**
 * Merge mapped server groups with the app's current group state.
 *
 * Precedence: server data wins. Local entries that collide with a server
 * group (same id, or same name — a pre-integration "local twin") are dropped
 * so there is never a second source of truth for the same group. Genuinely
 * local-only groups (offline/unpersisted) survive untouched, while default
 * seed demo groups are discarded so new users never inherit demo data.
 */
export function mergeServerAndLocalGroups(mappedServer, currentGroups, { filterSeedGroups = true } = {}) {
  const serverIds = new Set(mappedServer.map((g) => g.id));
  const serverNames = new Set(
    mappedServer.map((g) => String(g.name).toLowerCase())
  );
  const localOnly = (currentGroups || []).filter(
    (g) =>
      !g.isServerGroup &&
      !serverIds.has(g.id) &&
      !serverNames.has(String(g.name).toLowerCase()) &&
      (!filterSeedGroups || !SEED_GROUP_IDS.has(g.id))
  );
  return [...mappedServer, ...localOnly];
}

