import test from "node:test";
import assert from "node:assert/strict";

import {
  RECOMMENDED_COMPANIES,
  canonicalCompany,
  companyTag,
  fetchCompanies,
  parseCompanies,
} from "../company-data.js";

const README = `
TABLE_START
| Company | Role | Location | Application/Link | Date Posted |
| --- | --- | --- | --- | --- |
| **Uber Technologies, Inc.** | Software Engineer | San Francisco | link | Jul 12 |
| **Google** | Software Engineer | Mountain View | link | Jul 12 |
| **Google** | Site Reliability Engineer | Sunnyvale | link | Jul 11 |
| **Scale** | Backend Engineer | San Francisco | link | Jul 10 |
| Capital One | Data Analyst Intern | McLean | link | Jul 10 |
| ↳ | Product Internship | Plano | link | Jul 10 |
TABLE_END
| **Microsoft** | Outside table | Redmond | link | Jul 09 |
`;

test("parses, inherits, and canonicalizes unique companies", () => {
  assert.deepEqual(parseCompanies(README), [
    "Capital One",
    "Google",
    "Scale AI",
    "Uber",
  ]);
});

test("creates stable OneSignal tag keys", () => {
  assert.equal(companyTag("Uber Technologies, Inc."), "company_uber");
  assert.equal(companyTag("Scale"), "company_scale_ai");
  assert.equal(canonicalCompany("**Google**"), "Google");
});

test("includes requested companies in the recommended set", () => {
  const requested = [
    "Datadog",
    "Google DeepMind",
    "HRT",
    "IMC",
    "Jane Street",
    "Jump Trading",
    "Lyft",
    "Optiver",
    "Palantir",
    "PayPal",
    "Pinterest",
    "Qualcomm",
  ];

  assert.equal(RECOMMENDED_COMPANIES.length, 51);
  assert.ok(requested.every((company) => RECOMMENDED_COMPANIES.includes(company)));
});

test("canonicalizes requested trading and Qualcomm company names", () => {
  assert.equal(canonicalCompany("Hudson River Trading"), "HRT");
  assert.equal(canonicalCompany("Jump Trading Group"), "Jump Trading");
  assert.equal(canonicalCompany("Qualcomm Technologies, Inc."), "Qualcomm");
});

test("requires source table markers", () => {
  assert.throws(() => parseCompanies("| **Google** |"), /markers/);
});

test("reports source HTTP errors", async () => {
  const fakeFetch = async () => ({ ok: false, status: 503 });
  await assert.rejects(() => fetchCompanies(fakeFetch), /HTTP 503/);
});

test("merges companies from all trackers", async () => {
  const readmes = [
    README,
    README.replace("Google", "Microsoft").replace("Scale", "Stripe"),
    README.replace("Google", "Databricks"),
    README.replace("Google", "Cloudflare"),
  ];
  let request = 0;
  const fakeFetch = async () => ({
    ok: true,
    text: async () => readmes[request++],
  });

  const companies = await fetchCompanies(fakeFetch);

  assert.ok(companies.includes("Google"));
  assert.ok(companies.includes("Microsoft"));
  assert.ok(companies.includes("Stripe"));
});
