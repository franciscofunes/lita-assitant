/**
 * Lightweight, privacy-preserving decorative artwork for the PNG header.
 * NOT AI: fully deterministic Canvas rendering, does not read financial data,
 * require WebGPU, download weights or call a remote image provider.
 */
export function createLocalReportArtwork(): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new Error('Este navegador no permite crear una ilustración con Canvas.'))

  const backdrop = ctx.createLinearGradient(0, 0, 512, 512)
  backdrop.addColorStop(0, '#12172c')
  backdrop.addColorStop(0.52, '#322258')
  backdrop.addColorStop(1, '#151d3d')
  ctx.fillStyle = backdrop
  ctx.fillRect(0, 0, 512, 512)

  // Diffuse editorial lighting: clear highlights and a soft shadow add relief.
  const glow = ctx.createRadialGradient(360, 160, 12, 300, 210, 300)
  glow.addColorStop(0, 'rgba(198,177,255,0.48)')
  glow.addColorStop(0.5, 'rgba(121,92,233,0.19)')
  glow.addColorStop(1, 'rgba(121,92,233,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, 512, 512)

  ctx.save()
  ctx.translate(265, 255)
  ctx.rotate(-Math.PI / 6)
  ctx.shadowColor = 'rgba(6,8,24,0.65)'
  ctx.shadowBlur = 42
  ctx.shadowOffsetX = 12
  ctx.shadowOffsetY = 24
  const ribbon = ctx.createLinearGradient(-150, -90, 135, 130)
  ribbon.addColorStop(0, '#b7a4ff')
  ribbon.addColorStop(0.29, '#7d72df')
  ribbon.addColorStop(0.62, '#4545a8')
  ribbon.addColorStop(1, '#2e306f')
  ctx.fillStyle = ribbon
  ctx.beginPath()
  ctx.roundRect(-138, -115, 285, 220, 70)
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0
  ctx.strokeStyle = 'rgba(233,222,255,0.55)'
  ctx.lineWidth = 3
  ctx.stroke()
  const inset = ctx.createLinearGradient(-60, -90, 108, 150)
  inset.addColorStop(0, 'rgba(255,255,255,0.24)')
  inset.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = inset
  ctx.beginPath()
  ctx.roundRect(-105, -86, 214, 158, 49)
  ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.strokeStyle = 'rgba(221,211,255,0.78)'
  ctx.lineWidth = 7
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(285, 246, 69, -2.0, 0.72)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(157,191,255,0.42)'
  ctx.lineWidth = 14
  ctx.beginPath()
  ctx.arc(262, 261, 128, 1.5, 3.75)
  ctx.stroke()
  ctx.restore()

  // Reproducible fine-grain texture avoids a large patterned asset.
  let seed = 234567
  for (let i = 0; i < 2100; i++) {
    seed = (1664525 * seed + 1013904223) >>> 0
    const x = seed % 512
    seed = (1664525 * seed + 1013904223) >>> 0
    const y = seed % 512
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.033)' : 'rgba(5,9,25,0.045)'
    ctx.fillRect(x, y, 1, 1)
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.type !== 'image/png') {
        reject(new Error('No se pudo preparar la decoración PNG.'))
        return
      }
      resolve(blob)
    }, 'image/png')
  })
}
