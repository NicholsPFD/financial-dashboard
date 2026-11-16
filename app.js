'use strict';

/* ======================================================================
    Household Ledger: a personal finance dashboard

    How this file is organized
        1. Helpers (formatting, dates)
        2. Your data: sample data, loading, and saving
        3. Calculations: totals, debt payoff, investments, retirement
        4. Monthly close: the code that rolls numbers forward each month
        5. Pages: one render function per page
        6. Charts
        7. Events: typing, clicking, routing between Pages
    Everything you type is saved in THIS browser with localStorage.
    Nothing is sent to GitHub or any server.
    ====================================================================== */

const STORAAGE_KEY = 'household-ledger-v1';
const UNDO_KEY = 'household-ledger-undo-v1';

/* -----------------------------------------------------------------------
    1. Helpers
    ---------------------------------------------------------------------- */
const uid = () => Math.random().toString(36).slice(2, 10);
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const sum = (arr, f = (x) => x) => arr.reduce((total, x) => total + num(f(x)), 0);
const round2 = (n) => Math.round(num(n) * 100) / 100;

/** Accounting style: negatives in parentheses */
function money(n, cents = false) {
    const v = num(n);
    const s = Math.abs(v).toLocaleString('en-US', {
        style: 'currency', currency: 'USD',
        minimumFrantionDigits: cents ? 2: 0, maximumFractionDigits: cents ? 2 : 0,
    });
    return v < -0.004 ? `(${s})` : s;
}
const moneyHTML = (n, cents = false) => `<span class="${num(n) < -0.004 ? 'neg' : ''}">${money(n, cents)}</span>`;
const signedHTML = (n) => (num(n) < -0.004
    ? `<span class="neg">${money(n)}</span>`
    : `<span class="pos">=${money(n)}</span>`);
