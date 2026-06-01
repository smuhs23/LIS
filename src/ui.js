import * as engine from './engine.js';
import { createStore, localStorageAdapter } from './store.js';
import { renderCharts } from './charts.js';
import { exportXlsx, exportPdf } from './export.js';

const store = createStore(localStorageAdapter());

export const defaultInput = () => ({
  capex: [
    { key: 'planung', label: 'Planung LP1 bis 8', amount: 0, life: 30 },
    { key: 'tiefbau', label: 'Tiefbau', amount: 0, life: 40 },
    { key: 'leitung', label: 'Leitungsinfrastruktur', amount: 0, life: 40 },
    { key: 'fundament', label: 'Fundamente', amount: 0, life: 40 },
    { key: 'trafo', label: 'Trafo / Netzstation', amount: 0, life: 25 },
    { key: 'charger', label: 'Charger-Hardware', amount: 0, life: 10 },
    { key: 'netzanschluss', label: 'Netzanschluss / BKZ', amount: 0, life: 40 },
    { key: 'genehmigung', label: 'Genehmigungen', amount: 0, life: 40 },
    { key: 'sonstiges', label: 'Sonstiges', amount: 0, life: 20 }
  ],
  pufferPct: 10,
  land: { mode: 'gestellt', pacht: 0, pachtIndexPct: 2 },
  revenue: {
    fixumMonthly: 0, fixumIndexPct: 2,
    mode: 'kwh', kwhPerYear: 0, pricePerKwh: 0, sharePct: 0,
    annualRevenue: 0, rampYears: 2,
    scenarioFactors: { konservativ: 0.7, basis: 1.0, optimistisch: 1.3 }
  },
  opex: { wartung: 0, versicherung: 0, verwaltung: 0 },
  term: 15,
  discountRatePct: 6,
  financing: { mode: 'ek', loan: 0, ratePct: 4, loanYears: 10, amortType: 'annuitaet', graceYears: 0 },
  residual: 0
});

let state = defaultInput();
let activeScenario = 'basis';
let istByYear = {};

const fmtEur = v => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0);
const fmtPct = v => v == null ? 'n. d.' : new Intl.NumberFormat('de-DE', { style: 'percent', maximumFractionDigits: 1 }).format(v);
const fmtMonths = m => m == null ? 'n. d.' : `${Math.floor(m / 12)} J ${m % 12} M`;

function num(path) {
  return e => { setByPath(state, path, parseFloat(e.target.value) || 0); recompute(); };
}
function val(path) {
  return e => { setByPath(state, path, e.target.value); recompute(); };
}
function setByPath(obj, path, value) {
  const parts = path.split('.');
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
  o[parts[parts.length - 1]] = value;
}
function getByPath(obj, path) {
  return path.split('.').reduce((o, p) => o[p], obj);
}

function unitFor(label) {
  if (/prozent|index/i.test(label)) return '%';
  if (/preis pro kwh/i.test(label)) return '€';
  if (/kwh pro jahr/i.test(label)) return 'kWh';
  if (/jahre|jahren|hochlauf/i.test(label)) return 'J';
  if (/monat|umsatz|pacht|restwert|kredit|betrag|fixum|wartung|versicherung|verwaltung/i.test(label)) return '€';
  return '';
}

function controlFor(input, unit) {
  const ctrl = document.createElement('span');
  ctrl.className = 'control';
  ctrl.appendChild(input);
  if (unit) {
    const u = document.createElement('span');
    u.className = 'unit';
    u.textContent = unit;
    ctrl.appendChild(u);
  }
  return ctrl;
}

function field(label, path, type = 'number') {
  const wrap = document.createElement('label');
  const lbl = document.createElement('span');
  lbl.className = 'lbl';
  lbl.textContent = label;
  const input = document.createElement('input');
  input.type = type;
  input.value = getByPath(state, path);
  input.addEventListener('input', type === 'number' ? num(path) : val(path));
  wrap.append(lbl, controlFor(input, unitFor(label)));
  return wrap;
}

