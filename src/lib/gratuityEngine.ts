export type CountryCode = 'UAE' | 'KSA' | 'UK' | 'EU' | 'IN' | 'LATAM';
export type ContractType = 'limited' | 'unlimited';
export type TerminationType = 'resignation' | 'termination';

export interface CountryGratuityMeta {
  code: CountryCode;
  countryName: string;
  localName: string;
  defaultCurrency: string;
  accrualBase: string;
  keyModifiers: string;
}

export const COUNTRY_GRATUITY_LIST: CountryGratuityMeta[] = [
  {
    code: 'UAE',
    countryName: 'United Arab Emirates',
    localName: 'End-of-Service Gratuity',
    defaultCurrency: 'AED',
    accrualBase: '21 days basic salary/yr (1-5 yrs) + 30 days/yr (>5 yrs)',
    keyModifiers: 'Capped at 2 years total basic pay. No resignation penalties under current federal law.'
  },
  {
    code: 'KSA',
    countryName: 'Saudi Arabia (KSA)',
    localName: 'End of Service (EOSB)',
    defaultCurrency: 'SAR',
    accrualBase: 'Half-month actual wage/yr (1-5 yrs), 1 full month/yr thereafter',
    keyModifiers: 'Tiered resignation reductions apply (e.g. 1/3 for 2-5 yrs, 2/3 for 5-10 yrs, full after 10 yrs).'
  },
  {
    code: 'UK',
    countryName: 'United Kingdom',
    localName: 'Statutory Redundancy Pay',
    defaultCurrency: 'GBP',
    accrualBase: 'Age- and service-tiered weekly pay formula with statutory weekly cap',
    keyModifiers: 'Requires 2+ years continuous service; scaled by age brackets (<22: 0.5 wk, 22-40: 1 wk, 41+: 1.5 wks).'
  },
  {
    code: 'EU',
    countryName: 'European Union (France / Spain)',
    localName: 'Indemnité / Indemnización',
    defaultCurrency: 'EUR',
    accrualBase: 'Fraction of monthly salary per year of service (1/4 to 1/3 month/yr in France; 20-33 days/yr in Spain)',
    keyModifiers: 'Varies significantly by dismissal type (objective vs. economic/unfair dismissal caps).'
  },
  {
    code: 'IN',
    countryName: 'India',
    localName: 'Payment of Gratuity Act',
    defaultCurrency: 'INR',
    accrualBase: '15 days salary per completed year based on last drawn pay (15 * salary * yrs / 26)',
    keyModifiers: 'Requires minimum 5 years continuous service for statutory eligibility; capped at ₹20 Lakhs.'
  },
  {
    code: 'LATAM',
    countryName: 'Latin America (Brazil / Mexico)',
    localName: 'FGTS / Liquidación por Despido',
    defaultCurrency: 'BRL',
    accrualBase: 'Monthly mandatory reserve accumulation (8% FGTS) + 40% dismissal fine, or 3 months + 20 days/yr (Mexico)',
    keyModifiers: 'Integrated monthly employer deposits with cumulative payout triggers upon exit.'
  }
];

export interface GratuityInput {
  country: CountryCode;
  basicSalary: number;
  fixedAllowances?: number; // For KSA / LATAM
  weeklyPayCap?: number; // For UK
  employeeAge?: number; // For UK
  euRegion?: 'france' | 'spain_objective' | 'spain_unfair'; // For EU
  latamRegion?: 'brazil_fgts' | 'mexico_liquidacion'; // For LATAM
  years: number;
  months: number;
  days: number;
  contractType?: ContractType;
  terminationType?: TerminationType;
  unpaidDays?: number;
  currency?: string;
}

export interface GratuityBreakdown {
  country: CountryCode;
  countryName: string;
  localName: string;
  currency: string;
  totalServiceYears: number;
  baseSalaryUsed: number;
  dailyOrWeeklyBase: number;
  firstPeriodGratuity: number;
  secondPeriodGratuity: number;
  rawTotalGratuity: number;
  reductionPercentage: number;
  finalGratuity: number;
  isCapped: boolean;
  maxCapAmount?: number;
  notes: string[];
  eligibilityMet: boolean;
  ineligibilityReason?: string;
}