const pct = (n, digits = 1) => `${num(n).toFixed(digits)}%`;
function compactMoney(v) {
  const a = Math.abs(v); const sign = v < 0 ? '-' : '';
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(a < 1e4 && a % 1000 ? 1 : 0)}k`;
  return `${sign}$${Math.round(a)}`;
}

/* Months are stored as "YYYY-MM" strings, e.g. "2026-11" */
function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + n, 1));
}
function monthLabel(key, short = false) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: short ? 'short' : 'long', year: 'numeric' });
}

/* ---------------------------------------------------------------------
   2. Your data
   --------------------------------------------------------------------- */
   function defaultCategories(withAmounts) {
  return [
    ['Paycheck', 'income', 5400], ['Side income', 'income', 300],
    ['Housing', 'expense', 1850], ['Groceries', 'expense', 600], ['Utilities', 'expense', 260],
    ['Transportation', 'expense', 350], ['Insurance', 'expense', 220], ['Debt payments', 'expense', 780],
    ['Dining out', 'expense', 200], ['Entertainment', 'expense', 120],
    ['Personal & household', 'expense', 180], ['Savings transfer', 'expense', 500],
  ].map(([name, type, planned]) => ({ id: uid(), name, type, planned: withAmounts ? planned : 0 }));
}

const defaultRetirement = () => ({
  currentAge: 38, retireAge: 65, endAge: 92,
  desiredIncome: 60000, socialSecurity: 24000, employerMatch: 225,
  preReturn: 7, postReturn: 4.5, inflation: 2.5, withdrawalRate: 4,
});

function emptyState() {
  return {
    version: 1,
    sample: false,
    month: monthKey(),           // the month you're currently tracking
    assets: [],                  // cash, property, vehicles (investments live on their own page)
    debts: [],
    debtStrategy: 'avalanche',
    extraPayment: 0,
    investments: [],
    budget: { categories: defaultCategories(false) },
    transactions: [],
    retirement: { ...defaultRetirement(), employerMatch: 0 },
    history: [],                 // one snapshot per closed month
  };
}

function sampleState() {
  const s = emptyState();
  s.sample = true;
  s.budget.categories = defaultCategories(true);
  s.retirement = defaultRetirement();
  s.extraPayment = 100;
  s.assets = [
    { id: uid(), name: 'Checking account', category: 'Cash', value: 4200 },
    { id: uid(), name: 'Emergency savings', category: 'Cash', value: 12000 },
    { id: uid(), name: 'Home (estimated value)', category: 'Property', value: 385000 },
    { id: uid(), name: 'Car', category: 'Vehicles', value: 14500 },
  ];
  s.debts = [
    { id: uid(), name: 'Mortgage', balance: 291000, apr: 6.25, minPayment: 1850 },
    { id: uid(), name: 'Car loan', balance: 11200, apr: 6.9, minPayment: 340 },
    { id: uid(), name: 'Credit card', balance: 3400, apr: 24.9, minPayment: 110 },
    { id: uid(), name: 'Student loan', balance: 18500, apr: 5.5, minPayment: 230 },
  ];
  s.investments = [
    { id: uid(), name: 'Workplace 401(k)', type: '401(k)', value: 68000, costBasis: 52000, monthly: 450, expectedReturn: 7, retirement: true },
    { id: uid(), name: 'Roth IRA', type: 'Roth IRA', value: 24000, costBasis: 18000, monthly: 250, expectedReturn: 7, retirement: true },
    { id: uid(), name: 'Index fund brokerage', type: 'Brokerage', value: 9500, costBasis: 8000, monthly: 100, expectedReturn: 6, retirement: false },
  ];
  const cat = (name) => s.budget.categories.find((c) => c.name === name).id;
  const day = (d) => `${s.month}-${String(d).padStart(2, '0')}`;
  s.transactions = [
    [1, 'Paycheck', 'Paycheck', 2700], [15, 'Paycheck', 'Paycheck', 2700],
    [1, 'Mortgage payment', 'Housing', 1850], [3, 'Grocery run', 'Groceries', 142.18],
    [10, 'Grocery run', 'Groceries', 118.4], [5, 'Electric and water', 'Utilities', 184.32],
    [6, 'Gas', 'Transportation', 48.6], [12, 'Car insurance', 'Insurance', 220],
    [2, 'Car loan', 'Debt payments', 340], [8, 'Credit card payment', 'Debt payments', 210],
    [9, 'Student loan', 'Debt payments', 230], [7, 'Dinner out', 'Dining out', 64.5],
    [11, 'Streaming services', 'Entertainment', 32.98], [13, 'Haircut', 'Personal & household', 35],
    [1, 'Transfer to savings', 'Savings transfer', 250],
  ].map(([d, desc, c, amount]) => ({ id: uid(), date: day(d), desc, categoryId: cat(c), amount }));

    // Six made-up past months so the net worth chart has something to show
  const a = sum(s.assets, (x) => x.value) + sum(s.investments, (x) => x.value);
  const l = sum(s.debts, (x) => x.balance);
  s.history = [6, 5, 4, 3, 2, 1].map((k) => {
    const assets = a - k * 1650; const liabilities = l + k * 1050;
    return { month: addMonths(s.month, -k), assets, liabilities, netWorth: assets - liabilities, income: 6000, spending: 5300 + (k % 3) * 140 };
  });
  return s;
}

/** Fill in anything missing (for example, from an older backup file). */
function normalize(s) {
  const base = emptyState();
  const out = { ...base, ...s };
  out.budget = { ...base.budget, ...(s.budget || {}) };
  if (!Array.isArray(out.budget.categories)) out.budget.categories = base.budget.categories;
  out.retirement = { ...base.retirement, ...(s.retirement || {}) };
  for (const k of ['assets', 'debts', 'investments', 'transactions', 'history']) {
    if (!Array.isArray(out[k])) out[k] = [];
  }
  if (!/^\d{4}-\d{2}$/.test(out.month)) out.month = base.month;
  return out;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (err) {
    console.warn('Could not read saved data', err);
  }
  return sampleState();
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    toast('This browser blocked saving. Download a backup so you don’t lose changes.');
  }
}

function hasUndo() {
  try { return Boolean(localStorage.getItem(UNDO_KEY)); } catch { return false; }
}

let state = load();
const ui = { budgetMonth: null, lastDate: null, lastCategory: null };
const charts = {};

/* Lists that rows can be added to, edited in, or removed from */
const COLS = {
  assets: () => state.assets,
  debts: () => state.debts,
  investments: () => state.investments,
  categories: () => state.budget.categories,
  transactions: () => state.transactions,
};

/* ---------------------------------------------------------------------
   3. Calculations
   --------------------------------------------------------------------- */
const investTotal = () => sum(state.investments, (i) => i.value);
const otherAssetsTotal = () => sum(state.assets, (a) => a.value);
const assetsTotal = () => otherAssetsTotal() + investTotal();
const debtTotal = () => sum(state.debts, (d) => d.balance);
const netWorth = () => assetsTotal() - debtTotal();
const sortedHistory = () => [...state.history].sort((a, b) => a.month.localeCompare(b.month));
const viewMonth = () => ui.budgetMonth || state.month;

const findCategory = (id) => state.budget.categories.find((c) => c.id === id);
const categoryType = (id) => findCategory(id)?.type || 'expense';
const categoryName = (id) => findCategory(id)?.name || 'Uncategorized';

function monthTotals(month) {
  const tx = state.transactions.filter((t) => String(t.date).startsWith(month));
  const income = sum(tx.filter((t) => categoryType(t.categoryId) === 'income'), (t) => t.amount);
  const spending = sum(tx.filter((t) => categoryType(t.categoryId) !== 'income'), (t) => t.amount);
  return { tx, income, spending, net: income - spending };
}

/* --- Debt payoff --- */
function orderDebts(debts, strategy) {
  const active = debts.filter((d) => d.balance > 0.01);
  return strategy === 'snowball'
    ? active.sort((a, b) => a.balance - b.balance || b.apr - a.apr)   // smallest balance first
    : active.sort((a, b) => b.apr - a.apr || a.balance - b.balance);  // highest rate first
}

/**
 * Runs ONE month of debt payments. Changes the balances of the debts you pass in.
 * 1) Each debt gets a month of interest (APR / 12).
 * 2) Each debt gets its minimum payment.
 * 3) Whatever is left of the monthly debt budget goes to the target debt
 *    (avalanche or snowball). When a debt is paid off, its minimum
 *    "rolls over" to the next one because the budget stays the same.
 */
function stepDebts(debts, monthlyBudget, strategy) {
  let interest = 0; let paid = 0; let remaining = monthlyBudget;
  for (const d of debts) {
    if (d.balance <= 0) continue;
    const i = d.balance * (num(d.apr) / 100) / 12;
    d.balance += i; interest += i;
  }
  for (const d of debts) {
    if (d.balance <= 0) continue;
    const p = Math.min(num(d.minPayment), d.balance, Math.max(remaining, 0));
    d.balance -= p; remaining -= p; paid += p;
  }
  for (const d of orderDebts(debts, strategy)) {
    if (remaining <= 0.005) break;
    const p = Math.min(remaining, d.balance);
    d.balance -= p; remaining -= p; paid += p;
  }
  for (const d of debts) if (d.balance < 0.01) d.balance = 0;
  return { interest, paid };
}

/** Projects every month until all debts are paid (or 50 years pass). */
function simulateDebts(strategy = state.debtStrategy, extra = state.extraPayment, minimumOnly = false) {
  const debts = state.debts.map((d) => ({ ...d, balance: num(d.balance), apr: num(d.apr), minPayment: num(d.minPayment) }));
  const budget = sum(debts, (d) => d.minPayment) + num(extra);
  const series = [sum(debts, (d) => d.balance)];
  const payoff = {};
  debts.forEach((d) => { if (d.balance <= 0.01) payoff[d.id] = 0; });
  let totalInterest = 0; let months = 0;
  while (sum(debts, (d) => d.balance) > 0.01 && months < 600) {
    months += 1;
    if (minimumOnly) {
      for (const d of debts) totalInterest += stepDebts([d], d.minPayment, strategy).interest;
    } else {
      totalInterest += stepDebts(debts, budget, strategy).interest;
    }
    for (const d of debts) if (d.balance <= 0 && !(d.id in payoff)) payoff[d.id] = months;
    series.push(sum(debts, (d) => d.balance));
  }
  return { months, totalInterest, series, payoff, stalled: sum(debts, (d) => d.balance) > 0.01, budget };
}
const debtBudget = () => sum(state.debts, (d) => d.minPayment) + num(state.extraPayment);

/* --- Investments --- */
function investmentProjection(years) {
  const holdings = state.investments.map((i) => ({ v: num(i.value), r: num(i.expectedReturn) / 1200, c: num(i.monthly) }));
  const monthlyAll = sum(state.investments, (i) => i.monthly);
  let paidIn = sum(state.investments, (i) => i.costBasis);
  const out = [{ year: 0, value: sum(holdings, (h) => h.v), paidIn }];
  for (let y = 1; y <= years; y += 1) {
    for (let m = 0; m < 12; m += 1) holdings.forEach((h) => { h.v = h.v * (1 + h.r) + h.c; });
    paidIn += monthlyAll * 12;
    out.push({ year: y, value: sum(holdings, (h) => h.v), paidIn });
  }
  return out;
}

/* --- Retirement --- */
function retirementPlan() {
  const r = state.retirement;
  const accounts = state.investments.filter((i) => i.retirement);
  const current = sum(accounts, (i) => i.value);
  const monthly = sum(accounts, (i) => i.monthly) + num(r.employerMatch);
  const startAge = num(r.currentAge);
  const retireAge = Math.max(startAge, num(r.retireAge));
  const endAge = Math.max(retireAge + 1, num(r.endAge));
  const n = Math.round((retireAge - startAge) * 12);
  const iPre = num(r.preReturn) / 1200;
  const iPost = num(r.postReturn) / 1200;
  const infl = num(r.inflation) / 100;
  const inflationFactor = (age) => Math.pow(1 + infl, age - startAge);

  // Saving years: grow monthly, add contributions
  let bal = current;
  const points = [{ age: startAge, bal }];
  for (let m = 1; m <= n; m += 1) {
    bal = bal * (1 + iPre) + monthly;
    if (m % 12 === 0) points.push({ age: startAge + m / 12, bal });
  }
  const atRetire = bal;

  // Target nest egg: the income you need beyond Social Security / withdrawal rate
  const needToday = Math.max(0, num(r.desiredIncome) - num(r.socialSecurity));
  const targetToday = num(r.withdrawalRate) > 0 ? needToday / (num(r.withdrawalRate) / 100) : 0;
  const target = targetToday * inflationFactor(retireAge);

  // Retirement years: withdraw inflation-adjusted income each month
  let runsOutAge = null;
  for (let age = retireAge; age < endAge; age += 1) {
    const monthlyNeed = (needToday * inflationFactor(age)) / 12;
    for (let m = 0; m < 12; m += 1) {
      bal = bal * (1 + iPost) - monthlyNeed;
      if (bal <= 0) { if (runsOutAge === null) runsOutAge = age + (m + 1) / 12; bal = 0; }
    }
    points.push({ age: age + 1, bal });
  }

  // Total monthly saving needed to hit the target by retirement
  const growth = Math.pow(1 + iPre, n);
  const shortfall = target - current * growth;
  let needed = 0;
  if (shortfall > 0 && n > 0) needed = iPre > 0 ? (shortfall * iPre) / (growth - 1) : shortfall / n;

  return {
    accounts, current, monthly, startAge, retireAge, endAge, atRetire,
    atRetireToday: atRetire / inflationFactor(retireAge), target, targetToday, needToday,
    runsOutAge, needed, points, inflationFactor,
  };
}

/* ---------------------------------------------------------------------
   4. Monthly close
   This is the code that adjusts your numbers once a month.
   --------------------------------------------------------------------- */
function openCloseDialog() {
  const m = state.month; const next = addMonths(m, 1);
  const preview = state.debts.map((d) => ({ ...d }));
  const debtStep = stepDebts(preview, debtBudget(), state.debtStrategy);
  const contrib = sum(state.investments, (i) => i.monthly);
  const growth = sum(state.investments, (i) => num(i.value) * (num(i.expectedReturn) / 1200));
  const { net } = monthTotals(m);
  const cashDefault = (state.assets.find((a) => /cash|check/i.test(`${a.category} ${a.name}`)) || state.assets[0])?.id;
  const assetOptions = state.assets.map((a) => `<option value="${a.id}" ${a.id === cashDefault ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
  const method = state.debtStrategy === 'snowball' ? 'snowball' : 'avalanche';

  const dialog = $('#close-dialog');
  dialog.innerHTML = `
    <form class="dialog-body" data-form="close-month">
      <h2 id="close-title">Close ${monthLabel(m)}</h2>
      <p>Closing saves this month’s totals to your history and moves the ledger to ${monthLabel(next)}. Pick the updates to apply first.</p>

      <label class="check">
        <input type="checkbox" name="debts" ${state.debts.length ? 'checked' : 'disabled'}>
        <span><strong>Apply debt payments</strong>
          <span class="detail">${state.debts.length
            ? `Pays ${money(debtStep.paid, true)} using your ${method} plan. About ${money(debtStep.interest, true)} of that is interest.`
            : 'No debts to update.'}</span></span>
      </label>

      <label class="check">
        <input type="checkbox" name="contrib" ${state.investments.length ? 'checked' : 'disabled'}>
        <span><strong>Add investment contributions</strong>
          <span class="detail">Adds ${money(contrib, true)} across your accounts, using each account’s monthly contribution.</span></span>
      </label>

      <label class="check">
        <input type="checkbox" name="growth" ${state.investments.length ? '' : 'disabled'}>
        <span><strong>Add estimated investment growth</strong>
          <span class="detail">Adds about ${money(growth, true)} based on each account’s expected return. Leave this off if you’ll type in real balances from your statements.</span></span>
      </label>

      <div class="check">
        <input type="checkbox" name="cash" id="cash-check" ${state.assets.length ? 'checked' : 'disabled'}>
        <span><label for="cash-check"><strong>Move net cash flow into an account</strong></label>
          <span class="detail">This month’s income minus spending is ${moneyHTML(net, true)}. It will be added to:</span>
          ${state.assets.length ? `<select class="field" name="cashAsset" aria-label="Account that receives net cash flow">${assetOptions}</select>` : ''}
        </span>
      </div>

      <div class="dialog-actions">
        <button type="button" class="btn" data-action="cancel-close">Cancel</button>
        <button type="submit" class="btn btn-primary">Close ${monthLabel(m)}</button>
      </div>
    </form>`;
  dialog.showModal();
}

