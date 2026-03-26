const state = { data: null, editingId: null };

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const money = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v || 0);
const money2 = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(v || 0);
const pct = (v, digits = 1) => `${(v || 0).toFixed(digits)}%`;
const themeKey = "atlas-theme";

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(themeKey, theme);
}

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("pt-BR");
}

function apiJson(url, options = {}) {
  return fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  }).then(async (res) => {
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(payload.detail || payload.message || "Erro na requisição");
    }
    return res.json();
  });
}

function clear(el) {
  el.innerHTML = "";
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "className") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("data-")) node.setAttribute(k, v);
    else if (v !== undefined && v !== null) node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined) continue;
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

function svgNode(width, height, viewBox = `0 0 ${width} ${height}`) {
  return document.createElementNS("http://www.w3.org/2000/svg", "svg", { width, height, viewBox });
}

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  return node;
}

function renderKpis(data) {
  const root = $("#kpis");
  clear(root);
  const cards = [
    ["Patrimônio total", money(data.summary.total)],
    ["Posições", data.summary.holdings_count.toLocaleString("pt-BR")],
    ["Classes / emissores", `${data.summary.class_count} / ${data.summary.issuer_count}`],
    ["Score", `${data.summary.score}`],
  ];
  cards.forEach(([label, value]) => {
    root.appendChild(
      el("article", { className: "kpi" }, [
        el("span", {}, [label]),
        el("strong", {}, [value]),
        el("div", { className: "delta" }, [label === "Score" ? "Quanto mais alto, melhor o equilíbrio" : "Visão consolidada da base atual"]),
      ])
    );
  });
  $("#scoreValue").textContent = `${data.summary.score}/100`;
  $("#generatedAt").textContent = formatDateTime(data.generated_at);
}

function donutChart(container, items, colors) {
  clear(container);
  if (!items.length) {
    container.textContent = "Sem dados suficientes.";
    return;
  }
  const total = items.reduce((acc, i) => acc + (i.value || 0), 0) || 1;
  const size = 280;
  const cx = 140;
  const cy = 125;
  const r = 82;
  const c = 2 * Math.PI * r;
  const svg = svgEl("svg", { viewBox: `0 0 ${size} 240` });
  const circleBg = svgEl("circle", { cx, cy, r, fill: "none", stroke: "rgba(255,255,255,0.08)", "stroke-width": 28 });
  svg.appendChild(circleBg);
  let dashOffset = 0;
  items.forEach((item, idx) => {
    const share = item.value / total;
    const seg = svgEl("circle", {
      cx,
      cy,
      r,
      fill: "none",
      stroke: colors[idx % colors.length],
      "stroke-width": 28,
      "stroke-linecap": "round",
      "stroke-dasharray": `${share * c} ${c}`,
      "stroke-dashoffset": `${-dashOffset}`,
      transform: `rotate(-90 ${cx} ${cy})`,
    });
    dashOffset += share * c;
    svg.appendChild(seg);
  });
  const t1 = svgEl("text", { x: 140, y: 121, "text-anchor": "middle", class: "donut-value", fill: "var(--text)", "font-size": "22", "font-weight": "700" });
  t1.textContent = money(total);
  svg.appendChild(t1);
  const t2 = svgEl("text", { x: 140, y: 145, "text-anchor": "middle", fill: "var(--muted)", "font-size": "12" });
  t2.textContent = "Total";
  svg.appendChild(t2);
  const legend = el("div", { className: "svg-legend" });
  items.forEach((item, idx) => {
    legend.appendChild(
      el("span", {}, [
        el("span", { className: "dot", style: `background:${colors[idx % colors.length]}` }),
        `${item.label} ${pct(item.share * 100, 1)}`
      ])
    );
  });
  container.appendChild(svg);
  container.appendChild(legend);
}

