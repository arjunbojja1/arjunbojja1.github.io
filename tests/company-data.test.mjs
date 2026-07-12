import test from "node:test";
import assert from "node:assert/strict";

import {
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
TABLE_END
| **Microsoft** | Outside table | Redmond | link | Jul 09 |
`;

test("parses and canonicalizes unique companies", () => {
  assert.deepEqual(parseCompanies(README), ["Google", "Scale AI", "Uber"]);
});

test("creates stable OneSignal tag keys", () => {
  assert.equal(companyTag("Uber Technologies, Inc."), "company_uber");
  assert.equal(companyTag("Scale"), "company_scale_ai");
  assert.equal(canonicalCompany("**Google**"), "Google");
});

test("requires source table markers", () => {
  assert.throws(() => parseCompanies("| **Google** |"), /markers/);
});

test("reports source HTTP errors", async () => {
  const fakeFetch = async () => ({ ok: false, status: 503 });
  await assert.rejects(() => fetchCompanies(fakeFetch), /HTTP 503/);
});
