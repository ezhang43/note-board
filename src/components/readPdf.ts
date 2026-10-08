import type { PdfText } from '../model/importPdf';

/**
 * A PDF's pieces of text, page by page, read with pdf.js. pdf.js (about 1.5 MB with its worker) is
 * loaded only here, when a PDF is imported, so the app's first load doesn't grow. Only text is read:
 * no page is drawn, nothing in the file runs (pdf.js runs a PDF's scripts only when asked to) and
 * its fonts are never added to the page. Throws when the file can't be read (broken, or has a password).
 */
// simple: no CMap files are shipped, so text in some older East Asian PDFs may not come out;
// add pdf.js's `cmaps/` folder and `cMapUrl` if that's ever needed.
export async function readPdf(data: ArrayBuffer): Promise<PdfText[][]> {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(data), enableXfa: false, disableFontFace: true,
    // Text comes out without pdf.js's font files, so its warning about them isn't shown.
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  });
  try {
    const doc = await task.promise;
    const pages: PdfText[][] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const { items } = await (await doc.getPage(i)).getTextContent();
      pages.push(
        items.flatMap((t) =>
          'str' in t ? [{ str: t.str, x: t.transform[4], y: t.transform[5], w: t.width, size: Math.hypot(t.transform[2], t.transform[3]) || t.height }] : [],
        ),
      );
    }
    return pages;
  } finally {
    void task.destroy(); // also ends the worker
  }
}
