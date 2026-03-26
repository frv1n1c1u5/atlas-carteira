"use client";

import { useEffect, useMemo, useState } from "react";
import { DEMO_ROWS, computePortfolio, normalizeRow, parseUploadedFile } from "../lib/portfolio";

const themeKey = "atlas-theme";
const storageKey = "atlas-rows";

const palette = ["#37a2ff", "#28d7a4", "#ffcc66", "#ff6b6b", "#9b8cff", "#44d7e2", "#f38fb6", "#8fd14f"];

function money(value, digits = 0) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: digits }).format(value || 0);
}

function pct(value, digits = 1) {
  return `${(value || 0).toFixed(digits)}%`;
}

function chartSvgText(props, children) {
  return <text {...props}>{children}</text>;
}

function DonutChart({ items }) {
  const total = items.reduce((acc, item) => acc + (item.value || 0), 0) || 1;
  const size = 280;
  const cx = 140;
  const cy = 125;
  const r = 82;
  const c = 2 * Math.PI * r;
  let dashOffset = 0;
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${size} 240`} aria-label="Gráfico de alocação">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="28" />
        {items.map((item, idx) => {
          const share = item.value / total;
          const seg = (
            <circle
              key={item.label}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={palette[idx % palette.length]}
              strokeWidth="28"
              strokeLinecap="round"
              strokeDasharray={`${share * c} ${c}`}
              strokeDashoffset={-dashOffset}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          );
          dashOffset += share * c;
          return seg;
        })}
        <text x={140} y={121} textAnchor="middle" fill="var(--text)" fontSize="22" fontWeight="700">
          {money(total)}
        </text>
        <text x={140} y={145} textAnchor="middle" fill="var(--muted)" fontSize="12">
          Total
        </text>
      </svg>
      <div className="svg-legend">
        {items.map((item, idx) => (
          <span key={item.label}>
            <span className="dot" style={{ background: palette[idx % palette.length] }} />
            {item.label} {pct(item.share * 100, 1)}
          </span>
        ))}
      </div>
    </div>
  );
}

function BarChart({ items, compact = false }) {
  if (!items.length) return <div className="chart">Sem dados suficientes.</div>;
  const width = 720;
  const height = compact ? 240 : 280;
  const margin = { top: 16, right: 24, bottom: 56, left: 28 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const max = Math.max(...items.map((d) => d.value)) || 1;
  const total = items.reduce((acc, i) => acc + (i.value || 0), 0) || 1;
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${width} ${height}`}>
        {items.slice(0, 8).map((item, idx) => {
          const barH = (item.value / max) * innerH;
          const barW = innerW / Math.min(items.length, 8) - 14;
          const x = margin.left + idx * (barW + 14);
          const y = margin.top + (innerH - barH);
          return (
            <g key={item.label}>
              <rect x={x} y={y} width={barW} height={barH} rx="16" fill={palette[idx % palette.length]} opacity="0.92" />
              <text x={x + barW / 2} y={height - 32} textAnchor="middle" fill="var(--muted)" fontSize="11">
                {item.label.length > 12 ? `${item.label.slice(0, 12)}...` : item.label}
              </text>
              <text x={x + barW / 2} y={y - 8} textAnchor="middle" fill="var(--text)" fontSize="11" fontWeight="600">
                {pct((item.value / total) * 100, 1)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function LineChart({ series, keys }) {
  if (!series.length) return <div className="chart">Sem dados suficientes.</div>;
  const width = 720;
  const height = 240;
  const margin = { top: 20, right: 24, bottom: 34, left: 36 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const values = series.flatMap((row) => keys.map((k) => row[k]));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const yScale = (value) => margin.top + innerH - ((value - min) / (max - min || 1)) * innerH;
  const xScale = (index) => margin.left + (index / Math.max(1, series.length - 1)) * innerW;
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${width} ${height}`}>
        {Array.from({ length: 5 }).map((_, i) => {
          const y = margin.top + (innerH / 4) * i;
          return <line key={i} x1={margin.left} y1={y} x2={width - margin.right} y2={y} stroke="rgba(255,255,255,0.08)" />;
        })}
        {keys.map((key, keyIdx) => {
          const d = series
            .map((row, idx) => `${idx === 0 ? "M" : "L"}${xScale(idx)},${yScale(row[key])}`)
            .join(" ");
          return (
            <g key={key}>
              <path d={d} fill="none" stroke={palette[keyIdx % palette.length]} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
              {series.map((row, idx) => (
                <circle key={`${key}-${idx}`} cx={xScale(idx)} cy={yScale(row[key])} r="4" fill={palette[keyIdx % palette.length]} />
              ))}
            </g>
          );
        })}
        {series.map((row, idx) => (
          <text key={row.label} x={xScale(idx)} y={height - 12} textAnchor="middle" fill="var(--muted)" fontSize="11">
            {row.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

function Heatmap({ data }) {
  if (!data.labels.length) return <div className="chart">Sem dados suficientes.</div>;
  return (
    <div className="chart heatmap">
      <div className="heatmap-row">
        <div />
        {data.labels.map((l) => (
          <div key={l} className="muted" style={{ textAlign: "center", fontSize: ".78rem" }}>
            {l}
          </div>
        ))}
      </div>
      {data.matrix.map((row, idx) => (
        <div key={data.labels[idx]} className="heatmap-row">
          <div className="muted" style={{ fontSize: ".82rem" }}>
            {data.labels[idx]}
          </div>
          {row.map((value, j) => (
            <div
              key={`${idx}-${j}`}
              className="heatmap-cell"
              style={{
                background: `rgba(40, 215, 164, ${Math.max(0.08, Math.min(0.85, (value - 0.1) / 0.9))})`,
                color: value > 0.55 ? "#08131f" : "var(--text)",
              }}
            >
              {value.toFixed(2)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function App() {
  const [rows, setRows] = useState(DEMO_ROWS);
  const [editingId, setEditingId] = useState(null);
  const [theme, setTheme] = useState("dark");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState({
    asset_class: "",
    institution: "",
    issuer: "",
    ticker: "",
    name: "",
    indexer: "",
    rate: "",
    maturity: "",
    current_value: "",
    liquidity_days: "",
    acquisition_date: "",
    cost_value: "",
  });

  const data = useMemo(() => computePortfolio(rows), [rows]);

  useEffect(() => {
    const savedTheme = localStorage.getItem(themeKey) || "dark";
    setTheme(savedTheme);
    document.documentElement.setAttribute("data-theme", savedTheme);
    const savedRows = localStorage.getItem(storageKey);
    if (savedRows) {
      try {
        setRows(JSON.parse(savedRows));
      } catch {
        setRows(DEMO_ROWS);
      }
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(themeKey, theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(rows));
  }, [rows]);

  function openDrawer(row = null) {
    setEditingId(row?.id || null);
    if (row) {
      setManual({
        asset_class: row.asset_class || "",
        institution: row.institution || "",
        issuer: row.issuer || "",
        ticker: row.ticker || "",
        name: row.name || "",
        indexer: row.indexer || "",
        rate: row.rate ?? "",
        maturity: row.maturity || "",
        current_value: row.current_value ?? "",
        liquidity_days: row.liquidity_days ?? "",
        acquisition_date: row.acquisition_date || "",
        cost_value: row.cost_value ?? "",
      });
    } else {
      setManual({
        asset_class: "",
        institution: "",
        issuer: "",
        ticker: "",
        name: "",
        indexer: "",
        rate: "",
        maturity: "",
        current_value: "",
        liquidity_days: "",
        acquisition_date: "",
        cost_value: "",
      });
    }
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingId(null);
  }

  function updateManual(field, value) {
    setManual((prev) => ({ ...prev, [field]: value }));
  }

  function saveManual(ev) {
    ev.preventDefault();
    const payload = normalizeRow({
      ...manual,
      id: editingId || "",
      source: "manual",
    });
    payload.current_value = Number(payload.current_value || 0);
    setRows((prev) => {
      const next = [...prev];
      if (editingId) {
        const idx = next.findIndex((r) => r.id === editingId);
        if (idx >= 0) next[idx] = { ...payload, id: editingId, source: "manual" };
        else next.push({ ...payload, id: `h${next.length + 1}`, source: "manual" });
      } else {
        next.push({ ...payload, id: `h${next.length + 1}`, source: "manual" });
      }
      return next;
    });
    closeDrawer();
  }

  async function handleUpload(file) {
    setBusy(true);
    try {
      const parsed = await parseUploadedFile(file);
      if (!parsed.length) throw new Error("Nenhum dado reconhecido na planilha.");
      setRows(parsed.map((row, idx) => ({ ...row, id: `h${idx + 1}` })));
    } finally {
      setBusy(false);
    }
  }

  function deleteCurrent() {
    if (!editingId) return;
    setRows((prev) => prev.filter((row) => row.id !== editingId));
    closeDrawer();
  }

  return (
    <div>
      <div className="bg-orb orb-a" />
      <div className="bg-orb orb-b" />
      <div className="app-shell">
        <aside className="sidebar glass">
          <div className="brand">
            <div className="brand-mark">A</div>
            <div>
              <strong>Atlas Carteira</strong>
              <span>Visão comercial da carteira</span>
            </div>
          </div>

          <div className="panel">
            <h3>Importar dados</h3>
            <p>Upload de Excel/CSV com normalização automática e consolidação imediata.</p>
            <label className="upload-box" htmlFor="fileInput">
              <input
                id="fileInput"
                type="file"
                accept=".xlsx,.xls,.xlsm,.csv,.txt"
                onChange={async (ev) => {
                  const file = ev.target.files?.[0];
                  if (!file) return;
                  await handleUpload(file);
                  ev.target.value = "";
                }}
              />
              <span>{busy ? "Processando..." : "Arraste ou clique para importar"}</span>
              <small>XLSX, CSV ou TXT</small>
            </label>
            <div className="row">
              <button className="btn ghost" type="button" onClick={() => setRows(DEMO_ROWS)}>
                Carregar demo
              </button>
              <button className="btn ghost" type="button" onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}>
                Tema
              </button>
            </div>
          </div>

          <div className="panel">
            <h3>Entrada manual</h3>
            <p>Use quando o arquivo estiver incompleto ou para ajuste fino do assessor.</p>
            <button className="btn primary" type="button" onClick={() => openDrawer()}>
              Abrir formulário
            </button>
          </div>

          <div className="panel">
            <h3>Leitura rápida</h3>
            <ul className="mini-list">
              <li>Alertas FGC, liquidez e vencimentos</li>
              <li>Benchmark e correlação estimada</li>
              <li>Score 0-100 e narrativa pronta</li>
            </ul>
          </div>
        </aside>

        <main className="content">
          <header className="hero glass">
            <div>
              <span className="eyebrow">Dashboard comercial</span>
              <h1>Consolidação profissional para reuniões com clientes</h1>
              <p>
                Uma camada visual acima do Excel para revelar risco oculto, concentração, benchmarking e narrativa de
                atendimento.
              </p>
            </div>
            <div className="hero-meta">
              <div className="meta-card">
                <span>Atualizado em</span>
                <strong>{new Date(data.generated_at).toLocaleString("pt-BR")}</strong>
              </div>
              <div className="meta-card accent">
                <span>Score da carteira</span>
                <strong>{data.summary.score}/100</strong>
              </div>
            </div>
          </header>

          <section className="kpis">
            {[
              ["Patrimônio total", money(data.summary.total)],
              ["Posições", data.summary.holdings_count.toLocaleString("pt-BR")],
              ["Classes / emissores", `${data.summary.class_count} / ${data.summary.issuer_count}`],
              ["Score", `${data.summary.score}`],
            ].map(([label, value]) => (
              <article className="kpi" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <div className="delta">{label === "Score" ? "Quanto mais alto, melhor o equilíbrio" : "Visão consolidada da base atual"}</div>
              </article>
            ))}
          </section>

          <section className="grid-2">
            <article className="card glass">
              <div className="card-head">
                <h2>Alocação por classe</h2>
                <span className="muted">RF, RV, fundos e outros</span>
              </div>
              <DonutChart items={data.by_class} />
            </article>

            <article className="card glass">
              <div className="card-head">
                <h2>Exposição por emissor</h2>
                <span className="muted">Consolidação de risco</span>
              </div>
              <BarChart items={data.by_issuer} />
            </article>
          </section>

          <section className="grid-2">
            <article className="card glass">
              <div className="card-head">
                <h2>Vencimentos futuros</h2>
                <span className="muted">Fluxo de RF por janela</span>
              </div>
              <BarChart items={data.maturity} compact />
            </article>

            <article className="card glass">
              <div className="card-head">
                <h2>Benchmark de referência</h2>
                <span className="muted">Comparativo comercial</span>
              </div>
              <LineChart series={data.benchmark.series} keys={["CDI", "IBOV", "IPCA", "Carteira"]} />
            </article>
          </section>

          <section className="grid-2">
            <article className="card glass">
              <div className="card-head">
                <h2>Indexadores</h2>
                <span className="muted">CDI, IPCA e Pré</span>
              </div>
              <BarChart items={data.by_indexer} compact />
            </article>

            <article className="card glass">
              <div className="card-head">
                <h2>Correlação estimada</h2>
                <span className="muted">Similaridade entre ativos</span>
              </div>
              <Heatmap data={data.correlation} />
            </article>
          </section>

          <section className="grid-2">
            <article className="card glass">
              <div className="card-head">
                <h2>Alertas inteligentes</h2>
                <span className="muted">FGC, liquidez, concentração</span>
              </div>
              <div className="stack">
                {data.alerts.map((item, idx) => (
                  <div className="alert" data-severity={item.severity} key={`${item.title}-${idx}`}>
                    <strong>{item.title}</strong>
                    <div className="muted">{item.detail}</div>
                  </div>
                ))}
              </div>
            </article>

            <article className="card glass">
              <div className="card-head">
                <h2>Insights automáticos</h2>
                <span className="muted">Narrativa pronta para reunião</span>
              </div>
              <div className="stack">
                {data.insights.map((item) => (
                  <div className="insight" key={item}>
                    {item}
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="card glass">
            <div className="card-head">
              <h2>Carteira consolidada</h2>
              <span className="muted">Clique em uma linha para editar</span>
            </div>
            <div className="table-wrap">
              <table id="holdingsTable">
                <thead>
                  <tr>
                    <th>Classe</th>
                    <th>Instituição</th>
                    <th>Emissor / Nome</th>
                    <th>Indexador</th>
                    <th>Vencimento</th>
                    <th>Liquidez</th>
                    <th>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {data.holdings.map((row) => (
                    <tr key={row.id} onClick={() => openDrawer(row)}>
                      <td>{row.asset_class || "-"}</td>
                      <td>{row.institution || "-"}</td>
                      <td>{row.ticker || row.name || row.issuer || "-"}</td>
                      <td>{row.indexer || "-"}</td>
                      <td>{row.maturity || "-"}</td>
                      <td>{row.liquidity_days ? `D+${row.liquidity_days}` : "-"}</td>
                      <td>{row.current_value ? money(row.current_value, 2) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>

      {drawerOpen && (
        <div className="drawer open" onClick={(ev) => ev.target === ev.currentTarget && closeDrawer()}>
          <div className="drawer-card glass">
            <div className="card-head">
              <h2>Entrada manual</h2>
              <button className="icon-btn" type="button" onClick={closeDrawer}>
                Fechar
              </button>
            </div>
            <form className="form-grid" onSubmit={saveManual}>
              {[
                ["asset_class", "Classe"],
                ["institution", "Instituição"],
                ["issuer", "Emissor"],
                ["ticker", "Ticker"],
                ["name", "Nome"],
                ["indexer", "Indexador"],
                ["rate", "Taxa"],
                ["maturity", "Vencimento (AAAA-MM-DD)"],
                ["current_value", "Valor atual"],
                ["liquidity_days", "Liquidez (dias)"],
                ["acquisition_date", "Aquisição (opcional)"],
                ["cost_value", "Custo (opcional)"],
              ].map(([field, placeholder]) => (
                <input key={field} value={manual[field]} onChange={(e) => updateManual(field, e.target.value)} placeholder={placeholder} />
              ))}
              <div className="form-actions">
                <button type="submit" className="btn primary">
                  Salvar
                </button>
                <button type="button" className="btn ghost" onClick={deleteCurrent} style={{ display: editingId ? "inline-flex" : "none" }}>
                  Excluir
                </button>
                <button type="button" className="btn ghost" onClick={closeDrawer}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
