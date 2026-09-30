import { APP_VERSION } from "../lib/constants";
import React, { useEffect } from 'react';
import { useTranslation } from '@/lib/i18n';
import { motion, AnimatePresence } from 'motion/react';
import { Tab } from '../App';
import { VantageLogo } from './VantageLogo';
import { triggerHaptic, hapticPresets } from '../lib/haptics';
import { Settings as SettingsIcon, WifiOff, Home, Landmark, Activity, TrendingUp, BrainCircuit, Plus, Camera, Coffee, Sparkles, ChevronDown, ShoppingCart, UserPlus, Mic } from 'lucide-react';
import { TokenShopModal } from './TokenShopModal';
import { getEffectiveAiTokens } from '../lib/tokenConsumption';
import { Settings } from './Settings';
import { NotificationDispatchHub } from './NotificationDispatchHub';
import { StreakTracker } from './StreakTracker';
import { ReceiptScannerModal } from './ReceiptScannerModal';
import { MorningEspressoModal } from './MorningEspressoModal';
import { ShouldIBuyThisModal } from './ShouldIBuyThisModal';
import { ShareAccountModal } from './ShareAccountModal';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  isLocked?: boolean;
  isPremium?: boolean;
  isAIModalOpen?: boolean;
  setIsAIModalOpen?: (open: boolean) => void;
  isTxModalOpen?: boolean;
  setIsTxModalOpen?: (open: boolean) => void;
  txMode?: 'expense' | 'income' | 'transfer';
  setTxMode?: (mode: 'expense' | 'income' | 'transfer') => void;
  profile?: any;
  accounts?: any[];
  transactions?: any[];
  accountBalances?: Record<string, number>;
  streakUpdated?: boolean;
  userLogins?: any[];
  receiptScanCount?: number;
  onUpdateProfile?: (profile: any) => void;
  activeWorkspaceUid?: string;
  setActiveWorkspaceUid?: (uid: string) => void;
}

const getBaseMaxTokens = (tier: string) => {
  const t = (tier || '').toLowerCase().replace(' ', '');
  if (t.includes('tier3') || t.includes('elite')) return 250000;
  if (t.includes('tier2') || t.includes('pro')) return 120000;
  return 1000;
};

