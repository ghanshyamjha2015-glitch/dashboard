/* ── Sales Dashboard JS ── */
const CSV_PATH = "data/sales_data.csv";

// ── Colour Palette ──────────────────────────────────────────────────────────
const COLORS = {
  primary:  "#0078d4",
  success:  "#107c10",
  warning:  "#ffb900",
  danger:   "#d13438",
  purple:   "#8764b8",
  teal:     "#038387",
  palette:  [
    "#0078d4","#107c10","#ffb900","#d13438",
    "#8764b8","#038387","#e83e8c","#ff8c00",
    "#00b294","#6366f1"
  ]
};

// ── Helpers ─────────────────────────────────────────────────────────────────
const fmt = {
  currency: v =>
    "$" + Number(v).toLocaleString("en-US", {
      minimumFractionDigits: 0, maximumFractionDigits: 0
    }),
  pct: v => Number(v).toFixed(1) + "%"
};

function parseCSV(text) {
  const lines  = text.trim().split("\n");
  const header = lines[0].split(",");
  return lines.slice(1).filter(line => line.trim() !== "").map(line => {
    const vals = line.split(",");
    const obj  = {};
    header.forEach((h, i) => { obj[h.trim()] = vals[i] ? vals[i].trim() : ""; });
    return obj;
  });
}

function groupBy(data, key) {
  return data.reduce((acc, row) => {
    const k = row[key];
    if (!acc[k]) acc[k] = [];
    acc[k].push(row);
    return acc;
  }, {});
}

function sumField(arr, field) {
  return arr.reduce((s, r) => s + parseFloat(r[field] || 0), 0);
}

// ── Data Loading & Filtering ─────────────────────────────────────────────────
let rawData = [];
let filteredData = [];
let charts    = {};

async function loadData() {
  try {
    const resp = await fetch(CSV_PATH);
    const text = await resp.text();
    rawData = parseCSV(text);
    populateFilters();
    applyFilters();
  } catch (e) {
    console.error("Failed to load CSV:", e);
  }
}

function populateFilters() {
  const regions    = [...new Set(rawData.map(r => r.Region))].sort();
  const categories = [...new Set(rawData.map(r => r.Category))].sort();
  const years      = [...new Set(rawData.map(r => r.Date.split("-")[0]))].sort();

  fillSelect("filterRegion",   regions,    "All Regions");
  fillSelect("filterCategory", categories, "All Categories");
  fillSelect("filterYear",     years,      "All Years");
}

function fillSelect(id, options, allLabel) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = `<option value="">${allLabel}</option>`;
  options.forEach(o => {
    const opt = document.createElement("option");
    opt.value = o; opt.textContent = o;
    el.appendChild(opt);
  });
}

function applyFilters() {
  const region   = document.getElementById("filterRegion")?.value   || "";
  const category = document.getElementById("filterCategory")?.value || "";
  const year     = document.getElementById("filterYear")?.value     || "";

  filteredData = rawData.filter(r => {
    const rowYear = r.Date.split("-")[0];
    return (
      (!region   || r.Region   === region)   &&
      (!category || r.Category === category) &&
      (!year     || rowYear    === year)
    );
  });

  renderDashboard();
}

// ── KPI Cards ────────────────────────────────────────────────────────────────
function renderKPIs() {
  const totalSales   = sumField(filteredData, "Total Sales");
  const totalProfit  = sumField(filteredData, "Profit");
  const totalOrders  = filteredData.length;
  const totalUnits   = sumField(filteredData, "Quantity");
  const avgOrderVal  = totalOrders ? totalSales / totalOrders : 0;
  const profitMargin = totalSales  ? (totalProfit / totalSales) * 100 : 0;

  setKPI("kpiRevenue",    fmt.currency(totalSales));
  setKPI("kpiProfit",     fmt.currency(totalProfit));
  setKPI("kpiOrders",     totalOrders.toLocaleString());
  setKPI("kpiAvgOrder",   fmt.currency(avgOrderVal));

  document.getElementById("kpiProfitMargin") &&
    (document.getElementById("kpiProfitMargin").textContent =
      fmt.pct(profitMargin) + " margin");
}

