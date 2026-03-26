"use client";

import { useEffect, useMemo, useState } from "react";
import { DEMO_ROWS, computePortfolio, normalizeRow, parseUploadedFile } from "../lib/portfolio";

const themeKey = "atlas-theme";
const storageKey = "atlas-rows";
const benchmarkKey = "atlas-benchmarks";
const benchmarkDateKey = "atlas-benchmarks-day";

const palette = ["#37a2ff", "#28d7a4", "#ffcc66", "#ff6b6b", "#9b8cff", "#44d7e2", "#f38fb6", "#8fd14f"];
const tabs = [
  { key: "overview", label: "Visão Geral" },
  { key: "rf", label: "Renda Fixa" },
  { key: "rv", label: "Renda Variável" },
  { key: "fundos", label: "Fundos" },
  { key: "insights", label: "Alertas & Insights" },
  { key: "dados", label: "Dados" },
];

function uniqueSorted(rows, key) {
  return Array.from(new Set(rows.map((row) => row[key]).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b), "pt-BR"));
}

function filterRows(rows, filters) {
  return rows.filter((row) => {
    if (filters.institution && row.institution !== filters.institution) return false;
    if (filters.rf_type && row.asset_class === "RF" && row.rf_type !== filters.rf_type) return false;
    if (filters.rf_type && row.asset_class !== "RF") return false;
    return true;
  });
}

function money(value, digits = 0) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: digits,
  }).format(value || 0);
}

function pct(value, digits = 1) {
  return `${(value || 0).toFixed(digits)}%`;
}

function signedPct(value, digits = 1) {
  const n = Number(value || 0);
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

function sameDayKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Fortaleza",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function SectionCard({ title, subtitle, children, className = "" }) {
  return (
    <article className={`card glass ${className}`}>
      <div className="card-head">
        <div>
          <h2>{title}</h2>
          {subtitle ? <span className="muted">{subtitle}</span> : null}
        </div>
      </div>
      {children}
    </article>
  );
}

