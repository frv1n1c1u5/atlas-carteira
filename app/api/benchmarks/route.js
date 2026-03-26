import { NextResponse } from "next/server";

export const revalidate = 86400;

const BCB_SERIES = {
  CDI: 4189,
  IPCA: 4449,
};

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function parseDateBR(date) {
  const match = String(date || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function parseBCBSeries(items) {
  return (items || [])
    .map((item) => ({
      date: parseDateBR(item.data),
      value: toNumber(item.valor),
    }))
    .filter((item) => item.date && item.value !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function compoundPercent(values) {
  if (!values?.length) return null;
  const factor = values.reduce((acc, value) => acc * (1 + value / 100), 1);
  return (factor - 1) * 100;
}

function compoundDailyAnnualized(values) {
  if (!values?.length) return null;
  const factor = values.reduce((acc, annualRate) => acc * Math.pow(1 + annualRate / 100, 1 / 252), 1);
  return (factor - 1) * 100;
}

function monthlyWindow(series, months) {
  return series.slice(Math.max(0, series.length - months));
}

function calcMonthlyMetrics(series) {
  if (!series.length) return { month: null, year: null };
  const last = series[series.length - 1].value;
  const year = compoundPercent(monthlyWindow(series, 12).map((item) => item.value));
  return { month: last, year };
}

function calcDailyAnnualizedMetrics(series) {
  if (!series.length) return { month: null, year: null };
  const latest = series[series.length - 1];
  const latestDate = new Date(`${latest.date}T00:00:00Z`);
  const monthStart = asISODate(addMonths(latestDate, -1));
  const yearStart = asISODate(addMonths(latestDate, -12));
  const month = compoundDailyAnnualized(series.filter((item) => item.date > monthStart && item.date <= latest.date).map((item) => item.value));
  const year = compoundDailyAnnualized(series.filter((item) => item.date > yearStart && item.date <= latest.date).map((item) => item.value));
  return { month, year };
}

function addMonths(date, delta) {
  const out = new Date(date);
  out.setMonth(out.getMonth() + delta);
  return out;
}

function asISODate(date) {
  return date.toISOString().slice(0, 10);
}

function getValueOnOrBefore(points, targetDate) {
  let candidate = null;
  for (const point of points) {
    if (point.date <= targetDate) candidate = point;
    else break;
  }
  return candidate;
}

function calcIbovMetrics(result) {
  const timestamps = result?.timestamp || [];
  const closes = result?.indicators?.quote?.[0]?.close || [];
  const points = timestamps
    .map((ts, idx) => {
      const close = closes[idx];
      if (close === null || close === undefined) return null;
      return {
        date: asISODate(new Date(ts * 1000)),
        value: Number(close),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!points.length) return { month: null, year: null };

  const latest = points[points.length - 1];
  const monthBase = getValueOnOrBefore(points, asISODate(addMonths(new Date(`${latest.date}T00:00:00Z`), -1)));
  const yearBase = getValueOnOrBefore(points, asISODate(addMonths(new Date(`${latest.date}T00:00:00Z`), -12)));
  const month = monthBase ? ((latest.value / monthBase.value - 1) * 100) : null;
  const year = yearBase ? ((latest.value / yearBase.value - 1) * 100) : null;
  return { month, year };
}

async function fetchJson(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Falha ao buscar ${url}`);
  }
  return res.json();
}

async function loadBenchmarks() {
  const [cdiRaw, ipcaRaw, ibovRaw] = await Promise.all([
    fetchJson(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${BCB_SERIES.CDI}/dados?formato=json`, {
      next: { revalidate: 86400 },
    }),
    fetchJson(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${BCB_SERIES.IPCA}/dados?formato=json`, {
      next: { revalidate: 86400 },
    }),
    fetchJson("https://query1.finance.yahoo.com/v8/finance/chart/%5EBVSP?range=2y&interval=1d&includePrePost=false&events=div%2Csplits", {
      next: { revalidate: 86400 },
    }),
  ]);

  const ibovResult = ibovRaw?.chart?.result?.[0];
  const items = {
    CDI: {
      label: "CDI",
      source: "BCB / Selic a.a. (proxy)",
      ...calcDailyAnnualizedMetrics(parseBCBSeries(cdiRaw)),
    },
    IPCA: {
      label: "IPCA",
      source: "IBGE / BCB 4449",
      ...calcMonthlyMetrics(parseBCBSeries(ipcaRaw)),
    },
    IBOV: {
      label: "IBOV",
      source: "Yahoo Finance",
      ...calcIbovMetrics(ibovResult),
    },
  };

  return {
    updated_at: new Date().toISOString(),
    items,
  };
}

export async function GET() {
  try {
    const payload = await loadBenchmarks();
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        updated_at: new Date().toISOString(),
        items: null,
        error: "Não foi possível carregar os benchmarks no momento.",
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=300",
        },
      }
    );
  }
}
