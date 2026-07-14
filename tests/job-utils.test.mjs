import test from "node:test";
import assert from "node:assert/strict";

import {
  effectivePostedDate,
  formatJobTiming,
  isLikelyEligible,
  isLikelyNewGradJob,
  matchesEducationFilter,
  personalizedJobDetails,
  personalizedJobScore,
  resumeMatchDetails,
  resumeMatchScore,
  sortJobsRecommended,
  sortJobsNewestFirst,
} from "../job-utils.js";

const SOFTWARE_RESUME = {
  skills: ["Python", "TypeScript", "React", "AWS", "AI / ML"],
  keywords: ["backend", "full stack", "distributed systems"],
};

test("scores sparse tracker jobs using role and resume terms", () => {
  const baseline = resumeMatchScore(
    {
      title: "Software Engineer",
      description: "",
      recommendation_terms: ["engineer", "software"],
      role_category: "software",
    },
    SOFTWARE_RESUME,
  );
  const aiRole = resumeMatchScore(
    {
      title: "Full Stack AI Engineer",
      description: "",
      recommendation_terms: ["full", "stack"],
      role_category: "software",
    },
    SOFTWARE_RESUME,
  );

  assert.equal(baseline, 25);
  assert.ok(aiRole > baseline);
  assert.equal(resumeMatchScore({ title: "Engineer" }, {}), null);
});

test("explains score quality and matching signals", () => {
  const details = resumeMatchDetails(
    {
      title: "Backend Python Engineer",
      description: "",
      recommendation_terms: ["backend", "python"],
      role_category: "software",
    },
    SOFTWARE_RESUME,
  );

  assert.ok(details.score > 25);
  assert.ok(details.reasons.some((reason) => reason.includes("Python")));
  assert.ok(details.reasons.some((reason) => reason.includes("no job description")));
  assert.equal(details.hasDescription, false);
});

test("infers software affinity for sparse mobile and test roles", () => {
  for (const title of [
    "Mobile App Engineer",
    "Forward-Deployed Test Engineer",
  ]) {
    assert.equal(
      resumeMatchScore(
        {
          title,
          description: "",
          recommendation_terms: [],
          role_category: "other",
        },
        SOFTWARE_RESUME,
      ),
      25,
    );
  }
});

test("rolls yearless future dates into the previous year", () => {
  const reference = new Date("2026-07-12T12:00:00Z");
  const posted = effectivePostedDate({ posted_at: "2026-12-12" }, reference);

  assert.equal(posted.toISOString().slice(0, 10), "2025-12-12");
  assert.equal(
    formatJobTiming({ posted_at: "2026-12-12" }, reference),
    "Posted Dec 12, 2025",
  );
  assert.equal(
    effectivePostedDate({ posted_at: "2026-07-13" }, reference)
      .toISOString()
      .slice(0, 10),
    "2025-07-13",
  );
});

test("sorts newest-first with first-seen fallback", () => {
  const reference = new Date("2026-07-12T12:00:00Z");
  const jobs = sortJobsNewestFirst(
    [
      { id: "old", posted_at: "2026-06-01" },
      { id: "fallback", first_seen_at: "2026-07-11T12:00:00Z" },
      { id: "new", posted_at: "2026-07-12" },
    ],
    reference,
  );

  assert.deepEqual(jobs.map((job) => job.id), ["new", "fallback", "old"]);
});

test("ranks recommendations by location, preferences, resume, then recency", () => {
  const preferences = {
    locations: ["San Francisco", "New York"],
    role_categories: ["software"],
    include_keywords: ["backend"],
    remote_only: false,
  };
  const preferred = {
    id: "preferred",
    title: "Backend Python Engineer",
    company: "Example",
    location: "San Francisco, CA",
    description: "Build distributed systems in Python.",
    recommendation_terms: ["backend", "python"],
    role_category: "software",
    posted_at: "2026-07-10",
  };
  const secondLocation = {
    ...preferred,
    id: "second-location",
    location: "New York, NY",
    posted_at: "2026-07-12",
  };
  const weakSpecialization = {
    ...preferred,
    id: "weak-specialization",
    title: "Frontend Engineer",
    description: "Build user interfaces.",
    recommendation_terms: ["frontend"],
    posted_at: "2026-07-12",
  };

  assert.ok(
    personalizedJobScore(preferred, preferences, SOFTWARE_RESUME) >
      personalizedJobScore(secondLocation, preferences, SOFTWARE_RESUME),
  );
  assert.ok(
    personalizedJobScore(preferred, preferences, SOFTWARE_RESUME) >
      personalizedJobScore(weakSpecialization, preferences, SOFTWARE_RESUME),
  );
  assert.deepEqual(
    sortJobsRecommended(
      [weakSpecialization, secondLocation, preferred],
      preferences,
      SOFTWARE_RESUME,
      new Date("2026-07-13T12:00:00Z"),
    ).map((job) => job.id),
    ["preferred", "second-location", "weak-specialization"],
  );
});

