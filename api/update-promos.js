import { put } from "@vercel/blob";

const SECRET = process.env.WEBHOOK_SECRET;
const ALL = "__ALL__";

// Row 4 = headers
// Row 5+ = campaign data
//
// col 0   = PROMOTION/TABS
// col 1   = CATEGORY
// col 2   = ONLINE
// col 3   = STATUS
// col 4   = START DATE
// col 5   = END DATE
// col 6   = BANNERSTRIP scope
// col 7   = TIB TEXT scope
// col 8   = PLP CALL OUT scope
// col 9-18  = country enabled (US,CA,AU,UK,DE,FR,CH,NL,EU,XBR)
// col 19  = SHOW ON DEFAULT
// col 20  = SHOW ON AFFILIATE
// col 21  = SHOW ON ACQ
// col 22  = MAIN CATEGORIES ID
// col 23  = EXCLUDED SUB CATEGORIES ID
// col 24  = SHOW ON PDP
// col 25  = SHOW ON PLP
// col 26  = PRODUCT ID
// col 27  = EXCLUDE PRODUCT ID
// col 28-37 = HIDE PROMO BOX (US,CA,AU,UK,DE,FR,CH,NL,EU,XBR)
// col 38-55  = US content (18 cols)
// col 56-91  = CA content (EN/FR interleaved, 36 cols)
// col 92-109 = AU content (18 cols)
// col 110-127 = UK content (18 cols)
// col 128-145 = DE content (18 cols)
// col 146-163 = FR content (18 cols)
// col 164-217 = CH content (EN/FR/DE interleaved, 54 cols)
// col 218-253 = NL content (EN/NL interleaved, 36 cols)
// col 254-271 = EU content (18 cols)
// col 272-289 = XBR content (18 cols)
// col 290-309 = MULTIBUY per country (20 cols)

function v(row, i) {
  return String(row[i] ?? "").trim();
}

function tb(row, i) {
  return v(row, i).toUpperCase() === "TRUE";
}

function splitList(raw, { uppercase = false, lowercase = false, mapAll = false } = {}) {
  return String(raw || "")
    .split(/[\s,]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => {
      if (mapAll && s.toLowerCase() === "all") return ALL;
      if (uppercase) return s.toUpperCase();
      if (lowercase) return s.toLowerCase();
      return s;
    });
}

function splitCategoryIds(raw) {
  const values = splitList(raw, { lowercase: true, mapAll: true });
  return values.length ? values : [ALL];
}

function splitExcludedCategoryIds(raw) {
  return splitList(raw, { lowercase: true, mapAll: true }).filter(v => v !== ALL);
}

function splitProductIds(raw) {
  const values = splitList(raw, { uppercase: true, mapAll: true });
  return values.length ? values : [ALL];
}

function splitExcludedProductIds(raw) {
  return splitList(raw, { uppercase: true, mapAll: true }).filter(v => v !== ALL);
}

function splitCampaignSites(raw) {
  return splitList(raw, { lowercase: true });
}

