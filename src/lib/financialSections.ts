// Shared client/server supported LTC financial contexts.
// Do not widen the provider domain beyond known financial sections.
export const SUPPORTED_LTC_FINANCIAL_SECTIONS = ['transactions', 'portfolio', 'banks'] as const;

export const isSupportedLtcFinancialSection = (value: unknown): boolean =>
  typeof value === 'string' &&
  (SUPPORTED_LTC_FINANCIAL_SECTIONS as readonly string[]).includes(value);
