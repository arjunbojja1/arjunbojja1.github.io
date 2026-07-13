const SKILL_ALIASES = {
  python: ["python"],
  java: ["java"],
  javascript: ["javascript", "node", "node.js"],
  typescript: ["typescript"],
  "c#": ["c#", ".net"],
  react: ["react", "react.js"],
  aws: ["aws", "amazon web services"],
  azure: ["azure"],
  docker: ["docker", "container"],
  kubernetes: ["kubernetes", "k8s"],
  sql: ["sql", "database", "postgres", "mysql"],
  mongodb: ["mongodb"],
  "distributed systems": ["distributed systems", "microservices", "event driven"],
  observability: ["observability", "telemetry", "tracing"],
  "ai / ml": [
    "ai",
    "ml",
    "machine learning",
    "artificial intelligence",
    "llm",
  ],
  security: ["security", "authentication", "authorization"],
};

const CATEGORY_RESUME_TERMS = {
  software: new Set([
    "software",
    "developer",
    "backend",
    "frontend",
    "full",
    "stack",
    "swe",
    "python",
    "java",
    "javascript",
    "typescript",
    "react",
    "aws",
    "azure",
    "docker",
    "kubernetes",
    "sql",
    "distributed",
    "microservices",
  ]),
  data: new Set([
    "data",
    "analytics",
    "sql",
    "database",
    "python",
    "pandas",
    "spark",
  ]),
  ai_ml: new Set([
    "ai",
    "ml",
    "machine",
    "learning",
    "llm",
    "pytorch",
    "tensorflow",
  ]),
  product: new Set(["product", "roadmap", "strategy", "user"]),
  quant: new Set(["quant", "trading", "finance", "statistics"]),
  security: new Set([
    "security",
    "authentication",
    "authorization",
    "cybersecurity",
  ]),
  hardware: new Set([
    "hardware",
    "embedded",
    "firmware",
    "electrical",
    "asic",
    "rtl",
  ]),
};

const GENERIC_JOB_TERMS = new Set([
  "engineer",
  "engineering",
  "intern",
  "internship",
  "job",
  "junior",
  "member",
  "new",
  "grad",
  "role",
  "senior",
  "software",
  "staff",
]);

const SOURCE_LABELS = {
  new_grad: "US new grad",
  canada_new_grad: "Canada new grad",
  internship: "Summer internship",
  offseason_internship: "Off-season internship",
  ats: "Company career site",
};

const FALLBACK_CATEGORY_PATTERNS = [
  ["software", /\b(software|developer|mobile|ios|android|application|app|test engineer|qa|quality assurance|cloud|platform|devops)\b/i],
  ["data", /\b(data|analytics|business intelligence|database)\b/i],
  ["ai_ml", /\b(ai|ml|machine learning|deep learning|language model|computer vision)\b/i],
  ["product", /\b(product|program manager|design engineer)\b/i],
  ["quant", /\b(quant|trading|trader|researcher)\b/i],
  ["security", /\b(security|cyber|incident response)\b/i],
  ["hardware", /\b(hardware|asic|rtl|silicon|embedded|firmware|electrical|cpu architecture)\b/i],
];

function terms(value) {
  return String(value || "")
    .toLowerCase()
    .match(/[a-z][a-z0-9+#.]{1,}/g) || [];
}

function aliasMatches(alias, jobTerms) {
  const aliasTerms = terms(alias);
  return aliasTerms.length > 0 && aliasTerms.every((term) => jobTerms.has(term));
}

export function resumeMatchScore(job, resumeProfile) {
  const skills = resumeProfile?.skills || [];
  const keywords = resumeProfile?.keywords || [];
  if (!skills.length && !keywords.length) {
    return null;
  }

  const jobTerms = new Set([
    ...terms(job.title),
    ...terms(job.description),
    ...(job.recommendation_terms || []).flatMap(terms),
  ]);
  const resumeTerms = new Set([
    ...keywords.flatMap(terms),
    ...skills.flatMap((skill) => {
      const aliases = SKILL_ALIASES[skill.toLowerCase()] || [skill];
      return aliases.flatMap(terms);
    }),
  ]);

  const directMatches = skills.filter((skill) => {
    const aliases = SKILL_ALIASES[skill.toLowerCase()] || [skill];
    return aliases.some((alias) => aliasMatches(alias, jobTerms));
  }).length;
  const overlap = [...jobTerms].filter(
    (term) => !GENERIC_JOB_TERMS.has(term) && resumeTerms.has(term),
  ).length;
  const category =
    job.role_category && job.role_category !== "other"
      ? job.role_category
      : FALLBACK_CATEGORY_PATTERNS.find(([, pattern]) =>
          pattern.test(job.title || ""),
        )?.[0];
  const categoryTerms = CATEGORY_RESUME_TERMS[category];
  const categoryMatches =
    categoryTerms && [...categoryTerms].some((term) => resumeTerms.has(term));

  return Math.min(
    95,
    Math.min(48, directMatches * 12) +
      Math.min(32, overlap * 8) +
      (categoryMatches ? 25 : 0),
  );
}

export function effectivePostedDate(job, referenceDate = new Date()) {
  if (!job.posted_at) {
    return null;
  }
  const parsed = new Date(`${job.posted_at}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  const today = new Date(
    Date.UTC(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      referenceDate.getDate(),
    ),
  );
  if (parsed > today) {
    parsed.setUTCFullYear(parsed.getUTCFullYear() - 1);
  }
  return parsed;
}

export function effectiveJobDate(job, referenceDate = new Date()) {
  const posted = effectivePostedDate(job, referenceDate);
  if (posted) {
    return posted;
  }
  const firstSeen = new Date(job.first_seen_at || 0);
  return Number.isNaN(firstSeen.getTime()) ? new Date(0) : firstSeen;
}

export function sortJobsNewestFirst(jobs, referenceDate = new Date()) {
  return [...jobs].sort(
    (left, right) =>
      effectiveJobDate(right, referenceDate) -
      effectiveJobDate(left, referenceDate),
  );
}

export function formatJobTiming(job, referenceDate = new Date()) {
  const posted = effectivePostedDate(job, referenceDate);
  const date = posted || effectiveJobDate(job, referenceDate);
  const prefix = posted ? "Posted" : "Added";
  return `${prefix} ${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date)}`;
}

export function sourceLabel(source) {
  return SOURCE_LABELS[source] || source.replaceAll("_", " ");
}
