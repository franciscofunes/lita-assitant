'use client'

import { Check, ChevronLeft, ChevronRight, Clipboard, FileText, RotateCcw, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  buildTransactionMarkdown, normalizeAmount, questionLabel,
  questionsForCategory, validateWizardAnswer,
  type WizardAnswers, type WizardField, type TransactionCategory,
} from '@/lib/transactionMarkdownWizard'

type Props = {
  categories: TransactionCategory[]
  onClose: () => void
}

export default function TransactionMarkdownWizard({ categories, onClose }: Props) {
  const [answers, setAnswers] = useState<WizardAnswers>({})
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [copyStatus, setCopyStatus] = useState('')
  const fields = useMemo(() => questionsForCategory(answers.category || ''), [answers.category])
  const complete = step >= fields.length
  const currentField: WizardField | undefined = complete ? undefined : fields[step]
  const options = useMemo(
    () => categories.filter((entry, index, rows) =>
      Boolean(entry.name?.trim()) &&
      rows.findIndex((other) => other.name === entry.name) === index,
    ).slice(0, 120),
    [categories],
  )
  const markdown = useMemo(() => {
    if (!complete) return ''
    try { return buildTransactionMarkdown(answers) } catch { return '' }
  }, [complete, answers])

  const next = () => {
    if (!currentField) return
    const nextValue = draft.trim()
    if (currentField === 'category' && !options.some((item) => item.name === nextValue)) {
      setError('Elegí una categoría configurada en LTC.')
      return
    }
    const issue = validateWizardAnswer(currentField, nextValue, answers.category || nextValue)
    if (issue) { setError(issue); return }
    setAnswers((current) => ({ ...current, [currentField]: nextValue }))
    setStep((current) => current + 1)
    setDraft('')
    setError('')
    setCopyStatus('')
  }

  const back = () => {
    if (step <= 0) return
    const previous = fields[step - 1]
    setDraft(answers[previous] || '')
    setStep((current) => current - 1)
    setError('')
    setCopyStatus('')
  }

  const startOver = () => {
    setAnswers({})
    setStep(0)
    setDraft('')
    setError('')
    setCopyStatus('')
  }

  const copy = async () => {
    if (!markdown) return
    try {
      await navigator.clipboard.writeText(markdown)
      setCopyStatus('Markdown copiado. Pegalo en “Actualizar desde Markdown” de tu transacción.')
    } catch {
      setCopyStatus('No se pudo copiar automáticamente. Seleccioná el Markdown de abajo y copialo.')
    }
  }

  const calculated = normalizeAmount(answers.currencyQuantity || '')
  const rate = normalizeAmount(answers.currencyExchangeRate || '')
  const calculatedAmount = calculated !== null && rate !== null
    ? (Math.round(calculated * rate * 100) / 100).toFixed(2) : ''

  return (
    <section aria-label="Asistente para cargar una transacción" className="absolute inset-0 z-30 flex min-h-0 flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-5 w-5 shrink-0 text-violet-600 dark:text-violet-300" />
          <div className="min-w-0">
            <h2 className="text-sm font-bold">Preparar transacción</h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">Preguntas guiadas · sin guardar datos</p>
          </div>
        </div>
        <button type="button" aria-label="Cerrar asistente de transacción" onClick={onClose}
          className="rounded-lg border border-slate-300 p-2 dark:border-slate-700">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="lita-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto w-full max-w-xl space-y-4">
          <p className="text-xs font-semibold text-violet-700 dark:text-violet-300" role="status">
            {complete ? '¡Listo para copiar!' : `Pregunta ${step + 1} de ${fields.length}`}
          </p>
          <div className="flex items-start gap-2.5">
            <div className="rounded-xl bg-violet-500/15 p-2 text-violet-700 dark:text-violet-300">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-slate-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-slate-900">
              {complete ? (
                <>
                  <h3 className="font-bold">Tu Markdown está listo</h3>
                  <p className="mt-2 text-slate-600 dark:text-slate-300">
                    Copialo, abrí una transacción en LTC y pegalo en <strong>Actualizar desde Markdown</strong>.
                    Revisá todos los datos antes de guardar.
                  </p>
                </>
              ) : (
                <p className="font-semibold">{questionLabel(currentField!, answers.category)}</p>
              )}
            </div>
          </div>

          {step > 0 && (
            <div className="space-y-1.5">
              {fields.slice(0, Math.min(step, fields.length)).map((field) => (
                <div key={field} className="flex justify-end">
                  <div className="max-w-[90%] break-words rounded-2xl rounded-tr-md bg-violet-600 px-3 py-2 text-xs font-medium text-white">
                    {answers[field] || (field === 'amount' && calculatedAmount ? `ARS ${calculatedAmount} (calculado)` : 'Omitido')}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!complete && options.length === 0 && currentField === 'category' ? (
            <div role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
              Abrí Lita desde <strong>Transacciones</strong> para usar las categorías de tu cuenta.
              No voy a inventar categorías que puedan provocar errores al importar.
            </div>
          ) : !complete && (
            <form onSubmit={(event) => { event.preventDefault(); next() }}
              className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              {currentField === 'category' ? (
                <select autoFocus aria-label="Categoría de la transacción" value={draft}
                  onChange={(event) => { setDraft(event.target.value); setError('') }}
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-base text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white">
                  <option value="">Elegí una categoría…</option>
                  {options.map((category) => <option key={category.name} value={category.name}>
                    {category.name}{category.isExpense ? ' · Gasto' : ' · Ingreso'}
                  </option>)}
                </select>
              ) : (
                <input
                  autoFocus
                  aria-label={questionLabel(currentField!, answers.category)}
                  type={currentField === 'date' || currentField === 'selectedCloseDate' ? 'date' : 'text'}
                  inputMode={['amount', 'currencyQuantity', 'currencyExchangeRate'].includes(currentField || '') ? 'decimal' : 'text'}
                  value={draft}
                  maxLength={160}
                  placeholder={currentField === 'amount' && calculatedAmount
                    ? `Calculado: ARS ${calculatedAmount}`
                    : currentField === 'comment' ? 'Opcional' : 'Escribí tu respuesta…'}
                  onChange={(event) => { setDraft(event.target.value); setError('') }}
                  className="w-full rounded-xl border border-slate-300 bg-white p-3 text-base text-slate-900 placeholder:text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                />
              )}
              {error && <p role="alert" className="text-xs text-red-700 dark:text-red-300">{error}</p>}
              <div className="flex gap-2">
                {step > 0 && <button type="button" onClick={back}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-300 px-3 py-2.5 text-sm dark:border-slate-600">
                  <ChevronLeft className="h-4 w-4" /> Atrás
                </button>}
                <button type="submit" disabled={currentField === 'category' && !draft}
                  className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">
                  {currentField === 'comment' || step === fields.length - 1 ? 'Generar Markdown' : 'Continuar'}
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </form>
          )}
          {complete && (
            <div className="space-y-3">
              <pre aria-label="Markdown de la transacción" className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-slate-300 bg-white p-3 font-mono text-xs leading-relaxed text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">{markdown}</pre>
              <button type="button" onClick={copy} disabled={!markdown}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-40">
                {copyStatus.startsWith('Markdown copiado') ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
                Copiar Markdown
              </button>
              {copyStatus && <p role="status" className="text-xs text-slate-600 dark:text-slate-300">{copyStatus}</p>}
              <button type="button" onClick={startOver}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold dark:border-slate-700">
                <RotateCcw className="h-4 w-4" /> Preparar otra transacción
              </button>
              <button type="button" onClick={back} className="text-sm font-medium text-violet-700 underline dark:text-violet-300">
                Modificar la última respuesta
              </button>
            </div>
          )}
          <p className="text-center text-xs text-slate-600 dark:text-slate-400">
            No se crea ningún gasto ni se envía el borrador al modelo de IA. Vos decidís cuándo guardarlo en LTC.
          </p>
        </div>
      </div>
    </section>
  )
}