function barChart(container, items, colors, compact = false) {
  clear(container);
  if (!items.length) {
    container.textContent = "Sem dados suficientes.";
    return;
  }
  const total = items.reduce((acc, i) => acc + i.value, 0) || 1;
  const width = 720;
  const height = compact ? 240 : 280;
  const margin = { top: 16, right: 24, bottom: 56, left: 28 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const max = Math.max(...items.map((d) => d.value)) || 1;
  const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}` });
  items.slice(0, 8).forEach((item, idx) => {
    const barH = (item.value / max) * innerH;
    const barW = innerW / Math.min(items.length, 8) - 14;
    const x = margin.left + idx * (barW + 14);
    const y = margin.top + (innerH - barH);
    svg.appendChild(
      svgEl("rect", {
        x,
        y,
        width: barW,
        height: barH,
        rx: 16,
        fill: colors[idx % colors.length],
        opacity: "0.92",
      })
    );
    svg.appendChild(
      svgEl("text", {
        x: x + barW / 2,
        y: height - 32,
        "text-anchor": "middle",
        fill: "var(--muted)",
        "font-size": "11",
      })
    );
    svg.lastChild.textContent = item.label.length > 12 ? `${item.label.slice(0, 12)}...` : item.label;
    svg.appendChild(
      svgEl("text", {
        x: x + barW / 2,
        y: y - 8,
        "text-anchor": "middle",
        fill: "var(--text)",
        "font-size": "11",
        "font-weight": "600",
      })
    );
    svg.lastChild.textContent = pct((item.value / total) * 100, 1);
  });
  container.appendChild(svg);
}

function lineChart(container, series, keys, colors, compact = false) {
  clear(container);
  if (!series.length) {
    container.textContent = "Sem dados suficientes.";
    return;
  }
  const width = 720;
  const height = compact ? 240 : 280;
  const margin = { top: 20, right: 24, bottom: 34, left: 36 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const allValues = series.flatMap((row) => keys.map((k) => row[k]));
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const yScale = (value) => margin.top + innerH - ((value - min) / (max - min || 1)) * innerH;
  const xScale = (index) => margin.left + (index / Math.max(1, series.length - 1)) * innerW;
  const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}` });

  for (let i = 0; i <= 4; i++) {
    const y = margin.top + (innerH / 4) * i;
    svg.appendChild(svgEl("line", { x1: margin.left, y1: y, x2: width - margin.right, y2: y, stroke: "rgba(255,255,255,0.08)" }));
  }

  keys.forEach((key, keyIdx) => {
    let d = "";
    series.forEach((row, idx) => {
      const x = xScale(idx);
      const y = yScale(row[key]);
      d += `${idx === 0 ? "M" : "L"}${x},${y} `;
    });
    svg.appendChild(
      svgEl("path", {
        d,
        fill: "none",
        stroke: colors[keyIdx % colors.length],
        "stroke-width": 3,
        "stroke-linejoin": "round",
        "stroke-linecap": "round",
      })
    );
    series.forEach((row, idx) => {
      const x = xScale(idx);
      const y = yScale(row[key]);
      svg.appendChild(svgEl("circle", { cx: x, cy: y, r: 4, fill: colors[keyIdx % colors.length] }));
    });
  });

  series.forEach((row, idx) => {
    const x = xScale(idx);
    svg.appendChild(
      svgEl("text", {
        x,
        y: height - 12,
        "text-anchor": "middle",
        fill: "var(--muted)",
        "font-size": "11",
      })
    );
    svg.lastChild.textContent = row.label;
  });

  container.appendChild(svg);
  const legend = el("div", { className: "svg-legend" });
  keys.forEach((key, idx) => legend.appendChild(el("span", {}, [el("span", { className: "dot", style: `background:${colors[idx % colors.length]}` }), key])));
  container.appendChild(legend);
}

function renderHeatmap(container, data) {
  clear(container);
  if (!data.labels?.length) {
    container.textContent = "Sem dados suficientes.";
    return;
  }
  const wrap = el("div", { className: "heatmap" });
  const header = el("div", { className: "heatmap-row" }, [el("div"), ...data.labels.map((l) => el("div", { className: "muted", style: "text-align:center;font-size:.78rem" }, [l]))]);
  wrap.appendChild(header);
  data.matrix.forEach((row, idx) => {
    const line = el("div", { className: "heatmap-row" });
    line.appendChild(el("div", { className: "muted", style: "font-size:.82rem" }, [data.labels[idx]]));
    row.forEach((value) => {
      const bg = `rgba(40, 215, 164, ${Math.max(0.08, Math.min(0.85, (value - 0.1) / 0.9))})`;
      const fg = value > 0.55 ? "#08131f" : "var(--text)";
      line.appendChild(el("div", { className: "heatmap-cell", style: `background:${bg};color:${fg}` }, [value.toFixed(2)]));
    });
    wrap.appendChild(line);
  });
  container.appendChild(wrap);
}

function renderAlerts(items) {
  const root = $("#alerts");
  clear(root);
  items.forEach((item) => {
    root.appendChild(
      el("div", { className: "alert", "data-severity": item.severity }, [
        el("strong", {}, [item.title]),
        el("div", { className: "muted" }, [item.detail]),
      ])
    );
  });
}

function renderInsights(items) {
  const root = $("#insights");
  clear(root);
  items.forEach((item) => {
    root.appendChild(el("div", { className: "insight" }, [item]));
  });
}

