let cumChart, annualChart;

const fmtEurShort = v => {
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.', ',') + ' Mio €';
  if (a >= 1e3) return Math.round(v / 1e3) + 'k €';
  return Math.round(v) + ' €';
};
const fmtEurFull = v => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0);

function theme() {
  const cs = getComputedStyle(document.documentElement);
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    dark,
    ink: cs.getPropertyValue('--ink').trim() || '#141C32',
    muted: cs.getPropertyValue('--muted').trim() || '#6B768F',
    grid: dark ? 'rgba(255,255,255,.07)' : 'rgba(20,28,50,.07)',
    surface: cs.getPropertyValue('--surface').trim() || '#fff',
    projectLine: dark ? '#6f8fff' : '#1B2D5E',
    limeLine: dark ? '#95D426' : '#78B51A',
    bad: '#E5484D'
  };
}

function fade(ctx, area, hex, top = 0.32, bottom = 0.0) {
  if (!area) return 'transparent';
  const g = ctx.createLinearGradient(0, area.top, 0, area.bottom);
  g.addColorStop(0, hexA(hex, top));
  g.addColorStop(1, hexA(hex, bottom));
  return g;
}
function hexA(hex, a) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export function renderCharts(r) {
  const t = theme();
  const labels = r.projectCashflows.map((_, i) => `J${i}`);
  const cumProject = cumulative(r.projectCashflows);
  const cumEquity = cumulative(r.equityCashflows);

  Chart.defaults.font.family = "'Space Grotesk', system-ui, sans-serif";
  Chart.defaults.color = t.muted;

  cumChart = upsert(cumChart, 'chart-cumulative', {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Projekt', data: cumProject,
          borderColor: t.projectLine, borderWidth: 2.5,
          tension: .35, fill: true, pointRadius: 0, pointHoverRadius: 5,
          pointHoverBackgroundColor: t.projectLine, pointHoverBorderColor: t.surface, pointHoverBorderWidth: 2,
          backgroundColor: c => fade(c.chart.ctx, c.chart.chartArea, t.projectLine, .28)
        },
        {
          label: 'Eigenkapital', data: cumEquity,
          borderColor: t.limeLine, borderWidth: 2.5,
          tension: .35, fill: true, pointRadius: 0, pointHoverRadius: 5,
          pointHoverBackgroundColor: t.limeLine, pointHoverBorderColor: t.surface, pointHoverBorderWidth: 2,
          backgroundColor: c => fade(c.chart.ctx, c.chart.chartArea, t.limeLine, .22)
        }
      ]
    },
    options: baseOptions(t)
  });

  const reinvestSet = new Set(r.reinvestYears);
  annualChart = upsert(annualChart, 'chart-annual', {
    type: 'bar',
    data: {
      labels: labels.slice(1),
      datasets: [{
        label: 'Cashflow',
        data: r.projectCashflows.slice(1),
        borderRadius: 5,
        maxBarThickness: 38,
        backgroundColor: ctx => {
          const i = ctx.dataIndex;
          const isReinvest = reinvestSet.has(i + 1);
          const val = ctx.raw;
          const area = ctx.chart.chartArea;
          if (isReinvest) return fade(ctx.chart.ctx, area, t.bad, .95, .55) || t.bad;
          if (val < 0) return fade(ctx.chart.ctx, area, t.bad, .8, .45) || t.bad;
          return fade(ctx.chart.ctx, area, t.projectLine, .95, .55) || t.projectLine;
        }
      }]
    },
    options: baseOptions(t)
  });
}

function cumulative(arr) {
  let s = 0; return arr.map(v => (s += v));
}

function baseOptions(t) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: t.dark ? '#0B1226' : '#141C32',
        titleColor: '#fff',
        bodyColor: '#D7DEEE',
        borderColor: 'rgba(120,181,26,.4)',
        borderWidth: 1,
        padding: 11,
        cornerRadius: 10,
        displayColors: true,
        boxPadding: 4,
        usePointStyle: true,
        callbacks: {
          title: items => 'Jahr ' + items[0].label.replace('J', ''),
          label: c => `${c.dataset.label}: ${fmtEurFull(c.parsed.y)}`
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        border: { color: t.grid },
        ticks: { color: t.muted, font: { size: 11 } }
      },
      y: {
        grid: { color: t.grid, drawTicks: false },
        border: { display: false },
        ticks: { color: t.muted, font: { size: 11 }, padding: 8, callback: v => fmtEurShort(v) }
      }
    }
  };
}

function upsert(chart, canvasId, config) {
  if (chart) chart.destroy();
  return new Chart(document.getElementById(canvasId), config);
}