function renderInputs() {
  const form = document.getElementById('input-form');
  form.innerHTML = '';

  const capexFs = document.createElement('fieldset');
  capexFs.innerHTML = '<legend>CAPEX und Nutzungsdauer</legend>';
  state.capex.forEach((p, i) => {
    const row = document.createElement('label');
    const lbl = document.createElement('span');
    lbl.className = 'lbl';
    lbl.textContent = p.label;
    const amount = document.createElement('input');
    amount.type = 'number'; amount.value = p.amount;
    amount.title = 'Betrag in Euro';
    amount.addEventListener('input', e => { state.capex[i].amount = parseFloat(e.target.value) || 0; recompute(); });
    const life = document.createElement('input');
    life.type = 'number'; life.value = p.life; life.className = 'narrow';
    life.title = 'Nutzungsdauer in Jahren';
    life.addEventListener('input', e => { state.capex[i].life = parseFloat(e.target.value) || 0; recompute(); });
    const pair = document.createElement('span');
    pair.className = 'capex-pair';
    pair.append(controlFor(amount, '€'), controlFor(life, 'J'));
    row.append(lbl, pair);
    capexFs.appendChild(row);
  });
  capexFs.appendChild(field('Puffer in Prozent', 'pufferPct'));
  form.appendChild(capexFs);

  const landFs = document.createElement('fieldset');
  landFs.innerHTML = '<legend>Grundstueck</legend>';
  const landSel = document.createElement('label');
  landSel.textContent = 'Modus';
  const sel = document.createElement('select');
  ['gestellt', 'gepachtet'].forEach(m => {
    const o = document.createElement('option'); o.value = m; o.textContent = m; if (state.land.mode === m) o.selected = true; sel.appendChild(o);
  });
  sel.addEventListener('change', e => { state.land.mode = e.target.value; recompute(); });
  landSel.appendChild(sel); landFs.appendChild(landSel);
  landFs.appendChild(field('Pacht pro Jahr', 'land.pacht'));
  landFs.appendChild(field('Pacht Index in Prozent', 'land.pachtIndexPct'));
  form.appendChild(landFs);

  const revFs = document.createElement('fieldset');
  revFs.innerHTML = '<legend>Einnahmen</legend>';
  revFs.appendChild(field('Fixum pro Monat', 'revenue.fixumMonthly'));
  revFs.appendChild(field('Fixum Index in Prozent', 'revenue.fixumIndexPct'));
  const modeSel = document.createElement('label');
  modeSel.textContent = 'Umsatzmodus';
  const ms = document.createElement('select');
  [['kwh', 'kWh-getrieben'], ['direct', 'Jahresumsatz']].forEach(([v, t]) => {
    const o = document.createElement('option'); o.value = v; o.textContent = t; if (state.revenue.mode === v) o.selected = true; ms.appendChild(o);
  });
  ms.addEventListener('change', e => { state.revenue.mode = e.target.value; recompute(); });
  modeSel.appendChild(ms); revFs.appendChild(modeSel);
  revFs.appendChild(field('kWh pro Jahr', 'revenue.kwhPerYear'));
  revFs.appendChild(field('Preis pro kWh', 'revenue.pricePerKwh'));
  revFs.appendChild(field('Jahresumsatz (Modus B)', 'revenue.annualRevenue'));
  revFs.appendChild(field('Unser Anteil in Prozent', 'revenue.sharePct'));
  revFs.appendChild(field('Hochlauf in Jahren', 'revenue.rampYears'));
  form.appendChild(revFs);

  const opexFs = document.createElement('fieldset');
  opexFs.innerHTML = '<legend>Laufende Kosten</legend>';
  opexFs.appendChild(field('Wartung pro Jahr', 'opex.wartung'));
  opexFs.appendChild(field('Versicherung pro Jahr', 'opex.versicherung'));
  opexFs.appendChild(field('Verwaltung pro Jahr', 'opex.verwaltung'));
  form.appendChild(opexFs);

  const finFs = document.createElement('fieldset');
  finFs.innerHTML = '<legend>Laufzeit und Finanzierung</legend>';
  finFs.appendChild(field('Betriebslaufzeit in Jahren', 'term'));
  finFs.appendChild(field('Kalkulationszins in Prozent', 'discountRatePct'));
  finFs.appendChild(field('Restwert am Ende', 'residual'));
  const finSel = document.createElement('label');
  finSel.textContent = 'Finanzierung';
  const fs2 = document.createElement('select');
  [['ek', 'Eigenkapital'], ['ekfk', 'Eigen plus Fremd']].forEach(([v, t]) => {
    const o = document.createElement('option'); o.value = v; o.textContent = t; if (state.financing.mode === v) o.selected = true; fs2.appendChild(o);
  });
  fs2.addEventListener('change', e => { state.financing.mode = e.target.value; recompute(); });
  finSel.appendChild(fs2); finFs.appendChild(finSel);
  finFs.appendChild(field('Kreditbetrag', 'financing.loan'));
  finFs.appendChild(field('Sollzins in Prozent', 'financing.ratePct'));
  finFs.appendChild(field('Kreditlaufzeit in Jahren', 'financing.loanYears'));
  finFs.appendChild(field('Tilgungsfreie Jahre', 'financing.graceYears'));
  const amortSel = document.createElement('label');
  amortSel.textContent = 'Tilgungsart';
  const as2 = document.createElement('select');
  [['annuitaet', 'Annuitaet'], ['linear', 'Linear']].forEach(([v, t]) => {
    const o = document.createElement('option'); o.value = v; o.textContent = t; if (state.financing.amortType === v) o.selected = true; as2.appendChild(o);
  });
  as2.addEventListener('change', e => { state.financing.amortType = e.target.value; recompute(); });
  amortSel.appendChild(as2); finFs.appendChild(amortSel);

  const scenSel = document.createElement('label');
  scenSel.textContent = 'Anzeige-Szenario';
  const sc = document.createElement('select');
  [['konservativ', 'konservativ'], ['basis', 'Basis'], ['optimistisch', 'optimistisch']].forEach(([v, t]) => {
    const o = document.createElement('option'); o.value = v; o.textContent = t; if (activeScenario === v) o.selected = true; sc.appendChild(o);
  });
  sc.addEventListener('change', e => { activeScenario = e.target.value; recompute(); });
  scenSel.appendChild(sc); finFs.appendChild(scenSel);
  form.appendChild(finFs);
}

