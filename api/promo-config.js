import { google } from "googleapis";

function corsHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function toStr(v) {
  return String(v ?? "").trim();
}

function toBool(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "true";
}

function splitBySpace(v) {
  return String(v || "")
    .split(/\s+/g)
    .map(x => String(x || "").trim())
    .filter(Boolean);
}

function splitCsvOrSpace(v) {
  return String(v || "")
    .split(/[\n, ]+/g)
    .map(x => String(x || "").trim())
    .filter(Boolean);
}

function normaliseKey(v) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[()]/g, "")
    .replace(/[\/]+/g, " ")
    .replace(/[\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function upperKey(v) {
  return String(v || "").trim().toUpperCase();
}

function getCell(values, rowIndex, colIndex) {
  return toStr(values?.[rowIndex]?.[colIndex]);
}

function carryForwardRow(values, rowIndex, maxCols) {
  const out = [];
  let last = "";
  for (let col = 0; col < maxCols; col++) {
    const raw = getCell(values, rowIndex, col);
    if (raw) last = raw;
    out.push(raw || last || "");
  }
  return out;
}

function getMaxCols(values) {
  return Math.max(0, ...values.map(r => (r ? r.length : 0)));
}

function isRowEmpty(row) {
  return !row || row.every(cell => !toStr(cell));
}

function parseDateCell(v) {
  const s = toStr(v);
  if (!s) return "";
  return s;
}

function makeEmptyCountry() {
  return {
    bannerStrip: {
      default: { "1": "", "2": "", "3": "" },
      endsTonight: { "1": "", "2": "", "3": "" },
      affiliate: { "1": "", "2": "", "3": "" },
      affiliateEndsTonight: { "1": "", "2": "", "3": "" }
    },
    tibText: {
      default: "",
      endsTonight: "",
      affiliate: "",
      affiliateEndsTonight: ""
    },
    plpCallout: {
      default: "",
      affiliate: ""
    },
    multibuy: {
      enabled: false,
      excludedCategories: []
    },
    hidePromoBox: false
  };
}

function ensureCountry(campaign, countryCode) {
  if (!campaign.countries[countryCode]) {
    campaign.countries[countryCode] = makeEmptyCountry();
  }
  return campaign.countries[countryCode];
}

function ensureCountryLanguage(campaign, countryCode, languageCode) {
  const country = ensureCountry(campaign, countryCode);
  if (!country.languages) country.languages = {};
  if (!country.languages[languageCode]) {
    country.languages[languageCode] = {
      bannerStrip: {
        default: { "1": "", "2": "", "3": "" },
        endsTonight: { "1": "", "2": "", "3": "" },
        affiliate: { "1": "", "2": "", "3": "" },
        affiliateEndsTonight: { "1": "", "2": "", "3": "" }
      },
      tibText: {
        default: "",
        endsTonight: "",
        affiliate: "",
        affiliateEndsTonight: ""
      },
      plpCallout: {
        default: "",
        affiliate: ""
      }
    };
  }
  return country.languages[languageCode];
}

function createEmptyCampaign(rowNumber) {
  return {
    name: "",
    online: false,
    status: "",
    startDate: "",
    endDate: "",
    placements: {
      bannerStrip: false,
      tibText: false,
      plpCallout: false,
      multibuy: false
    },
    countries: {},
    tibSetup: {
      mainCategories: [],
      excludedSubCategories: []
    },
    plpCalloutSetup: {
      showOnPdp: false,
      showOnPlp: false,
      productIds: []
    },
    hidePromoBox: {},
    acquisition: {
      urls: []
    },
    rowNumber
  };
}

function classifyColumn(meta) {
  const h1 = normaliseKey(meta.header1);
  const h2 = normaliseKey(meta.header2);
  const h3 = normaliseKey(meta.header3);
  const h4 = normaliseKey(meta.header4);

  const countryCodes = new Set(["US", "CA", "AU", "UK", "DE", "FR", "CH", "NL", "EU", "XBR"]);
  const languageLike = /^([A-Z]{2})\-([A-Z]{2})$/;

  const raw2 = toStr(meta.header2);
  const raw3 = toStr(meta.header3);
  const raw4 = toStr(meta.header4);

  if (h4 === "tab name") return { type: "meta", field: "name" };
  if (h4 === "online") return { type: "meta", field: "online" };
  if (h4 === "status") return { type: "meta", field: "status" };
  if (h4 === "start date") return { type: "meta", field: "startDate" };
  if (h4 === "end date") return { type: "meta", field: "endDate" };

  if (h4 === "bannerstrip") return { type: "placementFlag", field: "bannerStrip" };
  if (h4 === "tib text") return { type: "placementFlag", field: "tibText" };
  if (h4 === "plp call out") return { type: "placementFlag", field: "plpCallout" };

  if (h2 === "country" && countryCodes.has(upperKey(raw4))) {
    return { type: "countryFlag", country: upperKey(raw4) };
  }

  if (h2 === "multibuy") {
    const country = upperKey(raw3);
    if (countryCodes.has(country)) {
      if (h4 === "multibuy call out") {
        return { type: "multibuyEnabled", country };
      }
      if (h4.startsWith("categories id excluded")) {
        return { type: "multibuyExcludedCategories", country };
      }
    }
  }

  if (h2 === "tib text set up") {
    if (h4 === "main categories id") {
      return { type: "tibSetupMainCategories" };
    }
    if (h4 === "excluded sub categories id") {
      return { type: "tibSetupExcludedSubCategories" };
    }
  }

  if (h2 === "plp call out set up") {
    if (h4 === "show on pdp") return { type: "plpSetupShowOnPdp" };
    if (h4 === "show on plp") return { type: "plpSetupShowOnPlp" };
    if (h4.startsWith("product id")) return { type: "plpSetupProductIds" };
  }

  if (h2 === "hide promo box") {
    const country = upperKey(raw4);
    if (countryCodes.has(country)) {
      return { type: "hidePromoBox", country };
    }
  }

  if (h2 === "acq" && h4 === "url") {
    return { type: "acquisitionUrls" };
  }

  if (countryCodes.has(upperKey(raw2))) {
    const country = upperKey(raw2);

    if (h3 === "bannerstrip") {
      return parsePlacementVariant("bannerStrip", country, raw4);
    }
    if (h3 === "tib text") {
      return parsePlacementVariant("tibText", country, raw4);
    }
    if (h3 === "plp call out") {
      return parsePlacementVariant("plpCallout", country, raw4);
    }
  }

  if (languageLike.test(raw3)) {
    const langMatch = raw3.match(languageLike);
    const country = upperKey(langMatch[1]);
    const language = langMatch[2].toLowerCase();

    if (h2 === "bannerstrip") {
      const parsed = parsePlacementVariant("bannerStrip", country, raw4);
      return { ...parsed, language };
    }
    if (h2 === "tib text") {
      const parsed = parsePlacementVariant("tibText", country, raw4);
      return { ...parsed, language };
    }
    if (h2 === "plp call out") {
      const parsed = parsePlacementVariant("plpCallout", country, raw4);
      return { ...parsed, language };
    }
  }

  return { type: "unknown" };
}

function parsePlacementVariant(placement, country, rawField) {
  const field = normaliseKey(rawField);

  if (placement === "bannerStrip") {
    if (field === "bannerstrip 1") {
      return { type: "countryContent", country, placement, variant: "default", slot: "1" };
    }
    if (field === "bannerstrip 2") {
      return { type: "countryContent", country, placement, variant: "default", slot: "2" };
    }
    if (field === "bannerstrip 3") {
      return { type: "countryContent", country, placement, variant: "default", slot: "3" };
    }
    if (field === "bannerstrip 1 ends tonight") {
      return { type: "countryContent", country, placement, variant: "endsTonight", slot: "1" };
    }
    if (field === "bannerstrip 2 ends tonight") {
      return { type: "countryContent", country, placement, variant: "endsTonight", slot: "2" };
    }
    if (field === "bannerstrip 3 ends tonight") {
      return { type: "countryContent", country, placement, variant: "endsTonight", slot: "3" };
    }
    if (field === "bannerstrip 1 affiliate") {
      return { type: "countryContent", country, placement, variant: "affiliate", slot: "1" };
    }
    if (field === "bannerstrip 2 affiliate") {
      return { type: "countryContent", country, placement, variant: "affiliate", slot: "2" };
    }
    if (field === "bannerstrip 3 affiliate") {
      return { type: "countryContent", country, placement, variant: "affiliate", slot: "3" };
    }
    if (field === "bannerstrip 1 affiliate ends tonight") {
      return { type: "countryContent", country, placement, variant: "affiliateEndsTonight", slot: "1" };
    }
    if (field === "bannerstrip 2 affiliate ends tonight") {
      return { type: "countryContent", country, placement, variant: "affiliateEndsTonight", slot: "2" };
    }
    if (field === "bannerstrip 3 affiliate ends tonight") {
      return { type: "countryContent", country, placement, variant: "affiliateEndsTonight", slot: "3" };
    }
  }

  if (placement === "tibText") {
    if (field === "tib text") {
      return { type: "countryContent", country, placement, variant: "default" };
    }
    if (field === "tib text ends tonight") {
      return { type: "countryContent", country, placement, variant: "endsTonight" };
    }
    if (field === "tib text affiliate") {
      return { type: "countryContent", country, placement, variant: "affiliate" };
    }
    if (field === "tib text affiliate ends tonight") {
      return { type: "countryContent", country, placement, variant: "affiliateEndsTonight" };
    }
  }

  if (placement === "plpCallout") {
    if (field === "plp call out") {
      return { type: "countryContent", country, placement, variant: "default" };
    }
    if (field === "plp call out affiliates") {
      return { type: "countryContent", country, placement, variant: "affiliate" };
    }
  }

  return { type: "unknown" };
}

function buildColumnMap(values) {
  const maxCols = getMaxCols(values);

  const header1 = carryForwardRow(values, 0, maxCols);
  const header2 = carryForwardRow(values, 1, maxCols);
  const header3 = carryForwardRow(values, 2, maxCols);
  const header4 = values[3] || [];

  const columnMap = [];

  for (let col = 0; col < maxCols; col++) {
    const meta = {
      colIndex: col,
      header1: header1[col] || "",
      header2: header2[col] || "",
      header3: header3[col] || "",
      header4: toStr(header4[col])
    };

    columnMap.push({
      ...meta,
      parsed: classifyColumn(meta)
    });
  }

  return columnMap;
}

function applyColumnValueToCampaign(campaign, colMeta, rawValue) {
  const value = toStr(rawValue);
  const parsed = colMeta.parsed || { type: "unknown" };

  if (parsed.type === "meta") {
    if (parsed.field === "name") campaign.name = value;
    if (parsed.field === "online") campaign.online = toBool(value);
    if (parsed.field === "status") campaign.status = value;
    if (parsed.field === "startDate") campaign.startDate = parseDateCell(value);
    if (parsed.field === "endDate") campaign.endDate = parseDateCell(value);
    return;
  }

  if (parsed.type === "placementFlag") {
    campaign.placements[parsed.field] = toBool(value);
    return;
  }

  if (parsed.type === "countryFlag") {
    campaign.countryEnabled = campaign.countryEnabled || {};
    campaign.countryEnabled[parsed.country] = toBool(value);
    return;
  }

  if (parsed.type === "multibuyEnabled") {
    const country = ensureCountry(campaign, parsed.country);
    country.multibuy.enabled = toBool(value);
    campaign.placements.multibuy = campaign.placements.multibuy || toBool(value);
    return;
  }

  if (parsed.type === "multibuyExcludedCategories") {
    const country = ensureCountry(campaign, parsed.country);
    country.multibuy.excludedCategories = splitBySpace(value).map(x => x.toLowerCase());
    return;
  }

  if (parsed.type === "tibSetupMainCategories") {
    campaign.tibSetup.mainCategories = splitBySpace(value).map(x => x.toLowerCase());
    return;
  }

  if (parsed.type === "tibSetupExcludedSubCategories") {
    campaign.tibSetup.excludedSubCategories = splitBySpace(value).map(x => x.toLowerCase());
    return;
  }

  if (parsed.type === "plpSetupShowOnPdp") {
    campaign.plpCalloutSetup.showOnPdp = toBool(value);
    return;
  }

  if (parsed.type === "plpSetupShowOnPlp") {
    campaign.plpCalloutSetup.showOnPlp = toBool(value);
    return;
  }

  if (parsed.type === "plpSetupProductIds") {
    campaign.plpCalloutSetup.productIds = splitCsvOrSpace(value).map(x => x.toUpperCase());
    return;
  }

  if (parsed.type === "hidePromoBox") {
    campaign.hidePromoBox[parsed.country] = toBool(value);
    return;
  }

  if (parsed.type === "acquisitionUrls") {
    campaign.acquisition.urls = splitCsvOrSpace(value);
    return;
  }

  if (parsed.type === "countryContent") {
    if (parsed.language) {
      const langBucket = ensureCountryLanguage(campaign, parsed.country, parsed.language);

      if (parsed.placement === "bannerStrip") {
        langBucket.bannerStrip[parsed.variant][parsed.slot] = value;
      } else if (parsed.placement === "tibText") {
        langBucket.tibText[parsed.variant] = value;
      } else if (parsed.placement === "plpCallout") {
        langBucket.plpCallout[parsed.variant] = value;
      }
      return;
    }

    const country = ensureCountry(campaign, parsed.country);

    if (parsed.placement === "bannerStrip") {
      country.bannerStrip[parsed.variant][parsed.slot] = value;
    } else if (parsed.placement === "tibText") {
      country.tibText[parsed.variant] = value;
    } else if (parsed.placement === "plpCallout") {
      country.plpCallout[parsed.variant] = value;
    }
  }
}

function rowHasMeaningfulCampaignData(row) {
  return row.some(cell => {
    const s = toStr(cell);
    return !!s;
  });
}

function parseCampaignRows(values, columnMap) {
  const campaigns = [];

  for (let rowIndex = 4; rowIndex < values.length; rowIndex++) {
    const row = values[rowIndex] || [];
    if (isRowEmpty(row)) continue;
    if (!rowHasMeaningfulCampaignData(row)) continue;

    const campaign = createEmptyCampaign(rowIndex + 1);

    for (let col = 0; col < columnMap.length; col++) {
      const rawValue = row[col] ?? "";
      applyColumnValueToCampaign(campaign, columnMap[col], rawValue);
    }

    if (!campaign.name && !campaign.startDate && !campaign.endDate) {
      continue;
    }

    campaigns.push(campaign);
  }

  return campaigns;
}

export default async function handler(req, res) {
  const headers = corsHeaders();
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const range = process.env.GOOGLE_SHEET_RANGE || "Bloomreach!A1:KF200";

    if (!spreadsheetId) {
      return res.status(500).json({ error: true, message: "Missing GOOGLE_SHEET_ID" });
    }

    if (!process.env.GOOGLE_CLIENT_EMAIL) {
      return res.status(500).json({ error: true, message: "Missing GOOGLE_CLIENT_EMAIL" });
    }

    if (!process.env.GOOGLE_PRIVATE_KEY) {
      return res.status(500).json({ error: true, message: "Missing GOOGLE_PRIVATE_KEY" });
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

    const values = resp.data.values || [];

    if (!values.length) {
      return res.status(200).json({
        version: 2,
        generatedAt: new Date().toISOString(),
        campaigns: [],
        debug: {
          message: "No data returned from sheet"
        }
      });
    }

    const columnMap = buildColumnMap(values);
    const campaigns = parseCampaignRows(values, columnMap);

    return res.status(200).json({
      version: 2,
      generatedAt: new Date().toISOString(),
      campaigns,
      debug: {
        totalRows: values.length,
        totalColumns: getMaxCols(values),
        detectedDataRows: campaigns.length,
        sampleColumnMap: columnMap.slice(0, 80).map(c => ({
          colIndex: c.colIndex,
          header1: c.header1,
          header2: c.header2,
          header3: c.header3,
          header4: c.header4,
          parsed: c.parsed
        }))
      }
    });
  } catch (e) {
    return res.status(500).json({
      error: true,
      message: "Failed to read Google Sheet",
      details: String(e?.message || e)
    });
  }
}
