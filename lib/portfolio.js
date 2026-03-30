import * as XLSX from "xlsx";

const KNOWN_CLASSES = new Set(["RF", "RV", "FUNDOS", "OUTROS"]);
const FGC_TYPES = new Set(["CDB", "LCI", "LCA", "RDB", "DPGE"]);
const FGC_MAX = 250000;
const FUND_HINTS = new Set(["fii", "fundo", "infra", "imobili", "multimerc", "credito", "crédito", "fip", "fiagro"]);
const RF_HINTS = new Set(["cdb", "lci", "lca", "rdb", "cra", "cri", "deb", "debenture", "lf", "ntn-b", "ntnb", "tesouro", "tpf"]);
const INDEXER_MAP = [
  ["cdi", "CDI"],
  ["ipca", "IPCA"],
  ["prefix", "Prefixado"],
  ["prefixado", "Prefixado"],
];
const INSTITUTIONS = [
  ["xp", "XP"],
  ["safra", "Safra"],
  ["btg", "BTG"],
  ["itau", "Itaú"],
  ["bb", "BB"],
  ["brb", "BRB"],
  ["bmg", "BMG"],
  ["picpay", "PicPay"],
  ["original", "Original"],
  ["facta", "Facta Financeira"],
  ["pine", "Pine"],
  ["semear", "Semear"],
  ["bocom bbm", "Bocom BBM"],
  ["equatorial", "Equatorial Goiás"],
  ["iguá", "Iguá"],
  ["iguatemi", "Iguatemi"],
  ["rabobank", "Rabobank"],
  ["digimais", "Digimais"],
  ["neon", "Neon Financeira"],
  ["lebes", "Lebes Financeira"],
  ["arbi", "Banco Arbi"],
  ["nordeste", "Banco do Nordeste"],
  ["bdmg", "BDMG"],
  ["sabesp", "Sabesp"],
  ["einstein", "Albert Einstein"],
];