function parseDate(raw, { endOfDay = false } = {}) {
  const s = String(raw || "").trim();
  if (!s) return null;

  const parts = s.split("/");
  if (parts.length === 3) {
    const [d, m, y] = parts;
    const hh = endOfDay ? "23" : "00";
    const mm = endOfDay ? "59" : "00";
    const ss = endOfDay ? "59" : "00";
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T${hh}:${mm}:${ss}Z`;
  }

  return s;
}

function bannerstrip(row, b1, b2, b3, b1et, b2et, b3et, b1af, b2af, b3af, b1afet, b2afet, b3afet) {
  return {
    line1: v(row, b1),
    line2: v(row, b2),
    line3: v(row, b3),
    line1EndsTonight: v(row, b1et),
    line2EndsTonight: v(row, b2et),
    line3EndsTonight: v(row, b3et),
    line1Affiliate: v(row, b1af),
    line2Affiliate: v(row, b2af),
    line3Affiliate: v(row, b3af),
    line1AffiliateEndsTonight: v(row, b1afet),
    line2AffiliateEndsTonight: v(row, b2afet),
    line3AffiliateEndsTonight: v(row, b3afet),
  };
}

function callout(row, d, et, af, afet) {
  return {
    default: v(row, d),
    endsTonight: et != null ? v(row, et) : "",
    affiliate: af != null ? v(row, af) : "",
    affiliateEndsTonight: afet != null ? v(row, afet) : "",
  };
}

function promoCallout(row, d, af) {
  return {
    default: v(row, d),
    endsTonight: "",
    affiliate: v(row, af),
    affiliateEndsTonight: "",
  };
}

function emptyCallout() {
  return {
    default: "",
    endsTonight: "",
    affiliate: "",
    affiliateEndsTonight: "",
  };
}

function contentBlock(
  row,
  showOnPdp,
  showOnPlp,
  b1, b2, b3, b1et, b2et, b3et, b1af, b2af, b3af, b1afet, b2afet, b3afet,
  tibD, tibEt, tibAf, tibAfet,
  promoD, promoAf
) {
  const sharedPromoCallout = promoCallout(row, promoD, promoAf);

  return {
    bannerstrip: bannerstrip(row, b1, b2, b3, b1et, b2et, b3et, b1af, b2af, b3af, b1afet, b2afet, b3afet),
    tibText: callout(row, tibD, tibEt, tibAf, tibAfet),
    promoCallout: sharedPromoCallout,
    plpCallout: showOnPlp ? sharedPromoCallout : emptyCallout(),
    pdpCallout: showOnPdp ? sharedPromoCallout : emptyCallout(),
  };
}

function buildRuleFromRow(row, idx) {
  const ruleId = v(row, 0);
  const category = v(row, 1);
  const enabled = tb(row, 2);
  const status = v(row, 3);
  const startUtc = parseDate(v(row, 4));
  const endUtc = parseDate(v(row, 5), { endOfDay: true });

  const defaultCampaignSites = splitCampaignSites(v(row, 19));
  const affiliateCampaignSites = splitCampaignSites(v(row, 20));
  const acquisitionCampaignSites = splitCampaignSites(v(row, 21));

  const showOnPdp = tb(row, 24);
  const showOnPlp = tb(row, 25);

  if (!enabled || !ruleId) return null;

  const countryEnabled = {
    us: tb(row, 9),
    ca: tb(row, 10),
    au: tb(row, 11),
    uk: tb(row, 12),
    de: tb(row, 13),
    fr: tb(row, 14),
    ch: tb(row, 15),
    nl: tb(row, 16),
    eu: tb(row, 17),
    xbr: tb(row, 18),
  };

  const multibuy = {
    us:  { message: v(row, 290), enabled: !!v(row, 290), excludedCategories: splitExcludedCategoryIds(v(row, 291)) },
    ca:  { message: v(row, 292), enabled: !!v(row, 292), excludedCategories: splitExcludedCategoryIds(v(row, 293)) },
    au:  { message: v(row, 294), enabled: !!v(row, 294), excludedCategories: splitExcludedCategoryIds(v(row, 295)) },
    uk:  { message: v(row, 296), enabled: !!v(row, 296), excludedCategories: splitExcludedCategoryIds(v(row, 297)) },
    de:  { message: v(row, 298), enabled: !!v(row, 298), excludedCategories: splitExcludedCategoryIds(v(row, 299)) },
    fr:  { message: v(row, 300), enabled: !!v(row, 300), excludedCategories: splitExcludedCategoryIds(v(row, 301)) },
    ch:  { message: v(row, 302), enabled: !!v(row, 302), excludedCategories: splitExcludedCategoryIds(v(row, 303)) },
    nl:  { message: v(row, 304), enabled: !!v(row, 304), excludedCategories: splitExcludedCategoryIds(v(row, 305)) },
    eu:  { message: v(row, 306), enabled: !!v(row, 306), excludedCategories: splitExcludedCategoryIds(v(row, 307)) },
    xbr: { message: v(row, 308), enabled: !!v(row, 308), excludedCategories: splitExcludedCategoryIds(v(row, 309)) },
  };

  return {
    ruleId,
    category,
    enabled,
    status,
    startUtc,
    endUtc,

    scope: {
      bannerstrip: tb(row, 6),
      tibText: tb(row, 7),
      promoCallout: tb(row, 8),
      plpCallout: tb(row, 8),
      pdpCallout: tb(row, 8) && showOnPdp,
      multibuy: Object.values(multibuy).some(item => item.enabled),
    },

    countryEnabled,

    targeting: {
      defaultCampaignSites,
      affiliateCampaignSites,
      acquisitionCampaignSites,

      // Backwards compatibility while frontend is being updated
      campaignSites: affiliateCampaignSites,

      mainCategories: splitCategoryIds(v(row, 22)),
      excludedCategories: splitExcludedCategoryIds(v(row, 23)),
      showOnPdp,
      showOnPlp,
      productIds: splitProductIds(v(row, 26)),
      excludedProductIds: splitExcludedProductIds(v(row, 27)),
    },

    hidePromoBox: {
      us: tb(row, 28),
      ca: tb(row, 29),
      au: tb(row, 30),
      uk: tb(row, 31),
      de: tb(row, 32),
      fr: tb(row, 33),
      ch: tb(row, 34),
      nl: tb(row, 35),
      eu: tb(row, 36),
      xbr: tb(row, 37),
    },

    content: {
      us: contentBlock(
        row, showOnPdp, showOnPlp,
        38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49,
        50, 51, 52, 53, 54, 55
      ),

      ca: {
        en: contentBlock(
          row, showOnPdp, showOnPlp,
          56, 58, 60, 62, 64, 66, 68, 70, 72, 74, 76, 78,
          80, 82, 84, 86, 88, 90
        ),
        fr: contentBlock(
          row, showOnPdp, showOnPlp,
          57, 59, 61, 63, 65, 67, 69, 71, 73, 75, 77, 79,
          81, 83, 85, 87, 89, 91
        ),
      },

      au: contentBlock(
        row, showOnPdp, showOnPlp,
        92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103,
        104, 105, 106, 107, 108, 109
      ),

      uk: contentBlock(
        row, showOnPdp, showOnPlp,
        110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121,
        122, 123, 124, 125, 126, 127
      ),

      de: contentBlock(
        row, showOnPdp, showOnPlp,
        128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139,
        140, 141, 142, 143, 144, 145
      ),

      fr: contentBlock(
        row, showOnPdp, showOnPlp,
        146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157,
        158, 159, 160, 161, 162, 163
      ),

      ch: {
        en: contentBlock(
          row, showOnPdp, showOnPlp,
          164, 167, 170, 173, 176, 179, 182, 185, 188, 191, 194, 197,
          200, 203, 206, 209, 212, 215
        ),
        fr: contentBlock(
          row, showOnPdp, showOnPlp,
          165, 168, 171, 174, 177, 180, 183, 186, 189, 192, 195, 198,
          201, 204, 207, 210, 213, 216
        ),
        de: contentBlock(
          row, showOnPdp, showOnPlp,
          166, 169, 172, 175, 178, 181, 184, 187, 190, 193, 196, 199,
          202, 205, 208, 211, 214, 217
        ),
      },

      nl: {
        en: contentBlock(
          row, showOnPdp, showOnPlp,
          218, 220, 222, 224, 226, 228, 230, 232, 234, 236, 238, 240,
          242, 244, 246, 248, 250, 252
        ),
        nl: contentBlock(
          row, showOnPdp, showOnPlp,
          219, 221, 223, 225, 227, 229, 231, 233, 235, 237, 239, 241,
          243, 245, 247, 249, 251, 253
        ),
      },

      eu: contentBlock(
        row, showOnPdp, showOnPlp,
        254, 255, 256, 257, 258, 259, 260, 261, 262, 263, 264, 265,
        266, 267, 268, 269, 270, 271
      ),

      xbr: contentBlock(
        row, showOnPdp, showOnPlp,
        272, 273, 274, 275, 276, 277, 278, 279, 280, 281, 282, 283,
        284, 285, 286, 287, 288, 289
      ),
    },

    multibuy,
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
    return res.status(400).json({ error: true, message: "rows must be a non empty array" });
  }

  try {
    const rules = rows
      .map((row, idx) => buildRuleFromRow(row, idx))
      .filter(Boolean);

    const payload = {
      version: 3,
      generatedAt: new Date().toISOString(),
      total: rules.length,
      rules,
    };

    await put(
      "promos.json",
      JSON.stringify(payload, null, 2),
      {
        access: "public",
        contentType: "application/json; charset=utf-8",
        contentDisposition: "inline",
        addRandomSuffix: false,
        allowOverwrite: true,
      }
    );

    console.log(`[update-promos] Wrote ${rules.length} rules at ${payload.generatedAt}`);

    return res.status(200).json({
      ok: true,
      count: rules.length,
      generatedAt: payload.generatedAt,
      version: payload.version,
    });
  } catch (err) {
    console.error("[update-promos] Error:", err);
    return res.status(500).json({
      error: true,
      message: "Internal server error",
      detail: err.message,
    });
  }
}
