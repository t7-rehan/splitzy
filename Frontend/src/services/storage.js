// Auth identity (Firebase-derived). Firebase is authoritative; this mirrors
// its session for a flicker-free first paint. Deliberately renamed from the
// pre-Firebase "splitzy_auth_session_v2" key, which stored a simulated login —
// stale simulated sessions are ignored rather than honored. Splitzy app data
// (profile/groups/history/theme) keys are unchanged.
const STORAGE_KEYS = {
  PROFILE: "splitzy_user_profile_v2",
  GROUPS: "splitzy_groups_data_v2",
  SETTLED_HISTORY: "splitzy_settled_txns_v2",
  AUTH_SESSION: "splitzy_firebase_session_v2",
  THEME: "splitzy_user_theme_v2",
};

export function getShares(e) {
  const shares = {};
  if (!e) return shares;

  // Task 9: server-backed expenses carry the exact shares PostgreSQL
  // calculated (expenseMapper). Those are authoritative — never re-derived.
  if (e.isServerExpense && e.serverShares) {
    return { ...e.serverShares };
  }

  if (e.splitType === "equal") {
    const participants = e.participants || [];
    if (participants.length > 0) {
      const per = e.amount / participants.length;
      participants.forEach((id) => (shares[id] = (shares[id] || 0) + per));
    }
  } else if (e.splitType === "percentage") {
    const percentages = e.percentages || {};
    Object.entries(percentages).forEach(([id, pct]) => {
      shares[id] = (shares[id] || 0) + e.amount * (pct / 100);
    });
  } else if (e.splitType === "itemized") {
    const items = e.items || [];
    items.forEach((item) => {
      const participants = item.participants || [];
      if (participants.length > 0) {
        const per = item.price / participants.length;
        participants.forEach((id) => (shares[id] = (shares[id] || 0) + per));
      }
    });
  }
  return shares;
}

export function computeBalances(members = [], expenses = []) {
  const net = {};
  const safeMembers = Array.isArray(members) ? members : [];
  const safeExpenses = Array.isArray(expenses) ? expenses : [];

  safeMembers.forEach((m) => {
    if (m && m.id !== undefined && m.id !== null) {
      net[m.id] = 0;
    }
  });
  
  safeExpenses.forEach((e) => {
    if (!e) return;
    const amount = typeof e.amount === "number" ? e.amount : Number(e.amount) || 0;
    if (net[e.paidBy] !== undefined) {
      net[e.paidBy] = (net[e.paidBy] || 0) + amount;
    }
    const shares = getShares(e);
    if (shares && typeof shares === "object") {
      Object.entries(shares).forEach(([id, rawAmt]) => {
        const amt = typeof rawAmt === "number" ? rawAmt : Number(rawAmt) || 0;
        if (net[id] !== undefined) {
          net[id] -= amt;
        }
      });
    }
  });

  return net;
}

export function simplifySettlements(net = {}) {
  const creditors = [];
  const debtors = [];

  const safeNet = net && typeof net === "object" ? net : {};
  Object.entries(safeNet).forEach(([id, amt]) => {
    if (typeof amt === "number") {
      if (amt > 0.5) creditors.push({ id, amt });
      else if (amt < -0.5) debtors.push({ id, amt: -amt });
    }
  });

  creditors.sort((a, b) => b.amt - a.amt);
  debtors.sort((a, b) => b.amt - a.amt);

  const txns = [];
  let i = 0, j = 0;

  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amt, creditors[j].amt);
    txns.push({ from: debtors[i].id, to: creditors[j].id, amount: Math.round(pay) });
    debtors[i].amt -= pay;
    creditors[j].amt -= pay;

    if (debtors[i].amt < 0.5) i++;
    if (creditors[j].amt < 0.5) j++;
  }

  return txns;
}