function performClose(form) {
  const f = new FormData(form);
  const m = state.month;
  try { localStorage.setItem(UNDO_KEY, JSON.stringify(state)); } catch { /* undo just won't be available */ }

  // 1. Debt payments: interest, minimums, then extra to your target debt
  if (f.get('debts') && state.debts.length) {
    stepDebts(state.debts, debtBudget(), state.debtStrategy);
    state.debts.forEach((d) => { d.balance = round2(d.balance); });
  }
  // 2. Estimated growth (optional): value × (1 + yearly return ÷ 12)
  if (f.get('growth')) {
    state.investments.forEach((i) => { i.value = round2(num(i.value) * (1 + num(i.expectedReturn) / 1200)); });
  }
  // 3. Contributions: added to both value and the amount you've put in
  if (f.get('contrib')) {
    state.investments.forEach((i) => {
      i.value = round2(num(i.value) + num(i.monthly));
      i.costBasis = round2(num(i.costBasis) + num(i.monthly));
    });
  }
  // 4. Net cash flow (income − spending) lands in the account you chose
  const { income, spending, net } = monthTotals(m);
  if (f.get('cash')) {
    const account = state.assets.find((a) => a.id === f.get('cashAsset'));
    if (account) account.value = round2(num(account.value) + net);
  }
  // 5. Save a snapshot of the month, then move to the next month
  const snapshot = { month: m, assets: assetsTotal(), liabilities: debtTotal(), netWorth: netWorth(), income, spending };
  state.history = state.history.filter((h) => h.month !== m).concat(snapshot)
    .sort((a, b) => a.month.localeCompare(b.month));
  state.month = addMonths(m, 1);
  ui.budgetMonth = null;

  save();
  $('#close-dialog').close();
  render();
  toast(`${monthLabel(m)} is closed. Now tracking ${monthLabel(state.month)}.`);
}

function undoClose() {
  let raw = null;
  try { raw = localStorage.getItem(UNDO_KEY); } catch { /* ignore */ }
  if (!raw) { toast('There’s no month close to undo.'); return; }
  const previous = normalize(JSON.parse(raw));
  if (!confirm(`Reopen ${monthLabel(previous.month)}? Any changes made since you closed it will be lost.`)) return;
  state = previous;
  try { localStorage.removeItem(UNDO_KEY); } catch { /* ignore */ }
  ui.budgetMonth = null;
  save(); render();
  toast(`Reopened ${monthLabel(state.month)}.`);
}

