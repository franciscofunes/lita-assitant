import { NextResponse } from 'next/server'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Temporary deployment-only diagnostic; removed before merging to main.
function syntheticPdf() {
  const stream = 'BT /F1 14 Tf 72 190 Td (WORKER SMOKE TEST) Tj ET\n'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length ' + Buffer.byteLength(stream) + ' >>\nstream\n' + stream + 'endstream',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf))
    pdf += (i + 1) + ' 0 obj\n' + objects[i] + '\nendobj\n'
  }
  const start = Buffer.byteLength(pdf)
  pdf += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n'
  for (const offset of offsets.slice(1)) pdf += String(offset).padStart(10, '0') + ' 00000 n \n'
  pdf += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + start + '\n%%EOF\n'
  return new Uint8Array(Buffer.from(pdf, 'ascii'))
}

export async function GET() {
  let stage = 'import'
  try {
    const pdfjs = require('pdfjs-dist/legacy/build/pdf.js')
    stage = 'getDocument'
    const loading = pdfjs.getDocument({data: syntheticPdf(), disableFontFace: true})
    const doc = await loading.promise
    stage = 'getTextContent'
    const page = await doc.getPage(1)
    const text = (await page.getTextContent()).items.map((x: any) => x.str || '').join(' ')
    await doc.destroy()
    return NextResponse.json({ok: text.includes('WORKER SMOKE TEST'), pageCount: 1})
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    const issue = /pdf\.worker/i.test(message) ? 'pdf-worker-missing' :
      /fake worker/i.test(message) ? 'fake-worker-load' :
      /Cannot find module/i.test(message) ? 'module-not-found' :
      /Invalid PDF/i.test(message) ? 'invalid-pdf' : 'other-internal'
    return NextResponse.json({ok: false, stage, issue,
      errorName: error instanceof Error ? error.name : 'Unknown'}, {status: 500})
  }
}
