import test from "node:test";
import assert from "node:assert/strict";

import {
  effectivePostedDate,
  formatJobTiming,
  resumeMatchDetails,
  resumeMatchScore,
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