export const Layout: React.FC<LayoutProps> = ({ 
  children, activeTab, setActiveTab, isLocked = false, isAIModalOpen, setIsAIModalOpen, isTxModalOpen, setIsTxModalOpen, txMode, setTxMode, profile, accounts, transactions, accountBalances, streakUpdated, userLogins, receiptScanCount = 0, onUpdateProfile, activeWorkspaceUid, setActiveWorkspaceUid
}) => {
  const { t } = useTranslation();
  const [isOffline, setIsOffline] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return !navigator.onLine;
  });

  const [isFabMenuOpen, setIsFabMenuOpen] = React.useState(false);
  const navItems = [
    { id: 'essentials' as Tab, label: t('layout.essentials', 'Essentials'), icon: Home },
    { id: 'accounts' as Tab, label: t('layout.accounts', 'Accounts'), icon: Landmark },
    { id: 'ai' as Tab, label: t('layout.vantage_ai', 'Vantage AI'), icon: BrainCircuit },
    { id: 'activity' as Tab, label: t('activity.title'), icon: Activity },
    { id: 'analytics' as Tab, label: t('analytics.title'), icon: TrendingUp },
  ];

  const [isSalaryModalOpen, setIsSalaryModalOpen] = React.useState(false);
  const [isEditPayrollModalOpen, setIsEditPayrollModalOpen] = React.useState(false);
  const [isTxDetailModalOpen, setIsTxDetailModalOpen] = React.useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = React.useState(false);
  const [isAccountDetailModalOpen, setIsAccountDetailModalOpen] = React.useState(false);
  const [isBreakdownModalOpen, setIsBreakdownModalOpen] = React.useState(false);
  const [isDebtModalOpen, setIsDebtModalOpen] = React.useState(false);
  const [isMilestoneModalOpen, setIsMilestoneModalOpen] = React.useState(false);
  const [isDebtMilestoneModalOpen, setIsDebtMilestoneModalOpen] = React.useState(false);
  const [isDebtDetailModalOpen, setIsDebtDetailModalOpen] = React.useState(false);
  const [isGoalDetailModalOpen, setIsGoalDetailModalOpen] = React.useState(false);
  const [isGoalTxModalOpen, setIsGoalTxModalOpen] = React.useState(false);
  const [isDebtTxModalOpen, setIsDebtTxModalOpen] = React.useState(false);
  const [isPremiumModalOpen, setIsPremiumModalOpen] = React.useState(false);
  const [isDispatchHubOpen, setIsDispatchHubOpen] = React.useState(false);
  const [isReceiptScannerOpen, setIsReceiptScannerOpen] = React.useState(false);
  const [isStatementVaultOpen, setIsStatementVaultOpen] = React.useState(false);
  const [isBudgetDetailOpen, setIsBudgetDetailOpen] = React.useState(false);
  const [isSettingsSubViewOpen, setIsSettingsSubViewOpen] = React.useState(false);
  const [isBudgetTxModalOpen, setIsBudgetTxModalOpen] = React.useState(false);
  const [isWeekendWrapUpOpen, setIsWeekendWrapUpOpen] = React.useState(false);
  const [isAnnualWrappedOpen, setIsAnnualWrappedOpen] = React.useState(false);
  const [isEspressoModalOpen, setIsEspressoModalOpen] = React.useState(false);
  const [isShouldIBuyThisOpen, setIsShouldIBuyThisOpen] = React.useState(false);
  const [isBandwidthBannerExpanded, setIsBandwidthBannerExpanded] = React.useState(true);
  const [isTokenShopOpen, setIsTokenShopOpen] = React.useState(false);
  const [isShareAccountOpen, setIsShareAccountOpen] = React.useState(false);
  const [isNetWorthBreakdownOpen, setIsNetWorthBreakdownOpen] = React.useState(false);
  const [isCashBreakdownOpen, setIsCashBreakdownOpen] = React.useState(false);
  const [isInvestmentBreakdownOpen, setIsInvestmentBreakdownOpen] = React.useState(false);
  const [isDebtBreakdownOpen, setIsDebtBreakdownOpen] = React.useState(false);
  const [isBudgetConfigOpen, setIsBudgetConfigOpen] = React.useState(false);
  const [isEmotionalTriggerModalOpen, setIsEmotionalTriggerModalOpen] = React.useState(false);
  const [isSmsModalOpen, setIsSmsModalOpen] = React.useState(false);
  const [hasDomModalOpen, setHasDomModalOpen] = React.useState(false);

  useEffect(() => {
    const parseIsOpen = (e: any) => {
      if (!e) return false;
      if (typeof e.detail === 'boolean') return e.detail;
      if (e.detail && typeof e.detail.isOpen === 'boolean') return e.detail.isOpen;
      if (e.detail && e.detail.isOpen !== undefined) return Boolean(e.detail.isOpen);
      if (e.detail && typeof e.detail === 'object' && Object.keys(e.detail).length > 0) return true;
      return true;
    };

    const handleOpenShouldIBuyThis = () => {
      setIsShouldIBuyThisOpen(true);
    };
    const handleOpenSalaryBreakdown = () => {
      setIsSalaryModalOpen(true);
      setIsBreakdownModalOpen(true);
    };
    const handleSalaryModal = (e: any) => {
      setIsSalaryModalOpen(parseIsOpen(e));
    };
    const handleEditPayrollModal = (e: any) => {
      setIsEditPayrollModalOpen(parseIsOpen(e));
    };
    const handleTxDetailModal = (e: any) => {
      setIsTxDetailModalOpen(parseIsOpen(e));
    };
    const handleAccountModal = (e: any) => {
      setIsAccountModalOpen(parseIsOpen(e));
    };
    const handleAccountDetailModal = (e: any) => {
      setIsAccountDetailModalOpen(parseIsOpen(e));
    };
    const handleBreakdownModal = (e: any) => {
      setIsBreakdownModalOpen(parseIsOpen(e));
    };
    const handleDebtModal = (e: any) => {
      setIsDebtModalOpen(parseIsOpen(e));
    };
    const handleMilestoneModal = (e: any) => {
      setIsMilestoneModalOpen(parseIsOpen(e));
    };
    const handleDebtMilestoneModal = (e: any) => {
      setIsDebtMilestoneModalOpen(parseIsOpen(e));
    };
    const handleDebtDetailModal = (e: any) => {
      setIsDebtDetailModalOpen(parseIsOpen(e));
    };
    const handleGoalDetailModal = (e: any) => {
      setIsGoalDetailModalOpen(parseIsOpen(e));
    };
    const handleGoalTxModal = (e: any) => {
      setIsGoalTxModalOpen(parseIsOpen(e));
    };
    const handleDebtTxModal = (e: any) => {
      setIsDebtTxModalOpen(parseIsOpen(e));
    };
    const handlePremiumModal = (e: any) => {
      setIsPremiumModalOpen(parseIsOpen(e));
    };
    const handleDispatchHub = (e: any) => {
      setIsDispatchHubOpen(parseIsOpen(e));
    };
    const handleStatementVault = (e: any) => {
      setIsStatementVaultOpen(parseIsOpen(e));
    };
    const handleBudgetDetail = (e: any) => {
      setIsBudgetDetailOpen(parseIsOpen(e));
    };
    const handleSettingsSubView = (e: any) => {
      setIsSettingsSubViewOpen(parseIsOpen(e));
    };
    const handleBudgetTxModal = (e: any) => {
      setIsBudgetTxModalOpen(parseIsOpen(e));
    };
    const handleWeekendWrapUpModal = (e: any) => {
      setIsWeekendWrapUpOpen(parseIsOpen(e));
    };
    const handleAnnualWrappedModal = (e: any) => {
      setIsAnnualWrappedOpen(parseIsOpen(e));
    };
    const handleEspressoModal = (e: any) => {
      setIsEspressoModalOpen(parseIsOpen(e));
    };
    const handleShouldIBuyThisModal = (e: any) => {
      setIsShouldIBuyThisOpen(parseIsOpen(e));
    };
    const handleShareAccountModal = (e: any) => {
      setIsShareAccountOpen(parseIsOpen(e));
    };
    const handleNetWorthBreakdownModal = (e: any) => {
      setIsNetWorthBreakdownOpen(parseIsOpen(e));
    };
    const handleCashBreakdownModal = (e: any) => {
      setIsCashBreakdownOpen(parseIsOpen(e));
    };
    const handleInvestmentBreakdownModal = (e: any) => {
      setIsInvestmentBreakdownOpen(parseIsOpen(e));
    };
    const handleDebtBreakdownModal = (e: any) => {
      setIsDebtBreakdownOpen(parseIsOpen(e));
    };
    const handleBudgetConfigModal = (e: any) => {
      setIsBudgetConfigOpen(parseIsOpen(e));
    };
    const handleEmotionalTriggerModal = (e: any) => {
      setIsEmotionalTriggerModalOpen(parseIsOpen(e));
    };
    const handleSmsModal = (e: any) => {
      setIsSmsModalOpen(parseIsOpen(e));
    };
    window.addEventListener('trigger-share-account-modal', () => setIsShareAccountOpen(true));
    window.addEventListener('share-account-modal-toggled', handleShareAccountModal);
    window.addEventListener('sms-modal-toggled', handleSmsModal);
    window.addEventListener('net-worth-breakdown-modal-toggled', handleNetWorthBreakdownModal);
    window.addEventListener('cash-breakdown-modal-toggled', handleCashBreakdownModal);
    window.addEventListener('investment-breakdown-modal-toggled', handleInvestmentBreakdownModal);
    window.addEventListener('debt-breakdown-modal-toggled', handleDebtBreakdownModal);
    window.addEventListener('budget-config-modal-toggled', handleBudgetConfigModal);
    window.addEventListener('emotional-trigger-modal-toggled', handleEmotionalTriggerModal);
    window.addEventListener('open-should-i-buy-this', handleOpenShouldIBuyThis);
    window.addEventListener('open-salary-breakdown-modal', handleOpenSalaryBreakdown);
    window.addEventListener('should-i-buy-this-toggled', handleShouldIBuyThisModal);
    window.addEventListener('salary-modal-toggled', handleSalaryModal);
    window.addEventListener('edit-payroll-modal-toggled', handleEditPayrollModal);
    window.addEventListener('tx-detail-modal-toggled', handleTxDetailModal);
    window.addEventListener('account-modal-toggled', handleAccountModal);
    window.addEventListener('account-detail-modal-toggled', handleAccountDetailModal);
    window.addEventListener('breakdown-modal-toggled', handleBreakdownModal);
    window.addEventListener('debt-modal-toggled', handleDebtModal);
    window.addEventListener('milestone-modal-toggled', handleMilestoneModal);
    window.addEventListener('debt-milestone-modal-toggled', handleDebtMilestoneModal);
    window.addEventListener('debt-detail-modal-toggled', handleDebtDetailModal);
    window.addEventListener('goal-detail-modal-toggled', handleGoalDetailModal);
    window.addEventListener('goal-tx-modal-toggled', handleGoalTxModal);
    window.addEventListener('debt-tx-modal-toggled', handleDebtTxModal);
    window.addEventListener('premium-modal-toggled', handlePremiumModal);
    window.addEventListener('dispatch-hub-toggled', handleDispatchHub);
    window.addEventListener('statement-vault-toggled', handleStatementVault);
    window.addEventListener('budget-detail-toggled', handleBudgetDetail);
    window.addEventListener('settings-subview-toggled', handleSettingsSubView);
    window.addEventListener('budget-tx-modal-toggled', handleBudgetTxModal);
    window.addEventListener('weekend-wrapup-toggled', handleWeekendWrapUpModal);
    window.addEventListener('annual-wrapped-toggled', handleAnnualWrappedModal);
    window.addEventListener('espresso-modal-toggled', handleEspressoModal);
    return () => {
      window.removeEventListener('open-should-i-buy-this', handleOpenShouldIBuyThis);
      window.removeEventListener('open-salary-breakdown-modal', handleOpenSalaryBreakdown);
      window.removeEventListener('should-i-buy-this-toggled', handleShouldIBuyThisModal);
      window.removeEventListener('salary-modal-toggled', handleSalaryModal);
      window.removeEventListener('edit-payroll-modal-toggled', handleEditPayrollModal);
      window.removeEventListener('tx-detail-modal-toggled', handleTxDetailModal);
      window.removeEventListener('account-modal-toggled', handleAccountModal);
      window.removeEventListener('account-detail-modal-toggled', handleAccountDetailModal);
      window.removeEventListener('breakdown-modal-toggled', handleBreakdownModal);
      window.removeEventListener('debt-modal-toggled', handleDebtModal);
      window.removeEventListener('milestone-modal-toggled', handleMilestoneModal);
      window.removeEventListener('debt-milestone-modal-toggled', handleDebtMilestoneModal);
      window.removeEventListener('debt-detail-modal-toggled', handleDebtDetailModal);
      window.removeEventListener('goal-detail-modal-toggled', handleGoalDetailModal);
      window.removeEventListener('goal-tx-modal-toggled', handleGoalTxModal);
      window.removeEventListener('debt-tx-modal-toggled', handleDebtTxModal);
      window.removeEventListener('premium-modal-toggled', handlePremiumModal);
      window.removeEventListener('dispatch-hub-toggled', handleDispatchHub);
      window.removeEventListener('statement-vault-toggled', handleStatementVault);
      window.removeEventListener('budget-detail-toggled', handleBudgetDetail);
      window.removeEventListener('settings-subview-toggled', handleSettingsSubView);
      window.removeEventListener('budget-tx-modal-toggled', handleBudgetTxModal);
      window.removeEventListener('weekend-wrapup-toggled', handleWeekendWrapUpModal);
      window.removeEventListener('annual-wrapped-toggled', handleAnnualWrappedModal);
      window.removeEventListener('espresso-modal-toggled', handleEspressoModal);
      window.removeEventListener('share-account-modal-toggled', handleShareAccountModal);
      window.removeEventListener('net-worth-breakdown-modal-toggled', handleNetWorthBreakdownModal);
      window.removeEventListener('cash-breakdown-modal-toggled', handleCashBreakdownModal);
      window.removeEventListener('investment-breakdown-modal-toggled', handleInvestmentBreakdownModal);
      window.removeEventListener('debt-breakdown-modal-toggled', handleDebtBreakdownModal);
      window.removeEventListener('emotional-trigger-modal-toggled', handleEmotionalTriggerModal);
      window.removeEventListener('sms-modal-toggled', handleSmsModal);
    };
  }, []);

  const isAnyModalOpen = isSalaryModalOpen || isEditPayrollModalOpen || isTxDetailModalOpen || isAccountModalOpen || isAccountDetailModalOpen || isBreakdownModalOpen || isDebtModalOpen || isTxModalOpen || isMilestoneModalOpen || isDebtMilestoneModalOpen || isDebtDetailModalOpen || isGoalDetailModalOpen || isGoalTxModalOpen || isDebtTxModalOpen || isAIModalOpen || isPremiumModalOpen || isStatementVaultOpen || isBudgetDetailOpen || isSettingsSubViewOpen || isBudgetTxModalOpen || isWeekendWrapUpOpen || isAnnualWrappedOpen || isTokenShopOpen || isReceiptScannerOpen || isEspressoModalOpen || isShouldIBuyThisOpen || isShareAccountOpen || isNetWorthBreakdownOpen || isCashBreakdownOpen || isInvestmentBreakdownOpen || isDebtBreakdownOpen || isBudgetConfigOpen || isEmotionalTriggerModalOpen || isSmsModalOpen;
  
  const shouldHideHeaderFooter = isLocked || activeTab === 'ai' || isSalaryModalOpen || isBreakdownModalOpen || isEditPayrollModalOpen || isMilestoneModalOpen || isDebtMilestoneModalOpen || isDebtTxModalOpen || isDebtDetailModalOpen || isAccountDetailModalOpen || isAccountModalOpen || isTxDetailModalOpen || isNetWorthBreakdownOpen || isCashBreakdownOpen || isInvestmentBreakdownOpen || isDebtBreakdownOpen || isTxModalOpen || isPremiumModalOpen || isBudgetConfigOpen || isBudgetTxModalOpen || isEmotionalTriggerModalOpen || isSmsModalOpen;

  console.log('Layout debug:', { isPremiumModalOpen, shouldHideHeaderFooter });

  return (
    <div className="w-full h-screen flex flex-col bg-[#F8FAFC] text-black overflow-hidden relative">
      <AnimatePresence>
        {isFabMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/40"
            onClick={() => setIsFabMenuOpen(false)}
          >
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute bottom-24 right-6 bg-white rounded-2xl shadow-xl p-2 flex flex-col gap-1 w-56 border border-neutral-100"
              onClick={(e) => e.stopPropagation()}
            >
              <button className="text-left px-4 py-3 text-sm font-bold text-[#111c2d] hover:bg-[#A6DDB1]/10 rounded-xl transition-colors" onClick={() => { setTxMode?.('expense'); setIsFabMenuOpen(false); setIsTxModalOpen?.(true); }}>{t('layout.new_expense', 'New expense')}</button>
              <button className="text-left px-4 py-3 text-sm font-bold text-[#111c2d] hover:bg-[#A6DDB1]/10 rounded-xl transition-colors" onClick={() => { setTxMode?.('income'); setIsFabMenuOpen(false); setIsTxModalOpen?.(true); }}>{t('layout.new_income', 'New income')}</button>
              <button className="text-left px-4 py-3 text-sm font-bold text-[#111c2d] hover:bg-[#A6DDB1]/10 rounded-xl transition-colors" onClick={() => { setTxMode?.('transfer'); setIsFabMenuOpen(false); setIsTxModalOpen?.(true); }}>{t('layout.new_transfer', 'New transfer')}</button>
              <button className="text-left px-4 py-3 text-sm font-bold text-[#111c2d] hover:bg-[#A6DDB1]/10 rounded-xl transition-colors" onClick={() => { setIsFabMenuOpen(false); window.dispatchEvent(new CustomEvent('trigger-savings-goal-config')); }}>{t('layout.new_saving_goal', 'New saving goal')}</button>
              <button className="text-left px-4 py-3 text-sm font-bold text-[#111c2d] hover:bg-[#A6DDB1]/10 rounded-xl transition-colors" onClick={() => { setIsFabMenuOpen(false); window.dispatchEvent(new CustomEvent('trigger-debt-config')); }}>{t('layout.new_debt', 'New debt')}</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* BACKGROUND HALOS */}
      <div className="absolute inset-0 pointer-events-none z-0 select-none opacity-40">
        <div className="absolute top-[-10%] left-[-20%] w-[500px] h-[500px] rounded-full bg-[#A6DDB1]/10 blur-[120px]" />
      </div>

      {/* CORE BRAND HEADER UTILITY */}
      {!shouldHideHeaderFooter && (
        <header className="w-full sticky top-0 z-40 flex flex-col select-none box-border border-b border-neutral-100 bg-white shrink-0 rounded-none shadow-md">
          {profile?.linkedWorkspaces && profile.linkedWorkspaces.length > 0 && (
            <div className="bg-[#111c2d] text-white px-4 py-2 flex items-center justify-between text-xs font-medium border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <span className="text-[#A6DDB1] font-bold">Workspace:</span>
                <select
                  value={activeWorkspaceUid || profile.uid}
                  onChange={(e) => setActiveWorkspaceUid?.(e.target.value)}
                  className="bg-neutral-800 text-white border border-neutral-700 rounded-lg px-2 py-1 text-xs font-bold outline-none cursor-pointer"
                >
                  <option value={profile.uid}>My Personal Workspace ({profile.fullName || 'Personal'})</option>
                  {profile.linkedWorkspaces.map((w: any) => (
                    <option key={w.ownerUid} value={w.ownerUid}>
                      Shared Vault: {w.ownerName} ({w.permissionLevel?.replace('_', ' ')})
                    </option>
                  ))}
                </select>
              </div>
              {activeWorkspaceUid && activeWorkspaceUid !== profile.uid && (
                <span className="bg-[#A6DDB1]/20 text-[#A6DDB1] px-2 py-0.5 rounded text-[10px] font-bold">
                  Shared Partner Mode
                </span>
              )}
            </div>
          )}
          <div className="w-full px-4 h-[81px] flex items-center justify-between">
            <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => setActiveTab('essentials')}>
              <div className="w-20 h-20 flex items-center justify-center Astro-Portrait-Mode">
                <VantageLogo size="100%" />
              </div>
              <div className="flex flex-col">
              </div>
            </div>

            <div className="flex items-center gap-3">
              {isOffline && (
                <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-mono tracking-wide uppercase">
                  <WifiOff size={10} />
                  <span>{t('layout.offline', 'Offline')}</span>
                </div>
              )}
              {profile?.uid && (
                <div className="flex items-center gap-2">

                  <button
                    onClick={() => setIsShareAccountOpen(true)}
                    title="Share Account / Add Partner"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-[#A6DDB1]/20 hover:bg-[#A6DDB1]/30 border border-[#A6DDB1]/40 text-[#111c2d] text-xs font-bold transition-all active:scale-95 cursor-pointer shadow-xs"
                  >
                    <UserPlus size={14} className="text-[#111c2d]" />
                    <span className="hidden sm:inline font-bold">Add Partner</span>
                  </button>
                  <button
                    onClick={() => setIsEspressoModalOpen(true)}
                    title="Morning Financial Espresso 7:00 AM Audio Brief"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-amber-50 hover:bg-amber-100/80 border border-amber-200/60 text-amber-800 text-xs font-bold transition-all active:scale-95 cursor-pointer shadow-xs"
                  >
                    <Coffee size={14} className="text-amber-600 animate-pulse" />
                    <span className="hidden sm:inline font-bold">Espresso</span>
                  </button>
                  <StreakTracker profile={profile} streakUpdated={streakUpdated} userLogins={userLogins} />
                  <NotificationDispatchHub
                    uid={profile.uid}
                    accounts={accounts || []}
                    transactions={transactions || []}
                    accountBalances={accountBalances || {}}
                  />
                </div>
              )}
              <button 
                onClick={() => setActiveTab('settings')}
                className="p-2 rounded-full hover:bg-neutral-100 transition-colors"
              >
                <SettingsIcon size={20} className="text-neutral-400" />
              </button>
            </div>
          </div>
          
          {profile?.uid && (
            <div className="w-full px-4 pb-3 flex flex-col gap-1.5">
              <div className="flex justify-between items-center w-full relative">
                <span className="text-[11px] font-bold text-neutral-600 flex items-center gap-1">
                  <Sparkles size={12} className="text-[#A6DDB1]" /> {t('layout.vantage_ai_tokens', 'Vantage AI Tokens')}
                </span>
                <button 
                  onClick={(e) => { e.stopPropagation(); setIsTokenShopOpen(true); }}
                  className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center p-1 rounded-full text-[#A6DDB1] hover:bg-[#A6DDB1]/10 transition-colors"
                  aria-label="Buy AI Tokens"
                >
                  <ShoppingCart size={14} />
                </button>
                <span className="text-[11px] font-mono font-bold text-[#A6DDB1]">
                  {(() => {
                    const remaining = getEffectiveAiTokens(profile);
                    const maxTokens = Math.max(getBaseMaxTokens(profile.subscriptionTier), remaining, 50000);
                    return `${remaining.toLocaleString()} / ${maxTokens.toLocaleString()}`;
                  })()}
                </span>
              </div>
              {(() => {
                const remaining = getEffectiveAiTokens(profile);
                const maxTokens = Math.max(getBaseMaxTokens(profile.subscriptionTier), remaining, 50000);
                const usedPct = maxTokens > 0 ? ((maxTokens - remaining) / maxTokens) * 100 : 0;
                
                let bgColorClass = "bg-[#A6DDB1]";
                if (usedPct >= 90) {
                  bgColorClass = "bg-red-700";
                } else if (usedPct >= 80) {
                  bgColorClass = "bg-yellow-600";
                }

                return (
                  <div className="w-full bg-neutral-100 rounded-full h-[4px] overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${bgColorClass}`}
                      style={{ width: `${Math.min(100, Math.max(0, (remaining / maxTokens) * 100))}%` }} 
                    />
                  </div>
                );
              })()}

            </div>
          )}
        </header>
      )}

      {/* CONTENT CANVAS */}
      <main className={`flex-1 w-full relative z-10 box-border ${shouldHideHeaderFooter ? 'pb-0' : 'pb-28'} bg-[#F8FAFC] overflow-y-auto overflow-x-hidden`}>
        {children}
      </main>

      {/* UNIFIED STICKY FOOTER BOTTOM NAVIGATION DOCK */}
      {!shouldHideHeaderFooter && !isDispatchHubOpen && (
        <nav className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-[460px] box-border select-none shrink-0">


        {/* Receipt Scanner FAB (Camera) */}
        <button
          onClick={() => setIsReceiptScannerOpen(true)}
          className="fixed bottom-40 right-6 z-[60] w-14 h-14 bg-white border border-neutral-200 text-[#1E3A20] rounded-full flex items-center justify-center shadow-lg hover:bg-neutral-50 transition-all active:scale-95 group"
          title={t('layout.scan_receipt', 'Scan receipt with AI')}
        >
          <Camera size={22} className="text-[#1E3A20] group-hover:scale-105 transition-transform" />
          {receiptScanCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-[#A6DDB1] text-[#1E3A20] text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-white flex items-center justify-center shadow-sm min-w-[18px] h-[18px]">
              {receiptScanCount}
            </span>
          )}
        </button>

        {/* FAB (Floating Add Button - positioned fixed directly under camera button) */}
        <div className="fixed bottom-24 right-6 z-[60] w-14 h-14 flex items-center justify-center">
            <motion.div
                className="absolute inset-0 rounded-full border-4 border-[#A6DDB1]"
                animate={{
                    scale: [1, 1.6],
                    opacity: [1, 0]
                }}
                transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: "easeOut"
                }}
            />
            <button
              onClick={() => setIsFabMenuOpen(true)}
              className="w-14 h-14 bg-[#A6DDB1] rounded-full flex items-center justify-center shadow-lg hover:brightness-95 transition-all active:scale-95 z-10 cursor-pointer"
            >
              <Plus size={28} className="text-[#1E3A20]" />
            </button>
        </div>

        <div 
          className="w-full p-2 flex items-center justify-around gap-1 transition-all duration-300"
          style={{
            background: '#F8FAFC',
            border: '1px solid #E1E8ED',
            borderRadius: '30px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)'
          }}
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => {
                  triggerHaptic(hapticPresets.light);
                  setActiveTab(item.id);
                }}
                className={`flex-1 flex flex-col items-center justify-center py-2 px-1 rounded-full relative transition-all cursor-pointer outline-none group ${isActive ? 'bg-[#D3E3D1]' : 'bg-transparent'}`}
              >
                <div className="relative flex items-center justify-center">
                  <Icon size={19} strokeWidth={isActive ? 2.5 : 2} style={{ color: isActive ? '#1E3A20' : '#4B5563' }} />
                </div>
                <span className={`text-[10px] font-semibold tracking-wide mt-1 transition-colors duration-200 ${isActive ? 'text-[#1E3A20]' : 'text-neutral-600'}`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
      )}
      {profile?.uid && (
        <>
          <ReceiptScannerModal
            isOpen={isReceiptScannerOpen}
            onClose={() => setIsReceiptScannerOpen(false)}
            uid={profile.uid}
            profile={profile}
            accounts={accounts || []}
          />
          <MorningEspressoModal
            isOpen={isEspressoModalOpen}
            onClose={() => setIsEspressoModalOpen(false)}
            profile={profile}
            accounts={accounts || []}
            transactions={transactions || []}
            accountBalances={accountBalances || {}}
            userLogins={userLogins || []}
            setActiveTab={setActiveTab}
            onUpdateProfile={onUpdateProfile}
          />
          <ShouldIBuyThisModal
            isOpen={isShouldIBuyThisOpen}
            onClose={() => setIsShouldIBuyThisOpen(false)}
            profile={profile}
            accounts={accounts || []}
            transactions={transactions || []}
            accountBalances={accountBalances || {}}
            onUpdateProfile={onUpdateProfile}
          />
          <TokenShopModal
            isOpen={isTokenShopOpen}
            onClose={() => setIsTokenShopOpen(false)}
            uid={profile?.uid || ''}
            profile={profile}
            onSuccess={(updatedProfile) => {
              if (onUpdateProfile) onUpdateProfile(updatedProfile);
              setIsTokenShopOpen(false);
            }}
          />
          <ShareAccountModal
            isOpen={isShareAccountOpen}
            onClose={() => setIsShareAccountOpen(false)}
            profile={profile}
            onUpdateProfile={(updated) => {
              if (onUpdateProfile) onUpdateProfile(updated);
            }}
            onOpenPremium={() => setIsPremiumModalOpen(true)}
          />
        </>
      )}
    </div>
  );
};
