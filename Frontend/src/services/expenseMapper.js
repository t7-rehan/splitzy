/**
 * Task 9 mapper: Backend Expense DTO ↔ existing frontend expense model.
 *
 * This module is the COMPATIBILITY BOUNDARY and the single money-conversion
 * seam between the server's integer minor units (BigInt serialized as
 * strings) and the frontend's existing major-unit number model. No UI
 * component ever sees a backend UUID mapping rule or a minor-unit value.
 *
 * Conventions preserved:
 *   - The signed-in user's member id stays the literal "you" (app-wide
 *     convention used by balances, filters and the modals); every other
 *     member keeps their server user id.
 *   - Split types are lowercase locally ("equal" | "percentage" | "itemized")
 *     and SCREAMING_CASE on the API ("EQUAL" | "PERCENTAGE" | "ITEMIZED").
 *
 * Server-authoritative shares (Task 9): the backend computes every
 * participant share in integer minor units. The mapper carries those exact
 * shares onto the expense as `serverShares` and storage.getShares() prefers
 * them, so displayed shares/balances are ALWAYS the server's values — the
 * frontend never re-derives persisted shares for server-backed expenses.
 *
 * Percentages: the API edge uses integer basis points (1 bp = 0.01%),
 * matching the backend's Decimal(5,2) precision; the local model uses
 * 0–100 numbers.
 */

/** Local split type → API split type. */
export function splitTypeToApi(splitType) {
  switch (splitType) {
    case "equal":
      return "EQUAL";
    case "percentage":
      return "PERCENTAGE";
    case "itemized":
      return "ITEMIZED";
    default:
      throw new Error(`Unknown split type: ${splitType}`);
  }
}

/** API split type → local split type. */
export function splitTypeFromApi(value) {
  switch (value) {
    case "EQUAL":
      return "equal";
    case "PERCENTAGE":
      return "percentage";
    case "ITEMIZED":
      return "itemized";
    default:
      return "equal";
  }
}

/**
 * Major-unit number (frontend) → minor-unit string (API). Pure string
 * math — never floats — so ₹100.01 -> "10001" and ₹0.01 -> "1" exactly.
 * Returns null when the input is not a finite non-negative number.
 */
export function toApiMinorUnits(majorAmount) {
  const raw = typeof majorAmount === "string" ? majorAmount.trim() : majorAmount;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return null;
  // Integer part + at most 2 fractional digits as a plain digit string.
  const fixed = raw.toFixed(2);
  const [wholePart, fracPart = ""] = fixed.split(".");
  const whole = wholePart.replace(/^0+(?=\d)/, "");
  const frac = (fracPart + "00").slice(0, 2);
  const digits = `${whole}${frac}`.replace(/^0+(?=\d)/, "");
  return digits.length > 0 ? digits : "0";
}

/**
 * Minor-unit string (API) → major-unit number (frontend display).
 * Integer-safe for typical 2-decimal currencies; the ONLY place this
 * conversion happens for display data.
 */
export function fromApiMinorUnits(minorString) {
  const n = Number(minorString);
  return Number.isFinite(n) ? n / 100 : 0;
}

