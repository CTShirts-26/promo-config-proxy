import { put } from "@vercel/blob";

// ─────────────────────────────────────────────────────────────
// All helper functions reused verbatim from promo-config.js
// Output shape is identical — Bloomreach script needs no changes
// ─────────────────────────────────────────────────────────────

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
    return { version: 1, generatedAt: new Date().toISOString(), rules: [] };
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

    const productIds = normalisePidList(splitCsv(fields.product_ids));
    const excludeProductIds = normalisePidList(splitCsv(fields.exclude_product_ids));
    const categoryKeywords = normaliseKeywordList(splitCsv(fields.category_keywords));
    const campaignSite = normaliseCampaignSiteList(splitCsv(fields.campaign_site));

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
    rules
  };
}

// ─────────────────────────────────────────────────────────────
// Webhook — receives rows POSTed by Apps Script,
// runs them through buildResponseFromValues(),
// writes promos.json to Vercel Blob (served as static CDN file)
// ─────────────────────────────────────────────────────────────

const SECRET = process.env.WEBHOOK_SECRET;

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: true, message: "Method not allowed" });
  }

  const { secret, rows } = req.body || {};

  if (!secret || secret !== SECRET) {
    return res.status(401).json({ error: true, message: "Unauthorised" });
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: true, message: "rows must be a non-empty array" });
  }

  try {
    const headers = Object.keys(rows[0]);
    const valueRows = rows.map(row => headers.map(h => row[h] ?? ""));
    const values = [headers, ...valueRows];

    const payload = buildResponseFromValues(values);

    await put(
      "promos.json",
      JSON.stringify(payload, null, 2),
      {
        access: "public",
        contentType: "application/json; charset=utf-8",
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 0
      }
    );

    console.log(`[update-promos] Wrote ${payload.rules.length} rules — ${payload.generatedAt}`);

    return res.status(200).json({
      ok: true,
      count: payload.rules.length,
      generatedAt: payload.generatedAt,
      ...(payload.warning ? { warning: payload.warning } : {})
    });

  } catch (err) {
    console.error("[update-promos] Error:", err);
    return res.status(500).json({ error: true, message: "Internal server error", detail: err.message });
  }
}