function setKPI(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── Monthly Sales Trend ───────────────────────────────────────────────────────
function renderMonthlySalesTrend() {
  const months    = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const salesMap  = {}; const profitMap = {};
  months.forEach(m => { salesMap[m] = 0; profitMap[m] = 0; });

  filteredData.forEach(r => {
    const parts = r.Date ? r.Date.split("-") : [];
    if (parts.length < 2) return;
    const mi = parseInt(parts[1], 10) - 1;
    if (mi < 0 || mi > 11) return;
    salesMap [months[mi]] += parseFloat(r["Total Sales"] || 0);
    profitMap[months[mi]] += parseFloat(r["Profit"]      || 0);
  });

  const ctx = document.getElementById("chartMonthlySales");
  if (!ctx) return;

  if (charts.monthly) charts.monthly.destroy();
  charts.monthly = new Chart(ctx, {
    type: "line",
    data: {
      labels: months,
      datasets: [
        {
          label: "Revenue",
          data: months.map(m => salesMap[m]),
          borderColor: COLORS.primary,
          backgroundColor: hexAlpha(COLORS.primary, 0.12),
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: COLORS.primary,
          fill: true,
          tension: 0.4
        },
        {
          label: "Profit",
          data: months.map(m => profitMap[m]),
          borderColor: COLORS.success,
          backgroundColor: hexAlpha(COLORS.success, 0.08),
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: COLORS.success,
          fill: true,
          tension: 0.4
        }
      ]
    },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "top", labels: { boxWidth: 10, font: { size: 12 } } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt.currency(ctx.parsed.y)}` } }
      },
      scales: {
        y: { ticks: { callback: v => fmt.currency(v) }, grid: { color: "#f0f0f0" } },
        x: { grid: { display: false } }
      }
    }
  });
}

// ── Sales by Category (Doughnut) ─────────────────────────────────────────────
function renderCategoryChart() {
  const byCategory = groupBy(filteredData, "Category");
  const labels     = Object.keys(byCategory).sort();
  const values     = labels.map(l => sumField(byCategory[l], "Total Sales"));

  const ctx = document.getElementById("chartCategory");
  if (!ctx) return;

  if (charts.category) charts.category.destroy();
  charts.category = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: COLORS.palette.slice(0, labels.length),
        borderWidth: 2,
        borderColor: "#fff"
      }]
    },
    options: {
      responsive: true,
      cutout: "65%",
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmt.currency(ctx.parsed)}` } }
      }
    }
  });
}

