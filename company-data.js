export const SOURCE_URL =
  "https://raw.githubusercontent.com/vanshb03/New-Grad-2027/dev/README.md";

export const RECOMMENDED_COMPANIES = [
  "Microsoft",
  "Capital One",
  "Google",
  "Meta",
  "Amazon",
  "Apple",
  "NVIDIA",
  "Netflix",
  "Uber",
  "LinkedIn",
  "Salesforce",
  "Adobe",
  "Twitch",
  "Databricks",
  "Snowflake",
  "Cloudflare",
  "HashiCorp",
  "Grafana Labs",
  "Sentry",
  "Twilio",
  "ServiceNow",
  "Stripe",
  "Plaid",
  "Ramp",
  "Rippling",
  "Figma",
  "Notion",
  "Roblox",
  "DoorDash",
  "Scale AI",
  "Perplexity",
  "Glean",
  "Sierra",
  "Together AI",
  "Applied Intuition",
  "Waymo",
  "OpenAI",
  "Anthropic",
  "xAI",
];

const COMPANY_ALIASES = new Map([
  ["scale", "Scale AI"],
  ["twitch interactive inc", "Twitch"],
  ["uber technologies inc", "Uber"],
]);

export function normalizeCompany(value) {
  return value
    .toLowerCase()
    .replaceAll("&", " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function canonicalCompany(value) {
  const cleaned = value
    .replaceAll("**", "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return COMPANY_ALIASES.get(normalizeCompany(cleaned)) || cleaned;
}

export function companyTag(company) {
  return `company_${normalizeCompany(canonicalCompany(company)).replaceAll(" ", "_")}`;
}

export function parseCompanies(readme) {
  const start = readme.indexOf("TABLE_START");
  const end = readme.indexOf("TABLE_END", start + 1);
  if (start < 0 || end < 0) {
    throw new Error("The job table markers were not found.");
  }

  const companies = new Set();
  for (const line of readme.slice(start, end).split("\n")) {
    if (!line.startsWith("| **")) {
      continue;
    }
    const cells = line.split("|");
    if (cells.length >= 7) {
      companies.add(canonicalCompany(cells[1]));
    }
  }
  return [...companies].sort((left, right) => left.localeCompare(right));
}

export async function fetchCompanies(fetchImpl = fetch) {
  const response = await fetchImpl(SOURCE_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`The job tracker returned HTTP ${response.status}.`);
  }
  return parseCompanies(await response.text());
}
