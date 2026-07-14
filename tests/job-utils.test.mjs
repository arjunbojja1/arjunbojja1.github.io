import test from "node:test";
import assert from "node:assert/strict";

import {
  effectivePostedDate,
  formatJobTiming,
  isLikelyEligible,
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
