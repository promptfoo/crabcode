import type { FilingStatus } from '../types.js';

export const CALIFORNIA_STANDARD_DEDUCTION_2025: Record<FilingStatus, number> = {
  single: 5706,
  mfj: 11412,
};

export const CALIFORNIA_TAX_BRACKETS_2025: Record<
  FilingStatus,
  Array<{ upTo: number; rate: number }>
> = {
  single: [
    { upTo: 11079, rate: 0.01 },
    { upTo: 26264, rate: 0.02 },
    { upTo: 41452, rate: 0.04 },
    { upTo: 57542, rate: 0.06 },
    { upTo: 72724, rate: 0.08 },
    { upTo: 371479, rate: 0.093 },
    { upTo: 445771, rate: 0.103 },
    { upTo: 742953, rate: 0.113 },
    { upTo: Number.POSITIVE_INFINITY, rate: 0.123 },
  ],
  mfj: [
    { upTo: 22158, rate: 0.01 },
    { upTo: 52528, rate: 0.02 },
    { upTo: 82904, rate: 0.04 },
    { upTo: 115084, rate: 0.06 },
    { upTo: 145448, rate: 0.08 },
    { upTo: 742958, rate: 0.093 },
    { upTo: 891542, rate: 0.103 },
    { upTo: 1485906, rate: 0.113 },
    { upTo: Number.POSITIVE_INFINITY, rate: 0.123 },
  ],
};

export const CALIFORNIA_PERSONAL_EXEMPTION_CREDIT_2025 = 153;
export const CALIFORNIA_DEPENDENT_EXEMPTION_CREDIT_2025 = 475;

export const CALIFORNIA_EXEMPTION_CREDIT_AGI_THRESHOLD_2025: Record<FilingStatus, number> = {
  single: 252203,
  mfj: 504411,
};

export const CALIFORNIA_ITEMIZED_LIMIT_AGI_THRESHOLD_2025: Record<FilingStatus, number> = {
  single: 252203,
  mfj: 504411,
};
