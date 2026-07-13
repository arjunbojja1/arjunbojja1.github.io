import test from "node:test";
import assert from "node:assert/strict";

import { readPdfPageText } from "../pdf-utils.js";

test("reads PDF text without ReadableStream async iteration", async () => {
  const chunks = [
    { items: [{ str: "Backend" }, { str: "Engineer" }] },
    { items: [{ str: "Python" }] },
  ];
  let released = false;
  const page = {
    streamTextContent: () => ({
      getReader: () => ({
        read: async () =>
          chunks.length
            ? { value: chunks.shift(), done: false }
            : { done: true },
        releaseLock: () => {
          released = true;
        },
      }),
    }),
  };

  assert.equal(await readPdfPageText(page), "Backend Engineer Python");
  assert.equal(released, true);
});