// --- Recompute und Dashboard ---

let lastBundle = null;

const KPI_ICONS = {
  irr: '<path d="M3 17l6-6 4 4 8-8"></path><path d="M21 7v6h-6"></path>',
  payback: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>',
  npv: '<path d="M12 1v22"></path><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>',
  capex: '<rect x="3" y="8" width="18" height="13" rx="2"></rect><path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>',
  equity: '<path d="M12 2 2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5M2 12l10 5 10-5"></path>',
  reinvest: '<path d="M21 2v6h-6"></path><path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path><path d="M3 22v-6h6"></path><path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>'
};
function kpiIcon(key) {
  return `<span class="kpi-icon"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${KPI_ICONS[key] || ''}</svg></span>`;
}

function renderKpis(r) {
  const kpis = document.getElementById('kpis');
  const items = [
    { l: 'Projekt-IZF', v: fmtPct(r.projectIRR), raw: r.projectIRR, icon: 'irr', primary: true },
    { l: 'EK-IZF', v: fmtPct(r.equityIRR), raw: r.equityIRR, icon: 'irr' },
    { l: 'Payback Projekt', v: fmtMonths(r.projectPaybackMonths), raw: 1, icon: 'payback' },
    { l: 'Payback EK', v: fmtMonths(r.equityPaybackMonths), raw: 1, icon: 'payback' },
    { l: 'NPV', v: fmtEur(r.npv), raw: r.npv, icon: 'npv', primary: true },
    { l: 'Gesamt-CAPEX', v: fmtEur(r.capexTotal), raw: 1, icon: 'capex' },
    { l: 'Eingesetztes EK', v: fmtEur(r.equityInvested), raw: 1, icon: 'equity' },
    { l: 'Reinvest gesamt', v: fmtEur(r.reinvestTotal), raw: 1, icon: 'reinvest' }
  ];
  kpis.innerHTML = items.map(it => {
    const neg = (typeof it.raw === 'number' && it.raw < 0) ? ' neg' : '';
    return `<div class="kpi${it.primary ? ' kpi-primary' : ''}">
      <div class="kpi-top">${kpiIcon(it.icon)}<div class="l">${it.l}</div></div>
      <div class="v${neg}">${it.v}</div>
    </div>`;
  }).join('');
}