/* --- Backups --- */
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `household-ledger-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Backup downloaded.');
}

function importData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || typeof data !== 'object' || !Array.isArray(data.assets)) throw new Error('Not a ledger backup');
      if (!confirm('Replace everything on this dashboard with the backup file?')) return;
      state = normalize(data);
      ui.budgetMonth = null;
      save(); render();
      toast('Backup restored.');
    } catch {
      toast('That file isn’t a Household Ledger backup. Choose a .json file made with “Download backup”.');
    }
  };
  reader.readAsText(file);
}

function clearSample() {
  if (!confirm('Clear every number and start with a blank ledger? Download a backup first if you want to keep anything.')) return;
  state = emptyState();
  ui.budgetMonth = null;
  save(); render();
  toast('Blank ledger ready. Start with your assets on the Balance sheet.');
}

/* ---------------------------------------------------------------------
   5. Pages
   --------------------------------------------------------------------- */
/* Small building blocks used by every page */
function inp(col, item, field, { type = 'text', step, label, cls = '', list } = {}) {
  const value = type === 'number' ? round2(item[field]) : esc(item[field]);
  return `<input class="cell ${cls}" type="${type}"${step ? ` step="${step}"` : ''}${list ? ` list="${list}"` : ''}${type === 'number' ? ' inputmode="decimal"' : ''}
    value="${value}" data-col="${col}" data-id="${item.id}" data-field="${field}" data-fk="${col}:${item.id}:${field}" aria-label="${esc(label || field)}">`;
}
function objInp(obj, field, { step = '1', label } = {}) {
  const target = obj === 'root' ? state : state[obj];
  return `<input class="field" type="number" step="${step}" inputmode="decimal" value="${round2(target[field])}"
    data-obj="${obj}" data-field="${field}" data-fk="${obj}:${field}"${label ? ` aria-label="${esc(label)}"` : ''}>`;
}
function delBtn(col, item) {
  const name = esc(item.name || item.desc || 'this row');
  return `<button class="icon-btn" type="button" data-action="delete" data-col="${col}" data-id="${item.id}" aria-label="Remove ${name}" title="Remove">&times;</button>`;
}
function pageHead(title, lede, label, value) {
  return `<header class="page-head">
      <div><h1>${title}</h1><p class="lede">${lede}</p></div>
      <div class="figure"><span class="figure-label">${label}</span>
        <span class="figure-value ${typeof value === 'number' && value < -0.004 ? 'neg' : ''}">${typeof value === 'number' ? money(value) : value}</span></div>
    </header>`;
}
const subfig = (label, html) => `<div><dt>${label}</dt><dd>${html}</dd></div>`;
const chartBox = (id, label, extraClass = '', style = '') => `<div class="panel"><div class="chart-box ${extraClass}" style="${style}"><canvas id="${id}" role="img" aria-label="${esc(label)}"></canvas></div></div>`;

function sampleNotice() {
  if (!state.sample) return '';
  return `<div class="notice"><p>You’re looking at sample numbers. Type over them with your own, or clear them and start from zero.</p>
    <button class="btn" type="button" data-action="keep-sample">Keep and edit</button>
    <button class="btn btn-primary" type="button" data-action="clear-sample">Start with a blank ledger</button></div>`;
}

function datalists() {
  return `<datalist id="asset-categories"><option value="Cash"><option value="Property"><option value="Vehicles"><option value="Personal property"><option value="Other"></datalist>
    <datalist id="investment-types"><option value="401(k)"><option value="403(b)"><option value="Roth IRA"><option value="Traditional IRA"><option value="Brokerage"><option value="HSA"><option value="529"><option value="Other"></datalist>`;
}

/* ===== Balance sheet ===== */
function renderBalance() {
  const inv = investTotal(); const assets = assetsTotal(); const liab = debtTotal(); const nw = assets - liab;
  const hist = sortedHistory();
  const last = hist.filter((h) => h.month < state.month).slice(-1)[0];

  const assetRows = state.assets.map((a) => `
    <tr>
      <td>${inp('assets', a, 'name', { label: 'Asset name', cls: 'w-name' })}</td>
      <td>${inp('assets', a, 'category', { label: `Category for ${a.name}`, list: 'asset-categories', cls: 'w-cat' })}</td>
      <td class="num">${inp('assets', a, 'value', { type: 'number', step: '0.01', label: `Value of ${a.name}`, cls: 'w-num' })}</td>
      <td class="act">${delBtn('assets', a)}</td>
    </tr>`).join('');

  const debtRows = state.debts.length
    ? state.debts.map((d) => `<tr class="linked"><td>${esc(d.name)}</td><td class="num">${pct(d.apr, 2)}</td><td class="num">${money(d.balance, true)}</td></tr>`).join('')
    : '<tr><td colspan="3" class="empty">No debts yet. Add them in the <a href="#debt">Debt manager</a>.</td></tr>';

  const histDesc = [...hist].reverse();
  const histRows = histDesc.map((h, i) => {
    const prev = histDesc[i + 1];
    const change = prev ? h.netWorth - prev.netWorth : null;
    return `<tr><td>${monthLabel(h.month)}</td><td class="num">${money(h.assets)}</td><td class="num">${money(h.liabilities)}</td>
      <td class="num">${moneyHTML(h.netWorth)}</td><td class="num">${change === null ? '<span class="muted">First month</span>' : signedHTML(change)}</td></tr>`;
  }).join('');

  return `
    ${pageHead('Balance sheet', `What you own and what you owe in ${monthLabel(state.month)}. Edit any value and it saves as you go.`, 'Net worth', nw)}
    <dl class="subfigs">
      ${subfig('Total assets', money(assets))}
      ${subfig('Total liabilities', money(liab))}
      ${subfig(last ? `Change since ${monthLabel(last.month, true)}` : 'Change since last close', last ? signedHTML(nw - last.netWorth) : '<span class="muted">Close a month to start</span>')}
    </dl>

    <div class="grid">
      <section class="section">
        <div class="section-head"><h2>Assets</h2><button class="btn btn-quiet" type="button" data-action="add-asset">Add asset</button></div>
        <div class="table-wrap"><table class="ledger">
          <thead><tr><th>Item</th><th>Category</th><th class="num">Value</th><th class="act"><span class="sr-only">Remove</span></th></tr></thead>
          <tbody>
            ${assetRows || '<tr><td colspan="4" class="empty">Add your bank accounts, home, car, and anything else of value.</td></tr>'}
            <tr class="linked"><td><a href="#investments">Investment accounts</a></td><td>From Investments</td><td class="num">${money(inv, true)}</td><td></td></tr>
            <tr class="total"><td colspan="2">Total assets</td><td class="num">${money(assets, true)}</td><td></td></tr>
          </tbody>
        </table></div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Liabilities</h2><a class="btn btn-quiet" href="#debt">Edit in Debt manager</a></div>
        <div class="table-wrap"><table class="ledger">
          <thead><tr><th>Debt</th><th class="num">Rate</th><th class="num">Balance</th></tr></thead>
          <tbody>
            ${debtRows}
            <tr class="total"><td colspan="2">Total liabilities</td><td class="num">${money(liab, true)}</td></tr>
            <tr class="grand"><td colspan="2">Net worth (assets minus liabilities)</td><td class="num">${moneyHTML(nw, true)}</td></tr>
          </tbody>
        </table></div>
      </section>
    </div>

    <section class="section">
      <h2>Net worth over time</h2>
      <p class="section-note">Each point is a month you closed. The last point is today’s numbers.</p>
      ${chartBox('nw-chart', 'Line chart of net worth by month')}
    </section>

    <section class="section">
      <h2>Monthly snapshots</h2>
      <p class="section-note">Saved automatically each time you close a month.</p>
      ${hist.length
        ? `<div class="table-wrap"><table class="ledger"><thead><tr><th>Month</th><th class="num">Assets</th><th class="num">Liabilities</th><th class="num">Net worth</th><th class="num">Change</th></tr></thead><tbody>${histRows}</tbody></table></div>`
        : `<p class="empty-block">No closed months yet. At the end of the month, use “Close ${monthLabel(state.month)}” to save a snapshot here.</p>`}
    </section>`;
}

/* ===== Budget & spending ===== */
function renderBudget() {
  const month = viewMonth();
  const { tx, income, spending, net } = monthTotals(month);
  const cats = state.budget.categories;
  const actualFor = (id) => sum(tx.filter((t) => t.categoryId === id), (t) => t.amount);
  const inc = cats.filter((c) => c.type === 'income');
  const exp = cats.filter((c) => c.type !== 'income');
  const plannedInc = sum(inc, (c) => c.planned);
  const plannedExp = sum(exp, (c) => c.planned);
  const uncategorized = sum(tx.filter((t) => !findCategory(t.categoryId)), (t) => t.amount);

  const months = [...new Set([state.month, ...state.transactions.map((t) => String(t.date).slice(0, 7)), ...state.history.map((h) => h.month)])]
    .filter((m) => /^\d{4}-\d{2}$/.test(m)).sort().reverse();
  const monthOptions = months.map((m) => `<option value="${m}" ${m === month ? 'selected' : ''}>${monthLabel(m)}${m === state.month ? ' (current)' : ''}</option>`).join('');

  const catRow = (c) => {
    const actual = actualFor(c.id);
    const diff = c.type === 'income' ? actual - num(c.planned) : num(c.planned) - actual;
    const ratio = num(c.planned) > 0 ? actual / num(c.planned) : (actual > 0 ? 1 : 0);
    const over = c.type !== 'income' && actual > num(c.planned) + 0.004;
    return `<tr>
      <td>${inp('categories', c, 'name', { label: 'Category name', cls: 'w-name' })}</td>
      <td class="num">${inp('categories', c, 'planned', { type: 'number', step: '0.01', label: `Planned for ${c.name}`, cls: 'w-num' })}</td>
      <td class="num">${money(actual, true)}</td>
      <td class="num">${moneyHTML(diff, true)}</td>
      <td><div class="bar ${over ? 'over' : ''}" role="img" aria-label="${Math.round(ratio * 100)}% of plan"><span style="width:${Math.min(ratio, 1) * 100}%"></span></div></td>
      <td class="act">${delBtn('categories', c)}</td>
    </tr>`;
  };

  const txSorted = [...tx].sort((a, b) => b.date.localeCompare(a.date));
  const catOptions = (selected) => cats.map((c) => `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  const txRows = txSorted.map((t) => `
    <tr>
      <td>${inp('transactions', t, 'date', { type: 'date', label: 'Date', cls: 'w-date' })}</td>
      <td>${inp('transactions', t, 'desc', { label: 'Description', cls: 'w-name' })}</td>
      <td><select class="cell w-cat" data-col="transactions" data-id="${t.id}" data-field="categoryId" data-fk="transactions:${t.id}:categoryId" aria-label="Category for ${esc(t.desc)}">
        ${findCategory(t.categoryId) ? '' : '<option value="" selected>Uncategorized</option>'}${catOptions(t.categoryId)}</select></td>
      <td class="num">${inp('transactions', t, 'amount', { type: 'number', step: '0.01', label: `Amount for ${t.desc}`, cls: 'w-num' })}</td>
      <td class="act">${delBtn('transactions', t)}</td>
    </tr>`).join('');

  const today = new Date();
  const defaultDate = ui.lastDate && ui.lastDate.startsWith(month) ? ui.lastDate
    : (monthKey(today) === month ? `${month}-${String(today.getDate()).padStart(2, '0')}` : `${month}-01`);
  const defaultCat = findCategory(ui.lastCategory) ? ui.lastCategory : exp[0]?.id;

  const timeNote = month < state.month
    ? `<div class="notice warn"><p>${monthLabel(month)} is closed. Edits here change its transactions, but not the snapshot already saved on the Balance sheet.</p></div>`
    : '';

  return `
    ${pageHead('Budget & spending', 'Plan each category once, then log what you actually spend. The same plan carries into every month.', `Net cash flow, ${monthLabel(month, true)}`, net)}
    <div class="toolbar">
      <label class="stack">Month shown<select class="field" data-ui="budgetMonth">${monthOptions}</select></label>
    </div>
    ${timeNote}
    <dl class="subfigs">
      ${subfig('Income received', money(income))}
      ${subfig('Spent', money(spending))}
      ${subfig('Left in spending plan', moneyHTML(plannedExp - spending))}
    </dl>

    <section class="section">
      <div class="section-head"><h2>Plan vs. actual</h2></div>
      <p class="section-note">Difference is positive when you’re ahead of plan: income above plan, or spending below it.</p>
      <div class="table-wrap"><table class="ledger">
        <thead><tr><th>Category</th><th class="num">Planned</th><th class="num">Actual</th><th class="num">Difference</th><th>Progress</th><th class="act"><span class="sr-only">Remove</span></th></tr></thead>
        <tbody>
          <tr class="subhead"><td colspan="6">Income <button class="btn btn-quiet" type="button" data-action="add-category" data-type="income">Add income category</button></td></tr>
          ${inc.map(catRow).join('')}
          <tr class="total"><td>Total income</td><td class="num">${money(plannedInc, true)}</td><td class="num">${money(income, true)}</td><td class="num">${moneyHTML(income - plannedInc, true)}</td><td colspan="2"></td></tr>
          <tr class="subhead"><td colspan="6">Spending <button class="btn btn-quiet" type="button" data-action="add-category" data-type="expense">Add spending category</button></td></tr>
          ${exp.map(catRow).join('')}
          ${uncategorized > 0 ? `<tr class="linked"><td>Uncategorized</td><td class="num">${money(0, true)}</td><td class="num">${money(uncategorized, true)}</td><td class="num">${moneyHTML(-uncategorized, true)}</td><td colspan="2"></td></tr>` : ''}
          <tr class="total"><td>Total spending</td><td class="num">${money(plannedExp, true)}</td><td class="num">${money(spending, true)}</td><td class="num">${moneyHTML(plannedExp - spending, true)}</td><td colspan="2"></td></tr>
          <tr class="grand"><td>Net cash flow</td><td class="num">${moneyHTML(plannedInc - plannedExp, true)}</td><td class="num">${moneyHTML(net, true)}</td><td class="num">${moneyHTML(net - (plannedInc - plannedExp), true)}</td><td colspan="2"></td></tr>
        </tbody>
      </table></div>
    </section>

    <section class="section">
      <h2>Spending by category</h2>
      <p class="section-note">Red bars are categories over plan.</p>
      ${chartBox('budget-chart', 'Bar chart comparing planned and actual spending by category', '', `height:${Math.max(16, exp.length * 2.4)}rem`)}
    </section>

    <section class="section">
      <div class="section-head"><h2>Transactions in ${monthLabel(month)}</h2></div>
      <form class="tx-form" data-form="add-tx">
        <label class="stack">Date<input class="field" type="date" name="date" value="${defaultDate}" required></label>
        <label class="stack grow">Description<input class="field" id="tx-desc" name="desc" placeholder="What was it for?" autocomplete="off"></label>
        <label class="stack">Category<select class="field" name="categoryId">${catOptions(defaultCat)}</select></label>
        <label class="stack">Amount<input class="field" type="number" name="amount" step="0.01" min="0" inputmode="decimal" placeholder="0.00" required></label>
        <button class="btn btn-primary" type="submit">Add transaction</button>
      </form>
      ${tx.length
        ? `<div class="table-wrap"><table class="ledger"><thead><tr><th>Date</th><th>Description</th><th>Category</th><th class="num">Amount</th><th class="act"><span class="sr-only">Remove</span></th></tr></thead><tbody>${txRows}</tbody></table></div>`
        : '<p class="empty-block">No transactions this month yet. Add your first one above, starting with your paycheck.</p>'}
    </section>`;
}

