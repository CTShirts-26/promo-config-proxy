import { put } from "@vercel/blob";

// ─────────────────────────────────────────────────────────────
// AW26 Bloomreach sheet — column index map
// Rows 1-3 = merged group headers
// Row 4    = column headers (Apps Script sends as data[3])
// Row 5+   = campaign data (Apps Script sends as data.slice(4))
//
// IMPORTANT: Apps Script must send rows as ARRAYS not objects
// so columns are addressable by index. See promo-trigger.gs update.
// ─────────────────────────────────────────────────────────────

const SECRET = process.env.WEBHOOK_SECRET;

function v(row, i)  { return String(row[i] ?? "").trim(); }
function tb(row, i) { return v(row, i).toUpperCase() === "TRUE"; }

function bannerstrip(row, b1,b2,b3,b1et,b2et,b3et,b1af,b2af,b3af,b1afet,b2afet,b3afet) {
  return {
    line1: v(row,b1), line2: v(row,b2), line3: v(row,b3),
    line1_endsTonight: v(row,b1et), line2_endsTonight: v(row,b2et), line3_endsTonight: v(row,b3et),
    line1_affiliate: v(row,b1af), line2_affiliate: v(row,b2af), line3_affiliate: v(row,b3af),
    line1_affiliateEndsTonight: v(row,b1afet),
    line2_affiliateEndsTonight: v(row,b2afet),
    line3_affiliateEndsTonight: v(row,b3afet),
  };
}

function callout(row, d, et, af, afet) {
  return {
    default:              v(row, d),
    endsTonight:          et   != null ? v(row, et)   : "",
    affiliate:            af   != null ? v(row, af)   : "",
    affiliateEndsTonight: afet != null ? v(row, afet) : "",
  };
}

function emptyCallout() {
  return { default: "", endsTonight: "", affiliate: "", affiliateEndsTonight: "" };
}

function contentBlock(row,
  b1,b2,b3,b1et,b2et,b3et,b1af,b2af,b3af,b1afet,b2afet,b3afet,
  tib_d, tib_et, tib_af, tib_afet,
  plp_d, plp_af,
  showPdp, showPlp
) {
  return {
    showOnPdp:   showPdp,
    showOnPlp:   showPlp,
    bannerstrip: bannerstrip(row, b1,b2,b3,b1et,b2et,b3et,b1af,b2af,b3af,b1afet,b2afet,b3afet),
    tibText:     callout(row, tib_d, tib_et, tib_af, tib_afet),
    plpCallout:  { default: v(row,plp_d), endsTonight: "", affiliate: v(row,plp_af), affiliateEndsTonight: "" },
    pdpCallout:  emptyCallout(), // placeholder — no sheet column yet, ready for schema redesign
  };
}

function parseDate(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const parts = s.split("/");
  if (parts.length === 3) {
    const [d, m, y] = parts;
    return `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}T00:00:00Z`;
  }
  return s;
}

