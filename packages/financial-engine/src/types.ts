/**
 * Financial Engine — input/output contracts.
 * Pure data types. No UI / AI / DB dependencies.
 * All monetary inputs are expressed in the study base currency unless `fxLinked` is true,
 * in which case the amount is in foreign currency and multiplied by `macro.fxRate`.
 */

export type Classification = 'VERIFIED' | 'USER_PROVIDED' | 'ESTIMATED' | 'UNAVAILABLE' | 'NEEDS_REVIEW'

export type InvestmentCategory =
  | 'land' | 'building' | 'equipment' | 'installation' | 'furniture' | 'vehicles'
  | 'license' | 'preoperating' | 'technology' | 'other'

export interface InvestmentItem {
  name: string
  category: InvestmentCategory
  amount: number
  /** Useful life in years. 0 = not depreciated (e.g. land). */
  usefulLife: number
  salvageValue?: number
  depMethod?: 'straight_line' | 'declining_balance'
  fxLinked?: boolean
  /** Year in which the spend happens (0 = before operations). Default 0. */
  year?: number
  classification?: Classification
}

export interface RevenueItem {
  name: string
  unit?: string
  /** Selling price per unit (year 1). */
  price: number
  /** Variable cost per produced unit (year 1). */
  unitVariableCost: number
  /** Units sold in operating year 1. */
  year1Volume: number
  /** Annual volume growth %. */
  growthPct?: number
  /** Max produceable units per year (0/undefined = unlimited). */
  capacity?: number
  /** Max utilisation of capacity %. Default 100. */
  utilizationPct?: number
  /** % of produced units lost as waste. Variable cost applies to produced units. */
  wastePct?: number
  returnsPct?: number
  discountPct?: number
  fxLinkedCost?: boolean
  classification?: Classification
}

export interface OpexItem {
  name: string
  category?: string
  costType: 'fixed' | 'variable_pct'
  /** Annual amount for fixed costs. */
  amount?: number
  /** % of net revenue for variable costs. */
  pctOfRevenue?: number
  /** Annual growth % (overrides macro.costGrowthPct when provided). */
  growthPct?: number
  fxLinked?: boolean
  classification?: Classification
}

export interface StaffItem {
  role: string
  count: number
  monthlySalary: number
  /** Employer social-insurance / benefits % on top of salary. */
  insurancePct?: number
  /** Months paid per year. Default 12. */
  monthsPerYear?: number
  growthPct?: number
  classification?: Classification
}

export interface LoanItem {
  name: string
  principal: number
  annualRatePct: number
  years: number
  graceYears?: number
  /** Up-front fees % of principal, paid & expensed in operating year 1. */
  feesPct?: number
  method?: 'annuity' | 'equal_principal'
}

export interface Assumptions {
  horizonYears: number
  /** Discount rate % used for NPV. */
  discountRatePct: number
  incomeTaxPct: number
  lossCarryForwardYears?: number
  priceGrowthPct?: number
  costGrowthPct?: number
  salaryGrowthPct?: number
  /** Base-currency units per 1 foreign unit. Default 1. */
  fxRate?: number
  receivableDays?: number
  inventoryDays?: number
  payableDays?: number
  /** Initial cash reserve expressed in months of year-1 cash operating costs. */
  cashReserveMonths?: number
  /** Equity contributed. If omitted: total investment − loans. */
  equity?: number
  /** Years of delay before operations start (0 = operations in year 1). */
  operationStartOffset?: number
  /** Include residual book value + working capital recovery in final-year project cash flow. Default true. */
  includeTerminalValue?: boolean
}

export interface StudyModel {
  currency: string
  investment: InvestmentItem[]
  revenue: RevenueItem[]
  opex: OpexItem[]
  staff: StaffItem[]
  loans: LoanItem[]
  assumptions: Assumptions
}

export interface ScenarioAdjustments {
  volumePct?: number
  pricePct?: number
  variableCostPct?: number
  salaryPct?: number
  fixedCostPct?: number
  capexPct?: number
  utilizationPct?: number
  interestRateDeltaPts?: number
  discountRateDeltaPts?: number
  fxPct?: number
  startDelayYears?: number
  horizonYears?: number
}

export interface Issue {
  code: string
  field?: string
  message_ar: string
  message_en: string
  severity: 'error' | 'warning' | 'info'
}

export interface YearRow {
  year: number
  operatingYear: number
  units: number
  grossSales: number
  discountsReturns: number
  netRevenue: number
  cogs: number
  grossProfit: number
  fixedOpex: number
  variableOpex: number
  staffCost: number
  ebitda: number
  depreciation: number
  ebit: number
  interest: number
  financeFees: number
  ebt: number
  tax: number
  netIncome: number
  netWorkingCapital: number
  changeInNWC: number
  capex: number
  loanDrawdown: number
  principalRepayment: number
  debtService: number
  projectCashFlow: number
  equityCashFlow: number
  cumulativeProjectCashFlow: number
  discountedProjectCashFlow: number
  cumulativeDiscountedCashFlow: number
  dscr: number | null
  // balance sheet (end of year)
  cash: number
  netFixedAssets: number
  totalAssets: number
  debtOutstanding: number
  equityBook: number
  retainedEarnings: number
  balanceCheck: number
}

export interface LoanScheduleRow {
  loan: string
  year: number
  openingBalance: number
  interest: number
  principal: number
  payment: number
  closingBalance: number
}

export interface DepreciationRow {
  asset: string
  year: number
  opening: number
  depreciation: number
  closing: number
}

export interface Metrics {
  totalInvestment: number
  capex: number
  initialCashReserve: number
  totalLoans: number
  equity: number
  fundingGap: number
  year1Revenue: number
  year1NetIncome: number
  totalNetIncome: number
  grossMarginPct: number | null
  operatingMarginPct: number | null
  netMarginPct: number | null
  ebitdaMarginPct: number | null
  npv: number
  irrPct: number | null
  equityIrrPct: number | null
  roiPct: number | null
  avgAnnualRoiPct: number | null
  paybackYears: number | null
  discountedPaybackYears: number | null
  breakEvenRevenue: number | null
  breakEvenUnits: number | null
  cashBreakEvenRevenue: number | null
  breakEvenUtilizationPct: number | null
  contributionMarginRatioPct: number | null
  minDscr: number | null
  avgDscr: number | null
  profitabilityIndex: number | null
}

export interface EngineResult {
  engineVersion: string
  currency: string
  computable: boolean
  issues: Issue[]
  metrics: Metrics | null
  years: YearRow[]
  loanSchedule: LoanScheduleRow[]
  depreciation: DepreciationRow[]
  definitions: Record<string, { ar: string; en: string; formula: string }>
}
