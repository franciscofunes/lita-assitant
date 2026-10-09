const test = require('node:test')
const assert = require('node:assert/strict')

// PII-free, entirely synthetic digital PDF. This exercises the same PDF.js
// worker used by production, not just the bank statement text parser.
function makePdf() {
  const text = 'BT /F1 14 Tf 72 190 Td (WORKER SMOKE TEST) Tj ET\n'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length ' + Buffer.byteLength(text) + ' >>\nstream\n' + text + 'endstream',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((entry, index) => {
    offsets.push(Buffer.byteLength(pdf))
    pdf += (index + 1) + ' 0 obj\n' + entry + '\nendobj\n'
  })
  const start = Buffer.byteLength(pdf)
  pdf += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n'
  offsets.slice(1).forEach((position) => {
    pdf += String(position).padStart(10, '0') + ' 00000 n \n'
  })
  pdf += 'trailer\n<< /Size ' + (objects.length + 1) +
    ' /Root 1 0 R >>\nstartxref\n' + start + '\n%%EOF\n'
  return new Uint8Array(Buffer.from(pdf, 'ascii'))
}

test('PDF.js runtime opens and reads a real synthetic PDF using the bundled worker', async () => {
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.js')
  const workerModule = require('pdfjs-dist/legacy/build/pdf.worker.js')
  globalThis.pdfjsWorker = workerModule

  assert.ok(workerModule.WorkerMessageHandler)
  const loading = pdfjs.getDocument({
    data: makePdf(), disableFontFace: true, useSystemFonts: false,
  })
  const doc = await loading.promise
  try {
    assert.equal(doc.numPages, 1)
    const page = await doc.getPage(1)
    const content = await page.getTextContent()
    assert.match(content.items.map((item) => item.str || '').join(' '), /WORKER SMOKE TEST/)
  } finally {
    await doc.destroy()
  }
})