/* ===== Debt manager ===== */
function renderDebt() {
  const total = debtTotal();
  if (!state.debts.length) {
    return `${pageHead('Debt manager', 'List each debt to see when you’ll be debt free and how much interest you’ll pay.', 'Total debt', 0)}
      <section class="section"><div class="section-head"><h2>Your debts</h2><button class="btn btn-primary" type="button" data-action="add-debt">Add debt</button></div>
      <p class="empty-block">No debts listed. Add a credit card, loan, or mortgage to build a payoff plan.</p></section>`;
  }
  const plan = simulateDebts();
  const avalanche = simulateDebts('avalanche');
  const snowball = simulateDebts('snowball');
  const minOnly = simulateDebts(state.debtStrategy, 0, true);
  const freeLabel = (sim) => (sim.stalled ? 'Not within 50 years' : sim.months === 0 ? 'Now' : monthLabel(addMonths(state.month, sim.months - 1)));
  const underwater = state.debts.filter((d) => d.balance > 0 && num(d.minPayment) <= (num(d.balance) * num(d.apr)) / 1200);

  const rows = state.debts.map((d) => {
    const p = plan.payoff[d.id];
    const paidOff = num(d.balance) <= 0 ? 'Paid off' : p === undefined ? '<span class="neg">Not within 50 years</span>' : monthLabel(addMonths(state.month, p - 1), true);
    return `<tr>
      <td>${inp('debts', d, 'name', { label: 'Debt name', cls: 'w-name' })}</td>
      <td class="num">${inp('debts', d, 'balance', { type: 'number', step: '0.01', label: `Balance of ${d.name}`, cls: 'w-num' })}</td>
      <td class="num">${inp('debts', d, 'apr', { type: 'number', step: '0.01', label: `Interest rate of ${d.name}`, cls: 'w-rate' })}</td>
      <td class="num">${inp('debts', d, 'minPayment', { type: 'number', step: '0.01', label: `Minimum payment for ${d.name}`, cls: 'w-num' })}</td>
      <td class="num">${money((num(d.balance) * num(d.apr)) / 1200, true)}</td>
      <td class="num">${paidOff}</td>
      <td class="act">${delBtn('debts', d)}</td>
    </tr>`;
  }).join('');

  const compareRow = (name, sim, current) => `<tr class="${current ? 'is-current' : ''}"><td>${name}${current ? ' <span class="muted">(your plan)</span>' : ''}</td>
    <td class="num">${freeLabel(sim)}</td><td class="num">${sim.stalled ? '<span class="neg">Never paid off</span>' : money(sim.totalInterest)}</td></tr>`;

  return `
    ${pageHead('Debt manager', 'Your payoff plan updates as you change balances, rates, or your extra payment.', 'Total debt', total)}
    <dl class="subfigs">
      ${subfig('Debt free by', freeLabel(plan))}
      ${subfig('Interest left to pay', plan.stalled ? '<span class="neg">Payments too low</span>' : money(plan.totalInterest))}
      ${subfig('Interest saved vs. minimums', minOnly.stalled || plan.stalled ? '<span class="muted">n/a</span>' : `<span class="pos">${money(minOnly.totalInterest - plan.totalInterest)}</span>`)}
    </dl>
    ${underwater.length ? `<div class="notice warn"><p>${underwater.map((d) => esc(d.name)).join(', ')}: the minimum payment doesn’t cover the monthly interest, so the balance will grow. Raise the payment to see a payoff date.</p></div>` : ''}

    <section class="section">
      <div class="section-head"><h2>Your debts</h2><button class="btn btn-quiet" type="button" data-action="add-debt">Add debt</button></div>
      <div class="table-wrap"><table class="ledger">
        <thead><tr><th>Debt</th><th class="num">Balance</th><th class="num">Rate (APR %)</th><th class="num">Minimum payment</th><th class="num">Interest this month</th><th class="num">Paid off</th><th class="act"><span class="sr-only">Remove</span></th></tr></thead>
        <tbody>${rows}
          <tr class="grand"><td>Total</td><td class="num">${money(total, true)}</td><td></td><td class="num">${money(sum(state.debts, (d) => d.minPayment), true)}</td><td class="num">${money(sum(state.debts, (d) => (num(d.balance) * num(d.apr)) / 1200), true)}</td><td colspan="2"></td></tr>
        </tbody>
      </table></div>
    </section>

    <div class="grid">
      <section class="section">
        <fieldset class="strategy">
          <legend>Payoff method</legend>
          <label class="choice"><input type="radio" name="strategy" value="avalanche" data-obj="root" data-field="debtStrategy" ${state.debtStrategy !== 'snowball' ? 'checked' : ''}>
            <span><strong>Avalanche</strong>Pay the highest interest rate first. Costs the least overall.</span></label>
          <label class="choice"><input type="radio" name="strategy" value="snowball" data-obj="root" data-field="debtStrategy" ${state.debtStrategy === 'snowball' ? 'checked' : ''}>
            <span><strong>Snowball</strong>Pay the smallest balance first. Quick wins keep you going.</span></label>
        </fieldset>
        <label class="stack" style="max-width:16rem">Extra payment each month${objInp('root', 'extraPayment', { step: '0.01' })}</label>
        <p class="section-note">Monthly debt budget: ${money(sum(state.debts, (d) => d.minPayment), true)} in minimums plus ${money(state.extraPayment, true)} extra is ${money(debtBudget(), true)}. When a debt is paid off, its payment rolls to the next one.</p>
      </section>
      <section class="section">
        <h2>Compare methods</h2>
        <p class="section-note">Same monthly budget, different order.</p>
        <div class="table-wrap"><table class="ledger">
          <thead><tr><th>Method</th><th class="num">Debt free</th><th class="num">Total interest</th></tr></thead>
          <tbody>
            ${compareRow('Avalanche', avalanche, state.debtStrategy !== 'snowball')}
            ${compareRow('Snowball', snowball, state.debtStrategy === 'snowball')}
            ${compareRow('Minimum payments only', minOnly, false)}
          </tbody>
        </table></div>
      </section>
    </div>

    <section class="section">
      <h2>Balance over time</h2>
      ${chartBox('debt-chart', 'Line chart of total debt over time for your plan and for minimum payments only')}
    </section>`;
}