export function calculateGratuity(input: GratuityInput): GratuityBreakdown {
  const {
    country = 'UAE',
    basicSalary = 0,
    fixedAllowances = 0,
    weeklyPayCap = 700,
    employeeAge = 35,
    euRegion = 'france',
    latamRegion = 'brazil_fgts',
    years = 0,
    months = 0,
    days = 0,
    contractType = 'limited',
    terminationType = 'termination',
    unpaidDays = 0,
    currency,
  } = input;

  const countryMeta = COUNTRY_GRATUITY_LIST.find((c) => c.code === country) || COUNTRY_GRATUITY_LIST[0];
  const activeCurrency = currency || countryMeta.defaultCurrency;

  const safeBasic = Math.max(0, Number(basicSalary) || 0);
  const safeAllowances = Math.max(0, Number(fixedAllowances) || 0);
  const safeYears = Math.max(0, Number(years) || 0);
  const safeMonths = Math.max(0, Math.min(11, Number(months) || 0));
  const safeDays = Math.max(0, Math.min(31, Number(days) || 0));
  const safeUnpaid = Math.max(0, Number(unpaidDays) || 0);

  const rawServiceYears = safeYears + safeMonths / 12 + safeDays / 365;
  const totalServiceYears = Math.max(0, rawServiceYears - safeUnpaid / 365);

  const notes: string[] = [];

  // ==========================================
  // 1. UNITED ARAB EMIRATES (UAE)
  // ==========================================
  if (country === 'UAE') {
    const dailySalary = safeBasic / 30;
    notes.push(`Daily basic salary calculated as 1/30th of monthly basic (${activeCurrency} ${dailySalary.toFixed(2)}).`);

    if (totalServiceYears < 1 || safeBasic === 0) {
      return {
        country,
        countryName: countryMeta.countryName,
        localName: countryMeta.localName,
        currency: activeCurrency,
        totalServiceYears,
        baseSalaryUsed: safeBasic,
        dailyOrWeeklyBase: dailySalary,
        firstPeriodGratuity: 0,
        secondPeriodGratuity: 0,
        rawTotalGratuity: 0,
        reductionPercentage: 0,
        finalGratuity: 0,
        isCapped: false,
        maxCapAmount: safeBasic * 24,
        notes: ['Minimum 1 year of continuous service is required for UAE gratuity.'],
        eligibilityMet: false,
        ineligibilityReason: 'Service duration is under 1 year.',
      };
    }

    const firstPeriodYears = Math.min(totalServiceYears, 5);
    const firstPeriodGratuity = firstPeriodYears * (21 * dailySalary);

    const secondPeriodYears = Math.max(0, totalServiceYears - 5);
    const secondPeriodGratuity = secondPeriodYears * (30 * dailySalary);

    const rawTotalGratuity = firstPeriodGratuity + secondPeriodGratuity;

    let reductionFactor = 1.0;
    let reductionPercentage = 0;

    if (contractType === 'unlimited' && terminationType === 'resignation') {
      if (totalServiceYears >= 1 && totalServiceYears < 3) {
        reductionFactor = 1 / 3;
        reductionPercentage = 66.67;
        notes.push('Legacy unlimited contract resignation tier (1-3 yrs): 1/3 payout applied.');
      } else if (totalServiceYears >= 3 && totalServiceYears < 5) {
        reductionFactor = 2 / 3;
        reductionPercentage = 33.33;
        notes.push('Legacy unlimited contract resignation tier (3-5 yrs): 2/3 payout applied.');
      }
    } else {
      notes.push('Standard UAE Federal Labor Law (Decree-Law No. 33 of 2021): Full gratuity entitlement with no resignation deductions.');
    }

    let calculated = rawTotalGratuity * reductionFactor;
    const maxCapAmount = safeBasic * 24;
    const isCapped = calculated > maxCapAmount;
    const finalGratuity = isCapped ? maxCapAmount : calculated;

    if (isCapped) {
      notes.push(`Gratuity payout capped at maximum 2 years' basic salary (${activeCurrency} ${maxCapAmount.toLocaleString()}).`);
    }

    return {
      country,
      countryName: countryMeta.countryName,
      localName: countryMeta.localName,
      currency: activeCurrency,
      totalServiceYears,
      baseSalaryUsed: safeBasic,
      dailyOrWeeklyBase: dailySalary,
      firstPeriodGratuity,
      secondPeriodGratuity,
      rawTotalGratuity,
      reductionPercentage,
      finalGratuity,
      isCapped,
      maxCapAmount,
      notes,
      eligibilityMet: true,
    };
  }

  // ==========================================
  // 2. SAUDI ARABIA (KSA)
  // ==========================================
  if (country === 'KSA') {
    const actualWage = safeBasic + safeAllowances;
    const halfMonthWage = actualWage / 2;
    const fullMonthWage = actualWage;

    notes.push(`Actual Wage Base = Basic (${safeBasic}) + Allowances (${safeAllowances}) = ${activeCurrency} ${actualWage.toLocaleString()}.`);

    if (totalServiceYears < 1 || actualWage === 0) {
      return {
        country,
        countryName: countryMeta.countryName,
        localName: countryMeta.localName,
        currency: activeCurrency,
        totalServiceYears,
        baseSalaryUsed: actualWage,
        dailyOrWeeklyBase: actualWage / 30,
        firstPeriodGratuity: 0,
        secondPeriodGratuity: 0,
        rawTotalGratuity: 0,
        reductionPercentage: 0,
        finalGratuity: 0,
        isCapped: false,
        notes: ['Minimum 1 year of continuous service is required under KSA Labor Law Article 84.'],
        eligibilityMet: false,
        ineligibilityReason: 'Service duration is under 1 year.',
      };
    }

    const first5Years = Math.min(totalServiceYears, 5);
    const firstPeriodGratuity = first5Years * halfMonthWage;

    const remainingYears = Math.max(0, totalServiceYears - 5);
    const secondPeriodGratuity = remainingYears * fullMonthWage;

    const rawTotalGratuity = firstPeriodGratuity + secondPeriodGratuity;

    let reductionFactor = 1.0;
    let reductionPercentage = 0;

    if (terminationType === 'resignation') {
      if (totalServiceYears < 2) {
        reductionFactor = 0;
        reductionPercentage = 100;
        notes.push('KSA Article 85: Resignation with less than 2 years service yields 0% EOSB.');
      } else if (totalServiceYears >= 2 && totalServiceYears < 5) {
        reductionFactor = 1 / 3;
        reductionPercentage = 66.67;
        notes.push('KSA Article 85: Resignation with 2 to 5 years service yields 1/3 (33.33%) EOSB.');
      } else if (totalServiceYears >= 5 && totalServiceYears < 10) {
        reductionFactor = 2 / 3;
        reductionPercentage = 33.33;
        notes.push('KSA Article 85: Resignation with 5 to 10 years service yields 2/3 (66.67%) EOSB.');
      } else {
        reductionFactor = 1.0;
        reductionPercentage = 0;
        notes.push('KSA Article 85: Resignation with 10+ years service yields 100% full EOSB.');
      }
    } else {
      notes.push('Employer termination entitles employee to 100% full EOSB.');
    }

    const finalGratuity = rawTotalGratuity * reductionFactor;

    return {
      country,
      countryName: countryMeta.countryName,
      localName: countryMeta.localName,
      currency: activeCurrency,
      totalServiceYears,
      baseSalaryUsed: actualWage,
      dailyOrWeeklyBase: actualWage / 30,
      firstPeriodGratuity,
      secondPeriodGratuity,
      rawTotalGratuity,
      reductionPercentage,
      finalGratuity,
      isCapped: false,
      notes,
      eligibilityMet: reductionFactor > 0 || terminationType === 'termination',
      ineligibilityReason: reductionFactor === 0 ? 'Resignation before 2 full years of service results in zero EOSB payout.' : undefined,
    };
  }

  // ==========================================
  // 3. UNITED KINGDOM (UK)
  // ==========================================
  if (country === 'UK') {
    // Calculated weekly pay
    const calculatedWeekly = (safeBasic * 12) / 52;
    const actualWeeklyUsed = Math.min(calculatedWeekly, Math.max(100, Number(weeklyPayCap) || 700));

    notes.push(`Weekly pay calculated as £${calculatedWeekly.toFixed(2)} (capped at statutory limit £${actualWeeklyUsed.toFixed(2)}/week).`);

    if (totalServiceYears < 2) {
      return {
        country,
        countryName: countryMeta.countryName,
        localName: countryMeta.localName,
        currency: activeCurrency,
        totalServiceYears,
        baseSalaryUsed: safeBasic,
        dailyOrWeeklyBase: actualWeeklyUsed,
        firstPeriodGratuity: 0,
        secondPeriodGratuity: 0,
        rawTotalGratuity: 0,
        reductionPercentage: 0,
        finalGratuity: 0,
        isCapped: false,
        notes: ['Statutory Redundancy Pay requires a minimum of 2 years continuous service in the UK.'],
        eligibilityMet: false,
        ineligibilityReason: 'Requires at least 2 full years of continuous service.',
      };
    }

    // Max 20 years counted
    const cappedServiceYears = Math.min(totalServiceYears, 20);
    if (totalServiceYears > 20) {
      notes.push('Statutory Redundancy Pay limits countable service to a maximum of 20 years.');
    }

    // Age tiers:
    // < 22: 0.5 week
    // 22 - 40: 1 week
    // 41+: 1.5 weeks
    let ratePerYear = 1.0;
    if (employeeAge < 22) {
      ratePerYear = 0.5;
      notes.push('Age tier (< 22 yrs): 0.5 week of pay per year of service.');
    } else if (employeeAge >= 41) {
      ratePerYear = 1.5;
      notes.push('Age tier (41+ yrs): 1.5 weeks of pay per year of service.');
    } else {
      ratePerYear = 1.0;
      notes.push('Age tier (22 - 40 yrs): 1.0 week of pay per year of service.');
    }

    const finalGratuity = cappedServiceYears * ratePerYear * actualWeeklyUsed;

    return {
      country,
      countryName: countryMeta.countryName,
      localName: countryMeta.localName,
      currency: activeCurrency,
      totalServiceYears,
      baseSalaryUsed: safeBasic,
      dailyOrWeeklyBase: actualWeeklyUsed,
      firstPeriodGratuity: finalGratuity,
      secondPeriodGratuity: 0,
      rawTotalGratuity: finalGratuity,
      reductionPercentage: 0,
      finalGratuity,
      isCapped: totalServiceYears > 20 || calculatedWeekly > actualWeeklyUsed,
      notes,
      eligibilityMet: true,
    };
  }

  // ==========================================
  // 4. EUROPEAN UNION (France / Spain)
  // ==========================================
  if (country === 'EU') {
    if (euRegion === 'spain_objective' || euRegion === 'spain_unfair') {
      const dailySalary = safeBasic / 30;
      const daysPerYear = euRegion === 'spain_unfair' ? 33 : 20;
      const maxMonthsCap = euRegion === 'spain_unfair' ? 24 : 12;
      const maxCapAmount = safeBasic * maxMonthsCap;

      const rawTotalGratuity = totalServiceYears * daysPerYear * dailySalary;
      const isCapped = rawTotalGratuity > maxCapAmount;
      const finalGratuity = isCapped ? maxCapAmount : rawTotalGratuity;

      notes.push(`Spain (${euRegion === 'spain_unfair' ? 'Unfair' : 'Objective'} Dismissal): ${daysPerYear} days salary per year of service.`);
      if (isCapped) {
        notes.push(`Capped at maximum ${maxMonthsCap} months' salary (${activeCurrency} ${maxCapAmount.toLocaleString()}).`);
      }

      return {
        country,
        countryName: countryMeta.countryName,
        localName: 'Indemnización por Despido (Spain)',
        currency: activeCurrency,
        totalServiceYears,
        baseSalaryUsed: safeBasic,
        dailyOrWeeklyBase: dailySalary,
        firstPeriodGratuity: rawTotalGratuity,
        secondPeriodGratuity: 0,
        rawTotalGratuity,
        reductionPercentage: 0,
        finalGratuity,
        isCapped,
        maxCapAmount,
        notes,
        eligibilityMet: true,
      };
    }

    // Default France Model: Indemnité Légale de Licenciement
    if (totalServiceYears < 0.67) { // 8 months
      return {
        country,
        countryName: countryMeta.countryName,
        localName: 'Indemnité de Licenciement (France)',
        currency: activeCurrency,
        totalServiceYears,
        baseSalaryUsed: safeBasic,
        dailyOrWeeklyBase: safeBasic / 30,
        firstPeriodGratuity: 0,
        secondPeriodGratuity: 0,
        rawTotalGratuity: 0,
        reductionPercentage: 0,
        finalGratuity: 0,
        isCapped: false,
        notes: ['France: Requires a minimum of 8 months unbroken service for legal dismissal indemnity.'],
        eligibilityMet: false,
        ineligibilityReason: 'Requires at least 8 months of continuous service.',
      };
    }

    const first10Years = Math.min(totalServiceYears, 10);
    const firstPeriodGratuity = first10Years * (1 / 4) * safeBasic;

    const after10Years = Math.max(0, totalServiceYears - 10);
    const secondPeriodGratuity = after10Years * (1 / 3) * safeBasic;

    const finalGratuity = firstPeriodGratuity + secondPeriodGratuity;

    notes.push('France Code du Travail: 1/4 month salary/yr for first 10 yrs + 1/3 month salary/yr thereafter.');

    return {
      country,
      countryName: countryMeta.countryName,
      localName: 'Indemnité de Licenciement (France)',
      currency: activeCurrency,
      totalServiceYears,
      baseSalaryUsed: safeBasic,
      dailyOrWeeklyBase: safeBasic / 30,
      firstPeriodGratuity,
      secondPeriodGratuity,
      rawTotalGratuity: finalGratuity,
      reductionPercentage: 0,
      finalGratuity,
      isCapped: false,
      notes,
      eligibilityMet: true,
    };
  }

  // ==========================================
  // 5. INDIA (Payment of Gratuity Act, 1972)
  // ==========================================
  if (country === 'IN') {
    const statCap = 2000000; // 20 Lakhs statutory cap

    if (totalServiceYears < 4.8) { // 5 years rule (rounded for 4 yrs 240 days)
      return {
        country,
        countryName: countryMeta.countryName,
        localName: countryMeta.localName,
        currency: activeCurrency,
        totalServiceYears,
        baseSalaryUsed: safeBasic,
        dailyOrWeeklyBase: (safeBasic * 15) / 26,
        firstPeriodGratuity: 0,
        secondPeriodGratuity: 0,
        rawTotalGratuity: 0,
        reductionPercentage: 0,
        finalGratuity: 0,
        isCapped: false,
        maxCapAmount: statCap,
        notes: ['India Payment of Gratuity Act: Minimum 5 years of continuous service required for statutory eligibility.'],
        eligibilityMet: false,
        ineligibilityReason: 'Under 5 years of continuous service requirement.',
      };
    }

    // Formula: (15 * Last Drawn Basic * Completed Years) / 26
    const roundedCompletedYears = Math.round(totalServiceYears);
    const calculatedGratuity = (15 * safeBasic * roundedCompletedYears) / 26;

    const isCapped = calculatedGratuity > statCap;
    const finalGratuity = isCapped ? statCap : calculatedGratuity;

    notes.push(`Statutory Formula: (15 × ₹${safeBasic.toLocaleString()} × ${roundedCompletedYears} yrs) / 26.`);
    if (isCapped) {
      notes.push(`Statutory cap applied: Max limit of ₹2,000,000 (20 Lakhs).`);
    }

    return {
      country,
      countryName: countryMeta.countryName,
      localName: countryMeta.localName,
      currency: activeCurrency,
      totalServiceYears,
      baseSalaryUsed: safeBasic,
      dailyOrWeeklyBase: (safeBasic * 15) / 26,
      firstPeriodGratuity: finalGratuity,
      secondPeriodGratuity: 0,
      rawTotalGratuity: calculatedGratuity,
      reductionPercentage: 0,
      finalGratuity,
      isCapped,
      maxCapAmount: statCap,
      notes,
      eligibilityMet: true,
    };
  }

  // ==========================================
  // 6. LATIN AMERICA (Brazil FGTS / Mexico Liquidación)
  // ==========================================
  if (country === 'LATAM') {
    if (latamRegion === 'mexico_liquidacion') {
      const dailySalary = safeBasic / 30;
      const constitutionalSeverance = 3 * safeBasic; // 3 months salary
      const lengthSeverance = totalServiceYears * 20 * dailySalary; // 20 days per year
      const totalLiquidacion = constitutionalSeverance + lengthSeverance;

      notes.push('Mexico Ley Federal del Trabajo: 3 months constitutional severance + 20 days salary per year of service.');

      return {
        country,
        countryName: countryMeta.countryName,
        localName: 'Liquidación por Despido (Mexico)',
        currency: 'MXN',
        totalServiceYears,
        baseSalaryUsed: safeBasic,
        dailyOrWeeklyBase: dailySalary,
        firstPeriodGratuity: constitutionalSeverance,
        secondPeriodGratuity: lengthSeverance,
        rawTotalGratuity: totalLiquidacion,
        reductionPercentage: 0,
        finalGratuity: totalLiquidacion,
        isCapped: false,
        notes,
        eligibilityMet: true,
      };
    }

    // Default Brazil FGTS Model
    const actualWage = safeBasic + safeAllowances;
    const monthlyDeposit = actualWage * 0.08; // 8% monthly FGTS accumulation
    const totalAccumulatedFgts = monthlyDeposit * 12 * totalServiceYears;
    const dismissalPenalty = totalAccumulatedFgts * 0.40; // 40% dismissal fine
    const totalPayout = totalAccumulatedFgts + dismissalPenalty;

    notes.push(`Brazil FGTS: 8% monthly wage accumulation (${activeCurrency} ${totalAccumulatedFgts.toFixed(2)}) + 40% unfair dismissal penalty (${activeCurrency} ${dismissalPenalty.toFixed(2)}).`);

    return {
      country,
      countryName: countryMeta.countryName,
      localName: 'FGTS Reserve + Multa 40% (Brazil)',
      currency: activeCurrency,
      totalServiceYears,
      baseSalaryUsed: actualWage,
      dailyOrWeeklyBase: monthlyDeposit,
      firstPeriodGratuity: totalAccumulatedFgts,
      secondPeriodGratuity: dismissalPenalty,
      rawTotalGratuity: totalPayout,
      reductionPercentage: 0,
      finalGratuity: totalPayout,
      isCapped: false,
      notes,
      eligibilityMet: true,
    };
  }

  // Fallback
  return {
    country: 'UAE',
    countryName: 'United Arab Emirates',
    localName: 'End-of-Service Gratuity',
    currency: 'AED',
    totalServiceYears: 0,
    baseSalaryUsed: safeBasic,
    dailyOrWeeklyBase: 0,
    firstPeriodGratuity: 0,
    secondPeriodGratuity: 0,
    rawTotalGratuity: 0,
    reductionPercentage: 0,
    finalGratuity: 0,
    isCapped: false,
    notes: [],
    eligibilityMet: false,
  };
}

