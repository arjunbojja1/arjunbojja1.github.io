export async function readPdfPageText(page) {
  const reader = page.streamTextContent().getReader();
  const text = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      text.push(...value.items.map((item) => item.str));
    }
  } finally {
    reader.releaseLock();
  }
  return text.join(" ");
}
