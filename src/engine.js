// Rechenkern — reine Finanzmathematik, kein DOM.

export function annuityPayment(principal, rate, years) {
  if (years <= 0) return 0;
  if (rate === 0) return principal / years;
  return principal * rate / (1 - Math.pow(1 + rate, -years));
}

export function amortizationSchedule(loan, rate, years, amortType, graceYears = 0) {
  const schedule = [];
  let balance = loan;
  const grace = Math.max(0, Math.min(graceYears, years));
  const amortYears = years - grace;
  const annuity = amortType === 'annuitaet' ? annuityPayment(balance, rate, amortYears) : 0;
  const linearPrincipal = amortYears > 0 ? balance / amortYears : 0;

  for (let y = 1; y <= years; y++) {
    const interest = balance * rate;
    let principal = 0;
    if (y > grace) {
      if (amortType === 'annuitaet') {
        principal = annuity - interest;
      } else {
        principal = linearPrincipal;
      }
      if (principal > balance) principal = balance;
    }
    balance = balance - principal;
    schedule.push({ year: y, interest, principal, payment: interest + principal, balanceEnd: balance });
  }
  return schedule;
}

export function reinvestSchedule(capex, term, options = {}) {
  const priceGrowth = (options.priceGrowthPct || 0) / 100;
  const minRemaining = options.minRemaining || 0;
  const byYear = {};
  const yearsSet = new Set();
  for (const pos of capex) {
    const life = pos.life || 0;
    if (life <= 0) continue;
    for (let k = 1; k * life < term; k++) {
      const year = k * life;
      if (term - year < minRemaining) continue;
      const amount = pos.amount * Math.pow(1 + priceGrowth, year);
      byYear[year] = (byYear[year] || 0) + amount;
      yearsSet.add(year);
    }
  }
  const years = [...yearsSet].sort((a, b) => a - b);
  const total = years.reduce((s, y) => s + byYear[y], 0);
  return { byYear, years, total };
}

export function revenueForYear(t, revenue, scenario) {
  const idx = Math.pow(1 + (revenue.fixumIndexPct || 0) / 100, t - 1);
  const fixum = (revenue.fixumMonthly || 0) * 12 * idx;
  const ramp = revenue.rampYears > 0 ? Math.min(1, t / revenue.rampYears) : 1;
  const factor = (revenue.scenarioFactors && revenue.scenarioFactors[scenario] != null)
    ? revenue.scenarioFactors[scenario] : 1;
  let variableFull;
  if (revenue.mode === 'direct') {
    variableFull = (revenue.annualRevenue || 0) * (revenue.sharePct || 0) / 100;
  } else {
    variableFull = (revenue.kwhPerYear || 0) * (revenue.pricePerKwh || 0) * (revenue.sharePct || 0) / 100;
  }
  return fixum + variableFull * factor * ramp;
}

export function opexForYear(t, opex, land) {
  const base = (opex.wartung || 0) + (opex.versicherung || 0) + (opex.verwaltung || 0);
  let pacht = 0;
  if (land.mode === 'gepachtet') {
    pacht = (land.pacht || 0) * Math.pow(1 + (land.pachtIndexPct || 0) / 100, t - 1);
  }
  return base + pacht;
}

export function capexTotal(input) {
  const sum = input.capex.reduce((s, p) => s + (p.amount || 0), 0);
  return sum * (1 + (input.pufferPct || 0) / 100);
}

export function buildProjectCashflows(input, scenario, landMode) {
  const land = { ...input.land, mode: landMode };
  const total = capexTotal(input);
  const reinvest = reinvestSchedule(input.capex, input.term, {
    priceGrowthPct: input.reinvestPriceGrowthPct || 0,
    minRemaining: input.reinvestMinRemaining || 0
  });
  const cf = [-total];
  for (let t = 1; t <= input.term; t++) {
    let value = revenueForYear(t, input.revenue, scenario)
      - opexForYear(t, input.opex, land)
      - (reinvest.byYear[t] || 0);
    if (t === input.term) value += (input.residual || 0);
    cf.push(value);
  }
  return cf;
}

export function buildEquityCashflows(projectCashflows, financing, total, term) {
  if (!financing || financing.mode !== 'ekfk' || !(financing.loan > 0)) {
    return { equityInvested: total, equityCashflows: projectCashflows.slice() };
  }
  const loan = Math.min(financing.loan, total);
  const equityInvested = total - loan;
  const schedule = amortizationSchedule(
    loan, (financing.ratePct || 0) / 100, financing.loanYears || term,
    financing.amortType || 'annuitaet', financing.graceYears || 0
  );
  const eq = projectCashflows.slice();
  eq[0] = -equityInvested;
  for (let t = 1; t <= term; t++) {
    const row = schedule[t - 1];
    if (row) eq[t] = projectCashflows[t] - row.payment;
  }
  if ((financing.loanYears || term) > term) {
    const balance = schedule[term - 1] ? schedule[term - 1].balanceEnd : loan;
    eq[term] = eq[term] - balance;
  }
  return { equityInvested, equityCashflows: eq };
}

