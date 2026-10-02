export const CATEGORIES = [
  { name: "Checking", type: "asset", group: "Banking" },
  { name: "Savings", type: "asset", group: "Banking" },
  { name: "Cash", type: "asset", group: "Banking" },
  { name: "Brokerage", type: "asset", group: "Investments" },
  { name: "Retirement", type: "asset", group: "Investments" },
  { name: "Credit Card", type: "liability", group: "Credit & loans" },
  { name: "Loan", type: "liability", group: "Credit & loans" },
  { name: "Other", type: "asset", group: "Other" },
];
export const GROUP_ORDER = ["Banking", "Investments", "Credit & loans", "Other"];

export const CATEGORY_SYNONYMS = {
  ira: "Retirement", "roth ira": "Retirement", roth: "Retirement",
  "401k": "Retirement", "401(k)": "Retirement", "403b": "Retirement", "403(b)": "Retirement",
  pension: "Retirement", "sep ira": "Retirement", "rollover ira": "Retirement",
  cd: "Savings", "certificate of deposit": "Savings", "money market": "Savings", hysa: "Savings",
  "checking account": "Checking", "savings account": "Savings",
  credit: "Credit Card", "credit cards": "Credit Card",
  mortgage: "Loan", "auto loan": "Loan", "student loan": "Loan", "personal loan": "Loan",
  stock: "Brokerage", stocks: "Brokerage", investment: "Brokerage", investments: "Brokerage", etrade: "Brokerage",
};

export function normalizeCategory(raw) {
  const key = raw.trim().toLowerCase();
  return CATEGORY_SYNONYMS[key] || raw.trim();
}
export function groupForCategory(catName) {
  const preset = CATEGORIES.find((c) => c.name === catName);
  return preset ? preset.group : "Other";
}

export const SPEND_CATEGORIES = [
  "Groceries", "Dining", "Transport", "Travel", "Shopping",
  "Bills & utilities", "Entertainment", "Health", "Other",
];

export const RANGES = [
  { key: "1M", label: "1M", days: 30 },
  { key: "3M", label: "3M", days: 90 },
  { key: "YTD", label: "YTD", days: null },
  { key: "1Y", label: "1Y", days: 365 },
  { key: "3Y", label: "3Y", days: 1095 },
  { key: "ALL", label: "All", days: null },
];

export function uid(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
export function todayISO() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
export function fmtMoney(n) {
  const neg = n < 0;
  const v = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (neg ? "-$" : "$") + v;
}
export function fmtMoneyShort(n) {
  const neg = n < 0;
  const abs = Math.abs(n);
  let v;
  if (abs >= 1000) v = (abs / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 }) + "k";
  else v = abs.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return (neg ? "-$" : "$") + v;
}
export function fmtDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
export function daysBetween(iso1, iso2) {
  const [y1, m1, d1] = iso1.split("-").map(Number);
  const [y2, m2, d2] = iso2.split("-").map(Number);
  const a = Date.UTC(y1, m1 - 1, d1), b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86400000);
}
export function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export function defaultState() {
  return { familyName: "Agarwal Family", members: ["Yash", "Ananta", "Household"], accounts: [], snapshots: [], transactions: [] };
}

export function rangeCutoff(rangeKey) {
  const today = todayISO();
  if (rangeKey === "ALL") return null;
  if (rangeKey === "YTD") return today.slice(0, 4) + "-01-01";
  const r = RANGES.find((r) => r.key === rangeKey);
  return r && r.days ? addDays(today, -r.days) : null;
}

/* ---------- derived helpers (all take `state` explicitly — no module-level globals) ---------- */
export function snapshotsSorted(state) {
  return [...(state.snapshots || [])].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
export function latestSnapshot(state) {
  const s = snapshotsSorted(state);
  return s.length ? s[s.length - 1] : null;
}
export function prevSnapshot(state) {
  const s = snapshotsSorted(state);
  return s.length > 1 ? s[s.length - 2] : null;
}
export function snapshotsInRange(state, rangeKey) {
  const cutoff = rangeCutoff(rangeKey);
  const all = snapshotsSorted(state);
  if (!cutoff) return all;
  const filtered = all.filter((s) => s.date >= cutoff);
  if (filtered.length && filtered.length < all.length) {
    const firstIdx = all.indexOf(filtered[0]);
    if (firstIdx > 0) return [all[firstIdx - 1], ...filtered];
  }
  return filtered.length ? filtered : all;
}
export function accountSeries(state, accId) {
  return snapshotsSorted(state)
    .filter((s) => s.values && s.values[accId] != null)
    .map((s) => ({ date: s.date, value: s.values[accId] }));
}
export function latestValue(state, accId) {
  const series = accountSeries(state, accId);
  return series.length ? series[series.length - 1].value : 0;
}
export function accountDelta(state, accId) {
  const series = accountSeries(state, accId);
  if (series.length < 2) return null;
  return series[series.length - 1].value - series[series.length - 2].value;
}
export function netWorthOfSnapshot(state, snap) {
  let t = 0;
  for (const acc of state.accounts) {
    if (snap.values && snap.values[acc.id] != null) t += snap.values[acc.id];
  }
  return t;
}
export function currentNetWorth(state) {
  const s = latestSnapshot(state);
  return s ? netWorthOfSnapshot(state, s) : 0;
}
export function currentAssetsLiabilities(state) {
  const s = latestSnapshot(state);
  let a = 0, l = 0;
  if (s) {
    for (const acc of state.accounts) {
      const v = s.values[acc.id];
      if (v == null) continue;
      if (acc.type === "liability") l += v; else a += v;
    }
  }
  return { assets: a, liabilities: l };
}
export function ownerTotal(state, owner) {
  const s = latestSnapshot(state);
  if (!s) return 0;
  let t = 0;
  for (const acc of state.accounts) if (acc.owner === owner && s.values[acc.id] != null) t += s.values[acc.id];
  return t;
}
export function groupTotals(state, ownerFilter) {
  const s = latestSnapshot(state);
  const totals = { Banking: 0, Investments: 0, "Credit & loans": 0, Other: 0 };
  if (!s) return totals;
  for (const acc of state.accounts) {
    if (ownerFilter && acc.owner !== ownerFilter) continue;
    const v = s.values[acc.id];
    if (v == null) continue;
    const g = groupForCategory(acc.category);
    totals[g] = (totals[g] || 0) + v;
  }
  return totals;
}
export function groupAccounts(state) {
  const byOwner = {};
  for (const m of state.members) byOwner[m] = [];
  for (const acc of state.accounts) {
    if (!byOwner[acc.owner]) byOwner[acc.owner] = [];
    byOwner[acc.owner].push(acc);
  }
  return byOwner;
}
