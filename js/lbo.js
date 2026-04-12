/* ─────────────────────────────────────────────────────────────────────────
   Medanta Hospital – LBO Model  (js/lbo.js)
   ───────────────────────────────────────────────────────────────────────── */

// ── Default Assumptions ─────────────────────────────────────────────────────
const DEFAULTS = {
  // Company – FY2024 actuals (Global Health Ltd / Medanta)
  baseRevenue:      3614,   // ₹ Cr
  baseEBITDAMargin: 23.0,   // %
  existingNetDebt:  295,    // ₹ Cr (to be refinanced at close)

  // Transaction
  entryMultiple:  26.0,     // EV / LTM EBITDA
  txFeesPct:       2.0,     // % of Entry EV (advisory, legal, financing fees)

  // Debt financing
  tlaAmount:  2000,  tlaRate:  8.5,  tlaAmortPct: 10,   // TLA – 10% p.a. amortisation
  tlbAmount:  1500,  tlbRate: 10.0,  tlbAmortPct:  5,   // TLB –  5% p.a. amortisation

  // Operating projections  (Year 1 → 5)
  revGrowth:    [18, 17, 16, 15, 15],
  ebitdaMargin: [24, 25, 26, 27, 27],
  daPct:        [ 5,  5,  5,  5,  5],
  capexPct:     [ 8,  8,  7,  7,  6],
  wcPct:         2,    // ΔWC as % of incremental revenue
  taxRate:      25,    // %

  // Exit
  exitYear:     5,
  exitMultiple: 24.0,
};

let A = deepCopy(DEFAULTS);   // live assumptions (mutated by inputs)

