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

export function resumeMatchDetails(job, resumeProfile) {
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

  const matchedSkills = skills.filter((skill) => {
    const aliases = SKILL_ALIASES[skill.toLowerCase()] || [skill];
    return aliases.some((alias) => aliasMatches(alias, jobTerms));
  });
  const overlappingTerms = [...jobTerms].filter(
    (term) => !GENERIC_JOB_TERMS.has(term) && resumeTerms.has(term),
  );
  const category =
    job.role_category && job.role_category !== "other"
      ? job.role_category
      : FALLBACK_CATEGORY_PATTERNS.find(([, pattern]) =>
          pattern.test(job.title || ""),
        )?.[0];
  const categoryTerms = CATEGORY_RESUME_TERMS[category];
  const categoryMatches =
    categoryTerms && [...categoryTerms].some((term) => resumeTerms.has(term));

  const score = Math.min(
    95,
    Math.min(48, matchedSkills.length * 12) +
      Math.min(32, overlappingTerms.length * 8) +
      (categoryMatches ? 25 : 0),
  );
  const reasons = [];
  if (matchedSkills.length) {
    reasons.push(`Skills: ${matchedSkills.slice(0, 3).join(", ")}`);
  }
  if (categoryMatches) {
    reasons.push(`${String(category).replaceAll("_", " ")} role affinity`);
  }
  if (overlappingTerms.length) {
    reasons.push(
      `Resume terms: ${overlappingTerms.slice(0, 3).join(", ")}`,
    );
  }
  if (!job.description) {
    reasons.push("Estimate based on title because no job description is available");
  }
  return {
    score,
    reasons,
    hasDescription: Boolean(job.description),
  };
}

export function resumeMatchScore(job, resumeProfile) {
  return resumeMatchDetails(job, resumeProfile)?.score ?? null;
}