function renderComparison(bundle) {
  const landLabel = { gestellt: 'Gestellt', gepachtet: 'Gepachtet' };
  const rows = [];
  for (const land of ['gestellt', 'gepachtet']) {
    for (const fin of ['ek', 'ekfk']) {
      const r = bundle[land][fin][activeScenario];
      const active = (land === state.land.mode && fin === state.financing.mode);
      const npvCls = r.npv > 0 ? 'num-pos' : r.npv < 0 ? 'num-neg' : '';
      rows.push(`<tr${active ? ' class="active-variant"' : ''}>
        <td><span class="variant">${active ? '<span class="active-dot"></span>' : ''}${landLabel[land]}<span class="tag">${fin === 'ek' ? 'EK' : 'EK+FK'}</span></span></td>
        <td>${fmtPct(r.projectIRR)}</td><td>${fmtPct(r.equityIRR)}</td>
        <td>${fmtMonths(r.projectPaybackMonths)}</td><td class="${npvCls}">${fmtEur(r.npv)}</td></tr>`);
    }
  }
  document.getElementById('comparison').innerHTML =
    `<table><thead><tr><th>Variante</th><th>Projekt-IZF</th><th>EK-IZF</th><th>Payback</th><th>NPV</th></tr></thead>
     <tbody>${rows.join('')}</tbody></table>`;
}

function recompute() {
  const warns = engine.validateInput(state);
  document.getElementById('warnings').innerHTML = warns.map(w => `<div>${w}</div>`).join('');
  lastBundle = engine.computeBundle(state);
  const current = lastBundle[state.land.mode][state.financing.mode][activeScenario];
  renderKpis(current);
  renderCharts(current);
  renderComparison(lastBundle);
  updateScenarioHint();
  store.savePark({ id: 'autosave', name: 'Autosave', input: state, ist: istByYear });
}

const SCEN_LABEL = { konservativ: 'Konservativ', basis: 'Basis', optimistisch: 'Optimistisch' };
const LAND_LABEL = { gestellt: 'Gestellt', gepachtet: 'Gepachtet' };
const FIN_LABEL = { ek: 'Eigenkapital', ekfk: 'EK + Fremdkapital' };
function updateScenarioHint() {
  const el = document.getElementById('scenario-hint');
  if (!el) return;
  el.innerHTML = `<span class="pill">${SCEN_LABEL[activeScenario]}</span> · ${LAND_LABEL[state.land.mode]} · ${FIN_LABEL[state.financing.mode]} · ${state.term} Jahre`;
}

export function getState() { return state; }
export function getBundle() { return lastBundle; }
export function getScenario() { return activeScenario; }

// --- Reiter ---

function wireTabs() {
  document.querySelectorAll('.tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById('tab-plan').hidden = tab !== 'plan';
      document.getElementById('tab-ist').hidden = tab !== 'ist';
      if (tab === 'ist') renderIst();
    });
  });
}

// --- Park-Verwaltung ---

function refreshParkSelect() {
  const sel = document.getElementById('park-select');
  const parks = store.listParks().filter(p => p.id !== 'autosave');
  sel.innerHTML = '<option value="">Neuer Park</option>' +
    parks.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
}

function wireParkControls() {
  document.getElementById('park-save').addEventListener('click', () => {
    const name = prompt('Name des Parks');
    if (!name) return;
    store.savePark({ name, input: state, ist: istByYear });
    refreshParkSelect();
  });
  document.getElementById('park-select').addEventListener('change', e => {
    if (!e.target.value) { state = defaultInput(); istByYear = {}; } else {
      const p = store.loadPark(e.target.value);
      if (p) { state = p.input; istByYear = p.ist || {}; }
    }
    renderInputs(); recompute();
  });
  document.getElementById('park-export-json').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ input: state, ist: istByYear }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'ladepark.json'; a.click();
  });
  document.getElementById('park-import-json').addEventListener('click', () => document.getElementById('import-file').click());
  document.getElementById('import-file').addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        state = data.input;
        istByYear = data.ist || {};
        renderInputs(); recompute();
      } catch { alert('Datei nicht lesbar.'); }
    };
    reader.readAsText(file);
  });
  document.getElementById('export-xlsx').addEventListener('click', () => exportXlsx(state, lastBundle, activeScenario));
  document.getElementById('export-pdf').addEventListener('click', () => exportPdf());
}