// ── Calculation Engine ───────────────────────────────────────────────────────
function calculateModel(a) {
  // Entry
  const entryEBITDA = a.baseRevenue * a.baseEBITDAMargin / 100;
  const entryEV     = entryEBITDA   * a.entryMultiple;
  const txFees      = entryEV       * a.txFeesPct / 100;
  const totalUses   = entryEV + txFees + a.existingNetDebt;
  const totalDebt   = a.tlaAmount + a.tlbAmount;
  const sponsorEq   = totalUses - totalDebt;
  const leverage    = totalDebt / entryEBITDA;

  // Sources & Uses
  const sourcesUses = {
    uses: [
      { label: 'Equity Purchase Price (EV – Existing Net Debt)', amount: entryEV - a.existingNetDebt },
      { label: 'Refinance Existing Net Debt',                    amount: a.existingNetDebt            },
      { label: 'Transaction Fees & Expenses',                    amount: txFees                       },
    ],
    totalUses,
    sources: [
      { label: `Term Loan A  (${a.tlaRate}% p.a., ${a.tlaAmortPct}% amort/yr)`, amount: a.tlaAmount  },
      { label: `Term Loan B  (${a.tlbRate}% p.a., ${a.tlbAmortPct}% amort/yr)`, amount: a.tlbAmount  },
      { label: 'Sponsor Equity',                                                  amount: sponsorEq    },
    ],
    totalSources: totalUses,
  };

  // Year-by-year operating model + debt schedule
  const proj = [];
  let prevRev   = a.baseRevenue;
  let tlaBalance = a.tlaAmount;
  let tlbBalance = a.tlbAmount;

  for (let y = 1; y <= 5; y++) {
    const rev     = prevRev * (1 + a.revGrowth[y - 1] / 100);
    const ebitda  = rev * a.ebitdaMargin[y - 1] / 100;
    const da      = rev * a.daPct[y - 1] / 100;
    const ebit    = ebitda - da;

    // Interest on opening balances
    const tlaInt  = tlaBalance * a.tlaRate / 100;
    const tlbInt  = tlbBalance * a.tlbRate / 100;
    const totInt  = tlaInt + tlbInt;

    const ebt     = ebit - totInt;
    const tax     = Math.max(0, ebt) * a.taxRate / 100;
    const netInc  = ebt - tax;

    const capex   = rev * a.capexPct[y - 1] / 100;
    const deltaWC = (rev - prevRev) * a.wcPct / 100;

    // Free cash flow (before mandatory amortisation)
    const fcfPreAmort = ebitda - totInt - tax - capex - deltaWC;

    // Mandatory amortisation
    const tlaAmort  = a.tlaAmount * a.tlaAmortPct / 100;
    const tlbAmort  = a.tlbAmount * a.tlbAmortPct / 100;
    const mandAmort = tlaAmort + tlbAmort;

    // Cash available for voluntary sweep
    const availSweep = fcfPreAmort - mandAmort;

    // Record opening balances before this year's repayments
    const tlaOpen = tlaBalance;
    const tlbOpen = tlbBalance;

    // Apply mandatory amortisation
    tlaBalance = Math.max(0, tlaBalance - tlaAmort);
    tlbBalance = Math.max(0, tlbBalance - tlbAmort);

    // Voluntary cash sweep: TLB first (higher cost), then TLA
    let tlbSweep = 0;
    let tlaSweep = 0;
    let rcfDraw  = 0;

    if (availSweep > 0) {
      tlbSweep   = Math.min(tlbBalance, availSweep);
      tlbBalance = Math.max(0, tlbBalance - tlbSweep);
      const rem  = availSweep - tlbSweep;
      tlaSweep   = Math.min(tlaBalance, rem);
      tlaBalance = Math.max(0, tlaBalance - tlaSweep);
    } else if (availSweep < 0) {
      // Cash shortfall → draw on RCF (modelled as increase in TLB)
      rcfDraw    = -availSweep;
      tlbBalance += rcfDraw;
    }

    const totDebtBal = tlaBalance + tlbBalance;

    proj.push({
      year: y,
      revenue: rev,
      revGrowth: a.revGrowth[y - 1],
      ebitda, ebitdaMargin: a.ebitdaMargin[y - 1],
      da, ebit,
      tlaInt, tlbInt, totInt,
      ebt, tax, netInc,
      capex, deltaWC,
      fcfPreAmort, mandAmort, availSweep,
      tlaOpen, tlbOpen,
      tlaAmort, tlbAmort,
      tlbSweep, tlaSweep, rcfDraw,
      tlaBalance, tlbBalance, totDebtBal,
    });

    prevRev = rev;
  }

  // Exit
  const ep       = proj[a.exitYear - 1];
  const exitEV   = ep.ebitda * a.exitMultiple;
  const exitDebt = ep.totDebtBal;
  const exitEq   = exitEV - exitDebt;
  const moic     = exitEq > 0 ? exitEq / sponsorEq : 0;
  const irr      = moic > 0 ? (Math.pow(moic, 1 / a.exitYear) - 1) * 100 : -99;
  const revCAGR  = (Math.pow(ep.revenue / a.baseRevenue, 1 / a.exitYear) - 1) * 100;

  return {
    entryEBITDA, entryEV, txFees, totalUses,
    totalDebt, sponsorEq, leverage,
    sourcesUses, proj,
    exitEBITDA: ep.ebitda,
    exitEV, exitDebt, exitEq, moic, irr, revCAGR,
  };
}

// ── Sensitivity Analysis ─────────────────────────────────────────────────────
function calcSensitivity(a) {
  const entryMs = [22, 24, 26, 28, 30];
  const exitMs  = [20, 22, 24, 26, 28];
  const matrix  = exitMs.map(em =>
    entryMs.map(nm => {
      const r = calculateModel({ ...a, entryMultiple: nm, exitMultiple: em });
      return r.irr;
    })
  );
  return { entryMs, exitMs, matrix };
}

// ── Formatting Helpers ───────────────────────────────────────────────────────
const INR = v =>
  '₹' + Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 0 });

const fmtCr  = v => (v < 0 ? '(' + INR(v) + ')' : INR(v));
const fmtPct = v => v.toFixed(1) + '%';
const fmtX   = v => v.toFixed(2) + 'x';
const fmtIRR = v => (v <= -99 ? 'N/M' : v.toFixed(1) + '%');
const cls    = v => v < 0 ? 'neg' : '';

// ── Render Functions ─────────────────────────────────────────────────────────

function renderKPIs(m) {
  setText('kpiEntryEV',    INR(m.entryEV) + ' Cr');
  setText('kpiDebt',       INR(m.totalDebt) + ' Cr');
  setText('kpiEquity',     INR(m.sponsorEq) + ' Cr');
  setText('kpiLeverage',   fmtX(m.leverage) + ' EBITDA');
  setText('kpiExitIRR',    fmtIRR(m.irr));
  setText('kpiMOIC',       fmtX(m.moic) + ' MOIC');
  setText('kpiExitEV',     INR(m.exitEV) + ' Cr');
  setText('kpiRevCAGR',    fmtPct(m.revCAGR));
}

