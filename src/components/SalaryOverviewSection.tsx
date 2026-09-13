import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n';
import { Calendar, Edit2 } from 'lucide-react';
import { triggerHaptic, hapticPresets } from '../lib/haptics';

interface SalaryOverviewSectionProps {
  salary: number;
  currency: string;
  onOpenBreakdown: () => void;
  onEditPayroll?: () => void;
}

export const SalaryOverviewSection: React.FC<SalaryOverviewSectionProps> = ({
  salary,
  currency,
  onOpenBreakdown,
  onEditPayroll,
}) => {
  const { t } = useTranslation();
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        setShowTooltip(false);
      }
    };
    if (showTooltip) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showTooltip]);

  return (
    <div className="w-full" style={{ fontFamily: "'Google Sans', sans-serif" }}>
      {/* Salary Overview Card */}
      <div 
        className="w-full p-5 bg-white rounded-2xl border border-[#E1E8ED] shadow-sm flex items-center justify-between cursor-pointer hover:border-neutral-300 transition-all relative"
        onClick={() => {
          triggerHaptic(hapticPresets.medium);
          onOpenBreakdown();
        }}
      >
        <div className="flex items-center">
          <div>
            <h3 className="text-sm font-bold text-[#111C2D]">
              {t('salary_overview.title', 'Income Breakdown')}
            </h3>
            <p className="text-xs text-neutral-500 font-normal">
              {t('salary_overview.subtitle', 'Click to manage your allocation')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-sm font-bold text-[#111C2D] privacy-balance whitespace-nowrap">
              {salary.toLocaleString()}{currency}
            </div>
            <div className="text-xs text-neutral-400 mt-0.5 flex items-center justify-end gap-1 font-normal">
              <Calendar size={11} />
              {t('salary_overview.view_breakdown', 'View breakdown')}
            </div>
          </div>
          <div className="flex flex-col items-center gap-1.5" ref={tooltipRef}>
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  triggerHaptic(hapticPresets.light);
                  setShowTooltip(!showTooltip);
                }}
                className="w-6 h-6 rounded-full bg-neutral-200 hover:bg-neutral-300 text-neutral-800 text-sm font-bold flex items-center justify-center transition-colors cursor-pointer shadow-xs"
                title="More details"
              >
                i
              </button>
              {showTooltip && (
                <div 
                  className="absolute right-0 bottom-full mb-2 w-64 p-3 bg-white rounded-xl shadow-lg border border-neutral-200 text-xs text-neutral-700 z-50 font-normal leading-relaxed text-left"
                  onClick={(e) => e.stopPropagation()}
                >
                  {t('salary_overview.configure_allowances_tip', 'Here you can configure your monthly allowances and budgets based on your income')}
                  <div className="absolute right-3 top-full w-2 h-2 bg-white border-r border-b border-neutral-200 transform rotate-45 -mt-1"></div>
                </div>
              )}
            </div>
            {onEditPayroll && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  triggerHaptic(hapticPresets.medium);
                  onEditPayroll();
                }}
                className="p-2 rounded-xl text-neutral-400 hover:text-[#366945] hover:bg-[#F0FDF4] transition-all cursor-pointer border border-transparent hover:border-[#A6DDB1]/40 flex items-center justify-center shrink-0"
                title={t('salary_overview.edit_payroll', 'Edit your monthly salary')}
              >
                <Edit2 size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
