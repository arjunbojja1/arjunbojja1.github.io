export const SOURCES = [
  {
    key: "new_grad",
    label: "New grad roles",
    url: "https://raw.githubusercontent.com/vanshb03/New-Grad-2027/dev/README.md",
  },
  {
    key: "canada_new_grad",
    label: "Canada new grad roles",
    url: "https://raw.githubusercontent.com/vanshb03/New-Grad-2027/dev/Canada.md",
  },
  {
    key: "internship",
    label: "Summer 2027 internships",
    url: "https://raw.githubusercontent.com/vanshb03/Summer2027-Internships/dev/README.md",
  },
  {
    key: "offseason_internship",
    label: "Off-season internships",
    url: "https://raw.githubusercontent.com/vanshb03/Summer2027-Internships/dev/OFFSEASON_README.md",
  },
];

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
  let previousCompany = "";
  for (const line of readme.slice(start, end).split("\n")) {
    if (!line.startsWith("|")) {
      continue;
    }
    const cells = line.split("|");
    if (cells.length < 7) {
      continue;
    }

    const company = canonicalCompany(cells[1]);
    if (!company || company === "Company" || /^-+$/.test(company)) {
      continue;
    }
    if (company === "↳") {
      if (previousCompany) {
        companies.add(previousCompany);
      }
    } else {
      previousCompany = company;
      companies.add(company);
    }
  }
  return [...companies].sort((left, right) => left.localeCompare(right));
}

export async function fetchCompanies(fetchImpl = fetch) {
  const companyLists = await Promise.all(
    SOURCES.map(async (source) => {
      const response = await fetchImpl(source.url, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(
          `${source.label} tracker returned HTTP ${response.status}.`,
        );
      }
      return parseCompanies(await response.text());
    }),
  );
  return [...new Set(companyLists.flat())].sort((left, right) =>
    left.localeCompare(right),
  );
}