export function personalizedJobDetails(
  job,
  preferences,
  resumeProfile,
  referenceDate = new Date(),
) {
  const haystack = [
    job.company,
    job.title,
    job.location,
    job.description,
    ...(job.recommendation_terms || []),
  ]
    .join(" ")
    .toLowerCase();
  const haystackTerms = new Set(terms(haystack));
  const locations = preferences?.locations || [];
  const location = String(job.location || "").toLowerCase();
  const locationIndex = locations.findIndex((value) =>
    location.includes(String(value).toLowerCase()),
  );
  const locationScore =
    locationIndex < 0 ? 0 : 40 / (locationIndex + 1);
  const roleScore = (preferences?.role_categories || []).includes(
    job.role_category,
  )
    ? 15
    : 0;
  const keywordScore = Math.min(
    15,
    (preferences?.include_keywords || []).filter((keyword) => {
      const keywordTerms = terms(keyword);
      return (
        keywordTerms.length > 0 &&
        keywordTerms.every((term) => haystackTerms.has(term))
      );
    }).length * 5,
  );
  const remoteScore =
    preferences?.remote_only && job.is_remote ? 5 : 0;
  const ageDays = Math.max(
    0,
    (referenceDate - effectiveJobDate(job, referenceDate)) / 86_400_000,
  );
  const recencyScore = Math.max(0, 60 - ageDays * 2);
  const resumeDetails = resumeMatchDetails(job, resumeProfile);
  const resumeScore = resumeDetails?.score || 0;
  const resumeGraduationYears = resumeProfile?.graduation_years || [];
  const graduationYears = job.graduation_years || [];
  const graduationMatch =
    graduationYears.length > 0 &&
    resumeGraduationYears.some((year) => graduationYears.includes(year));
  const graduationMismatch =
    graduationYears.length > 0 &&
    resumeGraduationYears.length > 0 &&
    !graduationMatch;
  const degreeMatch =
    !job.degree_required || (resumeProfile?.degree_terms || []).length > 0;
  const resumeExperience = Number(resumeProfile?.experience_years || 0);
  const experienceMatch =
    job.experience_min !== null &&
    job.experience_min !== undefined &&
    resumeExperience > 0 &&
    resumeExperience >= Number(job.experience_min);
  const experienceMismatch =
    job.experience_min !== null &&
    job.experience_min !== undefined &&
    resumeExperience > 0 &&
    resumeExperience < Number(job.experience_min);
  const eligibilityScore =
    (graduationMatch ? 10 : graduationMismatch ? -20 : 0) +
    (job.degree_required ? (degreeMatch ? 5 : -10) : 0) +
    (experienceMatch ? 5 : experienceMismatch ? -10 : 0);
  const deadline = job.application_deadline
    ? new Date(`${job.application_deadline}T23:59:59`)
    : null;
  const deadlineDays = deadline
    ? (deadline - referenceDate) / 86_400_000
    : null;
  const urgencyScore =
    deadlineDays !== null && deadlineDays >= 0
      ? deadlineDays <= 14
        ? 15
        : deadlineDays <= 30
          ? 8
          : 0
      : 0;
  const verificationScore =
    job.verification_status === "verified" ? 5 : 0;
  const feedbackScore = Number(job.feedback_adjustment || 0);
  const score =
    resumeScore +
    locationScore +
    roleScore +
    keywordScore +
    remoteScore +
    recencyScore +
    eligibilityScore +
    urgencyScore +
    verificationScore +
    feedbackScore;
  const reasons = [];
  if (locationScore) {
    reasons.push(
      locationIndex === 0
        ? "Top location preference"
        : `Location preference #${locationIndex + 1}`,
    );
  }
  if (resumeDetails?.reasons.length) {
    reasons.push(...resumeDetails.reasons.slice(0, 2));
  }
  if (recencyScore >= 45) {
    reasons.push("Recently posted");
  } else if (recencyScore > 0) {
    reasons.push("Recency considered");
  }
  if (graduationMatch) {
    reasons.push("Graduation year matches");
  }
  if (degreeMatch && job.degree_required) {
    reasons.push("Degree requirement matches");
  }
  if (experienceMatch) {
    reasons.push("Experience requirement matches");
  }
  if (urgencyScore) {
    reasons.push("Application deadline approaching");
  }
  if (verificationScore) {
    reasons.push("Application link verified");
  }
  if (feedbackScore < 0) {
    reasons.push("Adjusted using your feedback");
  }
  return {
    score,
    reasons,
    components: {
      resume: resumeScore,
      location: locationScore,
      role: roleScore,
      keywords: keywordScore,
      remote: remoteScore,
      recency: recencyScore,
      eligibility: eligibilityScore,
      urgency: urgencyScore,
      verification: verificationScore,
      feedback: feedbackScore,
    },
  };
}

export function personalizedJobScore(
  job,
  preferences,
  resumeProfile,
  referenceDate = new Date(),
) {
  return personalizedJobDetails(
    job,
    preferences,
    resumeProfile,
    referenceDate,
  ).score;
}

export function isLikelyEligible(job, resumeProfile) {
  const resumeGraduationYears = resumeProfile?.graduation_years || [];
  const graduationYears = job.graduation_years || [];
  if (
    graduationYears.length > 0 &&
    resumeGraduationYears.length > 0 &&
    !resumeGraduationYears.some((year) => graduationYears.includes(year))
  ) {
    return false;
  }
  if (
    job.degree_required &&
    !(resumeProfile?.degree_terms || []).length
  ) {
    return false;
  }
  const resumeExperience = Number(resumeProfile?.experience_years || 0);
  return !(
    job.experience_min !== null &&
    job.experience_min !== undefined &&
    resumeExperience > 0 &&
    resumeExperience < Number(job.experience_min)
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

export function sortJobsRecommended(
  jobs,
  preferences,
  resumeProfile,
  referenceDate = new Date(),
) {
  return [...jobs].sort(
    (left, right) =>
      personalizedJobScore(
        right,
        preferences,
        resumeProfile,
        referenceDate,
      ) -
        personalizedJobScore(
          left,
          preferences,
          resumeProfile,
          referenceDate,
        ) ||
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