function renderHoldings(items) {
  const tbody = $("#holdingsTable tbody");
  clear(tbody);
  items.forEach((row) => {
    const tr = el("tr", { "data-id": row.id });
    tr.appendChild(el("td", {}, [row.asset_class || "-"]));
    tr.appendChild(el("td", {}, [row.institution || "-"]));
    tr.appendChild(el("td", {}, [row.ticker || row.name || row.issuer || "-"]));
    tr.appendChild(el("td", {}, [row.indexer || "-"]));
    tr.appendChild(el("td", {}, [row.maturity || "-"]));
    tr.appendChild(el("td", {}, [row.liquidity_days ? `D+${row.liquidity_days}` : "-"]));
    tr.appendChild(el("td", {}, [row.current_value ? money2(row.current_value) : "-"]));
    tr.addEventListener("click", () => openDrawer(row));
    tbody.appendChild(tr);
  });
}

function openDrawer(row = null) {
  state.editingId = row?.id || null;
  $("#drawer").classList.add("open");
  const form = $("#manualForm");
  form.reset();
  if (row) {
    const map = {
      asset_class: row.asset_class,
      institution: row.institution,
      issuer: row.issuer,
      ticker: row.ticker,
      name: row.name,
      indexer: row.indexer,
      rate: row.rate,
      maturity: row.maturity,
      current_value: row.current_value,
      liquidity_days: row.liquidity_days,
      acquisition_date: row.acquisition_date,
      cost_value: row.cost_value,
    };
    Object.entries(map).forEach(([k, v]) => {
      const input = form.elements.namedItem(k);
      if (input) input.value = v ?? "";
    });
    $("#deleteRecord").style.display = "inline-flex";
  } else {
    $("#deleteRecord").style.display = "none";
  }
}

function closeDrawer() {
  state.editingId = null;
  $("#drawer").classList.remove("open");
}

function normalizeManualPayload(form) {
  const fd = new FormData(form);
  const payload = Object.fromEntries(fd.entries());
  payload.id = state.editingId || "";
  return payload;
}

async function refresh() {
  const data = await fetch("/api/state").then((r) => r.json());
  state.data = data;
  render(data);
}

function render(data) {
  renderKpis(data);
  renderAlerts(data.alerts);
  renderInsights(data.insights);
  renderHoldings(data.holdings);

  const palette = ["#37a2ff", "#28d7a4", "#ffcc66", "#ff6b6b", "#9b8cff", "#44d7e2", "#f38fb6", "#8fd14f"];
  donutChart($("#allocationChart"), data.by_class, palette);
  barChart($("#issuerChart"), data.by_issuer, palette);
  barChart($("#maturityChart"), data.maturity, palette, true);
  barChart($("#indexerChart"), data.by_indexer, palette, true);
  renderHeatmap($("#correlationChart"), data.correlation);
  lineChart($("#benchmarkChart"), data.benchmark.series, ["CDI", "IBOV", "IPCA", "Carteira"], palette, true);
}

async function uploadFile(file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: formData });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.detail || "Falha ao importar arquivo");
  state.data = payload.state;
  render(payload.state);
}

function bindEvents() {
  const theme = localStorage.getItem(themeKey) || "dark";
  setTheme(theme);

  $("#themeToggle").addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    setTheme(next);
  });

  $("#manualToggle").addEventListener("click", () => openDrawer());
  $("#closeDrawer").addEventListener("click", closeDrawer);
  $("#clearForm").addEventListener("click", () => {
    state.editingId = null;
    $("#manualForm").reset();
    $("#deleteRecord").style.display = "none";
  });

  $("#deleteRecord").addEventListener("click", async () => {
    if (!state.editingId) return;
    await apiJson("/api/delete", { method: "POST", body: JSON.stringify({ id: state.editingId }) });
    closeDrawer();
    await refresh();
  });

  $("#manualForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const payload = normalizeManualPayload(ev.currentTarget);
    const result = await apiJson("/api/manual", { method: "POST", body: JSON.stringify(payload) });
    state.data = result.state;
    render(result.state);
    closeDrawer();
  });

  $("#fileInput").addEventListener("change", async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    try {
      await uploadFile(file);
    } catch (err) {
      alert(err.message);
    } finally {
      ev.target.value = "";
    }
  });

  $("#resetDemo").addEventListener("click", async () => {
    const result = await apiJson("/api/reset-demo", { method: "POST", body: JSON.stringify({}) });
    state.data = result.state;
    render(result.state);
  });

  $("#drawer").addEventListener("click", (ev) => {
    if (ev.target.id === "drawer") closeDrawer();
  });
}

bindEvents();
refresh().catch((err) => {
  console.error(err);
  alert("Nao foi possivel carregar a carteira.");
});
