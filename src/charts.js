let cumChart, annualChart;

export function renderCharts(r) {
  const labels = r.projectCashflows.map((_, i) => `J${i}`);
  const cumProject = cumulative(r.projectCashflows);
  const cumEquity = cumulative(r.equityCashflows);

  cumChart = upsert(cumChart, 'chart-cumulative', {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Kumuliert Projekt', data: cumProject, borderColor: '#1B2D5E', tension: .2 },
        { label: 'Kumuliert EK', data: cumEquity, borderColor: '#78B51A', tension: .2 }
      ]
    },
    options: baseOptions('Kumulierter Cashflow')
  });

  const reinvestSet = new Set(r.reinvestYears);
  annualChart = upsert(annualChart, 'chart-annual', {
    type: 'bar',
    data: {
      labels: labels.slice(1),
      datasets: [{
        label: 'Jaehrlicher Projekt-Cashflow',
        data: r.projectCashflows.slice(1),
        backgroundColor: r.projectCashflows.slice(1).map((_, i) => reinvestSet.has(i + 1) ? '#c0392b' : '#1B2D5E')
      }]
    },
    options: baseOptions('Jaehrlicher Cashflow, Reinvest rot')
  });
}

function cumulative(arr) {
  let s = 0; return arr.map(v => (s += v));
}

function baseOptions(title) {
  return { responsive: true, plugins: { title: { display: true, text: title }, legend: { display: true } } };
}

function upsert(chart, canvasId, config) {
  if (chart) chart.destroy();
  return new Chart(document.getElementById(canvasId), config);
}