function buildRuleFromRow(row, idx) {
  const ruleId   = v(row, 0);  // TAB NAME
  const online   = tb(row, 1); // ONLINE
  const status   = v(row, 2);  // STATUS
  const startUtc = parseDate(v(row, 3)); // START DATE
  const endUtc   = parseDate(v(row, 4)); // END DATE

  // Skip disabled or completely empty rows
  if (!online || !ruleId) return null;

  const showPdp = tb(row, 292);
  const showPlp = tb(row, 293);

  return {
    ruleId,
    enabled:  online,
    status,
    startUtc,
    endUtc,

    scope: {
      bannerstrip: tb(row, 5),
      tibText:     tb(row, 6),
      plpCallout:  tb(row, 7),
      pdpCallout:  false,
    },

    countryEnabled: {
      us: tb(row,8),  ca: tb(row,9),  au: tb(row,10),
      uk: tb(row,11), de: tb(row,12), fr: tb(row,13),
      ch: tb(row,14), nl: tb(row,15), eu: tb(row,16), xbr: tb(row,17),
    },

    content: {
      us: contentBlock(row,
        18,19,20, 21,22,23, 24,25,26, 27,28,29,
        30,31,32,33, 34,35, showPdp, showPlp),

      ca: {
        en: contentBlock(row,
          36,38,40, 42,44,46, 48,50,52, 54,56,58,
          60,62,64,66, 68,70, showPdp, showPlp),
        fr: contentBlock(row,
          37,39,41, 43,45,47, 49,51,53, 55,57,59,
          61,63,65,67, 69,71, showPdp, showPlp),
      },

      au: contentBlock(row,
        72,73,74, 75,76,77, 78,79,80, 81,82,83,
        84,85,86,87, 88,89, showPdp, showPlp),

      uk: contentBlock(row,
        90,91,92, 93,94,95, 96,97,98, 99,100,101,
        102,103,104,105, 106,107, showPdp, showPlp),

      de: contentBlock(row,
        108,109,110, 111,112,113, 114,115,116, 117,118,119,
        120,121,122,123, 124,125, showPdp, showPlp),

      fr: contentBlock(row,
        126,127,128, 129,130,131, 132,133,134, 135,136,137,
        138,139,140,141, 142,143, showPdp, showPlp),

      ch: {
        en: contentBlock(row,
          144,147,150, 153,156,159, 162,165,168, 171,174,177,
          180,183,186,189, 192,195, showPdp, showPlp),
        fr: contentBlock(row,
          145,148,151, 154,157,160, 163,166,169, 172,175,178,
          181,184,187,190, 193,196, showPdp, showPlp),
        de: contentBlock(row,
          146,149,152, 155,158,161, 164,167,170, 173,176,179,
          182,185,188,191, 194,197, showPdp, showPlp),
      },

      nl: {
        en: contentBlock(row,
          198,200,202, 204,206,208, 210,212,214, 216,218,220,
          222,224,226,228, 230,232, showPdp, showPlp),
        nl: contentBlock(row,
          199,201,203, 205,207,209, 211,213,215, 217,219,221,
          223,225,227,229, 231,233, showPdp, showPlp),
      },

      eu: contentBlock(row,
        234,235,236, 237,238,239, 240,241,242, 243,244,245,
        246,247,248,249, 250,251, showPdp, showPlp),

      xbr: contentBlock(row,
        252,253,254, 255,256,257, 258,259,260, 261,262,263,
        264,265,266,267, 268,269, showPdp, showPlp),
    },

    multibuy: {
      us:  { enabled: tb(row,270), excludedCategories: v(row,271).split(/\s+/).filter(Boolean) },
      ca:  { enabled: tb(row,272), excludedCategories: v(row,273).split(/\s+/).filter(Boolean) },
      au:  { enabled: tb(row,274), excludedCategories: v(row,275).split(/\s+/).filter(Boolean) },
      uk:  { enabled: tb(row,276), excludedCategories: v(row,277).split(/\s+/).filter(Boolean) },
      de:  { enabled: tb(row,278), excludedCategories: v(row,279).split(/\s+/).filter(Boolean) },
      fr:  { enabled: tb(row,280), excludedCategories: v(row,281).split(/\s+/).filter(Boolean) },
      ch:  { enabled: tb(row,282), excludedCategories: v(row,283).split(/\s+/).filter(Boolean) },
      nl:  { enabled: tb(row,284), excludedCategories: v(row,285).split(/\s+/).filter(Boolean) },
      eu:  { enabled: tb(row,286), excludedCategories: v(row,287).split(/\s+/).filter(Boolean) },
      xbr: { enabled: tb(row,288), excludedCategories: v(row,289).split(/\s+/).filter(Boolean) },
    },

    targeting: {
      mainCategories:     v(row,290).split(/\s+/).filter(Boolean).length ? v(row,290).split(/\s+/).filter(Boolean) : ["__ALL__"],
      excludedCategories: v(row,291).split(/\s+/).filter(Boolean),
      productIds:         v(row,294).split(/\s+/).filter(Boolean).length ? v(row,294).split(/\s+/).filter(Boolean) : ["__ALL__"],
    },

    hidePromoBox: {
      us: tb(row,295), ca: tb(row,296), au: tb(row,297),
      uk: tb(row,298), de: tb(row,299), fr: tb(row,300),
      ch: tb(row,301), nl: tb(row,302), eu: tb(row,303), xbr: tb(row,304),
    },

    acq: {
      url: v(row,305).split(/\s+/).filter(Boolean),
    },

    rowNumber: idx + 5,
  };
}

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
    const rules = rows
      .map((row, idx) => buildRuleFromRow(row, idx))
      .filter(Boolean);

    const payload = {
      version:     1,
      generatedAt: new Date().toISOString(),
      total:       rules.length,
      rules,
    };


    await put(
      "promos.json",
      JSON.stringify(payload, null, 2),
      {
        access:             "public",
        contentType:        "application/json; charset=utf-8",
        addRandomSuffix:    false,
        allowOverwrite:     true,
        contentDisposition: "inline",
      }
);

    console.log(`[update-promos] Wrote ${rules.length} active rules — ${payload.generatedAt}`);

    return res.status(200).json({
      ok:          true,
      count:       rules.length,
      generatedAt: payload.generatedAt,
    });

  } catch (err) {
    console.error("[update-promos] Error:", err);
    return res.status(500).json({ error: true, message: "Internal server error", detail: err.message });
  }
}