function renderSourcesUses(su) {
  const tbody = document.getElementById('tbSU');
  if (!tbody) return;
  let html = '';

  // USES
  html += `<tr class="sec-header"><td colspan="3">Uses of Funds</td></tr>`;
  su.uses.forEach(r => {
    html += `<tr>
      <td class="sub-row-td">${r.label}</td>
      <td class="r mono">${INR(r.amount)} Cr</td>
      <td class="r pct-col">${fmtPct(r.amount / su.totalUses * 100)}</td>
    </tr>`;
  });
  html += `<tr class="total-row">
    <td><strong>Total Uses</strong></td>
    <td class="r mono"><strong>${INR(su.totalUses)} Cr</strong></td>
    <td class="r pct-col">100.0%</td>
  </tr>`;

  // SOURCES
  html += `<tr class="sec-header"><td colspan="3">Sources of Funds</td></tr>`;
  su.sources.forEach(r => {
    html += `<tr>
      <td class="sub-row-td">${r.label}</td>
      <td class="r mono">${INR(r.amount)} Cr</td>
      <td class="r pct-col">${fmtPct(r.amount / su.totalSources * 100)}</td>
    </tr>`;
  });
  html += `<tr class="total-row">
    <td><strong>Total Sources</strong></td>
    <td class="r mono"><strong>${INR(su.totalSources)} Cr</strong></td>
    <td class="r pct-col">100.0%</td>
  </tr>`;

  tbody.innerHTML = html;
}

function renderOperatingModel(m) {
  const tbody = document.getElementById('tbOpModel');
  if (!tbody) return;

  const yr = ['FY2024A', ...m.proj.map(p => `FY${2024 + p.year}E`)];
  const yrCls = ['yr0', '', '', '', '', ''];

  const baseRev = A.baseRevenue;
  const basEBITDA = m.entryEBITDA;

  // Helper: build a row
  const row = (cls, label, vals) =>
    `<tr class="${cls}"><td>${label}</td>${vals.map((v, i) =>
      `<td class="${yrCls[i]}">${v}</td>`).join('')}</tr>`;

  const revenues  = [baseRev,    ...m.proj.map(p => p.revenue)];
  const ebitdas   = [basEBITDA,  ...m.proj.map(p => p.ebitda)];
  const ebitdaMs  = [A.baseEBITDAMargin, ...m.proj.map(p => p.ebitdaMargin)];
  const das       = [null, ...m.proj.map(p => p.da)];
  const ebits     = [null, ...m.proj.map(p => p.ebit)];
  const ints      = [null, ...m.proj.map(p => p.totInt)];
  const ebts      = [null, ...m.proj.map(p => p.ebt)];
  const taxes     = [null, ...m.proj.map(p => p.tax)];
  const netIncs   = [null, ...m.proj.map(p => p.netInc)];
  const capexes   = [null, ...m.proj.map(p => p.capex)];
  const wcs       = [null, ...m.proj.map(p => p.deltaWC)];
  const fcfs      = [null, ...m.proj.map(p => p.fcfPreAmort)];

  const dashOrFmt = (v, fn) => v === null ? '<span class="muted">–</span>' : fn(v);

  let html = '';
  html += row('sec-row', 'INCOME STATEMENT', yr);
  html += row('sub-row', 'Revenue (₹ Cr)',
    revenues.map(v => `<strong>${fmtCr(v)}</strong>`));
  html += row('indent-row muted-row', 'Revenue Growth %',
    [0, ...m.proj.map(p => p.revGrowth)].map((v, i) =>
      i === 0 ? '<span class="muted">–</span>' : fmtPct(v)));
  html += row('sub-row', 'EBITDA (₹ Cr)',
    ebitdas.map(v => `<strong>${fmtCr(v)}</strong>`));
  html += row('indent-row', 'EBITDA Margin %',
    ebitdaMs.map(v => `<span class="${v >= 25 ? 'pos' : ''}">${fmtPct(v)}</span>`));
  html += row('indent-row', 'Depreciation & Amortisation',
    das.map(v => dashOrFmt(v, v => `(${INR(v)} Cr)`)));
  html += row('sub-row', 'EBIT (₹ Cr)',
    ebits.map(v => dashOrFmt(v, v => fmtCr(v))));
  html += row('indent-row', 'Interest Expense',
    ints.map(v => dashOrFmt(v, v => `<span class="neg">(${INR(v)} Cr)</span>`)));
  html += row('sub-row highlight-row', 'Earnings Before Tax',
    ebts.map(v => dashOrFmt(v, v => `<strong>${fmtCr(v)}</strong>`)));
  html += row('indent-row', 'Tax  (@ ' + A.taxRate + '%)',
    taxes.map(v => dashOrFmt(v, v => `<span class="neg">(${INR(v)} Cr)</span>`)));
  html += row('total-row', 'Net Income (₹ Cr)',
    netIncs.map(v => dashOrFmt(v, v => `<strong class="${cls(v)}">${fmtCr(v)}</strong>`)));

  html += row('sec-row', 'CASH FLOW BRIDGE', yr);
  html += row('sub-row', 'EBITDA (₹ Cr)',
    ebitdas.map(v => fmtCr(v)));
  html += row('indent-row', 'Less: Interest Expense',
    ints.map(v => dashOrFmt(v, v => `(${INR(v)} Cr)`)));
  html += row('indent-row', 'Less: Cash Taxes',
    taxes.map(v => dashOrFmt(v, v => `(${INR(v)} Cr)`)));
  html += row('indent-row', 'Less: Capital Expenditure',
    capexes.map(v => dashOrFmt(v, v => `(${INR(v)} Cr)`)));
  html += row('indent-row', 'Less: Change in Working Capital',
    wcs.map(v => dashOrFmt(v, v => `(${INR(v)} Cr)`)));
  html += row('total-row', 'Free Cash Flow (pre-amort) ₹ Cr',
    fcfs.map(v => dashOrFmt(v, v =>
      `<strong class="${cls(v)}">${fmtCr(v)}</strong>`)));

  // Capex % and Effective tax rate lines
  html += row('indent-row muted-row', 'Capex as % of Revenue',
    [null, ...m.proj.map(p => p.capex / p.revenue * 100)].map(v =>
      dashOrFmt(v, v => fmtPct(v))));

  tbody.innerHTML = html;
}