test("includes freshness directly in the recommendation score", () => {
  const reference = new Date("2026-07-13T12:00:00Z");
  const job = {
    title: "Backend Python Engineer",
    company: "Example",
    location: "San Francisco, CA",
    description: "Build distributed systems in Python.",
    recommendation_terms: ["backend", "python"],
    role_category: "software",
  };
  const preferences = {
    locations: ["San Francisco"],
    role_categories: ["software"],
    include_keywords: ["backend"],
  };

  const freshScore = personalizedJobScore(
    { ...job, posted_at: "2026-07-13" },
    preferences,
    SOFTWARE_RESUME,
    reference,
  );
  const staleScore = personalizedJobScore(
    { ...job, posted_at: "2026-06-01" },
    preferences,
    SOFTWARE_RESUME,
    reference,
  );

  assert.ok(freshScore - staleScore > 55);
});

test("prioritizes likely new-grad jobs across every source", () => {
  const newGrad = {
    id: "new-grad",
    source: "ats",
    title: "2026 University Graduate - Software Engineer",
    company: "Example",
    location: "Remote",
    role_category: "software",
    posted_at: "2026-07-10",
  };
  const experienced = {
    ...newGrad,
    id: "experienced",
    source: "ats",
    title: "Backend Python Engineer",
    description: "Build distributed systems in Python.",
    recommendation_terms: ["backend", "python"],
    experience_min: 2,
    experience_max: null,
    posted_at: "2026-07-13",
  };
  const preferences = {
    source_keys: ["new_grad"],
    role_categories: ["software"],
  };

  assert.deepEqual(
    sortJobsRecommended(
      [experienced, newGrad],
      preferences,
      SOFTWARE_RESUME,
      new Date("2026-07-14T12:00:00Z"),
    ).map((job) => job.id),
    ["new-grad", "experienced"],
  );
  assert.equal(isLikelyNewGradJob(newGrad), true);
  assert.equal(isLikelyNewGradJob(experienced), false);
  assert.equal(
    isLikelyNewGradJob({
      source: "ats",
      title: "Software Engineer",
      experience_min: 0,
      experience_max: 2,
    }),
    true,
  );
  assert.ok(
    personalizedJobDetails(
      newGrad,
      preferences,
      SOFTWARE_RESUME,
    ).reasons.includes("Likely new-grad role"),
  );
});

test("explains eligibility, urgency, verification, and feedback signals", () => {
  const details = personalizedJobDetails(
    {
      title: "Backend Python Engineer",
      company: "Example",
      location: "San Francisco, CA",
      description: "Build Python services.",
      recommendation_terms: ["backend", "python"],
      role_category: "software",
      posted_at: "2026-07-13",
      application_deadline: "2026-07-20",
      graduation_years: [2027],
      degree_required: true,
      experience_min: 1,
      verification_status: "verified",
      feedback_adjustment: -5,
    },
    {
      locations: ["San Francisco"],
      role_categories: ["software"],
      include_keywords: ["backend"],
    },
    {
      ...SOFTWARE_RESUME,
      graduation_years: [2027],
      degree_terms: ["bachelor"],
      experience_years: 2,
    },
    new Date("2026-07-13T12:00:00Z"),
  );

  assert.ok(details.components.eligibility > 0);
  assert.equal(details.components.urgency, 15);
  assert.equal(details.components.verification, 5);
  assert.equal(details.components.feedback, -5);
  assert.ok(details.reasons.includes("Graduation year matches"));
  assert.ok(details.reasons.includes("Application link verified"));
});

test("filters only explicit eligibility mismatches", () => {
  const job = {
    graduation_years: [2027],
    degree_required: true,
    experience_min: 1,
  };

  assert.equal(
    isLikelyEligible(job, {
      graduation_years: [2027],
      degree_terms: ["bachelor"],
      experience_years: 2,
    }),
    true,
  );
  assert.equal(
    isLikelyEligible(job, {
      graduation_years: [2026],
      degree_terms: ["bachelor"],
      experience_years: 2,
    }),
    false,
  );
  assert.equal(isLikelyEligible(job, {}), false);
  assert.equal(isLikelyEligible({}, {}), true);
});

test("filters advanced-degree requirements without hiding unknown roles", () => {
  assert.equal(matchesEducationFilter({ education_level: "phd" }, ""), true);
  assert.equal(
    matchesEducationFilter({ education_level: "phd" }, "exclude_phd"),
    false,
  );
  assert.equal(
    matchesEducationFilter({ education_level: "masters" }, "exclude_phd"),
    true,
  );
  assert.equal(
    matchesEducationFilter({ education_level: "masters" }, "undergraduate"),
    false,
  );
  assert.equal(matchesEducationFilter({}, "undergraduate"), true);
});