export function npv(cashflows, rate) {
  return cashflows.reduce((s, cf, t) => s + cf / Math.pow(1 + rate, t), 0);
}

export function irr(cashflows) {
  const hasPos = cashflows.some(v => v > 0);
  const hasNeg = cashflows.some(v => v < 0);
  if (!hasPos || !hasNeg) return null;

  let rate = 0.1;
  for (let i = 0; i < 100; i++) {
    let f = 0, df = 0;
    for (let t = 0; t < cashflows.length; t++) {
      const denom = Math.pow(1 + rate, t);
      f += cashflows[t] / denom;
      if (t > 0) df += -t * cashflows[t] / Math.pow(1 + rate, t + 1);
    }
    if (Math.abs(f) < 1e-7) return rate;
    if (df === 0) break;
    const next = rate - f / df;
    if (!isFinite(next) || next <= -0.9999) break;
    rate = next;
  }

  let lo = -0.9999, hi = 10;
  const fLo = npv(cashflows, lo);
  const fHi = npv(cashflows, hi);
  if (fLo * fHi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(cashflows, mid);
    if (Math.abs(fMid) < 1e-7) return mid;
    if (fLo * fMid < 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

export function paybackMonths(cashflows) {
  let cum = 0;
  for (let t = 0; t < cashflows.length; t++) {
    const prev = cum;
    cum += cashflows[t];
    if (cum >= 0 && t > 0) {
      const fraction = cashflows[t] !== 0 ? -prev / cashflows[t] : 0;
      const years = (t - 1) + fraction;
      return Math.round(years * 12);
    }
  }
  return null;
}

export function discountedPaybackMonths(cashflows, rate) {
  const disc = cashflows.map((cf, t) => cf / Math.pow(1 + rate, t));
  return paybackMonths(disc);
}

export function computeScenario(input, { landMode, financingMode, scenario }) {
  const total = capexTotal(input);
  const projectCashflows = buildProjectCashflows(input, scenario, landMode);
  const financing = financingMode === 'ekfk' ? input.financing : { mode: 'ek' };
  const { equityInvested, equityCashflows } =
    buildEquityCashflows(projectCashflows, financing, total, input.term);
  const rate = (input.discountRatePct || 0) / 100;
  const reinvest = reinvestSchedule(input.capex, input.term);
  const operating = projectCashflows.slice(1);
  const avgAnnualFCF = operating.length
    ? operating.reduce((s, v) => s + v, 0) / operating.length : 0;

  return {
    capexTotal: total,
    equityInvested,
    projectCashflows,
    equityCashflows,
    projectIRR: irr(projectCashflows),
    equityIRR: irr(equityCashflows),
    projectPaybackMonths: paybackMonths(projectCashflows),
    equityPaybackMonths: paybackMonths(equityCashflows),
    discPaybackMonths: discountedPaybackMonths(projectCashflows, rate),
    npv: npv(projectCashflows, rate),
    avgAnnualFCF,
    reinvestTotal: reinvest.total,
    reinvestYears: reinvest.years
  };
}

export function computeBundle(input) {
  const bundle = {};
  for (const landMode of ['gestellt', 'gepachtet']) {
    bundle[landMode] = {};
    for (const financingMode of ['ek', 'ekfk']) {
      bundle[landMode][financingMode] = {};
      for (const scenario of ['konservativ', 'basis', 'optimistisch']) {
        bundle[landMode][financingMode][scenario] =
          computeScenario(input, { landMode, financingMode, scenario });
      }
    }
  }
  return bundle;
}

export function validateInput(input) {
  const warns = [];
  const total = capexTotal(input);
  if (input.term < 1) warns.push('Laufzeit muss mindestens 1 Jahr betragen.');
  if (input.financing && input.financing.mode === 'ekfk' && input.financing.loan > total) {
    warns.push('Kreditbetrag ist groesser als die Gesamt-CAPEX und wird gekappt.');
  }
  for (const p of input.capex) {
    if (p.amount < 0) warns.push(`Negative CAPEX-Position: ${p.label || p.key}.`);
  }
  return warns;
}

export function forecastToComplete(planCashflows, istByYear) {
  return planCashflows.map((cf, t) => {
    if (t === 0) return cf;
    return istByYear[t] != null ? istByYear[t] : cf;
  });
}