function getDefaultSeedGroups(youName = "Sarthak", homeCurrency = "INR") {
  // Use dates across current month for realistic calendar expense demonstration
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");

  return [
    {
      id: "g_goa",
      name: "Goa Trip 2026",
      currency: "INR",
      isRoommateGroup: false,
      members: [
        { id: "you", name: youName, upi: "sarthak@upi" },
        { id: "m_rahul", name: "Rahul", upi: "rahul@upi" },
        { id: "m_aditya", name: "Aditya", upi: "aditya@upi" },
        { id: "m_rohan", name: "Rohan", upi: "rohan@upi" },
        { id: "m_priya", name: "Priya", upi: "priya@upi" },
      ],
      expenses: [
        {
          id: "e1",
          desc: "Seafood Dinner at Brittos",
          category: "Food",
          paidBy: "you",
          amount: 4500,
          date: `${y}-${m}-08T19:30:00.000Z`,
          splitType: "equal",
          participants: ["you", "m_rahul", "m_aditya", "m_rohan", "m_priya"],
          recurring: false,
        },
        {
          id: "e2",
          desc: "Beach Resort Villa",
          category: "Rent",
          paidBy: "m_rahul",
          amount: 12500,
          date: `${y}-${m}-12T14:00:00.000Z`,
          splitType: "equal",
          participants: ["you", "m_rahul", "m_aditya", "m_rohan", "m_priya"],
          recurring: false,
        },
        {
          id: "e3",
          desc: "Scooter Rentals & Petrol",
          category: "Travel",
          paidBy: "you",
          amount: 3200,
          date: `${y}-${m}-15T11:00:00.000Z`,
          splitType: "percentage",
          percentages: { you: 20, m_rahul: 20, m_aditya: 20, m_rohan: 20, m_priya: 20 },
          recurring: false,
        },
        {
          id: "e4",
          desc: "Sunset Boat Cruise",
          category: "Entertainment",
          paidBy: "m_aditya",
          amount: 2400,
          date: `${y}-${m}-17T17:30:00.000Z`,
          splitType: "equal",
          participants: ["you", "m_rahul", "m_aditya", "m_rohan", "m_priya"],
          recurring: false,
        },
      ],
    },
    {
      id: "g_flat",
      name: "Apartment 304",
      currency: "INR",
      isRoommateGroup: true,
      members: [
        { id: "you", name: youName, upi: "sarthak@upi" },
        { id: "m_rahul", name: "Rahul", upi: "rahul@upi" },
        { id: "m_aditya", name: "Aditya", upi: "aditya@upi" },
        { id: "m_rohan", name: "Rohan", upi: "rohan@upi" },
      ],
      expenses: [
        {
          id: "e_rent",
          desc: "Monthly Flat Rent",
          category: "Rent",
          paidBy: "you",
          amount: 32000,
          date: `${y}-${m}-01T09:00:00.000Z`,
          splitType: "equal",
          participants: ["you", "m_rahul", "m_aditya", "m_rohan"],
          recurring: true,
        },
        {
          id: "e_wifi",
          desc: "Airtel Fiber Wi-Fi",
          category: "Utilities",
          paidBy: "m_aditya",
          amount: 1199,
          date: `${y}-${m}-05T10:00:00.000Z`,
          splitType: "equal",
          participants: ["you", "m_rahul", "m_aditya", "m_rohan"],
          recurring: true,
        },
        {
          id: "e_groceries",
          desc: "Weekly Household Groceries",
          category: "Food",
          paidBy: "m_rohan",
          amount: 3450,
          date: `${y}-${m}-17T12:00:00.000Z`,
          splitType: "equal",
          participants: ["you", "m_rahul", "m_aditya", "m_rohan"],
          recurring: false,
        },
      ],
    },
    {
      id: "g_college",
      name: "College Projects",
      currency: "INR",
      isRoommateGroup: false,
      members: [
        { id: "you", name: youName },
        { id: "m_priya", name: "Priya" },
        { id: "m_aditya", name: "Aditya" },
      ],
      expenses: [
        {
          id: "e_print",
          desc: "Project Printing & Binding",
          category: "Other",
          paidBy: "m_priya",
          amount: 600,
          date: `${y}-${m}-10T16:00:00.000Z`,
          splitType: "equal",
          participants: ["you", "m_priya", "m_aditya"],
          recurring: false,
        },
      ],
    },
  ];
}

