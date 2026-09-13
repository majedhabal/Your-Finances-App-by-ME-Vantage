import React, { useState, useMemo } from 'react';
import { Award, Globe, ChevronDown, ChevronUp, Info, AlertTriangle, ShieldCheck } from 'lucide-react';
import {
  calculateGratuity,
  CountryCode,
  ContractType,
  TerminationType,
  COUNTRY_GRATUITY_LIST,
} from '../lib/gratuityEngine';

interface GratuityCalculatorProps {
  primaryCurrency?: string;
  defaultBasicSalary?: number;
}

export const GratuityCalculator: React.FC<GratuityCalculatorProps> = ({
  primaryCurrency = 'AED',
  defaultBasicSalary = 12000,
}) => {
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>('UAE');
  const [basicSalary, setBasicSalary] = useState<number>(defaultBasicSalary);
  const [fixedAllowances, setFixedAllowances] = useState<number>(3000);
  const [weeklyPayCap, setWeeklyPayCap] = useState<number>(700);
  const [employeeAge, setEmployeeAge] = useState<number>(38);
  const [euRegion, setEuRegion] = useState<'france' | 'spain_objective' | 'spain_unfair'>('france');
  const [latamRegion, setLatamRegion] = useState<'brazil_fgts' | 'mexico_liquidacion'>('brazil_fgts');

  const [years, setYears] = useState<number>(3);
  const [months, setMonths] = useState<number>(6);
  const [days, setDays] = useState<number>(0);
  const [contractType, setContractType] = useState<ContractType>('limited');
  const [terminationType, setTerminationType] = useState<TerminationType>('resignation');
  const [showDetails, setShowDetails] = useState<boolean>(false);

  const countryMeta = useMemo(() => {
    return COUNTRY_GRATUITY_LIST.find((c) => c.code === selectedCountry) || COUNTRY_GRATUITY_LIST[0];
  }, [selectedCountry]);

  // Derive default currency based on selected country
  const activeCurrency = countryMeta.defaultCurrency;

  const breakdown = useMemo(() => {
    return calculateGratuity({
      country: selectedCountry,
      basicSalary,
      fixedAllowances,
      weeklyPayCap,
      employeeAge,
      euRegion,
      latamRegion,
      years,
      months,
      days,
      contractType,
      terminationType,
      currency: activeCurrency,
    });
  }, [
    selectedCountry,
    basicSalary,
    fixedAllowances,
    weeklyPayCap,
    employeeAge,
    euRegion,
    latamRegion,
    years,
    months,
    days,
    contractType,
    terminationType,
    activeCurrency,
  ]);

  const formattedValue = (val: number, curr: string = activeCurrency) => {
    return `${curr} ${val.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  return (
    <div
      id="analytics-gratuity-engine-card"
      className="bg-white border border-[#E1E8ED] rounded-2xl p-5 shadow-xs transition-all mb-4"
      style={{ fontFamily: "'Google Sans', sans-serif" }}
    >
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5 w-full min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#F0FDF4] border border-[#DCFCE7] flex items-center justify-center text-[#366945] shrink-0">
            <Award size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-[#111C2D] leading-tight flex flex-wrap items-center gap-2">
              <span>Gratuity Engine</span>
              <span className="text-[10.5px] font-bold text-[#366945] bg-[#F0FDF4] px-2 py-0.5 rounded-md border border-[#DCFCE7]">
                {countryMeta.localName}
              </span>
            </h3>
            <p className="text-[12px] font-normal text-neutral-500 truncate">
              International End of Service & Severance Payout Calculator
            </p>
          </div>
        </div>

        {/* Country Selector */}
        <div className="flex items-center gap-1.5 w-full bg-neutral-50 border border-[#E1E8ED] rounded-xl px-3 py-2">
          <Globe size={14} className="text-[#366945] shrink-0" />
          <select
            value={selectedCountry}
            onChange={(e) => setSelectedCountry(e.target.value as CountryCode)}
            className="text-xs font-bold text-neutral-800 bg-transparent focus:outline-none cursor-pointer w-full"
          >
            {COUNTRY_GRATUITY_LIST.map((c) => (
              <option key={c.code} value={c.code}>
                {c.countryName} ({c.defaultCurrency})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Country Formula Summary Banner */}
      <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3 mb-4 text-xs space-y-1">
        <div className="flex items-start gap-2 text-neutral-700">
          <Info size={14} className="text-[#366945] shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-neutral-900">{countryMeta.accrualBase}</span>
          </div>
        </div>
        <p className="text-[11px] font-normal text-neutral-500 pl-5">
          <strong className="text-neutral-700">Key Modifiers:</strong> {countryMeta.keyModifiers}
        </p>
      </div>

      {/* Main Form Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {/* Basic Salary Input */}
        <div>
          <label className="block text-[12px] font-normal text-neutral-600 mb-1">
            {selectedCountry === 'KSA' || selectedCountry === 'LATAM' ? 'Basic Monthly Salary' : 'Monthly Basic Salary'} ({activeCurrency})
          </label>
          <input
            type="number"
            value={basicSalary || ''}
            onChange={(e) => setBasicSalary(Math.max(0, Number(e.target.value)))}
            placeholder="e.g. 12000"
            className="w-full px-3 py-2 text-sm font-bold text-neutral-900 bg-neutral-50 border border-[#E1E8ED] rounded-xl focus:outline-none focus:border-[#A6DDB1] transition-colors"
          />
        </div>

        {/* Optional Allowances for KSA / LATAM */}
        {(selectedCountry === 'KSA' || selectedCountry === 'LATAM') && (
          <div>
            <label className="block text-[12px] font-normal text-neutral-600 mb-1">
              Fixed Allowances (Housing/Transport) ({activeCurrency})
            </label>
            <input
              type="number"
              value={fixedAllowances || ''}
              onChange={(e) => setFixedAllowances(Math.max(0, Number(e.target.value)))}
              placeholder="e.g. 3000"
              className="w-full px-3 py-2 text-sm font-bold text-neutral-900 bg-neutral-50 border border-[#E1E8ED] rounded-xl focus:outline-none focus:border-[#A6DDB1] transition-colors"
            />
          </div>
        )}

        {/* UK Specific Inputs */}
        {selectedCountry === 'UK' && (
          <>
            <div>
              <label className="block text-[12px] font-normal text-neutral-600 mb-1">
                Employee Age (Years)
              </label>
              <input
                type="number"
                min="16"
                max="80"
                value={employeeAge}
                onChange={(e) => setEmployeeAge(Math.max(16, Number(e.target.value)))}
                className="w-full px-3 py-2 text-sm font-bold text-neutral-900 bg-neutral-50 border border-[#E1E8ED] rounded-xl focus:outline-none focus:border-[#A6DDB1]"
              />
            </div>
            <div>
              <label className="block text-[12px] font-normal text-neutral-600 mb-1">
                Statutory Weekly Pay Cap (£)
              </label>
              <input
                type="number"
                value={weeklyPayCap}
                onChange={(e) => setWeeklyPayCap(Math.max(0, Number(e.target.value)))}
                className="w-full px-3 py-2 text-sm font-bold text-neutral-900 bg-neutral-50 border border-[#E1E8ED] rounded-xl focus:outline-none focus:border-[#A6DDB1]"
              />
            </div>
          </>
        )}

        {/* EU Sub-Region Variant */}
        {selectedCountry === 'EU' && (
          <div>
            <label className="block text-[12px] font-normal text-neutral-600 mb-1">
              Jurisdiction & Dismissal Type
            </label>
            <select
              value={euRegion}
              onChange={(e) => setEuRegion(e.target.value as any)}
              className="w-full px-3 py-2 text-xs font-normal text-neutral-800 bg-neutral-50 border border-[#E1E8ED] rounded-xl focus:outline-none focus:border-[#A6DDB1]"
            >
              <option value="france">France: Indemnité Légale de Licenciement</option>
              <option value="spain_objective">Spain: Despido Objetivo (20 days/yr, max 12 mos)</option>
              <option value="spain_unfair">Spain: Despido Improcedente (33 days/yr, max 24 mos)</option>
            </select>
          </div>
        )}

        {/* LATAM Sub-Region Variant */}
        {selectedCountry === 'LATAM' && (
          <div>
            <label className="block text-[12px] font-normal text-neutral-600 mb-1">
              Labor System Model
            </label>
            <select
              value={latamRegion}
              onChange={(e) => setLatamRegion(e.target.value as any)}
              className="w-full px-3 py-2 text-xs font-normal text-neutral-800 bg-neutral-50 border border-[#E1E8ED] rounded-xl focus:outline-none focus:border-[#A6DDB1]"
            >
              <option value="brazil_fgts">Brazil: FGTS Monthly Reserve (8%) + Multa 40%</option>
              <option value="mexico_liquidacion">Mexico: Liquidación (3 Mos + 20 Days/Yr)</option>
            </select>
          </div>
        )}

        {/* Service Duration Inputs */}
        <div>
          <label className="block text-[12px] font-normal text-neutral-600 mb-1">
            Continuous Service Duration
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center bg-neutral-50 border border-[#E1E8ED] rounded-xl px-2.5 py-1.5">
              <input
                type="number"
                min="0"
                max="50"
                value={years}
                onChange={(e) => setYears(Math.max(0, Number(e.target.value)))}
                className="w-full text-sm font-bold text-neutral-900 bg-transparent focus:outline-none"
              />
              <span className="text-[11px] text-neutral-500 font-normal ml-1">yrs</span>
            </div>
            <div className="flex-1 flex items-center bg-neutral-50 border border-[#E1E8ED] rounded-xl px-2.5 py-1.5">
              <input
                type="number"
                min="0"
                max="11"
                value={months}
                onChange={(e) => setMonths(Math.max(0, Math.min(11, Number(e.target.value))))}
                className="w-full text-sm font-bold text-neutral-900 bg-transparent focus:outline-none"
              />
              <span className="text-[11px] text-neutral-500 font-normal ml-1">mths</span>
            </div>
          </div>
        </div>

        {/* Separation Type */}
        {(selectedCountry === 'UAE' || selectedCountry === 'KSA') && (
          <div>
            <label className="block text-[12px] font-normal text-neutral-600 mb-1">
              Separation / Exit Reason
            </label>
            <select
              value={terminationType}
              onChange={(e) => setTerminationType(e.target.value as TerminationType)}
              className="w-full px-3 py-2 text-xs font-normal text-neutral-800 bg-neutral-50 border border-[#E1E8ED] rounded-xl focus:outline-none focus:border-[#A6DDB1]"
            >
              <option value="resignation">Resignation by Employee</option>
              <option value="termination">Employer Termination</option>
            </select>
          </div>
        )}

        {/* Contract Type (for UAE legacy/unlimited selection) */}
        {selectedCountry === 'UAE' && (
          <div>
            <label className="block text-[12px] font-normal text-neutral-600 mb-1">
              Contract Framework
            </label>
            <select
              value={contractType}
              onChange={(e) => setContractType(e.target.value as ContractType)}
              className="w-full px-3 py-2 text-xs font-normal text-neutral-800 bg-neutral-50 border border-[#E1E8ED] rounded-xl focus:outline-none focus:border-[#A6DDB1]"
            >
              <option value="limited">Standard Fixed-Term (Decree-Law 33)</option>
              <option value="unlimited">Legacy Unlimited Contract</option>
            </select>
          </div>
        )}
      </div>

      {/* Primary Result Banner */}
      <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3.5 mb-3 flex items-center justify-between">
        <div>
          <span className="text-[11px] font-normal text-neutral-500 block mb-0.5">
            Estimated Total Payout ({countryMeta.localName})
          </span>
          <span className="text-xl font-bold text-[#366945] tracking-tight block">
            {formattedValue(breakdown.finalGratuity, breakdown.currency)}
          </span>
        </div>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-1 text-xs font-bold text-[#366945] hover:underline cursor-pointer"
        >
          <span>{showDetails ? 'Hide Calculation' : 'View Formula Breakdown'}</span>
          {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Ineligibility Warning if applicable */}
      {!breakdown.eligibilityMet && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 text-xs flex items-start gap-2 text-amber-800">
          <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-600" />
          <div>
            <span className="font-bold block">Statutory Eligibility Notice:</span>
            <span>{breakdown.ineligibilityReason}</span>
          </div>
        </div>
      )}

      {/* Detailed Calculation Accordion */}
      {showDetails && (
        <div className="mt-3 pt-3 border-t border-[#F1F5F9] text-xs space-y-2 text-neutral-700 font-normal">
          <div className="flex justify-between items-center py-1 border-b border-neutral-100">
            <span className="text-neutral-500">Calculated Service Duration</span>
            <span className="font-bold text-neutral-800">{breakdown.totalServiceYears.toFixed(2)} Years</span>
          </div>

          <div className="flex justify-between items-center py-1 border-b border-neutral-100">
            <span className="text-neutral-500">Wage Base Used</span>
            <span className="font-bold text-neutral-800">{formattedValue(breakdown.baseSalaryUsed, breakdown.currency)}</span>
          </div>

          <div className="flex justify-between items-center py-1 border-b border-neutral-100">
            <span className="text-neutral-500">First Tier / Primary Payout Component</span>
            <span className="font-bold text-neutral-800">{formattedValue(breakdown.firstPeriodGratuity, breakdown.currency)}</span>
          </div>

          {breakdown.secondPeriodGratuity > 0 && (
            <div className="flex justify-between items-center py-1 border-b border-neutral-100">
              <span className="text-neutral-500">Second Tier / Additional Payout Component</span>
              <span className="font-bold text-neutral-800">{formattedValue(breakdown.secondPeriodGratuity, breakdown.currency)}</span>
            </div>
          )}

          {breakdown.reductionPercentage > 0 && (
            <div className="flex justify-between items-center py-1 border-b border-neutral-100 text-amber-700">
              <span>Resignation Reduction Factor</span>
              <span className="font-bold">-{breakdown.reductionPercentage.toFixed(1)}%</span>
            </div>
          )}

          {breakdown.isCapped && breakdown.maxCapAmount && (
            <div className="flex justify-between items-center py-1 border-b border-neutral-100 text-rose-600">
              <span>Statutory Maximum Cap Applied</span>
              <span className="font-bold">{formattedValue(breakdown.maxCapAmount, breakdown.currency)}</span>
            </div>
          )}

          {/* Notes list */}
          {breakdown.notes.length > 0 && (
            <div className="pt-2">
              <span className="font-bold text-neutral-800 block mb-1">Calculation Notes & Statutory References:</span>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-neutral-600">
                {breakdown.notes.map((note, idx) => (
                  <li key={idx}>{note}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Informational Disclaimer */}
      <div className="mt-3 pt-3 border-t border-[#F1F5F9] text-[11px] font-normal text-neutral-500 leading-relaxed">
        Estimated statutory calculation based on standard labor code parameters for informational planning. Final settlements are subject to employer payroll audits and local legal counsel interpretation.
      </div>
    </div>
  );
};

