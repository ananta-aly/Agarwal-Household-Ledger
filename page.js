"use client";

import { useEffect, useRef, useState } from "react";
import {
  CATEGORIES, GROUP_ORDER, SPEND_CATEGORIES, RANGES,
  normalizeCategory, groupForCategory, uid, todayISO, fmtMoney, fmtMoneyShort, fmtDate,
  defaultState, snapshotsSorted, latestSnapshot, prevSnapshot, snapshotsInRange,
  accountSeries, latestValue, accountDelta, netWorthOfSnapshot, currentNetWorth,
  currentAssetsLiabilities, ownerTotal, groupTotals, groupAccounts,
} from "../lib/utils";

const POLL_MS = 4000; // how often other devices' changes show up here
const IDENTITY_KEY = "ledgerIdentity";

async function fetchLedger() {
  const res = await fetch("/api/ledger", { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Request failed");
  }
  const { data } = await res.json();
  const next = data && data.accounts ? data : defaultState();
  if (!next.transactions) next.transactions = [];
  if (!next.members) next.members = defaultState().members;
  return next;
}

export default function Page() {
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [myIdentity, setMyIdentity] = useState(null);
  const [activeMainTab, setActiveMainTab] = useState("summary");
  const [activeRange, setActiveRange] = useState("1Y");
  const [activePortfolioTab, setActivePortfolioTab] = useState("Overall");
  const [activeOwnerTab, setActiveOwnerTab] = useState(null);
  const [modal, setModal] = useState(null); // { type, ...payload }
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const lastJson = useRef(null);

  // identity: a plain name stored on this browser, not a real login
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(IDENTITY_KEY) : null;
    if (saved) setMyIdentity(saved);
  }, []);

  // initial load + poll for changes made from other devices
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const next = await fetchLedger();
        if (cancelled) return;
        const json = JSON.stringify(next);
        if (json !== lastJson.current) {
          lastJson.current = json;
          setState(next);
        }
        setLoadError(null);
      } catch (e) {
        console.error("load failed", e);
        if (!cancelled) setLoadError(e.message);
      }
    }
    load();
    const id = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // first time this browser ever loads data with no stored identity, ask who's using it
  useEffect(() => {
    if (state && !myIdentity && !modal) {
      const saved = typeof window !== "undefined" ? window.localStorage.getItem(IDENTITY_KEY) : null;
      if (!saved) setModal({ type: "whoIsThis" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function showToast(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }

  function setIdentity(name) {
    setMyIdentity(name);
    if (typeof window !== "undefined") window.localStorage.setItem(IDENTITY_KEY, name);
  }

  async function saveState(mutator) {
    if (!state) return;
    const next = JSON.parse(JSON.stringify(state));
    mutator(next);
    lastJson.current = JSON.stringify(next);
    setState(next); // optimistic, so this device feels instant
    try {
      const res = await fetch("/api/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error("save failed");
    } catch (e) {
      console.error("save failed", e);
      showToast("Couldn't save — check your connection and try again");
    }
  }

  if (!state) {
    if (loadError) {
      return (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-dim)", maxWidth: 420, margin: "0 auto" }}>
          <p style={{ color: "var(--text)", fontWeight: 600 }}>Couldn&rsquo;t reach the database.</p>
          <p>{loadError}</p>
          <p>In your Vercel project, open the <strong>Storage</strong> tab and connect a database to this project, then redeploy.</p>
        </div>
      );
    }
    return <div style={{ padding: 40, textAlign: "center", color: "var(--text-dim)" }}>Loading your ledger…</div>;
  }

  const nw = currentNetWorth(state);
  const prev = prevSnapshot(state);
  const latest = latestSnapshot(state);
  const { assets, liabilities } = currentAssetsLiabilities(state);
  const prevNw = prev ? netWorthOfSnapshot(state, prev) : null;
  const delta = latest && prev ? nw - prevNw : null;
  const pct = delta != null && prevNw ? (delta / Math.abs(prevNw)) * 100 : null;

  return (
    <div id="app">
      <Ticker state={state} />
      <CompactHeader familyName={state.familyName} onSettings={() => setModal({ type: "settings" })} />
      <MainTabs active={activeMainTab} onChange={setActiveMainTab} />
      <div className="tab-content">
        {activeMainTab === "summary" && (
          <SummaryTab
            state={state} nw={nw} delta={delta} pct={pct} assets={assets} liabilities={liabilities}
            latest={latest} activeRange={activeRange} onRange={setActiveRange}
          />
        )}
        {activeMainTab === "portfolio" && (
          <PortfolioTab
            state={state} activeTab={activePortfolioTab} onTabChange={setActivePortfolioTab}
            onQuickAdd={(prefill) => setModal({ type: "addAccount", prefill })}
          />
        )}
        {activeMainTab === "balances" && (
          <BalancesTab
            state={state} activeOwnerTab={activeOwnerTab} setActiveOwnerTab={setActiveOwnerTab}
            onUpdateBalances={() => setModal({ type: "updateBalances" })}
            onAddAccount={() => setModal({ type: "addAccount" })}
            onEditAccount={(accId) => setModal({ type: "editAccount", accountId: accId })}
            onLogTx={(accId) => setModal({ type: "logTx", accountId: accId })}
          />
        )}
        {activeMainTab === "activity" && (
          <ActivityTab
            state={state}
            onEditSnapshot={(id) => setModal({ type: "editSnapshot", snapshotId: id })}
            onDeleteSnapshot={(id) => saveState((n) => { n.snapshots = n.snapshots.filter((s) => s.id !== id); })}
            onLogTx={() => setModal({ type: "logTx" })}
            onEditTx={(id) => setModal({ type: "editTx", txId: id })}
          />
        )}
      </div>
      <footer className="note">Synced live across every device signed into this ledger.</footer>

      {modal && (
        <ModalRoot
          modal={modal}
          state={state}
          myIdentity={myIdentity}
          setIdentity={setIdentity}
          saveState={saveState}
          showToast={showToast}
          onClose={() => setModal(null)}
          onChangeModal={setModal}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

/* ============================= Ticker ============================= */
function Ticker({ state }) {
  if (!state.accounts.length) {
    const item = (
      <div className="ticker-item">
        <span className="name">Agarwal Family Ledger</span>
        <span className="val">Add your first account to begin tracking</span>
      </div>
    );
    return (
      <div className="ticker-wrap">
        <div className="ticker-track" style={{ animationDuration: "18s" }}>{item}{item}</div>
      </div>
    );
  }
  const items = [];
  const nw = currentNetWorth(state);
  const prev = prevSnapshot(state), latest = latestSnapshot(state);
  if (latest) {
    const prevNw = prev ? netWorthOfSnapshot(state, prev) : null;
    items.push({ key: "nw", owner: null, name: "Household net worth", v: nw, pv: prevNw });
  }
  for (const acc of state.accounts) {
    const series = accountSeries(state, acc.id);
    if (!series.length) continue;
    const v = series[series.length - 1].value;
    const pv = series.length > 1 ? series[series.length - 2].value : null;
    items.push({ key: acc.id, owner: acc.owner, name: acc.name, v, pv });
  }
  const dur = Math.max(18, items.length * 3.2);
  const renderItems = (suffix) => items.map((it) => <TickerItem key={it.key + suffix} {...it} />);
  return (
    <div className="ticker-wrap">
      <div className="ticker-track" style={{ animationDuration: dur + "s" }}>
        {renderItems("a")}
        {renderItems("b")}
      </div>
    </div>
  );
}
function TickerItem({ owner, name, v, pv }) {
  let deltaEl = null;
  if (pv != null) {
    const d = v - pv;
    if (Math.abs(d) > 0.004) {
      const cls = d > 0 ? "up" : "down";
      const sym = d > 0 ? "▲" : "▼";
      deltaEl = <span className={cls}> {sym} {fmtMoneyShort(Math.abs(d))}</span>;
    }
  }
  return (
    <div className="ticker-item">
      {owner && <span className="owner-tag">{owner}</span>}
      <span className="name">{name}</span>
      <span className="val">{fmtMoneyShort(v)}</span>
      {deltaEl}
    </div>
  );
}

/* ============================= Header / main tabs ============================= */
function CompactHeader({ familyName, onSettings }) {
  return (
    <div className="compact-header">
      <div className="wordmark-sm serif">{familyName}</div>
      <button className="icon-btn" aria-label="Settings" title="Settings" onClick={onSettings}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
        </svg>
      </button>
    </div>
  );
}
function MainTabs({ active, onChange }) {
  const tabs = [
    { key: "summary", label: "Summary" },
    { key: "portfolio", label: "Portfolio" },
    { key: "balances", label: "Balances" },
    { key: "activity", label: "Activity" },
  ];
  return (
    <div className="main-tabs">
      {tabs.map((t) => (
        <button
          key={t.key}
          className={"main-tab-btn" + (active === t.key ? " active" : "")}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ============================= Summary tab ============================= */
function SummaryTab({ state, nw, delta, pct, assets, liabilities, latest, activeRange, onRange }) {
  const [tip, setTip] = useState("");
  let deltaLine = latest ? "Last entry: " + fmtDate(latest.date) : "No balances recorded yet";
  if (delta != null) {
    const cls = delta >= 0 ? "up" : "down";
    const sym = delta >= 0 ? "▲" : "▼";
    deltaLine = (
      <>
        <span className={cls}>{sym} {fmtMoney(Math.abs(delta))}{pct != null ? " (" + Math.abs(pct).toFixed(1) + "%)" : ""}</span>
        {" since " + fmtDate(prevSnapshot(state).date)}
      </>
    );
  }
  const present = GROUP_ORDER.filter((g) => state.accounts.some((a) => groupForCategory(a.category) === g));
  const groups = groupTotals(state, null);

  return (
    <>
      <div className="hero">
        <div className="net-worth-block">
          <div className="net-worth-label">Total household net worth</div>
          <div className="net-worth-figure serif tabular">{fmtMoney(nw)}</div>
          <div className="net-worth-delta">{deltaLine}</div>
        </div>
        <div className="hero-meta">
          <div><div className="m-label">ASSETS</div><div className="m-value tabular">{fmtMoney(assets)}</div></div>
          <div><div className="m-label">LIABILITIES</div><div className="m-value tabular">{fmtMoney(liabilities)}</div></div>
          <div><div className="m-label">LAST UPDATED</div><div className="m-value">{latest ? fmtDate(latest.date) : "—"}</div></div>
        </div>
      </div>
      <div className="range-chips">
        {RANGES.map((r) => (
          <button key={r.key} className={"chip" + (activeRange === r.key ? " active" : "")} onClick={() => onRange(r.key)}>
            {r.label}
          </button>
        ))}
      </div>
      <TrendChart state={state} rangeKey={activeRange} tip={tip} setTip={setTip} />
      {state.accounts.length > 0 && (
        <div className="section-block">
          <h2 className="section-title">Allocation</h2>
          {present.map((g) => <AllocRow key={g} label={g} value={groups[g] || 0} scopeTotal={nw} />)}
        </div>
      )}
    </>
  );
}

function AllocRow({ label, value, scopeTotal, spend }) {
  const base = Math.abs(scopeTotal) || 1;
  const pct = Math.min(100, (Math.abs(value) / base) * 100);
  return (
    <div className="alloc-row">
      <div className="alloc-label">{label}</div>
      <div className="alloc-bar-wrap">
        <div className={"alloc-bar" + (value < 0 ? " neg" : "") + (spend ? " spend" : "")} style={{ width: pct.toFixed(1) + "%" }} />
      </div>
      <div className={"alloc-value tabular" + (value < 0 ? " neg" : "")}>{fmtMoney(value)}</div>
    </div>
  );
}

function TrendChart({ state, rangeKey, tip, setTip }) {
  const snaps = snapshotsInRange(state, rangeKey || "ALL");
  if (snaps.length < 2) {
    return (
      <div className="chart-section">
        <div className="chart-empty">
          Your trend line appears once you&rsquo;ve recorded at least two updates{rangeKey && rangeKey !== "ALL" ? " in this range" : ""}.
        </div>
      </div>
    );
  }
  const points = snaps.map((s) => ({ date: s.date, v: netWorthOfSnapshot(state, s) }));
  const w = 676, h = 150, padL = 4, padR = 4, padT = 14, padB = 22;
  const vals = points.map((p) => p.v);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const range = maxV - minV || 1;
  const n = points.length;
  const x = (i) => padL + (i / (n - 1)) * (w - padL - padR);
  const y = (v) => padT + (1 - (v - minV) / range) * (h - padT - padB);
  let path = "";
  points.forEach((p, i) => { path += (i === 0 ? "M" : "L") + x(i).toFixed(1) + "," + y(p.v).toFixed(1) + " "; });
  const areaPath = path + "L" + x(n - 1).toFixed(1) + "," + (h - padB) + " L" + x(0).toFixed(1) + "," + (h - padB) + " Z";

  return (
    <div className="chart-section">
      <div className="chart-box">
        <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="150">
          <defs>
            <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#areaFill)" stroke="none" />
          <path d={path} fill="none" stroke="var(--gold)" strokeWidth="2" />
          {points.map((p, i) => (
            <circle
              key={i}
              cx={x(i).toFixed(1)} cy={y(p.v).toFixed(1)} r="3.2"
              fill="var(--gold)" stroke="var(--paper)" strokeWidth="1.5"
              onMouseEnter={() => setTip(fmtDate(p.date) + " — " + fmtMoney(p.v))}
            />
          ))}
        </svg>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>
          <span>{fmtDate(points[0].date)}</span>
          <span>{fmtDate(points[n - 1].date)}</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-dim)", minHeight: 16, marginTop: 4 }}>{tip}</div>
      </div>
    </div>
  );
}

/* ============================= Portfolio tab ============================= */
function PortfolioTab({ state, activeTab, onTabChange, onQuickAdd }) {
  const scopes = ["Overall", ...state.members.filter((m, i, a) => a.indexOf(m) === i)];
  const current = scopes.includes(activeTab) ? activeTab : "Overall";

  const subTabs = (
    <div className="owner-tabs">
      {scopes.map((s) => (
        <button key={s} className={"tab-btn" + (s === current ? " active" : "")} onClick={() => onTabChange(s)}>{s}</button>
      ))}
    </div>
  );

  if (!state.accounts.length) {
    return (
      <>
        {subTabs}
        <div className="portfolio-body"><div className="chart-empty">Add accounts in Balances to see a portfolio breakdown here.</div></div>
      </>
    );
  }

  const nw = currentNetWorth(state);
  let body;
  if (current === "Overall") {
    const groups = groupTotals(state, null);
    const present = GROUP_ORDER.filter((g) => state.accounts.some((a) => groupForCategory(a.category) === g));
    body = (
      <>
        <div className="section-block">
          <h2 className="section-title">Net worth by person</h2>
          {state.members.map((m) => <AllocRow key={m} label={m} value={ownerTotal(state, m)} scopeTotal={nw} />)}
        </div>
        <div className="section-block">
          <h2 className="section-title">Asset allocation</h2>
          {present.map((g) => <AllocRow key={g} label={g} value={groups[g] || 0} scopeTotal={nw} />)}
        </div>
        <RecoBox text="Shared costs — a home loan, a car loan, joint checking, or anything you both contribute to — usually sit under Household rather than split between you." />
      </>
    );
  } else {
    const total = ownerTotal(state, current);
    const groups = groupTotals(state, current);
    const present = GROUP_ORDER.filter((g) => state.accounts.some((a) => a.owner === current && groupForCategory(a.category) === g));
    body = (
      <>
        <div className="net-worth-label" style={{ marginTop: 2 }}>{current}&rsquo;s net worth</div>
        <div className="net-worth-figure serif tabular" style={{ fontSize: 30 }}>{fmtMoney(total)}</div>
        <div className="section-block">
          <h2 className="section-title">Allocation</h2>
          {present.length
            ? present.map((g) => <AllocRow key={g} label={g} value={groups[g] || 0} scopeTotal={total} />)
            : <div className="chart-empty">No accounts yet for {current}.</div>}
        </div>
        {current === "Household" ? (
          <>
            <RecoBox text="Common things to track here: a home loan or mortgage, a car loan, joint checking or savings, and any shared credit card." />
            <div className="quick-add-row">
              <button className="chip quick-add-chip" onClick={() => onQuickAdd({ owner: "Household", category: "Loan", name: "Home Loan" })}>+ Home loan</button>
              <button className="chip quick-add-chip" onClick={() => onQuickAdd({ owner: "Household", category: "Loan", name: "Car Loan" })}>+ Car loan</button>
              <button className="chip quick-add-chip" onClick={() => onQuickAdd({ owner: "Household", category: "Checking", name: "Joint Checking" })}>+ Joint checking</button>
            </div>
          </>
        ) : (
          <RecoBox text={`This is ${current}\u2019s own space — individual checking, personal credit cards, and any brokerage or retirement accounts held in just their name.`} />
        )}
      </>
    );
  }

  return (
    <>
      {subTabs}
      <div className="portfolio-body">{body}</div>
    </>
  );
}
function RecoBox({ text }) {
  return (
    <div className="reco-box">
      <div className="reco-label">Suggestion</div>
      <p>{text}</p>
    </div>
  );
}

/* ============================= Balances tab ============================= */
function BalancesTab({ state, activeOwnerTab, setActiveOwnerTab, onUpdateBalances, onAddAccount, onEditAccount, onLogTx }) {
  const actions = (
    <div className="actions-row">
      <button className="btn btn-primary" disabled={!state.accounts.length} style={!state.accounts.length ? { opacity: 0.45, cursor: "not-allowed" } : undefined} onClick={onUpdateBalances}>
        Update balances
      </button>
      <button className="btn btn-secondary" onClick={onAddAccount}>Add account</button>
    </div>
  );

  if (!state.accounts.length) {
    return (
      <>
        {actions}
        <div className="ledger">
          <div className="empty-state">
            <div className="serif" style={{ fontSize: 19 }}>Your ledger is empty</div>
            <p>Add your checking, savings, brokerage, credit card, and retirement accounts to start tracking the household&rsquo;s net worth.</p>
            <button className="btn btn-primary" onClick={onAddAccount}>Add your first account</button>
          </div>
        </div>
      </>
    );
  }

  const grouped = groupAccounts(state);
  const owners = [...state.members, ...state.accounts.map((a) => a.owner)]
    .filter((o, i, arr) => arr.indexOf(o) === i)
    .filter((o) => (grouped[o] || []).length);
  const current = owners.includes(activeOwnerTab) ? activeOwnerTab : owners[0];

  const accs = grouped[current] || [];
  const total = ownerTotal(state, current);
  const byGroup = {};
  for (const a of accs) {
    const g = groupForCategory(a.category);
    byGroup[g] = byGroup[g] || {};
    (byGroup[g][a.category] = byGroup[g][a.category] || []).push(a);
  }
  const groupsPresent = GROUP_ORDER.filter((g) => byGroup[g]);
  for (const g of Object.keys(byGroup)) if (!groupsPresent.includes(g)) groupsPresent.push(g);

  return (
    <>
      {actions}
      <div className="ledger">
        <div className="owner-tabs">
          {owners.map((o) => (
            <button key={o} className={"tab-btn" + (o === current ? " active" : "")} onClick={() => setActiveOwnerTab(o)}>{o}</button>
          ))}
        </div>
        <div className="owner-group">
          <div className="owner-head">
            <div className="owner-name">All accounts</div>
            <div className={"owner-total tabular" + (total < 0 ? " neg" : "")}>{fmtMoney(total)}</div>
          </div>
          {groupsPresent.map((g, gi) => (
            <div key={g} className={"super-group" + (gi === 0 ? " first" : "")}>
              <div className="group-head">{g}</div>
              {Object.keys(byGroup[g]).map((cat) => (
                <div key={cat} className="cat-group">
                  <div className="cat-label">{cat}</div>
                  {byGroup[g][cat].map((acc) => (
                    <AccountRow key={acc.id} state={state} acc={acc} onEdit={() => onEditAccount(acc.id)} onLogTx={() => onLogTx(acc.id)} />
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function AccountRow({ state, acc, onEdit, onLogTx }) {
  const v = latestValue(state, acc.id);
  const d = accountDelta(state, acc.id);
  let deltaEl = <span className="acct-delta flat">first entry</span>;
  if (d != null) {
    if (Math.abs(d) < 0.005) deltaEl = <span className="acct-delta flat">no change</span>;
    else {
      const cls = d > 0 ? "up" : "down";
      const sym = d > 0 ? "▲" : "▼";
      deltaEl = <span className={"acct-delta " + cls}>{sym} {fmtMoney(Math.abs(d))}</span>;
    }
  }
  const series = accountSeries(state, acc.id).slice(-6);
  return (
    <div className="acct-row">
      <div className="acct-left"><div className="acct-name">{acc.name}</div></div>
      <div className="acct-right">
        {series.length >= 2 && <Sparkline series={series} lastDelta={d} />}
        {deltaEl}
        <div className={"acct-balance tabular" + (v < 0 ? " neg" : "")}>{fmtMoney(v)}</div>
        {acc.category === "Credit Card" && (
          <button className="row-menu-btn" aria-label="Log a charge" title="Log a charge" onClick={onLogTx}>+</button>
        )}
        <button className="row-menu-btn" aria-label="Edit account" title="Edit" onClick={onEdit}>⋮</button>
      </div>
    </div>
  );
}
function Sparkline({ series, lastDelta }) {
  const w = 46, h = 20;
  const vals = series.map((s) => s.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const n = series.length;
  const pts = series.map((s, i) => {
    const x = (i / (n - 1)) * w;
    const y = h - ((s.value - min) / range) * h;
    return x.toFixed(1) + "," + y.toFixed(1);
  }).join(" ");
  const color = lastDelta == null ? "var(--text-dim)" : lastDelta >= 0 ? "var(--positive)" : "var(--negative)";
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ============================= Activity tab ============================= */
function ActivityTab({ state, onEditSnapshot, onDeleteSnapshot, onLogTx, onEditTx }) {
  const snaps = snapshotsSorted(state).slice().reverse();
  const txs = [...state.transactions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const byCat = {};
  let txTotal = 0;
  for (const t of txs) { byCat[t.category] = (byCat[t.category] || 0) + t.amount; txTotal += t.amount; }
  const catKeys = Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a]);

  return (
    <>
      <div className="section-block">
        <div className="section-head-row">
          <h2 className="section-title">Spending by category</h2>
          <button className="btn btn-secondary btn-sm" onClick={() => onLogTx()}>Log a charge</button>
        </div>
        {txs.length
          ? catKeys.map((c) => <AllocRow key={c} label={c} value={byCat[c]} scopeTotal={txTotal} spend />)
          : <div className="chart-empty">No charges logged yet. Log a card charge to start building your spending picture.</div>}
      </div>

      {txs.length > 0 && (
        <div className="section-block">
          <h2 className="section-title">Recent charges</h2>
          {txs.slice(0, 30).map((t) => {
            const acc = state.accounts.find((a) => a.id === t.accountId);
            return (
              <div key={t.id} className="tx-row">
                <div className="tx-left">
                  <div className="tx-merchant">{t.merchant || t.category}</div>
                  <div className="tx-sub">{fmtDate(t.date)} · {acc ? acc.name : "Deleted account"} · {t.category}</div>
                </div>
                <div className="tx-right">
                  <div className="tx-amount tabular">{fmtMoney(t.amount)}</div>
                  <button className="row-menu-btn" title="Edit" onClick={() => onEditTx(t.id)}>⋮</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="section-block">
        <h2 className="section-title">Balance updates</h2>
        {!snaps.length
          ? <div className="chart-empty">No updates recorded yet.</div>
          : snaps.map((s) => (
            <div key={s.id} className="hist-item">
              <div><div className="h-date">{fmtDate(s.date)}</div><div className="h-by">{s.date}{s.createdBy ? " · logged by " + s.createdBy : ""}</div></div>
              <div style={{ display: "flex", alignItems: "center" }}>
                <div className="h-total tabular">{fmtMoney(netWorthOfSnapshot(state, s))}</div>
                <button className="h-edit" onClick={() => onEditSnapshot(s.id)}>Edit</button>
                <ConfirmButton className="h-del" onConfirm={() => onDeleteSnapshot(s.id)}>Delete</ConfirmButton>
              </div>
            </div>
          ))}
      </div>
    </>
  );
}

/* ============================= Confirm button (arm then confirm, no native dialogs) ============================= */
function ConfirmButton({ onConfirm, className, children, style }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button
      className={className}
      style={armed ? { ...style, background: "var(--negative)", color: "#fff", borderColor: "var(--negative)" } : style}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          timer.current = setTimeout(() => setArmed(false), 3000);
          return;
        }
        clearTimeout(timer.current);
        setArmed(false);
        onConfirm();
      }}
    >
      {armed ? "Click again to confirm" : children}
    </button>
  );
}

/* ============================= Modals ============================= */
function ModalRoot({ modal, state, myIdentity, setIdentity, saveState, showToast, onClose, onChangeModal }) {
  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target.classList.contains("modal-backdrop")) onClose(); }}>
      <div className="modal">
        <button className="close-x" onClick={onClose}>&times;</button>
        {modal.type === "addAccount" && <AddAccountModal state={state} prefill={modal.prefill} saveState={saveState} showToast={showToast} onClose={onClose} />}
        {modal.type === "editAccount" && <EditAccountModal state={state} accountId={modal.accountId} saveState={saveState} showToast={showToast} onClose={onClose} />}
        {modal.type === "updateBalances" && <UpdateBalancesModal state={state} myIdentity={myIdentity} saveState={saveState} showToast={showToast} onClose={onClose} />}
        {modal.type === "whoIsThis" && <WhoIsThisModal state={state} setIdentity={setIdentity} onClose={onClose} />}
        {modal.type === "editSnapshot" && <EditSnapshotModal state={state} snapshotId={modal.snapshotId} saveState={saveState} showToast={showToast} onClose={onClose} />}
        {modal.type === "settings" && <SettingsModal state={state} myIdentity={myIdentity} saveState={saveState} showToast={showToast} onClose={onClose} onChangeModal={onChangeModal} />}
        {modal.type === "logTx" && <LogTransactionModal state={state} myIdentity={myIdentity} accountId={modal.accountId} saveState={saveState} showToast={showToast} onClose={onClose} />}
        {modal.type === "editTx" && <EditTransactionModal state={state} txId={modal.txId} saveState={saveState} showToast={showToast} onClose={onClose} />}
      </div>
    </div>
  );
}

function AddAccountModal({ state, prefill, saveState, showToast, onClose }) {
  prefill = prefill || {};
  const presetCat = CATEGORIES.find((c) => c.name === prefill.category);
  const [owner, setOwner] = useState(prefill.owner || state.members[0]);
  const [newOwner, setNewOwner] = useState("");
  const [cat, setCat] = useState(presetCat ? prefill.category : (prefill.category ? "__new__" : "Checking"));
  const [newCat, setNewCat] = useState(prefill.category && !presetCat ? prefill.category : "");
  const [name, setName] = useState(prefill.name || "");
  const [type, setType] = useState(presetCat ? presetCat.type : "asset");
  const [balance, setBalance] = useState("");

  function handleCatChange(val) {
    setCat(val);
    if (val !== "__new__") {
      const c = CATEGORIES.find((c) => c.name === val);
      if (c) setType(c.type);
    }
  }

  async function handleSave() {
    let finalOwner = owner;
    if (owner === "__new__") {
      finalOwner = newOwner.trim();
      if (!finalOwner) { showToast("Enter a name for the new person"); return; }
    }
    let finalCat = cat, autoFolded = false;
    if (cat === "__new__") {
      const typed = newCat.trim();
      if (!typed) { showToast("Enter a category name"); return; }
      finalCat = normalizeCategory(typed);
      autoFolded = finalCat !== typed;
    }
    const finalName = name.trim();
    if (!finalName) { showToast("Enter an account name"); return; }
    const bal = parseFloat(balance || "0");
    const accId = uid("acc");
    await saveState((next) => {
      if (!next.members.includes(finalOwner)) next.members.push(finalOwner);
      next.accounts.push({ id: accId, owner: finalOwner, category: finalCat, name: finalName, type });
      if (!next.snapshots.length) {
        next.snapshots.push({ id: uid("snap"), date: todayISO(), values: { [accId]: bal }, createdAt: Date.now() });
      } else {
        const sorted = [...next.snapshots].sort((a, b) => (a.date < b.date ? -1 : 1));
        const last = sorted[sorted.length - 1];
        if (last.date === todayISO()) last.values[accId] = bal;
        else {
          const vals = Object.assign({}, last.values, { [accId]: bal });
          next.snapshots.push({ id: uid("snap"), date: todayISO(), values: vals, createdAt: Date.now() });
        }
      }
    });
    onClose();
    showToast(autoFolded ? "Account added, grouped under " + finalCat : "Account added");
  }

  return (
    <>
      <h2>Add an account</h2>
      <p className="modal-sub">Checking, savings, brokerage, a ROTH IRA, a credit card — anything you want to track.</p>
      <div className="field">
        <label>Belongs to</label>
        <select value={owner} onChange={(e) => setOwner(e.target.value)}>
          {state.members.map((m) => <option key={m} value={m}>{m}</option>)}
          <option value="__new__">+ Add a new person…</option>
        </select>
      </div>
      {owner === "__new__" && (
        <div className="field"><label>New person&rsquo;s name</label><input value={newOwner} onChange={(e) => setNewOwner(e.target.value)} placeholder="e.g. Priya" /></div>
      )}
      <div className="field">
        <label>Category</label>
        <select value={cat} onChange={(e) => handleCatChange(e.target.value)}>
          {CATEGORIES.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          <option value="__new__">+ Custom category…</option>
        </select>
      </div>
      {cat === "__new__" && (
        <div className="field">
          <label>Custom category name</label>
          <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="e.g. ROTH IRA" />
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
            Retirement accounts like 401(k), IRA, or Roth group under Retirement automatically.
          </div>
        </div>
      )}
      <div className="field"><label>Account name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chase Freedom" /></div>
      <div className="field">
        <label>This account is an</label>
        <div className="seg">
          <button type="button" className={type === "asset" ? "active" : ""} onClick={() => setType("asset")}>Asset</button>
          <button type="button" className={type === "liability" ? "active" : ""} onClick={() => setType("liability")}>Liability / debt</button>
        </div>
      </div>
      <div className="field">
        <label>{type === "liability" ? "Current balance ($, negative if you owe)" : "Current balance ($)"}</label>
        <input type="number" step="0.01" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0.00" />
      </div>
      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}>Add account</button>
      </div>
    </>
  );
}

function EditAccountModal({ state, accountId, saveState, showToast, onClose }) {
  const acc = state.accounts.find((a) => a.id === accountId);
  const [owner, setOwner] = useState(acc.owner);
  const [cat, setCat] = useState(acc.category);
  const [name, setName] = useState(acc.name);
  const [type, setType] = useState(acc.type);
  const isCustomCat = !CATEGORIES.find((c) => c.name === acc.category);

  async function handleSave() {
    const finalName = name.trim();
    if (!finalName) { showToast("Enter an account name"); return; }
    await saveState((next) => {
      const a = next.accounts.find((a) => a.id === accountId);
      a.owner = owner; a.category = cat; a.name = finalName; a.type = type;
    });
    onClose();
    showToast("Account updated");
  }
  async function handleDelete() {
    await saveState((next) => { next.accounts = next.accounts.filter((a) => a.id !== accountId); });
    onClose();
    showToast("Account deleted");
  }

  return (
    <>
      <h2>Edit account</h2>
      <div className="field">
        <label>Belongs to</label>
        <select value={owner} onChange={(e) => setOwner(e.target.value)}>
          {state.members.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Category</label>
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          {CATEGORIES.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          {isCustomCat && <option value={acc.category}>{acc.category} (custom)</option>}
        </select>
      </div>
      <div className="field"><label>Account name</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="field">
        <label>This account is an</label>
        <div className="seg">
          <button type="button" className={type === "asset" ? "active" : ""} onClick={() => setType("asset")}>Asset</button>
          <button type="button" className={type === "liability" ? "active" : ""} onClick={() => setType("liability")}>Liability / debt</button>
        </div>
      </div>
      <div className="modal-actions">
        <ConfirmButton className="btn btn-secondary" style={{ color: "var(--negative)", borderColor: "var(--negative)" }} onConfirm={handleDelete}>Delete</ConfirmButton>
        <button className="btn btn-primary" onClick={handleSave}>Save changes</button>
      </div>
    </>
  );
}

function UpdateBalancesModal({ state, myIdentity, saveState, showToast, onClose }) {
  const latest = latestSnapshot(state);
  const [date, setDate] = useState(todayISO());
  const [values, setValues] = useState(() => {
    const init = {};
    for (const acc of state.accounts) init[acc.id] = latest && latest.values[acc.id] != null ? latest.values[acc.id] : 0;
    return init;
  });

  async function handleSave() {
    const finalDate = date || todayISO();
    const finalValues = {};
    for (const acc of state.accounts) finalValues[acc.id] = parseFloat(values[acc.id] || 0);
    await saveState((next) => {
      const idx = next.snapshots.findIndex((s) => s.date === finalDate);
      if (idx >= 0) next.snapshots[idx].values = finalValues;
      else next.snapshots.push({ id: uid("snap"), date: finalDate, values: finalValues, createdAt: Date.now(), createdBy: myIdentity });
    });
    onClose();
    showToast("Balances updated");
  }

  return (
    <>
      <h2>Update balances</h2>
      <p className="modal-sub">Enter today&rsquo;s figure for each account. Leave unchanged if nothing has moved.</p>
      <div className="field"><label>Snapshot date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      {state.accounts.map((acc) => (
        <div key={acc.id} className="update-row">
          <div className="u-label"><div className="n">{acc.name}</div><div className="s">{acc.owner} · {acc.category}</div></div>
          <input
            type="number" step="0.01" value={values[acc.id]}
            onChange={(e) => setValues((v) => ({ ...v, [acc.id]: e.target.value }))}
          />
        </div>
      ))}
      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}>Save update</button>
      </div>
    </>
  );
}

function EditSnapshotModal({ state, snapshotId, saveState, showToast, onClose }) {
  const snap = state.snapshots.find((s) => s.id === snapshotId);
  const [date, setDate] = useState(snap.date);
  const [values, setValues] = useState(() => {
    const init = {};
    for (const acc of state.accounts) init[acc.id] = snap.values[acc.id] != null ? snap.values[acc.id] : "";
    return init;
  });

  async function handleSave() {
    const finalDate = date || snap.date;
    const finalValues = {};
    for (const acc of state.accounts) finalValues[acc.id] = parseFloat(values[acc.id] || 0);
    await saveState((next) => {
      const t = next.snapshots.find((s) => s.id === snapshotId);
      t.date = finalDate; t.values = finalValues;
    });
    onClose();
    showToast("Update saved");
  }
  async function handleDelete() {
    await saveState((next) => { next.snapshots = next.snapshots.filter((s) => s.id !== snapshotId); });
    onClose();
    showToast("Update deleted");
  }

  return (
    <>
      <h2>Edit update</h2>
      <p className="modal-sub">Correct the figures recorded for this date, or change the date itself.</p>
      <div className="field"><label>Snapshot date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      {state.accounts.length === 0
        ? <div className="chart-empty">No accounts existed yet when this update was recorded.</div>
        : state.accounts.map((acc) => (
          <div key={acc.id} className="update-row">
            <div className="u-label"><div className="n">{acc.name}</div><div className="s">{acc.owner} · {acc.category}</div></div>
            <input type="number" step="0.01" value={values[acc.id]} onChange={(e) => setValues((v) => ({ ...v, [acc.id]: e.target.value }))} />
          </div>
        ))}
      <div className="modal-actions">
        <ConfirmButton className="btn btn-secondary" style={{ color: "var(--negative)", borderColor: "var(--negative)" }} onConfirm={handleDelete}>Delete update</ConfirmButton>
        <button className="btn btn-primary" onClick={handleSave}>Save changes</button>
      </div>
    </>
  );
}

function SettingsModal({ state, myIdentity, saveState, showToast, onClose, onChangeModal }) {
  const [familyName, setFamilyName] = useState(state.familyName);
  const [members, setMembers] = useState([...state.members]);

  async function handleSave() {
    const finalName = familyName.trim() || "Household";
    const finalMembers = members.map((m) => m.trim()).filter(Boolean);
    await saveState((next) => { next.familyName = finalName; next.members = finalMembers.length ? finalMembers : next.members; });
    onClose();
    showToast("Settings saved");
  }

  return (
    <>
      <h2>Household settings</h2>
      <div className="field">
        <label>This device is logged as</label>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>{myIdentity || "Not set"}</div>
          <button className="btn-text" style={{ padding: 0 }} onClick={() => onChangeModal({ type: "whoIsThis" })}>Change</button>
        </div>
      </div>
      <div className="field"><label>Household name</label><input value={familyName} onChange={(e) => setFamilyName(e.target.value)} /></div>
      <div className="field">
        <label>People</label>
        <div className="members-list">
          {members.map((m, i) => (
            <div className="mrow" key={i}>
              <input value={m} onChange={(e) => setMembers((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))} />
              <button onClick={() => setMembers((arr) => arr.filter((_, j) => j !== i))}>Remove</button>
            </div>
          ))}
        </div>
        <button className="btn-text" style={{ padding: "4px 0" }} onClick={() => setMembers((arr) => [...arr, ""])}>+ Add a person</button>
      </div>
      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}>Save</button>
      </div>
    </>
  );
}

function WhoIsThisModal({ state, setIdentity, onClose }) {
  const [other, setOther] = useState("");
  function choose(name) {
    if (!name.trim()) return;
    setIdentity(name.trim());
    onClose();
  }
  return (
    <>
      <h2>Who&rsquo;s using this device?</h2>
      <p className="modal-sub">This just labels updates as yours on this browser — it&rsquo;s not a password, and you can change it anytime from Settings.</p>
      <div className="quick-add-row" style={{ marginTop: 0 }}>
        {state.members.map((m) => (
          <button key={m} className="chip" style={{ padding: "9px 16px", fontSize: 13.5 }} onClick={() => choose(m)}>{m}</button>
        ))}
      </div>
      <div className="field" style={{ marginTop: 16 }}>
        <label>Someone else?</label>
        <input value={other} onChange={(e) => setOther(e.target.value)} placeholder="Type a name" />
      </div>
      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onClose}>Skip for now</button>
        <button className="btn btn-primary" onClick={() => choose(other)}>Continue</button>
      </div>
    </>
  );
}

function LogTransactionModal({ state, myIdentity, accountId, saveState, showToast, onClose }) {
  const cards = state.accounts.filter((a) => a.category === "Credit Card");
  const [card, setCard] = useState(accountId || (cards[0] && cards[0].id) || "");
  const [date, setDate] = useState(todayISO());
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Groceries");

  if (!cards.length) {
    return (
      <>
        <h2>Log a charge</h2>
        <p className="modal-sub">You&rsquo;ll need a credit card account first — add one from Balances, with category set to Credit Card, then come back here.</p>
        <div className="modal-actions"><button className="btn btn-primary" onClick={onClose}>Got it</button></div>
      </>
    );
  }

  async function handleSave() {
    const amt = parseFloat(amount || "0");
    if (!amt) { showToast("Enter an amount"); return; }
    await saveState((next) => {
      next.transactions.push({ id: uid("tx"), accountId: card, date, merchant: merchant.trim(), amount: amt, category, createdAt: Date.now(), createdBy: myIdentity });
    });
    onClose();
    showToast("Charge logged");
  }

  return (
    <>
      <h2>Log a charge</h2>
      <p className="modal-sub">This records the spend for your category breakdown — update the card&rsquo;s balance separately once your statement posts.</p>
      <div className="field">
        <label>Card</label>
        <select value={card} onChange={(e) => setCard(e.target.value)}>
          {cards.map((a) => <option key={a.id} value={a.id}>{a.owner} · {a.name}</option>)}
        </select>
      </div>
      <div className="field"><label>Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      <div className="field"><label>Merchant / description</label><input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="e.g. Whole Foods" /></div>
      <div className="field"><label>Amount ($)</label><input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></div>
      <div className="field">
        <label>Category</label>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {SPEND_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}>Log charge</button>
      </div>
    </>
  );
}

function EditTransactionModal({ state, txId, saveState, showToast, onClose }) {
  const tx = state.transactions.find((t) => t.id === txId);
  const cards = state.accounts.filter((a) => a.category === "Credit Card");
  const [card, setCard] = useState(tx.accountId);
  const [date, setDate] = useState(tx.date);
  const [merchant, setMerchant] = useState(tx.merchant || "");
  const [amount, setAmount] = useState(String(tx.amount));
  const [category, setCategory] = useState(tx.category);

  async function handleSave() {
    await saveState((next) => {
      const t = next.transactions.find((t) => t.id === txId);
      t.accountId = card; t.date = date; t.merchant = merchant.trim(); t.amount = parseFloat(amount || "0"); t.category = category;
    });
    onClose();
    showToast("Charge updated");
  }
  async function handleDelete() {
    await saveState((next) => { next.transactions = next.transactions.filter((t) => t.id !== txId); });
    onClose();
    showToast("Charge deleted");
  }

  return (
    <>
      <h2>Edit charge</h2>
      <div className="field">
        <label>Card</label>
        <select value={card} onChange={(e) => setCard(e.target.value)}>
          {cards.map((a) => <option key={a.id} value={a.id}>{a.owner} · {a.name}</option>)}
        </select>
      </div>
      <div className="field"><label>Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      <div className="field"><label>Merchant / description</label><input value={merchant} onChange={(e) => setMerchant(e.target.value)} /></div>
      <div className="field"><label>Amount ($)</label><input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
      <div className="field">
        <label>Category</label>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {SPEND_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="modal-actions">
        <ConfirmButton className="btn btn-secondary" style={{ color: "var(--negative)", borderColor: "var(--negative)" }} onConfirm={handleDelete}>Delete</ConfirmButton>
        <button className="btn btn-primary" onClick={handleSave}>Save changes</button>
      </div>
    </>
  );
}
