import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Landmark, TrendingUp, ShieldCheck } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

interface Account {
  id: string;
  name: string;
  type: string;
  currency: string;
  bankAccountType?: string;
  isArchived?: boolean;
  currentBalance?: number;
  startingBalance?: number;
  totalGainLoss?: number;
  platformFees?: number;
}

interface InvestmentBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: Account[];
  accountBalances: { [key: string]: number };
  primaryCurrency: string;
  exchangeRates: any;
  defaultRates: { [key: string]: number };
}

export const InvestmentBreakdownModal: React.FC<InvestmentBreakdownModalProps> = ({
  isOpen,
  onClose,
  accounts,
  accountBalances,
  primaryCurrency,
  exchangeRates,
  defaultRates,
}) => {
  const { t } = useTranslation();

  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.body.classList.add('hide-header-footer');
      window.dispatchEvent(new CustomEvent('investment-breakdown-modal-toggled', { detail: { isOpen: true } }));
    } else {
      document.body.style.overflow = 'auto';
      document.body.classList.remove('hide-header-footer');
      window.dispatchEvent(new CustomEvent('investment-breakdown-modal-toggled', { detail: { isOpen: false } }));
    }
    return () => {
      document.body.style.overflow = 'auto';
      document.body.classList.remove('hide-header-footer');
      window.dispatchEvent(new CustomEvent('investment-breakdown-modal-toggled', { detail: { isOpen: false } }));
    };
  }, [isOpen]);

  const getRateToAED = (curr: string) => {
    const c = curr || 'AED';
    if (c === 'AED') return 1;
    return (exchangeRates && exchangeRates[c]) || (defaultRates as any)[c] || 1;
  };

  const baseRateToAED = getRateToAED(primaryCurrency);

  const allNonArchived = accounts.filter(acc => !acc.isArchived);
  const investmentAccounts = allNonArchived.filter(
    acc => (acc.type || '').toLowerCase() === 'investment'
  );

  const investmentList = investmentAccounts.map(acc => {
    const bal = accountBalances[acc.id] !== undefined ? accountBalances[acc.id] : Number(acc.currentBalance || acc.startingBalance || 0);
    const rate = getRateToAED(acc.currency);
    const balInAED = bal * rate;
    const balInPrimary = balInAED / baseRateToAED;
    return {
      ...acc,
      originalBalance: bal,
      balanceInPrimary: balInPrimary,
    };
  });

  const totalInvestment = investmentList.reduce((sum, item) => sum + item.balanceInPrimary, 0);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/10 backdrop-blur-md"
          />

          <div className="relative w-full max-w-[500px] flex items-center justify-center z-10">
            <div 
              style={{
                position: 'absolute',
                width: '320px',
                height: '320px',
                borderRadius: '50%',
                background: '#A6DDB1',
                filter: 'blur(90px)',
                opacity: 0.22,
                zIndex: -1,
                pointerEvents: 'none'
              }}
            />

            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              style={{ 
                background: '#FFFFFF',
                borderRadius: '20px',
                border: '1px solid rgba(30, 34, 41, 0.08)',
                padding: '1.25rem',
                fontFamily: "'Google Sans', sans-serif",
                color: '#1E2229'
              }}
              className="relative w-[calc(100%-2rem)] sm:w-full border rounded-[20px] flex flex-col gap-5 shadow-2xl overflow-hidden max-h-[85vh] z-10"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-neutral-100 pb-3 shrink-0">
                <div className="flex flex-col">
                  <h3 
                    style={{ 
                      fontWeight: 500,
                      fontSize: 'clamp(1rem, 2.4vw, 1.25rem)',
                      fontFamily: "'Google Sans', sans-serif",
                      color: '#1E2229'
                    }}
                    className="tracking-tight"
                  >
                    {t('investment_breakdown.title', 'Investment Assets Breakdown')}
                  </h3>
                  <p 
                    style={{ fontWeight: 400, fontFamily: "'Google Sans', sans-serif" }}
                    className="text-neutral-500 text-[11px]"
                  >
                    {t('investment_breakdown.subtitle', 'Portfolios, equities, and wealth investment assets')}
                  </p>
                </div>
                <button 
                  onClick={onClose}
                  className="w-8 h-8 rounded-full border border-neutral-100/50 bg-white/50 backdrop-blur-xs flex items-center justify-center hover:bg-white text-neutral-400 hover:text-neutral-600 transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Summary Card */}
              <div className="p-4 rounded-xl bg-white/40 border border-neutral-100/50 flex flex-col gap-3 shrink-0">
                <div className="flex justify-between items-center">
                  <span style={{ fontWeight: 400, fontFamily: "'Google Sans', sans-serif" }} className="text-neutral-500 text-[11px]">{t('investment_breakdown.summary', 'Portfolio Summary')}</span>
                  <span style={{ fontWeight: 500, fontFamily: "'Google Sans', sans-serif" }} className="text-emerald-600 text-[10px] bg-emerald-50/50 px-2 py-0.5 rounded-full">
                    {t('investment_breakdown.investments', 'Investment Assets')}
                  </span>
                </div>
                
                <div className="flex items-center justify-between flex-nowrap w-full">
                  <span style={{ fontWeight: 400, fontFamily: "'Google Sans', sans-serif", color: '#1E2229' }} className="text-[11px]">{t('investment_breakdown.total_investments', 'Total Investment Assets ({{currency}})', { currency: primaryCurrency })}</span>
                  <span 
                    style={{ 
                      fontWeight: 600, 
                      fontSize: 'clamp(1.15rem, 2.8vw, 1.45rem)',
                      fontFamily: "'Google Sans', sans-serif",
                      whiteSpace: 'nowrap'
                    }} 
                    className="tracking-tight tabular-nums text-neutral-800"
                  >
                    {totalInvestment < 0 ? '-' : ''}{Math.abs(totalInvestment).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Account Lists */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 px-0.5">
                    <TrendingUp size={14} className="text-[#10B981]" />
                    <span 
                      style={{ 
                        fontWeight: 500, 
                        fontSize: 'clamp(1rem, 2.4vw, 1.25rem)',
                        fontFamily: "'Google Sans', sans-serif",
                        color: '#1E2229'
                      }}
                    >
                      {t('investment_breakdown.portfolios', 'Portfolios')}
                    </span>
                    <span className="text-[10px] text-neutral-400 font-normal">({investmentList.length})</span>
                  </div>

                  <div className="space-y-2.5">
                    {investmentList.length === 0 ? (
                      <div className="text-neutral-400 text-[11px] font-normal py-4 text-center border border-dashed border-neutral-100/50 rounded-xl">
                        {t('investment_breakdown.no_accounts', 'No active investment portfolios found.')}
                      </div>
                    ) : (
                      investmentList.map(acc => (
                        <div 
                          key={`investment-item-${acc.id}`}
                          style={{ 
                            fontFamily: "'Google Sans', sans-serif",
                            color: '#1E2229',
                            background: 'rgba(255, 255, 255, 0.55)',
                            backdropFilter: 'blur(22px)',
                            WebkitBackdropFilter: 'blur(22px)',
                            borderRadius: '16px',
                            border: '1px solid rgba(30, 34, 41, 0.08)',
                            boxShadow: '0 8px 32px 0 rgba(166, 221, 177, 0.12)'
                          }}
                          className="p-3.5 flex flex-col gap-2.5 w-full min-w-0"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-100/50 flex items-center justify-center text-emerald-600 shrink-0">
                                <Landmark size={14} />
                              </div>
                              <div className="flex flex-col min-w-0 flex-1">
                                <span 
                                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 500, fontSize: '0.95rem', color: '#1E2229' }} 
                                  className="truncate leading-tight"
                                >
                                  {acc.name}
                                </span>
                                <span 
                                  style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400, fontSize: '0.8rem', color: '#57606F' }} 
                                  className="truncate leading-none mt-1"
                                >
                                  {t('investment_breakdown.investment_portfolio', 'Investment Portfolio')} • {acc.currency}
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-col items-end shrink-0">
                              <span 
                                style={{ fontWeight: 600, fontSize: '1.1rem', fontFamily: "'Google Sans', sans-serif", color: '#1E2229' }} 
                                className="tabular-nums leading-none"
                              >
                                {acc.balanceInPrimary.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                <span style={{ fontWeight: 400, fontSize: '0.8rem', color: '#57606F' }} className="ml-1">
                                  {primaryCurrency}
                                </span>
                              </span>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div style={{ fontWeight: 400, fontFamily: "'Google Sans', sans-serif" }} className="text-[10px] text-neutral-400 text-center border-t border-neutral-200/55 pt-2 leading-tight shrink-0">
                {t('investment_breakdown.footer', 'Reflects all active investment portfolios and associated equity holdings.')}
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};
