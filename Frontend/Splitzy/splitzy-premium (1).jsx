import { useState, useMemo, useEffect, useRef } from "react";
import {
  Coins, ArrowRight, Check, Users, PieChart, Settings as SettingsIcon,
  ChevronLeft, Plus, Repeat, Copy, X, TrendingUp, TrendingDown, Sparkles,
  Pencil, Trash2,
} from "lucide-react";

/* ============================= STYLE SYSTEM ============================= */

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap');
* { box-sizing: border-box; }
@keyframes floatBlob { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(18px,-20px) scale(1.05); } }
@keyframes fadeUp { from { opacity:0; transform: translateY(14px); } to { opacity:1; transform: translateY(0); } }
@keyframes popIn { from { opacity:0; transform: scale(0.94); } to { opacity:1; transform: scale(1); } }
.fadeUp { animation: fadeUp 0.5s ease both; }
.popIn { animation: popIn 0.4s cubic-bezier(.2,.9,.3,1.3) both; }
input::placeholder { color: #8B7F6C; }
button { transition: transform 0.12s ease, filter 0.15s ease, box-shadow 0.15s ease, background 0.15s ease, border-color 0.15s ease; cursor: pointer; font-family: 'Inter', sans-serif; }
button:active { transform: scale(0.96); }
.glass-card { transition: transform 0.2s ease, box-shadow 0.2s ease; }
.glass-card:hover { transform: translateY(-2px); }
input:focus { outline: none; border-color: #D4AF6A !important; box-shadow: 0 0 0 3px rgba(212,175,106,0.16); }
::-webkit-scrollbar { width: 8px; }
::-webkit-scrollbar-thumb { background: rgba(255,232,190,0.15); border-radius: 4px; }
`;

const C = {
  bgGlow: "radial-gradient(circle at 25% -10%, #2A2216 0%, #14120F 55%)",
  card: "#1E1A16",
  cardAlt: "#241E18",
  border: "rgba(255,232,190,0.09)",
  text: "#F3ECDF",
  muted: "#B5A891",
  mutedSoft: "#8B7F6C",
  gold: "#D4AF6A",
  goldDeep: "#B8933F",
  goldTint: "rgba(212,175,106,0.16)",
  emerald: "#3FA37D",
  emeraldTint: "rgba(63,163,125,0.16)",
  wine: "#C4574A",
  wineTint: "rgba(196,87,74,0.16)",
  shadow: "0 10px 30px rgba(0,0,0,0.45)",
};
const GLASS = { background: "rgba(255,244,224,0.045)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", border: `1px solid ${C.border}`, boxShadow: C.shadow };
const GOLD_GRAD = "linear-gradient(135deg, #E3C387, #B8933F)";
const AVATAR_COLORS = ["#7C9CBF", "#B98CC7", "#6FB89E", "#D4A574", "#C77B7B", "#8FA85E"];

/* ============================= DATA / MATH ============================= */

const CURRENCIES = [
  { code: "INR", symbol: "₹", label: "Indian Rupee" },
  { code: "USD", symbol: "$", label: "US Dollar" },
  { code: "EUR", symbol: "€", label: "Euro" },
  { code: "GBP", symbol: "£", label: "British Pound" },
  { code: "JPY", symbol: "¥", label: "Japanese Yen" },
  { code: "AUD", symbol: "A$", label: "Australian Dollar" },
];
const USD_PER_UNIT = { USD: 1, INR: 0.012, EUR: 1.09, GBP: 1.27, JPY: 0.0064, AUD: 0.66 };
const CATEGORIES = ["Food", "Travel", "Rent", "Utilities", "Shopping", "Entertainment", "Other"];

function symbolFor(code) { return CURRENCIES.find((c) => c.code === code)?.symbol || code; }
function convert(amount, from, to) { if (from === to) return amount; return (amount * USD_PER_UNIT[from]) / USD_PER_UNIT[to]; }
function fmtMoney(amount, code) { return `${symbolFor(code)}${Math.round(Math.abs(amount)).toLocaleString("en-IN")}`; }
function avatarColor(idx) { return AVATAR_COLORS[idx % AVATAR_COLORS.length]; }

function seedGroups(youName, homeCurrency) {
  return [
    {
      id: "g1", name: "My Group", currency: homeCurrency || "INR",
      members: [{ id: "you", name: youName }, { id: "m2", name: "Friend" }],
      expenses: [
        { id: "e1", desc: "Sample expense", category: "Food", paidBy: "you", date: new Date(), recurring: false, splitType: "equal", amount: 0, participants: ["you", "m2"] },
      ],
    },
  ];
}

function getShares(e) {
  const shares = {};
  if (e.splitType === "equal") {
    const per = e.amount / e.participants.length;
    e.participants.forEach((id) => (shares[id] = (shares[id] || 0) + per));
  } else if (e.splitType === "percentage") {
    Object.entries(e.percentages).forEach(([id, pct]) => { shares[id] = (shares[id] || 0) + e.amount * (pct / 100); });
  } else if (e.splitType === "itemized") {
    e.items.forEach((item) => {
      const per = item.price / item.participants.length;
      item.participants.forEach((id) => (shares[id] = (shares[id] || 0) + per));
    });
  }
  return shares;
}
function computeBalances(members, expenses) {
  const net = {};
  members.forEach((m) => (net[m.id] = 0));
  expenses.forEach((e) => {
    net[e.paidBy] = (net[e.paidBy] || 0) + e.amount;
    Object.entries(getShares(e)).forEach(([id, amt]) => { if (net[id] !== undefined) net[id] -= amt; });
  });
  return net;
}
function simplifySettlements(net) {
  const creditors = [], debtors = [];
  Object.entries(net).forEach(([id, amt]) => {
    if (amt > 0.5) creditors.push({ id, amt });
    else if (amt < -0.5) debtors.push({ id, amt: -amt });
  });
  creditors.sort((a, b) => b.amt - a.amt);
  debtors.sort((a, b) => b.amt - a.amt);
  const txns = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amt, creditors[j].amt);
    txns.push({ from: debtors[i].id, to: creditors[j].id, amount: pay });
    debtors[i].amt -= pay; creditors[j].amt -= pay;
    if (debtors[i].amt < 0.5) i++;
    if (creditors[j].amt < 0.5) j++;
  }
  return txns;
}

/* ============================= SHARED BITS ============================= */

function SectionLabel({ children }) {
  return <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: C.mutedSoft, marginBottom: 9, fontWeight: 700 }}>{children}</div>;
}
function pillBtn(active, color = C.gold) {
  return { padding: "8px 14px", borderRadius: 18, fontSize: 12.5, border: active ? `1.5px solid ${color}` : `1px solid ${C.border}`, background: active ? `${color}22` : "transparent", color: active ? C.text : C.muted, fontWeight: active ? 700 : 500 };
}
const smallInput = { padding: "9px 11px", borderRadius: 9, border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.04)", color: C.text, fontSize: 13, width: "100%" };
function selectOnFocus(e) { e.target.select(); }

/* Reusable tap-to-confirm delete button — used for groups, expenses, and anywhere a destructive
   action deserves a second tap instead of a modal. First tap arms it (shows "Confirm?"), second
   tap within ~2.5s fires onConfirm, otherwise it quietly disarms itself. */
function ConfirmDeleteButton({ onConfirm, label = "Delete", compact = false }) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 2500);
    return () => clearTimeout(t);
  }, [confirming]);
  return (
    <button
      onClick={(ev) => {
        ev.stopPropagation();
        if (confirming) { setConfirming(false); onConfirm(); }
        else setConfirming(true);
      }}
      style={{
        display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
        padding: compact ? "7px 9px" : "5px 10px", borderRadius: 8,
        border: `1px solid ${confirming ? C.wine : C.border}`,
        background: confirming ? C.wineTint : "transparent",
        color: confirming ? C.wine : C.muted,
        fontSize: 11, fontWeight: confirming ? 700 : 500,
      }}
    >
      <Trash2 size={11} /> {confirming ? "Confirm?" : label}
    </button>
  );
}

/* ============================= LANDING ============================= */

function Landing({ onComplete }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [error, setError] = useState("");

  function next() {
    setError("");
    if (step === 1) {
      if (!name.trim()) { setError("Please enter your name"); return; }
      setStep(2);
    } else if (step === 2) {
      setStep(3);
      setTimeout(() => onComplete({ name: name.trim(), homeCurrency: currency }), 1300);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bgGlow, color: C.text, fontFamily: "'Inter', sans-serif", position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <style>{FONTS}</style>
      <div style={{ position: "absolute", width: 340, height: 340, borderRadius: "50%", background: "radial-gradient(circle, rgba(212,175,106,0.32), transparent 70%)", top: -80, left: -100, filter: "blur(10px)", animation: "floatBlob 9s ease-in-out infinite" }} />
      <div style={{ position: "absolute", width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle, rgba(63,163,125,0.22), transparent 70%)", bottom: -60, right: -90, filter: "blur(10px)", animation: "floatBlob 11s ease-in-out infinite reverse" }} />
      <div style={{ position: "absolute", width: 260, height: 260, borderRadius: "50%", background: "radial-gradient(circle, rgba(196,87,74,0.16), transparent 70%)", bottom: 100, left: -60, filter: "blur(10px)", animation: "floatBlob 13s ease-in-out infinite" }} />

      <div style={{ position: "relative", width: "100%", maxWidth: 380, zIndex: 1 }}>
        {step === 0 && (
          <div className="fadeUp" style={{ textAlign: "center" }}>
            <div className="popIn" style={{ width: 84, height: 84, borderRadius: 24, margin: "0 auto 26px", background: GOLD_GRAD, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 12px 34px rgba(212,175,106,0.32)" }}>
              <Coins size={38} color="#1A1611" strokeWidth={2} />
            </div>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 38, margin: "0 0 10px", letterSpacing: -0.5 }}>Splitzy</h1>
            <p style={{ color: C.muted, fontSize: 14.5, lineHeight: 1.6, margin: "0 0 36px", padding: "0 4px" }}>
              Split fair. Settle smart. The clean way to keep track of what you share with people.
            </p>
            <button onClick={() => setStep(1)} style={primaryBtn}>Get started <ArrowRight size={17} /></button>
          </div>
        )}

        {step === 1 && (
          <div className="fadeUp">
            <ProgressDots active={0} />
            <h2 style={headingStyle}>What should we call you?</h2>
            <p style={subStyle}>You'll show up as "You" in every group you're part of.</p>
            <input autoFocus value={name} onChange={(e) => { setName(e.target.value); setError(""); }} onKeyDown={(e) => e.key === "Enter" && next()} placeholder="Your name" style={inputBig} />
            {error && <div style={errorStyle}>{error}</div>}
            <button onClick={next} style={primaryBtn}>Continue <ArrowRight size={17} /></button>
          </div>
        )}

        {step === 2 && (
          <div className="fadeUp">
            <ProgressDots active={1} />
            <h2 style={headingStyle}>What's your everyday currency?</h2>
            <p style={subStyle}>Each group can still use its own currency — this just sets your defaults.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 18 }}>
              {CURRENCIES.map((c) => (
                <button key={c.code} onClick={() => setCurrency(c.code)} style={{ padding: "14px 6px", borderRadius: 14, border: currency === c.code ? `1.5px solid ${C.gold}` : `1px solid ${C.border}`, background: currency === c.code ? C.goldTint : "rgba(255,255,255,0.04)", color: C.text, textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontFamily: "'Fraunces', serif", fontWeight: 600 }}>{c.symbol}</div>
                  <div style={{ fontSize: 10.5, color: C.muted, marginTop: 3 }}>{c.code}</div>
                </button>
              ))}
            </div>
            <button onClick={next} style={primaryBtn}>Start using Splitzy <ArrowRight size={17} /></button>
          </div>
        )}

        {step === 3 && (
          <div className="popIn" style={{ textAlign: "center" }}>
            <div className="popIn" style={{ width: 84, height: 84, borderRadius: "50%", margin: "0 auto 24px", background: "linear-gradient(135deg, #4FBF95, #2F8F6E)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 12px 34px rgba(63,163,125,0.35)" }}>
              <Check size={38} color="#fff" strokeWidth={3} />
            </div>
            <h2 style={{ ...headingStyle, textAlign: "center" }}>You're all set, {name.split(" ")[0]}</h2>
            <p style={{ ...subStyle, textAlign: "center" }}>Loading your groups...</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ProgressDots({ active, total = 2 }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 22 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{ height: 4, borderRadius: 2, flex: 1, background: i <= active ? GOLD_GRAD : "rgba(255,255,255,0.1)" }} />
      ))}
    </div>
  );
}
const headingStyle = { fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 23, margin: "0 0 8px", letterSpacing: -0.2 };
const subStyle = { color: C.muted, fontSize: 13.5, lineHeight: 1.55, margin: "0 0 22px" };
const inputBig = { width: "100%", padding: "16px 18px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: C.text, fontSize: 16, marginBottom: 8, fontFamily: "'Inter', sans-serif" };
const errorStyle = { color: C.wine, fontSize: 12.5, marginBottom: 14, fontWeight: 600 };
const primaryBtn = { width: "100%", padding: "15px 0", borderRadius: 14, border: "none", fontWeight: 700, fontSize: 15, marginTop: 6, background: GOLD_GRAD, color: "#1A1611", boxShadow: "0 10px 28px rgba(212,175,106,0.3)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 };

/* ============================= SETTLE FLOW DIAGRAM (signature) ============================= */

function SettleFlowDiagram({ members, settlements, currency }) {
  if (settlements.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "34px 10px 26px", textAlign: "center" }}>
        <Sparkles size={26} color={C.gold} />
        <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 16, marginTop: 10 }}>All settled up</div>
        <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>Nobody owes anybody in this group right now.</div>
      </div>
    );
  }
  const involvedIds = Array.from(new Set(settlements.flatMap((s) => [s.from, s.to])));
  const nameOf = (id) => members.find((m) => m.id === id)?.name || "?";
  const colorOf = (id) => avatarColor(members.findIndex((m) => m.id === id));
  const cx = 150, cy = 118, R = 82;
  const nodePos = {};
  involvedIds.forEach((id, i) => {
    const angle = (-90 + i * (360 / involvedIds.length)) * (Math.PI / 180);
    nodePos[id] = { x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle) };
  });
  return (
    <svg width="100%" viewBox="0 0 300 250" style={{ overflow: "visible", display: "block" }}>
      <defs>
        <marker id="splitzy-arrow" markerWidth="8" markerHeight="8" refX="6.5" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill={C.gold} />
        </marker>
      </defs>
      {settlements.map((s, i) => {
        const p1 = nodePos[s.from], p2 = nodePos[s.to];
        const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
        const dx = p2.x - p1.x, dy = p2.y - p1.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const perpX = -dy / len, perpY = dx / len;
        const ctrlX = mx + perpX * 22, ctrlY = my + perpY * 22;
        const labelX = 0.25 * p1.x + 0.5 * ctrlX + 0.25 * p2.x;
        const labelY = 0.25 * p1.y + 0.5 * ctrlY + 0.25 * p2.y;
        const shrink = 25;
        const endX = p2.x - (dx / len) * shrink, endY = p2.y - (dy / len) * shrink;
        return (
          <g key={i}>
            <path d={`M ${p1.x} ${p1.y} Q ${ctrlX} ${ctrlY} ${endX} ${endY}`} fill="none" stroke={C.gold} strokeWidth="2" markerEnd="url(#splitzy-arrow)" opacity="0.85" />
            <rect x={labelX - 28} y={labelY - 10} width="56" height="20" rx="10" fill={C.card} stroke={C.border} />
            <text x={labelX} y={labelY + 4} textAnchor="middle" fontSize="10" fontWeight="700" fill={C.gold} fontFamily="Inter, sans-serif">{fmtMoney(s.amount, currency)}</text>
          </g>
        );
      })}
      {involvedIds.map((id) => (
        <g key={id}>
          <circle cx={nodePos[id].x} cy={nodePos[id].y} r="22" fill={colorOf(id)} />
          <text x={nodePos[id].x} y={nodePos[id].y + 5} textAnchor="middle" fontSize="14" fontWeight="700" fill="#1A1611" fontFamily="Inter, sans-serif">{nameOf(id)[0].toUpperCase()}</text>
          <text x={nodePos[id].x} y={nodePos[id].y + 38} textAnchor="middle" fontSize="11" fill={C.muted} fontFamily="Inter, sans-serif">{nameOf(id).split(" ")[0]}</text>
        </g>
      ))}
    </svg>
  );
}

/* ============================= GROUP DETAIL ============================= */

function GroupDetail({ group, onUpdateGroup, onBack, onDeleteGroup, homeCurrency }) {
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [copied, setCopied] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [editingMemberId, setEditingMemberId] = useState(null);
  const [editingMemberName, setEditingMemberName] = useState("");
  const [memberNotice, setMemberNotice] = useState("");
  const formRef = useRef(null);

  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState("Food");
  const [paidBy, setPaidBy] = useState(group.members[0].id);
  const [splitType, setSplitType] = useState("equal");
  const [amount, setAmount] = useState("0");
  const [participants, setParticipants] = useState(group.members.map((m) => m.id));
  const [percentages, setPercentages] = useState({});
  const [items, setItems] = useState([]);
  const [recurring, setRecurring] = useState(false);

  // Computed fresh on every render (no memo) so Balance summary and Settle up
  // always reflect the latest members/expenses immediately — no stale cache.
  const net = computeBalances(group.members, group.expenses);
  const settlements = simplifySettlements(net);
  const nameOf = (id) => group.members.find((m) => m.id === id)?.name || "?";

  useEffect(() => {
    if (!memberNotice) return;
    const t = setTimeout(() => setMemberNotice(""), 2800);
    return () => clearTimeout(t);
  }, [memberNotice]);
  const recurringExpenses = group.expenses.filter((e) => e.recurring);
  const itemsTotal = items.reduce((s, it) => s + (it.price || 0), 0);
  const pctTotal = Object.values(percentages).reduce((a, b) => a + b, 0);

  function resetForm() {
    setDesc(""); setCategory("Food"); setPaidBy(group.members[0].id); setSplitType("equal");
    setAmount("0"); setParticipants(group.members.map((m) => m.id)); setPercentages({}); setItems([]); setRecurring(false); setShowAddExpense(false);
    setEditingExpenseId(null);
  }
  function startEditExpense(e) {
    setEditingExpenseId(e.id);
    setDesc(e.desc);
    setCategory(e.category);
    setPaidBy(e.paidBy);
    setSplitType(e.splitType);
    setRecurring(e.recurring);
    setAmount(e.splitType === "itemized" ? "0" : String(e.amount));
    setParticipants(e.splitType === "equal" ? e.participants : group.members.map((m) => m.id));
    setPercentages(e.splitType === "percentage" ? { ...e.percentages } : {});
    setItems(e.splitType === "itemized" ? e.items.map((it) => ({ ...it, participants: [...it.participants] })) : []);
    setShowAddExpense(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }
  function switchToPercentage() {
    setSplitType("percentage");
    const n = group.members.length;
    const even = Math.floor(100 / n);
    const pct = {};
    group.members.forEach((m, i) => { pct[m.id] = i === n - 1 ? 100 - even * (n - 1) : even; });
    setPercentages(pct);
  }
  function toggleParticipant(id) { setParticipants((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])); }
  function addItem() { setItems((prev) => [...prev, { id: "it" + Date.now(), name: "", price: 0, participants: group.members.map((m) => m.id) }]); }
  function updateItem(idx, patch) { setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it))); }
  function removeItem(idx) { setItems((prev) => prev.filter((_, i) => i !== idx)); }
  function toggleItemParticipant(idx, memberId) {
    setItems((prev) => prev.map((it, i) => i !== idx ? it : { ...it, participants: it.participants.includes(memberId) ? it.participants.filter((x) => x !== memberId) : [...it.participants, memberId] }));
  }

  function canSave() {
    if (!desc.trim() || !paidBy) return false;
    if (splitType === "equal") return parseFloat(amount) > 0 && participants.length > 0;
    if (splitType === "percentage") return parseFloat(amount) > 0 && Math.abs(pctTotal - 100) < 0.5;
    if (splitType === "itemized") return items.length > 0 && items.every((it) => it.name.trim() && it.price > 0 && it.participants.length > 0);
    return false;
  }
  function saveExpense() {
    const original = editingExpenseId ? group.expenses.find((ex) => ex.id === editingExpenseId) : null;
    const base = { id: editingExpenseId || "e" + Date.now(), desc: desc.trim(), category, paidBy, date: original ? original.date : new Date(), recurring };
    let expense;
    if (splitType === "equal") expense = { ...base, splitType, amount: parseFloat(amount), participants };
    else if (splitType === "percentage") expense = { ...base, splitType, amount: parseFloat(amount), percentages };
    else expense = { ...base, splitType, amount: itemsTotal, items };
    if (editingExpenseId) {
      onUpdateGroup({ ...group, expenses: group.expenses.map((ex) => (ex.id === editingExpenseId ? expense : ex)) });
    } else {
      onUpdateGroup({ ...group, expenses: [...group.expenses, expense] });
    }
    resetForm();
  }
  function deleteExpense(id) {
    onUpdateGroup({ ...group, expenses: group.expenses.filter((e) => e.id !== id) });
    if (editingExpenseId === id) resetForm();
  }
  function logRecurringAgain(expense) {
    onUpdateGroup({ ...group, expenses: [...group.expenses, { ...expense, id: "e" + Date.now(), date: new Date() }] });
  }
  function addMember() {
    const name = newMemberName.trim();
    if (!name) return;
    onUpdateGroup({ ...group, members: [...group.members, { id: "m" + Date.now(), name }] });
    setNewMemberName("");
  }
  function startEditMember(m) { setEditingMemberId(m.id); setEditingMemberName(m.name); }
  function cancelEditMember() { setEditingMemberId(null); setEditingMemberName(""); }
  function saveEditMember() {
    const name = editingMemberName.trim();
    if (!name) { cancelEditMember(); return; }
    onUpdateGroup({ ...group, members: group.members.map((m) => (m.id === editingMemberId ? { ...m, name } : m)) });
    cancelEditMember();
  }
  function removeMember(id) {
    if (id === "you") return;
    if (group.members.length <= 2) { setMemberNotice("A group needs at least 2 people."); return; }
    const isPayer = group.expenses.some((e) => e.paidBy === id);
    if (isPayer) { setMemberNotice(`Can't remove ${nameOf(id)} — they paid for an expense. Edit or delete that expense first.`); return; }
    onUpdateGroup({
      ...group,
      members: group.members.filter((m) => m.id !== id),
      expenses: group.expenses
        .map((e) => {
          if (e.splitType === "equal") return { ...e, participants: e.participants.filter((p) => p !== id) };
          if (e.splitType === "percentage") { const p = { ...e.percentages }; delete p[id]; return { ...e, percentages: p }; }
          return { ...e, items: e.items.map((it) => ({ ...it, participants: it.participants.filter((p) => p !== id) })) };
        })
        .filter((e) => (e.splitType === "equal" ? e.participants.length > 0 : e.splitType === "itemized" ? e.items.every((it) => it.participants.length > 0) : true)),
    });
  }

  function buildShareText() {
    const lines = [`${group.name} — Balance Summary`, ""];
    group.members.forEach((m) => {
      const val = net[m.id];
      if (val > 0.5) lines.push(`${m.name} is owed ${fmtMoney(val, group.currency)}`);
      else if (val < -0.5) lines.push(`${m.name} owes ${fmtMoney(val, group.currency)}`);
      else lines.push(`${m.name} is settled up`);
    });
    if (settlements.length) {
      lines.push("", "Settle up:");
      settlements.forEach((t) => lines.push(`${nameOf(t.from)} \u2192 ${nameOf(t.to)}: ${fmtMoney(t.amount, group.currency)}`));
    }
    return lines.join("\n");
  }
  async function copyShare() {
    const text = buildShareText();
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* textarea below still works as fallback */ }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: 10, border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.04)", color: C.text, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><ChevronLeft size={17} /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 19, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{group.name}</div>
          <div style={{ fontSize: 11.5, color: C.mutedSoft }}>{group.members.length} people &middot; {group.currency}</div>
        </div>
        <ConfirmDeleteButton onConfirm={onDeleteGroup} label="Delete group" compact />
      </div>

      {/* Members */}
      <div className="glass-card" style={{ ...GLASS, borderRadius: 16, padding: "16px 18px", marginBottom: 14 }}>
        <SectionLabel>People</SectionLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {group.members.map((m, i) => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 7, background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, borderRadius: 18, padding: editingMemberId === m.id ? "5px 6px" : "5px 10px 5px 5px" }}>
              {editingMemberId === m.id ? (
                <>
                  <input
                    autoFocus
                    value={editingMemberName}
                    onChange={(ev) => setEditingMemberName(ev.target.value)}
                    onFocus={selectOnFocus}
                    onKeyDown={(ev) => { if (ev.key === "Enter") saveEditMember(); if (ev.key === "Escape") cancelEditMember(); }}
                    style={{ width: 92, padding: "4px 7px", borderRadius: 8, border: `1px solid ${C.gold}`, background: "rgba(255,255,255,0.06)", color: C.text, fontSize: 12.5 }}
                  />
                  <button onClick={saveEditMember} style={{ background: "none", border: "none", color: C.emerald, padding: 0, display: "flex" }}><Check size={14} /></button>
                  <button onClick={cancelEditMember} style={{ background: "none", border: "none", color: C.mutedSoft, padding: 0, display: "flex" }}><X size={14} /></button>
                </>
              ) : (
                <>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", background: avatarColor(i), color: "#1A1611", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 10.5, flexShrink: 0 }}>{m.name[0].toUpperCase()}</div>
                  <span style={{ fontSize: 12.5 }}>{m.name}</span>
                  {m.id !== "you" && (
                    <>
                      <button onClick={() => startEditMember(m)} style={{ background: "none", border: "none", color: C.mutedSoft, padding: 0, display: "flex" }}><Pencil size={11} /></button>
                      {group.members.length > 2 && (
                        <button onClick={() => removeMember(m.id)} style={{ background: "none", border: "none", color: C.mutedSoft, padding: 0, display: "flex" }}><Trash2 size={11} /></button>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
        {memberNotice && (
          <div style={{ fontSize: 11.5, color: C.wine, background: C.wineTint, borderRadius: 9, padding: "8px 10px", marginBottom: 12 }}>{memberNotice}</div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <input placeholder="Add a person" value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addMember()} style={{ ...smallInput, flex: 1 }} />
          <button onClick={addMember} style={{ padding: "0 16px", borderRadius: 9, border: "none", background: GOLD_GRAD, color: "#1A1611", fontWeight: 700, fontSize: 13 }}>Add</button>
        </div>
      </div>

      {/* Balance summary */}
      <div className="glass-card" style={{ ...GLASS, borderRadius: 16, padding: "16px 18px", marginBottom: 14 }}>
        <SectionLabel>Balance summary</SectionLabel>
        {group.members.map((m, idx) => {
          const val = net[m.id] ?? 0;
          const positive = val > 0.5, negative = val < -0.5;
          return (
            <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: idx === 0 ? "none" : `1px dashed ${C.border}` }}>
              <span style={{ fontSize: 13.5 }}>{m.name}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 700, fontSize: 13.5, color: positive ? C.emerald : negative ? C.wine : C.mutedSoft }}>
                {positive && <TrendingUp size={13} />}{negative && <TrendingDown size={13} />}
                {positive ? `is owed ${fmtMoney(val, group.currency)}` : negative ? `owes ${fmtMoney(val, group.currency)}` : "settled up"}
              </span>
            </div>
          );
        })}
      </div>

      {/* Settle flow — signature element */}
      <div className="glass-card" style={{ ...GLASS, borderRadius: 20, padding: "18px 16px 10px", marginBottom: 14 }}>
        <SectionLabel>Settle up</SectionLabel>
        <SettleFlowDiagram members={group.members} settlements={settlements} currency={group.currency} />
        <button onClick={() => setShowShare((v) => !v)} style={{ width: "100%", padding: "10px 0", borderRadius: 10, border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.03)", color: C.muted, fontSize: 12.5, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 4 }}>
          <Copy size={13} /> {showShare ? "Hide share summary" : "Share summary"}
        </button>
        {showShare && (
          <div style={{ marginTop: 12 }}>
            <textarea readOnly value={buildShareText()} style={{ width: "100%", height: 130, padding: 12, borderRadius: 10, border: `1px solid ${C.border}`, background: "rgba(0,0,0,0.2)", color: C.text, fontSize: 12, fontFamily: "'Inter', sans-serif", resize: "none" }} />
            <button onClick={copyShare} style={{ width: "100%", padding: "9px 0", borderRadius: 10, border: "none", background: copied ? "linear-gradient(135deg,#4FBF95,#2F8F6E)" : GOLD_GRAD, color: copied ? "#fff" : "#1A1611", fontWeight: 700, fontSize: 12.5, marginTop: 8 }}>
              {copied ? "Copied ✓" : "Copy to clipboard"}
            </button>
          </div>
        )}
      </div>

      {/* Recurring */}
      {recurringExpenses.length > 0 && (
        <div className="glass-card" style={{ ...GLASS, borderRadius: 16, padding: "16px 18px", marginBottom: 14 }}>
          <SectionLabel>Recurring</SectionLabel>
          {recurringExpenses.map((e) => (
            <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <Repeat size={13} color={C.gold} />
                <span style={{ fontSize: 13 }}>{e.desc}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12.5, color: C.muted }}>{fmtMoney(e.amount, group.currency)}/mo</span>
                <button onClick={() => logRecurringAgain(e)} style={{ fontSize: 11, padding: "5px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.gold }}>Log this month</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Expense history */}
      <div className="glass-card" style={{ ...GLASS, borderRadius: 16, padding: "16px 18px", marginBottom: 14 }}>
        <SectionLabel>Expense history</SectionLabel>
        {group.expenses.length === 0 && <div style={{ fontSize: 12.5, color: C.muted }}>No expenses yet — add your first one below.</div>}
        {[...group.expenses].reverse().map((e, idx) => (
          <div key={e.id} style={{ padding: "10px 0", borderTop: idx === 0 ? "none" : `1px dashed ${C.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div style={{ fontSize: 13.5 }}>{e.desc}</div>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{fmtMoney(e.amount, group.currency)}</div>
            </div>
            <div style={{ fontSize: 11.5, color: C.mutedSoft, marginTop: 2, display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span>{nameOf(e.paidBy)} paid</span>&middot;<span>{e.category}</span>&middot;
              <span>{e.splitType === "equal" ? "Equal split" : e.splitType === "percentage" ? "Percentage split" : `${e.items.length} items`}</span>
              {e.recurring && <span style={{ color: C.gold }}>&middot; Monthly</span>}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button onClick={() => startEditExpense(e)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: 11 }}>
                <Pencil size={11} /> Edit
              </button>
              <ConfirmDeleteButton onConfirm={() => deleteExpense(e.id)} />
            </div>
          </div>
        ))}
      </div>

      {/* Add expense */}
      {!showAddExpense ? (
        <button onClick={() => setShowAddExpense(true)} style={{ width: "100%", padding: "14px 0", borderRadius: 14, border: "none", background: GOLD_GRAD, color: "#1A1611", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, boxShadow: "0 8px 22px rgba(212,175,106,0.28)" }}>
          <Plus size={16} /> Add expense
        </button>
      ) : (
        <div ref={formRef} className="glass-card" style={{ ...GLASS, borderRadius: 16, padding: "18px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <SectionLabel>{editingExpenseId ? "Edit expense" : "New expense"}</SectionLabel>
            {editingExpenseId && <span style={{ fontSize: 11, color: C.gold, fontWeight: 700 }}>Editing</span>}
          </div>
          <input placeholder="What was it for?" value={desc} onChange={(e) => setDesc(e.target.value)} style={{ ...smallInput, marginBottom: 10, padding: "11px 12px", fontSize: 14 }} />

          <SectionLabel>Category</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {CATEGORIES.map((cat) => <button key={cat} onClick={() => setCategory(cat)} style={pillBtn(category === cat)}>{cat}</button>)}
          </div>

          <SectionLabel>Paid by</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {group.members.map((m) => <button key={m.id} onClick={() => setPaidBy(m.id)} style={pillBtn(paidBy === m.id)}>{m.name}</button>)}
          </div>

          <SectionLabel>Split</SectionLabel>
          <div style={{ display: "flex", gap: 6, marginBottom: 14, background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 4 }}>
            {[{ id: "equal", label: "Equal" }, { id: "percentage", label: "Percentage" }, { id: "itemized", label: "Itemized" }].map((s) => (
              <button key={s.id} onClick={() => (s.id === "percentage" ? (splitType !== "percentage" && switchToPercentage()) : setSplitType(s.id))} style={{ flex: 1, padding: "8px 0", borderRadius: 7, border: "none", fontSize: 12, fontWeight: 700, background: splitType === s.id ? C.goldDeep : "transparent", color: splitType === s.id ? "#1A1611" : C.muted }}>{s.label}</button>
            ))}
          </div>

          {splitType !== "itemized" && (
            <input placeholder={`Amount (${symbolFor(group.currency)})`} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} onFocus={selectOnFocus} style={{ ...smallInput, marginBottom: 14, padding: "11px 12px", fontSize: 14 }} />
          )}

          {splitType === "equal" && (
            <div style={{ marginBottom: 14 }}>
              <SectionLabel>Split between</SectionLabel>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {group.members.map((m) => <button key={m.id} onClick={() => toggleParticipant(m.id)} style={pillBtn(participants.includes(m.id), C.emerald)}>{m.name}</button>)}
              </div>
            </div>
          )}

          {splitType === "percentage" && (
            <div style={{ marginBottom: 14 }}>
              <SectionLabel>Split by percentage</SectionLabel>
              {group.members.map((m) => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 13 }}>{m.name}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="number" value={percentages[m.id] ?? 0} onChange={(e) => setPercentages((p) => ({ ...p, [m.id]: parseFloat(e.target.value) || 0 }))} onFocus={selectOnFocus} style={{ width: 60, padding: "6px 8px", borderRadius: 8, border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.04)", color: C.text, fontSize: 13 }} />
                    <span style={{ fontSize: 12, color: C.muted }}>%</span>
                  </div>
                </div>
              ))}
              <div style={{ fontSize: 12, marginTop: 4, color: Math.abs(pctTotal - 100) < 0.5 ? C.emerald : C.wine, fontWeight: 700 }}>
                Total: {pctTotal.toFixed(0)}% {Math.abs(pctTotal - 100) < 0.5 ? "✓" : "— must equal 100%"}
              </div>
            </div>
          )}

          {splitType === "itemized" && (
            <div style={{ marginBottom: 14 }}>
              <SectionLabel>Items</SectionLabel>
              {items.map((item, idx) => (
                <div key={item.id} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 12, marginBottom: 10 }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <input placeholder="Item name" value={item.name} onChange={(e) => updateItem(idx, { name: e.target.value })} style={{ ...smallInput, flex: 2 }} />
                    <input placeholder="Price" type="number" value={item.price} onChange={(e) => updateItem(idx, { price: parseFloat(e.target.value) || 0 })} onFocus={selectOnFocus} style={{ ...smallInput, flex: 1 }} />
                    <button onClick={() => removeItem(idx)} style={{ width: 34, borderRadius: 9, border: `1px solid ${C.border}`, background: "transparent", color: C.wine, display: "flex", alignItems: "center", justifyContent: "center" }}><X size={14} /></button>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {group.members.map((m) => <button key={m.id} onClick={() => toggleItemParticipant(idx, m.id)} style={pillBtn(item.participants.includes(m.id), C.emerald)}>{m.name}</button>)}
                  </div>
                </div>
              ))}
              <button onClick={addItem} style={{ width: "100%", padding: "10px 0", borderRadius: 10, border: `1.5px dashed ${C.border}`, background: "transparent", color: C.muted, fontSize: 12.5 }}>+ Add item</button>
              <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700 }}>Total: {fmtMoney(itemsTotal, group.currency)}</div>
            </div>
          )}

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 16, cursor: "pointer" }}>
            <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} style={{ width: 16, height: 16, accentColor: C.gold }} />
            <Repeat size={13} color={C.gold} /> Repeats monthly
          </label>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={resetForm} style={{ flex: 1, padding: "12px 0", borderRadius: 12, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: 14 }}>Cancel</button>
            <button onClick={saveExpense} disabled={!canSave()} style={{ flex: 2, padding: "12px 0", borderRadius: 12, border: "none", background: canSave() ? GOLD_GRAD : C.border, color: canSave() ? "#1A1611" : C.mutedSoft, fontWeight: 700, fontSize: 14 }}>{editingExpenseId ? "Save changes" : "Save expense"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================= GROUPS LIST ============================= */

function GroupCard({ group, homeCurrency, onOpen, onDelete }) {
  const net = computeBalances(group.members, group.expenses);
  const mine = net["you"] ?? 0;
  const positive = mine > 0.5, negative = mine < -0.5;
  return (
    <div onClick={onOpen} className="glass-card" style={{ ...GLASS, borderRadius: 18, padding: "16px 18px", width: "100%", textAlign: "left", marginBottom: 12, cursor: "pointer" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 17, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{group.name}</div>
          <div style={{ fontSize: 11.5, color: C.mutedSoft, marginTop: 2 }}>{group.members.length} people &middot; {group.currency}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: positive ? C.emerald : negative ? C.wine : C.mutedSoft, textAlign: "right" }}>
            {positive ? `+${fmtMoney(mine, group.currency)}` : negative ? `-${fmtMoney(mine, group.currency)}` : "Settled"}
          </div>
          <ConfirmDeleteButton onConfirm={onDelete} compact />
        </div>
      </div>
      <div style={{ display: "flex", marginTop: 12 }}>
        {group.members.slice(0, 5).map((m, i) => (
          <div key={m.id} style={{ width: 26, height: 26, borderRadius: "50%", background: avatarColor(i), color: "#1A1611", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 11, marginLeft: i === 0 ? 0 : -8, border: `2px solid ${C.card}` }}>
            {m.name[0].toUpperCase()}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================= MAIN APP ============================= */

function MainApp({ profile, setProfile }) {
  const [groups, setGroups] = useState(() => seedGroups(profile.name, profile.homeCurrency));
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [tab, setTab] = useState("groups");
  const [showCreate, setShowCreate] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupCurrency, setNewGroupCurrency] = useState(profile.homeCurrency);

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);

  function updateGroup(updated) { setGroups((prev) => prev.map((g) => (g.id === updated.id ? updated : g))); }
  function createGroup() {
    if (!newGroupName.trim()) return;
    const g = { id: "g" + Date.now(), name: newGroupName.trim(), currency: newGroupCurrency, members: [{ id: "you", name: profile.name }], expenses: [] };
    setGroups((prev) => [...prev, g]);
    setNewGroupName(""); setShowCreate(false);
    setSelectedGroupId(g.id);
  }
  function deleteGroup(id) {
    setGroups((prev) => prev.filter((g) => g.id !== id));
    setSelectedGroupId((cur) => (cur === id ? null : cur));
  }

  const overallNet = useMemo(() => groups.reduce((sum, g) => {
    const net = computeBalances(g.members, g.expenses);
    return sum + convert(net["you"] ?? 0, g.currency, profile.homeCurrency);
  }, 0), [groups, profile.homeCurrency]);

  const categoryTotals = useMemo(() => {
    const totals = {};
    groups.forEach((g) => g.expenses.forEach((e) => {
      const share = getShares(e)["you"];
      if (share) totals[e.category] = (totals[e.category] || 0) + convert(share, g.currency, profile.homeCurrency);
    }));
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }, [groups, profile.homeCurrency]);
  const maxCategory = categoryTotals.length ? categoryTotals[0][1] : 1;

  const allRecurring = useMemo(() => groups.flatMap((g) => g.expenses.filter((e) => e.recurring).map((e) => ({ ...e, groupName: g.name, groupCurrency: g.currency, myShare: getShares(e)["you"] || 0 }))), [groups]);
  const recurringMonthlyTotal = allRecurring.reduce((s, e) => s + convert(e.myShare, e.groupCurrency, profile.homeCurrency), 0);

  const oweTotal = groups.reduce((s, g) => { const n = computeBalances(g.members, g.expenses)["you"] ?? 0; return n < 0 ? s + convert(-n, g.currency, profile.homeCurrency) : s; }, 0);
  const owedTotal = groups.reduce((s, g) => { const n = computeBalances(g.members, g.expenses)["you"] ?? 0; return n > 0 ? s + convert(n, g.currency, profile.homeCurrency) : s; }, 0);

  return (
    <div style={{ minHeight: "100vh", background: C.bgGlow, color: C.text, fontFamily: "'Inter', sans-serif", position: "relative", overflow: "hidden" }}>
      <style>{FONTS}</style>
      <div style={{ position: "absolute", width: 380, height: 380, borderRadius: "50%", background: "radial-gradient(circle, rgba(212,175,106,0.16), transparent 70%)", top: -120, right: -140, filter: "blur(20px)", animation: "floatBlob 12s ease-in-out infinite", pointerEvents: "none" }} />
      <div style={{ position: "absolute", width: 340, height: 340, borderRadius: "50%", background: "radial-gradient(circle, rgba(63,163,125,0.13), transparent 70%)", bottom: -100, left: -120, filter: "blur(20px)", animation: "floatBlob 15s ease-in-out infinite reverse", pointerEvents: "none" }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 460, margin: "0 auto", padding: "32px 16px 60px" }} className="fadeUp">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: GOLD_GRAD, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 18, color: "#1A1611", flexShrink: 0 }}>{profile.name[0].toUpperCase()}</div>
            <div>
              <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 18 }}>Hi, {profile.name.split(" ")[0]}</div>
              <div style={{ fontSize: 11.5, color: C.mutedSoft }}>{groups.length} group{groups.length === 1 ? "" : "s"}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: overallNet > 0.5 ? C.emeraldTint : overallNet < -0.5 ? C.wineTint : C.goldTint, color: overallNet > 0.5 ? C.emerald : overallNet < -0.5 ? C.wine : C.gold, padding: "8px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
            {overallNet > 0.5 ? `Owed ${fmtMoney(overallNet, profile.homeCurrency)}` : overallNet < -0.5 ? `Owe ${fmtMoney(overallNet, profile.homeCurrency)}` : "All settled"}
          </div>
        </div>

        <div style={{ display: "flex", gap: 4, background: "rgba(0,0,0,0.2)", backdropFilter: "blur(10px)", borderRadius: 16, padding: 5, marginBottom: 20, border: `1px solid ${C.border}` }}>
          {[{ id: "groups", label: "Groups", Icon: Users }, { id: "insights", label: "Insights", Icon: PieChart }, { id: "settings", label: "Settings", Icon: SettingsIcon }].map((t) => (
            <button key={t.id} onClick={() => { setTab(t.id); }} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "9px 0 8px", borderRadius: 12, border: "none", background: tab === t.id ? GOLD_GRAD : "transparent", color: tab === t.id ? "#1A1611" : C.muted, boxShadow: tab === t.id ? "0 4px 14px rgba(212,175,106,0.3)" : "none" }}>
              <t.Icon size={17} strokeWidth={2.3} />
              <span style={{ fontSize: 10.5, fontWeight: 700 }}>{t.label}</span>
            </button>
          ))}
        </div>

        {tab === "groups" && !selectedGroup && (
          <>
            {groups.map((g) => <GroupCard key={g.id} group={g} homeCurrency={profile.homeCurrency} onOpen={() => setSelectedGroupId(g.id)} onDelete={() => deleteGroup(g.id)} />)}
            {groups.length === 0 && (
              <div className="glass-card" style={{ ...GLASS, borderRadius: 16, padding: "20px 18px", marginBottom: 12, textAlign: "center" }}>
                <div style={{ fontSize: 13, color: C.muted }}>No groups yet. Create one to start splitting expenses.</div>
              </div>
            )}
            {!showCreate ? (
              <button onClick={() => setShowCreate(true)} style={{ width: "100%", padding: "14px 0", borderRadius: 14, border: `1.5px dashed ${C.border}`, background: "transparent", color: C.muted, fontWeight: 700, fontSize: 13.5, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <Plus size={15} /> New group
              </button>
            ) : (
              <div className="glass-card" style={{ ...GLASS, borderRadius: 16, padding: 18 }}>
                <input autoFocus placeholder="Group name" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} style={{ ...smallInput, marginBottom: 12, padding: "11px 12px", fontSize: 14 }} />
                <SectionLabel>Currency</SectionLabel>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                  {CURRENCIES.map((c) => <button key={c.code} onClick={() => setNewGroupCurrency(c.code)} style={pillBtn(newGroupCurrency === c.code)}>{c.symbol} {c.code}</button>)}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setShowCreate(false)} style={{ flex: 1, padding: "11px 0", borderRadius: 12, border: `1px solid ${C.border}`, background: "transparent", color: C.muted }}>Cancel</button>
                  <button onClick={createGroup} style={{ flex: 2, padding: "11px 0", borderRadius: 12, border: "none", background: GOLD_GRAD, color: "#1A1611", fontWeight: 700 }}>Create group</button>
                </div>
              </div>
            )}
          </>
        )}

        {tab === "groups" && selectedGroup && (
          <GroupDetail key={selectedGroup.id} group={selectedGroup} onUpdateGroup={updateGroup} onBack={() => setSelectedGroupId(null)} onDeleteGroup={() => deleteGroup(selectedGroup.id)} homeCurrency={profile.homeCurrency} />
        )}

        {tab === "insights" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", gap: 12 }}>
              <div className="glass-card" style={{ ...GLASS, borderRadius: 16, padding: "16px 14px", flex: 1 }}>
                <div style={{ fontSize: 11, color: C.mutedSoft, marginBottom: 6 }}>You're owed</div>
                <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 22, color: C.emerald }}>{fmtMoney(owedTotal, profile.homeCurrency)}</div>
              </div>
              <div className="glass-card" style={{ ...GLASS, borderRadius: 16, padding: "16px 14px", flex: 1 }}>
                <div style={{ fontSize: 11, color: C.mutedSoft, marginBottom: 6 }}>You owe</div>
                <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 22, color: C.wine }}>{fmtMoney(oweTotal, profile.homeCurrency)}</div>
              </div>
            </div>

            <div className="glass-card" style={{ ...GLASS, borderRadius: 16, padding: "16px 18px" }}>
              <SectionLabel>Your spend by category</SectionLabel>
              {categoryTotals.length === 0 && <div style={{ fontSize: 12.5, color: C.muted }}>No spend logged yet.</div>}
              {categoryTotals.map(([cat, amt]) => (
                <div key={cat} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                    <span>{cat}</span><span style={{ fontWeight: 700 }}>{fmtMoney(amt, profile.homeCurrency)}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)" }}>
                    <div style={{ height: "100%", borderRadius: 3, width: `${(amt / maxCategory) * 100}%`, background: GOLD_GRAD }} />
                  </div>
                </div>
              ))}
              <div style={{ fontSize: 10.5, color: C.mutedSoft, marginTop: 4 }}>Converted to {profile.homeCurrency} at illustrative demo exchange rates.</div>
            </div>

            <div className="glass-card" style={{ ...GLASS, borderRadius: 16, padding: "16px 18px" }}>
              <SectionLabel>Recurring, your share</SectionLabel>
              {allRecurring.length === 0 && <div style={{ fontSize: 12.5, color: C.muted }}>No recurring expenses yet.</div>}
              {allRecurring.map((e) => (
                <div key={e.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 12.5 }}>
                  <span>{e.desc} <span style={{ color: C.mutedSoft }}>&middot; {e.groupName}</span></span>
                  <span style={{ fontWeight: 700 }}>{fmtMoney(convert(e.myShare, e.groupCurrency, profile.homeCurrency), profile.homeCurrency)}/mo</span>
                </div>
              ))}
              {allRecurring.length > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${C.border}`, fontWeight: 700, fontSize: 13 }}>
                  <span>Total</span><span style={{ color: C.gold }}>{fmtMoney(recurringMonthlyTotal, profile.homeCurrency)}/mo</span>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "settings" && (
          <div className="glass-card" style={{ ...GLASS, borderRadius: 16, padding: "18px" }}>
            <SectionLabel>Your name</SectionLabel>
            <input value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} style={{ ...smallInput, marginBottom: 18, padding: "11px 12px", fontSize: 14 }} />
            <SectionLabel>Default currency</SectionLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
              {CURRENCIES.map((c) => <button key={c.code} onClick={() => setProfile((p) => ({ ...p, homeCurrency: c.code }))} style={pillBtn(profile.homeCurrency === c.code)}>{c.symbol} {c.code}</button>)}
            </div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 14 }}>
              This is a front-end demo — everything lives in this browser tab and resets on refresh. Say the word if you'd like a version with a real backend and database so it persists.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================= ROOT ============================= */

export default function SplitzyApp() {
  const [profile, setProfile] = useState(null);
  return profile ? <MainApp profile={profile} setProfile={setProfile} /> : <Landing onComplete={setProfile} />;
}
