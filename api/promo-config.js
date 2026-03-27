import { google } from "googleapis";

const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 60000);

let cache = {
  data: null,
  expiresAt: 0,
  lastSuccessAt: 0
};

function corsHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function setResponseHeaders(res) {
  const headers = corsHeaders();
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  res.setHeader(
    "Cache-Control",
    "public, s-maxage=60, stale-while-revalidate=300"
  );
}

function normaliseHeader(h) {
  return String(h || "").trim().toLowerCase();
}

function toBool(v) {
  return String(v || "").trim().toLowerCase() === "true";
}

function toStr(v) {
  return String(v ?? "").trim();
}

function toNum(v, fallback = 0) {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : fallback;
}

function splitCsv(v) {
  return String(v || "")
    .split(/[\n,]+/g)
    .map(x => String(x || "").trim())
    .filter(Boolean);
}

function isAllToken(v) {
  const s = String(v || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "");
  return s === "all" || s === "global";
}

function normalisePidList(values) {
  const list = (values || []).map(x => String(x || "").trim()).filter(Boolean);
  if (!list.length) return [];
  if (list.some(isAllToken)) return ["__ALL__"];
  return list.map(x => x.toUpperCase());
}

function normaliseKeywordList(values) {
  const list = (values || []).map(x => String(x || "").trim()).filter(Boolean);
  if (!list.length) return [];
  if (list.some(isAllToken)) return ["__ALL__"];
  return list.map(x => x.toLowerCase());
}

function normaliseCampaignSiteList(values) {
  const list = (values || []).map(x => String(x || "").trim()).filter(Boolean);
  if (!list.length) return [];
  if (list.some(isAllToken)) return ["__ALL__"];
  return list.map(x => x.toLowerCase());
}

function rowToFields(headers, row) {
  const out = {};
  for (let i = 0; i < headers.length; i++) {
    const key = normaliseHeader(headers[i]);
    if (!key) continue;
    out[key] = row[i] ?? "";
  }
  return out;
}

function buildResponseFromValues(values) {
  if (!values.length) {
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      rules: []
    };
  }

  const headerRow = values[0] || [];
  const rows = values.slice(1);

  const required = ["enabled", "rule_id", "region", "message", "start_utc", "end_utc"];
  const headerSet = new Set(headerRow.map(normaliseHeader));
  const missing = required.filter(k => !headerSet.has(k));

  if (missing.length) {
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      rules: [],
      warning: `Missing required headers: ${missing.join(", ")}`
    };
  }

  const rules = [];

  rows.forEach((row, idx) => {
    if (!row || row.length === 0) return;

    const fields = rowToFields(headerRow, row);

    const productIdsRaw = splitCsv(fields.product_ids);
    const excludeIdsRaw = splitCsv(fields.exclude_product_ids);
    const categoryKeywordsRaw = splitCsv(fields.category_keywords);
    const campaignSiteRaw = splitCsv(fields.campaign_site);

    const productIds = normalisePidList(productIdsRaw);
    const excludeProductIds = normalisePidList(excludeIdsRaw);
    const categoryKeywords = normaliseKeywordList(categoryKeywordsRaw);
    const campaignSite = normaliseCampaignSiteList(campaignSiteRaw);

    const effectiveProductIds = productIds.length ? productIds : ["__ALL__"];

    const rule = {
      enabled: toBool(fields.enabled),
      ruleId: toStr(fields.rule_id),

      productIds: effectiveProductIds,
      excludeProductIds,
      categoryKeywords,
      campaignSite,

      region: toStr(fields.region),
      message: toStr(fields.message),
      startUtc: toStr(fields.start_utc),
      endUtc: toStr(fields.end_utc),

      priority: toNum(fields.priority, 0),

      code: toStr(fields.code),
      showCode: toBool(fields.show_code),

      rowNumber: idx + 2
    };

    const isValid =
      rule.enabled &&
      rule.ruleId &&
      rule.region &&
      rule.message &&
      rule.startUtc &&
      rule.endUtc;

    if (isValid) rules.push(rule);
  });

  rules.sort((a, b) => (b.priority || 0) - (a.priority || 0));

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    cacheTtlMs: CACHE_TTL_MS,
    rules
  };
}

async function fetchSheetValues() {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const range = process.env.GOOGLE_SHEET_RANGE || "Rules!A1:Z1000";

  if (!spreadsheetId) {
    throw new Error("Missing GOOGLE_SHEET_ID");
  }

  if (!process.env.GOOGLE_CLIENT_EMAIL) {
    throw new Error("Missing GOOGLE_CLIENT_EMAIL");
  }

  if (!process.env.GOOGLE_PRIVATE_KEY) {
    throw new Error("Missing GOOGLE_PRIVATE_KEY");
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  });

  const sheets = google.sheets({ version: "v4", auth });

  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    majorDimension: "ROWS"
  });

  return resp.data.values || [];
}

export default async function handler(req, res) {
  setResponseHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      error: true,
      message: "Method not allowed"
    });
  }

  try {
    const now = Date.now();
    const forceRefresh = String(req.query.refresh || "").trim() === "1";
    const cacheIsFresh =
      !!cache.data &&
      cache.expiresAt > now;

    if (!forceRefresh && cacheIsFresh) {
      return res.status(200).json({
        ...cache.data,
        cached: true,
        stale: false,
        cacheExpiresAt: new Date(cache.expiresAt).toISOString(),
        lastSuccessAt: cache.lastSuccessAt
          ? new Date(cache.lastSuccessAt).toISOString()
          : null
      });
    }

    const values = await fetchSheetValues();
    const payload = buildResponseFromValues(values);

    cache = {
      data: payload,
      expiresAt: now + CACHE_TTL_MS,
      lastSuccessAt: now
    };

    return res.status(200).json({
      ...payload,
      cached: false,
      stale: false,
      cacheExpiresAt: new Date(cache.expiresAt).toISOString(),
      lastSuccessAt: new Date(cache.lastSuccessAt).toISOString()
    });
  } catch (e) {
    if (cache.data) {
      return res.status(200).json({
        ...cache.data,
        cached: true,
        stale: true,
        warning: "Serving stale cache because Google Sheets read failed",
        details: String(e?.message || e),
        cacheExpiresAt: new Date(cache.expiresAt).toISOString(),
        lastSuccessAt: cache.lastSuccessAt
          ? new Date(cache.lastSuccessAt).toISOString()
          : null
      });
    }

    return res.status(500).json({
      error: true,
      message: "Failed to read Google Sheet",
      details: String(e?.message || e)
    });
  }
}