// --- Ist-Tracking ---

function renderIst() {
  const view = document.getElementById('ist-view');
  const plan = engine.buildProjectCashflows(state, activeScenario, state.land.mode);
  const merged = engine.forecastToComplete(plan, istByYear);
  const projIRR = engine.irr(merged);
  const payback = engine.paybackMonths(merged);

  let rows = '';
  for (let t = 1; t <= state.term; t++) {
    const planV = plan[t];
    const istV = istByYear[t];
    const dev = istV != null ? istV - planV : null;
    const devCls = dev == null ? '' : dev >= 0 ? 'num-pos' : 'num-neg';
    rows += `<tr>
      <td>Jahr ${t}</td>
      <td>${fmtEur(planV)}</td>
      <td><input type="number" data-year="${t}" value="${istV != null ? istV : ''}" placeholder="—"></td>
      <td class="${devCls}">${dev == null ? '' : (dev >= 0 ? '+' : '') + fmtEur(dev)}</td>
    </tr>`;
  }

  view.innerHTML = `
    <div class="ist-wrap">
      <div class="section-row"><h2 class="section-title">Plan / Ist-Abgleich</h2><span class="section-hint">Ist-Werte je Jahr erfassen</span></div>
      <div class="kpis">
        <div class="kpi kpi-primary">
          <div class="kpi-top">${kpiIcon('irr')}<div class="l">IZF Ist + Restplan</div></div>
          <div class="v${projIRR != null && projIRR < 0 ? ' neg' : ''}">${fmtPct(projIRR)}</div>
        </div>
        <div class="kpi">
          <div class="kpi-top">${kpiIcon('payback')}<div class="l">Payback Ist + Restplan</div></div>
          <div class="v">${fmtMonths(payback)}</div>
        </div>
      </div>
      <div class="section-row"><h2 class="section-title">Cashflow je Periode</h2></div>
      <div class="comparison">
        <table>
          <thead><tr><th>Periode</th><th>Plan</th><th>Ist</th><th>Abweichung</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;

  view.querySelectorAll('input[data-year]').forEach(inp => {
    inp.addEventListener('input', e => {
      const y = parseInt(e.target.dataset.year, 10);
      const v = e.target.value;
      if (v === '') delete istByYear[y]; else istByYear[y] = parseFloat(v) || 0;
      store.savePark({ id: 'autosave', name: 'Autosave', input: state, ist: istByYear });
      renderIst();
    });
  });
}

// --- UI-Steuerung: Theme, Sidebar, Drawer ---

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.body.setAttribute('data-theme', theme);
  try { localStorage.setItem('lp.ui.theme', theme); } catch (e) {}
}

function wireChrome() {
  const app = document.getElementById('app');

  // Theme initial
  let theme = 'light';
  try { theme = localStorage.getItem('lp.ui.theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch (e) {}
  applyTheme(theme);

  document.getElementById('theme-toggle').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    recompute(); // Charts an Theme anpassen
  });

  // Sidebar einklappen (Desktop)
  let collapsed = false;
  try { collapsed = localStorage.getItem('lp.ui.collapsed') === '1'; } catch (e) {}
  if (collapsed) app.classList.add('collapsed');
  const setCollapsed = v => {
    app.classList.toggle('collapsed', v);
    try { localStorage.setItem('lp.ui.collapsed', v ? '1' : '0'); } catch (e) {}
  };
  document.getElementById('collapse-btn').addEventListener('click', () => setCollapsed(true));
  document.getElementById('expand-btn').addEventListener('click', () => setCollapsed(false));

  // Drawer (Mobile)
  const closeDrawer = () => app.classList.remove('drawer-open');
  document.getElementById('sidebar-toggle').addEventListener('click', () => app.classList.toggle('drawer-open'));
  document.getElementById('scrim').addEventListener('click', closeDrawer);
}

// --- Init ---

function init() {
  const auto = store.loadPark('autosave');
  if (auto && auto.input) state = auto.input;
  if (auto && auto.ist) istByYear = auto.ist;
  wireChrome();
  wireTabs();
  wireParkControls();
  refreshParkSelect();
  renderInputs();
  recompute();
}

init();
