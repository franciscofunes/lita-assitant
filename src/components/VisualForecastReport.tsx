'use client'

import { useEffect, useState } from 'react'
import { Download, Image as ImageIcon, Loader2, Sparkles, X } from 'lucide-react'
import {
  type ReportHorizon, type VisualReport, renderVisualReport, reportHorizons,
} from '@/lib/visualReport'

type Props = {
  report: VisualReport
  onClose: () => void
  onIllustrate: (progress: (percent: number) => void) => Promise<Blob | null>
}

export default function VisualForecastReport({ report, onClose, onIllustrate }: Props) {
  const [horizon, setHorizon] = useState<ReportHorizon>(1)
  const [illustration, setIllustration] = useState<Blob | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [renderError, setRenderError] = useState('')
  const [illustrationError, setIllustrationError] = useState('')
  const [illustrating, setIllustrating] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let cancelled = false
    let url = ''
    setRenderError('')
    setPreviewUrl('') // Never offer a stale download when changing the report horizon.
    void renderVisualReport(report, report.kind === 'cards' ? 1 : horizon, illustration)
      .then((blob) => {
        if (cancelled) return
        url = URL.createObjectURL(blob)
        setPreviewUrl(url)
      })
      .catch(() => {
        if (!cancelled) setRenderError('No se pudo preparar el PNG en este navegador.')
      })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [report, horizon, illustration])

  const addIllustration = async () => {
    if (illustrating) return
    setIllustrating(true)
    setIllustrationError('')
    setProgress(0)
    try {
      const blob = await onIllustrate((value) => setProgress(value))
      if (!blob || !blob.type.startsWith('image/') || blob.size > 8_000_000) {
        throw new Error('La ilustración no está disponible en este dispositivo.')
      }
      setIllustration(blob)
    } catch {
      setIllustrationError('No se pudo generar la ilustración local. Tu reporte normal sigue disponible.')
    } finally {
      setIllustrating(false)
    }
  }

  return (
    <section role="dialog" aria-modal="true" aria-labelledby="visual-report-title"
      className="absolute inset-0 z-40 flex min-h-0 flex-col overflow-hidden bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
        <div className="min-w-0">
          <h2 id="visual-report-title" className="flex items-center gap-2 text-base font-extrabold">
            <ImageIcon className="h-5 w-5 text-violet-600" /> Reporte visual
          </h2>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            {report.kind === 'cards' ? 'Tarjetas · referencia histórica' : 'Gastos · escenarios nominales'}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar reporte visual"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-300 dark:border-slate-700">
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto flex max-w-xl flex-col gap-4">
          {report.kind === 'spending' && (
            <fieldset className="flex items-center justify-between gap-2">
              <legend className="mb-2 text-sm font-semibold">Horizonte del reporte</legend>
              <div className="grid w-full grid-cols-3 gap-2">
                {reportHorizons.map((months) => (
                  <button key={months} type="button" aria-pressed={horizon === months}
                    onClick={() => setHorizon(months)}
                    className={`min-h-[44px] rounded-xl border px-2 text-sm font-semibold transition
                      ${horizon === months ? 'border-violet-500 bg-violet-600 text-white' :
                        'border-slate-300 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'}`}>
                    {months} {months === 1 ? 'mes' : 'meses'}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            {previewUrl ? (
              // The image URL is created from an in-memory Canvas PNG, never a remote API.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Reporte con escenarios bajo, base y alto separados por ARS y USD"
                className="h-auto w-full rounded-xl" />
            ) : (
              <div role="status" className="flex min-h-64 items-center justify-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin" /> Dibujando el reporte…
              </div>
            )}
          </div>

          {renderError && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{renderError}</p>}

          <a href={previewUrl || undefined} download={report.kind === 'cards' ? 'Lita-reporte-tarjetas.png' : 'Lita-proyeccion-gastos.png'}
            aria-disabled={!previewUrl} tabIndex={previewUrl ? 0 : -1}
            onClick={(event) => { if (!previewUrl) event.preventDefault() }}
            className={`inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold
              ${previewUrl ? 'bg-violet-600 text-white hover:bg-violet-700' : 'pointer-events-none bg-slate-300 text-slate-600'}`}>
            <Download className="h-5 w-5" /> Descargar PNG
          </a>

          <div className="rounded-xl border border-violet-200 bg-white p-3 text-sm dark:border-violet-900 dark:bg-slate-900">
            <p className="font-semibold">Ilustración generativa local · opcional</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              Se usa runonweb (Bonsai Image 4B) solo para decorar el reporte. Descarga aproximada de 3,4 GB;
              requiere WebGPU, una GPU compatible y memoria suficiente. Jamás se envían tus importes ni categorías al modelo.
            </p>
            <button type="button" onClick={() => void addIllustration()} disabled={illustrating}
              className="mt-3 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-violet-400 px-3 py-2 text-sm font-semibold text-violet-700 disabled:opacity-60 dark:text-violet-200">
              {illustrating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {illustrating ? 'Generando en este dispositivo…' : illustration ? 'Regenerar ilustración' : 'Generar ilustración con IA local'}
            </button>
            {illustrating && <div role="status" className="mt-3 space-y-1">
              <span className="text-xs">Descargando / generando: {progress}%</span>
              <progress max={100} value={progress} className="block w-full accent-violet-600" />
            </div>}
            {illustrationError && <p role="alert" className="mt-2 text-xs text-amber-700 dark:text-amber-300">{illustrationError}</p>}
          </div>
          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            Los importes y gráficos se dibujan localmente con Canvas a partir de agregados de LTC.
            Los meses sin registros no se tratan como cero, y no se mezclan ARS con USD.
            El resultado no representa obligaciones futuras confirmadas.
          </p>
        </div>
      </div>
    </section>
  )
}