function renderDebtSchedule(m) {
  const tbody = document.getElementById('tbDebt');
  if (!tbody) return;

  const yr = ['FY2024A', ...m.proj.map(p => `FY${2024 + p.year}E`)];
  const yrCls = ['yr0', '', '', '', '', ''];

  const row = (cls, label, vals) =>
    `<tr class="${cls}"><td>${label}</td>${vals.map((v, i) =>
      `<td class="${yrCls[i]}">${v}</td>`).join('')}</tr>`;

  const tlaOpen  = [A.tlaAmount, ...m.proj.map(p => p.tlaOpen)];
  const tlaAmort = [null, ...m.proj.map(p => p.tlaAmort)];
  const tlaSweep = [null, ...m.proj.map(p => p.tlaSweep)];
  const tlaClos  = [A.tlaAmount, ...m.proj.map(p => p.tlaBalance)];
  const tlbOpen  = [A.tlbAmount, ...m.proj.map(p => p.tlbOpen)];
  const tlbAmort = [null, ...m.proj.map(p => p.tlbAmort)];
  const tlbSweep = [null, ...m.proj.map(p => p.tlbSweep)];
  const tlbRCF   = [null, ...m.proj.map(p => p.rcfDraw)];
  const tlbClos  = [A.tlbAmount, ...m.proj.map(p => p.tlbBalance)];
  const totDebt  = [A.tlaAmount + A.tlbAmount, ...m.proj.map(p => p.totDebtBal)];

  const dashOrFmt = (v, fn) => v === null ? '<span class="muted">–</span>' : fn(v);
  const zeroBlank = v => v === null ? '<span class="muted">–</span>'
                       : v === 0   ? '<span class="muted">—</span>' : fmtCr(v);

  let html = '';
  // TLA
  html += row('sec-row', 'TERM LOAN A', yr);
  html += row('sub-row', 'Opening Balance', tlaOpen.map(v => `${fmtCr(v)} Cr`));
  html += row('indent-row', 'Mandatory Amortisation', tlaAmort.map(v => dashOrFmt(v, v => `(${INR(v)} Cr)`)));
  html += row('indent-row', 'Voluntary Cash Sweep', tlaSweep.map(v => dashOrFmt(v, v => zeroBlank(v === 0 ? 0 : v))));
  html += row('sub-row', 'Closing Balance', tlaClos.map(v => `<strong>${fmtCr(v)} Cr</strong>`));

  // TLB
  html += row('sec-row', 'TERM LOAN B', yr);
  html += row('sub-row', 'Opening Balance', tlbOpen.map(v => `${fmtCr(v)} Cr`));
  html += row('indent-row', 'Mandatory Amortisation', tlbAmort.map(v => dashOrFmt(v, v => `(${INR(v)} Cr)`)));
  html += row('indent-row', 'Voluntary Cash Sweep', tlbSweep.map(v => dashOrFmt(v, v => zeroBlank(v === 0 ? 0 : v))));
  html += row('indent-row', 'RCF Draw (cash shortfall)', tlbRCF.map(v => dashOrFmt(v, v => v === 0 ? '<span class="muted">—</span>' : `<span class="neg">${fmtCr(v)} Cr</span>`)));
  html += row('sub-row', 'Closing Balance', tlbClos.map(v => `<strong>${fmtCr(v)} Cr</strong>`));

  // Totals
  html += row('total-row', 'Total Net Debt (₹ Cr)',
    totDebt.map(v => `<strong>${fmtCr(v)} Cr</strong>`));
  html += row('indent-row', 'Leverage  (Net Debt / EBITDA)',
    [m.totalDebt / m.entryEBITDA, ...m.proj.map(p => p.totDebtBal / p.ebitda)].map(v => fmtX(v)));

  tbody.innerHTML = html;
}

