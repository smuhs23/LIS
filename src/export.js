export function exportXlsx(input, bundle, scenario) {
  const wb = XLSX.utils.book_new();

  const inputRows = [
    ['Feld', 'Wert'],
    ['Laufzeit (Jahre)', input.term],
    ['Kalkulationszins (Prozent)', input.discountRatePct],
    ['Grundstueck', input.land.mode],
    ['Finanzierung', input.financing.mode],
    ['Puffer (Prozent)', input.pufferPct]
  ];
  input.capex.forEach(p => inputRows.push([`CAPEX ${p.label}`, p.amount]));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(inputRows), 'Eingaben');

  for (const land of ['gestellt', 'gepachtet']) {
    for (const fin of ['ek', 'ekfk']) {
      const r = bundle[land][fin][scenario];
      const rows = [
        ['Kennzahl', 'Wert'],
        ['Gesamt-CAPEX', r.capexTotal],
        ['Eingesetztes EK', r.equityInvested],
        ['Projekt-IZF', r.projectIRR],
        ['EK-IZF', r.equityIRR],
        ['Payback Projekt (Monate)', r.projectPaybackMonths],
        ['Payback EK (Monate)', r.equityPaybackMonths],
        ['NPV', r.npv],
        ['Reinvest gesamt', r.reinvestTotal],
        [],
        ['Jahr', 'Projekt-CF', 'EK-CF']
      ];
      r.projectCashflows.forEach((cf, t) => rows.push([t, cf, r.equityCashflows[t]]));
      const sheetName = `${land}_${fin}`.slice(0, 31);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName);
    }
  }

  XLSX.writeFile(wb, 'ladepark-kalkulation.xlsx');
}

export function exportPdf() {
  window.print();
}