/* ===== Investment tracker ===== */
function renderInvestments() {
  const total = investTotal();
  const basis = sum(state.investments, (i) => i.costBasis);
  const gain = total - basis;
  const monthly = sum(state.investments, (i) => i.monthly);
  const proj = investmentProjection(20);

  const rows = state.investments.map((i) => {
    const g = num(i.value) - num(i.costBasis);
    const gp = num(i.costBasis) > 0 ? (g / num(i.costBasis)) * 100 : 0;
    return `<tr>
      <td>${inp('investments', i, 'name', { label: 'Account name', cls: 'w-name' })}</td>
      <td>${inp('investments', i, 'type', { label: `Type of ${i.name}`, list: 'investment-types', cls: 'w-cat' })}</td>
      <td class="num">${inp('investments', i, 'value', { type: 'number', step: '0.01', label: `Value of ${i.name}`, cls: 'w-num' })}</td>
      <td class="num">${inp('investments', i, 'costBasis', { type: 'number', step: '0.01', label: `Amount put into ${i.name}`, cls: 'w-num' })}</td>
      <td class="num">${moneyHTML(g)}</td>
      <td class="num"><span class="${g < 0 ? 'neg' : ''}">${pct(gp)}</span></td>
      <td class="num">${inp('investments', i, 'monthly', { type: 'number', step: '0.01', label: `Monthly contribution to ${i.name}`, cls: 'w-num' })}</td>
      <td class="num">${inp('investments', i, 'expectedReturn', { type: 'number', step: '0.1', label: `Expected yearly return for ${i.name}`, cls: 'w-rate' })}</td>
      <td style="text-align:center"><input type="checkbox" data-col="investments" data-id="${i.id}" data-field="retirement" data-fk="investments:${i.id}:retirement" ${i.retirement ? 'checked' : ''} aria-label="Count ${esc(i.name)} toward retirement"></td>
      <td class="act">${delBtn('investments', i)}</td>
    </tr>`;
  }).join('');

  return `
    ${pageHead('Investments', 'Update values from your statements each month. Check “Retirement” for accounts the Retirement planner should count.', 'Total invested', total)}
    <dl class="subfigs">
      ${subfig('Total gain', `${moneyHTML(gain)} <span class="muted">(${pct(basis > 0 ? (gain / basis) * 100 : 0)})</span>`)}
      ${subfig('Added each month', money(monthly))}
      ${subfig('Projected in 10 years', money(proj[10].value))}
      ${subfig('Projected in 20 years', money(proj[20].value))}
    </dl>

    <section class="section">
      <div class="section-head"><h2>Accounts</h2><button class="btn btn-quiet" type="button" data-action="add-investment">Add account</button></div>
      <div class="table-wrap"><table class="ledger">
        <thead><tr><th>Account</th><th>Type</th><th class="num">Value</th><th class="num">Amount put in</th><th class="num">Gain</th><th class="num">Gain %</th><th class="num">Monthly contribution</th><th class="num">Expected return %</th><th>Retirement</th><th class="act"><span class="sr-only">Remove</span></th></tr></thead>
        <tbody>
          ${rows || '<tr><td colspan="10" class="empty">Add a 401(k), IRA, brokerage, or other account.</td></tr>'}
          <tr class="grand"><td colspan="2">Total</td><td class="num">${money(total, true)}</td><td class="num">${money(basis, true)}</td><td class="num">${moneyHTML(gain, true)}</td><td></td><td class="num">${money(monthly, true)}</td><td colspan="3"></td></tr>
        </tbody>
      </table></div>
    </section>

    <div class="grid">
      <section class="section">
        <h2>Where your money is</h2>
        <p class="section-note">Grouped by account type.</p>
        ${chartBox('alloc-chart', 'Doughnut chart of investments by account type')}
      </section>
      <section class="section">
        <h2>20-year projection</h2>
        <p class="section-note">Uses each account’s expected return and monthly contribution. Real returns go up and down.</p>
        ${chartBox('proj-chart', 'Line chart of projected investment value over 20 years')}
      </section>
    </div>`;
}