// ── Sales by Region (Bar) ────────────────────────────────────────────────────
function renderRegionChart() {
  const byRegion = groupBy(filteredData, "Region");
  const labels   = Object.keys(byRegion).sort();
  const sales    = labels.map(l => sumField(byRegion[l], "Total Sales"));
  const profits  = labels.map(l => sumField(byRegion[l], "Profit"));

  const ctx = document.getElementById("chartRegion");
  if (!ctx) return;

  if (charts.region) charts.region.destroy();
  charts.region = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Revenue",
          data: sales,
          backgroundColor: hexAlpha(COLORS.primary, 0.8),
          borderRadius: 4
        },
        {
          label: "Profit",
          data: profits,
          backgroundColor: hexAlpha(COLORS.success, 0.8),
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "top", labels: { boxWidth: 10, font: { size: 12 } } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt.currency(ctx.parsed.y)}` } }
      },
      scales: {
        y: { ticks: { callback: v => fmt.currency(v) }, grid: { color: "#f0f0f0" } },
        x: { grid: { display: false } }
      }
    }
  });
}

// ── Top Products (Horizontal Bar) ────────────────────────────────────────────
function renderTopProducts() {
  const byProduct = groupBy(filteredData, "Product");
  const sorted    = Object.entries(byProduct)
    .map(([p, rows]) => ({ name: p, sales: sumField(rows, "Total Sales"), profit: sumField(rows, "Profit") }))
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 8);

  const ctx = document.getElementById("chartTopProducts");
  if (!ctx) return;

  if (charts.products) charts.products.destroy();
  charts.products = new Chart(ctx, {
    type: "bar",
    data: {
      labels: sorted.map(p => p.name),
      datasets: [{
        label: "Revenue",
        data: sorted.map(p => p.sales),
        backgroundColor: COLORS.palette.slice(0, sorted.length),
        borderRadius: 4,
        borderSkipped: false
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` Revenue: ${fmt.currency(ctx.parsed.x)}` } }
      },
      scales: {
        x: { ticks: { callback: v => fmt.currency(v) }, grid: { color: "#f0f0f0" } },
        y: { grid: { display: false } }
      }
    }
  });
}

// ── Profit Margin by Category (Radar) ────────────────────────────────────────
function renderProfitMarginChart() {
  const byCategory = groupBy(filteredData, "Category");
  const labels     = Object.keys(byCategory).sort();
  const margins    = labels.map(l => {
    const s = sumField(byCategory[l], "Total Sales");
    const p = sumField(byCategory[l], "Profit");
    return s ? +((p / s) * 100).toFixed(1) : 0;
  });

  const ctx = document.getElementById("chartProfitMargin");
  if (!ctx) return;

  if (charts.margin) charts.margin.destroy();
  charts.margin = new Chart(ctx, {
    type: "radar",
    data: {
      labels,
      datasets: [{
        label: "Profit Margin %",
        data: margins,
        borderColor: COLORS.purple,
        backgroundColor: hexAlpha(COLORS.purple, 0.15),
        borderWidth: 2,
        pointBackgroundColor: COLORS.purple,
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` Margin: ${fmt.pct(ctx.parsed.r)}` } }
      },
      scales: {
        r: {
          beginAtZero: true,
          ticks: { callback: v => v + "%" },
          grid: { color: "#e8e6e3" },
          angleLines: { color: "#e8e6e3" }
        }
      }
    }
  });
}

// ── Top Customers Table ───────────────────────────────────────────────────────
function renderTopCustomers() {
  const byCustomer = groupBy(filteredData, "Customer");
  const sorted     = Object.entries(byCustomer)
    .map(([c, rows]) => ({
      name:    c,
      orders:  rows.length,
      sales:   sumField(rows, "Total Sales"),
      profit:  sumField(rows, "Profit"),
      region:  rows[0].Region
    }))
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 10);

  const tbody = document.getElementById("customerTableBody");
  if (!tbody) return;

  tbody.innerHTML = sorted.map((c, i) => {
    const margin = c.sales ? (c.profit / c.sales) * 100 : 0;
    const badgeCls = margin >= 25 ? "badge-success" : margin >= 15 ? "badge-warning" : "badge-danger";
    return `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${c.name}</strong></td>
        <td>${c.region}</td>
        <td>${c.orders}</td>
        <td>${fmt.currency(c.sales)}</td>
        <td>${fmt.currency(c.profit)}</td>
        <td><span class="badge ${badgeCls}">${fmt.pct(margin)}</span></td>
      </tr>`;
  }).join("");
}

// ── Category Performance Table ────────────────────────────────────────────────
function renderCategoryPerformance() {
  const byCategory = groupBy(filteredData, "Category");
  const totalSales = sumField(filteredData, "Total Sales");
  const rows       = Object.entries(byCategory)
    .map(([cat, rows]) => ({
      category: cat,
      sales:    sumField(rows, "Total Sales"),
      profit:   sumField(rows, "Profit"),
      units:    sumField(rows, "Quantity"),
      orders:   rows.length
    }))
    .sort((a, b) => b.sales - a.sales);

  const tbody = document.getElementById("categoryTableBody");
  if (!tbody) return;

  tbody.innerHTML = rows.map(r => {
    const pct    = totalSales ? (r.sales / totalSales) * 100 : 0;
    const margin = r.sales ? (r.profit / r.sales) * 100 : 0;
    return `
      <tr>
        <td><strong>${r.category}</strong></td>
        <td>${fmt.currency(r.sales)}</td>
        <td>${fmt.currency(r.profit)}</td>
        <td>${Math.round(r.units).toLocaleString()}</td>
        <td>
          ${fmt.pct(pct)}
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        </td>
        <td>${fmt.pct(margin)}</td>
      </tr>`;
  }).join("");
}

// ── Utilities ────────────────────────────────────────────────────────────────
function hexAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Main Render ───────────────────────────────────────────────────────────────
function renderDashboard() {
  renderKPIs();
  renderMonthlySalesTrend();
  renderCategoryChart();
  renderRegionChart();
  renderTopProducts();
  renderProfitMarginChart();
  renderTopCustomers();
  renderCategoryPerformance();
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  loadData();

  ["filterRegion","filterCategory","filterYear"].forEach(id => {
    document.getElementById(id)?.addEventListener("change", applyFilters);
  });

  document.getElementById("btnExport")?.addEventListener("click", () => {
    if (!filteredData.length) {
      alert("No data to export for the current filter selection.");
      return;
    }
    const headers = Object.keys(filteredData[0]).join(",");
    const csvRows = filteredData.map(r => Object.values(r).join(",")).join("\n");
    const blob    = new Blob([headers + "\n" + csvRows], { type: "text/csv" });
    const url     = URL.createObjectURL(blob);
    const a       = document.createElement("a");
    a.href        = url;
    a.download    = "sales_export.csv";
    a.click();
    URL.revokeObjectURL(url);
  });
});