function renderReturns(m) {
  setText('retExitEV',          INR(m.exitEV) + ' Cr');
  setText('retExitDebt',        INR(m.exitDebt) + ' Cr');
  setText('retExitEq',          INR(m.exitEq) + ' Cr');
  setText('retMOIC',            fmtX(m.moic));
  setText('retIRR',             fmtIRR(m.irr));
  setText('retEntryEq',         INR(m.sponsorEq) + ' Cr');
  setText('retRevCAGR',         fmtPct(m.revCAGR));
  setText('retExitYearVal',     'Year ' + A.exitYear);
  setText('retExitMultipleVal', fmtX(A.exitMultiple));

  const exitProj = m.proj[A.exitYear - 1];
  setText('retExitMargin', fmtPct(exitProj.ebitdaMargin));

  // Mirror values to returns cards
  setText('kpiExitIRR2', fmtIRR(m.irr));
  setText('kpiMOIC2',    fmtX(m.moic));
  setText('kpiExitEV2',  INR(m.exitEV) + ' Cr');
  setText('kpiRevCAGR2', fmtPct(m.revCAGR));
}

function renderSensitivity(m) {
  const wrap = document.getElementById('sensTbl');
  if (!wrap) return;
  const { entryMs, exitMs, matrix } = calcSensitivity(A);

  let html = '<table class="sens-table"><thead><tr>';
  html += `<th class="corner-th">Exit EV/EBITDA ↓ &nbsp; Entry →</th>`;
  entryMs.forEach(em => { html += `<th>${em}x Entry</th>`; });
  html += '</tr></thead><tbody>';

  matrix.forEach((row, ri) => {
    html += `<tr><td class="row-label">${exitMs[ri]}x Exit</td>`;
    row.forEach((irr, ci) => {
      const isBase = Math.abs(entryMs[ci] - A.entryMultiple) < 0.5 &&
                     Math.abs(exitMs[ri]  - A.exitMultiple)  < 0.5;
      const irrCls = irr > 25 ? 'irr-ex'
                   : irr > 20 ? 'irr-hi'
                   : irr > 15 ? 'irr-ok'
                   : irr > 10 ? 'irr-fair'
                   :            'irr-low';
      html += `<td class="${irrCls}${isBase ? ' irr-base-cell' : ''}">${fmtIRR(irr)}</td>`;
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  wrap.innerHTML = html;
}

// ── Chart Instances ──────────────────────────────────────────────────────────
let chartRevEBITDA = null;
let chartDebtPaydown = null;
let chartFCF = null;

function renderCharts(m) {
  renderRevEBITDAChart(m);
  renderDebtPaydownChart(m);
  renderFCFChart(m);
}

function renderRevEBITDAChart(m) {
  const ctx = document.getElementById('chartRevEBITDA');
  if (!ctx) return;
  const labels   = ['FY24A', ...m.proj.map(p => `FY${2024 + p.year}E`)];
  const revenues = [A.baseRevenue,    ...m.proj.map(p => p.revenue)];
  const ebitdas  = [m.entryEBITDA,   ...m.proj.map(p => p.ebitda)];

  if (chartRevEBITDA) chartRevEBITDA.destroy();
  chartRevEBITDA = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Revenue (₹ Cr)',
          data: revenues,
          backgroundColor: 'rgba(37,99,235,0.75)',
          borderRadius: 4,
          order: 2,
        },
        {
          label: 'EBITDA (₹ Cr)',
          data: ebitdas,
          backgroundColor: 'rgba(5,150,105,0.75)',
          borderRadius: 4,
          order: 2,
        },
        {
          label: 'EBITDA Margin %',
          data: [A.baseEBITDAMargin, ...m.proj.map(p => p.ebitdaMargin)],
          type: 'line',
          borderColor: '#ea580c',
          backgroundColor: 'rgba(234,88,12,0.1)',
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: '#ea580c',
          yAxisID: 'yPct',
          fill: false,
          tension: 0.3,
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 10, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: c => c.dataset.yAxisID === 'yPct'
              ? ` Margin: ${c.parsed.y.toFixed(1)}%`
              : ` ${c.dataset.label}: ₹${c.parsed.y.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr`,
          },
        },
      },
      scales: {
        y:    { ticks: { callback: v => '₹' + (v / 1000).toFixed(1) + 'k Cr' }, grid: { color: '#f0f0f0' } },
        yPct: { position: 'right', ticks: { callback: v => v + '%' }, grid: { display: false }, min: 0, max: 40 },
        x:    { grid: { display: false } },
      },
    },
  });
}