export function loadAuthSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.AUTH_SESSION);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error("Failed to load auth session", e);
  }
  return null;
}

export function saveAuthSession(session) {
  try {
    localStorage.setItem(STORAGE_KEYS.AUTH_SESSION, JSON.stringify(session));
  } catch (e) {
    console.error("Failed to save auth session", e);
  }
}

export function clearAuthSession() {
  try {
    localStorage.removeItem(STORAGE_KEYS.AUTH_SESSION);
  } catch (e) {
    console.error("Failed to clear auth session", e);
  }
}

/** Removes the pre-Firebase simulated session key so stale fake logins
 *  can never be treated as a real signed-in identity. */
export function clearLegacyAuthSession() {
  try {
    localStorage.removeItem("splitzy_auth_session_v2");
  } catch (e) {
    console.error("Failed to clear legacy auth session", e);
  }
}

export function getScopedKey(keyName, uid = null) {
  if (uid && typeof uid === "string" && uid.trim().length > 0) {
    return `splitzy:${uid.trim()}:${keyName}`;
  }
  return STORAGE_KEYS[keyName.toUpperCase()] || `splitzy_${keyName}`;
}

export function loadProfile(uid = null) {
  try {
    const key = getScopedKey("profile", uid);
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error("Failed to load profile", e);
  }
  return null;
}

export function saveProfile(profile, uid = null) {
  try {
    const key = getScopedKey("profile", uid);
    localStorage.setItem(key, JSON.stringify(profile));
    if (profile?.theme) {
      localStorage.setItem(STORAGE_KEYS.THEME, profile.theme);
    }
  } catch (e) {
    console.error("Failed to save profile", e);
  }
}

export function loadStoredTheme() {
  try {
    return localStorage.getItem(STORAGE_KEYS.THEME) || "light";
  } catch {
    return "light";
  }
}

/**
 * Loads groups for the viewer.
 *
 * Scoping rules:
 * - If an authenticated Firebase UID is provided:
 *   Reads splitzy:<uid>:groups.
 *   If found: returns the array (even if empty []).
 *   If NOT found: returns [] (NEVER injects demo/seed groups for authenticated users!).
 * - If no UID is provided (unauthenticated guest/preview mode only):
 *   Reads legacy global storage key. If missing, falls back to default seed groups.
 */
export function loadGroups(uidOrOptions = null, youName = "Sarthak", homeCurrency = "INR") {
  let uid = null;
  let defaultName = youName;
  let defaultCurrency = homeCurrency;

  if (typeof uidOrOptions === "object" && uidOrOptions !== null) {
    uid = uidOrOptions.uid || null;
    defaultName = uidOrOptions.youName || defaultName;
    defaultCurrency = uidOrOptions.homeCurrency || defaultCurrency;
  } else if (typeof uidOrOptions === "string" && uidOrOptions.trim().length > 0) {
    uid = uidOrOptions.trim();
  }

  const key = getScopedKey("groups", uid);

  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error("Failed to load groups", e);
  }

  // Authenticated users must see ZERO groups until created or synced from server.
  if (uid) {
    return [];
  }

  // Unauthenticated guest preview only
  const defaultGroups = getDefaultSeedGroups(defaultName, defaultCurrency);
  saveGroups(defaultGroups, null);
  return defaultGroups;
}

export function saveGroups(groups, uid = null) {
  try {
    const key = getScopedKey("groups", uid);
    localStorage.setItem(key, JSON.stringify(groups || []));
  } catch (e) {
    console.error("Failed to save groups", e);
  }
}

export function clearUserCache(uid) {
  if (!uid) return;
  try {
    localStorage.removeItem(getScopedKey("groups", uid));
    localStorage.removeItem(getScopedKey("profile", uid));
    localStorage.removeItem(getScopedKey("settled_txns", uid));
  } catch (e) {
    console.error("Failed to clear user cache", e);
  }
}

