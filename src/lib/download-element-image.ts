export async function downloadElementAsPng(element: HTMLElement, fileName: string) {
  const { toPng } = await import("html-to-image");

  await document.fonts.ready;
  const dataUrl = await toPng(element, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: "#fffdf9",
    filter: (node) =>
      !(node instanceof HTMLElement && node.dataset.imageExportIgnore === "true"),
  });

  const link = document.createElement("a");
  link.download = `${sanitizeFileName(fileName)}.png`;
  link.href = dataUrl;
  link.click();
}

function sanitizeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "giao-dich";
}
