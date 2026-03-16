import type { FilingStatus } from '../types.js';

export interface FilingThresholds {
  single: number;
  mfj: number;
}

export const FEDERAL_STANDARD_DEDUCTION_2025: Record<FilingStatus, number> = {
  single: 15750,
  mfj: 31500,
};

export const FEDERAL_ORDINARY_BRACKETS_2025: Record<
  FilingStatus,
  Array<{ upTo: number; rate: number }>
> = {
  single: [
    { upTo: 11925, rate: 0.1 },
    { upTo: 48475, rate: 0.12 },
    { upTo: 103350, rate: 0.22 },
    { upTo: 197300, rate: 0.24 },
    { upTo: 250525, rate: 0.32 },
    { upTo: 626350, rate: 0.35 },
    { upTo: Number.POSITIVE_INFINITY, rate: 0.37 },
  ],
  mfj: [
    { upTo: 23850, rate: 0.1 },
    { upTo: 96950, rate: 0.12 },
    { upTo: 206700, rate: 0.22 },
    { upTo: 394600, rate: 0.24 },
    { upTo: 501050, rate: 0.32 },
    { upTo: 751600, rate: 0.35 },
    { upTo: Number.POSITIVE_INFINITY, rate: 0.37 },
  ],
};

export const FEDERAL_QD_ZERO_RATE_THRESHOLD_2025: Record<FilingStatus, number> = {
  single: 48350,
  mfj: 96700,
};

export const FEDERAL_QD_FIFTEEN_RATE_THRESHOLD_2025: Record<FilingStatus, number> = {
  single: 533400,
  mfj: 600050,
};

export const FEDERAL_SALT_LIMIT_2025: Record<FilingStatus, number> = {
  single: 40000,
  mfj: 40000,
};

export const FEDERAL_SALT_PHASEDOWN_AGI_2025: FilingThresholds = {
  single: 500000,
  mfj: 500000,
};

export const FEDERAL_SALT_MIN_FLOOR_2025: Record<FilingStatus, number> = {
  single: 10000,
  mfj: 10000,
};

export const TRADITIONAL_IRA_PHASEOUT_START_2025: Record<FilingStatus, number> = {
  single: 89000,
  mfj: 146000,
};

export const TRADITIONAL_IRA_PHASEOUT_WIDTH_2025: Record<FilingStatus, number> = {
  single: 10000,
  mfj: 20000,
};

export const TRADITIONAL_IRA_MAX_CONTRIBUTION_UNDER_50_2025 = 7000;