/* ===== Retirement planner ===== */
function renderRetirement() {
  const plan = retirementPlan();
  const r = state.retirement;
  const onTrack = plan.atRetire >= plan.target && plan.runsOutAge === null;
  const lastsTo = plan.runsOutAge === null ? `Age ${plan.endAge}+` : `Age ${Math.floor(plan.runsOutAge)}`;

  let status;
  if (!plan.accounts.length) {
    status = `<div class="status behind"><p>No accounts are marked for retirement yet. On the <a href="#investments">Investments</a> page, check “Retirement” next to your 401(k), IRA, or similar accounts.</p></div>`;
  } else if (onTrack) {
    status = `<div class="status"><p><strong>You’re on track.</strong> At this pace your savings reach about ${money(plan.atRetireToday)} in today’s dollars by age ${plan.retireAge} and last through age ${plan.endAge}.</p></div>`;
  } else if (plan.needed > plan.monthly + 0.5) {
    status = `<div class="status behind"><p><strong>You’re behind your target.</strong> To build a nest egg of ${money(plan.targetToday)} (today’s dollars) by age ${plan.retireAge}, save about ${money(plan.needed)} a month in total. That’s ${money(plan.needed - plan.monthly)} more than you save now.</p>
      ${plan.runsOutAge !== null ? `<p>At your current pace, savings would run out around age ${Math.floor(plan.runsOutAge)}.</p>` : ''}</div>`;
  } else {
    status = `<div class="status behind"><p><strong>You’ll reach your target, but it may not last.</strong> With a ${pct(r.postReturn)} return during retirement, savings run out around age ${Math.floor(plan.runsOutAge)}. Try a lower withdrawal rate, a later retirement age, or a smaller income goal.</p></div>`;
  }

  const fields = [
    ['currentAge', 'Your age now', '1'],
    ['retireAge', 'Age you plan to retire', '1'],
    ['endAge', 'Make the money last until age', '1'],
    ['desiredIncome', 'Yearly income you want in retirement (today’s dollars)', '100'],
    ['socialSecurity', 'Expected Social Security or pension per year (today’s dollars)', '100'],
    ['employerMatch', 'Employer match per month', '1'],
    ['preReturn', 'Yearly return before retirement (%)', '0.1'],
    ['postReturn', 'Yearly return during retirement (%)', '0.1'],
    ['inflation', 'Inflation per year (%)', '0.1'],
    ['withdrawalRate', 'Withdrawal rate used for your target (%)', '0.1'],
  ];

  return `
    ${pageHead('Retirement planner', 'A projection built from your retirement accounts and the assumptions below. Change any number to see the effect.', `Projected at ${plan.retireAge}, today’s dollars`, plan.atRetireToday)}
    <dl class="subfigs">
      ${subfig('Target nest egg', money(plan.targetToday))}
      ${subfig('Saved for retirement now', money(plan.current))}
      ${subfig('Saving each month', `${money(plan.monthly)} <span class="muted">incl. match</span>`)}
      ${subfig('Savings last until', lastsTo)}
    </dl>
    ${status}

    <section class="section">
      <h2>Savings by age</h2>
      <p class="section-note">Shown in today’s dollars so the numbers feel familiar. The line drops after ${plan.retireAge} as you withdraw income.</p>
      ${chartBox('ret-chart', 'Line chart of projected retirement savings by age')}
    </section>

    <section class="section">
      <h2>Your assumptions</h2>
      <p class="section-note">Counting ${plan.accounts.length ? plan.accounts.map((a) => esc(a.name)).join(', ') : 'no accounts yet'}. Contributions come from the Investments page.</p>
      <div class="settings-grid">
        ${fields.map(([field, label, step]) => `<label class="stack">${label}${objInp('retirement', field, { step })}</label>`).join('')}
      </div>
    </section>
    <p class="fine-print">This is an estimate for planning, not financial advice. It assumes steady returns and inflation, which real markets don’t deliver. The target uses the withdrawal-rate rule of thumb (yearly income needed ÷ withdrawal rate).</p>`;
}

const PAGES = {
  'balance-sheet': { title: 'Balance sheet', render: renderBalance, after: chartsBalance },
  budget: { title: 'Budget & spending', render: renderBudget, after: chartsBudget },
  debt: { title: 'Debt manager', render: renderDebt, after: chartsDebt },
  investments: { title: 'Investments', render: renderInvestments, after: chartsInvestments },
  retirement: { title: 'Retirement planner', render: renderRetirement, after: chartsRetirement },
};

/* ---------------------------------------------------------------------
   6. Charts (Chart.js)
   --------------------------------------------------------------------- */
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function makeChart(id, config) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  if (!window.Chart) {
    canvas.parentElement.innerHTML = '<p class="muted">Charts couldn’t load. Check your internet connection; your numbers are still saved.</p>';
    return;
  }
  charts[id] = new window.Chart(canvas, config);
}

function baseOptions(moneyAxis = 'y') {
  const rule = cssVar('--rule');
  window.Chart.defaults.font.family = "'Public Sans', system-ui, sans-serif";
  window.Chart.defaults.color = cssVar('--pencil');
  const moneyScale = { grid: { color: rule }, border: { display: false }, ticks: { callback: (v) => compactMoney(v) } };
  const otherScale = { grid: { display: false }, border: { color: rule }, ticks: { maxRotation: 0, autoSkip: true, autoSkipPadding: 12 } };
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { boxWidth: 12, boxHeight: 12 } },
      tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label ? `${ctx.dataset.label}: ` : ''}${money(ctx.parsed[moneyAxis])}` } },
    },
    scales: moneyAxis === 'y' ? { x: otherScale, y: moneyScale } : { x: moneyScale, y: otherScale },
  };
}

function chartsBalance() {
  if (!window.Chart) return makeChart('nw-chart');
  const hist = sortedHistory().filter((h) => h.month < state.month);
  const options = baseOptions();
  options.plugins.legend.display = false;
  makeChart('nw-chart', {
    type: 'line',
    data: {
      labels: hist.map((h) => monthLabel(h.month, true)).concat('Now'),
      datasets: [{
        label: 'Net worth', data: hist.map((h) => h.netWorth).concat(netWorth()),
        borderColor: cssVar('--ink'), backgroundColor: cssVar('--fill'), pointBackgroundColor: cssVar('--ink'),
        fill: true, tension: 0.25, pointRadius: 3, borderWidth: 2,
      }],
    },
    options,
  });
}

function chartsBudget() {
  if (!window.Chart) return makeChart('budget-chart');
  const { tx } = monthTotals(viewMonth());
  const exp = state.budget.categories.filter((c) => c.type !== 'income');
  const actual = exp.map((c) => sum(tx.filter((t) => t.categoryId === c.id), (t) => t.amount));
  const options = baseOptions('x');
  options.indexAxis = 'y';
  makeChart('budget-chart', {
    type: 'bar',
    data: {
      labels: exp.map((c) => c.name),
      datasets: [
        { label: 'Planned', data: exp.map((c) => num(c.planned)), backgroundColor: cssVar('--rule-strong'), borderRadius: 3 },
        { label: 'Actual', data: actual, backgroundColor: actual.map((a, i) => (a > num(exp[i].planned) ? cssVar('--red') : cssVar('--ink'))), borderRadius: 3 },
      ],
    },
    options,
  });
}

function chartsDebt() {
  if (!state.debts.length) return;
  if (!window.Chart) return makeChart('debt-chart');
  const plan = simulateDebts();
  const minOnly = simulateDebts(state.debtStrategy, 0, true);
  const length = Math.max(plan.series.length, minOnly.series.length);
  const labels = Array.from({ length }, (_, i) => (i === 0 ? 'Now' : monthLabel(addMonths(state.month, i - 1), true)));
  const pad = (s) => s.concat(Array(length - s.length).fill(null));
  makeChart('debt-chart', {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: `Your plan (${state.debtStrategy})`, data: pad(plan.series), borderColor: cssVar('--green'), backgroundColor: cssVar('--green'), pointRadius: 0, borderWidth: 2.5, tension: 0.1 },
        { label: 'Minimum payments only', data: pad(minOnly.series), borderColor: cssVar('--red'), backgroundColor: cssVar('--red'), borderDash: [6, 4], pointRadius: 0, borderWidth: 2, tension: 0.1 },
      ],
    },
    options: baseOptions(),
  });
}

function chartsInvestments() {
  if (!window.Chart) { makeChart('alloc-chart'); makeChart('proj-chart'); return; }
  const groups = {};
  state.investments.forEach((i) => { const k = i.type || 'Other'; groups[k] = (groups[k] || 0) + num(i.value); });
  const total = Object.values(groups).reduce((a, b) => a + b, 0);
  const palette = ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6'].map(cssVar);
  baseOptions(); // sets shared font and colors
  makeChart('alloc-chart', {
    type: 'doughnut',
    data: {
      labels: Object.keys(groups),
      datasets: [{ data: Object.values(groups), backgroundColor: Object.keys(groups).map((_, i) => palette[i % palette.length]), borderColor: cssVar('--sheet'), borderWidth: 2 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '62%',
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, boxHeight: 12 } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${money(ctx.parsed)} (${pct(total ? (ctx.parsed / total) * 100 : 0)})` } },
      },
    },
  });

  const proj = investmentProjection(20);
  const year0 = Number(state.month.slice(0, 4));
  makeChart('proj-chart', {
    type: 'line',
    data: {
      labels: proj.map((p) => String(year0 + p.year)),
      datasets: [
        { label: 'Projected value', data: proj.map((p) => p.value), borderColor: cssVar('--ink'), backgroundColor: cssVar('--fill'), fill: true, pointRadius: 0, borderWidth: 2, tension: 0.2 },
        { label: 'Money you put in', data: proj.map((p) => p.paidIn), borderColor: cssVar('--green'), backgroundColor: cssVar('--green'), borderDash: [6, 4], pointRadius: 0, borderWidth: 2, tension: 0.2 },
      ],
    },
    options: baseOptions(),
  });
}

