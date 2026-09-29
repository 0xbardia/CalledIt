/** Advisory mirror of the contract's deterministic gates. The chain remains canonical. */

const VAGUE = /\b(soon|someday|eventually|sometime|shortly|one day|in the future)\b/i;
const QUARTER = /\bq[1-4]\b/i;
const ISO_DATE = /\b(20\d{2})-(\d{2})-(\d{2})\b/g;
const MDY =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/gi;
const INJECTION =
  /(ignore\s+(all\s+|any\s+)?(previous|prior|above)\s+instructions|disregard\s+(your|the)\s+(rules|instructions|protocol)|you are now|override (the )?(verdict|protocol|rules)|change (the )?(verdict|protocol|rules|schema) to|mark (this|it) (as )?correct|pretend to be (the )?(system|developer|validator)|attacker[- ]controlled (json|output)|redefine (the )?(resolution|source|deadline) (rules|policy)|bypass (the )?(deadline|source policy|protocol)|force (the )?validators? to agree|fake (authoritative|official) evidence|new instructions\s*:|system prompt|<\|\s*(system|im_start|im_end)\s*\|>|\[INST\]|<<SYS>>|jailbreak)/i;
const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

export type Preflight = { ok: true } | { ok: false; code: string; message: string };

function explicitDates(text: string): Set<string> {
  const found = new Set<string>();
  for (const match of text.matchAll(ISO_DATE)) {
    found.add(`${match[1]}-${match[2]}-${match[3]}`);
  }
  for (const match of text.matchAll(MDY)) {
    const key = match[1].toLowerCase().startsWith("sept") ? "sept" : match[1].slice(0, 3).toLowerCase();
    const month = MONTHS[key];
    if (!month) continue;
    found.add(`${match[3]}-${String(month).padStart(2, "0")}-${String(Number(match[2])).padStart(2, "0")}`);
  }
  return found;
}

export function preflightForecast(text: string, deadlineIso: string): Preflight {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length < 8 || cleaned.length > 2000) {
    return { ok: false, code: "TEXT_LENGTH", message: "Write a forecast between 8 and 2000 characters." };
  }
  // eslint-disable-next-line no-control-regex -- contract parity: hidden controls are rejected before a wallet prompt.
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) {
    return { ok: false, code: "MALFORMED_TEXT", message: "The text contains hidden control characters." };
  }
  const normalized = text.normalize("NFKC").replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "").replace(/\s+/g, " ");
  if (INJECTION.test(normalized)) {
    return {
      ok: false,
      code: "INJECTION",
      message: "That text tries to override the protocol instructions, so it cannot be locked.",
    };
  }
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(deadlineIso)) {
    return { ok: false, code: "DEADLINE_FORMAT", message: "Choose a deadline as YYYY-MM-DD." };
  }
  const dates = explicitDates(cleaned);
  if (dates.size === 0 || QUARTER.test(cleaned) || (VAGUE.test(cleaned) && !dates.has(deadlineIso))) {
    if (!dates.has(deadlineIso)) {
      return {
        ok: false,
        code: "AMBIGUOUS_DEADLINE",
        message: "The forecast itself must name the deadline. CalledIt will not guess what “soon” or “Q1” means.",
      };
    }
  }
  if (!dates.has(deadlineIso)) {
    return {
      ok: false,
      code: "DEADLINE_MISMATCH",
      message: "The date in the forecast does not match the deadline you selected.",
    };
  }
  return { ok: true };
}

export const IMPORT_HOSTS = ["x.com", "twitter.com", "warpcast.com", "farcaster.xyz", "github.com", "paragraph.xyz", "mirror.xyz"];

export const RESOLUTION_HOSTS = [
  "reuters.com",
  "apnews.com",
  "bbc.com",
  "bbc.co.uk",
  "bloomberg.com",
  "coindesk.com",
  "coingecko.com",
  "coinmarketcap.com",
  "espn.com",
  "sec.gov",
  "federalreserve.gov",
];

function hostAllowed(host: string, domains: string[]): boolean {
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

/** Shared URL gate. The chain remains canonical; this only keeps the wallet closed. */
function preflightHttps(url: string, domains: string[], kind: "import" | "resolution"): Preflight {
  const value = url.trim();
  if (value.length > 512) {
    return { ok: false, code: "URL_LENGTH", message: "That page address is too long." };
  }
  // eslint-disable-next-line no-control-regex -- URLs with control bytes cannot reach contract web rendering.
  if (/[\u0000-\u001f\s\\]/.test(value) || [...value].some((char) => char.charCodeAt(0) > 126)) {
    return { ok: false, code: "URL_ENCODING", message: "The page address has characters the contract will not accept." };
  }
  if (value.split("?")[0]?.includes("%")) {
    return { ok: false, code: "URL_ENCODING", message: "The page address cannot use percent-encoding in the path." };
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, code: "URL_PARSE", message: "That page address could not be read." };
  }
  if (parsed.protocol !== "https:") {
    return {
      ok: false,
      code: "URL_SCHEME",
      message: kind === "import"
        ? "Imported posts have to be https. The wallet stays closed for this address."
        : "Evidence has to be https. The wallet stays closed for this address.",
    };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, code: "URL_USERINFO", message: "The page address cannot hide a username or password." };
  }
  if (parsed.hash) {
    return { ok: false, code: "URL_FRAGMENT", message: "The page address cannot include a fragment." };
  }
  if (parsed.port) {
    return { ok: false, code: "URL_PORT", message: "The page address cannot include a port." };
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".localhost") || host.endsWith(".internal")) {
    return { ok: false, code: "URL_HOST_BLOCKED", message: "That host is not a public page." };
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") || host.startsWith("[")) {
    return { ok: false, code: "URL_IP_LITERAL", message: "The page address cannot be an IP address." };
  }
  if (!hostAllowed(host, domains)) {
    return {
      ok: false,
      code: kind === "import" ? "SOURCE_NOT_ALLOWED" : "EVIDENCE_NOT_ALLOWED",
      message: kind === "import"
        ? "That site is not on the import list. Use a public post on X, Farcaster, GitHub, Paragraph, or Mirror."
        : "That page is not on the source list frozen when this forecast was locked.",
    };
  }
  return { ok: true };
}

/** Stop the wallet opening for an import the contract would revert. */
export function preflightSourceUrl(url: string, domains: string[] = IMPORT_HOSTS): Preflight {
  if (!url.trim()) {
    return { ok: false, code: "SOURCE_URL", message: "Paste the public page that already contains this sentence." };
  }
  return preflightHttps(url, domains, "import");
}

/** One to three resolution pages. New lines or commas both work. The chain still checks the snapshot. */
export function preflightEvidence(raw: string, domains: string[] = RESOLUTION_HOSTS): Preflight {
  const parts = raw.split(/[\n,]+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 1 || parts.length > 3) {
    return { ok: false, code: "EVIDENCE_COUNT", message: "Add one to three https pages, separated by commas or new lines." };
  }
  for (const part of parts) {
    const check = preflightHttps(part, domains, "resolution");
    if (!check.ok) return check;
  }
  return { ok: true };
}

export function evidenceList(raw: string): string {
  return raw.split(/[\n,]+/).map((part) => part.trim()).filter(Boolean).join(",");
}