function DonutChart({ items, centerLabel = "" }) {
  const total = items.reduce((acc, item) => acc + (item.value || 0), 0) || 1;
  const size = 320;
  const cx = 160;
  const cy = 140;
  const r = 92;
  const c = 2 * Math.PI * r;
  let dashOffset = 0;
  return (
    <div className="chart chart-donut">
      <svg viewBox={`0 0 ${size} 260`} aria-label="Gráfico de alocação">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="30" />
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
              strokeWidth="30"
              strokeLinecap="round"
              strokeDasharray={`${share * c} ${c}`}
              strokeDashoffset={-dashOffset}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          );
          dashOffset += share * c;
          return seg;
        })}
        <text x={160} y={136} textAnchor="middle" fill="var(--text)" fontSize="24" fontWeight="700">
          {centerLabel || money(total)}
        </text>
        <text x={160} y={158} textAnchor="middle" fill="var(--muted)" fontSize="12">
          Total consolidado
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
  if (!items?.length) return <div className="chart empty">Sem dados suficientes.</div>;
  const width = 820;
  const height = compact ? 250 : 310;
  const margin = { top: 18, right: 24, bottom: 54, left: 28 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const max = Math.max(...items.map((d) => d.value)) || 1;
  const total = items.reduce((acc, i) => acc + (i.value || 0), 0) || 1;
  const slice = items.slice(0, 8);
  return (
    <div className={`chart ${compact ? "chart-short" : ""}`}>
      <svg viewBox={`0 0 ${width} ${height}`}>
        {slice.map((item, idx) => {
          const barH = (item.value / max) * innerH;
          const barW = innerW / Math.min(slice.length, 8) - 14;
          const x = margin.left + idx * (barW + 14);
          const y = margin.top + (innerH - barH);
          return (
            <g key={item.label}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={barH}
                rx="16"
                fill={
                  item.eligible === true
                    ? "#28d7a4"
                    : item.eligible === false
                      ? "#ffcc66"
                      : palette[idx % palette.length]
                }
                opacity="0.92"
              />
              <text x={x + barW / 2} y={height - 28} textAnchor="middle" fill="var(--muted)" fontSize="11">
                {item.label.length > 14 ? `${item.label.slice(0, 14)}...` : item.label}
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
  if (!series?.length) return <div className="chart empty">Sem dados suficientes.</div>;
  const width = 820;
  const height = 260;
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
          const d = series.map((row, idx) => `${idx === 0 ? "M" : "L"}${xScale(idx)},${yScale(row[key])}`).join(" ");
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

function SparkCard({ label, value, hint }) {
  return (
    <article className="kpi">
      <span>{label}</span>
      <strong>{value}</strong>
      <div className="delta">{hint}</div>
    </article>
  );
}

function BenchmarkTile({ label, source, month, year, accent }) {
  return (
    <article className="benchmark-tile">
      <div className="benchmark-tile-head">
        <div>
          <span>{label}</span>
          <strong>{source}</strong>
        </div>
        <div className={`benchmark-pill ${accent}`}>{accent === "good" ? "Atualizado" : "Mercado"}</div>
      </div>
      <div className="benchmark-values">
        <div>
          <small>Último mês</small>
          <strong className={month >= 0 ? "positive" : "negative"}>{month === null ? "—" : signedPct(month, 1)}</strong>
        </div>
        <div>
          <small>Últimos 12 meses</small>
          <strong className={year >= 0 ? "positive" : "negative"}>{year === null ? "—" : signedPct(year, 1)}</strong>
        </div>
      </div>
    </article>
  );
}

function App() {
  const [rows, setRows] = useState(DEMO_ROWS);
  const [editingId, setEditingId] = useState(null);
  const [theme, setTheme] = useState("dark");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [benchmarks, setBenchmarks] = useState(null);
  const [benchmarkStatus, setBenchmarkStatus] = useState("loading");
  const [filters, setFilters] = useState({ institution: "", rf_type: "" });
  const [manual, setManual] = useState({
    asset_class: "",
    rf_type: "",
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

  const baseData = useMemo(() => computePortfolio(rows), [rows]);
  const visibleRows = useMemo(() => filterRows(rows, filters), [rows, filters]);
  const data = useMemo(() => computePortfolio(visibleRows), [visibleRows]);
  const institutions = useMemo(() => uniqueSorted(rows, "institution"), [rows]);
  const rfTypes = useMemo(() => uniqueSorted(rows.filter((row) => row.asset_class === "RF"), "rf_type"), [rows]);

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

  useEffect(() => {
    let alive = true;

    async function loadBenchmarks() {
      const today = sameDayKey();
      try {
        const cachedDate = localStorage.getItem(benchmarkDateKey);
        const cached = localStorage.getItem(benchmarkKey);
        if (cached && cachedDate === today) {
          const parsed = JSON.parse(cached);
          if (alive) {
            setBenchmarks(parsed);
            setBenchmarkStatus(parsed?.items ? "ready" : "error");
          }
          return;
        }
      } catch {
        // Ignore local cache errors and fall through to the fetch.
      }

      try {
        const res = await fetch("/api/benchmarks", { headers: { Accept: "application/json" } });
        const payload = await res.json();
        if (!alive) return;
        setBenchmarks(payload);
        setBenchmarkStatus(payload?.items ? "ready" : "error");
        localStorage.setItem(benchmarkKey, JSON.stringify(payload));
        localStorage.setItem(benchmarkDateKey, today);
      } catch {
        if (!alive) return;
        setBenchmarkStatus("error");
        setBenchmarks(null);
      }
    }

    loadBenchmarks();
    return () => {
      alive = false;
    };
  }, []);

  function openDrawer(row = null) {
    setEditingId(row?.id || null);
    setManual({
      asset_class: row?.asset_class || "",
      rf_type: row?.rf_type || "",
      institution: row?.institution || "",
      issuer: row?.issuer || "",
      ticker: row?.ticker || "",
      name: row?.name || "",
      indexer: row?.indexer || "",
      rate: row?.rate ?? "",
      maturity: row?.maturity || "",
      current_value: row?.current_value ?? "",
      liquidity_days: row?.liquidity_days ?? "",
      acquisition_date: row?.acquisition_date || "",
      cost_value: row?.cost_value ?? "",
    });
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
      setActiveTab("overview");
    } finally {
      setBusy(false);
    }
  }

  function deleteCurrent() {
    if (!editingId) return;
    setRows((prev) => prev.filter((row) => row.id !== editingId));
    closeDrawer();
  }

  const totalRf = data.holdings.filter((r) => r.asset_class === "RF").reduce((a, b) => a + Number(b.current_value || 0), 0);
  const totalRv = data.holdings.filter((r) => r.asset_class === "RV").reduce((a, b) => a + Number(b.current_value || 0), 0);
  const totalFunds = data.holdings.filter((r) => r.asset_class === "FUNDOS").reduce((a, b) => a + Number(b.current_value || 0), 0);
  const benchmarkItems = benchmarks?.items
    ? [benchmarks.items.CDI, benchmarks.items.IBOV, benchmarks.items.IPCA].filter(Boolean)
    : [];

  const overviewLayout = (
    <>
      <section className="kpis">
        <SparkCard label="Patrimônio total" value={money(data.summary.total)} hint="Visão consolidada da carteira" />
        <SparkCard label="Posições" value={data.summary.holdings_count.toLocaleString("pt-BR")} hint="Itens consolidados" />
        <SparkCard label="Classes / emissores" value={`${data.summary.class_count} / ${data.summary.issuer_count}`} hint="Diversificação estrutural" />
        <SparkCard label="Score" value={`${data.summary.score}/100`} hint="Equilíbrio geral da carteira" />
      </section>

      <section className="grid-2">
        <SectionCard title="Alocação por classe" subtitle="Leitura rápida do patrimônio">
          <DonutChart items={data.by_class} centerLabel={money(data.summary.total)} />
        </SectionCard>
        <SectionCard title="Exposição por emissor" subtitle="Concentração nominal">
          <BarChart items={data.by_issuer} />
        </SectionCard>
      </section>

      <section className="grid-2">
        <SectionCard title="Benchmarks" subtitle="Comparativo diário com atualização automática">
          {benchmarkStatus === "loading" ? (
            <div className="benchmark-empty">Carregando benchmarks do dia...</div>
          ) : benchmarkItems.length ? (
            <div className="benchmark-grid">
              {benchmarkItems.map((item) => (
                <BenchmarkTile
                  key={item.label}
                  label={item.label}
                  source={item.source}
                  month={item.month}
                  year={item.year}
                  accent={item.label === "CDI" ? "good" : "neutral"}
                />
              ))}
            </div>
          ) : (
            <div className="benchmark-empty">
              Não foi possível atualizar os benchmarks hoje. A interface continua funcionando normalmente.
            </div>
          )}
          <p className="muted benchmark-note">Atualização automática uma vez por dia para manter a experiência leve.</p>
        </SectionCard>
        <SectionCard title="Indexadores" subtitle="Distribuição da renda fixa">
          <BarChart items={data.by_indexer} compact />
        </SectionCard>
      </section>

      <section className="grid-2">
        <SectionCard title="Vencimentos futuros" subtitle="Fluxo da renda fixa por janela">
          <BarChart items={data.maturity} compact />
        </SectionCard>
        <SectionCard title="Narrativa do assessor" subtitle="Resumo comercial pronto para reunião">
          <div className="stack">
            {data.insights.slice(0, 3).map((item) => (
              <div className="insight" key={item}>
                {item}
              </div>
            ))}
          </div>
        </SectionCard>
      </section>
    </>
  );

  const rfLayout = (
    <>
      <section className="kpis">
        <SparkCard label="Renda fixa" value={money(totalRf)} hint="Somente ativos de RF" />
        <SparkCard label="Com FGC" value={money(data.rf_fgc.eligible_value)} hint="CDB, LCI, LCA e similares" />
        <SparkCard label="Sem FGC" value={money(data.rf_fgc.non_eligible_value)} hint="Debêntures, CRI, CRA, LF etc." />
        <SparkCard label="Cobertura FGC" value={pct(data.rf_fgc.eligible_share * 100, 1)} hint="Parcela da RF com proteção" />
      </section>

      <section className="grid-2">
        <SectionCard title="Leitura FGC" subtitle="Protegidos vs sem cobertura">
          <div className="fgc-split">
            <div className="fgc-box good">
              <span>Com FGC</span>
              <strong>{money(data.rf_fgc.eligible_value)}</strong>
              <small>{pct(data.rf_fgc.eligible_share * 100, 1)} da renda fixa</small>
            </div>
            <div className="fgc-box bad">
              <span>Sem FGC</span>
              <strong>{money(data.rf_fgc.non_eligible_value)}</strong>
              <small>{pct((1 - data.rf_fgc.eligible_share) * 100, 1)} da renda fixa</small>
            </div>
          </div>
        </SectionCard>
        <SectionCard title="Tipos de RF" subtitle="Cores verdes para FGC e âmbar para sem FGC">
          <BarChart items={data.rf_types} compact />
        </SectionCard>
      </section>

      <section className="grid-2">
        <SectionCard title="Risco por emissor" subtitle="FGC x sem FGC">
          <div className="stack">
            {data.by_issuer.slice(0, 8).map((row) => (
              <div className="issuer-row" key={row.label}>
                <div>
                  <strong>{row.label}</strong>
                  <span className="muted">
                    {row.fgcEligibleValue > 0 ? `FGC: ${money(row.fgcEligibleValue)} · ` : ""}
                    {row.nonFgcValue > 0 ? `Sem FGC: ${money(row.nonFgcValue)}` : ""}
                  </span>
                </div>
                <div className="issuer-value">{money(row.value)}</div>
              </div>
            ))}
          </div>
        </SectionCard>
      </section>

      <section className="grid-2">
        <SectionCard title="Vencimentos" subtitle="Fluxo de caixa e reinvestimento">
          <BarChart items={data.maturity} compact />
        </SectionCard>
        <SectionCard title="Alertas de RF" subtitle="Foco em concentração e cobertura">
          <div className="stack">
            {data.alerts.filter((item) => item.title.includes("FGC") || item.title.includes("Concentração")).map((item, idx) => (
              <div className="alert" data-severity={item.severity} key={`${item.title}-${idx}`}>
                <strong>{item.title}</strong>
                <div className="muted">{item.detail}</div>
              </div>
            ))}
          </div>
        </SectionCard>
      </section>
    </>
  );

  const rvLayout = (
    <>
      <section className="kpis">
        <SparkCard label="Renda variável" value={money(totalRv)} hint="Posições consolidadas por ticker" />
        <SparkCard label="Tickers" value={data.by_ticker.length.toLocaleString("pt-BR")} hint="Unificação entre instituições" />
        <SparkCard label="Maior posição" value={data.by_ticker[0] ? data.by_ticker[0].label : "-"} hint="Ticker líder na carteira" />
        <SparkCard label="Participação" value={data.by_ticker[0] ? pct(data.by_ticker[0].share * 100, 1) : "0,0%"} hint="Peso do maior ativo" />
      </section>

      <section className="grid-2">
        <SectionCard title="Consolidação por ticker" subtitle="Unificação das posições de RV">
          <BarChart items={data.by_ticker} />
        </SectionCard>
        <SectionCard title="Leitura executiva" subtitle="Concentração e dispersão">
          <div className="stack">
            {data.by_ticker.slice(0, 6).map((item) => (
              <div className="ticker-row" key={item.label}>
                <div>
                  <strong>{item.label}</strong>
                  <span className="muted">{pct(item.share * 100, 1)} da renda variável</span>
                </div>
                <div className="issuer-value">{money(item.value)}</div>
              </div>
            ))}
          </div>
        </SectionCard>
      </section>
    </>
  );

  const fundsLayout = (
    <>
      <section className="kpis">
        <SparkCard label="Fundos" value={money(totalFunds)} hint="Consolidação por nome" />
        <SparkCard label="Fundos D+30+" value={money(data.holdings.filter((r) => r.asset_class === "FUNDOS" && (r.liquidity_days || 0) >= 30).reduce((a, b) => a + Number(b.current_value || 0), 0))} hint="Alerta de liquidez" />
        <SparkCard label="Gestoras/nomes" value={data.by_fund.length.toLocaleString("pt-BR")} hint="Itens consolidados" />
        <SparkCard label="Maior fundo" value={data.by_fund[0] ? data.by_fund[0].label : "-"} hint="Maior peso entre fundos" />
      </section>

      <section className="grid-2">
        <SectionCard title="Consolidação de fundos" subtitle="Nome e liquidez">
          <BarChart items={data.by_fund} />
        </SectionCard>
        <SectionCard title="Liquidez dos fundos" subtitle="Foco em D+30 ou superior">
          <div className="stack">
            {data.holdings
              .filter((r) => r.asset_class === "FUNDOS")
              .sort((a, b) => Number(b.current_value || 0) - Number(a.current_value || 0))
              .map((row) => (
                <div className="issuer-row" key={row.id}>
                  <div>
                    <strong>{row.name}</strong>
                    <span className="muted">{row.liquidity_days ? `Liquidez D+${row.liquidity_days}` : "Liquidez não informada"}</span>
                  </div>
                  <div className="issuer-value">{money(row.current_value)}</div>
                </div>
              ))}
          </div>
        </SectionCard>
      </section>
    </>
  );

  const insightsLayout = (
    <section className="grid-2">
      <SectionCard title="Alertas inteligentes" subtitle="O que merece atenção na reunião">
        <div className="stack">
          {data.alerts.map((item, idx) => (
            <div className="alert" data-severity={item.severity} key={`${item.title}-${idx}`}>
              <strong>{item.title}</strong>
              <div className="muted">{item.detail}</div>
            </div>
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Narrativa automática" subtitle="Texto para reunião com cliente">
        <div className="stack">
          {data.insights.map((item) => (
            <div className="insight" key={item}>
              {item}
            </div>
          ))}
        </div>
      </SectionCard>
    </section>
  );

  const dataLayout = (
    <section className="card glass">
      <div className="card-head">
        <div>
          <h2>Carteira consolidada</h2>
          <span className="muted">Clique em uma linha para editar</span>
        </div>
      </div>
      <div className="table-wrap">
        <table id="holdingsTable">
          <thead>
            <tr>
              <th>Classe</th>
              <th>Tipo RF</th>
              <th>FGC</th>
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
                <td>{row.asset_class === "RF" ? row.rf_type || "-" : "-"}</td>
                <td>{row.asset_class === "RF" ? (row.fgc_eligible ? "Sim" : "Não") : "-"}</td>
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
  );

  const currentView = {
    overview: overviewLayout,
    rf: rfLayout,
    rv: rvLayout,
    fundos: fundsLayout,
    insights: insightsLayout,
    dados: dataLayout,
  }[activeTab];

  return (
    <div className="page-shell">
      <div className="bg-orb orb-a" />
      <div className="bg-orb orb-b" />

      <div className="app-shell">
        <aside className="sidebar glass">
          <div className="brand">
            <div className="brand-mark">CP</div>
            <div>
              <strong>Consolidador de Portifólio</strong>
              <span>Visão comercial da carteira</span>
            </div>
          </div>

          {activeTab === "overview" ? (
            <>
              <div className="panel">
                <h3>Importar dados</h3>
                <p>Envie a planilha ou CSV e deixe o consolidado pronto em poucos segundos.</p>
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
                <p>Complemente dados faltantes ou faça ajustes rápidos sem sair da visão geral.</p>
                <button className="btn primary" type="button" onClick={() => openDrawer()}>
                  Abrir formulário
                </button>
              </div>
            </>
          ) : (
            <div className="panel">
              <h3>{tabs.find((tab) => tab.key === activeTab)?.label}</h3>
              <p>Leitura executiva da carteira com foco no que importa para a conversa com o cliente.</p>
              <ul className="mini-list">
                <li>Alocação por classe, instituição e emissor</li>
                <li>Foco em risco, liquidez e concentração</li>
                <li>Benchmarks e insights automáticos na visão geral</li>
              </ul>
            </div>
          )}

          <div className="panel">
            <h3>Leitura rápida</h3>
            <ul className="mini-list">
              <li>FGC só para CDB, LCI e LCA</li>
              <li>Debêntures, CRI, CRA e LF sem FGC</li>
              <li>Layout otimizado para tela de desktop</li>
              <li>Se os tipos RF ficarem vazios, reimporte a planilha original</li>
            </ul>
          </div>
        </aside>

        <main className="content">
          <header className="hero glass">
            <div className="hero-copy">
              <span className="eyebrow">Visão patrimonial</span>
              <h1>Uma leitura clara da carteira para o cliente</h1>
              <p>
                Um painel elegante para apresentar patrimônio, riscos e benchmark de forma simples, limpa e pronta para
                reunião em tela de computador.
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

          <nav className="tabs glass">
            {tabs.map((tab) => (
              <button key={tab.key} className={`tab ${activeTab === tab.key ? "active" : ""}`} type="button" onClick={() => setActiveTab(tab.key)}>
                {tab.label}
              </button>
            ))}
          </nav>

          <section className="filters glass">
            <div className="filter-group">
              <label>Instituição</label>
              <select value={filters.institution} onChange={(e) => setFilters((prev) => ({ ...prev, institution: e.target.value }))}>
                <option value="">Todas</option>
                {institutions.map((institution) => (
                  <option key={institution} value={institution}>
                    {institution}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <label>Tipo RF</label>
              <select value={filters.rf_type} onChange={(e) => setFilters((prev) => ({ ...prev, rf_type: e.target.value }))}>
                <option value="">Todos</option>
                {rfTypes.map((rfType) => (
                  <option key={rfType} value={rfType}>
                    {rfType}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-summary">
              <span>Carteira original</span>
              <strong>{money(baseData.summary.total)}</strong>
            </div>
            <div className="filter-summary accent">
              <span>Exibição atual</span>
              <strong>{money(data.summary.total)}</strong>
            </div>
            <div className="filter-actions">
              <button type="button" className="btn ghost" onClick={() => setFilters({ institution: "", rf_type: "" })}>
                Limpar filtros
              </button>
              <span className="muted">
                {data.summary.holdings_count} de {baseData.summary.holdings_count} posições
              </span>
            </div>
          </section>

          <div className="content-body">{currentView}</div>
        </main>
      </div>

      {drawerOpen && (
        <div className="drawer open" onClick={(ev) => ev.target === ev.currentTarget && closeDrawer()}>
          <div className="drawer-card glass">
            <div className="card-head">
              <div>
                <h2>Entrada manual</h2>
                <span className="muted">Edite qualquer campo sem depender da planilha</span>
              </div>
              <button className="icon-btn" type="button" onClick={closeDrawer}>
                Fechar
              </button>
            </div>
            <form className="form-grid" onSubmit={saveManual}>
              {[
                ["asset_class", "Classe"],
                ["rf_type", "Tipo RF"],
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
