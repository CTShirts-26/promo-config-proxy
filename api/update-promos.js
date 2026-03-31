import { put } from "@vercel/blob";

// ─────────────────────────────────────────────────────────────
// AW26 Bloomreach sheet — column index map
// Row 4 = headers, Row 5+ = campaign data (sent as arrays)
//
// col 0  = PROMOTION/TABS
// col 1  = CATEGORY
// col 2  = ONLINE
// col 3  = STATUS
// col 4  = START DATE
// col 5  = END DATE
// col 6  = BANNERSTRIP scope
// col 7  = TIB TEXT scope
// col 8  = PLP CALL OUT scope
// col 9-18  = country enabled (US,CA,AU,UK,DE,FR,CH,NL,EU,XBR)
// col 19 = MAIN CATEGORIES ID
// col 20 = EXCLUDED SUB CATEGORIES ID
// col 21 = SHOW ON PDP
// col 22 = SHOW ON PLP
// col 23 = PRODUCT ID
// col 24 = EXCLUDE PRODUCT ID
// col 25 = CAMPAIGN SITE
// col 26-35 = HIDE PROMO BOX (US,CA,AU,UK,DE,FR,CH,NL,EU,XBR)
// col 36 = ACQ URL
// col 36-53  = US content (18 cols)
// col 54-89  = CA content (EN/FR interleaved, 36 cols)
// col 90-107 = AU content (18 cols)
// col 108-125 = UK content (18 cols)
// col 126-143 = DE content (18 cols)
// col 144-161 = FR content (18 cols)
// col 162-215 = CH content (EN/FR/DE interleaved, 54 cols)
// col 216-251 = NL content (EN/NL interleaved, 36 cols)
// col 252-269 = EU content (18 cols)
// col 270-287 = XBR content (18 cols)
// col 288-307 = MULTIBUY per country (20 cols)
// ─────────────────────────────────────────────────────────────

const SECRET = process.env.WEBHOOK_SECRET;

function v(row, i)  { return String(row[i] ?? "").trim(); }
function tb(row, i) { return v(row, i).toUpperCase() === "TRUE"; }

function splitIds(raw) {
  return String(raw || "").split(/[,\s]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => s.toLowerCase() === "all" ? "__ALL__" : s.toUpperCase());
}

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

