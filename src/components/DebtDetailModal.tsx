import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Landmark, Plus, Edit2, Archive, TrendingDown, Calendar, Percent, CheckCircle2, DollarSign, Clock, ArrowUpRight } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid } from 'recharts';
import { getAccountEffectiveStartingBalance } from '../lib/trendUtils';

interface DebtDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  debt: any | null;
  transactions: any[];
  onEdit: (debt: any) => void;
  onArchive?: (debt: any) => void;
  onAddTransaction: (debt: any) => void;
  currency: string;
}

export const DebtDetailModal: React.FC<DebtDetailModalProps> = ({
  isOpen,
  onClose,
  debt,
  transactions,
  onEdit,
  onArchive,
  onAddTransaction,
  currency,
}) => {
  const { t } = useTranslation();
  const [chartView, setChartView] = useState<'6m' | '12m'>('6m');

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('debt-detail-modal-toggled', { detail: { isOpen } }));
    if (isOpen) {
      document.body.classList.add('hide-header-footer');
    } else {
      document.body.classList.remove('hide-header-footer');
    }
    return () => {
      window.dispatchEvent(new CustomEvent('debt-detail-modal-toggled', { detail: { isOpen: false } }));
      document.body.classList.remove('hide-header-footer');
    };
  }, [isOpen]);

  const debtId = debt?.accountId || debt?.id || '';

  // Filter payment transactions for this specific debt milestone/account
  const debtTransactions = useMemo(() => {
    if (!debtId || !transactions) return [];
    return transactions.filter(tx => {
      if (tx.status === 'draft') return false;
      const isTransfer = tx.type === 'transfer';
      if (isTransfer) {
        // For transfers, only include the destination leg where the debt account is receiving funds (toAccountId === debtId)
        return tx.toAccountId === debtId;
      }
      const isAccountMatch = tx.accountId === debtId || tx.toAccountId === debtId || tx.debtId === debtId;
      return isAccountMatch;
    }).sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  }, [debtId, transactions]);

  const incomeDebtTransactions = useMemo(() => {
    return debtTransactions.filter(tx => tx.type === 'income' || tx.type === 'Inflow' || tx.type === 'transfer');
  }, [debtTransactions]);

  const expenseDebtTransactions = useMemo(() => {
    return debtTransactions.filter(tx => tx.type !== 'income' && tx.type !== 'Inflow' && tx.type !== 'transfer');
  }, [debtTransactions]);

  // Extract payment target from recurringProtocol or debt props
  const targetMonthlyPayment = useMemo(() => {
    if (!debt) return 0;
    if (debt.paymentAmount && Number(debt.paymentAmount) > 0) {
      return Number(debt.paymentAmount);
    }
    if (debt.recurringProtocol) {
      const match = debt.recurringProtocol.match(/[\d,.]+/);
      if (match) {
        const val = parseFloat(match[0].replace(/,/g, ''));
        if (!isNaN(val)) return val;
      }
    }
    return 0;
  }, [debt]);

  // Generate monthly chart data for the past 6 or 12 months
  const monthlyChartData = useMemo(() => {
    const monthsCount = chartView === '6m' ? 6 : 12;
    const result = [];
    const now = new Date();

    for (let i = monthsCount - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const monthStr = String(d.getMonth() + 1).padStart(2, '0');
      const yearMonthKey = `${year}-${monthStr}`;

      // Sum all payment amounts in this month
      const monthTxList = debtTransactions.filter(tx => {
        if (!tx.date) return false;
        const txDateStr = typeof tx.date === 'string' ? tx.date.substring(0, 7) : '';
        return txDateStr === yearMonthKey;
      });

      const actualPaid = monthTxList.reduce((sum, tx) => sum + Math.abs(tx.amount || 0), 0);
      const isCurrentOrFuture = i === 0;

      // Label format (e.g., "Jan", "Feb")
      const monthLabel = d.toLocaleDateString(undefined, { month: 'short' });

      result.push({
        month: monthLabel,
        fullDateKey: yearMonthKey,
        actualPaid,
        scheduled: targetMonthlyPayment,
        // If actual paid is 0 for past month, we can still show a bar or indicator
        displayAmount: actualPaid > 0 ? actualPaid : (isCurrentOrFuture ? targetMonthlyPayment : 0),
        isCurrent: i === 0,
        txCount: monthTxList.length,
      });
    }

    return result;
  }, [chartView, debtTransactions, targetMonthlyPayment]);

  if (!isOpen || !debt) return null;

  const currentBal = Math.abs(debt.currentBalance || 0);
  const startingBal = getAccountEffectiveStartingBalance(debt, transactions);
  const paidToDate = Math.max(0, startingBal - currentBal);
  const progressPercent = startingBal > 0 ? Math.min(100, Math.round((paidToDate / startingBal) * 100)) : 0;
  const interestRate = debt.interestRate || '0.0';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[250] flex items-center justify-center p-3 sm:p-5 select-none">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ scale: 0.94, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.94, opacity: 0, y: 10 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-2xl bg-white border border-[#E1E8ED] rounded-3xl p-5 sm:p-7 shadow-2xl flex flex-col gap-6 overflow-y-auto max-h-[92vh] z-10"
        >
          {/* Top Header */}
          <div className="flex flex-wrap sm:flex-nowrap items-start sm:items-center justify-between gap-4 pb-2 border-b border-gray-100">
            <div className="flex items-center gap-3.5 min-w-0 flex-1">
              <div className="w-12 h-12 rounded-2xl bg-[#E8F8EE] flex items-center justify-center text-[#366945] shrink-0 shadow-xs">
                <Landmark size={24} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg sm:text-xl font-bold text-[#111C2D] break-words leading-tight" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                    {debt.name}
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#F0F3FF] text-[#366945]">
                    {debt.type || t('debt_section.liability', 'Liability')}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                  <span>{t('debt_section.interest_rate', 'Interest Rate')}: <strong className="text-gray-800">{interestRate}% APR</strong></span>
                  {targetMonthlyPayment > 0 && (
                    <>
                      <span>•</span>
                      <span>{t('debt_section.target_payment', 'Monthly Target')}: <strong className="text-gray-800">{currency} {targetMonthlyPayment.toLocaleString()}</strong></span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
              <button
                onClick={() => {
                  onClose();
                  onEdit(debt);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold transition-all cursor-pointer border-none"
                title={t('common.edit', 'Edit Milestone')}
              >
                <Edit2 size={15} />
                <span>{t('common.edit', 'Edit')}</span>
              </button>

              {onArchive && (
                <button
                  onClick={() => {
                    onClose();
                    onArchive(debt);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold transition-all cursor-pointer border-none"
                  title={t('common.archive', 'Archive')}
                >
                  <Archive size={15} />
                  <span>{debt?.isArchived ? t('common.restore', 'Restore') : t('common.archive', 'Archive')}</span>
                </button>
              )}

              <button
                onClick={onClose}
                className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all cursor-pointer border-none"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Key Metrics Overview Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-2xl bg-rose-50/60 border border-rose-100/80">
              <div className="text-[11px] font-medium text-rose-600 mb-0.5">{t('debt_section.remaining_balance', 'Remaining Balance')}</div>
              <div className="text-base sm:text-lg font-bold text-rose-900 privacy-balance whitespace-nowrap">
                -{currency} {currentBal.toLocaleString()}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-100">
              <div className="text-[11px] font-medium text-gray-500 mb-0.5">{t('debt_section.principal_amount', 'Starting Principal')}</div>
              <div className="text-base sm:text-lg font-bold text-gray-900 privacy-balance whitespace-nowrap">
                {currency} {startingBal.toLocaleString()}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#E8F8EE]/60 border border-[#A6DDB1]/40 col-span-2 sm:col-span-1">
              <div className="text-[11px] font-medium text-[#2d573a] mb-0.5">{t('debt_section.total_paid', 'Total Paid Off')}</div>
              <div className="text-base sm:text-lg font-bold text-[#1e3c28] privacy-balance whitespace-nowrap">
                {currency} {paidToDate.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Payoff Progress Bar */}
          <div className="p-4 rounded-2xl bg-white border border-[#E1E8ED] shadow-2xs">
            <div className="flex justify-between items-center text-xs mb-2">
              <span className="font-bold text-gray-700">{t('debt_section.payoff_progress', 'Payoff Progress')}</span>
              <span className="font-bold text-[#366945]">{progressPercent}% {t('debt_section.completed', 'Completed')}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-[#366945] to-[#519c67] h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Chart Section: Monthly Payments Chart */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-[#E1E8ED] shadow-2xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-[#111C2D]" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                  {t('debt_section.monthly_payments_chart', 'Monthly Payments Chart')}
                </h3>
                <p className="text-[12px] text-gray-500">
                  {t('debt_section.chart_subtitle', 'Monthly debt repayments logged & scheduled over time')}
                </p>
              </div>

              {/* 6M / 12M Period Selector */}
              <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
                <button
                  onClick={() => setChartView('6m')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all border-none cursor-pointer ${
                    chartView === '6m' ? 'bg-white text-[#111C2D] shadow-xs' : 'text-gray-500 hover:text-gray-800 bg-transparent'
                  }`}
                >
                  6M
                </button>
                <button
                  onClick={() => setChartView('12m')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all border-none cursor-pointer ${
                    chartView === '12m' ? 'bg-white text-[#111C2D] shadow-xs' : 'text-gray-500 hover:text-gray-800 bg-transparent'
                  }`}
                >
                  12M
                </button>
              </div>
            </div>

            {/* Recharts Bar Chart */}
            <div className="h-56 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0F3FF" />
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#6B7280', fontSize: 11, fontFamily: 'Google Sans' }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#9CA3AF', fontSize: 10, fontFamily: 'Google Sans' }}
                    tickFormatter={(val) => `${val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}`}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(54, 105, 69, 0.05)' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-[#111C2D] text-white p-3 rounded-xl shadow-xl text-xs space-y-1">
                            <div className="font-bold text-gray-300">{data.fullDateKey}</div>
                            <div className="text-[#A6DDB1] font-bold text-sm">
                              {currency} {data.displayAmount.toLocaleString()}
                            </div>
                            <div className="text-[11px] text-gray-400">
                              {data.actualPaid > 0
                                ? `${data.txCount} ${t('debt_section.payments_logged', 'payment(s) logged')}`
                                : (data.isCurrent ? t('debt_section.scheduled_this_month', 'Scheduled payment') : t('debt_section.no_payments', 'No payments logged'))}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="displayAmount" radius={[6, 6, 0, 0]} maxBarSize={36}>
                    {monthlyChartData.map((entry, idx) => (
                      <Cell
                        key={`cell-${idx}`}
                        fill={entry.actualPaid > 0 ? '#366945' : entry.isCurrent ? '#A6DDB1' : '#E5E7EB'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Legend */}
            <div className="flex items-center justify-center gap-5 mt-3 text-xs text-gray-600 border-t border-gray-100 pt-3">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-[#366945]" />
                <span>{t('debt_section.paid', 'Paid Payments')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-[#A6DDB1]" />
                <span>{t('debt_section.scheduled', 'Current / Target')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-gray-200" />
                <span>{t('debt_section.no_activity', 'No Activity')}</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