function chartsRetirement() {
  if (!window.Chart) return makeChart('ret-chart');
  const plan = retirementPlan();
  makeChart('ret-chart', {
    type: 'line',
    data: {
      labels: plan.points.map((p) => String(Math.round(p.age))),
      datasets: [
        { label: 'Projected savings (today’s dollars)', data: plan.points.map((p) => p.bal / plan.inflationFactor(p.age)), borderColor: cssVar('--ink'), backgroundColor: cssVar('--fill'), fill: true, pointRadius: 0, borderWidth: 2, tension: 0.2 },
        { label: 'Target nest egg', data: plan.points.map((p) => (p.age <= plan.retireAge ? plan.targetToday : null)), borderColor: cssVar('--green'), borderDash: [6, 4], pointRadius: 0, borderWidth: 2 },
      ],
    },
    options: baseOptions(),
  });
}

/* ---------------------------------------------------------------------
   7. Events, routing, rendering
   --------------------------------------------------------------------- */
function currentPage() {
  const h = location.hash.slice(1);
  return PAGES[h] ? h : 'balance-sheet';
}

function render() {
  const page = currentPage();
  document.querySelectorAll('.tabs a').forEach((a) => {
    if (a.dataset.page === page) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  // On phones the tabs scroll sideways; keep the current one in view
  const nav = $('.tabs'); const activeTab = $('.tabs a[aria-current]');
  if (nav && activeTab && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = activeTab.offsetLeft - nav.offsetLeft - 16;
  document.title = `${PAGES[page].title} | Household Ledger`;
  $('#brand-month').textContent = `Tracking ${monthLabel(state.month)}`;
  $('#close-month-btn').textContent = `Close ${monthLabel(state.month)}`;
  $('#undo-btn').disabled = !hasUndo();

  Object.keys(charts).forEach((k) => { charts[k].destroy(); delete charts[k]; });
  $('#main').innerHTML = `<div class="page">${sampleNotice()}${PAGES[page].render()}</div>${datalists()}`;
  PAGES[page].after();
}

/* Re-draw after an edit, keeping your place and cursor */
let pointerIsDown = false;
let renderPending = false;
let renderTimer = null;
function scheduleRender() {
  if (pointerIsDown) { renderPending = true; return; } // wait so a click on a button isn't lost
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    const focusKey = document.activeElement?.dataset?.fk;
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
    if (focusKey) document.querySelector(`[data-fk="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
  }, 0);
}
document.addEventListener('pointerdown', () => { pointerIsDown = true; }, true);
const pointerReleased = () => {
  pointerIsDown = false;
  if (renderPending) { renderPending = false; setTimeout(scheduleRender, 0); }
};
document.addEventListener('pointerup', pointerReleased, true);
document.addEventListener('pointercancel', pointerReleased, true);

/* Typing in any table cell or setting updates your data */
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.id === 'import-file') { importData(el.files[0]); el.value = ''; return; }
  if (el.dataset.ui === 'budgetMonth') { ui.budgetMonth = el.value === state.month ? null : el.value; render(); return; }

  const { col, id, obj, field } = el.dataset;
  if (!field) return;
  let value;
  if (el.type === 'checkbox') value = el.checked;
  else if (el.type === 'number') value = num(parseFloat(el.value));
  else value = el.value;

  if (col) {
    const item = COLS[col]?.().find((x) => x.id === id);
    if (!item) return;
    item[field] = value;
  } else if (obj) {
    const target = obj === 'root' ? state : state[obj];
    if (!target) return;
    target[field] = value;
  } else return;

  save();
  scheduleRender();
});

/* Buttons */
function addRow(col, data) {
  const item = { id: uid(), ...data };
  COLS[col]().push(item);
  save(); render();
  const el = document.querySelector(`[data-fk="${col}:${item.id}:name"]`);
  if (el) { el.focus(); el.select(); }
}

function deleteRow(col, id) {
  const list = COLS[col]();
  const idx = list.findIndex((x) => x.id === id);
  if (idx < 0) return;
  const item = list[idx];
  if (col === 'categories') {
    const count = state.transactions.filter((t) => t.categoryId === id).length;
    if (count && !confirm(`${count} transaction${count === 1 ? ' uses' : 's use'} “${item.name}”. Remove the category anyway? Those transactions will show as uncategorized.`)) return;
  }
  list.splice(idx, 1);
  save(); render();
  toast(`Removed ${item.name || item.desc || 'row'}.`);
}

const ACTIONS = {
  'add-asset': () => addRow('assets', { name: 'New asset', category: 'Cash', value: 0 }),
  'add-debt': () => addRow('debts', { name: 'New debt', balance: 0, apr: 0, minPayment: 0 }),
  'add-investment': () => addRow('investments', { name: 'New account', type: 'Brokerage', value: 0, costBasis: 0, monthly: 0, expectedReturn: 6, retirement: false }),
  'add-category': (btn) => addRow('categories', { name: 'New category', type: btn.dataset.type || 'expense', planned: 0 }),
  delete: (btn) => deleteRow(btn.dataset.col, btn.dataset.id),
  'open-close': openCloseDialog,
  'cancel-close': () => $('#close-dialog').close(),
  export: exportData,
  'undo-close': undoClose,
  'clear-sample': clearSample,
  'keep-sample': () => { state.sample = false; save(); render(); },
};

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = ACTIONS[btn.dataset.action];
  if (action) action(btn);
});

/* Forms: adding a transaction, closing a month */
document.addEventListener('submit', (e) => {
  const form = e.target;
  if (form.dataset.form === 'add-tx') { e.preventDefault(); addTransaction(form); }
  if (form.dataset.form === 'close-month') { e.preventDefault(); performClose(form); }
});

function addTransaction(form) {
  const fd = new FormData(form);
  const amount = round2(parseFloat(fd.get('amount')));
  const date = String(fd.get('date') || '');
  if (!date) { toast('Pick a date for the transaction.'); return; }
  if (!(amount > 0)) { toast('Enter an amount greater than zero.'); form.elements.amount.focus(); return; }
  const t = { id: uid(), date, desc: String(fd.get('desc') || '').trim() || 'Untitled', categoryId: String(fd.get('categoryId')), amount };
  state.transactions.push(t);
  ui.lastDate = date;
  ui.lastCategory = t.categoryId;
  const m = date.slice(0, 7);
  if (m !== viewMonth()) ui.budgetMonth = m === state.month ? null : m;
  save(); render();
  toast(`Added ${money(amount, true)} to ${categoryName(t.categoryId)}.`);
  $('#tx-desc')?.focus();
}

/* Toast messages */
let toastTimer = null;
function toast(message) {
  const t = $('#toast');
  t.textContent = message;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3800);
}

/* Moving between pages */
window.addEventListener('hashchange', () => {
  render();
  window.scrollTo(0, 0);
  $('#main').focus({ preventScroll: true });
});

/* Redraw charts when the system switches light/dark mode */
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', render);

/* Start */
render();