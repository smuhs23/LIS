import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  annuityPayment, amortizationSchedule, reinvestSchedule,
  revenueForYear, opexForYear, capexTotal, buildProjectCashflows,
  buildEquityCashflows, npv, irr, paybackMonths, discountedPaybackMonths,
  computeScenario, computeBundle, validateInput, forecastToComplete
} from '../src/engine.js';

// --- Annuitaet und Tilgungsplan ---

test('annuitaet, normaler zins', () => {
  const a = annuityPayment(10000, 0.05, 5);
  assert.ok(Math.abs(a - 2309.7480) < 0.01);
});

test('annuitaet, zins null faellt auf lineare rate zurueck', () => {
  assert.equal(annuityPayment(10000, 0, 5), 2000);
});

test('tilgungsplan annuitaet endet bei restschuld null', () => {
  const s = amortizationSchedule(10000, 0.05, 5, 'annuitaet', 0);
  assert.equal(s.length, 5);
  assert.ok(Math.abs(s[4].balanceEnd) < 0.01);
  assert.ok(Math.abs(s[0].interest - 500) < 0.01);
});

test('tilgungsplan linear, konstante tilgung', () => {
  const s = amortizationSchedule(10000, 0.05, 5, 'linear', 0);
  assert.ok(Math.abs(s[0].principal - 2000) < 0.01);
  assert.ok(Math.abs(s[1].principal - 2000) < 0.01);
  assert.ok(Math.abs(s[4].balanceEnd) < 0.01);
});

test('tilgungsplan mit tilgungsfreier zeit', () => {
  const s = amortizationSchedule(10000, 0.05, 5, 'annuitaet', 2);
  assert.equal(s[0].principal, 0);
  assert.ok(Math.abs(s[0].interest - 500) < 0.01);
  assert.ok(Math.abs(s[4].balanceEnd) < 0.01);
});

// --- Reinvest ---

test('reinvest, nutzungsdauer kleiner laufzeit ergibt tausch', () => {
  const capex = [{ key: 'charger', amount: 100, life: 10 }];
  const r = reinvestSchedule(capex, 15);
  assert.equal(r.byYear[10], 100);
  assert.deepEqual(r.years, [10]);
  assert.equal(r.total, 100);
});

test('reinvest, nutzungsdauer gleich laufzeit ergibt keinen tausch', () => {
  const capex = [{ key: 'charger', amount: 100, life: 10 }];
  const r = reinvestSchedule(capex, 10);
  assert.deepEqual(r.years, []);
  assert.equal(r.total, 0);
});

test('reinvest, mehrere zyklen und preissteigerung', () => {
  const capex = [{ key: 'x', amount: 100, life: 5 }];
  const r = reinvestSchedule(capex, 16, { priceGrowthPct: 0 });
  assert.deepEqual(r.years, [5, 10, 15]);
  assert.equal(r.total, 300);
});

// --- Einnahmen und OPEX ---

const rev = {
  fixumMonthly: 1000, fixumIndexPct: 0,
  mode: 'kwh', kwhPerYear: 100000, pricePerKwh: 0.10, sharePct: 50,
  annualRevenue: 0, rampYears: 1,
  scenarioFactors: { konservativ: 0.7, basis: 1.0, optimistisch: 1.3 }
};

test('einnahmen kwh, basis ohne ramp', () => {
  assert.ok(Math.abs(revenueForYear(1, rev, 'basis') - 17000) < 0.01);
});

test('einnahmen mit ramp ueber zwei jahre', () => {
  const r2 = { ...rev, rampYears: 2 };
  assert.ok(Math.abs(revenueForYear(1, r2, 'basis') - 14500) < 0.01);
  assert.ok(Math.abs(revenueForYear(2, r2, 'basis') - 17000) < 0.01);
});

test('einnahmen szenario konservativ trifft nur variablen teil', () => {
  assert.ok(Math.abs(revenueForYear(1, rev, 'konservativ') - 15500) < 0.01);
});

test('opex gepachtet mit indexierung', () => {
  const opex = { wartung: 1000, versicherung: 500, verwaltung: 500 };
  const land = { mode: 'gepachtet', pacht: 2000, pachtIndexPct: 10 };
  assert.ok(Math.abs(opexForYear(2, opex, land) - 4200) < 0.01);
});

test('opex gestellt ohne pacht', () => {
  const opex = { wartung: 1000, versicherung: 500, verwaltung: 500 };
  const land = { mode: 'gestellt', pacht: 9999, pachtIndexPct: 10 };
  assert.equal(opexForYear(1, opex, land), 2000);
});

// --- Projekt-Cashflows ---

const baseInput = {
  capex: [{ key: 'charger', amount: 1000, life: 10 }],
  pufferPct: 0,
  land: { mode: 'gestellt', pacht: 0, pachtIndexPct: 0 },
  revenue: { fixumMonthly: 100, fixumIndexPct: 0, mode: 'direct', annualRevenue: 0, sharePct: 0, rampYears: 1, scenarioFactors: { basis: 1 } },
  opex: { wartung: 0, versicherung: 0, verwaltung: 0 },
  term: 3,
  discountRatePct: 6,
  financing: { mode: 'ek' },
  residual: 0
};

test('capex summe mit puffer', () => {
  assert.equal(capexTotal({ ...baseInput, pufferPct: 10 }), 1100);
});

test('projekt cashflows, fixum only', () => {
  const cf = buildProjectCashflows(baseInput, 'basis', 'gestellt');
  assert.equal(cf.length, 4);
  assert.equal(cf[0], -1000);
  assert.ok(Math.abs(cf[1] - 1200) < 0.01);
  assert.ok(Math.abs(cf[3] - 1200) < 0.01);
});