/** Local percent (0–100) → integer basis points (1 bp = 0.01%). */
export function percentToBasisPoints(pct) {
  const n = typeof pct === "number" ? pct : parseFloat(pct);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

/**
 * Response percentage string ("33.33", fixed 2-decimal, matching the
 * backend's Decimal(5,2)) → local percent (0–100). NOTE: basis points apply
 * only to REQUEST payloads; the API returns plain decimal strings.
 */
export function percentageStringToPercent(value) {
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Distribute rounding drift (≤ 1 bp per entry, from decimal percent input)
 * onto the largest entries so the request totals exactly 10000 bp. The
 * backend still re-validates and remains authoritative — this only stops
 * harmless input rounding from failing an otherwise-valid 100% split.
 */
function correctBasisPointDrift(bps) {
  const entries = Object.entries(bps);
  if (entries.length === 0) return bps;
  const total = entries.reduce((sum, [, bp]) => sum + bp, 0);
  let drift = 10000 - total;
  if (drift === 0 || Math.abs(drift) > entries.length) return bps;
  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  const corrected = { ...bps };
  for (const [userId] of sorted) {
    if (drift === 0) break;
    corrected[userId] += drift > 0 ? 1 : -1;
    drift += drift > 0 ? -1 : 1;
  }
  return corrected;
}

/**
 * Build an Expenses API request payload from the local expense shape used by
 * AddExpenseModal / GroupDetailScreen. `group` provides the member list whose
 * `userId` fields carry the server user ids (the viewer's member id is the
 * local "you"; its `userId` is the server UUID).
 *
 * Identity rules: only member-content fields are sent. No expense id, group
 * id, creator, timestamps or "you" ever reach the API — the server owns those.
 */
export function buildExpenseApiPayload(expense, group) {
  if (!expense || !group) throw new Error("Expense and group are required");

  const memberIds = new Set(group.members.map((m) => m.id));
  const serverIdOf = (memberId) => {
    if (memberId === "you") {
      const me = group.members.find((m) => m.id === "you");
      return me?.userId || null;
    }
    return memberIds.has(memberId) ? memberId : null;
  };
  const requireServerId = (memberId, field) => {
    const userId = serverIdOf(memberId);
    if (!userId) {
      throw new Error(`${field} references a person who is not a member of this group`);
    }
    return userId;
  };

  const payload = {
    description: String(expense.desc || "").trim(),
    category: expense.category || "Other",
    currencyCode: group.currency || "INR",
    paidByUserId: requireServerId(expense.paidBy, "paidByUserId"),
  };
  if (expense.date) payload.expenseDate = expense.date;

  const splitType = splitTypeToApi(expense.splitType || "equal");
  payload.splitType = splitType;
  payload.amountMinor = toApiMinorUnits(expense.amount);
  if (!payload.amountMinor || payload.amountMinor === "0") {
    throw new Error("Expense amount must be greater than zero");
  }

  if (splitType === "EQUAL") {
    payload.participants = (expense.participants || [])
      .filter((id) => memberIds.has(id))
      .map((id) => requireServerId(id, "participants"));
  } else if (splitType === "PERCENTAGE") {
    const bps = {};
    for (const [memberId, pct] of Object.entries(expense.percentages || {})) {
      const userId = serverIdOf(memberId);
      if (userId) bps[userId] = percentToBasisPoints(pct);
    }
    payload.percentages = correctBasisPointDrift(bps);
  } else {
    payload.items = (expense.items || []).map((item) => ({
      name: String(item.name || "").trim(),
      amountMinor: toApiMinorUnits(parseFloat(item.price)),
      participantUserIds: (item.participants || [])
        .filter((id) => memberIds.has(id))
        .map((id) => requireServerId(id, "item participant")),
    }));
  }
  return payload;
}

/**
 * Reduce a mapped server expense (or a modal payload) to a comparable
 * fingerprint of the fields a split update covers, so a fields-only edit
 * (description/category/date) sends NO split fields and the backend's
 * fields-only path preserves participant/item rows (Task 6 contract).
 */
export function splitFingerprint(expense, group) {
  const p = buildExpenseApiPayload(expense, group);
  const parts = [
    p.amountMinor,
    p.splitType,
    (p.participants || []).join(","),
    Object.entries(p.percentages || {})
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${k}=${v}`)
      .join(","),
    (p.items || [])
      .map((it) => `${it.name}:${it.amountMinor}:${[...(it.participantUserIds || [])].sort().join("+")}`)
      .join("|"),
  ];
  return parts.join("~");
}

/**
 * Build the PATCH body for an expense edit. Split fields are included only
 * when the split actually changed — otherwise the request is fields-only and
 * the server keeps the stored participant/item rows untouched.
 */
export function buildExpensePatchPayload(expense, group, existingExpense) {
  const payload = buildExpenseApiPayload(expense, group);
  const patch = {
    description: payload.description,
    category: payload.category,
    ...(payload.expenseDate ? { expenseDate: payload.expenseDate } : {}),
    paidByUserId: payload.paidByUserId,
  };
  const splitKeys = ["amountMinor", "splitType", "participants", "percentages", "items"];
  if (existingExpense) {
    const changed =
      splitFingerprint(expense, group) !== splitFingerprint(existingExpense, group);
    if (changed) {
      for (const key of splitKeys) {
        if (payload[key] !== undefined) patch[key] = payload[key];
      }
    }
  } else {
    for (const key of splitKeys) {
      if (payload[key] !== undefined) patch[key] = payload[key];
    }
  }
  return patch;
}

/**
 * Backend PublicExpense DTO → existing frontend expense model.
 *
 * `myUserId` is the viewer's PostgreSQL user id (from /auth/me); it maps to
 * the local "you". The exact server-calculated shares ride along as
 * `serverShares` (member id → major-unit number) so the UI displays the
 * server's arithmetic without recomputation.
 */
export function mapExpenseFromApi(dto, { myUserId = null } = {}) {
  if (!dto || typeof dto !== "object" || !dto.id) return null;

  const toMemberId = (userId) => {
    if (!userId) return null;
    return myUserId && userId === myUserId ? "you" : userId;
  };

  const splitType = splitTypeFromApi(dto.splitType);

  const participants = (dto.participants || [])
    .map((p) => toMemberId(p.userId))
    .filter((id) => id !== null);

  const percentages = {};
  if (splitType === "percentage") {
    for (const p of dto.participants || []) {
      const memberId = toMemberId(p.userId);
      if (memberId && p.percentage !== null && p.percentage !== undefined) {
        percentages[memberId] = percentageStringToPercent(p.percentage);
      }
    }
  }

  const items = (dto.items || []).map((item) => ({
    id: item.id,
    name: item.description,
    price: fromApiMinorUnits(item.amountMinor),
    participants: (item.participants || [])
      .map((ip) => toMemberId(ip.userId))
      .filter((id) => id !== null),
  }));

  // Server-authoritative shares, keyed by the local member id convention.
  const serverShares = {};
  for (const p of dto.participants || []) {
    const memberId = toMemberId(p.userId);
    if (memberId) serverShares[memberId] = fromApiMinorUnits(p.shareMinor);
  }

  return {
    id: dto.id,
    desc: dto.description,
    category: dto.category || "Other",
    paidBy: toMemberId(dto.paidBy?.userId) || "you",
    amount: fromApiMinorUnits(dto.amountMinor),
    date: dto.expenseDate,
    splitType,
    participants,
    percentages,
    items,
    recurring: false, // recurring scheduling is a later task; server has no flag
    // --- additive server-expense metadata (unknown to the old local model) ---
    isServerExpense: true,
    currencyCode: dto.currencyCode || null,
    serverShares,
    createdById: dto.createdBy?.userId ?? null,
  };
}

/** Map a full expense list; invalid entries are skipped. */
export function mapExpensesFromApi(list, options = {}) {
  if (!Array.isArray(list)) return [];
  return list
    .map((dto) => mapExpenseFromApi(dto, options))
    .filter((e) => e !== null);
}

/**
 * Merge mapped server expenses with a group's current local expenses.
 *
 * Precedence: SERVER DATA > LOCAL CACHE. Expenses that came from the server
 * (isServerExpense) are replaced wholesale by the fresh server list. Local
 * expenses added while the server list was loading (not yet persisted) are
 * kept so a user never sees a just-added expense vanish; they are refreshed
 * by the next server sync. Genuinely local groups (isServerGroup false) keep
 * their local expenses untouched.
 */
export function mergeServerAndLocalExpenses(serverExpenses, currentExpenses = [], { groupIsServer = true } = {}) {
  if (!groupIsServer) return currentExpenses;
  const serverIds = new Set(serverExpenses.map((e) => e.id));
  const pendingLocal = currentExpenses.filter(
    (e) => !e.isServerExpense && !serverIds.has(e.id)
  );
  return [...serverExpenses, ...pendingLocal];
}