function slug(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function txt(value) {
  return value === null || value === undefined || value === "" ? "" : String(value).trim();
}

function money(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value;
  const s = txt(value).replace(/R\$/gi, "").replace(/\./g, "").replace(/\s/g, "").replace(/,/g, ".");
  const clean = s.replace(/[^0-9.-]/g, "");
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

function pct(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value;
  const match = txt(value).replace(/%/g, "").match(/(\d+(?:[.,]\d+)?)/);
  return match ? Number(match[1].replace(",", ".")) : null;
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = txt(value);
  const patterns = [
    /^(\d{2})\.(\d{2})\.(\d{2})$/,
    /^(\d{2})\.(\d{2})\.(\d{4})$/,
    /^(\d{2})\/(\d{2})\/(\d{2})$/,
    /^(\d{2})\/(\d{2})\/(\d{4})$/,
    /^(\d{4})-(\d{2})-(\d{2})$/,
  ];
  for (const p of patterns) {
    const m = s.match(p);
    if (!m) continue;
    if (p === patterns[4]) return `${m[1]}-${m[2]}-${m[3]}`;
    const day = m[1];
    const month = m[2];
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${month}-${day}`;
  }
  return null;
}

function parseLiquidity(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value;
  const match = txt(value).toLowerCase().replace(/\s/g, "").match(/d\+?(\d+)/);
  if (match) return Number(match[1]);
  const raw = txt(value).match(/(\d+)/);
  return raw ? Number(raw[1]) : null;
}

function detectDelimiter(text) {
  const sample = String(text || "").split(/\r?\n/).find((line) => line.trim()) || "";
  const counts = [
    [";", (sample.match(/;/g) || []).length],
    [",", (sample.match(/,/g) || []).length],
    ["\t", (sample.match(/\t/g) || []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][0];
}

function parseDelimitedText(text) {
  const clean = String(text || "").replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(clean);
  return clean
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const cells = [];
      let cell = "";
      let quoted = false;
      for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        const next = line[i + 1];
        if (ch === '"') {
          if (quoted && next === '"') {
            cell += '"';
            i += 1;
          } else {
            quoted = !quoted;
          }
          continue;
        }
        if (ch === delimiter && !quoted) {
          cells.push(cell.trim());
          cell = "";
        } else {
          cell += ch;
        }
      }
      cells.push(cell.trim());
      return cells;
    });
}

function normalizeInstitution(value) {
  const s = slug(value);
  for (const [key, name] of INSTITUTIONS) {
    if (s.includes(key)) return name;
  }
  return txt(value);
}

function normalizeIndexer(...values) {
  const s = slug(values.filter(Boolean).join(" "));
  for (const [key, name] of INDEXER_MAP) {
    if (s.includes(key)) return name;
  }
  return "";
}

function isPrefixMarker(value) {
  const s = slug(value);
  return /(^|[^a-z0-9])(pre|prefix|prefixado)([^a-z0-9]|$)/.test(` ${s} `);
}

function inferRfIndexer(rateText = "", name = "", assetClass = "", prefixMarker = "") {
  const s = slug(`${rateText} ${name}`);
  if (/(^|[^a-z0-9])ipca([^a-z0-9]|$)/.test(` ${s} `)) return "IPCA";
  if (/(^|[^a-z0-9])cdi([^a-z0-9]|$)/.test(` ${s} `)) return "CDI";
  if (isPrefixMarker(rateText) || isPrefixMarker(prefixMarker)) return "Prefixado";
  return "";
}

function inferRfType(value, name = "") {
  const raw = txt(value).toUpperCase();
  const candidate = raw || txt(name).toUpperCase();
  if (["CDB", "LCI", "LCA", "RDB", "DPGE", "CRA", "CRI", "DEB", "DEBENTURE", "LF", "TPF", "NTN-B", "NTNB", "TESOURO"].includes(candidate)) {
    return candidate.replace("DEBENTURE", "DEB").replace("NTNB", "NTN-B").replace("TESOURO", "TPF");
  }
  const s = slug(`${value} ${name}`);
  for (const token of RF_HINTS) {
    if (s.includes(token)) return token.toUpperCase();
  }
  return "";
}

function looksLikeFund(value = "", extra = "") {
  const s = slug(`${value} ${extra}`);
  return Array.from(FUND_HINTS).some((token) => s.includes(token));
}

function normalizeClass(value, ticker = "", name = "") {
  const raw = txt(value).toUpperCase();
  if (KNOWN_CLASSES.has(raw)) return raw;
  const s = slug(`${value} ${ticker} ${name}`);
  if (ticker) return "RV";
  if (looksLikeFund(s, ticker) || looksLikeFund(name)) return "FUNDOS";
  if (s.includes("acao") || s.includes("ações") || s.includes("acoes")) return "RV";
  if (Array.from(RF_HINTS).some((token) => s.includes(token))) return "RF";
  return "OUTROS";
}

function header(value) {
  return new Set([
    "cliente",
    "client",
    "nome cliente",
    "nome do cliente",
    "tipo",
    "tipo rf",
    "classe",
    "ativo",
    "produto",
    "emissor",
    "instituicao",
    "instituição",
    "taxa",
    "indexador",
    "rentabilidade",
    "vencimento",
    "vcto",
    "venc",
    "valor",
    "saldo",
    "valor atual",
    "liquidez",
    "carencia",
    "ticker",
    "nome",
    "data de aquisicao",
    "data aquisicao",
  ]).has(slug(value));
}

function isLikelyClientLabel(value) {
  const raw = txt(value);
  const s = slug(raw);
  if (!raw) return false;
  if (header(raw)) return false;
  if (/(renda|fixa|variavel|variável|fundos|outros|tipo|classe|emissor|nome|ticker|valor|saldo|taxa|venc|liquidez|carencia|carência|index)/.test(s)) return false;
  if (/\d/.test(raw)) return false;
  if (raw.length > 48) return false;
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length > 4) return false;
  return raw === raw.toUpperCase() || /^[A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*$/.test(raw);
}

function sectionHint(sheetName, rowValues, startCol) {
  const text = slug(rowValues.slice(Math.max(0, startCol - 3), startCol + 1).join(" "));
  const sheet = slug(sheetName);
  if (text.includes("renda variavel") || sheet.includes("renda variavel")) return "RV";
  if (text.includes("fund") || sheet.includes("fund")) return "FUNDOS";
  if (text.includes("outro") || sheet.includes("outro")) return "OUTROS";
  if (text.includes("renda fixa") || sheet.includes("renda fixa")) return "RF";
  return "";
}

function detectSections(sheet) {
  const sections = [];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });
  rows.forEach((values, idx) => {
    const headers = values
      .map((value, col) => ({ col: col + 1, value: txt(value) }))
      .filter((item) => header(item.value));
    if (headers.length < 2) return;
    let block = [headers[0]];
    for (const item of headers.slice(1)) {
      if (item.col === block[block.length - 1].col + 1) {
        block.push(item);
      } else {
        if (block.length >= 2) {
          sections.push({
            row: idx + 1,
            start: block[0].col,
            end: block[block.length - 1].col,
            headers: block.map((h) => h.value),
            hint: sectionHint(sheet["!name"], values, block[0].col - 1),
          });
        }
        block = [item];
      }
    }
    if (block.length >= 2) {
      sections.push({
        row: idx + 1,
        start: block[0].col,
        end: block[block.length - 1].col,
        headers: block.map((h) => h.value),
        hint: sectionHint(sheet["!name"], values, block[0].col - 1),
      });
    }
  });
  return sections;
}

function pick(headers, ...candidates) {
  const low = headers.map((h) => slug(h));
  for (const cand of candidates) {
    const c = slug(cand);
    const idx = low.findIndex((h) => h === c || h.includes(c));
    if (idx >= 0) return idx;
  }
  return null;
}

function parseSection(section, rowValues, clientName = "") {
  const headers = section.headers;
  const vals = rowValues.slice(section.start - 1, section.start - 1 + headers.length);
  if (!vals.some((v) => v !== null && v !== undefined && v !== "")) return null;

  const slugged = headers.map((h) => slug(h));

  if (slugged.includes("ticker")) {
    const iTicker = pick(headers, "ticker");
    const iVal = pick(headers, "valor");
    const iName = pick(headers, "nome");
    if (iTicker === null || iVal === null) return null;
    const ticker = txt(vals[iTicker]);
    if (!ticker) return null;
    const issuer = iName !== null ? txt(vals[iName]) : "";
    return {
      asset_class: "RV",
      client_name: txt(clientName),
      institution: issuer,
      issuer: issuer || ticker,
      ticker,
      name: ticker,
      indexer: "",
      rf_type: "",
      fgc_eligible: false,
      rate: null,
      maturity: null,
      current_value: money(vals[iVal]),
      liquidity_days: null,
      acquisition_date: null,
      cost_value: null,
      source: "upload",
      section: section.hint || "RV",
    };
  }

  if (["tipo", "classe", "emissor", "taxa", "vencimento"].some((h) => slugged.includes(h))) {
    const iTipo = pick(headers, "tipo", "tipo rf", "classe", "ativo", "produto");
    const iEmissor = pick(headers, "emissor", "instituicao", "instituição", "nome");
    const iTaxa = pick(headers, "taxa", "indexador", "rentabilidade");
    const iVenc = pick(headers, "vencimento", "vcto", "venc");
    const iVal = pick(headers, "valor", "saldo", "valor atual", "atual");
    const iLiq = pick(headers, "liquidez", "carencia", "carência");
    const iNome = pick(headers, "nome", "ativo", "produto", "ticker");
    const iAcq = pick(headers, "data de aquisicao", "data aquisicao", "aquisição", "data aquisição");
    const name = iNome !== null ? txt(vals[iNome]) : "";
    const rfType = inferRfType(iTipo !== null ? vals[iTipo] : "", name);
    const assetClass = normalizeClass(iTipo !== null ? vals[iTipo] : "", "", name);
    const rateText = iTaxa !== null ? txt(vals[iTaxa]) : "";
    const indexer = inferRfIndexer(rateText, name, assetClass);
    const fgcEligible = rfType ? FGC_TYPES.has(slug(rfType).toUpperCase()) : false;
    return {
      asset_class: assetClass,
      client_name: txt(clientName),
      institution: iEmissor !== null ? txt(vals[iEmissor]) : "",
      issuer: iEmissor !== null ? txt(vals[iEmissor]) : "",
      ticker: "",
      name: name || (iEmissor !== null ? txt(vals[iEmissor]) : ""),
      indexer,
      rf_type: rfType,
      fgc_eligible: assetClass === "RF" ? fgcEligible : false,
      rate: pct(rateText),
      maturity: iVenc !== null ? parseDate(vals[iVenc]) : null,
      current_value: iVal !== null ? money(vals[iVal]) : null,
      liquidity_days: iLiq !== null ? parseLiquidity(vals[iLiq]) : null,
      acquisition_date: iAcq !== null ? parseDate(vals[iAcq]) : null,
      cost_value: null,
      source: "upload",
      section: section.hint || assetClass,
    };
  }

  if (slugged.includes("nome")) {
    const iNome = pick(headers, "nome", "ativo", "produto", "ticker");
    const iVal = pick(headers, "valor", "saldo", "valor atual", "atual");
    const iLiq = pick(headers, "liquidez", "carencia", "carência");
    if (iNome === null || iVal === null) return null;
    const name = txt(vals[iNome]);
    const value = money(vals[iVal]);
    if (!name || value === null) return null;
    return {
      asset_class: section.hint === "FUNDOS" || looksLikeFund(name, section.hint) ? "FUNDOS" : "OUTROS",
      client_name: txt(clientName),
      institution: "",
      issuer: name,
      ticker: "",
      name,
      indexer: "",
      rf_type: "",
      fgc_eligible: false,
      rate: null,
      maturity: null,
      current_value: value,
      liquidity_days: iLiq !== null ? parseLiquidity(vals[iLiq]) : null,
      acquisition_date: null,
      cost_value: null,
      source: "upload",
      section: section.hint || "OUTROS",
    };
  }

  return null;
}

export async function parseUploadedFile(file) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!["xlsx", "xlsm", "xls", "csv", "txt"].includes(ext)) {
    throw new Error("Formato não suportado. Use XLSX ou CSV.");
  }

  if (["csv", "txt"].includes(ext)) {
    const text = await file.text();
    const rows = parseDelimitedText(text);
    const headers = rows.shift() || [];
    return rows.map((cols) => normalizeRow(Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? ""]))));
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const rows = [];
  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const sections = detectSections(sheet);
    const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });
    let currentClient = "";
    sections.forEach((section) => {
      for (let i = section.row; i < grid.length; i += 1) {
        const rowValues = grid[i] || [];
        const prefix = rowValues.slice(0, Math.max(0, section.start - 1)).map(txt).filter(Boolean);
        const candidateClient = prefix[prefix.length - 1] || "";
        if (candidateClient && isLikelyClientLabel(candidateClient)) {
          currentClient = candidateClient;
        }
        const parsed = parseSection(section, rowValues, currentClient);
        if (parsed) rows.push(parsed);
      }
    });
  });
  return rows;
}

export function normalizeRow(row) {
  const lower = Object.fromEntries(
    Object.entries(row || {}).map(([key, value]) => [slug(key), value])
  );
  const ticker = txt(lower.ticker);
  const name = txt(lower.nome || lower.name || ticker);
  const assetClass = normalizeClass(
    lower["asset class"] || lower.classe || lower.tipo || lower.asset_class || lower.produto || lower.ativo || "",
    ticker,
    name
  );
  const issuer = normalizeInstitution(lower.emissor || lower.issuer || lower.instituicao || lower["instituição"] || "");
  const clientName = txt(lower.cliente || lower.client || lower["nome cliente"] || lower["nome do cliente"] || lower["client name"]);
  const rfType = inferRfType(lower["rf type"] || lower["tipo rf"] || lower.tipo || lower.classe || lower.produto, name);
  const fgcEligible = assetClass === "RF" ? FGC_TYPES.has(slug(rfType).toUpperCase()) : false;
  const indexer = inferRfIndexer(lower.taxa || lower.rate || lower.rentabilidade, name, assetClass) || normalizeIndexer(lower.indexer, lower.indexador);
  return {
    asset_class: assetClass,
    client_name: clientName,
    institution: normalizeInstitution(lower.institution || lower.instituicao || issuer),
    issuer: txt(lower.emissor || lower.issuer || issuer),
    ticker,
    name,
    indexer: txt(lower.indexer || lower.indexador || indexer),
    rf_type: rfType,
    fgc_eligible: fgcEligible,
    rate: pct(lower.taxa || lower.rate),
    maturity: parseDate(lower.vencimento || lower.vcto || lower.venc || lower.maturity),
    current_value: money(lower.valor || lower.saldo || lower["current value"] || lower.current_value || lower["valor atual"]),
    liquidity_days: parseLiquidity(lower.liquidez || lower.carencia || lower["liquidity"] || lower.liquidity || lower.liquidity_days),
    acquisition_date: parseDate(
      lower["data de aquisicao"] ||
        lower["data aquisicao"] ||
        lower["aquisição"] ||
        lower["data aquisição"] ||
        lower["acquisition date"] ||
        lower.acquisition_date
    ),
    cost_value: money(lower.custo || lower["valor aquisicao"] || lower["cost value"] || lower.cost_value),
    source: row?.source || "upload",
    section: assetClass,
    id: row?.id || "",
  };
}

export function normalizeHoldings(rows) {
  return (rows || []).map((row, idx) => {
    const normalized = normalizeRow(row);
    normalized.id = row.id || `h${idx + 1}`;
    normalized.asset_class = normalizeClass(normalized.asset_class, normalized.ticker, normalized.name);
    if (normalized.asset_class !== "FUNDOS" && looksLikeFund(normalized.name, normalized.issuer)) {
      normalized.asset_class = "FUNDOS";
    }
    normalized.institution = normalizeInstitution(normalized.institution || normalized.issuer || "");
    normalized.issuer = txt(normalized.issuer || normalized.institution);
    normalized.name = txt(normalized.name || normalized.ticker || normalized.issuer);
    normalized.client_name = txt(normalized.client_name || row.client_name || row.cliente || row.client || "");
    normalized.current_value = Number(normalized.current_value || 0);
    normalized.rf_type =
      normalized.asset_class === "RF"
        ? txt(
            normalized.rf_type ||
              normalized["rf type"] ||
              normalized["tipo rf"] ||
              inferRfType(normalized.name || normalized.issuer, normalized.name)
          )
        : "";
    normalized.fgc_eligible = normalized.asset_class === "RF" ? FGC_TYPES.has(slug(normalized.rf_type).toUpperCase()) : false;
    return normalized;
  });
}

function series(holdings, key, only = null) {
  const buckets = {};
  holdings.forEach((row) => {
    if (only && row.asset_class !== only) return;
    const label = row[key] || "Não informado";
    buckets[label] = (buckets[label] || 0) + Number(row.current_value || 0);
  });
  const total = Object.values(buckets).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(buckets)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value, share: value / total }));
}

function maturitySeries(holdings) {
  const order = ["30 dias", "6 meses", "1 ano", "3 anos", "3+ anos", "Sem vencimento"];
  const buckets = Object.fromEntries(order.map((label) => [label, 0]));
  const today = new Date();
  holdings.forEach((row) => {
    if (row.asset_class !== "RF") return;
    if (!row.maturity) {
      buckets["Sem vencimento"] += Number(row.current_value || 0);
      return;
    }
    const dt = new Date(row.maturity);
    if (Number.isNaN(dt.getTime())) {
      buckets["Sem vencimento"] += Number(row.current_value || 0);
      return;
    }
    const diff = Math.floor((dt.getTime() - today.getTime()) / 86400000);
    const label = diff <= 30 ? "30 dias" : diff <= 180 ? "6 meses" : diff <= 365 ? "1 ano" : diff <= 1095 ? "3 anos" : "3+ anos";
    buckets[label] += Number(row.current_value || 0);
  });
  return order.map((label) => ({ label, value: buckets[label] }));
}

function indexerSeries(holdings) {
  const buckets = { CDI: 0, IPCA: 0, Prefixado: 0, "Não informado": 0 };
  holdings.forEach((row) => {
    if (row.asset_class !== "RF") return;
    const value = Number(row.current_value || 0);
    const idx = (row.indexer || "").toUpperCase();
    if (idx.includes("CDI")) buckets.CDI += value;
    else if (idx.includes("IPCA")) buckets.IPCA += value;
    else if (/(^|[^a-z0-9])(PR|PRE|PREFIX|PREFIXADO)([^a-z0-9]|$)/.test(` ${idx} `)) buckets.Prefixado += value;
    else buckets["Não informado"] += value;
  });
  const total = Object.values(buckets).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(buckets).map(([label, value]) => ({ label, value, share: value / total }));
}

function benchmarkDemo(holdings) {
  const total = holdings.reduce((acc, row) => acc + Number(row.current_value || 0), 0) || 1;
  const rf = holdings.filter((r) => r.asset_class === "RF").reduce((a, b) => a + Number(b.current_value || 0), 0);
  const rv = holdings.filter((r) => r.asset_class === "RV").reduce((a, b) => a + Number(b.current_value || 0), 0);
  const fund = holdings.filter((r) => r.asset_class === "FUNDOS").reduce((a, b) => a + Number(b.current_value || 0), 0);
  const composition = [
    { label: "Selic acumulada", value: rf * 0.68, share: (rf * 0.68) / total },
    { label: "IPCA", value: rf * 0.2, share: (rf * 0.2) / total },
    { label: "Pré", value: rf * 0.12, share: (rf * 0.12) / total },
    { label: "IBOV", value: rv + fund * 0.35, share: (rv + fund * 0.35) / total },
  ];
  const months = [
    ["Jan", 0.0075, 0.012, 0.0042, 0.0091],
    ["Fev", 0.0074, 0.01, 0.0044, 0.0088],
    ["Mar", 0.0076, 0.011, 0.0041, 0.0089],
    ["Abr", 0.0073, 0.009, 0.0043, 0.0085],
    ["Mai", 0.0077, 0.013, 0.0045, 0.0094],
    ["Jun", 0.0075, 0.008, 0.004, 0.0087],
    ["Jul", 0.0076, 0.011, 0.0042, 0.009],
    ["Ago", 0.0075, 0.012, 0.0041, 0.0092],
    ["Set", 0.0074, 0.01, 0.0043, 0.0088],
    ["Out", 0.0076, 0.009, 0.0042, 0.0089],
    ["Nov", 0.0075, 0.011, 0.0044, 0.0091],
    ["Dez", 0.0077, 0.013, 0.0045, 0.0095],
  ];
  let cdi = 100;
  let ibov = 100;
  let ipca = 100;
  let carteira = 100;
  const series = months.map(([label, s1, s2, s3, s4]) => {
    cdi *= 1 + s1;
    ibov *= 1 + s2;
    ipca *= 1 + s3;
    carteira *= 1 + s4;
    return {
      label,
      "Selic acumulada": Number(cdi.toFixed(2)),
      IBOV: Number(ibov.toFixed(2)),
      IPCA: Number(ipca.toFixed(2)),
      Carteira: Number(carteira.toFixed(2)),
    };
  });
  return { composition, series };
}

function rfTypeBreakdown(holdings) {
  const rfHoldings = holdings.filter((row) => row.asset_class === "RF");
  const buckets = {};
  rfHoldings.forEach((row) => {
    const label = row.rf_type || "Não informado";
    buckets[label] = (buckets[label] || 0) + Number(row.current_value || 0);
  });
  const total = rfHoldings.reduce((acc, row) => acc + Number(row.current_value || 0), 0) || 1;
  return Object.entries(buckets)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({
      label,
      value,
      share: value / total,
      eligible: FGC_TYPES.has(slug(label).toUpperCase()),
    }));
}

function issuerRiskRows(holdings) {
  const rfHoldings = holdings.filter((row) => row.asset_class === "RF");
  const buckets = new Map();
  rfHoldings.forEach((row) => {
    const label = row.issuer || row.name || "Não informado";
    if (!buckets.has(label)) {
      buckets.set(label, { label, value: 0, fgcEligibleValue: 0, nonFgcValue: 0 });
    }
    const bucket = buckets.get(label);
    const value = Number(row.current_value || 0);
    bucket.value += value;
    if (row.fgc_eligible) bucket.fgcEligibleValue += value;
    else bucket.nonFgcValue += value;
  });
  return Array.from(buckets.values()).sort((a, b) => b.value - a.value);
}

function generateAlerts(holdings, byIssuer, byIndexer, maturity) {
  const alerts = [];
  byIssuer.slice(0, 10).forEach((row) => {
    if (row.value > 250000 && row.fgcEligibleValue > 0) {
      alerts.push({
        severity: "danger",
        title: "FGC superado",
        detail: `Emissor ${row.label} acima de R$ 250 mil em ativos com cobertura FGC.`,
      });
    } else if (row.value > 250000 && row.nonFgcValue > 0) {
      alerts.push({
        severity: "warning",
        title: "Alta concentração sem FGC",
        detail: `Emissor ${row.label} acima de R$ 250 mil em ativos sem cobertura FGC.`,
      });
    } else if (row.value > 200000) {
      alerts.push({
        severity: "warning",
        title: "Concentração relevante",
        detail: `Exposição em ${row.label} acima de R$ 200 mil.`,
      });
    }
  });

  if (byIndexer[0] && byIndexer[0].share >= 0.7) {
    alerts.push({
      severity: "warning",
      title: "Concentração em indexador",
      detail: `${byIndexer[0].label} representa ${(byIndexer[0].share * 100).toFixed(1)}% da carteira.`,
    });
  }

  const total = holdings.reduce((acc, row) => acc + Number(row.current_value || 0), 0) || 1;
  const illiquidShare = holdings
    .filter((r) => (r.liquidity_days || 0) >= 30)
    .reduce((a, b) => a + Number(b.current_value || 0), 0) / total;
  if (illiquidShare >= 0.15) {
    alerts.push({
      severity: illiquidShare >= 0.3 ? "danger" : "warning",
      title: "Liquidez ruim",
      detail: `${(illiquidShare * 100).toFixed(1)}% da carteira está em ativos com D+30 ou superior.`,
    });
  }

  if (maturity.some((row) => row.label === "30 dias" && row.value > 0)) {
    alerts.push({ severity: "info", title: "Vencimentos próximos", detail: "Há fluxo relevante de vencimentos nos próximos 30 dias." });
  }

  if (new Set(holdings.map((r) => r.asset_class)).size <= 2) {
    alerts.push({ severity: "info", title: "Baixa diversificação", detail: "Carteira concentrada em poucas classes de ativos." });
  }

  return alerts;
}

function generateInsights(holdings, byIssuer, byIndexer) {
  const total = holdings.reduce((acc, row) => acc + Number(row.current_value || 0), 0) || 1;
  const out = [];
  if (byIssuer[0] && byIssuer[0].share >= 0.2) {
    out.push(`Alta exposição ao emissor ${byIssuer[0].label} (${(byIssuer[0].share * 100).toFixed(1)}% da carteira).`);
  }
  if (byIndexer[0]) {
    if (byIndexer[0].label === "CDI" && byIndexer[0].share >= 0.7) {
      out.push("Excesso em CDI pode reduzir ganho real em cenário de inflação persistente.");
    }
    if (byIndexer[0].label === "Prefixado" && byIndexer[0].share >= 0.7) {
      out.push("Carteira muito sensível a marcação a mercado por excesso de prefixados.");
    }
  }
  const illiquid = holdings.filter((r) => (r.liquidity_days || 0) >= 30).reduce((a, b) => a + Number(b.current_value || 0), 0);
  if (illiquid / total >= 0.15) {
    out.push("Liquidez concentrada em ativos com D+30 ou superior.");
  }
  if (new Set(holdings.map((r) => r.asset_class)).size <= 2) {
    out.push("Carteira conservadora com baixa diversificação entre classes.");
  }
  if (new Set(holdings.map((r) => r.issuer).filter(Boolean)).size <= 8) {
    out.push("Base de emissores enxuta; vale observar risco de falsa diversificação.");
  }
  return out.slice(0, 6) || ["Carteira com distribuição equilibrada dentro da amostra atual."];
}

function scorePortfolio(holdings, byIssuer, byIndexer) {
  const total = holdings.reduce((acc, row) => acc + Number(row.current_value || 0), 0) || 1;
  let score = 100;
  if (byIssuer[0]) score -= Math.min(25, byIssuer[0].share * 60);
  if (byIndexer[0]) score -= Math.min(15, byIndexer[0].share * 35);
  const illiquid = holdings.filter((r) => (r.liquidity_days || 0) >= 30).reduce((a, b) => a + Number(b.current_value || 0), 0);
  score -= Math.min(10, (illiquid / total) * 25);
  if (new Set(holdings.map((r) => r.asset_class)).size <= 2) score -= 8;
  if (new Set(holdings.map((r) => r.issuer).filter(Boolean)).size <= 5) score -= 8;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function computePortfolio(rows) {
  const holdings = normalizeHoldings(rows);
  const total = holdings.reduce((acc, row) => acc + Number(row.current_value || 0), 0);
  const byClass = series(holdings, "asset_class");
  const byClient = series(holdings, "client_name");
  const byInstitution = series(holdings, "institution");
  const byIssuer = series(holdings, "issuer");
  const byTicker = series(holdings, "ticker", "RV");
  const byFund = series(holdings, "name", "FUNDOS");
  const byIndexer = indexerSeries(holdings);
  const rfTypes = rfTypeBreakdown(holdings);
  const maturity = maturitySeries(holdings);
  const benchmark = benchmarkDemo(holdings);
  const score = scorePortfolio(holdings, byIssuer, byIndexer);
  const issuerRisk = issuerRiskRows(holdings);
  const alerts = generateAlerts(holdings, issuerRisk, byIndexer, maturity);
  const insights = generateInsights(holdings, byIssuer, byIndexer);

  const rfHoldings = holdings.filter((row) => row.asset_class === "RF");
  const fgcEligible = rfHoldings.filter((row) => row.fgc_eligible).reduce((acc, row) => acc + Number(row.current_value || 0), 0);
  const nonFgc = rfHoldings.filter((row) => !row.fgc_eligible).reduce((acc, row) => acc + Number(row.current_value || 0), 0);
  const fgcShare = fgcEligible / (rfHoldings.reduce((acc, row) => acc + Number(row.current_value || 0), 0) || 1);

  return {
    generated_at: new Date().toISOString(),
    summary: {
      total,
      holdings_count: holdings.length,
      class_count: new Set(holdings.map((r) => r.asset_class)).size,
      issuer_count: new Set(holdings.map((r) => r.issuer).filter(Boolean)).size,
      client_count: new Set(holdings.map((r) => r.client_name).filter(Boolean)).size,
      score,
    },
    holdings,
    by_class: byClass,
    by_client: byClient,
    by_institution: byInstitution,
    by_issuer: issuerRisk,
    by_indexer: byIndexer,
    by_ticker: byTicker,
    by_fund: byFund,
    rf_types: rfTypes,
    rf_fgc: {
      eligible_value: fgcEligible,
      non_eligible_value: nonFgc,
      eligible_share: fgcShare,
    },
    maturity,
    benchmark,
    alerts,
    insights,
  };
}

export const DEMO_ROWS = [
  { asset_class: "RF", rf_type: "CDB", institution: "BTG", issuer: "BTG", name: "BTG CDB", indexer: "CDI", rate: 100, maturity: "2027-11-29", current_value: 27179.8, source: "demo" },
  { asset_class: "RF", rf_type: "CDB", institution: "BTG", issuer: "BTG", name: "BTG CDB", indexer: "CDI", rate: 100, maturity: "2027-12-20", current_value: 83126.03, source: "demo" },
  { asset_class: "RF", rf_type: "CDB", institution: "Digimais", issuer: "Digimais", name: "Digimais CDB", indexer: "CDI", rate: 120, maturity: "2028-02-18", current_value: 26060.09, source: "demo" },
  { asset_class: "RF", rf_type: "CDB", institution: "Digimais", issuer: "Digimais", name: "Digimais CDB", indexer: "CDI", rate: 121, maturity: "2028-05-25", current_value: 72465.38, source: "demo" },
  { asset_class: "RF", rf_type: "CDB", institution: "Banco Arbi", issuer: "Banco Arbi", name: "Banco Arbi CDB", indexer: "CDI", rate: 114, maturity: "2031-01-20", current_value: 237121.4, source: "demo" },
  { asset_class: "RF", rf_type: "CRA", institution: "BTG", issuer: "BTG", name: "BTG CRA", indexer: "CDI", rate: 1, maturity: "2033-09-15", current_value: 149751.27, source: "demo" },
  { asset_class: "RF", rf_type: "CRI", institution: "Iguatemi", issuer: "Iguatemi", name: "Iguatemi CRI", indexer: "CDI", rate: 0.4, maturity: "2034-09-21", current_value: 92161.74, source: "demo" },
  { asset_class: "RF", rf_type: "LF", institution: "Banco do Nordeste", issuer: "Banco do Nordeste", name: "Banco do Nordeste LF", indexer: "CDI", rate: 165, maturity: "2050-08-04", current_value: 313232.84, source: "demo" },
  { asset_class: "RF", rf_type: "LF", institution: "BRB", issuer: "BRB", name: "BRB LF", indexer: "CDI", rate: 135, maturity: "2028-10-19", current_value: 519326.38, source: "demo" },
  { asset_class: "RF", rf_type: "CDB", institution: "BMG", issuer: "BMG", name: "BMG CDB", indexer: "CDI", rate: 15.3, maturity: "2026-06-08", current_value: 142037.83, liquidity_days: 30, source: "demo" },
  { asset_class: "RF", rf_type: "CDB", institution: "PicPay", issuer: "PicPay", name: "PicPay CDB", indexer: "CDI", rate: 15.7, maturity: "2028-10-30", current_value: 19965.56, liquidity_days: 15, source: "demo" },
  { asset_class: "RF", rf_type: "CDB", institution: "Original", issuer: "Original", name: "Original CDB", indexer: "CDI", rate: 13.52, maturity: "2027-06-21", current_value: 210537.24, liquidity_days: 15, source: "demo" },
  { asset_class: "RF", rf_type: "CDB", institution: "Facta Financeira", issuer: "Facta Financeira", name: "Facta Financeira CDB", indexer: "CDI", rate: 16.8, maturity: "2026-11-30", current_value: 44101.61, liquidity_days: 15, source: "demo" },
  { asset_class: "RF", rf_type: "CDB", institution: "Semear", issuer: "Semear", name: "Semear CDB", indexer: "CDI", rate: 16.7, maturity: "2027-04-15", current_value: 65020.18, liquidity_days: 15, source: "demo" },
  { asset_class: "RF", rf_type: "DEB", institution: "Equatorial Goiás", issuer: "Equatorial Goiás", name: "Equatorial Goiás DEB", indexer: "IPCA", rate: 7.1, maturity: "2031-04-15", current_value: 212506.29, liquidity_days: 30, source: "demo" },
  { asset_class: "RF", rf_type: "DEB", institution: "Igua", issuer: "Iguá", name: "Igua DEB", indexer: "IPCA", rate: 7.4, maturity: "2043-05-15", current_value: 555597.94, liquidity_days: 30, source: "demo" },
  { asset_class: "RV", institution: "", issuer: "BODB11", ticker: "BODB11", name: "BODB11", current_value: 18879.38, source: "demo" },
  { asset_class: "RV", institution: "", issuer: "GZIT11", ticker: "GZIT11", name: "GZIT11", current_value: 76248, source: "demo" },
  { asset_class: "RV", institution: "", issuer: "BDIF11", ticker: "BDIF11", name: "BDIF11", current_value: 136952.66, source: "demo" },
  { asset_class: "RV", institution: "", issuer: "PLPL3", ticker: "PLPL3", name: "PLPL3", current_value: 146948.86, source: "demo" },
  { asset_class: "FUNDOS", institution: "BTG", issuer: "BTG Pactual Infra", name: "BTG Pactual Infra", current_value: 101634.9, liquidity_days: 10, source: "demo" },
  { asset_class: "FUNDOS", institution: "Safra", issuer: "Safra Infra conceito", name: "Safra Infra conceito", current_value: 918042.79, liquidity_days: 30, source: "demo" },
  { asset_class: "FUNDOS", institution: "Safra", issuer: "Safra CAPMKT Infra", name: "Safra CAPMKT Infra", current_value: 501192.98, liquidity_days: 30, source: "demo" },
];