function renderDebtPaydownChart(m) {
  const ctx = document.getElementById('chartDebtPaydown');
  if (!ctx) return;
  const labels = ['Entry', ...m.proj.map(p => `Y${p.year}`)];
  const tlas   = [A.tlaAmount, ...m.proj.map(p => p.tlaBalance)];
  const tlbs   = [A.tlbAmount, ...m.proj.map(p => p.tlbBalance)];

  if (chartDebtPaydown) chartDebtPaydown.destroy();
  chartDebtPaydown = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'TLA Balance', data: tlas, backgroundColor: 'rgba(30,58,95,0.8)',   borderRadius: [0, 0, 4, 4], stack: 'debt' },
        { label: 'TLB Balance', data: tlbs, backgroundColor: 'rgba(124,58,237,0.75)', borderRadius: [4, 4, 0, 0], stack: 'debt' },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 10, font: { size: 11 } } },
        tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ₹${c.parsed.y.toLocaleString('en-IN')} Cr` } },
      },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: { stacked: true, ticks: { callback: v => '₹' + v + ' Cr' }, grid: { color: '#f0f0f0' } },
      },
    },
  });
}

function renderFCFChart(m) {
  const ctx = document.getElementById('chartFCF');
  if (!ctx) return;
  const labels = m.proj.map(p => `FY${2024 + p.year}E`);
  const fcfs   = m.proj.map(p => p.fcfPreAmort);
  const amorts = m.proj.map(p => p.mandAmort);

  if (chartFCF) chartFCF.destroy();
  chartFCF = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'FCF (pre-amort) ₹ Cr',
          data: fcfs,
          backgroundColor: fcfs.map(v => v >= 0 ? 'rgba(5,150,105,0.75)' : 'rgba(220,38,38,0.75)'),
          borderRadius: 4,
        },
        {
          label: 'Mandatory Debt Amortisation',
          data: amorts,
          type: 'line',
          borderColor: '#dc2626',
          backgroundColor: 'transparent',
          borderDash: [5, 3],
          borderWidth: 2,
          pointRadius: 4,
          pointBackgroundColor: '#dc2626',
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 10, font: { size: 11 } } },
        tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ₹${c.parsed.y.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr` } },
      },
      scales: {
        y: { ticks: { callback: v => '₹' + v + ' Cr' }, grid: { color: '#f0f0f0' } },
        x: { grid: { display: false } },
      },
    },
  });
}