function contentBlock(row, showPdp, showPlp,
  b1,b2,b3,b1et,b2et,b3et,b1af,b2af,b3af,b1afet,b2afet,b3afet,
  tib_d,tib_et,tib_af,tib_afet,
  plp_d,plp_af
) {
  return {
    showOnPdp:   showPdp,
    showOnPlp:   showPlp,
    bannerstrip: bannerstrip(row,b1,b2,b3,b1et,b2et,b3et,b1af,b2af,b3af,b1afet,b2afet,b3afet),
    tibText:     callout(row, tib_d, tib_et, tib_af, tib_afet),
    plpCallout:  { default: v(row,plp_d), endsTonight: "", affiliate: v(row,plp_af), affiliateEndsTonight: "" },
    pdpCallout:  emptyCallout(),
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
  const ruleId             = v(row, 0);
  const category           = v(row, 1);
  const online             = tb(row, 2);
  const status             = v(row, 3);
  const startUtc           = parseDate(v(row, 4));
  const endUtc             = parseDate(v(row, 5));
  const showPdp            = tb(row, 21);
  const showPlp            = tb(row, 22);

  if (!online || !ruleId) return null;

  return {
    ruleId,
    category,
    enabled:  online,
    status,
    startUtc,
    endUtc,

    scope: {
      bannerstrip: tb(row, 6),
      tibText:     tb(row, 7),
      plpCallout:  tb(row, 8),
      pdpCallout:  false,
    },

    countryEnabled: {
      us:  tb(row, 9),  ca:  tb(row, 10), au:  tb(row, 11),
      uk:  tb(row, 12), de:  tb(row, 13), fr:  tb(row, 14),
      ch:  tb(row, 15), nl:  tb(row, 16), eu:  tb(row, 17), xbr: tb(row, 18),
    },

    targeting: {
      mainCategories:     v(row,19).split(/\s+/).filter(Boolean).length
                            ? v(row,19).split(/\s+/).filter(Boolean) : ["__ALL__"],
      excludedCategories: v(row,20).split(/\s+/).filter(Boolean),
      showOnPdp: showPdp,
      showOnPlp: showPlp,
      productIds:         splitIds(v(row,23)).length ? splitIds(v(row,23)) : ["__ALL__"],
      excludedProductIds: splitIds(v(row,24)),
      campaignSite:       v(row,25).split(/[,\s]+/).map(s=>s.trim().toLowerCase()).filter(Boolean),
    },

    hidePromoBox: {
      us: tb(row,26), ca: tb(row,27), au: tb(row,28),
      uk: tb(row,29), de: tb(row,30), fr: tb(row,31),
      ch: tb(row,32), nl: tb(row,33), eu: tb(row,34), xbr: tb(row,35),
    },

    acq: { url: v(row,36).split(/\s+/).filter(Boolean) },

    content: {
      // US: cols 36-53 (18 cols)
      us: contentBlock(row, showPdp, showPlp,
        36,37,38, 39,40,41, 42,43,44, 45,46,47,
        48,49,50,51, 52,53),

      // CA: cols 54-89 (36 cols, EN/FR interleaved)
      ca: {
        en: contentBlock(row, showPdp, showPlp,
          54,56,58, 60,62,64, 66,68,70, 72,74,76,
          78,80,82,84, 86,88),
        fr: contentBlock(row, showPdp, showPlp,
          55,57,59, 61,63,65, 67,69,71, 73,75,77,
          79,81,83,85, 87,89),
      },

      // AU: cols 90-107 (18 cols)
      au: contentBlock(row, showPdp, showPlp,
        90,91,92, 93,94,95, 96,97,98, 99,100,101,
        102,103,104,105, 106,107),

      // UK: cols 108-125 (18 cols)
      uk: contentBlock(row, showPdp, showPlp,
        108,109,110, 111,112,113, 114,115,116, 117,118,119,
        120,121,122,123, 124,125),

      // DE: cols 126-143 (18 cols)
      de: contentBlock(row, showPdp, showPlp,
        126,127,128, 129,130,131, 132,133,134, 135,136,137,
        138,139,140,141, 142,143),

      // FR: cols 144-161 (18 cols)
      fr: contentBlock(row, showPdp, showPlp,
        144,145,146, 147,148,149, 150,151,152, 153,154,155,
        156,157,158,159, 160,161),

      // CH: cols 162-215 (54 cols, EN/FR/DE interleaved)
      ch: {
        en: contentBlock(row, showPdp, showPlp,
          162,165,168, 171,174,177, 180,183,186, 189,192,195,
          198,201,204,207, 210,213),
        fr: contentBlock(row, showPdp, showPlp,
          163,166,169, 172,175,178, 181,184,187, 190,193,196,
          199,202,205,208, 211,214),
        de: contentBlock(row, showPdp, showPlp,
          164,167,170, 173,176,179, 182,185,188, 191,194,197,
          200,203,206,209, 212,215),
      },

      // NL: cols 216-251 (36 cols, EN/NL interleaved)
      nl: {
        en: contentBlock(row, showPdp, showPlp,
          216,218,220, 222,224,226, 228,230,232, 234,236,238,
          240,242,244,246, 248,250),
        nl: contentBlock(row, showPdp, showPlp,
          217,219,221, 223,225,227, 229,231,233, 235,237,239,
          241,243,245,247, 249,251),
      },

      // EU: cols 252-269 (18 cols)
      eu: contentBlock(row, showPdp, showPlp,
        252,253,254, 255,256,257, 258,259,260, 261,262,263,
        264,265,266,267, 268,269),

      // XBR: cols 270-287 (18 cols)
      xbr: contentBlock(row, showPdp, showPlp,
        270,271,272, 273,274,275, 276,277,278, 279,280,281,
        282,283,284,285, 286,287),
    },

    // MULTIBUY: cols 288-307 (20 cols)
    multibuy: {
      us:  { enabled: tb(row,288), excludedCategories: v(row,289).split(/\s+/).filter(Boolean) },
      ca:  { enabled: tb(row,290), excludedCategories: v(row,291).split(/\s+/).filter(Boolean) },
      au:  { enabled: tb(row,292), excludedCategories: v(row,293).split(/\s+/).filter(Boolean) },
      uk:  { enabled: tb(row,294), excludedCategories: v(row,295).split(/\s+/).filter(Boolean) },
      de:  { enabled: tb(row,296), excludedCategories: v(row,297).split(/\s+/).filter(Boolean) },
      fr:  { enabled: tb(row,298), excludedCategories: v(row,299).split(/\s+/).filter(Boolean) },
      ch:  { enabled: tb(row,300), excludedCategories: v(row,301).split(/\s+/).filter(Boolean) },
      nl:  { enabled: tb(row,302), excludedCategories: v(row,303).split(/\s+/).filter(Boolean) },
      eu:  { enabled: tb(row,304), excludedCategories: v(row,305).split(/\s+/).filter(Boolean) },
      xbr: { enabled: tb(row,306), excludedCategories: v(row,307).split(/\s+/).filter(Boolean) },
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
        contentDisposition: "inline",
        addRandomSuffix:    false,
        allowOverwrite:     true,
      }
    );

    console.log(`[update-promos] Wrote ${rules.length} rules — ${payload.generatedAt}`);

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
