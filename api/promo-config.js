import { google } from "googleapis";

function corsHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function parseBool(v) {
  return String(v || "").trim().toLowerCase() === "true";
}

function splitCsv(v) {
  return String(v || "")
    .split(",")
    .map(x => x.trim())
    .filter(Boolean);
}

export default async function handler(req, res) {
  const headers = corsHeaders();

  if (req.method === "OPTIONS") {
    Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(204).end();
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
    });

    const sheets = google.sheets({ version: "v4", auth });

    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const range = process.env.GOOGLE_SHEET_RANGE || "Rules!A1:H1000";

    const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const values = resp.data.values || [];

    const [headerRow, ...rows] = values;

    const rules = (rows || []).map(row => {
      const obj = {};
      (headerRow || []).forEach((h, i) => (obj[h] = row[i] ?? ""));
      return {
        enabled: parseBool(obj.enabled),
        ruleId: String(obj.rule_id || "").trim(),
        productIds: splitCsv(obj.product_ids),
        region: String(obj.region || "").trim().toUpperCase(),
        message: String(obj.message || "").trim(),
        startUtc: String(obj.start_utc || "").trim(),
        endUtc: String(obj.end_utc || "").trim(),
        priority: Number(obj.priority || 0)
      };
    });

    const cleaned = rules
      .filter(r => r.enabled && r.ruleId && r.region && r.message && r.productIds.length && r.startUtc && r.endUtc)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));

    Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).json({
      version: 1,
      generatedAt: new Date().toISOString(),
      rules: cleaned
    });
  } catch (e) {
    Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(500).json({
      error: true,
      message: "Failed to read Google Sheet",
      details: e.message
    });
  }
}