test('projekt cashflows mit reinvest und restwert', () => {
  const inp = { ...baseInput, term: 12, residual: 500 };
  const cf = buildProjectCashflows(inp, 'basis', 'gestellt');
  assert.ok(Math.abs(cf[10] - (1200 - 1000)) < 0.01);
  assert.ok(Math.abs(cf[12] - (1200 + 500)) < 0.01);
});

// --- Eigenkapital-Cashflows ---

test('eigenkapital gleich projekt bei reiner ek finanzierung', () => {
  const projectCF = [-1000, 400, 400, 400];
  const r = buildEquityCashflows(projectCF, { mode: 'ek' }, 1000, 3);
  assert.equal(r.equityInvested, 1000);
  assert.deepEqual(r.equityCashflows, projectCF);
});

test('eigenkapital mit fremdkapital zieht kapitaldienst ab', () => {
  const projectCF = [-1000, 400, 400, 400];
  const fin = { mode: 'ekfk', loan: 600, ratePct: 5, loanYears: 3, amortType: 'annuitaet', graceYears: 0 };
  const r = buildEquityCashflows(projectCF, fin, 1000, 3);
  assert.equal(r.equityInvested, 400);
  assert.equal(r.equityCashflows[0], -400);
  const a = 600 * 0.05 / (1 - Math.pow(1.05, -3));
  assert.ok(Math.abs(r.equityCashflows[1] - (400 - a)) < 0.01);
});

test('fremdkapital laenger als laufzeit zieht restschuld am ende ab', () => {
  const projectCF = [-1000, 400, 400];
  const fin = { mode: 'ekfk', loan: 600, ratePct: 5, loanYears: 5, amortType: 'linear', graceYears: 0 };
  const r = buildEquityCashflows(projectCF, fin, 1000, 2);
  assert.ok(r.equityCashflows[2] < 400 - 120);
});

// --- IZF und NPV ---

test('npv einfach', () => {
  assert.ok(Math.abs(npv([-1000, 1100], 0.10)) < 0.0001);
});

test('izf einperiodig', () => {
  assert.ok(Math.abs(irr([-1000, 1100]) - 0.10) < 0.0001);
});

test('izf mehrperiodig', () => {
  assert.ok(Math.abs(irr([-1000, 600, 600]) - 0.13066) < 0.001);
});

test('izf ohne vorzeichenwechsel gibt null', () => {
  assert.equal(irr([100, 200, 300]), null);
});

// --- Payback ---

test('payback interpoliert auf monate', () => {
  assert.equal(paybackMonths([-1000, 400, 400, 400]), 30);
});

test('payback nie erreicht gibt null', () => {
  assert.equal(paybackMonths([-1000, 100, 100]), null);
});

test('diskontierter payback ist spaeter als einfacher', () => {
  const cf = [-1000, 400, 400, 400, 400];
  const simple = paybackMonths(cf);
  const disc = discountedPaybackMonths(cf, 0.10);
  assert.ok(disc > simple);
});

// --- computeScenario, computeBundle, validateInput ---

const fullInput = {
  capex: [{ key: 'charger', amount: 1000, life: 10 }],
  pufferPct: 0,
  land: { mode: 'gestellt', pacht: 500, pachtIndexPct: 0 },
  revenue: { fixumMonthly: 50, fixumIndexPct: 0, mode: 'direct', annualRevenue: 2000, sharePct: 50, rampYears: 1, scenarioFactors: { konservativ: 0.7, basis: 1, optimistisch: 1.3 } },
  opex: { wartung: 100, versicherung: 50, verwaltung: 50 },
  term: 5,
  discountRatePct: 6,
  financing: { mode: 'ek', loan: 0, ratePct: 0, loanYears: 0, amortType: 'annuitaet', graceYears: 0 },
  residual: 0
};

test('computeScenario liefert kennzahlen', () => {
  const r = computeScenario(fullInput, { landMode: 'gestellt', financingMode: 'ek', scenario: 'basis' });
  assert.equal(r.capexTotal, 1000);
  assert.equal(r.equityInvested, 1000);
  assert.equal(r.projectCashflows.length, 6);
  assert.equal(typeof r.npv, 'number');
});

test('computeScenario gepachtet hat schlechteren npv als gestellt', () => {
  const g = computeScenario(fullInput, { landMode: 'gestellt', financingMode: 'ek', scenario: 'basis' });
  const p = computeScenario(fullInput, { landMode: 'gepachtet', financingMode: 'ek', scenario: 'basis' });
  assert.ok(p.npv < g.npv);
});

test('computeBundle liefert alle kombinationen', () => {
  const b = computeBundle(fullInput);
  assert.ok(b.gestellt.ek.basis);
  assert.ok(b.gepachtet.ekfk.optimistisch);
});

test('validierung warnt wenn kredit groesser als capex', () => {
  const bad = { ...fullInput, financing: { mode: 'ekfk', loan: 5000, ratePct: 5, loanYears: 5, amortType: 'annuitaet', graceYears: 0 } };
  const warns = validateInput(bad);
  assert.ok(warns.some(w => w.includes('Kredit')));
});

// --- Forecast to complete ---

test('forecast to complete mischt ist und restplan', () => {
  const plan = [-1000, 400, 400, 400];
  const ist = { 1: 300 };
  const merged = forecastToComplete(plan, ist);
  assert.equal(merged[0], -1000);
  assert.equal(merged[1], 300);
  assert.equal(merged[2], 400);
});
