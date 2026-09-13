import React, { useState, useRef, useEffect } from 'react';
import { Landmark, TrendingDown, Plus, Trash2, Edit2, BarChart2 } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { DebtDetailModal } from './DebtDetailModal';
import { triggerHaptic, hapticPresets } from '../lib/haptics';
import { motion, AnimatePresence } from 'motion/react';
import { getAccountEffectiveStartingBalance } from '../lib/trendUtils';

export const DebtSection: React.FC<{ 
  accounts: any[], 
  transactions: any[], 
  onDeleteDebt: (acc: any) => void, 
  onArchiveDebt?: (acc: any) => void,
  onEditDebt?: (acc: any) => void,
  onAddDebtTransaction: (acc: any) => void,
  onAddDebt?: () => void,
  currency: string
}> = ({ accounts, transactions, onDeleteDebt, onArchiveDebt, onEditDebt, onAddDebtTransaction, onAddDebt, currency }) => {
  const { t } = useTranslation();
  const [selectedDebtForDetail, setSelectedDebtForDetail] = useState<any | null>(null);
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

  const debtAccounts = accounts.filter(acc => 
    ['credit', 'loan', 'mortgage', 'Credit Card', 'Personal Loan', 'Mortgage'].includes(acc.type)
  );
  
  const totalDebt = debtAccounts.reduce((sum, acc) => sum + Math.abs(acc.currentBalance || 0), 0);
  const startingTotal = debtAccounts.reduce((sum, acc) => sum + getAccountEffectiveStartingBalance(acc, transactions), 0);
  const paid = Math.max(0, startingTotal - totalDebt);
  const progress = startingTotal > 0 ? (paid / startingTotal) * 100 : 0;

  return (
    <section>
      <h3 className="text-xl font-bold text-[#111C2D] mb-6" style={{ fontFamily: "'Google Sans', sans-serif" }}>
        {t('essentials.debt_management', 'Debt Management')}
      </h3>

      {/* Total Debt Card */}
      <div className="bg-white rounded-2xl border border-[#E1E8ED] p-5 mb-6 shadow-sm">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <div className="text-[12px] text-neutral-400">
              {t('debt_section.total_combined_debt', 'Total combined debt')}
            </div>
            <div className="bg-[#E8F5E9] text-[#2E7D32] px-2 py-0.5 rounded-full text-[12px] font-bold flex items-center gap-0.5">
                <TrendingDown size={10} /> -2.4%
            </div>
          </div>
          <div className="relative" ref={tooltipRef}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                triggerHaptic(hapticPresets.light);
                setShowTooltip(!showTooltip);
              }}
              className="w-5 h-5 rounded-full bg-neutral-200 hover:bg-neutral-300 text-neutral-800 text-xs font-bold flex items-center justify-center transition-colors cursor-pointer shadow-xs"
              title="More details"
            >
              i
            </button>
            <AnimatePresence>
              {showTooltip && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95, y: 4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 4 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="absolute right-0 bottom-full mb-2 w-72 p-3 bg-white rounded-xl shadow-xl border border-neutral-200 text-xs text-neutral-700 z-[999] font-normal leading-relaxed text-left"
                  onClick={(e) => e.stopPropagation()}
                >
                  Below you can see your total debts on loans and credit cards.
                  <div className="absolute right-3 top-full w-2 h-2 bg-white border-r border-b border-neutral-200 transform rotate-45 -mt-1"></div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        <div className="text-3xl font-bold text-[#111C2D] mb-2 privacy-balance" style={{ fontFamily: "'Google Sans', sans-serif" }}>
          {currency} {totalDebt.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </div>
        <div className="text-xs text-[#111C2D] mb-1">
          {t('debt_section.principal_paid_progress', 'Principal Paid Progress')} <span className="font-bold">{progress.toFixed(0)}%</span>
        </div>
        <div className="w-full bg-neutral-100 rounded-full h-1.5 mb-2">
          <div className="bg-[#A6DDB1] h-1.5 rounded-full" style={{ width: `${progress}%` }}></div>
        </div>
        <div className="flex justify-between text-[12px] text-neutral-400">
          <span>{currency} {paid.toLocaleString(undefined, { maximumFractionDigits: 0 })} {t('debt_section.paid', 'paid')}</span>
          <span>{currency} {startingTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} {t('debt_section.total', 'total')}</span>
        </div>
      </div>

      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xs font-bold text-gray-500" style={{ fontFamily: "'Google Sans', sans-serif" }}>
          {t('debt_section.active_liabilities', 'Active liabilities')}
        </h3>
        <button 
          onClick={onAddDebt} 
          className="text-xs text-[#366945] font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#E8F8EE] hover:bg-[#d5f3df] transition-all cursor-pointer border-none shadow-xs"
        >
          <Plus size={16} /> {t('debt_section.add_debt', 'Add Debt')}
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {debtAccounts.length > 0 ? (
          debtAccounts.map((acc, index) => {
            const effStart = getAccountEffectiveStartingBalance(acc, transactions);
            const absCurr = Math.abs(acc.currentBalance || 0);
            const paidToDateVal = Math.max(0, effStart - absCurr);
            const payoffProgress = effStart > 0 && effStart > absCurr ? Math.min(100, Math.max(0, Math.round((paidToDateVal / effStart) * 100))) : 0;
            return (
              <div 
                key={`${acc.accountId || acc.id}-${index}`} 
                onClick={() => {
                  triggerHaptic(hapticPresets.light);
                  setSelectedDebtForDetail(acc);
                }}
                className="p-4 bg-white rounded-2xl border border-[#E1E8ED] hover:border-[#366945]/40 transition-all shadow-sm cursor-pointer group relative"
              >
                {/* Top Row: Liability Name & Action Buttons */}
                <div className="flex justify-between items-center gap-3 mb-3">
                  <div className="text-sm font-bold text-[#111C2D] flex items-center gap-2 flex-wrap min-w-0">
                    <span className="break-words">{acc.name}</span>
                    <span className="text-[10px] font-bold text-[#366945] bg-[#E8F8EE] px-2 py-0.5 rounded-md inline-flex items-center gap-1 opacity-90 group-hover:opacity-100">
                      <BarChart2 size={11} />
                      {t('debt_section.view_chart', 'Payoff Breakdown')}
                    </span>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerHaptic(hapticPresets.medium);
                        onAddDebtTransaction(acc);
                      }} 
                      title={t('debt_section.add_transaction', 'Add Transaction')} 
                      className="p-1.5 rounded-lg text-[#366945] bg-[#E8F8EE] hover:bg-[#d5f3df] transition-all cursor-pointer border-none flex items-center justify-center shrink-0"
                    >
                      <Plus size={19} />
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerHaptic(hapticPresets.heavy);
                        onDeleteDebt(acc);
                      }} 
                      title={t('common.delete', 'Delete')} 
                      className="p-1.5 rounded-lg text-rose-500 bg-rose-50 hover:bg-rose-100 hover:text-rose-700 transition-all cursor-pointer border-none flex items-center justify-center shrink-0"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Middle Row: Icon, Rate & Amounts */}
                <div className="flex justify-between items-center gap-3 mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 bg-[#E8F8EE] rounded-xl flex items-center justify-center shrink-0 text-[#366945] group-hover:scale-105 transition-all">
                      <Landmark size={20} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[12px] text-gray-500">
                        {t('debt_section.rate_label', 'Rate:')} <span className="font-bold text-gray-900">{acc.interestRate || '0.0'}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-[#111C2D] privacy-balance">-{currency} {absCurr.toLocaleString()}</div>
                    <div className="text-[12px] text-gray-400 privacy-balance">{t('debt_section.of_total', 'of total')} {currency} {effStart.toLocaleString()}</div>
                  </div>
                </div>
                
                {/* Progress Bar */}
                <div className="w-full h-1.5 bg-neutral-100 rounded-full overflow-hidden mb-2">
                  <div 
                    className="h-full bg-[#A6DDB1] rounded-full transition-all duration-500" 
                    style={{ width: `${payoffProgress}%` }} 
                  />
                </div>
                
                <div className="flex justify-between items-center text-[12px] font-bold text-[#366945]">
                  <span>{payoffProgress.toFixed(0)}% {t('debt_section.paid', 'paid')}</span>
                  <span className="text-gray-400 font-normal group-hover:text-[#366945] transition-colors text-[11px]">
                    {t('debt_section.tap_for_chart', 'Tap to view payoff breakdown →')}
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-6 text-sm text-neutral-400">
            {t('debt_section.no_liabilities_found', 'No active liabilities found.')}
          </div>
        )}
      </div>

      {/* Debt Detail & Monthly Payments Chart Modal */}
      <DebtDetailModal 
        isOpen={!!selectedDebtForDetail}
        onClose={() => setSelectedDebtForDetail(null)}
        debt={selectedDebtForDetail}
        transactions={transactions}
        onEdit={(debt) => {
          setSelectedDebtForDetail(null);
          onEditDebt?.(debt);
        }}
        onArchive={(debt) => {
          setSelectedDebtForDetail(null);
          onArchiveDebt?.(debt);
        }}
        onAddTransaction={(debt) => {
          setSelectedDebtForDetail(null);
          onAddDebtTransaction(debt);
        }}
        currency={currency}
      />
    </section>
  );
};