// ── Master Render ────────────────────────────────────────────────────────────
function renderAll() {
  const m = calculateModel(A);
  renderKPIs(m);
  renderSourcesUses(m.sourcesUses);
  renderOperatingModel(m);
  renderDebtSchedule(m);
  renderReturns(m);
  renderSensitivity(m);
  renderCharts(m);
}

// ── DOM Helpers ──────────────────────────────────────────────────────────────
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function deepCopy(o) { return JSON.parse(JSON.stringify(o)); }

// ── Input Binding ────────────────────────────────────────────────────────────
function bindInputs() {
  // Scalar inputs
  const scalar = [
    ['inpBaseRevenue',      'baseRevenue',      parseFloat],
    ['inpBaseMargin',       'baseEBITDAMargin',  parseFloat],
    ['inpExistingDebt',     'existingNetDebt',   parseFloat],
    ['inpEntryMultiple',    'entryMultiple',      parseFloat],
    ['inpTxFees',           'txFeesPct',          parseFloat],
    ['inpTLAAmount',        'tlaAmount',          parseFloat],
    ['inpTLARate',          'tlaRate',            parseFloat],
    ['inpTLAAmort',         'tlaAmortPct',        parseFloat],
    ['inpTLBAmount',        'tlbAmount',          parseFloat],
    ['inpTLBRate',          'tlbRate',            parseFloat],
    ['inpTLBAmort',         'tlbAmortPct',        parseFloat],
    ['inpWCPct',            'wcPct',              parseFloat],
    ['inpTaxRate',          'taxRate',            parseFloat],
    ['inpExitYear',         'exitYear',            parseInt],
    ['inpExitMultiple',     'exitMultiple',       parseFloat],
  ];

  scalar.forEach(([id, key, parse]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      const v = parse(el.value);
      if (!isNaN(v)) { A[key] = v; renderAll(); }
    });
  });

  // Vector inputs (5-year arrays)
  const vectors = [
    ['revGrowth',    'inpRevGrowth'],
    ['ebitdaMargin', 'inpEBITDA'],
    ['daPct',        'inpDA'],
    ['capexPct',     'inpCapex'],
  ];

  vectors.forEach(([key, prefix]) => {
    for (let i = 0; i < 5; i++) {
      const el = document.getElementById(`${prefix}${i}`);
      if (!el) continue;
      const idx = i;
      el.addEventListener('input', () => {
        const v = parseFloat(el.value);
        if (!isNaN(v)) { A[key][idx] = v; renderAll(); }
      });
    }
  });

  // Reset button
  document.getElementById('btnReset')?.addEventListener('click', () => {
    A = deepCopy(DEFAULTS);
    populateInputs();
    renderAll();
  });
}

function populateInputs() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  set('inpBaseRevenue',   A.baseRevenue);
  set('inpBaseMargin',    A.baseEBITDAMargin);
  set('inpExistingDebt',  A.existingNetDebt);
  set('inpEntryMultiple', A.entryMultiple);
  set('inpTxFees',        A.txFeesPct);
  set('inpTLAAmount',     A.tlaAmount);
  set('inpTLARate',       A.tlaRate);
  set('inpTLAAmort',      A.tlaAmortPct);
  set('inpTLBAmount',     A.tlbAmount);
  set('inpTLBRate',       A.tlbRate);
  set('inpTLBAmort',      A.tlbAmortPct);
  set('inpWCPct',         A.wcPct);
  set('inpTaxRate',       A.taxRate);
  set('inpExitYear',      A.exitYear);
  set('inpExitMultiple',  A.exitMultiple);

  [['inpRevGrowth', 'revGrowth'], ['inpEBITDA', 'ebitdaMargin'],
   ['inpDA', 'daPct'], ['inpCapex', 'capexPct']].forEach(([prefix, key]) => {
    A[key].forEach((v, i) => set(`${prefix}${i}`, v));
  });
}

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  populateInputs();
  bindInputs();
  renderAll();
});
