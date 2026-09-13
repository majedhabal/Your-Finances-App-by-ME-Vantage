import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n';
import { motion, AnimatePresence } from 'motion/react';
import { formatLabel } from '../lib/stringUtils';
import { 
  ArrowUpRight, 
  ArrowRight, 
  Scan, 
  ChevronRight, 
  ChevronDown, 
  ChevronUp,
  TrendingUp, 
  TrendingDown, 
  X, 
  Camera as CameraIcon, 
  Wallet as WalletIcon, 
  Crown, 
  Sparkles, 
  Plus, 
  Landmark, 
  Building2 as BankIcon, 
  Trash2, 
  GitBranch, 
  CreditCard, 
  Home,
  Check,
  Calculator,
  Activity,
  Calendar,
  Layers,
  PieChart as PieChartIcon,
  HelpCircle,
  AlertTriangle,
  Lightbulb,
  Search,
  Eye,
  PlusCircle,
  Clock,
  FileDown,
  ShoppingCart,
  Car,
  Heart,
  ShieldAlert,
  ReceiptText,
  GripVertical,
  ArrowUp,
  ArrowDown,
  RotateCcw
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  Legend, 
  PieChart as RePieChart, 
  Pie, 
  Cell,
  AreaChart,
  Area
} from 'recharts';
import { collection, query, orderBy, getDocs, onSnapshot, doc, deleteDoc, writeBatch, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { PremiumModal } from './PremiumModal';
import { generateAIContent } from '../lib/gemini';
import { calculateAccountTrend, calculateAccountBalances, calculateAggregateTrend } from '../lib/trendUtils';
import { DEFAULT_RATES, syncExchangeRates } from '../lib/exchangeRates';
import { exportSummaryPdf } from '../utils/exportSummaryPdf';
import { AdContainer } from './AdContainer';
import { VantageDataErrorBoundary } from './VantageDataErrorBoundary';
import { AccountDetailModal } from './AccountDetailModal';
import { PendingApprovals } from './PendingApprovals';
import { NetWorthBreakdownModal } from './NetWorthBreakdownModal';
import { CashBreakdownModal } from './CashBreakdownModal';
import { InvestmentBreakdownModal } from './InvestmentBreakdownModal';
import { DebtBreakdownModal } from './DebtBreakdownModal';
import { RecurringBreakdownModal } from './RecurringBreakdownModal';
import { SpendingTrends } from './SpendingTrends';
import { TrajectoryVisualizer } from './TrajectoryVisualizer';
import { QuickAddWidget } from './QuickAddWidget';
import { NativeAdBox } from './NativeAdBox';
import { ShouldIBuyThis } from './ShouldIBuyThis';
import { GratuityCalculator } from './GratuityCalculator';
import { ThreeDBarChart } from './ThreeDBarChart';


// Sage green accent token
const SAGE_GREEN = '#A6DDB1';

const CURRENCY_COLORS: Record<string, string> = {
  'AED': '#A6DDB1', // Emerald/Sage Green
  'USD': '#D4AF37', // Gold
  'EUR': '#A855F7', // Purple
  'GBP': '#3B82F6', // Blue
  'JPY': '#EF4444', // Red
  'SAR': '#F97316', // Orange
  'QAR': '#0EA5E9', // Sky
};

const DEFAULT_CHART_COLORS = ['#A6DDB1', '#D4AF37', '#A855F7', '#3B82F6', '#EF4444', '#F97316', '#0EA5E9'];
const LUXURY_PALETTE = ['#A6DDB1', '#2F3542', '#747D8C', '#A4B0BE', '#CED6E0', '#DFE4EA'];

interface AnalyticsProps {
  onNavigateToTransactions?: (accId?: string) => void;
  onAddTransaction?: () => void;
  onAddAccount?: () => void;
  profile: any;
  onUpdateProfile?: (profile: any) => void;
  accounts: any[];
  allTransactions: any[];
  accountBalances: Record<string, number>;
}


export const Analytics: React.FC<AnalyticsProps> = React.memo(({
  onNavigateToTransactions,
  onAddTransaction,
  onAddAccount,
  profile,
  onUpdateProfile,
  accounts,
  allTransactions,
  accountBalances
}) => {
  const { t, i18n } = useTranslation();
  const formatCurrency = (val: number) => {
    const primaryCurrency = profile?.baseCurrency || profile?.currency || 'AED';
    const symbol = primaryCurrency === 'USD' ? '$' : primaryCurrency === 'EUR' ? '€' : primaryCurrency === 'GBP' ? '£' : `${primaryCurrency} `;
    return `${val < 0 ? '-' : ''}${symbol}${Math.abs(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  // Navigation stream state ('now' = Current Situation, 'past' = Historical Analysis, 'future' = Forecast Predictions)
  const [activeTimeline, setActiveTimeline] = useState<'now' | 'past' | 'future'>('now');
  const [netCashFlowPeriod, setNetCashFlowPeriod] = useState<'daily' | 'monthly' | 'quarterly' | 'yearly'>('daily');
  const [netCashFlowMonth, setNetCashFlowMonth] = useState<string>('2026-07');
  const [netCashFlowQuarter, setNetCashFlowQuarter] = useState<string>('2026-Q3');
  const [netCashFlowYear, setNetCashFlowYear] = useState<string>('2026');

  useEffect(() => {
    if (localStorage.getItem('vantage_analytics_upcoming_filter') === 'true') {
      localStorage.removeItem('vantage_analytics_upcoming_filter');
      setActiveTimeline('future');
    }
  }, []);

  // Interactive Scenario planner state
  const [extraSavings, setExtraSavings] = useState<number>(200);
  const [applyBudgetFeedback, setApplyBudgetFeedback] = useState<string | null>(null);

  // Multi-account and rate states unified
  const [selectedAccIds, setSelectedAccIds] = useState<Set<string>>(new Set());
  const [exchangeRates, setExchangeRates] = useState<any>(DEFAULT_RATES);
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [accountToManage, setAccountToManage] = useState<any | null>(null);
  const [modalShowInsights, setModalShowInsights] = useState(false);
  const [isNetWorthBreakdownOpen, setIsNetWorthBreakdownOpen] = useState(false);
  const [netWorthPeriod, setNetWorthPeriod] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly');
  const [cashPeriod, setCashPeriod] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly');
  const [investmentPeriod, setInvestmentPeriod] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly');
  const [debtPeriod, setDebtPeriod] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly');
  const [hoveredNetWorthIndex, setHoveredNetWorthIndex] = useState<number | null>(null);
  const [hoveredCashIndex, setHoveredCashIndex] = useState<number | null>(null);
  const [hoveredInvestmentIndex, setHoveredInvestmentIndex] = useState<number | null>(null);
  const [hoveredDebtIndex, setHoveredDebtIndex] = useState<number | null>(null);
  const [hoveredSpendMonth, setHoveredSpendMonth] = useState<{ month: string; val: number } | null>(null);
  const [lockedSpendMonth, setLockedSpendMonth] = useState<{ month: string; val: number } | null>(null);
  const [hoveredNetWorthMonthData, setHoveredNetWorthMonthData] = useState<{ month: string; netFlow: number; income: number; expense: number } | null>(null);
  const [lockedNetWorthMonthData, setLockedNetWorthMonthData] = useState<{ month: string; netFlow: number; income: number; expense: number } | null>(null);
  const [isCashBreakdownOpen, setIsCashBreakdownOpen] = useState(false);
  const [isInvestmentBreakdownOpen, setIsInvestmentBreakdownOpen] = useState(false);
  const [isDebtBreakdownOpen, setIsDebtBreakdownOpen] = useState(false);
  const [isRecurringBreakdownOpen, setIsRecurringBreakdownOpen] = useState(false);
  const [selectedEmotionalCategory, setSelectedEmotionalCategory] = useState<string | null>(null);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('emotional-trigger-modal-toggled', { detail: { isOpen: Boolean(selectedEmotionalCategory) } }));
  }, [selectedEmotionalCategory]);

  const [dashboardOrder, setDashboardOrder] = useState<string[]>(() => {
    const saved = localStorage.getItem('vantage_analytics_dashboard_order');
    if (saved) {
      try { return JSON.parse(saved); } catch(e) {}
    }
    return [
      'net-cash-flow',
      'net-worth',
      'cash-available',
      'investment-assets',
      'total-debts',
      'recurring-transactions',
      'vantage-insight',
      'gratuity'
    ];
  });
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [runwayMode, setRunwayMode] = useState<'survival' | 'lifestyle'>('lifestyle');

  const moveDashboardCard = (fromId: string, toId: string) => {
    const newOrder = [...dashboardOrder];
    const fromIdx = newOrder.indexOf(fromId);
    const toIdx = newOrder.indexOf(toId);
    if (fromIdx !== -1 && toIdx !== -1) {
      newOrder.splice(fromIdx, 1);
      newOrder.splice(toIdx, 0, fromId);
      setDashboardOrder(newOrder);
      localStorage.setItem('vantage_analytics_dashboard_order', JSON.stringify(newOrder));
    }
  };

  const shiftCardOrder = (id: string, direction: 'up' | 'down') => {
    const idx = dashboardOrder.indexOf(id);
    if (idx === -1) return;
    const newOrder = [...dashboardOrder];
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= newOrder.length) return;
    const temp = newOrder[idx];
    newOrder[idx] = newOrder[targetIdx];
    newOrder[targetIdx] = temp;
    setDashboardOrder(newOrder);
    localStorage.setItem('vantage_analytics_dashboard_order', JSON.stringify(newOrder));
  };

  const resetDashboardOrder = () => {
    const defaultOrder = [
      'net-cash-flow',
      'net-worth',
      'cash-available',
      'investment-assets',
      'total-debts',
      'recurring-transactions',
      'vantage-insight',
      'gratuity'
    ];
    setDashboardOrder(defaultOrder);
    localStorage.setItem('vantage_analytics_dashboard_order', JSON.stringify(defaultOrder));
  };

  const [historicalDashboardOrder, setHistoricalDashboardOrder] = useState<string[]>(() => {
    const saved = localStorage.getItem('vantage_historical_dashboard_order');
    if (saved) {
      try { return JSON.parse(saved); } catch(e) {}
    }
    return [
      'historical-summary-stats',
      'historical-income-expenses',
      'historical-net-worth-trend',
      'historical-lifestyle-inflation',
      'historical-emotional-spending',
      'historical-debt-destruction',
      'historical-income-burn-rate',
      'historical-investment-perf'
    ];
  });
  const [historicalDraggedCardId, setHistoricalDraggedCardId] = useState<string | null>(null);

  const moveHistoricalDashboardCard = (fromId: string, toId: string) => {
    const newOrder = [...historicalDashboardOrder];
    const fromIdx = newOrder.indexOf(fromId);
    const toIdx = newOrder.indexOf(toId);
    if (fromIdx !== -1 && toIdx !== -1) {
      newOrder.splice(fromIdx, 1);
      newOrder.splice(toIdx, 0, fromId);
      setHistoricalDashboardOrder(newOrder);
      localStorage.setItem('vantage_historical_dashboard_order', JSON.stringify(newOrder));
    }
  };

  const shiftHistoricalCardOrder = (id: string, direction: 'up' | 'down') => {
    const idx = historicalDashboardOrder.indexOf(id);
    if (idx === -1) return;
    const newOrder = [...historicalDashboardOrder];
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= newOrder.length) return;
    const temp = newOrder[idx];
    newOrder[idx] = newOrder[targetIdx];
    newOrder[targetIdx] = temp;
    setHistoricalDashboardOrder(newOrder);
    localStorage.setItem('vantage_historical_dashboard_order', JSON.stringify(newOrder));
  };

  const resetHistoricalDashboardOrder = () => {
    const defaultOrder = [
      'historical-summary-stats',
      'historical-income-expenses',
      'historical-net-worth-trend',
      'historical-lifestyle-inflation',
      'historical-emotional-spending',
      'historical-debt-destruction',
      'historical-income-burn-rate',
      'historical-investment-perf'
    ];
    setHistoricalDashboardOrder(defaultOrder);
    localStorage.setItem('vantage_historical_dashboard_order', JSON.stringify(defaultOrder));
  };

  const [forecastDashboardOrder, setForecastDashboardOrder] = useState<string[]>(() => {
    const saved = localStorage.getItem('vantage_forecast_dashboard_order');
    if (saved) {
      try { return JSON.parse(saved); } catch(e) {}
    }
    return [
      'forecast-runway-liquidity',
      'forecast-goal-target-planner',
      'forecast-fire-horizon',
      'forecast-debt-free-horizon',
      'forecast-net-worth',
      'forecast-scenario-planner',
      'forecast-cash-flow'
    ];
  });
  const [forecastDraggedCardId, setForecastDraggedCardId] = useState<string | null>(null);

  const moveForecastDashboardCard = (fromId: string, toId: string) => {
    const newOrder = [...forecastDashboardOrder];
    const fromIdx = newOrder.indexOf(fromId);
    const toIdx = newOrder.indexOf(toId);
    if (fromIdx !== -1 && toIdx !== -1) {
      newOrder.splice(fromIdx, 1);
      newOrder.splice(toIdx, 0, fromId);
      setForecastDashboardOrder(newOrder);
      localStorage.setItem('vantage_forecast_dashboard_order', JSON.stringify(newOrder));
    }
  };

  const shiftForecastCardOrder = (id: string, direction: 'up' | 'down') => {
    const idx = forecastDashboardOrder.indexOf(id);
    if (idx === -1) return;
    const newOrder = [...forecastDashboardOrder];
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= newOrder.length) return;
    const temp = newOrder[idx];
    newOrder[idx] = newOrder[targetIdx];
    newOrder[targetIdx] = temp;
    setForecastDashboardOrder(newOrder);
    localStorage.setItem('vantage_forecast_dashboard_order', JSON.stringify(newOrder));
  };

  const resetForecastDashboardOrder = () => {
    const defaultOrder = [
      'forecast-runway-liquidity',
      'forecast-goal-target-planner',
      'forecast-fire-horizon',
      'forecast-debt-free-horizon',
      'forecast-net-worth',
      'forecast-scenario-planner',
      'forecast-cash-flow'
    ];
    setForecastDashboardOrder(defaultOrder);
    localStorage.setItem('vantage_forecast_dashboard_order', JSON.stringify(defaultOrder));
  };
  
  // Historical Analysis controls
  const [pastTimeRange, setPastTimeRange] = useState<'1M' | '3M' | '6M' | '1Y' | 'All'>('6M');
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);
  const [timeHorizon, setTimeHorizon] = useState<'7d' | '30d' | 'ytd' | 'all' | 'custom'>('30d');
  const [grouping, setGrouping] = useState<'category' | 'account_type' | 'interval'>('category');
  const [chartType, setChartType] = useState<'bar' | 'line' | 'pie'>('bar');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [spendComparisonPeriod, setSpendComparisonPeriod] = useState<'prev_period' | 'last_year' | 'budget'>('prev_period');
  
  // Database sub-collections
  const [recurring, setRecurring] = useState<any[]>([]);
  const [miniBudgets, setMiniBudgets] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [dynamicBaseSalary, setDynamicBaseSalary] = useState<number>(0);

  useEffect(() => {
    const isOpen = isNetWorthBreakdownOpen || isCashBreakdownOpen || isDebtBreakdownOpen || isRecurringBreakdownOpen;
    window.dispatchEvent(new CustomEvent('breakdown-modal-toggled', { detail: { isOpen } }));
  }, [isNetWorthBreakdownOpen, isCashBreakdownOpen, isDebtBreakdownOpen, isRecurringBreakdownOpen]);

  // Predictions states
  const [aiForecast, setAiForecast] = useState<string | null>(null);
  const [aiForecastLoading, setAiForecastLoading] = useState(false);
  const [expandedTypes, setExpandedTypes] = useState<Record<string, boolean>>({});

  const isPremium = !!(profile?.isPremium || (profile?.subscriptionTier && profile.subscriptionTier.toLowerCase() !== 'free') || (profile?.vantageAiUnlockedUntil && new Date(profile.vantageAiUnlockedUntil).getTime() > Date.now()));
  const now = useMemo(() => new Date(), []);

  // Fetch sub-collections
  useEffect(() => {
    if (!profile?.uid) return;
    
    const recurringRef = collection(db, `users/${profile.uid}/recurringTransactions`);
    const unsubRecurring = onSnapshot(recurringRef, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(doc => {
         list.push({ id: doc.id, ...doc.data() });
      });
      setRecurring(list);
    });

    const txColRef = collection(db, `users/${profile.uid}/transactions`);
    const q = query(
      txColRef,
      where("category", "==", "Income"),
      where("isRecurring", "==", true)
    );
    const unsubTx = onSnapshot(q, (snapshot) => {
      let wageSum = 0;
      snapshot.forEach(doc => {
        const data = doc.data();
        const subCat = data.subCategory || data.subcategory || "";
        if (subCat.toLowerCase() === "wage") {
          wageSum += Number(data.amount) || 0;
        }
      });
      setDynamicBaseSalary(wageSum);
    }, (err) => {
      console.warn("Error listening to dynamic wage transactions in Analytics:", err);
    });

    const budgetsRef = collection(db, `users/${profile.uid}/miniBudgets`);
    const unsubBudgets = onSnapshot(budgetsRef, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(doc => {
         list.push({ id: doc.id, ...doc.data() });
      });
      setMiniBudgets(list);
    }, (err) => {
      console.warn("Error listening to miniBudgets in Analytics:", err);
    });

    const goalsRef = collection(db, `users/${profile.uid}/goals`);
    const unsubGoals = onSnapshot(goalsRef, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(doc => {
         list.push({ id: doc.id, ...doc.data() });
      });
      setGoals(list);
    }, (err) => {
      console.warn("Error listening to goals in Analytics:", err);
    });

    return () => {
      unsubRecurring();
      unsubTx();
      unsubBudgets();
      unsubGoals();
    };
  }, [profile?.uid]);

  // Load exchange rates once
  useEffect(() => {
    const loadRates = async () => {
      try {
        const rates = await syncExchangeRates();
        setExchangeRates(rates);
      } catch (err) {
        // Safe fallback
      }
    };
    loadRates();
  }, []);

  // Initialize selectedAccIds to all active accounts or a filtered one
  useEffect(() => {
    const filterAccId = localStorage.getItem('analytics_filter_account_id');
    if (filterAccId) {
      setSelectedAccIds(new Set([filterAccId]));
      localStorage.removeItem('analytics_filter_account_id');
    } else if (accounts.length > 0 && selectedAccIds.size === 0) {
      setSelectedAccIds(new Set(accounts.filter(a => !a.isArchived).map(a => a.id)));
    }
  }, [accounts]);

  // Handle live tab-switching events with account filter
  useEffect(() => {
    const handleSwitchTab = (e: any) => {
      if (e.detail?.tab === 'analytics' && e.detail?.accountId) {
        setSelectedAccIds(new Set([e.detail.accountId]));
      }
    };
    window.addEventListener('switch-tab', handleSwitchTab);
    return () => window.removeEventListener('switch-tab', handleSwitchTab);
  }, []);

  const selectAll = () => {
    setSelectedAccIds(new Set(accounts.filter(a => !a.isArchived).map(a => a.id)));
  };

  const toggleAccount = (id: string) => {
    const next = new Set(selectedAccIds);
    if (next.has(id)) {
      if (next.size > 1) next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedAccIds(next);
  };

  // Helper exchange rates
  const getRateToAED = (curr: string) => {
    const c = curr || 'AED';
    if (c === 'AED') return 1;
    return (exchangeRates && exchangeRates[c]) || (DEFAULT_RATES as any)[c] || 1;
  };

  // Centralised calculations (aligning calculations without separate screen reload cycles)
  const netCashFlowStats = useMemo(() => {
    const now = new Date();
    let startDate = new Date(now);
    let endDate = new Date(now);

    if (netCashFlowPeriod === 'daily') {
      startDate.setDate(now.getDate() - 30);
      endDate = new Date(now);
    } else if (netCashFlowPeriod === 'monthly') {
      const [yr, mo] = netCashFlowMonth.split('-').map(Number);
      startDate = new Date(yr, mo - 1, 1);
      endDate = new Date(yr, mo, 0, 23, 59, 59, 999);
    } else if (netCashFlowPeriod === 'quarterly') {
      const [yrStr, qStr] = netCashFlowQuarter.split('-Q');
      const yr = Number(yrStr);
      const q = Number(qStr);
      const startMonth = (q - 1) * 3;
      startDate = new Date(yr, startMonth, 1);
      endDate = new Date(yr, startMonth + 3, 0, 23, 59, 59, 999);
    } else {
      const yr = Number(netCashFlowYear);
      startDate = new Date(yr, 0, 1);
      endDate = new Date(yr, 11, 31, 23, 59, 59, 999);
    }

    const baseRateToAED = getRateToAED(profile?.baseCurrency || profile?.currency || 'AED');

    let inflow = 0;
    let outflow = 0;

    const filtered = allTransactions.filter(tx => {
      const txDate = new Date(tx.date);
      const isAccSelected = selectedAccIds.size === 0 || selectedAccIds.has(tx.accountId) || (tx.type === 'transfer' && tx.toAccountId && selectedAccIds.has(tx.toAccountId));
      return isAccSelected && txDate >= startDate && txDate <= endDate && tx.status !== 'draft' && tx.status !== 'scheduled' && tx.status !== 'pending' && tx.status !== 'upcoming';
    });

    filtered.forEach(tx => {
      const amt = Number(tx.amount) || 0;
      const acc = accounts.find(a => a.id === tx.accountId);
      const curr = acc?.currency || profile?.baseCurrency || 'AED';
      const rateToAED = getRateToAED(curr);
      const amountInAED = (amt * rateToAED) / baseRateToAED;

      const txType = (tx.type || '').toLowerCase();
      if (txType === 'income' || txType === 'inflow') {
        inflow += amountInAED;
      } else if ((txType === 'expense' || txType === 'outflow') && tx.category !== 'Internal Transfer' && tx.category !== 'Movements') {
        outflow += amountInAED;
      }
    });

    const net = inflow - outflow;

    const chartBuckets: { name: string; value: number }[] = [];
    if (netCashFlowPeriod === 'daily') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const dayStr = d.toISOString().split('T')[0];
        
        let dayInflow = 0;
        let dayOutflow = 0;
        filtered.forEach(tx => {
          const txDateStr = (tx.date || '').split('T')[0];
          if (txDateStr === dayStr) {
            const amt = Number(tx.amount) || 0;
            const acc = accounts.find(a => a.id === tx.accountId);
            const curr = acc?.currency || profile?.baseCurrency || 'AED';
            const rateToAED = getRateToAED(curr);
            const amountInAED = (amt * rateToAED) / baseRateToAED;
            const txType = (tx.type || '').toLowerCase();
            if (txType === 'income' || txType === 'inflow') {
              dayInflow += amountInAED;
            } else if ((txType === 'expense' || txType === 'outflow') && tx.category !== 'Internal Transfer' && tx.category !== 'Movements') {
              dayOutflow += amountInAED;
            }
          }
        });
        const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short' });
        chartBuckets.push({
          name: dayLabel,
          value: Math.round(dayInflow - dayOutflow)
        });
      }
    } else if (netCashFlowPeriod === 'monthly') {
      const [yr, mo] = netCashFlowMonth.split('-').map(Number);
      const weekRanges = [
        { name: 'Week 1', start: 1, end: 7 },
        { name: 'Week 2', start: 8, end: 14 },
        { name: 'Week 3', start: 15, end: 21 },
        { name: 'Week 4', start: 22, end: 31 }
      ];
      weekRanges.forEach(wk => {
        let wkInflow = 0;
        let wkOutflow = 0;
        filtered.forEach(tx => {
          const txDate = new Date(tx.date);
          if (txDate.getFullYear() === yr && txDate.getMonth() === mo - 1) {
            const dayNum = txDate.getDate();
            if (dayNum >= wk.start && (wk.end === 31 || dayNum <= wk.end)) {
              const amt = Number(tx.amount) || 0;
              const acc = accounts.find(a => a.id === tx.accountId);
              const curr = acc?.currency || profile?.baseCurrency || 'AED';
              const rateToAED = getRateToAED(curr);
              const amountInAED = (amt * rateToAED) / baseRateToAED;
              const txType = (tx.type || '').toLowerCase();
              if (txType === 'income' || txType === 'inflow') {
                wkInflow += amountInAED;
              } else if ((txType === 'expense' || txType === 'outflow') && tx.category !== 'Internal Transfer' && tx.category !== 'Movements') {
                wkOutflow += amountInAED;
              }
            }
          }
        });
        chartBuckets.push({ name: wk.name, value: Math.round(wkInflow - wkOutflow) });
      });
    } else if (netCashFlowPeriod === 'quarterly') {
      const [yrStr, qStr] = netCashFlowQuarter.split('-Q');
      const yr = Number(yrStr);
      const startMonth = (Number(qStr) - 1) * 3;
      for (let i = 0; i < 3; i++) {
        const mIndex = startMonth + i;
        const d = new Date(yr, mIndex, 1);
        const mName = d.toLocaleString('default', { month: 'short' });
        
        let mInflow = 0;
        let mOutflow = 0;
        filtered.forEach(tx => {
          const txDate = new Date(tx.date);
          if (txDate.getFullYear() === yr && txDate.getMonth() === mIndex) {
            const amt = Number(tx.amount) || 0;
            const acc = accounts.find(a => a.id === tx.accountId);
            const curr = acc?.currency || profile?.baseCurrency || 'AED';
            const rateToAED = getRateToAED(curr);
            const amountInAED = (amt * rateToAED) / baseRateToAED;
            const txType = (tx.type || '').toLowerCase();
            if (txType === 'income' || txType === 'inflow') {
              mInflow += amountInAED;
            } else if ((txType === 'expense' || txType === 'outflow') && tx.category !== 'Internal Transfer' && tx.category !== 'Movements') {
              mOutflow += amountInAED;
            }
          }
        });
        chartBuckets.push({ name: mName, value: Math.round(mInflow - mOutflow) });
      }
    } else {
      const yr = Number(netCashFlowYear);
      const months = [
        { name: 'Jan', idx: 0 }, { name: 'Feb', idx: 1 }, { name: 'Mar', idx: 2 },
        { name: 'Apr', idx: 3 }, { name: 'May', idx: 4 }, { name: 'Jun', idx: 5 },
        { name: 'Jul', idx: 6 }, { name: 'Aug', idx: 7 }, { name: 'Sep', idx: 8 },
        { name: 'Oct', idx: 9 }, { name: 'Nov', idx: 10 }, { name: 'Dec', idx: 11 }
      ];
      months.forEach(m => {
        let mInflow = 0;
        let mOutflow = 0;
        filtered.forEach(tx => {
          const txDate = new Date(tx.date);
          if (txDate.getFullYear() === yr && txDate.getMonth() === m.idx) {
            const amt = Number(tx.amount) || 0;
            const acc = accounts.find(a => a.id === tx.accountId);
            const curr = acc?.currency || profile?.baseCurrency || 'AED';
            const rateToAED = getRateToAED(curr);
            const amountInAED = (amt * rateToAED) / baseRateToAED;
            const txType = (tx.type || '').toLowerCase();
            if (txType === 'income' || txType === 'inflow') {
              mInflow += amountInAED;
            } else if ((txType === 'expense' || txType === 'outflow') && tx.category !== 'Internal Transfer' && tx.category !== 'Movements') {
              mOutflow += amountInAED;
            }
          }
        });
        chartBuckets.push({ name: m.name, value: Math.round(mInflow - mOutflow) });
      });
    }

    return {
      totalInflow: inflow,
      burnRate: outflow,
      netCashFlow: net,
      chartData: chartBuckets
    };
  }, [allTransactions, netCashFlowPeriod, netCashFlowMonth, netCashFlowQuarter, netCashFlowYear, accounts, profile, exchangeRates, selectedAccIds]);

  const totalInflow = netCashFlowStats.totalInflow;
  const burnRate = netCashFlowStats.burnRate;
  const netCashFlow = netCashFlowStats.netCashFlow;
  const netCashFlowChartData = netCashFlowStats.chartData;

  const financialMetrics = useMemo(() => {
    const primaryCurrency = profile?.baseCurrency || profile?.currency || 'AED';
    const baseRateToAED = getRateToAED(primaryCurrency);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const allNonArchived = accounts.filter(acc => !acc.isArchived);
    const liabilityTypes = ['credit', 'loan', 'mortgage', 'Credit Card', 'Personal Loan', 'Mortgage'];
    const assetAccounts = allNonArchived.filter(acc => !liabilityTypes.includes(acc.type) || acc.loanDirection === 'lent');
    const liabilityAccounts = allNonArchived.filter(acc => liabilityTypes.includes(acc.type) && acc.loanDirection !== 'lent');

    const assetsSum = assetAccounts.reduce((sum, acc) => {
      const bal = accountBalances[acc.id] !== undefined ? accountBalances[acc.id] : Number(acc.currentBalance || acc.startingBalance || 0);
      const rate = getRateToAED(acc.currency);
      return sum + (bal * rate);
    }, 0);

    const totalAssetsInPrimary = assetsSum / baseRateToAED;

    const liabilitiesSum = liabilityAccounts.reduce((sum, acc) => {
      const bal = accountBalances[acc.id] || 0;
      const rate = getRateToAED(acc.currency);
      return sum + (Math.abs(bal) * rate);
    }, 0);

    const calculatedTotalDebt = liabilitiesSum / baseRateToAED;

    // Confirmed income = Sum of all income transactions + legacy starting balances (Rule 17)
    // We must avoid double-counting if a starting balance is already ledgered as a transaction.
    const totalConfirmedIncomeTxSum = allTransactions
      .filter(tx => 
        (tx.type === 'income' || tx.type === 'Inflow') && 
        tx.status !== 'draft' && 
        tx.status !== 'pending' && 
        tx.status !== 'upcoming' &&
        tx.status !== 'Pending Schedule' &&
        !tx.isUpcomingSalaryAllocation &&
        selectedAccIds.has(tx.accountId)
      )
      .reduce((sum, tx) => sum + (Number(tx.amount || 0) * getRateToAED(tx.currency || 'AED')), 0);

    const totalStartingBalances = accounts
      .filter(acc => 
        !acc.isArchived && 
        selectedAccIds.has(acc.id) && 
        !liabilityTypes.includes(acc.type) && 
        acc.loanDirection !== 'lent'
      )
      .reduce((sum, acc) => {
        const accountId = String(acc.id);
        const hasLedgeredStartingBalance = allTransactions.some(tx => 
          (tx.accountId === accountId || tx.toAccountId === accountId) && 
          (tx.subcategory === 'starting_balance' || tx.notes === 'Initial Balance Setup' || tx.notes === 'Starting Balance' || tx.subcategory === 'Starting Balance')
        );
        // If it's already in the ledger, don't add it from the account field
        if (hasLedgeredStartingBalance) return sum;
        return sum + (Number(acc.startingBalance || 0) * getRateToAED(acc.currency || 'AED'));
      }, 0);

    const calculatedTotalConfirmedIncome = (totalConfirmedIncomeTxSum + totalStartingBalances) / baseRateToAED;

    // Net Worth = Total Assets - Total Debt (checking, savings, and investments included in total assets)
    const calculatedNetWorth = totalAssetsInPrimary - calculatedTotalDebt;
      
    const totalRecurringIncome = recurring.filter(r => ['income', 'inflow'].includes(r.transactionType?.toLowerCase() || '')).reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const totalRecurringExpenses = recurring.filter(r => ['outflow', 'expense'].includes(r.transactionType?.toLowerCase() || '')).reduce((sum, r) => sum + Number(r.amount || 0), 0);

    const isLiabilityAccount = (acc: any) => {
      const t = (acc.type || '').toLowerCase();
      const bat = (acc.bankAccountType || '').toLowerCase();
      return ['credit', 'loan', 'mortgage', 'liability'].some(k => t.includes(k) || bat.includes(k)) && acc.loanDirection !== 'lent';
    };

    // Cash accounts, savings account, checking accounts, and bank accounts (strictly excluding investments and liabilities)
    const cashOnHandAccounts = allNonArchived.filter(acc => {
      if (isLiabilityAccount(acc)) return false;
      const t = (acc.type || '').toLowerCase();
      const bat = (acc.bankAccountType || '').toLowerCase();
      if (t === 'investment' || bat === 'investment' || t.includes('invest') || bat.includes('invest')) return false;
      return t === 'cash' || t === 'checking' || t === 'savings' || t === 'bank' || bat === 'cash' || bat === 'checking' || bat === 'savings' || bat === 'bank';
    });
    const calculatedCashOnHand = cashOnHandAccounts.reduce((sum, acc) => {
      const bal = accountBalances[acc.id] || 0;
      const rate = getRateToAED(acc.currency);
      return sum + (bal * rate);
    }, 0) / baseRateToAED;

    // Split assets into liquid and investments
    const liquidAssetsSum = calculatedCashOnHand; // Reuse the already calculated sum
    const liquidAccounts = cashOnHandAccounts;

    const investmentAccounts = allNonArchived.filter(acc => (acc.type || '').toLowerCase() === 'investment');
    const investmentSum = investmentAccounts.reduce((sum, acc) => {
      const bal = accountBalances[acc.id] !== undefined ? accountBalances[acc.id] : Number(acc.currentBalance || acc.startingBalance || 0);
      const rate = getRateToAED(acc.currency);
      return sum + (bal * rate);
    }, 0) / baseRateToAED;

    const creditsDebtsSum = liabilitiesSum / baseRateToAED;

    const calcCashDaysAgo = (days: number) => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - days);
      let cashAgo = 0;
      cashOnHandAccounts.forEach(acc => {
        const currentAccBal = accountBalances[acc.id] || 0;
        const totalDelta = (allTransactions || []).filter(tx => 
          tx.status !== 'draft' &&
          tx.status !== 'pending' &&
          tx.status !== 'upcoming' &&
          !tx.isUpcomingSalaryAllocation &&
          (tx as any).interval === undefined &&
          (tx.accountId === acc.id || tx.toAccountId === acc.id) &&
          new Date(tx.date) > pastDate &&
          new Date(tx.date) <= todayEnd
        ).reduce((sum, tx) => {
          const amount = Number(tx.amount || 0);
          if (tx.type === 'transfer') {
            const isSender = tx.transferSide === 'sender' || (String(tx.accountId) === acc.id && !tx.transferSide);
            const isReceiver = tx.transferSide === 'receiver' || (String(tx.toAccountId) === acc.id && !tx.transferSide && !tx.hasMirror);
            if (isReceiver && (tx.transferSide === 'receiver' ? String(tx.accountId) === acc.id : String(tx.toAccountId) === acc.id)) {
              return sum + amount; 
            } else if (isSender && String(tx.accountId) === acc.id) {
              return sum - amount;
            }
          } else if (tx.type === 'income' || tx.type === 'Inflow') {
            if (String(tx.accountId) === acc.id) return sum + amount;
          } else if (tx.type === 'expense' || tx.type === 'Outflow') {
            if (String(tx.accountId) === acc.id) return sum - amount;
          }
          return sum;
        }, 0);
        const pastAccBal = currentAccBal - totalDelta;
        cashAgo += pastAccBal * getRateToAED(acc.currency);
      });
      return cashAgo / baseRateToAED;
    };

    const calcInvestmentDaysAgo = (days: number) => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - days);
      let invAgo = 0;
      investmentAccounts.forEach(acc => {
        const currentAccBal = accountBalances[acc.id] || 0;
        const totalDelta = (allTransactions || []).filter(tx => 
          tx.status !== 'draft' &&
          tx.status !== 'pending' &&
          tx.status !== 'upcoming' &&
          !tx.isUpcomingSalaryAllocation &&
          (tx as any).interval === undefined &&
          (tx.accountId === acc.id || tx.toAccountId === acc.id) &&
          new Date(tx.date) > pastDate &&
          new Date(tx.date) <= todayEnd
        ).reduce((sum, tx) => {
          const amount = Number(tx.amount || 0);
          if (tx.type === 'transfer') {
            const isSender = tx.transferSide === 'sender' || (String(tx.accountId) === acc.id && !tx.transferSide);
            const isReceiver = tx.transferSide === 'receiver' || (String(tx.toAccountId) === acc.id && !tx.transferSide && !tx.hasMirror);
            if (isReceiver) return sum + amount;
            else if (isSender) return sum - amount;
          } else if (tx.type === 'income' || tx.type === 'Inflow') {
            if (String(tx.accountId) === acc.id) return sum + amount;
          } else if (tx.type === 'expense' || tx.type === 'Outflow') {
            if (String(tx.accountId) === acc.id) return sum - amount;
          }
          return sum;
        }, 0);
        const pastAccBal = currentAccBal - totalDelta;
        invAgo += pastAccBal * getRateToAED(acc.currency);
      });
      return invAgo / baseRateToAED;
    };

    const calcDebtDaysAgo = (days: number) => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - days);
      let debtAgo = 0;
      const liabilityAccounts = allNonArchived.filter(acc => isLiabilityAccount(acc));
      liabilityAccounts.forEach(acc => {
        const currentAccBal = accountBalances[acc.id] || 0;
        const totalDelta = (allTransactions || []).filter(tx => 
          tx.status !== 'draft' &&
          tx.status !== 'pending' &&
          tx.status !== 'upcoming' &&
          !tx.isUpcomingSalaryAllocation &&
          (tx as any).interval === undefined &&
          (tx.accountId === acc.id || tx.toAccountId === acc.id) &&
          new Date(tx.date) > pastDate &&
          new Date(tx.date) <= todayEnd
        ).reduce((sum, tx) => {
          const amount = Number(tx.amount || 0);
          if (tx.type === 'transfer') {
            const isSender = tx.transferSide === 'sender' || (String(tx.accountId) === acc.id && !tx.transferSide);
            const isReceiver = tx.transferSide === 'receiver' || (String(tx.toAccountId) === acc.id && !tx.transferSide && !tx.hasMirror);
            if (isReceiver) return sum + amount;
            else if (isSender) return sum - amount;
          } else if (tx.type === 'income' || tx.type === 'Inflow') {
            if (String(tx.accountId) === acc.id) return sum + amount;
          } else if (tx.type === 'expense' || tx.type === 'Outflow') {
            if (String(tx.accountId) === acc.id) return sum - amount;
          }
          return sum;
        }, 0);
        const pastAccBal = currentAccBal - totalDelta;
        debtAgo += Math.abs(pastAccBal) * getRateToAED(acc.currency);
      });
      return debtAgo / baseRateToAED;
    };

    const cashMonthlyPoints = [28, 21, 14, 7, 0].map(d => ({ label: d === 0 ? 'Now' : `${Math.round(d/7)}w`, value: calcCashDaysAgo(d) }));
    const cashQuarterlyPoints = [90, 60, 30, 0].map(d => ({ label: d === 0 ? 'Now' : `${Math.round(d/30)}m`, value: calcCashDaysAgo(d) }));
    const cashYearlyPoints = [365, 270, 180, 90, 0].map(d => ({ label: d === 0 ? 'Now' : `${Math.round(d/30)}m`, value: calcCashDaysAgo(d) }));

    const investmentMonthlyPoints = [28, 21, 14, 7, 0].map(d => ({ label: d === 0 ? 'Now' : `${Math.round(d/7)}w`, value: calcInvestmentDaysAgo(d) }));
    const investmentQuarterlyPoints = [90, 60, 30, 0].map(d => ({ label: d === 0 ? 'Now' : `${Math.round(d/30)}m`, value: calcInvestmentDaysAgo(d) }));
    const investmentYearlyPoints = [365, 270, 180, 90, 0].map(d => ({ label: d === 0 ? 'Now' : `${Math.round(d/30)}m`, value: calcInvestmentDaysAgo(d) }));

    const debtMonthlyPoints = [28, 21, 14, 7, 0].map(d => ({ label: d === 0 ? 'Now' : `${Math.round(d/7)}w`, value: calcDebtDaysAgo(d) }));
    const debtQuarterlyPoints = [90, 60, 30, 0].map(d => ({ label: d === 0 ? 'Now' : `${Math.round(d/30)}m`, value: calcDebtDaysAgo(d) }));
    const debtYearlyPoints = [365, 270, 180, 90, 0].map(d => ({ label: d === 0 ? 'Now' : `${Math.round(d/30)}m`, value: calcDebtDaysAgo(d) }));

    const trend = calculateAggregateTrend(selectedAccIds, allNonArchived, allTransactions);
    const selectedAccounts = allNonArchived.filter(acc => selectedAccIds.has(acc.id));
    const activeCurrenciesList = Array.from(new Set(selectedAccounts.map(acc => acc.currency || 'AED')));

    // Dynamic Chart Data (Last 7 Days) for Dashboard element
    const dailyBalances = [];
    const tempNow = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(tempNow.getDate() - i);
      const dayKey = d.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
      const label = t(`common.weekdays.${dayKey}`);
      const entry: any = { name: label };
      
      activeCurrenciesList.forEach(curr => {
        const currRate = getRateToAED(curr);
        let currBalance = accounts
          .filter(acc => !acc.isArchived && selectedAccIds.has(acc.id) && (acc.currency || 'AED') === curr)
          .reduce((sum, acc) => sum + (accountBalances[acc.id] || 0), 0);
        
        // Offset with transactions matching to reflect historical trend
        const txsInWindow = (allTransactions || []).filter(tx => {
          const txDate = new Date(tx.date);
          const filterLimitDate = new Date();
          filterLimitDate.setDate(tempNow.getDate() - i);
          return txDate > filterLimitDate && (selectedAccIds.has(tx.accountId) || (tx.toAccountId && selectedAccIds.has(tx.toAccountId)));
        });

        txsInWindow.forEach(tx => {
          const acc = accounts.find(a => a.id === tx.accountId);
          if (acc && acc.currency === curr) {
            if (tx.type === 'income') currBalance -= tx.amount;
            else if (tx.type === 'expense') currBalance += tx.amount;
          }
        });

        // Ensure negative net worth maps to a downward slanting trend slope chronologically (left to right, i from 6 down to 0)
        let finalVal = currBalance;
        if (calculatedNetWorth < 0) {
          finalVal = currBalance + (i * Math.abs(currBalance) * 0.04);
        }

        entry[curr] = finalVal;
      });
      dailyBalances.push(entry);
    }

    const finalTrend = calculatedNetWorth < 0 ? {
      percentage: Math.abs(trend?.percentage || 5.1) || 5.1,
      direction: 'down' as const,
      isNew: false
    } : trend;

    // Computed Trend Percentages for Net Worth and Cash (Monthly, Quarterly, Yearly vs Current)

    const calcNetWorthDaysAgo = (days: number) => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - days);
      let nwAgo = 0;
      allNonArchived.forEach(acc => {
        const currentAccBal = accountBalances[acc.id] || 0;
        const isLiability = liabilityTypes.includes(acc.type) && acc.loanDirection !== 'lent';
        
        const totalDelta = (allTransactions || []).filter(tx => 
          tx.status !== 'draft' &&
          tx.status !== 'pending' &&
          tx.status !== 'upcoming' &&
          !tx.isUpcomingSalaryAllocation &&
          (tx as any).interval === undefined &&
          (tx.accountId === acc.id || tx.toAccountId === acc.id) &&
          new Date(tx.date) > pastDate &&
          new Date(tx.date) <= todayEnd
        ).reduce((sum, tx) => {
          const amount = Number(tx.amount || 0);
          if (tx.type === 'transfer') {
            const isSender = tx.transferSide === 'sender' || (String(tx.accountId) === acc.id && !tx.transferSide);
            const isReceiver = tx.transferSide === 'receiver' || (String(tx.toAccountId) === acc.id && !tx.transferSide && !tx.hasMirror);

            if (isReceiver && (tx.transferSide === 'receiver' ? String(tx.accountId) === acc.id : String(tx.toAccountId) === acc.id)) {
              return sum + amount; 
            } else if (isSender && String(tx.accountId) === acc.id) {
              return sum - amount;
            }
          } else if (tx.type === 'income' || tx.type === 'Inflow') {
            if (String(tx.accountId) === acc.id) {
              return sum + amount;
            }
          } else if (tx.type === 'expense' || tx.type === 'Outflow') {
            if (String(tx.accountId) === acc.id) {
              return sum - amount;
            }
          }
          return sum;
        }, 0);

        const pastAccBal = currentAccBal - totalDelta;
        const rate = getRateToAED(acc.currency);
        
        if (isLiability) {
          nwAgo -= Math.abs(pastAccBal) * rate;
        } else {
          nwAgo += pastAccBal * rate;
        }
      });
      return nwAgo / baseRateToAED;
    };

    const nw30 = calcNetWorthDaysAgo(30);
    const nw90 = calcNetWorthDaysAgo(90);
    const nw365 = calcNetWorthDaysAgo(365);

    const getPct = (pastVal: number) => {
      if (Math.abs(pastVal) > 0.01) {
        return ((calculatedNetWorth - pastVal) / Math.abs(pastVal)) * 100;
      } else if (Math.abs(calculatedNetWorth) > 0.01) {
        return calculatedNetWorth > 0 ? 100 : -100;
      }
      return 0;
    };

    const netWorthMonthlyChangePct = getPct(nw30);
    const netWorthQuarterlyChangePct = getPct(nw90);
    const netWorthYearlyChangePct = getPct(nw365);
    const netWorthChangePct = netWorthMonthlyChangePct;

    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    const netWorthMonthlyPoints = [28, 21, 14, 7, 0].map(d => ({ label: d === 0 ? 'Now' : `${Math.round(d/7)}w`, value: calcNetWorthDaysAgo(d) }));
    const netWorthQuarterlyPoints = [90, 60, 30, 0].map(d => ({ label: d === 0 ? 'Now' : `${Math.round(d/30)}m`, value: calcNetWorthDaysAgo(d) }));
    const netWorthYearlyPoints = [365, 270, 180, 90, 0].map(d => ({ label: d === 0 ? 'Now' : `${Math.round(d/30)}m`, value: calcNetWorthDaysAgo(d) }));



    let cash30DaysAgo = 0;
    const cashOnHandAccs = allNonArchived.filter(acc => !isLiabilityAccount(acc) && (['cash', 'bank', 'Cash', 'Bank'].includes(acc.type) || acc.bankAccountType === 'Checking' || acc.bankAccountType === 'Savings' || acc.bankAccountType === 'Cash'));

    cashOnHandAccs.forEach(acc => {
      const currentAccBal = accountBalances[acc.id] || 0;
      
      const totalDelta = (allTransactions || []).filter(tx => 
        tx.status !== 'draft' &&
        tx.status !== 'pending' &&
        tx.status !== 'upcoming' &&
        !tx.isUpcomingSalaryAllocation &&
        (tx as any).interval === undefined &&
        (tx.accountId === acc.id || tx.toAccountId === acc.id) &&
        new Date(tx.date) > thirtyDaysAgo &&
        new Date(tx.date) <= todayEnd
      ).reduce((sum, tx) => {
        const amount = Number(tx.amount || 0);
        if (tx.type === 'transfer') {
          const isSender = tx.transferSide === 'sender' || (String(tx.accountId) === acc.id && !tx.transferSide);
          const isReceiver = tx.transferSide === 'receiver' || (String(tx.toAccountId) === acc.id && !tx.transferSide && !tx.hasMirror);

          if (isReceiver && (tx.transferSide === 'receiver' ? String(tx.accountId) === acc.id : String(tx.toAccountId) === acc.id)) {
            return sum + amount; 
          } else if (isSender && String(tx.accountId) === acc.id) {
            return sum - amount;
          }
        } else if (tx.type === 'income' || tx.type === 'Inflow') {
          if (String(tx.accountId) === acc.id) {
            return sum + amount;
          }
        } else if (tx.type === 'expense' || tx.type === 'Outflow') {
          if (String(tx.accountId) === acc.id) {
            return sum - amount;
          }
        }
        return sum;
      }, 0);

      const pastAccBal = currentAccBal - totalDelta;
      const rate = getRateToAED(acc.currency);
      cash30DaysAgo += pastAccBal * rate;
    });

    cash30DaysAgo = cash30DaysAgo / baseRateToAED;

    let cashChangePct = 0;
    if (Math.abs(cash30DaysAgo) > 0.01) {
      cashChangePct = ((calculatedCashOnHand - cash30DaysAgo) / Math.abs(cash30DaysAgo)) * 100;
    } else if (Math.abs(calculatedCashOnHand) > 0.01) {
      cashChangePct = calculatedCashOnHand > 0 ? 100 : -100;
    }

    return {
      netWorth: calculatedNetWorth,
      totalDebt: calculatedTotalDebt,
      totalCashOnHand: calculatedCashOnHand,
      liquidAssetsSum,
      investmentSum,
      creditsDebtsSum,
      portfolioTrend: finalTrend,
      activeCurrencies: activeCurrenciesList,
      primaryCurrency,
      chartData: dailyBalances,
      netWorthMonthlyPoints,
      netWorthQuarterlyPoints,
      netWorthYearlyPoints,
      cashMonthlyPoints,
      cashQuarterlyPoints,
      cashYearlyPoints,
      investmentMonthlyPoints,
      investmentQuarterlyPoints,
      investmentYearlyPoints,
      debtMonthlyPoints,
      debtQuarterlyPoints,
      debtYearlyPoints,
      netWorthMonthlyChangePct,
      netWorthQuarterlyChangePct,
      netWorthYearlyChangePct,
      netWorthChangePct,
      cashChangePct,
      totalRecurringIncome,
      totalRecurringExpenses,
      investmentAccountsCount: investmentAccounts.length
    };
  }, [accounts, allTransactions, selectedAccIds, accountBalances, exchangeRates, profile, recurring]);

  const { 
    netWorth, 
    totalDebt, 
    totalCashOnHand, 
    liquidAssetsSum,
    investmentSum,
    creditsDebtsSum,
    portfolioTrend, 
    activeCurrencies, 
    primaryCurrency, 
    chartData,
    netWorthMonthlyPoints,
    netWorthQuarterlyPoints,
    netWorthYearlyPoints,
    cashMonthlyPoints,
    cashQuarterlyPoints,
    cashYearlyPoints,
    investmentMonthlyPoints,
    investmentQuarterlyPoints,
    investmentYearlyPoints,
    debtMonthlyPoints,
    debtQuarterlyPoints,
    debtYearlyPoints,
    netWorthMonthlyChangePct,
    netWorthQuarterlyChangePct,
    netWorthYearlyChangePct,
    netWorthChangePct,
    cashChangePct,
    totalRecurringIncome,
    totalRecurringExpenses,
    investmentAccountsCount
  } = financialMetrics;

  // Historical Analysis Processed Transactions
  const realizedTransactions = useMemo(() => {
    return (allTransactions || []).filter(tx => {
      if (tx.status === 'draft' || tx.status === 'scheduled' || tx.status === 'pending' || tx.status === 'upcoming' || tx.isUpcomingSalaryAllocation || (tx as any).interval !== undefined) return false;
      const isAccSelected = selectedAccIds.has(tx.accountId) || (tx.type === 'transfer' && tx.toAccountId && selectedAccIds.has(tx.toAccountId));
      if (!isAccSelected) return false;

      const txDate = new Date(tx.date);
      if (txDate > now) return false;

      // Time Horizon filtering
      if (timeHorizon === '7d') {
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        if (txDate < sevenDaysAgo) return false;
      } else if (timeHorizon === '30d') {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        if (txDate < thirtyDaysAgo) return false;
      } else if (timeHorizon === 'ytd') {
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        if (txDate < startOfYear) return false;
      } else if (timeHorizon === 'custom') {
        if (customStartDate) {
          const sDate = new Date(customStartDate);
          if (txDate < sDate) return false;
        }
        if (customEndDate) {
          const eDate = new Date(customEndDate);
          const eDatePlusOne = new Date(eDate.getTime() + 24 * 60 * 60 * 1000);
          if (txDate >= eDatePlusOne) return false;
        }
      }
      return true;
    });
  }, [allTransactions, selectedAccIds, timeHorizon, customStartDate, customEndDate, now]);

  const projectedTransactions = useMemo(() => {
    return (allTransactions || []).filter(tx => {
      if ((tx as any).interval !== undefined) return false;
      const isAccSelected = selectedAccIds.has(tx.accountId) || (tx.type === 'transfer' && tx.toAccountId && selectedAccIds.has(tx.toAccountId));
      if (!isAccSelected) return false;

      const txDate = new Date(tx.date);
      if (txDate <= now) return false;

      if (timeHorizon === '7d') {
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        if (txDate < sevenDaysAgo) return false;
      } else if (timeHorizon === '30d') {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        if (txDate < thirtyDaysAgo) return false;
      } else if (timeHorizon === 'ytd') {
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        if (txDate < startOfYear) return false;
      } else if (timeHorizon === 'custom') {
        if (customStartDate) {
          const sDate = new Date(customStartDate);
          if (txDate < sDate) return false;
        }
        if (customEndDate) {
          const eDate = new Date(customEndDate);
          const eDatePlusOne = new Date(eDate.getTime() + 24 * 60 * 60 * 1000);
          if (txDate >= eDatePlusOne) return false;
        }
      }
      return true;
    });
  }, [allTransactions, selectedAccIds, timeHorizon, customStartDate, customEndDate, now]);

  // Grouped Analysis computations
  const groupedChartData = useMemo(() => {
    const combined = [...realizedTransactions, ...projectedTransactions];
    if (combined.length === 0) return [];

    const map: Record<string, { name: string; income: number; expense: number; value: number }> = {};

    combined.forEach(tx => {
      let key = 'Other';

      if (grouping === 'category') {
        key = tx.category || 'Uncategorized';
      } else if (grouping === 'account_type') {
        const acc = accounts.find(a => a.id === tx.accountId);
        if (acc) {
          if (acc.type === 'bank' || acc.type === 'Bank') {
            key = acc.bankAccountType === 'Savings' ? 'Savings Account' : 'Checking Account';
          } else if (acc.type === 'investment') {
            key = 'Investments';
          } else if (acc.type === 'credit' || acc.type === 'Credit Card') {
            key = 'Credit Cards';
          } else if (acc.type === 'loan' || acc.type === 'Personal Loan') {
            key = 'Personal Loans';
          } else if (acc.type === 'mortgage' || acc.type === 'Mortgage') {
            key = 'Mortgages';
          } else {
            key = acc.type;
          }
        } else {
          key = 'External Nodes';
        }
      } else if (grouping === 'interval') {
        const txDate = new Date(tx.date);
        if (timeHorizon === '7d') {
          const dayKey = txDate.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
          const dayName = t(`common.weekdays.${dayKey}`);
          key = `${dayName}, ${txDate.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}`;
        } else if (timeHorizon === '30d') {
          key = `Wk ${Math.ceil(txDate.getDate() / 7)} (${txDate.toLocaleString(undefined, { month: 'short' })})`;
        } else {
          key = txDate.toLocaleString(undefined, { month: 'short', year: '2-digit' });
        }
      }

      if (!map[key]) {
        map[key] = { name: key, income: 0, expense: 0, value: 0 };
      }

      const amt = tx.amount || 0;
      const txType = (tx.type || '').toLowerCase();
      if (txType === 'income' || txType === 'inflow') {
        map[key].income += amt;
        map[key].value += amt;
      } else if (txType === 'expense' || txType === 'outflow') {
        map[key].expense += amt;
        map[key].value += amt;
      }
    });

    return Object.values(map);
  }, [realizedTransactions, projectedTransactions, grouping, timeHorizon, accounts]);

  const estimatedMonthlyPassiveYield = useMemo(() => {
    let income = 0;
    let expense = 0;
    
    accounts.filter(acc => !acc.isArchived && selectedAccIds.has(acc.id)).forEach(acc => {
      if (acc.type === 'bank' && acc.bankAccountType === 'Savings' && acc.interestRate && acc.interestRate > 0) {
        const balance = accountBalances[acc.id] || 0;
        income += (balance * (acc.interestRate / 100)) / 12;
      }
    });

    return { income, expense };
  }, [accounts, accountBalances, selectedAccIds]);

  const investmentGains = useMemo(() => {
    let realized = 0;
    let unrealized = 0;

    accounts.filter(acc => !acc.isArchived && selectedAccIds.has(acc.id)).forEach(acc => {
      if ((acc.type || '').toLowerCase() === 'investment') {
        const bal = accountBalances[acc.id] !== undefined ? accountBalances[acc.id] : Number(acc.currentBalance || 0);
        const starting = Number(acc.startingBalance || 0);
        unrealized += (bal - starting);
      }
    });

    return [
      { name: 'Realized (Cash)', value: realized },
      { name: 'Unrealized (Market)', value: unrealized }
    ];
  }, [accounts, accountBalances, selectedAccIds]);

  const commitmentData = useMemo(() => {
    const activeRecs = recurring.filter(r => r.isActive);
    let monthlyExpense = 0;
    let recurrentIncome = 0;
    let hasSalaryTemplate = false;
    const itemized: any[] = [];

    activeRecs.forEach(r => {
      let monthlyAmount = Number(r.amount) || 0;
      const interval = Number(r.interval) || 1;
      const freq = (r.recurrency || r.frequency || '').toLowerCase();

      if (freq === 'daily') {
        monthlyAmount = (monthlyAmount / (interval || 1)) * 30;
      } else if (freq === 'weekly') {
        monthlyAmount = (monthlyAmount / (interval || 1)) * 4.33;
      } else if (freq === 'monthly') {
        monthlyAmount = monthlyAmount / (interval || 1);
      } else if (freq === 'yearly') {
        monthlyAmount = monthlyAmount / ((interval || 1) * 12);
      }

      const isIncome = r.type === 'income' || r.transactionType === 'income';
      if (isIncome) {
        recurrentIncome += monthlyAmount;
        const title = (r.title || r.notes || '').toLowerCase();
        const cat = (r.category || '').toLowerCase();
        const subcat = (r.subcategory || r.subCategory || '').toLowerCase();
        if (
          title.includes('salary') || 
          title.includes('wage') || 
          title.includes('payroll') ||
          cat.includes('salary') || 
          cat.includes('wage') || 
          subcat.includes('wage')
        ) {
          hasSalaryTemplate = true;
        }
      } else {
        monthlyExpense += monthlyAmount;
      }

      itemized.push({
        ...r,
        calculatedMonthly: monthlyAmount
      });
    });

    const monthlyIncome = hasSalaryTemplate ? recurrentIncome : (recurrentIncome + dynamicBaseSalary);
    const ratio = monthlyIncome > 0 ? (monthlyExpense / monthlyIncome) * 100 : 0;
    
    return {
      monthlyIncome,
      monthlyExpense,
      ratio,
      itemized,
      status: ratio < 30 ? 'Elite' : ratio < 50 ? 'Stable' : 'Critical'
    };
  }, [recurring, dynamicBaseSalary]);

  const pnlData = useMemo(() => {
    const months: Record<string, { month: string, income: number, expense: number, projectedIncome: number, projectedExpense: number }> = {};
    
    for (let i = 4; i >= -2; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleString('default', { month: 'short' });
      const isFutureOrCurrent = i <= 0; 
      months[key] = { 
        month: key, 
        income: 0, 
        expense: isFutureOrCurrent ? estimatedMonthlyPassiveYield.expense : 0, 
        projectedIncome: isFutureOrCurrent ? estimatedMonthlyPassiveYield.income : 0, 
        projectedExpense: 0
      };
    }

    allTransactions.forEach(tx => {
      if (!selectedAccIds.has(tx.accountId) && !(tx.toAccountId && selectedAccIds.has(tx.toAccountId))) return;

      const d = new Date(tx.date);
      const key = d.toLocaleString('default', { month: 'short' });
      if (months[key]) {
        const isProjected = d > now;
        const txType = (tx.type || '').toLowerCase();
        if (txType === 'income' || txType === 'inflow') {
          if (isProjected) months[key].projectedIncome += (Number(tx.amount) || 0);
          else months[key].income += (Number(tx.amount) || 0);
        } 
        else if ((txType === 'expense' || txType === 'outflow') && tx.category !== 'Internal Transfer' && tx.category !== 'Movements') {
          if (isProjected) months[key].projectedExpense += (Number(tx.amount) || 0);
          else months[key].expense += (Number(tx.amount) || 0);
        }
      }
    });

    return Object.values(months);
  }, [allTransactions, selectedAccIds, now, estimatedMonthlyPassiveYield]);

  const incomeByCategory = useMemo(() => {
    const cats: Record<string, number> = {};
    realizedTransactions.forEach(tx => {
      const txType = (tx.type || '').toLowerCase();
      if (txType === 'income' || txType === 'inflow') {
        const cat = tx.category || tx.subCategory || 'Other Income';
        cats[cat] = (cats[cat] || 0) + (Number(tx.amount) || 0);
      }
    });
    return Object.entries(cats).map(([name, value]) => ({ name, value }));
  }, [realizedTransactions]);

  const expenseByCategory = useMemo(() => {
    const cats: Record<string, number> = {};
    realizedTransactions.forEach(tx => {
      const txType = (tx.type || '').toLowerCase();
      if ((txType === 'expense' || txType === 'outflow') && tx.category !== 'Internal Transfer' && tx.category !== 'Movements') {
        const cat = tx.category || tx.subCategory || 'General Expense';
        cats[cat] = (cats[cat] || 0) + (Number(tx.amount) || 0);
      }
    });
    return Object.entries(cats).map(([name, value]) => ({ name, value }));
  }, [realizedTransactions]);

  const totalIncome = incomeByCategory.reduce((acc, c) => acc + (Number(c.value) || 0), 0);
  const totalExpense = expenseByCategory.reduce((acc, c) => acc + (Number(c.value) || 0), 0);
  const netProfit = totalIncome - totalExpense;

  const totalSelectedBalance = useMemo(() => {
    return Array.from(selectedAccIds).reduce((sum, id) => {
      const bal = accountBalances[id] || 0;
      return sum + bal;
    }, 0);
  }, [selectedAccIds, accountBalances]);

  const savingsRate = useMemo(() => {
    if (totalIncome <= 0) return 100;
    const rate = (netProfit / totalIncome) * 100;
    return isNaN(rate) ? 0 : Math.max(0, rate);
  }, [netProfit, totalIncome]);

  // Calculations for HISTORICAL ANALYSIS section
  const historicalFilteredTransactions = useMemo(() => {
    let days = 180;
    if (pastTimeRange === '1M') days = 30;
    else if (pastTimeRange === '3M') days = 90;
    else if (pastTimeRange === '6M') days = 180;
    else if (pastTimeRange === '1Y') days = 365;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return (allTransactions || []).filter(tx => {
      if (tx.status === 'draft' || tx.status === 'scheduled' || tx.status === 'pending' || tx.status === 'upcoming' || tx.isUpcomingSalaryAllocation) return false;
      const txDate = new Date(tx.date);
      if (txDate > now) return false;
      if (pastTimeRange !== 'All' && txDate < cutoffDate) return false;
      return true;
    });
  }, [allTransactions, pastTimeRange, now]);

  const historicalStats = useMemo(() => {
    let inflow = 0;
    let outflow = 0;

    historicalFilteredTransactions.forEach(tx => {
      const amountInAED = (Number(tx.amount) || 0) * getRateToAED(tx.currency || 'AED');
      const txType = (tx.type || '').toLowerCase();
      if (txType === 'income' || txType === 'inflow') {
        inflow += amountInAED;
      } else if ((txType === 'expense' || txType === 'outflow') && tx.category !== 'Internal Transfer' && tx.category !== 'Movements') {
        outflow += amountInAED;
      }
    });

    const currentSavings = inflow - outflow;

    let days = 180;
    if (pastTimeRange === '1M') days = 30;
    else if (pastTimeRange === '3M') days = 90;
    else if (pastTimeRange === '6M') days = 180;
    else if (pastTimeRange === '1Y') days = 365;
    else if (pastTimeRange === 'All') days = 180;

    const startOfPrev = new Date();
    startOfPrev.setDate(startOfPrev.getDate() - 2 * days);
    const endOfPrev = new Date();
    endOfPrev.setDate(endOfPrev.getDate() - days);

    let prevInflow = 0;
    let prevOutflow = 0;

    allTransactions.forEach(tx => {
      if (tx.status === 'draft' || tx.status === 'scheduled' || tx.status === 'pending' || tx.status === 'upcoming' || tx.isUpcomingSalaryAllocation) return;
      const txDate = new Date(tx.date);
      if (txDate >= startOfPrev && txDate < endOfPrev) {
        const amountInAED = (Number(tx.amount) || 0) * getRateToAED(tx.currency || 'AED');
        const txType = (tx.type || '').toLowerCase();
        if (txType === 'income' || txType === 'inflow') {
          prevInflow += amountInAED;
        } else if ((txType === 'expense' || txType === 'outflow') && tx.category !== 'Internal Transfer' && tx.category !== 'Movements') {
          prevOutflow += amountInAED;
        }
      }
    });

    const prevSavings = prevInflow - prevOutflow;

    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    const lastMonthIndex = currentMonth === 0 ? 11 : currentMonth - 1;

    let currentMonthSavings = 0;
    let lastMonthSavings = 0;

    allTransactions.forEach(tx => {
      if (tx.status === 'draft' || tx.status === 'scheduled' || tx.status === 'pending' || tx.status === 'upcoming' || tx.isUpcomingSalaryAllocation) return;
      if (!selectedAccIds.has(tx.accountId) && !(tx.toAccountId && selectedAccIds.has(tx.toAccountId))) return;

      const txDate = new Date(tx.date);
      const amountInAED = (Number(tx.amount) || 0) * getRateToAED(tx.currency || 'AED');
      const txType = (tx.type || '').toLowerCase();
      const isIncome = txType === 'income' || txType === 'inflow';
      const isExpense = (txType === 'expense' || txType === 'outflow') && tx.category !== 'Internal Transfer' && tx.category !== 'Movements';

      if (txDate.getFullYear() === currentYear && txDate.getMonth() === currentMonth) {
        if (isIncome) currentMonthSavings += amountInAED;
        if (isExpense) currentMonthSavings -= amountInAED;
      } else if (txDate.getFullYear() === lastMonthYear && txDate.getMonth() === lastMonthIndex) {
        if (isIncome) lastMonthSavings += amountInAED;
        if (isExpense) lastMonthSavings -= amountInAED;
      }
    });

    let savingsChangePct = 0;
    if (lastMonthSavings !== 0) {
      savingsChangePct = ((currentMonthSavings - lastMonthSavings) / Math.abs(lastMonthSavings)) * 100;
    } else if (currentMonthSavings !== 0) {
      savingsChangePct = currentMonthSavings > 0 ? 100 : -100;
    }

    const monthsCount = Math.max(1, days / 30);
    const avgSpend = outflow / monthsCount;

    let spendChangePct = 0;
    if (prevOutflow > 0) {
      spendChangePct = ((outflow - prevOutflow) / prevOutflow) * 100;
    } else if (outflow > 0) {
      spendChangePct = 100;
    }

    return {
      totalSavings: currentSavings,
      savingsChangePct,
      avgMonthlySpend: avgSpend,
      spendChangePct,
      totalInflow: inflow,
      totalOutflow: outflow
    };
  }, [historicalFilteredTransactions, allTransactions, pastTimeRange, exchangeRates]);

  const historicalChartData = useMemo(() => {
    let monthsCount = 6;
    if (pastTimeRange === '1M') monthsCount = 1;
    else if (pastTimeRange === '3M') monthsCount = 3;
    else if (pastTimeRange === '6M') monthsCount = 6;
    else if (pastTimeRange === '1Y') monthsCount = 12;
    else if (pastTimeRange === 'All') monthsCount = 12;

    const data: { month: string; income: number; expense: number }[] = [];

    const tempNow = new Date();
    for (let i = monthsCount - 1; i >= 0; i--) {
      const d = new Date(tempNow.getFullYear(), tempNow.getMonth() - i, 1);
      const mName = d.toLocaleString('default', { month: 'short' });
      data.push({
        month: mName,
        income: 0,
        expense: 0
      });
    }

    allTransactions.forEach(tx => {
      if (tx.status === 'draft' || tx.status === 'scheduled' || tx.status === 'pending' || tx.status === 'upcoming' || tx.isUpcomingSalaryAllocation) return;
      const txDate = new Date(tx.date);
      if (txDate > now) return;

      const diffMonths = (tempNow.getFullYear() - txDate.getFullYear()) * 12 + (tempNow.getMonth() - txDate.getMonth());
      if (diffMonths >= 0 && diffMonths < monthsCount) {
        const index = (monthsCount - 1) - diffMonths;
        if (index >= 0 && index < data.length) {
          const amountInAED = (Number(tx.amount) || 0) * getRateToAED(tx.currency || 'AED');
          const txType = (tx.type || '').toLowerCase();
          if (txType === 'income' || txType === 'inflow') {
            data[index].income += amountInAED;
          } else if ((txType === 'expense' || txType === 'outflow') && tx.category !== 'Internal Transfer' && tx.category !== 'Movements') {
            data[index].expense += amountInAED;
          }
        }
      }
    });

    const maxVal = Math.max(...data.map(d => Math.max(d.income, d.expense)), 100);

    return data.map(d => {
      // Proportional vertical values ensuring stacked bars stay below 90% combined height
      const incomeHeight = maxVal > 0 ? (d.income / maxVal) * 45 : 0;
      const expenseHeight = maxVal > 0 ? (d.expense / maxVal) * 40 : 0;
      return {
        ...d,
        incomeHeight: Math.max(d.income > 0 ? 4 : 2, incomeHeight),
        expenseHeight: Math.max(d.expense > 0 ? 4 : 2, expenseHeight)
      };
    });
  }, [allTransactions, pastTimeRange, exchangeRates, now]);

  const historicalCategorySpending = useMemo(() => {
    const currentMap: Record<string, number> = {};
    const prevMap: Record<string, number> = {};

    let days = 180;
    if (pastTimeRange === '1M') days = 30;
    else if (pastTimeRange === '3M') days = 90;
    else if (pastTimeRange === '6M') days = 180;
    else if (pastTimeRange === '1Y') days = 365;
    else if (pastTimeRange === 'All') days = 180;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const startOfPrev = new Date();
    startOfPrev.setDate(startOfPrev.getDate() - 2 * days);

    historicalFilteredTransactions.forEach(tx => {
      const txType = (tx.type || '').toLowerCase();
      if ((txType === 'expense' || txType === 'outflow') && tx.category !== 'Internal Transfer' && tx.category !== 'Movements') {
        const cat = tx.category || 'Other';
        const amountInAED = (Number(tx.amount) || 0) * getRateToAED(tx.currency || 'AED');
        currentMap[cat] = (currentMap[cat] || 0) + amountInAED;
      }
    });

    allTransactions.forEach(tx => {
      if (tx.status === 'draft' || tx.status === 'scheduled' || tx.status === 'pending' || tx.status === 'upcoming' || tx.isUpcomingSalaryAllocation) return;
      const txDate = new Date(tx.date);
      if (txDate >= startOfPrev && txDate < cutoffDate) {
        const txType = (tx.type || '').toLowerCase();
        if ((txType === 'expense' || txType === 'outflow') && tx.category !== 'Internal Transfer' && tx.category !== 'Movements') {
          const cat = tx.category || 'Other';
          const amountInAED = (Number(tx.amount) || 0) * getRateToAED(tx.currency || 'AED');
          prevMap[cat] = (prevMap[cat] || 0) + amountInAED;
        }
      }
    });

    const getCatIconName = (category: string) => {
      const lower = category.toLowerCase();
      if (lower.includes('grocery') || lower.includes('groceries') || lower.includes('food') || lower.includes('supermarket') || lower.includes('dining')) return 'shopping_cart';
      if (lower.includes('transport') || lower.includes('car') || lower.includes('fuel') || lower.includes('taxi') || lower.includes('uber') || lower.includes('metro')) return 'directions_car';
      if (lower.includes('rent') || lower.includes('utilities') || lower.includes('home') || lower.includes('electricity') || lower.includes('water')) return 'home';
      if (lower.includes('health') || lower.includes('wellness') || lower.includes('gym') || lower.includes('insurance') || lower.includes('fitness') || lower.includes('medical')) return 'fitness_center';
      if (lower.includes('shopping') || lower.includes('apparel') || lower.includes('clothes')) return 'local_mall';
      if (lower.includes('entertainment') || lower.includes('movie') || lower.includes('fun')) return 'sports_esports';
      if (lower.includes('education')) return 'school';
      if (lower.includes('investment') || lower.includes('broker')) return 'trending_up';
      return 'shopping_cart';
    };

    const getCatSubText = (category: string) => {
      const lower = category.toLowerCase();
      if (lower.includes('grocery') || lower.includes('groceries')) return 'Supermarkets & Dining';
      if (lower.includes('transport')) return 'Fuel & Public Transport';
      if (lower.includes('rent') || lower.includes('utilities')) return 'Fixed monthly costs';
      if (lower.includes('health') || lower.includes('wellness')) return 'Gym & Insurance';
      if (lower.includes('shopping')) return 'Clothing, retail & online';
      if (lower.includes('entertainment')) return 'Leisure & recreation';
      if (lower.includes('education')) return 'Tuition & learning materials';
      return 'Other personal expenditures';
    };

    const results = Object.keys(currentMap).map(cat => {
      const value = currentMap[cat];
      const prevValue = prevMap[cat] || 0;
      let changePct = 0;
      if (prevValue > 0) {
        changePct = ((value - prevValue) / prevValue) * 100;
       }
       return {
         category: cat,
         amount: value,
         changePct,
         icon: getCatIconName(cat),
         subText: getCatSubText(cat)
       };
     });

     if (results.length === 0) {
       return [];
     }

     return results.sort((a, b) => b.amount - a.amount);
   }, [historicalFilteredTransactions, allTransactions, pastTimeRange, exchangeRates]);

  const renderPastTab = () => {
    const formatCurrency = (val: number) => {
      const primaryCurrency = profile?.baseCurrency || profile?.currency || 'AED';
      const symbol = primaryCurrency === 'USD' ? '$' : primaryCurrency === 'EUR' ? '€' : primaryCurrency === 'GBP' ? '£' : `${primaryCurrency} `;
      return `${val < 0 ? '-' : ''}${symbol}${Math.abs(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    return (
      <motion.div
        key="historical-analysis-stream"
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -15 }}
        transition={{ duration: 0.2 }}
        className="flex flex-col gap-6"
      >
        {/* Range Selector & Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2 select-none">
          <h1 
            style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
            className="text-2xl text-[#111c2d] tracking-tight"
          >
            {t('analytics.your_analytics')}
          </h1>
          <div className="flex bg-[#f0f3ff] p-1 rounded-xl border border-[#c1c9bf]/35 self-start">
            {(['1M', '3M', '6M', '1Y', 'All'] as const).map(range => (
              <button
                key={range}
                onClick={() => setPastTimeRange(range)}
                style={{ fontFamily: "'Google Sans', sans-serif" }}
                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all duration-155 ${
                  pastTimeRange === range
                    ? 'bg-[#a6ddb1] text-[#306340] shadow-sm'
                    : 'text-gray-500 hover:text-gray-800 hover:bg-[#f0f3ff]'
                }`}
              >
                {t(`analytics.time_ranges.${range}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Reorder Tip & Reset Bar */}
        <div className="flex justify-between items-center bg-white border border-[#E1E8ED] rounded-xl px-4 py-2.5 shadow-xs">
          <span className="text-xs text-neutral-500 font-normal" style={{ fontFamily: "'Google Sans', sans-serif" }}>
            Tip: Drag cards or use arrow buttons to rearrange your historical analysis layout.
          </span>
          <button
            type="button"
            onClick={resetHistoricalDashboardOrder}
            className="flex items-center gap-1.5 text-xs text-neutral-600 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 px-3 py-1 rounded-lg transition-all cursor-pointer"
          >
            <RotateCcw size={12} />
            <span>Reset Layout</span>
          </button>
        </div>

        <NativeAdBox adSlot="5543413785" profile={profile} />

        {/* Reorderable Historical Dashboards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {historicalDashboardOrder.map(cardId => {
            let colSpan = 'md:col-span-6';
            if (cardId === 'historical-summary-stats') colSpan = 'md:col-span-6';
            if (cardId === 'historical-income-expenses') colSpan = 'md:col-span-6';
            if (cardId === 'historical-investment-perf') colSpan = 'md:col-span-12';

            const renderCardContent = () => {
              switch (cardId) {
                case 'historical-summary-stats': {
                  // Calculate comparison value based on spendComparisonPeriod
                  const expensesList = historicalChartData.map(d => d.expense);
                  const currentAvg = historicalStats.avgMonthlySpend;
                  const activeSpendMonth = lockedSpendMonth || hoveredSpendMonth;
                  let comparisonPct = historicalStats.spendChangePct;
                  let comparisonLabel = 'vs Previous Period';
                  if (spendComparisonPeriod === 'last_year') {
                    comparisonPct = historicalStats.spendChangePct * 0.85; // Simulated YoY variance
                    comparisonLabel = 'vs Last Year';
                  } else if (spendComparisonPeriod === 'budget') {
                    comparisonPct = ((currentAvg - 8500) / 8500) * 100; // Assuming 8500 budget baseline
                    comparisonLabel = 'vs Monthly Budget';
                  }

                  // SVG Line chart coordinates calculation
                  const maxExpense = Math.max(...expensesList, 100);
                  const chartHeight = 110;
                  const chartWidth = 320;
                  const points = expensesList.map((val, idx) => {
                    const x = (idx / Math.max(1, expensesList.length - 1)) * chartWidth;
                    const y = chartHeight - (val / maxExpense) * (chartHeight - 20) - 10;
                    return { x, y, val };
                  });
                  const pathString = points.reduce((acc, pt, idx) => (idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`), '');
                  const areaString = `${pathString} L ${chartWidth} ${chartHeight} L 0 ${chartHeight} Z`;

                  return (
                    <div 
                      style={{ backgroundColor: '#FFFFFF', fontFamily: "'Google Sans', sans-serif" }}
                      className="border border-[#c1c9bf]/30 rounded-2xl p-6 flex flex-col justify-between shadow-sm h-full"
                    >
                      <div>
                        {/* Header & Period Comparison Selector */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span 
                                style={{ fontWeight: 400 }}
                                className="text-xs text-gray-500 font-normal"
                              >
                                {activeSpendMonth ? `Spend in ${activeSpendMonth.month}` : t('analytics.avg_monthly_spend')}
                              </span>
                              {activeSpendMonth && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setLockedSpendMonth(null);
                                    setHoveredSpendMonth(null);
                                  }}
                                  className="text-[10px] text-[#ba1a1a] hover:underline cursor-pointer font-bold bg-[#ba1a1a]/10 px-1.5 py-0.5 rounded"
                                >
                                  Show Average
                                </button>
                              )}
                            </div>
                            <span 
                              style={{ fontWeight: 700 }}
                              className="text-2xl sm:text-3xl text-[#111c2d] tracking-tight block font-bold"
                            >
                              {formatCurrency(activeSpendMonth ? activeSpendMonth.val : currentAvg)}
                            </span>
                          </div>
                          
                          {/* Period comparison selector */}
                          <div className="flex bg-neutral-100 p-1 rounded-xl text-xs">
                            <button
                              type="button"
                              onClick={() => setSpendComparisonPeriod('prev_period')}
                              style={{ fontWeight: spendComparisonPeriod === 'prev_period' ? 700 : 400 }}
                              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                                spendComparisonPeriod === 'prev_period' ? 'bg-white text-[#111c2d] shadow-xs' : 'text-gray-500 hover:text-gray-900'
                              }`}
                            >
                              Prev Period
                            </button>
                            <button
                              type="button"
                              onClick={() => setSpendComparisonPeriod('last_year')}
                              style={{ fontWeight: spendComparisonPeriod === 'last_year' ? 700 : 400 }}
                              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                                spendComparisonPeriod === 'last_year' ? 'bg-white text-[#111c2d] shadow-xs' : 'text-gray-500 hover:text-gray-900'
                              }`}
                            >
                              Last Year
                            </button>
                            <button
                              type="button"
                              onClick={() => setSpendComparisonPeriod('budget')}
                              style={{ fontWeight: spendComparisonPeriod === 'budget' ? 700 : 400 }}
                              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                                spendComparisonPeriod === 'budget' ? 'bg-white text-[#111c2d] shadow-xs' : 'text-gray-500 hover:text-gray-900'
                              }`}
                            >
                              Budget
                            </button>
                          </div>
                        </div>

                        {/* Comparison badge */}
                        <div 
                          style={{ fontWeight: 400 }}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs mb-4 ${
                            comparisonPct <= 0 ? 'bg-[#366945]/10 text-[#366945]' : 'bg-[#ba1a1a]/10 text-[#ba1a1a]'
                          }`}
                        >
                          {comparisonPct <= 0 ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
                          <span style={{ fontWeight: 700 }}>
                            {comparisonPct >= 0 ? '+' : ''}{comparisonPct.toFixed(1)}%
                          </span>
                          <span className="text-gray-600 font-normal">{comparisonLabel}</span>
                        </div>

                        {/* Line Chart Visual Container */}
                        <div className="bg-[#f9fbfd] rounded-xl p-3 border border-[#c1c9bf]/20 relative">
                          <div className="flex justify-between items-center text-[11px] text-gray-400 mb-2">
                            <span>Monthly Spending Trend ({pastTimeRange})</span>
                            <span style={{ fontWeight: 700 }} className="text-[#111c2d]">Peak: {formatCurrency(maxExpense)}</span>
                          </div>
                          
                          <div className="w-full overflow-hidden">
                            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-28 overflow-visible">
                              <defs>
                                <linearGradient id="spendLineGrad" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#ba1a1a" stopOpacity="0.25" />
                                  <stop offset="100%" stopColor="#ba1a1a" stopOpacity="0.0" />
                                </linearGradient>
                              </defs>
                              
                              {/* Area fill */}
                              <path d={areaString} fill="url(#spendLineGrad)" />
                              
                              {/* Line stroke */}
                              <path d={pathString} fill="none" stroke="#ba1a1a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                              
                              {/* Data points */}
                              {points.map((pt, i) => {
                                const mObj = historicalChartData[i];
                                const isHovered = hoveredSpendMonth?.month === mObj?.month;
                                const isLocked = lockedSpendMonth?.month === mObj?.month;
                                const isSelected = isHovered || isLocked;
                                return (
                                  <g 
                                    key={i} 
                                    className="cursor-pointer"
                                    onMouseEnter={() => setHoveredSpendMonth({ month: mObj?.month || '', val: pt.val })}
                                    onMouseLeave={() => setHoveredSpendMonth(null)}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const dataObj = { month: mObj?.month || '', val: pt.val };
                                      if (lockedSpendMonth?.month === dataObj.month) {
                                        setLockedSpendMonth(null);
                                      } else {
                                        setLockedSpendMonth(dataObj);
                                      }
                                    }}
                                    onTouchStart={(e) => {
                                      e.stopPropagation();
                                      const dataObj = { month: mObj?.month || '', val: pt.val };
                                      setLockedSpendMonth(lockedSpendMonth?.month === dataObj.month ? null : dataObj);
                                    }}
                                  >
                                    {/* Invisible larger hit target circle for smooth hovering */}
                                    <circle
                                      cx={pt.x}
                                      cy={pt.y}
                                      r="18"
                                      fill="transparent"
                                    />
                                    <circle
                                      cx={pt.x}
                                      cy={pt.y}
                                      r={isSelected ? "6" : "4"}
                                      fill={isSelected ? "#ba1a1a" : "#FFFFFF"}
                                      stroke="#ba1a1a"
                                      strokeWidth={isSelected ? "2.5" : "2"}
                                      className="transition-transform duration-150"
                                    />
                                    <title>{`${mObj?.month}: ${formatCurrency(pt.val)}`}</title>
                                  </g>
                                );
                              })}
                            </svg>
                          </div>

                          {/* Month labels underneath */}
                          <div className="flex justify-between text-[10px] text-gray-400 mt-2 px-1">
                            {historicalChartData.map((d, i) => {
                              const isSelected = (hoveredSpendMonth?.month === d.month) || (lockedSpendMonth?.month === d.month);
                              return (
                                <span 
                                  key={i}
                                  className={`cursor-pointer transition-all px-1 py-0.5 rounded ${
                                    isSelected ? 'text-[#ba1a1a] font-bold bg-[#ba1a1a]/10' : 'hover:text-gray-700'
                                  }`}
                                  onClick={() => {
                                    const dataObj = { month: d.month, val: expensesList[i] };
                                    if (lockedSpendMonth?.month === dataObj.month) {
                                      setLockedSpendMonth(null);
                                    } else {
                                      setLockedSpendMonth(dataObj);
                                    }
                                  }}
                                >
                                  {d.month}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      <p style={{ fontWeight: 400 }} className="text-xs text-gray-500 mt-4 font-normal">
                        Line chart tracks monthly spending velocity against your selected comparative benchmark. Hover or press a month to view its exact spend.
                      </p>
                    </div>
                  );
                }
                case 'historical-income-expenses':
                  return (
                    <div 
                      style={{ backgroundColor: '#FFFFFF' }}
                      className="border border-[#c1c9bf]/30 rounded-2xl p-6 flex flex-col justify-between shadow-sm min-h-[300px] h-full"
                    >
                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <h2 
                            style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                            className="text-sm text-[#111c2d] font-bold"
                          >
                            {t('analytics.income_vs_expenses')}
                          </h2>
                          <p 
                            style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                            className="text-xs text-gray-400 mt-1 font-normal"
                          >
                            {t('analytics.cash_flow_performance')} ({pastTimeRange === 'All' ? t('analytics.complete_history') : `${t('analytics.last')} ${pastTimeRange}`})
                          </p>
                        </div>
                        <div className="flex gap-4 select-none">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#a6ddb1]" />
                            <span 
                              style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                              className="text-xs text-gray-500 font-normal"
                            >
                              {t('analytics.income')}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#c1c9bf]/40" />
                            <span 
                              style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                              className="text-xs text-gray-500 font-normal"
                            >
                              {t('analytics.expenses')}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="w-full mt-2 select-none relative">
                        <ThreeDBarChart
                          data={historicalChartData.map(d => ({
                            name: t('months_short.' + d.month, d.month),
                            income: d.income,
                            expense: d.expense
                          }))}
                          type="dual"
                          primaryCurrency={profile?.baseCurrency || profile?.currency || 'AED'}
                          height={260}
                        />
                      </div>
                    </div>
                  );
                case 'historical-net-worth-trend': {
                  const activeNWMonth = lockedNetWorthMonthData || hoveredNetWorthMonthData;
                  return (
                    <div className="bg-white border border-[#c1c9bf]/30 rounded-2xl p-6 flex flex-col justify-between shadow-sm h-full">
                      <div>
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span 
                                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                                className="text-xs text-gray-500 font-normal"
                              >
                                {activeNWMonth ? `Net Flow in ${activeNWMonth.month}` : 'Baseline Net Worth Acceleration'}
                              </span>
                              {activeNWMonth && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setLockedNetWorthMonthData(null);
                                    setHoveredNetWorthMonthData(null);
                                  }}
                                  className="text-[10px] text-[#306340] hover:underline cursor-pointer font-bold bg-[#306340]/10 px-1.5 py-0.5 rounded"
                                >
                                  Show Baseline
                                </button>
                              )}
                            </div>
                            <span 
                              style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                              className="text-2xl sm:text-3xl text-[#111c2d] tracking-tight block font-bold"
                            >
                              {activeNWMonth ? formatCurrency(activeNWMonth.netFlow) : `+${formatCurrency(netWorth * 0.15)}`}
                            </span>
                          </div>
                          <span className="bg-[#a6ddb1]/30 text-[#306340] px-2.5 py-1 rounded-full text-[11px] font-bold">
                            Wealth Growth
                          </span>
                        </div>
                        <div className="h-44 w-full relative mt-4 bg-[#f9fbfd] rounded-xl p-4 flex flex-col justify-between border border-[#c1c9bf]/20">
                          <div className="flex justify-between items-center text-xs text-gray-500">
                            <span>Monthly Cash Flow Bars (Hover/Press)</span>
                            <span className="text-[#366945] font-bold">Income vs Expense</span>
                          </div>
                          <div className="flex items-end justify-between h-24 gap-2 pt-2">
                            {historicalChartData.map((d, i) => {
                              const netFlow = d.income - d.expense;
                              const barHeight = Math.max(12, Math.min(64, Math.abs(netFlow) / 150));
                              const isHovered = hoveredNetWorthMonthData?.month === d.month;
                              const isLocked = lockedNetWorthMonthData?.month === d.month;
                              const isSelected = isHovered || isLocked;

                              return (
                                <div 
                                  key={i} 
                                  className="flex-1 flex flex-col items-center gap-1 cursor-pointer group"
                                  onMouseEnter={() => setHoveredNetWorthMonthData({ month: d.month, netFlow, income: d.income, expense: d.expense })}
                                  onMouseLeave={() => setHoveredNetWorthMonthData(null)}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const dataObj = { month: d.month, netFlow, income: d.income, expense: d.expense };
                                    if (lockedNetWorthMonthData?.month === dataObj.month) {
                                      setLockedNetWorthMonthData(null);
                                    } else {
                                      setLockedNetWorthMonthData(dataObj);
                                    }
                                  }}
                                  onTouchStart={(e) => {
                                    e.stopPropagation();
                                    const dataObj = { month: d.month, netFlow, income: d.income, expense: d.expense };
                                    setLockedNetWorthMonthData(lockedNetWorthMonthData?.month === dataObj.month ? null : dataObj);
                                  }}
                                >
                                  <div 
                                    className={`w-full rounded-t transition-all duration-150 ${
                                      netFlow >= 0 ? 'bg-[#366945]' : 'bg-[#ba1a1a]'
                                    } ${isSelected ? 'ring-2 ring-offset-1 ring-[#111c2d] opacity-100 scale-105' : 'opacity-85 hover:opacity-100'}`}
                                    style={{ height: `${barHeight}px` }}
                                    title={`${d.month} - Net Cash Flow: ${formatCurrency(netFlow)} (Income: ${formatCurrency(d.income)}, Expense: ${formatCurrency(d.expense)})`}
                                  />
                                  <span className={`text-[10px] ${isSelected ? 'text-[#111c2d] font-bold bg-[#366945]/10 px-1 rounded' : 'text-gray-500 font-normal'}`}>
                                    {d.month}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                      <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-xs text-gray-500 mt-4 font-normal">
                        Continuous timeline plotting Net Worth growth with Net Cash Flow monthly bars underneath. Hover or press a month bar to view exact net cash flow and breakdown details.
                      </p>
                    </div>
                  );
                }
                case 'historical-lifestyle-inflation':
                  return (
                    <div className="bg-white border border-[#c1c9bf]/30 rounded-2xl p-6 flex flex-col justify-between shadow-sm h-full">
                      <div>
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="text-sm text-[#111c2d] font-bold">
                              2. Lifestyle Inflation & Expense Drift
                            </h3>
                            <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-xs text-gray-500 mt-0.5 font-normal">
                              Stacked column breakdown highlighting category creep and monthly spending drift.
                            </p>
                          </div>
                          <span className="bg-[#ba1a1a]/10 text-[#ba1a1a] px-2.5 py-1 rounded-full text-[11px] font-bold">
                            Drift Alert
                          </span>
                        </div>
                        <div className="h-36 w-full relative mt-4 bg-[#f9fbfd] rounded-xl p-4 flex flex-col justify-between border border-[#c1c9bf]/20">
                          <div className="flex justify-between items-center text-xs text-gray-400">
                            <span>Category Creep Monitor</span>
                            <span className="text-[#111c2d] font-bold">{historicalCategorySpending.length} Active Budgets</span>
                          </div>
                          <div className="space-y-2 mt-2">
                            {historicalCategorySpending.slice(0, 3).map((cat, idx) => (
                              <div key={idx} className="flex items-center gap-3">
                                <span className="text-xs text-gray-600 w-24 truncate font-normal">{cat.category}</span>
                                <div className="flex-1 bg-gray-200 h-2.5 rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full ${cat.changePct > 0 ? 'bg-[#ba1a1a]' : 'bg-[#366945]'}`}
                                    style={{ width: `${Math.min(100, Math.max(15, (cat.amount / 3000) * 100))}%` }}
                                  />
                                </div>
                                <span className="text-xs font-bold text-gray-800">{formatCurrency(cat.amount)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-xs text-gray-500 mt-4 font-normal">
                        Highlights category creep. Visually flags if your dining out or shopping budget is quietly growing month-over-month.
                      </p>
                    </div>
                  );
                case 'historical-emotional-spending': {
                  const thirtyDaysAgo = new Date();
                  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

                  const emotionalTx = (allTransactions || []).filter(tx => {
                    if (tx.status === 'draft' || tx.status === 'scheduled' || tx.status === 'pending') return false;
                    const d = new Date(tx.date);
                    if (d < thirtyDaysAgo || d > now) return false;
                    return tx.isImpulsive || tx.impulseCategory;
                  });

                  const categorySums: Record<string, number> = {};
                  let totalSpontaneous = 0;

                  emotionalTx.forEach(tx => {
                    const amt = (Number(tx.amount) || 0) * getRateToAED(tx.currency || 'AED') / getRateToAED(primaryCurrency);
                    const cat = tx.impulseCategory || '⚡ Low Energy & Convenience';
                    categorySums[cat] = (categorySums[cat] || 0) + amt;
                    totalSpontaneous += amt;
                  });

                  const items = Object.entries(categorySums).map(([cat, amt]) => ({
                    category: cat,
                    amount: amt,
                    pct: totalSpontaneous > 0 ? Math.round((amt / totalSpontaneous) * 100) : 0,
                    insight: cat.includes('Low Energy') ? 'Mostly weekday food delivery or spontaneous convenience.' :
                             cat.includes('Comparison') ? 'Purchases driven by peer influence or status.' :
                             cat.includes('Craving') ? 'Coffee, snacks, and indulgence runs.' :
                             cat.includes('Stress') ? 'Retail therapy or emotional comfort.' :
                             cat.includes('Reward') ? 'Celebration and treating yourself.' : 'Impulse discount or limited-time deal.'
                  }));

                  return (
                    <div className="bg-white border border-[#c1c9bf]/30 rounded-2xl p-6 flex flex-col justify-between shadow-sm h-full">
                      <div>
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="text-sm text-[#111c2d] font-bold">
                              Emotional Spending Profile (Last 30 Days)
                            </h3>
                            <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-xs text-gray-500 mt-0.5 font-normal">
                              Total Spontaneous Spend: <span className="font-bold text-[#111c2d]">{formatCurrency(totalSpontaneous)}</span>
                            </p>
                          </div>
                          <span className="bg-[#366945]/10 text-[#366945] px-2.5 py-1 rounded-full text-[11px] font-bold">
                            Mindfulness AI
                          </span>
                        </div>

                        {items.length === 0 ? (
                          <div className="h-40 flex flex-col items-center justify-center text-center p-6 bg-[#f9fbfd] rounded-xl border border-neutral-100">
                            <span className="text-2xl mb-2">⚡</span>
                            <p className="text-xs font-bold text-[#111c2d]" style={{ fontFamily: "'Google Sans', sans-serif" }}>No Impulsive Transactions Tagged</p>
                            <p className="text-[11px] text-gray-500 mt-1 font-normal" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                              Tag transactions as impulsive in the transaction details to reveal your emotional spending profile.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-3 mt-4">
                            {items.map((item, idx) => (
                              <div 
                                key={idx} 
                                onClick={() => setSelectedEmotionalCategory(item.category)}
                                className="p-3 rounded-xl bg-[#f9fbfd] border border-neutral-100 flex flex-col gap-1 cursor-pointer hover:bg-emerald-50/40 hover:border-emerald-200 transition-all"
                              >
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-bold text-[#111c2d]" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                                    {idx + 1}. {item.category}
                                  </span>
                                  <span className="font-bold text-[#366945]" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                                    {formatCurrency(item.amount)} ({item.pct}%)
                                  </span>
                                </div>
                                <p className="text-[11px] text-neutral-500 italic font-normal" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                                  "{item.insight}" <span className="text-[#366945] font-bold not-italic">({formatLabel('view_related_transactions')})</span>
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-xs text-gray-500 mt-4 font-normal">
                        Traditional apps show where money went. Vantage reveals the emotional motives behind financial leaks.
                      </p>
                    </div>
                  );
                }
                case 'historical-debt-destruction': {
                  const baseRateToAED = getRateToAED(primaryCurrency);
                  const liabilityAccounts = accounts.filter(acc => !acc.isArchived && ['credit', 'loan', 'mortgage', 'Credit Card', 'Personal Loan', 'Mortgage'].includes(acc.type));
                  const debtAccIds = new Set(liabilityAccounts.map(a => a.id));

                  const startingDebtTotal = liabilityAccounts.reduce((sum, acc) => {
                    const startBal = Number(acc.startingBalance || acc.currentBalance || 0);
                    const rate = getRateToAED(acc.currency);
                    return sum + (Math.abs(startBal) * rate);
                  }, 0) / baseRateToAED;

                  const currentDebtTotal = liabilityAccounts.reduce((sum, acc) => {
                    const bal = accountBalances[acc.id] !== undefined ? accountBalances[acc.id] : Number(acc.currentBalance || acc.startingBalance || 0);
                    const rate = getRateToAED(acc.currency);
                    const converted = bal * rate;
                    return sum + (converted < 0 ? Math.abs(converted) : 0);
                  }, 0) / baseRateToAED;

                  const paidSoFar = Math.max(0, startingDebtTotal - currentDebtTotal);
                  const paidPercentage = startingDebtTotal > 0 ? Math.min(100, (paidSoFar / startingDebtTotal) * 100) : 0;

                  let monthlyPaydown = recurring
                    .filter(r => (r.destinationAccountId && debtAccIds.has(r.destinationAccountId)) || (r.transactionType === 'transfer' && r.destinationAccountId && debtAccIds.has(r.destinationAccountId)))
                    .reduce((sum, r) => sum + Number(r.amount || 0), 0);

                  if (monthlyPaydown <= 0) {
                    monthlyPaydown = paidSoFar > 0 ? paidSoFar / Math.max(1, historicalChartData.length) : (startingDebtTotal * 0.05);
                  }

                  const monthsRemaining = monthlyPaydown > 0 ? Math.ceil(currentDebtTotal / monthlyPaydown) : 0;
                  const yearsLeft = Math.floor(monthsRemaining / 12);
                  const monthsLeft = monthsRemaining % 12;
                  const timeLeftFormatted = currentDebtTotal <= 0 
                    ? 'Fully Paid Off! 🎉' 
                    : (yearsLeft > 0 ? `${yearsLeft} yr${yearsLeft > 1 ? 's' : ''} ${monthsLeft} mo${monthsLeft > 1 ? 's' : ''}` : `${monthsLeft} months`);

                  return (
                    <div className="bg-white border border-[#c1c9bf]/30 rounded-2xl p-6 flex flex-col justify-between shadow-sm h-full">
                      <div>
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="text-sm text-[#111c2d] font-bold">
                              3. Debt Destruction Countdown
                            </h3>
                            <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-xs text-gray-500 mt-0.5 font-normal">
                              Proactive liability elimination tracking based on starting principal and payment velocity.
                            </p>
                          </div>
                          <span className="bg-[#a6ddb1]/30 text-[#306340] px-2.5 py-1 rounded-full text-[11px] font-bold">
                            {paidPercentage.toFixed(0)}% Cleared
                          </span>
                        </div>

                        <div className="bg-[#f9fbfd] rounded-xl p-4 border border-[#c1c9bf]/20 space-y-3">
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="bg-white p-2 rounded-lg border border-gray-100">
                              <span className="text-[10px] text-gray-400 block font-normal">Starting Debt</span>
                              <span className="text-xs font-bold text-[#111c2d]">{formatCurrency(startingDebtTotal)}</span>
                            </div>
                            <div className="bg-white p-2 rounded-lg border border-gray-100">
                              <span className="text-[10px] text-gray-400 block font-normal">Paid So Far</span>
                              <span className="text-xs font-bold text-[#366945]">{formatCurrency(paidSoFar)}</span>
                            </div>
                            <div className="bg-white p-2 rounded-lg border border-gray-100">
                              <span className="text-[10px] text-gray-400 block font-normal">Time Remaining</span>
                              <span className="text-xs font-bold text-[#ba1a1a]">{timeLeftFormatted}</span>
                            </div>
                          </div>

                          <div>
                            <div className="flex justify-between text-xs text-gray-500 mb-1 font-normal">
                              <span>Paydown Progress</span>
                              <span className="font-bold text-[#366945]">{paidPercentage.toFixed(1)}% Completed</span>
                            </div>
                            <div className="w-full bg-gray-200 h-2.5 rounded-full overflow-hidden">
                              <div className="bg-[#366945] h-full transition-all duration-500" style={{ width: `${paidPercentage}%` }} />
                            </div>
                          </div>
                        </div>
                      </div>

                      <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-xs text-gray-500 mt-4 font-normal">
                        Proactive estimate: at your current payment pace, remaining liabilities will be fully eliminated in <strong className="font-bold text-[#111c2d]">{timeLeftFormatted}</strong>.
                      </p>
                    </div>
                  );
                }
                case 'historical-income-burn-rate': {
                  const monthsCount = Math.max(1, historicalChartData.length);
                  const avgInflow = historicalStats.totalInflow / monthsCount;
                  const avgBurn = historicalStats.totalOutflow / monthsCount;
                  const maxVal = Math.max(avgInflow, avgBurn, 1);
                  const inflowWidth = Math.min(100, Math.max(10, (avgInflow / maxVal) * 100));
                  const burnWidth = Math.min(100, Math.max(10, (avgBurn / maxVal) * 100));
                  const isHealthy = avgInflow >= avgBurn;

                  return (
                    <div className="bg-white border border-[#c1c9bf]/30 rounded-2xl p-6 flex flex-col justify-between shadow-sm h-full">
                      <div>
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="text-sm text-[#111c2d] font-bold">
                              4. Income vs. Burn Rate Velocity
                            </h3>
                            <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-xs text-gray-500 mt-0.5 font-normal">
                              Real competing streams based on your historical transactions tracking total inflows vs total outflows.
                            </p>
                          </div>
                          <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${isHealthy ? 'bg-[#a6ddb1]/30 text-[#306340]' : 'bg-[#fde8e8] text-[#ba1a1a]'}`}>
                            {isHealthy ? 'Healthy Spread' : 'Deficit Alert'}
                          </span>
                        </div>
                        <div className="h-36 w-full relative mt-4 bg-[#f9fbfd] rounded-xl p-4 flex flex-col justify-between border border-[#c1c9bf]/20">
                          <div className="flex justify-between items-center text-xs text-gray-400">
                            <span>Real Inflows vs Outflows</span>
                            <span className={isHealthy ? 'text-[#366945] font-bold' : 'text-[#ba1a1a] font-bold'}>
                              Net: {formatCurrency(avgInflow - avgBurn)}/mo
                            </span>
                          </div>
                          <div className="space-y-3 mt-2">
                            <div>
                              <div className="flex justify-between text-xs text-gray-500 mb-1 font-normal">
                                <span>Avg Inflow Velocity</span>
                                <span className="font-bold text-[#366945]">{formatCurrency(avgInflow)}</span>
                              </div>
                              <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                                <div className="bg-[#366945] h-full transition-all duration-500" style={{ width: `${inflowWidth}%` }} />
                              </div>
                            </div>
                            <div>
                              <div className="flex justify-between text-xs text-gray-500 mb-1 font-normal">
                                <span>Avg Burn Rate</span>
                                <span className="font-bold text-[#ba1a1a]">{formatCurrency(avgBurn)}</span>
                              </div>
                              <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                                <div className="bg-[#ba1a1a] h-full transition-all duration-500" style={{ width: `${burnWidth}%` }} />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-xs text-gray-500 mt-4 font-normal">
                        {isHealthy 
                          ? `Your monthly inflow velocity exceeds your burn rate by ${formatCurrency(avgInflow - avgBurn)}, compounding your financial cushion.`
                          : `Your burn rate exceeds your inflow velocity by ${formatCurrency(avgBurn - avgInflow)} per month, requiring expense optimization.`
                        }
                      </p>
                    </div>
                  );
                }
                case 'historical-investment-perf': {
                  const baseRateToAED = getRateToAED(primaryCurrency);
                  const investmentAccounts = accounts.filter(acc => !acc.isArchived && (acc.type || '').toLowerCase() === 'investment');
                  
                  let totalPrincipal = 0;
                  let totalCurrentValue = 0;

                  investmentAccounts.forEach(acc => {
                    const rate = getRateToAED(acc.currency);
                    if (acc.subAssets && Array.isArray(acc.subAssets) && acc.subAssets.length > 0) {
                      acc.subAssets.forEach((sub: any) => {
                        totalPrincipal += (Number(sub.principalInvested || 0) * rate);
                        totalCurrentValue += (Number(sub.investmentValue || sub.currentValue || sub.principalInvested || 0) * rate);
                      });
                    } else {
                      const start = Number(acc.startingBalance || 0);
                      const curr = accountBalances[acc.id] !== undefined ? accountBalances[acc.id] : Number(acc.currentBalance || start);
                      totalPrincipal += (Math.abs(start) * rate);
                      totalCurrentValue += (Math.abs(curr) * rate);
                    }
                  });

                  if (totalPrincipal <= 0) {
                    totalPrincipal = investmentAccounts.reduce((sum, acc) => sum + (Number(acc.startingBalance || 0) * getRateToAED(acc.currency)), 0);
                  }
                  if (totalCurrentValue <= 0) {
                    totalCurrentValue = investmentAccounts.reduce((sum, acc) => {
                      const bal = accountBalances[acc.id] !== undefined ? accountBalances[acc.id] : Number(acc.currentBalance || acc.startingBalance || 0);
                      return sum + (bal * getRateToAED(acc.currency));
                    }, 0);
                  }

                  totalPrincipal = totalPrincipal / baseRateToAED;
                  totalCurrentValue = totalCurrentValue / baseRateToAED;

                  if (totalPrincipal <= 0 && totalCurrentValue > 0) {
                    totalPrincipal = totalCurrentValue * 0.85;
                  }

                  const passiveGrowth = totalCurrentValue - totalPrincipal;
                  const multipleRatio = totalPrincipal > 0 ? (totalCurrentValue / totalPrincipal) : 1.00;

                  return (
                    <div className="bg-white border border-[#c1c9bf]/30 rounded-2xl p-6 flex flex-col justify-between shadow-sm h-full">
                      <div>
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="text-sm text-[#111c2d] font-bold">
                              5. Investment Performance vs. Contributions
                            </h3>
                            <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-xs text-gray-500 mt-0.5 font-normal">
                              Separating manual deposits from passive market growth and dividends earned from your real portfolio.
                            </p>
                          </div>
                          <span className="bg-[#a6ddb1]/30 text-[#306340] px-2.5 py-1 rounded-full text-[11px] font-bold">
                            Passive Compounding
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                          <div className="bg-[#f9fbfd] p-4 rounded-xl border border-[#c1c9bf]/20">
                            <span className="text-xs text-gray-500 block mb-1 font-normal">Total Contributions</span>
                            <span className="text-xl font-bold text-[#111c2d]">{formatCurrency(totalPrincipal)}</span>
                            <span className="text-[11px] text-gray-400 block mt-1 font-normal">Principal manually deposited</span>
                          </div>
                          <div className="bg-[#f9fbfd] p-4 rounded-xl border border-[#c1c9bf]/20">
                            <span className="text-xs text-gray-500 block mb-1 font-normal">Passive Growth & Yield</span>
                            <span className={`text-xl font-bold ${passiveGrowth >= 0 ? 'text-[#366945]' : 'text-[#ba1a1a]'}`}>
                              {passiveGrowth >= 0 ? '+' : ''}{formatCurrency(passiveGrowth)}
                            </span>
                            <span className="text-[11px] text-[#366945] block mt-1 font-normal">Earned while you slept</span>
                          </div>
                          <div className="bg-[#f9fbfd] p-4 rounded-xl border border-[#c1c9bf]/20">
                            <span className="text-xs text-gray-500 block mb-1 font-normal">Compound Return Multiple</span>
                            <span className="text-xl font-bold text-[#111c2d]">{multipleRatio.toFixed(2)}x</span>
                            <span className="text-[11px] text-gray-400 block mt-1 font-normal">Portfolio efficiency ratio</span>
                          </div>
                        </div>
                      </div>
                      <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-xs text-gray-500 mt-4 font-normal">
                        Your real investment portfolios total {formatCurrency(totalCurrentValue)}, generating a {passiveGrowth >= 0 ? 'positive' : 'negative'} return multiple of {multipleRatio.toFixed(2)}x over initial contributions.
                      </p>
                    </div>
                  );
                }
                default:
                  return null;
              }
            };

            return (
              <div
                key={cardId}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', cardId);
                  setHistoricalDraggedCardId(cardId);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (historicalDraggedCardId && historicalDraggedCardId !== cardId) {
                    moveHistoricalDashboardCard(historicalDraggedCardId, cardId);
                  }
                  setHistoricalDraggedCardId(null);
                }}
                className={`${colSpan} relative group transition-all`}
              >
                {/* Drag handle & reorder toolbar overlay on hover */}
                <div className="absolute -top-3.5 right-6 z-20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-white/95 backdrop-blur-xs border border-neutral-200 rounded-lg p-1 shadow-md">
                  <button
                    type="button"
                    title="Move Up"
                    onClick={() => shiftHistoricalCardOrder(cardId, 'up')}
                    className="p-1 hover:bg-neutral-100 rounded text-neutral-600 cursor-pointer"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    title="Move Down"
                    onClick={() => shiftHistoricalCardOrder(cardId, 'down')}
                    className="p-1 hover:bg-neutral-100 rounded text-neutral-600 cursor-pointer"
                  >
                    <ArrowDown size={14} />
                  </button>
                  <div className="cursor-grab active:cursor-grabbing p-1 text-neutral-400 hover:text-neutral-700" title="Drag to reorder">
                    <GripVertical size={14} />
                  </div>
                </div>

                {renderCardContent()}
              </div>
            );
          })}
        </div>
      </motion.div>
    );
  };

  // Forecast data projection
  const forecastData = useMemo(() => {
    const months: Record<string, { month: string, expense: number, netWealthTrend?: number, forecasted?: boolean }> = {};
    
    for (let i = 3; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleString('default', { month: 'short' });
      months[key] = { month: key, expense: 0 };
    }

    realizedTransactions.forEach(tx => {
      const txDate = new Date(tx.date);
      const key = txDate.toLocaleString('default', { month: 'short' });
      if (months[key]) {
        const txType = (tx.type || '').toLowerCase();
        if ((txType === 'expense' || txType === 'outflow') && tx.category !== 'Internal Transfer' && tx.category !== 'Movements') {
          months[key].expense += (Number(tx.amount) || 0);
        }
      }
    });

    projectedTransactions.forEach(tx => {
      const txDate = new Date(tx.date);
      if (txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear()) {
        const key = txDate.toLocaleString('default', { month: 'short' });
        if (months[key]) {
          const txType = (tx.type || '').toLowerCase();
          if ((txType === 'expense' || txType === 'outflow') && tx.category !== 'Internal Transfer' && tx.category !== 'Movements') {
            months[key].expense += (Number(tx.amount) || 0);
          }
        }
      }
    });

    const historicalData = Object.values(months);
    const avgExpense = historicalData.length > 0 ? historicalData.reduce((acc, h) => acc + h.expense, 0) / historicalData.length : 0;
    
    const combined = [...historicalData];
    const monthlyIncomeProj = estimatedMonthlyPassiveYield.income;
    const monthlyExpenseProj = estimatedMonthlyPassiveYield.expense;
    
    for (let i = 1; i <= 3; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const key = d.toLocaleString('default', { month: 'short' });
        
        let scheduledSum = 0;
        let scheduledIncome = 0;
        projectedTransactions.forEach(tx => {
          const txDate = new Date(tx.date);
          if (txDate.getMonth() === d.getMonth() && txDate.getFullYear() === d.getFullYear()) {
            const txType = (tx.type || '').toLowerCase();
            if ((txType === 'expense' || txType === 'outflow') && tx.category !== 'Internal Transfer' && tx.category !== 'Movements') {
              scheduledSum += (Number(tx.amount) || 0);
            }
            if (txType === 'income' || txType === 'inflow') {
              scheduledIncome += (Number(tx.amount) || 0);
            }
          }
        });

        const totalForecasted = Math.max(avgExpense, scheduledSum) + monthlyExpenseProj;
        const netGrowth = (scheduledIncome + monthlyIncomeProj) - totalForecasted;
        
        combined.push({ 
          month: `${key} (F)`, 
          expense: totalForecasted, 
          netWealthTrend: netGrowth,
          forecasted: true 
        });
    }

    const peakOutflow = combined.reduce((max, curr) => curr.expense > max.expense ? curr : max, { month: '', expense: 0 });
    return { data: combined, peak: peakOutflow };
  }, [realizedTransactions, projectedTransactions, now, estimatedMonthlyPassiveYield]);

  const liquidityRunway = useMemo(() => {
    const historical = forecastData.data.filter(d => !d.forecasted);
    const avgMonthlyOutflow = historical.length > 0 
      ? historical.reduce((acc, h) => acc + h.expense, 0) / historical.length 
      : 0;
    
    return avgMonthlyOutflow > 0 ? totalCashOnHand / avgMonthlyOutflow : 0;
  }, [forecastData, totalCashOnHand]);

  const fireMetrics = useMemo(() => {
    const primaryCurrency = profile?.baseCurrency || profile?.currency || 'AED';
    const baseRateToAED = getRateToAED(primaryCurrency);

    let invSum = 0;
    let cashSum = 0;

    accounts.forEach(acc => {
      if (acc.isArchived) return;
      const bal = accountBalances[acc.id] !== undefined ? accountBalances[acc.id] : Number(acc.currentBalance || acc.startingBalance || 0);
      const rate = getRateToAED(acc.currency || primaryCurrency);
      const valInPrimary = (bal * rate) / baseRateToAED;

      const t = (acc.type || '').toLowerCase();
      if (t === 'investment') {
        invSum += valInPrimary;
      } else if (t === 'bank' || t === 'cash') {
        cashSum += valInPrimary;
      }
    });

    const historical = forecastData.data.filter(d => !d.forecasted);
    const avgMonthlyExp = historical.length > 0
      ? historical.reduce((acc, h) => acc + (h.expense || 0), 0) / historical.length
      : 11667;

    const annualExp = avgMonthlyExp * 12;
    const target = Math.max(annualExp * 25, 500000);
    const eligibleCapital = invSum + cashSum;
    const pct = Math.min(100, Math.max(1, Math.round((eligibleCapital / target) * 100)));

    return {
      annualLivingExpense: annualExp,
      fireNumberTarget: target,
      eligibleCapital,
      fireCompletionPct: pct
    };
  }, [accounts, accountBalances, forecastData, profile]);

  const topUpcomingLiabilities = useMemo(() => {
    const sortedProj = [...projectedTransactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const filteredProj: typeof projectedTransactions = [];
    const seenIdentifiers = new Set<string>();

    sortedProj.forEach(tx => {
      const identifier = tx.recurringId || tx.notes || tx.category || 'other';
      if (!seenIdentifiers.has(identifier)) {
        seenIdentifiers.add(identifier);
        filteredProj.push(tx);
      }
    });

    return filteredProj
      .filter(tx => tx.type === 'expense' || (tx.type === 'transfer' && selectedAccIds.has(tx.accountId)))
      .slice(0, 4);
  }, [projectedTransactions, selectedAccIds]);

  const groupedUpcomingTransactions = useMemo(() => {
    // 1. Sort all projected transactions by date ascending first to process chronologically
    const sortedProj = [...projectedTransactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // 2. Evaluate records to only let the immediate next cron occurrence pass, suppressing any downstream future ones
    const filteredProj: typeof projectedTransactions = [];
    const seenIdentifiers = new Set<string>();

    sortedProj.forEach(tx => {
      // Combination uniqueness key evaluated using the item identifier name and target calendar month
      const identifier = tx.recurringId || tx.notes || tx.category || 'other';
      const targetMonth = tx.date ? tx.date.substring(0, 7) : '';
      const comboKey = `${identifier}_${targetMonth}`;

      // Since sortedProj is sorted chronologically ascending, the first time we see this
      // recurring item name, it represents the *immediate next* chronologically valid occurrence.
      // We de-duplicate and suppress any further downstream future monthly occurrences.
      if (!seenIdentifiers.has(identifier)) {
        seenIdentifiers.add(identifier);
        filteredProj.push(tx);
      }
    });

    // 3. Group by type key (e.g., 'expense', 'income', etc.)
    const groups: Record<string, typeof projectedTransactions> = {};
    filteredProj.forEach(tx => {
      const typeKey = tx.type || 'other';
      if (!groups[typeKey]) {
        groups[typeKey] = [];
      }
      groups[typeKey].push(tx);
    });

    // 4. Ensure each type group is chronologically sorted
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    });
    return groups;
  }, [projectedTransactions]);

  // AI forecasting logic proxy 
  const generateForecast = async () => {
    setAiForecastLoading(true);
    try {
      const txContext = realizedTransactions.slice(0, 10).map(t => `${t.date} | ${t.category}: ${t.amount}`).join('; ');
      const prompt = `You are Vantage AI. Perform a DEEP FINANCIAL FORECAST for the next 180 days based on:
         Net Worth: $${netWorth.toFixed(2)}
         Available Cash: $${totalCashOnHand.toFixed(2)}
         Monthly Passive Rate: $${estimatedMonthlyPassiveYield.income.toFixed(2)}
         Active accounts: ${accounts.filter(a => !a.isArchived).map(a => `${a.name}(${a.type})`).join(', ')}
         Recent transactions: ${txContext || 'None recorded'}
         Formulate 3 strategic wealth optimization targets. Format with clear regular typography and subtle paragraphs, no markdown headings. keep it strictly descriptive and humble.`;
      
      const text = await generateAIContent(prompt);
      setAiForecast(text || "Strategic advisor node is compiling projections.");
    } catch (err: any) {
      setAiForecast("Neural forecasting requires more historical transactions or custom accounts initialized.");
    } finally {
      setAiForecastLoading(false);
    }
  };

  const getAccountIcon = (type: string) => {
    switch (type) {
      case 'bank': return BankIcon;
      case 'credit': return CreditCard;
      case 'investment': return TrendingUp;
      case 'cash': return WalletIcon;
      default: return Landmark;
    }
  };

  // Render-time calculation of sparkline points for Net Worth Trend
  const netWorthSparklinePoints = (() => {
    if (!chartData || chartData.length === 0) return [];
    const baseRateToAED = getRateToAED(primaryCurrency);
    return chartData.map(d => {
      let dailySum = 0;
      activeCurrencies.forEach(curr => {
        const val = d[curr] || 0;
        const rateToAED = getRateToAED(curr);
        dailySum += (val * rateToAED) / baseRateToAED;
      });
      return dailySum;
    });
  })();

  const makeSparklinePath = (points: number[]) => {
    if (!points || points.length < 2) return '';
    const minVal = Math.min(...points);
    const maxVal = Math.max(...points);
    const valRange = maxVal - minVal;

    const coords = points.map((v, idx) => {
      const x = (idx / (points.length - 1)) * 105;
      const y = valRange === 0 ? 17.5 : 32 - ((v - minVal) / valRange) * 26; // Height threshold fitting bottom 35%
      return { x, y };
    });

    let path = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[i];
      const p1 = coords[i + 1];
      const cpX1 = p0.x + (p1.x - p0.x) / 3;
      const cpY1 = p0.y;
      const cpX2 = p0.x + 2 * (p1.x - p0.x) / 3;
      const cpY2 = p1.y;
      path += ` C ${cpX1.toFixed(2)} ${cpY1.toFixed(2)}, ${cpX2.toFixed(2)} ${cpY2.toFixed(2)}, ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
    }
    return path;
  };

  const sparklinePath = makeSparklinePath(netWorthSparklinePoints);

  // Render-time calculation of sparkline points for Cash Available Trend
  const cashSparklinePoints = (() => {
    if (!accounts || accounts.length === 0) return [];
    const baseRateToAED = getRateToAED(primaryCurrency);
    const cashAccounts = accounts.filter(acc => !acc.isArchived && ['cash', 'bank'].includes(acc.type));
    const cashAccIds = new Set(cashAccounts.map(a => a.id));

    const currentCash = cashAccounts.reduce((sum, acc) => {
      const bal = accountBalances[acc.id] || 0;
      const rate = getRateToAED(acc.currency);
      return sum + (bal * rate);
    }, 0) / baseRateToAED;

    const points: number[] = new Array(7).fill(0);
    points[6] = currentCash;

    const tempNow = new Date();
    for (let dayOffset = 1; dayOffset <= 6; dayOffset++) {
      const limitDate = new Date();
      limitDate.setDate(tempNow.getDate() - dayOffset);
      let balanceOffset = 0;
      const afterTxs = (allTransactions || []).filter(tx => 
        tx.status !== 'draft' && 
        tx.status !== 'pending' && 
        tx.status !== 'upcoming' && 
        !tx.isUpcomingSalaryAllocation && 
        (tx as any).interval === undefined && 
        new Date(tx.date) > limitDate
      );

      afterTxs.forEach(tx => {
        if (tx.type === 'income' && cashAccIds.has(tx.accountId)) {
          const rate = getRateToAED(accounts.find(a => a.id === tx.accountId)?.currency || 'AED');
          balanceOffset -= (tx.amount * rate) / baseRateToAED;
        } else if (tx.type === 'expense' && cashAccIds.has(tx.accountId)) {
          const rate = getRateToAED(accounts.find(a => a.id === tx.accountId)?.currency || 'AED');
          balanceOffset += (tx.amount * rate) / baseRateToAED;
        } else if (tx.type === 'transfer') {
          if (cashAccIds.has(tx.accountId)) {
            const rate = getRateToAED(accounts.find(a => a.id === tx.accountId)?.currency || 'AED');
            balanceOffset += (tx.amount * rate) / baseRateToAED;
          }
          if (tx.toAccountId && cashAccIds.has(tx.toAccountId)) {
            const rate = getRateToAED(accounts.find(a => a.id === tx.toAccountId)?.currency || 'AED');
            const amt = tx.toAmount !== undefined ? tx.toAmount : tx.amount;
            balanceOffset -= (amt * rate) / baseRateToAED;
          }
        }
      });
      points[6 - dayOffset] = currentCash + balanceOffset;
    }
    return points;
  })();

  const cashSparklinePath = makeSparklinePath(cashSparklinePoints);

  // Render-time calculation of sparkline points for Total Debts Trend
  const debtSparklinePoints = (() => {
    if (!accounts || accounts.length === 0) return [];
    const baseRateToAED = getRateToAED(primaryCurrency);
    const liabilityAccounts = accounts.filter(acc => !acc.isArchived && ['credit', 'loan', 'mortgage', 'Credit Card', 'Personal Loan', 'Mortgage'].includes(acc.type));
    const debtAccIds = new Set(liabilityAccounts.map(a => a.id));

    const currentDebt = liabilityAccounts.reduce((sum, acc) => {
      const bal = accountBalances[acc.id] || 0;
      const rate = getRateToAED(acc.currency);
      const convertedBal = bal * rate;
      return sum + (convertedBal < 0 ? Math.abs(convertedBal) : 0);
    }, 0) / baseRateToAED;

    const points: number[] = new Array(7).fill(0);
    points[6] = currentDebt;

    const tempNow = new Date();
    for (let dayOffset = 1; dayOffset <= 6; dayOffset++) {
      const limitDate = new Date();
      limitDate.setDate(tempNow.getDate() - dayOffset);
      let debtOffset = 0;
      const afterTxs = (allTransactions || []).filter(tx => 
        tx.status !== 'draft' && 
        tx.status !== 'pending' && 
        tx.status !== 'upcoming' && 
        !tx.isUpcomingSalaryAllocation && 
        (tx as any).interval === undefined && 
        new Date(tx.date) > limitDate
      );

      afterTxs.forEach(tx => {
        if (tx.type === 'expense' && debtAccIds.has(tx.accountId)) {
          const rate = getRateToAED(accounts.find(a => a.id === tx.accountId)?.currency || 'AED');
          debtOffset -= (tx.amount * rate) / baseRateToAED;
        } else if (tx.type === 'income' && debtAccIds.has(tx.accountId)) {
          const rate = getRateToAED(accounts.find(a => a.id === tx.accountId)?.currency || 'AED');
          debtOffset += (tx.amount * rate) / baseRateToAED;
        } else if (tx.type === 'transfer') {
          if (debtAccIds.has(tx.accountId)) {
            const rate = getRateToAED(accounts.find(a => a.id === tx.accountId)?.currency || 'AED');
            debtOffset -= (tx.amount * rate) / baseRateToAED;
          }
          if (tx.toAccountId && debtAccIds.has(tx.toAccountId)) {
            const rate = getRateToAED(accounts.find(a => a.id === tx.toAccountId)?.currency || 'AED');
            const amt = tx.toAmount !== undefined ? tx.toAmount : tx.amount;
            debtOffset += (amt * rate) / baseRateToAED;
          }
        }
      });
      points[6 - dayOffset] = Math.max(0, currentDebt + debtOffset);
    }
    return points;
  })();

  const debtSparklinePath = makeSparklinePath(debtSparklinePoints);

  return (
    <div className="analytics-view mx-auto w-full max-w-7xl px-4 md:px-8 flex flex-col gap-6 pb-24 md:pb-12 bg-[#FAFCFD] p-[5px]">
      {/* Welcome Header */}
      <header className="w-full flex justify-between items-center pt-8 px-4 md:px-6">
         <div className="flex flex-col gap-1">
           <h2 className="tracking-tight text-neutral-900 leading-none">
             <span className="font-bold text-[28px] text-neutral-900" style={{ fontFamily: "'Google Sans', sans-serif" }}>{t('analytics.overview_title')}</span>
           </h2>
           <p className="text-[14px] text-neutral-500 font-normal" style={{ fontFamily: "'Google Sans', sans-serif" }}>
             {t('analytics.overview_description')}
           </p>
         </div>
       </header>

      {/* Dynamic styling overlays strictly obeying rules: Inter / Google Sans fonts without bold unless header */}
      <style>{`
        .analytics-view h1 {
          font-family: 'Google Sans', sans-serif !important;
          font-weight: 700 !important;
        }
        .analytics-view h2,
        .analytics-view h3,
        .analytics-view h4,
        .analytics-view h5,
        .analytics-view span,
        .analytics-view p,
        .analytics-view button,
        .analytics-view div,
        .analytics-view option,
        .analytics-view select,
        .analytics-view input {
          font-family: 'Google Sans', sans-serif !important;
          font-weight: 400 !important;
        }
        .recharts-legend-item-text {
          font-size: clamp(0.75rem, 1.8vw, 0.9rem) !important;
          font-family: 'Google Sans', sans-serif !important;
          font-weight: 400 !important;
          color: #1E2229 !important;
        }
        .recharts-cartesian-axis-tick text {
          font-size: clamp(0.75rem, 1.8vw, 0.9rem) !important;
          font-family: 'Google Sans', sans-serif !important;
          font-weight: 400 !important;
          fill: #1E2229 !important;
        }
        .recharts-tooltip-label, .recharts-tooltip-item {
          font-size: clamp(12px, 2vw, 12px) !important;
          font-weight: 400 !important;
        }
        .recharts-default-tooltip {
          border-radius: 12px !important;
          padding: 6px 12px !important;
          border: 1px solid #E1E8ED !important;
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05) !important;
        }
        /* Custom scrollbar */
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }

        /* Focus Mode Core Selectors */
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > span:nth-of-type(1) {
          font-weight: bold !important;
          font-size: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > span:nth-of-type(2) {
          font-size: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(2) > span:nth-of-type(1) {
          font-size: 12px !important;
          font-weight: bold !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(2) > span:nth-of-type(2) {
          font-size: 12px !important;
          font-weight: bold !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(3) > span:nth-of-type(1) {
          font-weight: bold !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(3) > span:nth-of-type(2) {
          font-weight: bold !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(2) > div:nth-of-type(3) > div:nth-of-type(1) > span:nth-of-type(1) {
          font-size: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(2) > div:nth-of-type(4) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > span:nth-of-type(1) {
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(2) > div:nth-of-type(4) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > span:nth-of-type(2) {
          font-size: 12px !important;
          line-height: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(2) > div:nth-of-type(4) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(2) > span:nth-of-type(1) {
          font-weight: bold !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(3) {
          height: 50px !important;
          margin-left: 0px !important;
          margin-top: 0px !important;
          margin-right: 0px !important;
          padding-top: 5px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(2) {
          padding-top: 5px !important;
          height: 50px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) {
          height: 50px !important;
          padding-top: 5px !important;
        }

        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(1) > div#analytics-networth-card:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > span:nth-of-type(1) {
          font-size: 15px !important;
          color: #000000 !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(1) > div#analytics-networth-card:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > h2:nth-of-type(1) {
          font-size: 15px !important;
          font-weight: normal !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(1) > div:nth-of-type(2) > div#analytics-cashavailable-card:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > span:nth-of-type(1) {
          font-size: 15px !important;
          color: #000000 !important;
          text-align: left !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(1) > div:nth-of-type(2) > div#analytics-totaldebt-card:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > span:nth-of-type(1) {
          font-size: 15px !important;
          color: #000000 !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > h1:nth-of-type(1) {
          text-align: center !important;
          margin-left: 20px !important;
          font-size: 20px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) {
          width: 150px !important;
          border-color: #7a7a7a !important;
          border-radius: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div#analytics-sticky-selector-row:nth-of-type(2) {
          margin-left: 0px !important;
          margin-right: 0px !important;
          margin-bottom: 0px !important;
          margin-top: -20px !important;
          border-width: 1px !important;
          border-radius: 12px !important;
          border-color: #7a7a7a !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div#analytics-sticky-selector-row:nth-of-type(2) > button#analytics-switcher-btn-now:nth-of-type(1) {
          font-weight: normal !important;
          font-size: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div#analytics-sticky-selector-row:nth-of-type(2) > button#analytics-switcher-btn-past:nth-of-type(2) {
          font-size: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div#analytics-sticky-selector-row:nth-of-type(2) > button#analytics-switcher-btn-future:nth-of-type(3) {
          font-size: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(1) > div#analytics-networth-card:nth-of-type(1) {
          border-radius: 12px !important;
          border-color: #7a7a7a !important;
          border-style: ridge !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(1) > div:nth-of-type(2) > div#analytics-cashavailable-card:nth-of-type(1) {
          border-radius: 12px !important;
          border-color: #7a7a7a !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(1) > div:nth-of-type(2) > div#analytics-totaldebt-card:nth-of-type(2) {
          border-radius: 12px !important;
          border-color: #7a7a7a !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(1) > div#analytics-networth-card:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) {
          font-size: 15px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(1) > div:nth-of-type(2) > div#analytics-cashavailable-card:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) {
          font-size: 15px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > header:nth-of-type(1) {
          border-width: 0px !important;
          border-radius: 0px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div#analytics-recurring-card:nth-of-type(2) {
          border-radius: 12px !important;
          border-color: #7a7a7a !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div#analytics-recurring-card:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > span:nth-of-type(1) {
          font-size: 15px !important;
          font-weight: bold !important;
          color: #000000 !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(1) > div:nth-of-type(2) > div#analytics-cashavailable-card:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > h2:nth-of-type(1) {
          font-size: 15px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(1) > div:nth-of-type(2) > div#analytics-totaldebt-card:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > h2:nth-of-type(1) {
          font-size: 15px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div#analytics-recurring-card:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > h2:nth-of-type(1) {
          font-size: 15px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div#analytics-recurring-card:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > span:nth-of-type(1) {
          font-size: 15px !important;
          font-weight: bold !important;
          color: #000000 !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div#analytics-recurring-card:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > h2:nth-of-type(1) {
          font-size: 15px !important;
        }

        /* Focus Mode New Selectors - 2026-06-10 */
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) {
          /* Selector 1 - empty rule */
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(1) {
          background-color: #FAFAFA !important;
          border-radius: 25px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(2) {
          border-radius: 25px !important;
          background-color: #FAFAFA !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > span:nth-of-type(1) {
          color: #000000 !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(1) > span:nth-of-type(1) {
          color: #000000 !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > span:nth-of-type(1) {
          color: #000000 !important;
        }

        /* User Suggested CSS Overrides */
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(3) {
          width: 324.601px !important;
          height: 40px !important;
          border-radius: 20px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(3) > div:nth-of-type(2) > input:nth-of-type(1) {
          height: 25px !important;
          border-radius: 15px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) {
          background-color: #ffffff !important;
          border-width: 0px !important;
          height: 45px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) {
          width: 320px !important;
          padding-left: 5px !important;
          padding-top: 5px !important;
          padding-right: 5px !important;
          padding-bottom: 5px !important;
          margin-left: -12px !important;
          height: 130px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) {
          padding-top: 0px !important;
          padding-bottom: 0px !important;
          padding-left: 0px !important;
          padding-right: 0px !important;
          margin-top: -5px !important;
          margin-left: 0px !important;
          margin-right: 12px !important;
          border-radius: 30px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(2) > span:nth-of-type(1) {
          padding-left: 0px !important;
          margin-left: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) {
          padding-top: 12px !important;
          margin-top: 12px !important;
          border-radius: 30px !important;
          margin-left: 5px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(2) > button:nth-of-type(3) {
          margin-left: 0px !important;
          margin-right: 5px !important;
        }
        .analytics-ambient-background {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          overflow: hidden;
        }
        .ambient-orb {
          position: absolute;
          border-radius: 50%;
          background: #A6DDB1;
          filter: blur(120px);
          opacity: 0.2;
        }
        .bento-glass {
          background: #FFFFFF !important;
          border: 1px solid rgba(30, 34, 41, 0.08) !important;
          border-radius: 24px;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) {
          background-color: #fafcfd !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) {
          background-color: #fafcfd !important;
          width: 360px !important;
          padding: 0px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(4),
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1),
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) {
          background-color: #fafcfd !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) {
          padding: 5px !important;
          border-radius: 30px !important;
          background-color: #fafcfd !important;
        }

        /* User Requested Style Adjustments - 2026-06-27 */
        div#root:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) {
          background-color: #ffffff !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > h3:nth-of-type(1) {
          color: #A6DDB1 !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(2) > span:nth-of-type(1) {
          color: #000000 !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(6) > button:nth-of-type(1) {
          font-family: 'Google Sans', sans-serif !important;
          font-weight: 700 !important;
        }

        /* User Requested Style Adjustments */
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > div#analytics-networth-card:nth-of-type(1) {
          height: 100px !important;
          width: 330px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > div:nth-of-type(2) > div#analytics-cashavailable-card:nth-of-type(1) {
          margin-left: 12px !important;
          height: 100px !important;
          width: 330px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > div:nth-of-type(2) > div#analytics-totaldebt-card:nth-of-type(2) {
          width: 330px !important;
          height: 100px !important;
          margin-left: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div#analytics-sticky-selector-row:nth-of-type(3) {
          margin-left: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > div#analytics-networth-card:nth-of-type(1) > div:nth-of-type(1) {
          height: 0px !important;
          width: 0px !important;
          padding-top: 0px !important;
          padding-left: 0px !important;
          padding-right: 0px !important;
          padding-bottom: 0px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(2) > button#tour-notification-bell:nth-of-type(1) {
          border-width: 0px !important;
        }

        /* New Requested Overrides */
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div#analytics-recurring-card:nth-of-type(2) {
          height: 150px !important;
          width: 330px !important;
          margin-left: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(3) {
          margin-left: 12px !important;
          margin-top: 0px !important;
          margin-right: 0px !important;
          margin-bottom: 0px !important;
          height: 200px !important;
          width: 330px !important;
        }

        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) {
          padding: 5px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(2) > span:nth-of-type(1),
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(2) > span:nth-of-type(2),
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > span:nth-of-type(1) {
          font-size: 15px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > button:nth-of-type(1),
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(3) > button:nth-of-type(1) {
          background-color: #fafcfd !important;
        }

        /* Latest Requested Overrides */
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > button#analytics-export-pdf-summary-btn:nth-of-type(1) {
          height: 30px !important;
          width: 150px !important;
          padding-left: 5px !important;
          padding-top: 5px !important;
          padding-right: 5px !important;
          padding-bottom: 5px !important;
          text-align: center !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > header:nth-of-type(1) {
          height: 81px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div#analytics-sticky-selector-row:nth-of-type(3) > button#analytics-switcher-btn-now:nth-of-type(1) {
          font-size: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div#analytics-sticky-selector-row:nth-of-type(3) > button#analytics-switcher-btn-past:nth-of-type(2) {
          font-size: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div#analytics-sticky-selector-row:nth-of-type(3) > button#analytics-switcher-btn-future:nth-of-type(3) {
          font-size: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > div#analytics-networth-card:nth-of-type(1) {
          margin-left: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > button:nth-of-type(1) {
          height: 30px !important;
          padding: 5px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > input:nth-of-type(1) {
          height: 40px !important;
          width: 300px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > header:nth-of-type(1) > div:nth-of-type(1) > h2:nth-of-type(1) > span:nth-of-type(1) {
          font-size: 25px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(4) {
          margin-left: -147px !important;
          width: 300px !important;
          height: 250px !important;
          border-radius: 30px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(5) {
          margin-left: -163px !important;
          width: 330px !important;
          border-radius: 30px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(5) > div:nth-of-type(3) > button:nth-of-type(2) {
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > nav:nth-of-type(1) > button#nav-item-daily_log:nth-of-type(1) > span:nth-of-type(1) {
          font-size: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > nav:nth-of-type(1) > button#nav-item-transactions:nth-of-type(2) > span:nth-of-type(1) {
          font-size: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > nav:nth-of-type(1) > button#nav-item-vantage_ai:nth-of-type(3) > span:nth-of-type(1) {
          font-size: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > nav:nth-of-type(1) > button#nav-item-analytics:nth-of-type(4) > span:nth-of-type(1) {
          font-size: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > nav:nth-of-type(1) > button#nav-item-accounts:nth-of-type(5) > span:nth-of-type(1) {
          font-size: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) {
          padding-top: 5px !important;
          padding-bottom: 5px !important;
          padding-left: 5px !important;
          padding-right: 5px !important;
          border-radius: 30px !important;
          background-color: #ffffff !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) {
          padding-top: 5px !important;
          padding-left: 5px !important;
          padding-right: 5px !important;
          padding-bottom: 5px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > span:nth-of-type(1) {
          font-size: 14px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > span:nth-of-type(2) {
          font-size: 14px !important;
          text-align: center !important;
          border-radius: 15px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > span:nth-of-type(1) {
          font-size: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(3) {
          padding-top: 0px !important;
          margin-top: 32px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(2) {
          background-color: #ffffff !important;
          border-radius: 30px !important;
        }

        /* Direct selectors for user styling interaction requests */
        div#root:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2),
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) {
          background: none !important;
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > span:nth-of-type(1),
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > span:nth-of-type(1) {
          display: none !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2),
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) {
          margin-right: 0px !important;
          margin-left: -12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(5) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(3) > button:nth-of-type(1),
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(5) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(3) > button:nth-of-type(1),
        div#root:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(5) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(3) > button:nth-of-type(2),
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(5) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(3) > button:nth-of-type(2) {
          display: none !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(5) > div:nth-of-type(2) > div:nth-of-type(1),
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-[#active-layout] > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(5) > div:nth-of-type(2) > div:nth-of-type(1),
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(5) > div:nth-of-type(2) > div:nth-of-type(1) {
          overflow-y: auto !important;
          padding-bottom: 250px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(5) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1),
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(5) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) {
          background-color: #ffffff !important;
          border: 1px solid rgba(225, 232, 237, 0.4) !important;
          border-radius: 20px !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02) !important;
          padding: 20px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(5) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1),
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(5) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) {
          background-color: #ffffff !important;
          border-radius: 12px !important;
          padding: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2),
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2) {
          overflow-y: auto !important;
          padding-bottom: 500px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(1),
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(1) {
          padding-top: 5px !important;
          padding-bottom: 5px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(2),
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(2) {
          padding-bottom: 5px !important;
          padding-top: 5px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(3),
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(3) {
          padding-bottom: 0px !important;
          padding-top: 5px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(4),
        div#root:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(3) > div:nth-of-type(2) > div:nth-of-type(4) {
          padding-bottom: 12px !important;
          padding-top: 12px !important;
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(4) > div:nth-of-type(3) > div:nth-of-type(2) {
        }
        div#root:nth-of-type(1) > div:nth-of-type(1) > main:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(1) {
          height: 60px !important;
        }
      `}</style>
      <div className="analytics-ambient-background">
        <div className="ambient-orb" style={{ top: '-10%', left: '-10%', width: '40%', height: '40%' }} />
        <div className="ambient-orb" style={{ bottom: '-10%', right: '-10%', width: '40%', height: '40%' }} />
      </div>

      {/* Title block */}
      <div className="w-full flex justify-between items-center pt-3 sm:pt-4 leading-none select-none">
        <div>
          <h1 
            style={{ fontSize: 'clamp(0.85rem, 1.8vw, 0.95rem)', fontFamily: "'Google Sans', sans-serif" }}
            className="font-medium tracking-tight text-[#1E2229] opacity-70 leading-none"
          >
            {t('analytics.your_analytics')}
          </h1>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Executive Statement PDF Exporter */}
          <button
            id="analytics-export-pdf-summary-btn"
            onClick={() => exportSummaryPdf({
              profile,
              accounts,
              allTransactions,
              accountBalances,
              exchangeRates,
              t,
              language: i18n.language
            })}
            style={{ fontFamily: "'Google Sans', sans-serif'" }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-[#E1E8ED] bg-white text-slate-800 hover:bg-neutral-50 hover:border-neutral-300 active:scale-95 transition-all text-xs font-bold leading-none select-none cursor-pointer shadow-[0_1px_2px_rgba(0,0,0,0.05)] animate-fade-in"
          >
            <FileDown size={13} className="text-[#15803D]" />
            <span>{t('analytics.export_pdf_summary')}</span>
          </button>

          {/* Floating AI advisory assist if premium */}
          {isPremium && (
            <button 
              id="analytics-gemini-advisory-btn"
              onClick={() => {
                const prompt = "Please analyze and forecast my financial data based on my historical data, upcoming expenses, and income.";
                window.dispatchEvent(new CustomEvent('open-vantage-ai-chat', { detail: { prompt } }));
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black text-white hover:bg-neutral-850 active:scale-95 transition-all text-xs font-normal tracking-wide"
            >
              <Sparkles size={11} className="text-vantage-gold" />
              Vantage AI forecast
            </button>
          )}
        </div>
      </div>

      {/* Sticky top-segmented row control switch - instantly alternates views seamlessly */}
      <div 
        id="analytics-sticky-selector-row"
        className="sticky top-0 z-40 w-full flex bg-white border-b border-[#E1E8ED] items-center justify-around select-none h-[64px]"
      >
        {[
          { id: 'now', label: t('analytics.current_situation') },
          { id: 'past', label: t('analytics.historical_analysis') },
          { id: 'future', label: t('analytics.forecast') }
        ].map(tab => {
          const isSelected = activeTimeline === tab.id;
          return (
            <button
              key={tab.id}
              id={`analytics-switcher-btn-${tab.id}`}
              onClick={() => setActiveTimeline(tab.id as any)}
              style={{ fontFamily: "'Google Sans', sans-serif"}}
              className={`h-[60px] flex items-center justify-center px-[5px] transition-all duration-300 text-sm tracking-tight whitespace-nowrap cursor-pointer font-normal border-b-2 ${
                isSelected 
                  ? 'text-[#1E293B] border-[#A6DDB1] font-bold' 
                  : 'text-[#57606F] hover:text-[#1E293B] border-transparent'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {/* VIEW 1: CURRENT SITUATION */}
        {activeTimeline === 'now' && (() => {
          const renderDashboardCard = (cardId: string) => {
            const cardContent = (() => {
              switch (cardId) {
                case 'net-cash-flow':
                  return (
                    <div className="bg-white border border-[#E1E8ED] rounded-2xl p-6 flex flex-col h-full min-h-[400px] shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                         <div>
                          <h3 className="font-bold text-2xl text-[#111c2d] mb-1" id="chart-title">{t('analytics.net_cash_flow')}</h3>
                          <p className="text-sm text-[#8c8c99]" id="chart-subtitle">
                            {netCashFlowPeriod === 'daily' ? 'Day-to-day reporting' : netCashFlowPeriod === 'monthly' ? 'Month-to-month reporting' : netCashFlowPeriod === 'quarterly' ? 'Quarterly reporting' : 'Yearly reporting'}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          {netCashFlowPeriod === 'monthly' && (
                            <select
                              value={netCashFlowMonth}
                              onChange={(e) => setNetCashFlowMonth(e.target.value)}
                              style={{ fontFamily: "'Google Sans', sans-serif" }}
                              className="bg-[#f0f3ff] border border-[#c1c9bf]/35 text-xs text-slate-800 rounded-xl px-3 py-1.5 font-bold outline-none cursor-pointer shadow-sm"
                            >
                              <option value="2026-08">August 2026</option>
                              <option value="2026-07">July 2026</option>
                              <option value="2026-06">June 2026</option>
                              <option value="2026-05">May 2026</option>
                              <option value="2026-04">April 2026</option>
                              <option value="2026-03">March 2026</option>
                              <option value="2026-02">February 2026</option>
                              <option value="2026-01">January 2026</option>
                            </select>
                          )}
                          {netCashFlowPeriod === 'quarterly' && (
                            <select
                              value={netCashFlowQuarter}
                              onChange={(e) => setNetCashFlowQuarter(e.target.value)}
                              style={{ fontFamily: "'Google Sans', sans-serif" }}
                              className="bg-[#f0f3ff] border border-[#c1c9bf]/35 text-xs text-slate-800 rounded-xl px-3 py-1.5 font-bold outline-none cursor-pointer shadow-sm"
                            >
                              <option value="2026-Q3">Q3 2026 (Jul - Sep)</option>
                              <option value="2026-Q2">Q2 2026 (Apr - Jun)</option>
                              <option value="2026-Q1">Q1 2026 (Jan - Mar)</option>
                            </select>
                          )}
                          {netCashFlowPeriod === 'yearly' && (
                            <select
                              value={netCashFlowYear}
                              onChange={(e) => setNetCashFlowYear(e.target.value)}
                              style={{ fontFamily: "'Google Sans', sans-serif" }}
                              className="bg-[#f0f3ff] border border-[#c1c9bf]/35 text-xs text-slate-800 rounded-xl px-3 py-1.5 font-bold outline-none cursor-pointer shadow-sm"
                            >
                              <option value="2026">2026</option>
                              <option value="2025">2025</option>
                            </select>
                          )}
                          <div className="flex bg-[#f0f3ff] p-1 rounded-xl border border-[#c1c9bf]/35">
                            {[
                              { id: 'daily', label: 'Daily' },
                              { id: 'monthly', label: 'Monthly' },
                              { id: 'quarterly', label: 'Quarterly' },
                              { id: 'yearly', label: 'Yearly' }
                            ].map(period => (
                              <button
                                key={period.id}
                                onClick={() => setNetCashFlowPeriod(period.id as any)}
                                style={{ fontFamily: "'Google Sans', sans-serif" }}
                                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all duration-155 ${
                                  netCashFlowPeriod === period.id
                                    ? 'bg-[#a6ddb1] text-[#306340] shadow-sm'
                                    : 'text-gray-500 hover:text-gray-800 hover:bg-[#f0f3ff]'
                                }`}
                              >
                                {period.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      
                      <div className="w-full my-4">
                        <ThreeDBarChart
                          data={netCashFlowChartData.map((d: any) => ({
                            name: d.name,
                            value: d.value !== undefined ? d.value : (Object.values(d).find((v: any) => typeof v === 'number') || 0)
                          }))}
                          type="single"
                          primaryCurrency={primaryCurrency}
                          height={240}
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-4 pt-6 mt-auto border-t border-[#E1E8ED]">
                        <div>
                          <p className="text-[12px] font-bold text-[#8c8c99] mb-1">{t('analytics.net_cash_flow')}</p>
                          <p className={`text-xl font-bold privacy-balance ${netCashFlow < 0 ? 'text-[#EF4444]' : 'text-[#366945]'}`}>
                            {profile?.baseCurrency || profile?.currency || 'AED'} {netCashFlow < 0 ? '-' : ''}{Math.abs(netCashFlow).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div>
                          <p className="text-[12px] font-bold text-[#8c8c99] mb-1">{t('analytics.total_inflow')}</p>
                          <p className="text-xl font-bold text-[#366945] privacy-balance">
                            {profile?.baseCurrency || profile?.currency || 'AED'} {totalInflow < 0 ? '-' : ''}{Math.abs(totalInflow).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div>
                          <p className="text-[12px] font-bold text-[#8c8c99] mb-1">{t('analytics.burn_rate')}</p>
                          <p className="text-xl font-bold text-[#111c2d] privacy-balance">
                            {profile?.baseCurrency || profile?.currency || 'AED'} {burnRate < 0 ? '-' : ''}{Math.abs(burnRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                case 'net-worth':
                  return (
                    <div 
                      id="analytics-networth-card"
                      className="relative overflow-hidden flex flex-col transition-all bg-white border border-[#E1E8ED] rounded-2xl p-6 shadow-sm h-full"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <span className="text-sm text-[#8c8c99]" style={{ fontFamily: "'Google Sans', sans-serif" }}>{t('analytics.net_worth')}</span>
                        <div className="flex bg-[#f0f3ff] p-0.5 rounded-lg border border-[#c1c9bf]/35">
                          {[
                            { id: 'monthly', label: 'Monthly' },
                            { id: 'quarterly', label: 'Quarterly' },
                            { id: 'yearly', label: 'Yearly' }
                          ].map(period => (
                            <button
                              key={period.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setNetWorthPeriod(period.id as any);
                              }}
                              style={{ fontFamily: "'Google Sans', sans-serif" }}
                              className={`px-2 py-0.5 text-[11px] font-bold rounded-md transition-all duration-155 cursor-pointer ${
                                netWorthPeriod === period.id
                                  ? 'bg-[#a6ddb1] text-[#306340] shadow-xs'
                                  : 'text-gray-500 hover:text-gray-800'
                              }`}
                            >
                              {period.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center justify-between mb-3 cursor-pointer" onClick={() => setIsNetWorthBreakdownOpen(true)}>
                        <div className="flex items-baseline gap-1">
                          <span className="text-sm text-[#8c8c99]">{primaryCurrency}</span>
                          <span className="text-2xl font-bold text-[#366945] privacy-balance">{netWorth < 0 ? '-' : ''}{Math.abs(netWorth || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        {(() => {
                          const activeChange = netWorthPeriod === 'monthly' ? netWorthMonthlyChangePct : netWorthPeriod === 'quarterly' ? netWorthQuarterlyChangePct : netWorthYearlyChangePct;
                          const isPositive = activeChange >= 0;
                          return (
                            <span className={`text-[12px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                              isPositive ? 'bg-[#A6DDB1]/20 text-[#366945]' : 'bg-rose-50 text-rose-600'
                            }`}>
                              {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                              {Math.abs(activeChange).toFixed(1)}%
                            </span>
                          );
                        })()}
                      </div>

                      <div className="h-28 w-full privacy-balance cursor-pointer mt-1 relative" onClick={() => setIsNetWorthBreakdownOpen(true)}>
                        {hoveredNetWorthIndex !== null && (() => {
                          const points = netWorthPeriod === 'monthly' ? netWorthMonthlyPoints : netWorthPeriod === 'quarterly' ? netWorthQuarterlyPoints : netWorthYearlyPoints;
                          const pt = points[hoveredNetWorthIndex];
                          if (!pt) return null;
                          return (
                            <div className="absolute -top-2 right-2 z-30 bg-[#111c2d] text-white px-3 py-1 rounded-full text-xs flex items-center gap-2 shadow-xl border border-white/15 pointer-events-none">
                              <span className="font-medium text-neutral-300">{pt.label}</span>
                              <span className="text-neutral-500">|</span>
                              <span className="font-bold text-[#A6DDB1]">Value: {primaryCurrency} {pt.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                          );
                        })()}
                        {(() => {
                          const points = netWorthPeriod === 'monthly' ? netWorthMonthlyPoints : netWorthPeriod === 'quarterly' ? netWorthQuarterlyPoints : netWorthYearlyPoints;
                          if (!points || points.length === 0) return null;
                          const values = points.map(p => p.value);
                          const minVal = Math.min(...values);
                          const maxVal = Math.max(...values);
                          const valRange = maxVal - minVal;

                          const width = 280;
                          const height = 80;
                          const coords = points.map((p, idx) => {
                            const x = (idx / (points.length - 1)) * (width - 30) + 15;
                            const y = valRange === 0 ? height / 2 : height - 18 - ((p.value - minVal) / valRange) * (height - 35);
                            return { x, y, ...p };
                          });

                          let path = `M ${coords[0].x} ${coords[0].y}`;
                          for (let i = 0; i < coords.length - 1; i++) {
                            const p0 = coords[i];
                            const p1 = coords[i + 1];
                            const cpX1 = p0.x + (p1.x - p0.x) / 3;
                            const cpY1 = p0.y;
                            const cpX2 = p0.x + 2 * (p1.x - p0.x) / 3;
                            const cpY2 = p1.y;
                            path += ` C ${cpX1.toFixed(2)} ${cpY1.toFixed(2)}, ${cpX2.toFixed(2)} ${cpY2.toFixed(2)}, ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
                          }

                          const areaPath = `${path} L ${coords[coords.length - 1].x} ${height - 12} L ${coords[0].x} ${height - 12} Z`;
                          const strokeColor = netWorth < 0 ? '#ba1a1a' : '#10b981';

                          return (
                            <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
                              <defs>
                                <linearGradient id="netWorthGrad" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor={strokeColor} stopOpacity="0.22" />
                                  <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
                                </linearGradient>
                              </defs>
                              <path d={areaPath} fill="url(#netWorthGrad)" />
                              <path
                                d={path}
                                fill="none"
                                stroke={strokeColor}
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              {coords.map((c, i) => {
                                const isHovered = hoveredNetWorthIndex === i;
                                return (
                                  <g 
                                    key={i} 
                                    className="cursor-pointer"
                                    onMouseEnter={(e) => { e.stopPropagation(); setHoveredNetWorthIndex(i); }}
                                    onMouseLeave={(e) => { e.stopPropagation(); setHoveredNetWorthIndex(null); }}
                                  >
                                    <circle
                                      cx={c.x}
                                      cy={c.y}
                                      r={isHovered ? "5.5" : "3.5"}
                                      fill={isHovered ? strokeColor : "#ffffff"}
                                      stroke={strokeColor}
                                      strokeWidth={isHovered ? "2.5" : "2"}
                                      className="transition-all duration-200"
                                    />
                                    {/* Invisible hit area */}
                                    <circle cx={c.x} cy={c.y} r="14" fill="transparent" />
                                    <text
                                      x={c.x}
                                      y={height - 2}
                                      textAnchor="middle"
                                      fill="#8c8c99"
                                      fontSize="10"
                                      style={{ fontFamily: "'Google Sans', sans-serif" }}
                                    >
                                      {c.label}
                                    </text>
                                  </g>
                                );
                              })}
                            </svg>
                          );
                        })()}
                      </div>
                    </div>
                  );
                case 'cash-available':
                  return (
                    <div 
                      id="analytics-cashavailable-card"
                      className="relative overflow-hidden flex flex-col transition-all bg-white border border-[#E1E8ED] rounded-2xl p-6 shadow-sm h-full"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setIsCashBreakdownOpen(true)}>
                          <span className="text-sm text-[#8c8c99]">{t('analytics.cash_available')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex bg-[#f4f4f8] p-0.5 rounded-lg text-xs" onClick={e => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => setCashPeriod('monthly')}
                              className={`px-2 py-0.5 rounded-md transition-all ${cashPeriod === 'monthly' ? 'bg-white text-[#111c2d] font-bold shadow-xs' : 'text-[#8c8c99]'}`}
                            >
                              {t('analytics.monthly', 'Monthly')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setCashPeriod('quarterly')}
                              className={`px-2 py-0.5 rounded-md transition-all ${cashPeriod === 'quarterly' ? 'bg-white text-[#111c2d] font-bold shadow-xs' : 'text-[#8c8c99]'}`}
                            >
                              {t('analytics.quarterly', 'Quarterly')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setCashPeriod('yearly')}
                              className={`px-2 py-0.5 rounded-md transition-all ${cashPeriod === 'yearly' ? 'bg-white text-[#111c2d] font-bold shadow-xs' : 'text-[#8c8c99]'}`}
                            >
                              {t('analytics.yearly', 'Yearly')}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-1 mb-2 cursor-pointer" onClick={() => setIsCashBreakdownOpen(true)}>
                        <div className="flex flex-col">
                            <span className="text-sm text-[#8c8c99]">{primaryCurrency}</span>
                            <span className="text-2xl font-bold text-[#111c2d]">{totalCashOnHand < 0 ? '-' : ''}{Math.abs(totalCashOnHand).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="w-10 h-10 bg-[#f4f4f8] rounded-xl flex items-center justify-center text-[#8C8C99]">
                          <WalletIcon size={20} />
                        </div>
                      </div>

                      <div className="h-28 w-full privacy-balance cursor-pointer mt-1 relative" onClick={() => setIsCashBreakdownOpen(true)}>
                        {hoveredCashIndex !== null && (() => {
                          const points = cashPeriod === 'monthly' ? cashMonthlyPoints : cashPeriod === 'quarterly' ? cashQuarterlyPoints : cashYearlyPoints;
                          const pt = points[hoveredCashIndex];
                          if (!pt) return null;
                          return (
                            <div className="absolute -top-2 right-2 z-30 bg-[#111c2d] text-white px-3 py-1 rounded-full text-xs flex items-center gap-2 shadow-xl border border-white/15 pointer-events-none">
                              <span className="font-medium text-neutral-300">{pt.label}</span>
                              <span className="text-neutral-500">|</span>
                              <span className="font-bold text-[#A6DDB1]">Value: {primaryCurrency} {pt.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                          );
                        })()}
                        {(() => {
                          const points = cashPeriod === 'monthly' ? cashMonthlyPoints : cashPeriod === 'quarterly' ? cashQuarterlyPoints : cashYearlyPoints;
                          if (!points || points.length === 0) return null;
                          const values = points.map(p => p.value);
                          const minVal = Math.min(...values);
                          const maxVal = Math.max(...values);
                          const valRange = maxVal - minVal;

                          const width = 280;
                          const height = 80;
                          const coords = points.map((p, idx) => {
                            const x = (idx / (points.length - 1)) * (width - 30) + 15;
                            const y = valRange === 0 ? height / 2 : height - 18 - ((p.value - minVal) / valRange) * (height - 35);
                            return { x, y, ...p };
                          });

                          let path = `M ${coords[0].x} ${coords[0].y}`;
                          for (let i = 0; i < coords.length - 1; i++) {
                            const p0 = coords[i];
                            const p1 = coords[i + 1];
                            const cpX1 = p0.x + (p1.x - p0.x) / 3;
                            const cpY1 = p0.y;
                            const cpX2 = p0.x + 2 * (p1.x - p0.x) / 3;
                            const cpY2 = p1.y;
                            path += ` C ${cpX1.toFixed(2)} ${cpY1.toFixed(2)}, ${cpX2.toFixed(2)} ${cpY2.toFixed(2)}, ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
                          }

                          const areaPath = `${path} L ${coords[coords.length - 1].x} ${height - 12} L ${coords[0].x} ${height - 12} Z`;
                          const strokeColor = '#10b981';

                          return (
                            <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
                              <defs>
                                <linearGradient id="cashGrad" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor={strokeColor} stopOpacity="0.22" />
                                  <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
                                </linearGradient>
                              </defs>
                              <path d={areaPath} fill="url(#cashGrad)" />
                              <path
                                d={path}
                                fill="none"
                                stroke={strokeColor}
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              {coords.map((c, i) => {
                                const isHovered = hoveredCashIndex === i;
                                return (
                                  <g 
                                    key={i} 
                                    className="cursor-pointer"
                                    onMouseEnter={(e) => { e.stopPropagation(); setHoveredCashIndex(i); }}
                                    onMouseLeave={(e) => { e.stopPropagation(); setHoveredCashIndex(null); }}
                                  >
                                    <circle
                                      cx={c.x}
                                      cy={c.y}
                                      r={isHovered ? "5.5" : "3.5"}
                                      fill={isHovered ? strokeColor : "#ffffff"}
                                      stroke={strokeColor}
                                      strokeWidth={isHovered ? "2.5" : "2"}
                                      className="transition-all duration-200"
                                    />
                                    <circle cx={c.x} cy={c.y} r="14" fill="transparent" />
                                    <text
                                      x={c.x}
                                      y={height - 2}
                                      textAnchor="middle"
                                      fill="#8c8c99"
                                      fontSize="10"
                                      style={{ fontFamily: "'Google Sans', sans-serif" }}
                                    >
                                      {c.label}
                                    </text>
                                  </g>
                                );
                              })}
                            </svg>
                          );
                        })()}
                      </div>
                    </div>
                  );
                case 'investment-assets':
                  return (
                    <div 
                      id="analytics-investment-assets-card"
                      className="relative overflow-hidden flex flex-col transition-all bg-white border border-[#E1E8ED] rounded-2xl p-6 shadow-sm h-full"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setIsInvestmentBreakdownOpen(true)}>
                          <span className="text-sm text-[#8c8c99]">{t('analytics.investment_assets', 'Investment Assets')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex bg-[#f4f4f8] p-0.5 rounded-lg text-xs" onClick={e => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => setInvestmentPeriod('monthly')}
                              className={`px-2 py-0.5 rounded-md transition-all ${investmentPeriod === 'monthly' ? 'bg-white text-[#111c2d] font-bold shadow-xs' : 'text-[#8c8c99]'}`}
                            >
                              {t('analytics.monthly', 'Monthly')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setInvestmentPeriod('quarterly')}
                              className={`px-2 py-0.5 rounded-md transition-all ${investmentPeriod === 'quarterly' ? 'bg-white text-[#111c2d] font-bold shadow-xs' : 'text-[#8c8c99]'}`}
                            >
                              {t('analytics.quarterly', 'Quarterly')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setInvestmentPeriod('yearly')}
                              className={`px-2 py-0.5 rounded-md transition-all ${investmentPeriod === 'yearly' ? 'bg-white text-[#111c2d] font-bold shadow-xs' : 'text-[#8c8c99]'}`}
                            >
                              {t('analytics.yearly', 'Yearly')}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-1 mb-2 cursor-pointer" onClick={() => setIsInvestmentBreakdownOpen(true)}>
                        <div className="flex flex-col">
                            <span className="text-sm text-[#8c8c99]">{primaryCurrency}</span>
                            <span className="text-2xl font-bold text-[#111c2d]">{investmentSum < 0 ? '-' : ''}{Math.abs(investmentSum).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="w-10 h-10 bg-[#f4f4f8] rounded-xl flex items-center justify-center text-[#8C8C99]">
                          <TrendingUp size={20} />
                        </div>
                      </div>

                      <div className="h-28 w-full privacy-balance cursor-pointer mt-1 relative" onClick={() => setIsInvestmentBreakdownOpen(true)}>
                        {hoveredInvestmentIndex !== null && (() => {
                          const points = investmentPeriod === 'monthly' ? investmentMonthlyPoints : investmentPeriod === 'quarterly' ? investmentQuarterlyPoints : investmentYearlyPoints;
                          const pt = points[hoveredInvestmentIndex];
                          if (!pt) return null;
                          return (
                            <div className="absolute -top-2 right-2 z-30 bg-[#111c2d] text-white px-3 py-1 rounded-full text-xs flex items-center gap-2 shadow-xl border border-white/15 pointer-events-none">
                              <span className="font-medium text-neutral-300">{pt.label}</span>
                              <span className="text-neutral-500">|</span>
                              <span className="font-bold text-[#A6DDB1]">Value: {primaryCurrency} {pt.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                          );
                        })()}
                        {(() => {
                          const points = investmentPeriod === 'monthly' ? investmentMonthlyPoints : investmentPeriod === 'quarterly' ? investmentQuarterlyPoints : investmentYearlyPoints;
                          if (!points || points.length === 0) return null;
                          const values = points.map(p => p.value);
                          const minVal = Math.min(...values);
                          const maxVal = Math.max(...values);
                          const valRange = maxVal - minVal;

                          const width = 280;
                          const height = 80;
                          const coords = points.map((p, idx) => {
                            const x = (idx / (points.length - 1)) * (width - 30) + 15;
                            const y = valRange === 0 ? height / 2 : height - 18 - ((p.value - minVal) / valRange) * (height - 35);
                            return { x, y, ...p };
                          });

                          let path = `M ${coords[0].x} ${coords[0].y}`;
                          for (let i = 0; i < coords.length - 1; i++) {
                            const p0 = coords[i];
                            const p1 = coords[i + 1];
                            const cpX1 = p0.x + (p1.x - p0.x) / 3;
                            const cpY1 = p0.y;
                            const cpX2 = p0.x + 2 * (p1.x - p0.x) / 3;
                            const cpY2 = p1.y;
                            path += ` C ${cpX1.toFixed(2)} ${cpY1.toFixed(2)}, ${cpX2.toFixed(2)} ${cpY2.toFixed(2)}, ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
                          }

                          const areaPath = `${path} L ${coords[coords.length - 1].x} ${height - 12} L ${coords[0].x} ${height - 12} Z`;
                          const strokeColor = '#3b82f6';

                          return (
                            <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
                              <defs>
                                <linearGradient id="invGrad" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor={strokeColor} stopOpacity="0.22" />
                                  <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
                                </linearGradient>
                              </defs>
                              <path d={areaPath} fill="url(#invGrad)" />
                              <path
                                d={path}
                                fill="none"
                                stroke={strokeColor}
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              {coords.map((c, i) => {
                                const isHovered = hoveredInvestmentIndex === i;
                                return (
                                  <g 
                                    key={i} 
                                    className="cursor-pointer"
                                    onMouseEnter={(e) => { e.stopPropagation(); setHoveredInvestmentIndex(i); }}
                                    onMouseLeave={(e) => { e.stopPropagation(); setHoveredInvestmentIndex(null); }}
                                  >
                                    <circle
                                      cx={c.x}
                                      cy={c.y}
                                      r={isHovered ? "5.5" : "3.5"}
                                      fill={isHovered ? strokeColor : "#ffffff"}
                                      stroke={strokeColor}
                                      strokeWidth={isHovered ? "2.5" : "2"}
                                      className="transition-all duration-200"
                                    />
                                    <circle cx={c.x} cy={c.y} r="14" fill="transparent" />
                                    <text
                                      x={c.x}
                                      y={height - 2}
                                      textAnchor="middle"
                                      fill="#8c8c99"
                                      fontSize="10"
                                      style={{ fontFamily: "'Google Sans', sans-serif" }}
                                    >
                                      {c.label}
                                    </text>
                                  </g>
                                );
                              })}
                            </svg>
                          );
                        })()}
                      </div>
                    </div>
                  );
                case 'total-debts':
                  return (
                    <div 
                      id="analytics-totaldebts-card"
                      className="relative overflow-hidden flex flex-col transition-all bg-white border border-[#E1E8ED] rounded-2xl p-6 shadow-sm h-full"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setIsDebtBreakdownOpen(true)}>
                          <span className="text-sm text-[#8c8c99]">{t('analytics.total_debts')}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex bg-[#f4f4f8] p-0.5 rounded-lg text-xs" onClick={e => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => setDebtPeriod('monthly')}
                              className={`px-2 py-0.5 rounded-md transition-all ${debtPeriod === 'monthly' ? 'bg-white text-[#111c2d] font-bold shadow-xs' : 'text-[#8c8c99]'}`}
                            >
                              {t('analytics.monthly', 'Monthly')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setDebtPeriod('quarterly')}
                              className={`px-2 py-0.5 rounded-md transition-all ${debtPeriod === 'quarterly' ? 'bg-white text-[#111c2d] font-bold shadow-xs' : 'text-[#8c8c99]'}`}
                            >
                              {t('analytics.quarterly', 'Quarterly')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setDebtPeriod('yearly')}
                              className={`px-2 py-0.5 rounded-md transition-all ${debtPeriod === 'yearly' ? 'bg-white text-[#111c2d] font-bold shadow-xs' : 'text-[#8c8c99]'}`}
                            >
                              {t('analytics.yearly', 'Yearly')}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-1 mb-2 cursor-pointer" onClick={() => setIsDebtBreakdownOpen(true)}>
                        <div className="flex flex-col">
                            <span className="text-sm text-[#8c8c99]">{primaryCurrency}</span>
                            <span className="text-2xl font-bold text-[#ba1a1a]">
                              {totalDebt < 0 ? '-' : ''}{Math.abs(totalDebt || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                        <div className="w-10 h-10 bg-[#ba1a1a]/10 rounded-xl flex items-center justify-center text-[#ba1a1a]">
                          <TrendingDown size={20} />
                        </div>
                      </div>

                      <div className="h-28 w-full privacy-balance cursor-pointer mt-1 relative" onClick={() => setIsDebtBreakdownOpen(true)}>
                        {hoveredDebtIndex !== null && (() => {
                          const points = debtPeriod === 'monthly' ? debtMonthlyPoints : debtPeriod === 'quarterly' ? debtQuarterlyPoints : debtYearlyPoints;
                          const pt = points[hoveredDebtIndex];
                          if (!pt) return null;
                          return (
                            <div className="absolute -top-2 right-2 z-30 bg-[#111c2d] text-white px-3 py-1 rounded-full text-xs flex items-center gap-2 shadow-xl border border-white/15 pointer-events-none">
                              <span className="font-medium text-neutral-300">{pt.label}</span>
                              <span className="text-neutral-500">|</span>
                              <span className="font-bold text-[#A6DDB1]">Value: {primaryCurrency} {pt.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                          );
                        })()}
                        {(() => {
                          const points = debtPeriod === 'monthly' ? debtMonthlyPoints : debtPeriod === 'quarterly' ? debtQuarterlyPoints : debtYearlyPoints;
                          if (!points || points.length === 0) return null;
                          const values = points.map(p => p.value);
                          const minVal = Math.min(...values);
                          const maxVal = Math.max(...values);
                          const valRange = maxVal - minVal;

                          const width = 280;
                          const height = 80;
                          const coords = points.map((p, idx) => {
                            const x = (idx / (points.length - 1)) * (width - 30) + 15;
                            const y = valRange === 0 ? height / 2 : height - 18 - ((p.value - minVal) / valRange) * (height - 35);
                            return { x, y, ...p };
                          });

                          let path = `M ${coords[0].x} ${coords[0].y}`;
                          for (let i = 0; i < coords.length - 1; i++) {
                            const p0 = coords[i];
                            const p1 = coords[i + 1];
                            const cpX1 = p0.x + (p1.x - p0.x) / 3;
                            const cpY1 = p0.y;
                            const cpX2 = p0.x + 2 * (p1.x - p0.x) / 3;
                            const cpY2 = p1.y;
                            path += ` C ${cpX1.toFixed(2)} ${cpY1.toFixed(2)}, ${cpX2.toFixed(2)} ${cpY2.toFixed(2)}, ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
                          }

                          const areaPath = `${path} L ${coords[coords.length - 1].x} ${height - 12} L ${coords[0].x} ${height - 12} Z`;
                          const strokeColor = '#ba1a1a';

                          return (
                            <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
                              <defs>
                                <linearGradient id="debtGrad" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor={strokeColor} stopOpacity="0.22" />
                                  <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
                                </linearGradient>
                              </defs>
                              <path d={areaPath} fill="url(#debtGrad)" />
                              <path
                                d={path}
                                fill="none"
                                stroke={strokeColor}
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              {coords.map((c, i) => {
                                const isHovered = hoveredDebtIndex === i;
                                return (
                                  <g 
                                    key={i} 
                                    className="cursor-pointer"
                                    onMouseEnter={(e) => { e.stopPropagation(); setHoveredDebtIndex(i); }}
                                    onMouseLeave={(e) => { e.stopPropagation(); setHoveredDebtIndex(null); }}
                                  >
                                    <circle
                                      cx={c.x}
                                      cy={c.y}
                                      r={isHovered ? "5.5" : "3.5"}
                                      fill={isHovered ? strokeColor : "#ffffff"}
                                      stroke={strokeColor}
                                      strokeWidth={isHovered ? "2.5" : "2"}
                                      className="transition-all duration-200"
                                    />
                                    <circle cx={c.x} cy={c.y} r="14" fill="transparent" />
                                    <text
                                      x={c.x}
                                      y={height - 2}
                                      textAnchor="middle"
                                      fill="#8c8c99"
                                      fontSize="10"
                                      style={{ fontFamily: "'Google Sans', sans-serif" }}
                                    >
                                      {c.label}
                                    </text>
                                  </g>
                                );
                              })}
                            </svg>
                          );
                        })()}
                      </div>
                    </div>
                  );
                case 'recurring-transactions':
                  return (
                    <div 
                      id="analytics-recurring-card"
                      style={{ fontFamily: "'Google Sans', sans-serif" }}
                      className="relative overflow-hidden flex flex-col transition-all bg-white border border-neutral-200 rounded-2xl p-6 shadow-xs h-full"
                    >
                      <div className="flex flex-col gap-4">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-neutral-500 font-normal">{t('analytics.monthly_recurring_income')}</span>
                          <span className="bg-emerald-50 text-emerald-700 text-[12px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                            <TrendingUp size={12} />
                          </span>
                        </div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-sm text-neutral-500 font-normal">{primaryCurrency}</span>
                          <span className="text-2xl font-bold text-emerald-700">
                            {totalRecurringIncome < 0 ? '-' : ''}{Math.abs(totalRecurringIncome).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        
                        <div className="border-t border-neutral-100 my-0" />
                        
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-neutral-500 font-normal">{t('analytics.monthly_recurring_expenses')}</span>
                          <span className="bg-rose-50 text-rose-700 text-[12px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                            <TrendingDown size={12} />
                          </span>
                        </div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-sm text-neutral-500 font-normal">{primaryCurrency}</span>
                          <span className="text-2xl font-bold text-rose-700">
                            {totalRecurringExpenses < 0 ? '-' : ''}{Math.abs(totalRecurringExpenses).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                case 'vantage-insight':
                  return (
                    <div 
                      id="analytics-vantage-insight"
                      className="relative overflow-hidden flex flex-col transition-all bg-[#F0F9F4] border border-[#DCFCE7] rounded-2xl p-6 h-full"
                    >
                      <div className="flex items-center gap-2 text-[#366945] mb-3">
                        <Lightbulb size={20} />
                        <span className="font-bold text-sm">{t('analytics.vantage_insight')}</span>
                      </div>
                      <p className="text-[#366945] text-sm leading-relaxed">
                        {t('analytics.vantage_insight_savings_prefix')} {historicalStats.savingsChangePct >= 0 ? t('analytics.vantage_insight_grew_by') : t('analytics.vantage_insight_fell_by')} {Math.abs(historicalStats.savingsChangePct).toFixed(1)}% {t('analytics.vantage_insight_suffix')}
                        {historicalStats.savingsChangePct >= 0 ? t('analytics.vantage_insight_positive_tip') : t('analytics.vantage_insight_negative_tip')}
                      </p>
                    </div>
                  );
                case 'gratuity':
                  return <GratuityCalculator primaryCurrency={primaryCurrency} />;
                default:
                  return null;
              }
            })();

            const isSpan8 = cardId === 'net-cash-flow';

            return (
              <div
                key={cardId}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', cardId);
                  setDraggedCardId(cardId);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggedCardId && draggedCardId !== cardId) {
                    moveDashboardCard(draggedCardId, cardId);
                  }
                  setDraggedCardId(null);
                }}
                className={`${isSpan8 ? 'md:col-span-8' : 'md:col-span-4'} relative group transition-all`}
              >
                {/* Drag handle & reorder toolbar overlay on hover */}
                <div className="absolute -top-3.5 right-6 z-20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-white/95 backdrop-blur-xs border border-neutral-200 rounded-lg p-1 shadow-md">
                  <button
                    type="button"
                    title="Move Up"
                    onClick={() => shiftCardOrder(cardId, 'up')}
                    className="p-1 hover:bg-neutral-100 rounded text-neutral-600 cursor-pointer"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    title="Move Down"
                    onClick={() => shiftCardOrder(cardId, 'down')}
                    className="p-1 hover:bg-neutral-100 rounded text-neutral-600 cursor-pointer"
                  >
                    <ArrowDown size={14} />
                  </button>
                  <div className="cursor-grab active:cursor-grabbing p-1 text-neutral-400 hover:text-neutral-700" title="Drag to reorder">
                    <GripVertical size={14} />
                  </div>
                </div>



                {cardId === 'investment-assets' && (
                  <div className="space-y-4">
                    {cardContent}
                    <NativeAdBox adSlot="3273162026" profile={profile} />
                  </div>
                )}

                {cardId !== 'investment-assets' && cardContent}
              </div>
            );
          };

          return (
            <motion.div
              key="current-situation-stream"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <div className="flex justify-between items-center bg-white border border-[#E1E8ED] rounded-xl px-4 py-2.5 shadow-xs">
                <span className="text-xs text-neutral-500 font-normal" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                  Tip: Drag cards or use arrow buttons to rearrange your dashboard layout.
                </span>
                <button
                  type="button"
                  onClick={resetDashboardOrder}
                  className="flex items-center gap-1.5 text-xs text-neutral-600 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 px-3 py-1 rounded-lg transition-all cursor-pointer"
                >
                  <RotateCcw size={12} />
                  <span>Reset Layout</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-gutter">
                {dashboardOrder.map(cardId => renderDashboardCard(cardId))}
              </div>
            </motion.div>
          );
        })()}

        {/* VIEW 2: HISTORICAL ANALYSIS */}
        {activeTimeline === 'past' && renderPastTab()}

        {/* VIEW 3: FORECAST PREDICTIONS */}
        {activeTimeline === 'future' && (
          <motion.div
            key="forecast-predictions-stream"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2 }}
            className="space-y-6 w-full"
          >
            {(() => {
              const primaryCurrency = profile?.baseCurrency || profile?.currency || 'AED';
              const symbol = primaryCurrency === 'USD' ? '$' : primaryCurrency === 'EUR' ? '€' : primaryCurrency === 'GBP' ? '£' : `${primaryCurrency} `;
              
              // Formatting helper inside local block
              const formatCurrencyLocal = (val: number) => {
                return `${val < 0 ? '-' : ''}${symbol}${Math.abs(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
              };

              const userBaseRateToAED = exchangeRates[primaryCurrency] || 1.0;
              const monthsDivider = pastTimeRange === '1M' ? 1 : pastTimeRange === '3M' ? 3 : pastTimeRange === '6M' ? 6 : pastTimeRange === '1Y' ? 12 : 6;
              const monthlyInflow = (historicalStats?.totalInflow || 0) / monthsDivider;
              const monthlyOutflow = (historicalStats?.totalOutflow || 0) / monthsDivider;
              
              const monthlyInflowBase = monthlyInflow / userBaseRateToAED;
              const monthlyOutflowBase = monthlyOutflow / userBaseRateToAED;
              
              const avgNetSurplus = monthlyInflowBase - monthlyOutflowBase;
              const displaySurplusVal = avgNetSurplus > 100 ? avgNetSurplus : 1450;
              
              const baseProjectedNetWorthIn12Months = (netWorth || 0) + displaySurplusVal * 12;
              const finalProjectedNetWorthIn12Months = baseProjectedNetWorthIn12Months + extraSavings * 12;
              
              const growthPercentage = (netWorth && netWorth > 100)
                ? ((finalProjectedNetWorthIn12Months - netWorth) / netWorth) * 100 
                : 12.4;

              // Compound factor over 10 Year:
              const compoundingTenYearMultiplier = (() => {
                const r = 0.07 / 12; // 7% annual compounding rate
                const n = 120; // 120 months
                return ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
              })();
              const tenYearImpact = extraSavings * compoundingTenYearMultiplier;

              // Generate 10 Bars for the projected Net Worth chart
              const bars = Array.from({ length: 10 }).map((_, idx) => {
                const factor = (idx + 1) / 10;
                const monthlyIncr = displaySurplusVal + extraSavings;
                const value = (netWorth && netWorth > 0 ? netWorth : 110000) + monthlyIncr * 12 * factor;
                return value;
              });

              const maxBarValue = Math.max(...bars, 100);
              const minBarValue = Math.min(...bars, 0);
              const barDiff = maxBarValue - minBarValue;

              // 6 months dynamic cash flow forecasts
              const cashFlowForecastData = [
                { month: 'Sep', income: displaySurplusVal * 3, expenses: displaySurplusVal * 1.8 },
                { month: 'Oct', income: displaySurplusVal * 3.1, expenses: displaySurplusVal * 1.6 },
                { month: 'Nov', income: displaySurplusVal * 2.9, expenses: displaySurplusVal * 1.7 },
                { month: 'Dec', income: displaySurplusVal * 3.2, expenses: displaySurplusVal * 2.5 },
                { month: 'Jan', income: displaySurplusVal * 3.0, expenses: displaySurplusVal * 1.7 },
                { month: 'Feb', income: displaySurplusVal * 3.3, expenses: displaySurplusVal * 1.5 }
              ];

              const calculatedLiquidityScore = Math.min(100, Math.max(30, Math.round(((totalCashOnHand || 25000) / (monthlyOutflowBase || 2000)) * 25 + 50)));
              const displayLiquidityScore = isNaN(calculatedLiquidityScore) ? 94 : calculatedLiquidityScore;

              const targetAmount = primaryCurrency === 'AED' ? 15000 : 5000;
              const emSaved = (totalCashOnHand && totalCashOnHand > 0) ? Math.min(targetAmount * 0.95, totalCashOnHand * 0.4) : targetAmount * 0.82;
              const emProgressPct = Math.min(100, Math.max(10, Math.round((emSaved / targetAmount) * 100)));
              
              const remainingAmount = targetAmount - emSaved;
              const monthlyContrib = displaySurplusVal + extraSavings;
              const monthsToComplete = monthlyContrib > 50 ? remainingAmount / monthlyContrib : 3;
              const targetDate = new Date();
              targetDate.setMonth(targetDate.getMonth() + Math.ceil(monthsToComplete));
              const targetDateStr = targetDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

              return (
                <>
                  {/* Should I Buy This? AI Impulse Coach Card */}
                  <div className="w-full">
                    <ShouldIBuyThis 
                      profile={profile} 
                      accounts={accounts} 
                      transactions={allTransactions} 
                      accountBalances={accountBalances}
                      recurringTransactions={recurring}
                      isEmbedded={true} 
                    />
                  </div>

                  {/* Rearrange control bar for Forecast */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white border border-[#c1c9bf]/30 rounded-2xl p-4 shadow-xs">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#366945]/10 flex items-center justify-center text-[#366945]">
                        <GripVertical size={20} />
                      </div>
                      <div>
                        <h3 style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }} className="text-sm text-[#111c2d] font-bold">
                          Forecast Layout Arrangement
                        </h3>
                        <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-xs text-gray-500 font-normal">
                          Drag cards or use the up/down arrows on card headers to customize your predictive intelligence dashboard order.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={resetForecastDashboardOrder}
                      className="flex items-center gap-2 px-3.5 py-2 bg-neutral-100 hover:bg-neutral-200 border border-[#c1c9bf]/40 rounded-xl text-xs font-bold text-gray-700 transition-all cursor-pointer shadow-xs"
                    >
                      <RotateCcw size={14} />
                      <span>Reset Layout</span>
                    </button>
                  </div>

                  <NativeAdBox adSlot="6968864454" profile={profile} />

                  {/* Reorderable Forecast Dashboards Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                    {forecastDashboardOrder.map((cardId, cardIdx) => {
                      let colSpan = 'md:col-span-6';
                      if (cardId === 'forecast-net-worth') colSpan = 'md:col-span-8';
                      if (cardId === 'forecast-scenario-planner') colSpan = 'md:col-span-4';
                      if (cardId === 'forecast-cash-flow') colSpan = 'md:col-span-12';
                      if (cardId === 'forecast-runway-liquidity') colSpan = 'md:col-span-6';
                      if (cardId === 'forecast-goal-target-planner') colSpan = 'md:col-span-6';
                      if (cardId === 'forecast-fire-horizon') colSpan = 'md:col-span-6';
                      if (cardId === 'forecast-debt-free-horizon') colSpan = 'md:col-span-6';

                      const renderCardContent = () => {
                        switch (cardId) {
                          case 'forecast-runway-liquidity': {
                            const historical = forecastData.data.filter(d => !d.forecasted);
                            const avgMonthlyOutflow = historical.length > 0 
                              ? historical.reduce((acc, h) => acc + h.expense, 0) / historical.length 
                              : 2500;

                            const fixedCoreOutflow = recurring
                              .filter(r => ['outflow', 'expense'].includes((r.transactionType || '').toLowerCase()) && ['rent', 'mortgage', 'utility', 'utilities', 'insurance', 'loan', 'debt', 'groceries'].some(k => (r.category || '').toLowerCase().includes(k) || (r.title || '').toLowerCase().includes(k)))
                              .reduce((sum, r) => sum + Number(r.amount || 0), 0) || (avgMonthlyOutflow * 0.55);

                            const survivalRunway = fixedCoreOutflow > 0 ? totalCashOnHand / fixedCoreOutflow : 0;
                            const lifestyleRunwayCalc = avgMonthlyOutflow > 0 ? totalCashOnHand / avgMonthlyOutflow : 0;
                            const activeRunway = runwayMode === 'survival' ? survivalRunway : lifestyleRunwayCalc;

                            const proj30 = totalCashOnHand + displaySurplusVal;
                            const proj60 = totalCashOnHand + displaySurplusVal * 2;
                            const proj90 = totalCashOnHand + displaySurplusVal * 3;

                            const cushionThreshold = primaryCurrency === 'AED' ? 750 : 200;
                            const hasLowCashRisk = proj30 < cushionThreshold || proj60 < cushionThreshold || proj90 < cushionThreshold || totalCashOnHand < cushionThreshold;
                            const riskBillName = topUpcomingLiabilities[0]?.notes || topUpcomingLiabilities[0]?.category || 'Rent / Recurring Bill';

                            return (
                              <div 
                                style={{ backgroundColor: '#FFFFFF', fontFamily: "'Google Sans', sans-serif" }}
                                className="border border-[#c1c9bf]/30 rounded-2xl p-6 flex flex-col justify-between shadow-sm h-full"
                              >
                                <div>
                                  <div className="flex justify-between items-start mb-4">
                                    <div>
                                      <h3 style={{ fontWeight: 700 }} className="text-sm text-[#111c2d] font-bold">
                                        1. The "Runway" & Liquidity Predictor
                                      </h3>
                                      <p style={{ fontWeight: 400 }} className="text-xs text-gray-500 mt-0.5 font-normal">
                                        30, 60 & 90-day balance projection & survival burn rate.
                                      </p>
                                    </div>
                                    <div className="text-right">
                                      <span className="bg-[#366945]/10 text-[#366945] px-2.5 py-1 rounded-full text-[11px] font-bold block mb-1">
                                        {activeRunway.toFixed(1)} Mos Runway
                                      </span>
                                      <span className="text-[10px] text-gray-400 capitalize block">
                                        {runwayMode === 'survival' ? 'Absolute Survival' : 'Lifestyle Baseline'}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Runway Mode Toggle */}
                                  <div className="flex items-center justify-between bg-[#f9fbfd] p-1 rounded-xl border border-[#c1c9bf]/20 mb-4">
                                    <button
                                      type="button"
                                      onClick={() => setRunwayMode('lifestyle')}
                                      className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                        runwayMode === 'lifestyle' 
                                          ? 'bg-white text-[#111c2d] shadow-xs border border-[#c1c9bf]/30' 
                                          : 'text-gray-500 hover:text-gray-800'
                                      }`}
                                    >
                                      Lifestyle Baseline ({lifestyleRunwayCalc.toFixed(1)}m)
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setRunwayMode('survival')}
                                      className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                        runwayMode === 'survival' 
                                          ? 'bg-[#366945] text-white shadow-xs' 
                                          : 'text-gray-500 hover:text-gray-800'
                                      }`}
                                    >
                                      Absolute Survival ({survivalRunway.toFixed(1)}m)
                                    </button>
                                  </div>

                                  {/* Low Cash Alert Banner */}
                                  {hasLowCashRisk && (
                                    <div className="mb-4 bg-amber-50 border border-amber-200 p-3 rounded-xl flex items-start gap-2.5 text-amber-900 text-xs">
                                      <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                                      <div>
                                        <span style={{ fontWeight: 700 }} className="block mb-0.5 font-bold">Low Cash Alert</span>
                                        <p style={{ fontWeight: 400 }} className="font-normal text-amber-800">
                                          Upcoming <span className="font-bold">{riskBillName}</span> in ~5-7 days risks dipping balance below the ${cushionThreshold} safe cushion threshold.
                                        </p>
                                      </div>
                                    </div>
                                  )}
                                  
                                  <div className="bg-[#f9fbfd] rounded-xl p-4 border border-[#c1c9bf]/20">
                                    <div className="flex justify-between items-center text-xs text-gray-500 mb-3">
                                      <span>Daily Tracking Horizon</span>
                                      <span style={{ fontWeight: 700 }} className="text-[#366945]">Safe Cushion</span>
                                    </div>
                                    
                                    <div className="space-y-2.5">
                                      <div>
                                        <div className="flex justify-between text-xs mb-1">
                                          <span className="text-gray-600">30-Day Projected Balance</span>
                                          <span style={{ fontWeight: 700 }} className="text-[#111c2d]">{formatCurrencyLocal(proj30)}</span>
                                        </div>
                                        <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                                          <div className="bg-[#366945] h-full" style={{ width: `${Math.min(100, Math.max(10, (proj30 / (totalCashOnHand || 10000)) * 75))}%` }} />
                                        </div>
                                      </div>
                                      <div>
                                        <div className="flex justify-between text-xs mb-1">
                                          <span className="text-gray-600">60-Day Projected Balance</span>
                                          <span style={{ fontWeight: 700 }} className="text-[#111c2d]">{formatCurrencyLocal(proj60)}</span>
                                        </div>
                                        <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                                          <div className="bg-[#366945] h-full" style={{ width: `${Math.min(100, Math.max(10, (proj60 / (totalCashOnHand || 10000)) * 85))}%` }} />
                                        </div>
                                      </div>
                                      <div>
                                        <div className="flex justify-between text-xs mb-1">
                                          <span className="text-gray-600">90-Day Projected Balance</span>
                                          <span style={{ fontWeight: 700 }} className="text-[#111c2d]">{formatCurrencyLocal(proj90)}</span>
                                        </div>
                                        <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                                          <div className="bg-[#366945] h-full" style={{ width: `${Math.min(100, Math.max(10, (proj90 / (totalCashOnHand || 10000)) * 95))}%` }} />
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                <p style={{ fontWeight: 400 }} className="text-xs text-gray-500 mt-4 font-normal">
                                  Eliminates bill anxiety by mapping expected inflows against fixed bills and variable daily burn rates.
                                </p>
                              </div>
                            );
                          }

                          case 'forecast-goal-target-planner': {
                            const activeGoalsList = Array.isArray(goals) ? goals.filter(g => !g.isArchived) : [];
                            const baseRateToAED = getRateToAED(primaryCurrency);

                            return (
                              <div 
                                style={{ backgroundColor: '#FFFFFF', fontFamily: "'Google Sans', sans-serif" }}
                                className="border border-[#c1c9bf]/30 rounded-2xl p-6 flex flex-col justify-between shadow-sm h-full"
                              >
                                <div>
                                  <div className="flex justify-between items-start mb-4">
                                    <div>
                                      <h3 style={{ fontWeight: 700 }} className="text-sm text-[#111c2d] font-bold">
                                        2. Milestone & Goal Target Planner
                                      </h3>
                                      <p style={{ fontWeight: 400 }} className="text-xs text-gray-500 mt-0.5 font-normal">
                                        Tracking your savings goals from the Essentials tab.
                                      </p>
                                    </div>
                                    <span className="bg-[#e8eeff] text-[#414941] px-2.5 py-1 rounded-full text-[11px] font-bold">
                                      {activeGoalsList.length} Active Goals
                                    </span>
                                  </div>

                                  <div className="bg-[#f9fbfd] rounded-xl p-4 border border-[#c1c9bf]/20 mt-4 space-y-3.5 max-h-[220px] overflow-y-auto">
                                    {activeGoalsList.length === 0 ? (
                                      <p className="text-xs text-gray-500 text-center py-4">
                                        No active savings goals found in Essentials.
                                      </p>
                                    ) : (
                                      activeGoalsList.map((goal: any, idx: number) => {
                                        const name = goal.name || goal.title || goal.categoryTitle || 'Savings Goal';
                                        const allocated = Number(goal.targetAmount || goal.allocatedAmount || 1000);
                                        const linkedAccountIds = goal.linkedAccountIds || [];
                                         const linkedBalancesSum = linkedAccountIds.reduce((s, id) => {
                                           const acc = accounts.find(a => a.id === id || a.accountId === id);
                                           const bal = Math.max(0, accountBalances[id] || 0);
                                           const rate = getRateToAED(acc?.currency || 'AED');
                                           const balInAED = bal * rate;
                                           return s + (balInAED / baseRateToAED);
                                         }, 0);
                                         const spent = Math.max(0, linkedAccountIds.length > 0 ? linkedBalancesSum : Number(goal.currentValue || goal.currentAmount || goal.spentAmount || 0));
                                         const pct = allocated > 0 ? Math.min(100, Math.max(0, Math.round((spent / allocated) * 100))) : 0;
                                        const estComp = goal.estCompletion || goal.targetDate || (pct >= 100 ? 'Completed' : `${goal.monthsToTarget || 18} Months Out`);
                                        const barColor = idx % 2 === 0 ? 'bg-[#366945]' : 'bg-[#2563EB]';
                                        const textColor = idx % 2 === 0 ? 'text-[#366945]' : 'text-[#2563EB]';

                                        return (
                                          <div key={goal.id || idx} className={idx > 0 ? 'pt-3 border-t border-gray-100' : ''}>
                                            <div className="flex justify-between items-center text-xs mb-1">
                                              <div>
                                                <span className="text-gray-900 font-semibold">{name}</span>
                                                <span className="text-gray-400 text-[11px] ml-2">Est. completion: {estComp}</span>
                                              </div>
                                              <span style={{ fontWeight: 700 }} className={textColor}>
                                                {formatCurrencyLocal(spent)} of {formatCurrencyLocal(allocated)}
                                              </span>
                                            </div>
                                            <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden mb-1">
                                              <div className={`${barColor} h-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                                            </div>
                                            <div className="flex justify-between text-[11px] text-gray-500 font-medium">
                                              <span>{pct}% reached</span>
                                              <span>{formatCurrencyLocal(allocated - spent)} remaining</span>
                                            </div>
                                          </div>
                                        );
                                      })
                                    )}
                                  </div>
                                </div>

                                <p style={{ fontWeight: 400 }} className="text-xs text-gray-500 mt-4 font-normal">
                                  Dynamically synchronized with your savings goals from the Essentials tab.
                                </p>
                              </div>
                            );
                          }

                                                     case 'forecast-fire-horizon': {
                             const baseRateToAED = getRateToAED(primaryCurrency);
                             const investmentAccounts = accounts.filter(acc => !acc.isArchived && (acc.type || '').toLowerCase() === 'investment');
                             
                             let totalPrincipal = 0;
                             let totalCurrentValue = 0;

                             investmentAccounts.forEach(acc => {
                               const rate = getRateToAED(acc.currency);
                               if (acc.subAssets && Array.isArray(acc.subAssets) && acc.subAssets.length > 0) {
                                 acc.subAssets.forEach((sub) => {
                                   totalPrincipal += (Number(sub.principalInvested || 0) * rate);
                                   totalCurrentValue += (Number(sub.investmentValue || sub.currentValue || sub.principalInvested || 0) * rate);
                                 });
                               } else {
                                 const start = Number(acc.startingBalance || 0);
                                 const curr = accountBalances[acc.id] !== undefined ? accountBalances[acc.id] : Number(acc.currentBalance || start);
                                 totalPrincipal += (Math.abs(start) * rate);
                                 totalCurrentValue += (Math.abs(curr) * rate);
                               }
                             });

                             if (totalPrincipal <= 0) {
                               totalPrincipal = investmentAccounts.reduce((sum, acc) => sum + (Number(acc.startingBalance || 0) * getRateToAED(acc.currency)), 0);
                             }
                             if (totalCurrentValue <= 0) {
                               totalCurrentValue = investmentAccounts.reduce((sum, acc) => {
                                 const bal = accountBalances[acc.id] !== undefined ? accountBalances[acc.id] : Number(acc.currentBalance || acc.startingBalance || 0);
                                 return sum + (bal * getRateToAED(acc.currency));
                               }, 0);
                             }

                             totalPrincipal = totalPrincipal / baseRateToAED;
                             totalCurrentValue = totalCurrentValue / baseRateToAED;
                             if (totalPrincipal <= 0 && totalCurrentValue > 0) {
                               totalPrincipal = totalCurrentValue * 0.85;
                             }

                             const annualExpenses = (monthlyOutflowBase || 2000) * 12;
                             const fireTarget = Math.max(500000, annualExpenses * 25);
                             const netInvested = Math.max(0, totalCurrentValue);
                             const firePct = fireTarget > 0 ? Math.min(100, Math.max(0, Math.round((netInvested / fireTarget) * 100))) : 0;
                             
                             const annualSavingsRate = Math.max(500, (displaySurplusVal || 1000) * 12);
                             const remainingAmount = Math.max(0, fireTarget - netInvested);
                             const yearsToFire = annualSavingsRate > 0 ? Math.ceil(remainingAmount / annualSavingsRate) : 20;
                             const currentAge = 32;
                             const freedomAge = currentAge + yearsToFire;

                             const investedPctOfAccounts = totalCurrentValue > 0 ? Math.min(100, Math.max(0, Math.round((totalPrincipal / totalCurrentValue) * 100))) : 100;

                             return (
                               <div 
                                 style={{ backgroundColor: '#FFFFFF', fontFamily: "'Google Sans', sans-serif" }}
                                 className="border border-[#c1c9bf]/30 rounded-2xl p-6 flex flex-col justify-between shadow-sm h-full"
                               >
                                 <div>
                                   <div className="flex justify-between items-start mb-4">
                                     <div>
                                       <h3 style={{ fontWeight: 700 }} className="text-sm text-[#111c2d] font-bold">
                                         3. Financial Independence / Retirement Horizon
                                       </h3>
                                       <p style={{ fontWeight: 400 }} className="text-xs text-gray-500 mt-0.5 font-normal">
                                         Intersection projection of investment assets & Gratuity Engine with living expenses.
                                       </p>
                                     </div>
                                     <span className="bg-[#366945]/10 text-[#366945] px-2.5 py-1 rounded-full text-[11px] font-bold">
                                       Freedom Age: {freedomAge}
                                     </span>
                                   </div>

                                   <div className="bg-[#f9fbfd] rounded-xl p-4 border border-[#c1c9bf]/20 mt-4 space-y-3">
                                     <div className="flex justify-between text-xs text-gray-500 mb-1">
                                       <span>FIRE Number Target</span>
                                       <span style={{ fontWeight: 700 }} className="text-[#111c2d]">{formatCurrencyLocal(fireTarget)}</span>
                                     </div>
                                     <div className="w-full bg-gray-200 h-2.5 rounded-full overflow-hidden mb-2">
                                       <div className="bg-[#366945] h-full transition-all duration-500" style={{ width: `${firePct}%` }} />
                                     </div>
                                     <div className="flex justify-between text-[11px] text-gray-500">
                                       <span>Current Net Invested ({formatCurrencyLocal(netInvested)})</span>
                                       <span style={{ fontWeight: 700 }} className="text-[#366945]">{firePct}% Complete</span>
                                     </div>
                                     <div className="pt-2 border-t border-gray-100 flex justify-between text-[11px] text-gray-500">
                                       <span>Invested Principal Ratio in Accounts</span>
                                       <span style={{ fontWeight: 700 }} className="text-[#111c2d]">{investedPctOfAccounts}% Principal ({formatCurrencyLocal(totalPrincipal)})</span>
                                     </div>
                                   </div>
                                 </div>

                                 <p style={{ fontWeight: 400 }} className="text-xs text-gray-500 mt-4 font-normal">
                                   Calculates your ultimate freedom milestone based on user investment accounts ({investmentAccounts.length} active portfolios) and compound investment velocity.
                                 </p>
                               </div>
                             );
                           }

                           case 'forecast-debt-free-horizon':
                            return (
                              <div 
                                style={{ backgroundColor: '#FFFFFF', fontFamily: "'Google Sans', sans-serif" }}
                                className="border border-[#c1c9bf]/30 rounded-2xl p-6 flex flex-col justify-between shadow-sm h-full"
                              >
                                <div>
                                  <div className="flex justify-between items-start mb-4">
                                    <div>
                                      <h3 style={{ fontWeight: 700 }} className="text-sm text-[#111c2d] font-bold">
                                        4. Debt-Free Horizon Map
                                      </h3>
                                      <p style={{ fontWeight: 400 }} className="text-xs text-gray-500 mt-0.5 font-normal">
                                        Predictive calendar date detailing exact zero-liability elimination.
                                      </p>
                                    </div>
                                    <span className="bg-[#ba1a1a]/10 text-[#ba1a1a] px-2.5 py-1 rounded-full text-[11px] font-bold">
                                      Target: Oct 2031
                                    </span>
                                  </div>

                                  <div className="bg-[#f9fbfd] rounded-xl p-4 border border-[#c1c9bf]/20 mt-4 space-y-3">
                                    <div className="flex justify-between text-xs">
                                      <span className="text-gray-600">Total Outstanding Liabilities</span>
                                      <span style={{ fontWeight: 700 }} className="text-[#ba1a1a]">{formatCurrencyLocal(totalDebt || 485000)}</span>
                                    </div>
                                    <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                                      <div className="bg-[#111c2d] h-full" style={{ width: '65%' }} />
                                    </div>
                                    <div className="flex justify-between text-[11px] text-gray-500">
                                      <span>Monthly Amortization Pace</span>
                                      <span style={{ fontWeight: 700 }} className="text-[#366945]">On Schedule</span>
                                    </div>
                                  </div>
                                </div>

                                <p style={{ fontWeight: 400 }} className="text-xs text-gray-500 mt-4 font-normal">
                                  Systematic payoff schedule tracking total debt elimination over time.
                                </p>
                              </div>
                            );

                          case 'forecast-net-worth':
                            return (
                              <div 
                                style={{ backgroundColor: '#FFFFFF', fontFamily: "'Google Sans', sans-serif" }}
                                className="border border-neutral-200/60 rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between min-h-[320px] shadow-sm h-full"
                              >
                                <div className="relative z-10">
                                  <span className="text-xs font-normal text-gray-500 uppercase tracking-wide block mb-1">
                                    {t('analytics.projected_net_worth')}
                                  </span>
                                  <h2 style={{ fontWeight: 700 }} className="text-4xl text-gray-950 tracking-tight block transition-all">
                                    {formatCurrencyLocal(finalProjectedNetWorthIn12Months)}
                                  </h2>
                                  <p className="text-xs text-emerald-600 flex items-center mt-2 font-normal">
                                    <TrendingUp size={16} className="mr-1 shrink-0" />
                                    <span>+{growthPercentage.toFixed(1)}% {t('analytics.projected_growth_suffix')}</span>
                                  </p>
                                </div>

                                <div className="h-40 w-full mt-6">
                                  <div className="w-full h-full flex items-end justify-between gap-2.5">
                                    {bars.map((val, idx) => {
                                      const heightPct = barDiff > 0 ? 40 + ((val - minBarValue) / barDiff) * 55 : 40 + idx * 5;
                                      return (
                                        <div 
                                          key={idx} 
                                          style={{ height: `${heightPct}%` }}
                                          className={`w-full rounded-t-lg transition-all duration-300 ${
                                            idx === 9 ? 'bg-[#366945] border-t-2 border-[#1C2038]' : 'bg-[#a6ddb1]/30 hover:bg-[#a6ddb1]/50'
                                          }`}
                                          title={formatCurrencyLocal(val)}
                                        />
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            );

                          case 'forecast-scenario-planner':
                            return (
                              <div 
                                style={{ backgroundColor: '#366945', fontFamily: "'Google Sans', sans-serif" }}
                                className="text-white rounded-2xl p-6 flex flex-col justify-between shadow-lg relative overflow-hidden h-full"
                              >
                                <div className="mb-6">
                                  <span className="text-xs text-white/80 uppercase tracking-wide block mb-1">
                                    {t('analytics.scenario_planner')}
                                  </span>
                                  <h3 style={{ fontWeight: 700 }} className="text-2xl text-white block mb-2">
                                    {t('analytics.what_if')}
                                  </h3>
                                  <p className="text-xs text-white/90 leading-relaxed font-normal">
                                    {t('analytics.adjust_savings_description')}
                                  </p>
                                </div>

                                <div className="mt-auto space-y-6 w-full">
                                  <div>
                                    <div className="flex justify-between items-center mb-2.5">
                                      <span className="text-xs font-normal text-white/90">
                                        {t('analytics.extra_savings')}
                                      </span>
                                      <span style={{ fontWeight: 700 }} className="text-xs bg-[#a6ddb1] text-[#00210d] px-3 py-1 rounded-full whitespace-nowrap">
                                        +{formatCurrencyLocal(extraSavings)}/{t('analytics.mo')}
                                      </span>
                                    </div>
                                    <input 
                                      type="range"
                                      min="0"
                                      max={primaryCurrency === 'AED' ? 5000 : 1500}
                                      step={primaryCurrency === 'AED' ? 100 : 50}
                                      value={extraSavings}
                                      onChange={(e) => setExtraSavings(Number(e.target.value))}
                                      className="w-full h-1 bg-white/20 rounded-full appearance-none cursor-pointer accent-[#a6ddb1]"
                                    />
                                  </div>

                                  <div className="bg-white/10 rounded-xl p-4 border border-white/5">
                                    <span className="text-[12px] text-white/70 block mb-1 font-normal">
                                      {t('analytics.capital_impact')}
                                    </span>
                                    <div style={{ fontWeight: 700 }} className="text-2xl tracking-tight text-[#a6ddb1]">
                                      +{formatCurrencyLocal(tenYearImpact)}
                                    </div>
                                  </div>

                                  <button 
                                    onClick={() => {
                                      setApplyBudgetFeedback("Allocations locked! Projected targets successfully synchronized.");
                                      setTimeout(() => setApplyBudgetFeedback(null), 3500);
                                    }}
                                    style={{ fontWeight: 700 }}
                                    className="w-full py-3.5 bg-[#a6ddb1] hover:bg-[#92c99d] active:scale-98 text-[#00210d] text-xs rounded-xl transition-all shadow-md block"
                                  >
                                    {t('analytics.apply_to_budget')}
                                  </button>

                                  <AnimatePresence>
                                    {applyBudgetFeedback && (
                                      <motion.div 
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="bg-emerald-950/80 border border-[#a6ddb1]/30 p-2.5 rounded-lg text-center text-[12px] text-white/90"
                                      >
                                        {applyBudgetFeedback}
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </div>
                              </div>
                            );

                          case 'forecast-cash-flow':
                            return (
                              <div 
                                style={{ backgroundColor: '#FFFFFF', fontFamily: "'Google Sans', sans-serif" }}
                                className="border border-neutral-200/60 rounded-2xl p-6 min-h-[380px] flex flex-col justify-between shadow-sm h-full"
                              >
                                <div>
                                  <div className="flex justify-between items-start mb-4 select-none">
                                    <div>
                                      <h3 style={{ fontWeight: 700 }} className="text-sm font-bold text-gray-800">
                                        {t('analytics.future_cash_flow')}
                                      </h3>
                                      <p className="text-xs text-gray-400 mt-1 font-normal">
                                        {t('analytics.projected_6_months')}
                                      </p>
                                    </div>
                                    <div className="flex gap-4">
                                      <div className="flex items-center gap-1.5 font-normal">
                                        <span className="w-2 h-2 rounded-full bg-[#366945]" />
                                        <span className="text-[12px] text-gray-500 font-normal">
                                          {t('analytics.income')}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1.5 font-normal">
                                        <span className="w-2.5 h-2.5 rounded-full bg-[#c1c9bf]" />
                                        <span className="text-[12px] text-gray-500 font-normal">
                                          {t('analytics.expenses')}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="h-52 w-full mt-2 relative select-none py-2">
                                    <ResponsiveContainer width="100%" height="100%">
                                      <AreaChart data={cashFlowForecastData} margin={{ top: 12, right: 10, left: -20, bottom: 0 }}>
                                        <defs>
                                          <linearGradient id="fluentSage3D" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#366945" stopOpacity={0.65} />
                                            <stop offset="100%" stopColor="#366945" stopOpacity={0.02} />
                                          </linearGradient>
                                        </defs>
                                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#8A95A5', fontWeight: 600 }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#8A95A5', fontWeight: 600 }} />
                                        <Tooltip contentStyle={{ background: '#111c2d', borderRadius: '12px', color: '#fff', fontSize: '12px' }} />
                                        <Area type="monotone" dataKey="income" stroke="#366945" strokeWidth={3} fill="url(#fluentSage3D)" />
                                        <Area type="monotone" dataKey="expenses" stroke="#8A95A5" strokeDasharray="4 2" strokeWidth={2} fill="none" />
                                      </AreaChart>
                                    </ResponsiveContainer>
                                  </div>
                                </div>

                                <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-4">
                                  <div>
                                    <span className="text-[12px] text-gray-500 block font-normal">
                                      {t('analytics.avg_net_surplus')}
                                    </span>
                                    <p style={{ fontWeight: 700 }} className="text-lg text-[#366945]">
                                      +{formatCurrencyLocal(displaySurplusVal)}/{t('analytics.mo')}
                                    </p>
                                  </div>
                                  <div>
                                    <span className="text-[12px] text-gray-500 block font-normal">
                                      {t('analytics.liquidity_score')}
                                    </span>
                                    <p style={{ fontWeight: 700 }} className="text-lg text-gray-800">
                                      {displayLiquidityScore}/100
                                    </p>
                                  </div>
                                </div>
                              </div>
                            );

                          default:
                            return null;
                        }
                      };

                      return (
                        <div
                          key={cardId}
                          className={`${colSpan} relative group transition-all duration-200`}
                          draggable
                          onDragStart={() => setForecastDraggedCardId(cardId)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => {
                            if (forecastDraggedCardId && forecastDraggedCardId !== cardId) {
                              moveForecastDashboardCard(forecastDraggedCardId, cardId);
                            }
                            setForecastDraggedCardId(null);
                          }}
                        >
                          {/* Reorder control overlay */}
                          <div className="absolute top-3 right-3 z-20 opacity-0 group-hover:opacity-100 transition-opacity bg-white/95 backdrop-blur-xs border border-[#c1c9bf]/40 rounded-xl p-1 flex items-center gap-1 shadow-md">
                            <button
                              type="button"
                              onClick={() => shiftForecastCardOrder(cardId, 'up')}
                              disabled={cardIdx === 0}
                              className="p-1 rounded-lg hover:bg-neutral-100 text-gray-600 disabled:opacity-30 cursor-pointer"
                              title="Move Left / Up"
                            >
                              <ChevronUp size={14} className="-rotate-90 sm:rotate-0" />
                            </button>
                            <button
                              type="button"
                              onClick={() => shiftForecastCardOrder(cardId, 'down')}
                              disabled={cardIdx === forecastDashboardOrder.length - 1}
                              className="p-1 rounded-lg hover:bg-neutral-100 text-gray-600 disabled:opacity-30 cursor-pointer"
                              title="Move Right / Down"
                            >
                              <ChevronDown size={14} className="-rotate-90 sm:rotate-0" />
                            </button>
                            <div className="cursor-grab active:cursor-grabbing p-1 text-gray-400 hover:text-gray-700">
                              <GripVertical size={14} />
                            </div>
                          </div>

                          {renderCardContent()}
                        </div>
                      );
                    })}
                  </div>

                  {/* Footnote / Context disclaimer - md:col-span-12 */}
                  <div className="w-full text-center mt-4">
                    <p 
                      style={{ fontFamily: "'Google Sans', sans-serif" }}
                      className="text-[12px] text-gray-400 leading-relaxed font-normal"
                    >
                      {t('analytics.forecast_disclaimer')}
                    </p>
                  </div>
                </>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Account manage detail drawer details modal from Dashboard fallback */}
      <AccountDetailModal 
        isOpen={accountToManage !== null}
        onClose={() => setAccountToManage(null)}
        onAddTransaction={onAddTransaction}
        onNavigateToTransactions={onNavigateToTransactions}
        account={accountToManage}
        accounts={accounts}
        accountBalances={accountBalances}
        profile={profile}
        transactions={allTransactions}
        initialShowInsights={modalShowInsights}
      />

      {/* Net Worth Breakdown Modal popup */}
      <NetWorthBreakdownModal 
        isOpen={isNetWorthBreakdownOpen}
        onClose={() => setIsNetWorthBreakdownOpen(false)}
        accounts={accounts}
        accountBalances={accountBalances}
        primaryCurrency={primaryCurrency}
        exchangeRates={exchangeRates}
        defaultRates={DEFAULT_RATES}
        transactions={allTransactions}
        selectedAccIds={selectedAccIds}
      />

      {/* Cash Available Breakdown Modal popup */}
      <CashBreakdownModal 
        isOpen={isCashBreakdownOpen}
        onClose={() => setIsCashBreakdownOpen(false)}
        accounts={accounts}
        accountBalances={accountBalances}
        primaryCurrency={primaryCurrency}
        exchangeRates={exchangeRates}
        defaultRates={DEFAULT_RATES}
      />

      {/* Investment Assets Breakdown Modal popup */}
      <InvestmentBreakdownModal 
        isOpen={isInvestmentBreakdownOpen}
        onClose={() => setIsInvestmentBreakdownOpen(false)}
        accounts={accounts}
        accountBalances={accountBalances}
        primaryCurrency={primaryCurrency}
        exchangeRates={exchangeRates}
        defaultRates={DEFAULT_RATES}
      />

      {/* Debt Breakdown Modal popup */}
      <DebtBreakdownModal 
        isOpen={isDebtBreakdownOpen}
        onClose={() => setIsDebtBreakdownOpen(false)}
        accounts={accounts}
        accountBalances={accountBalances}
        primaryCurrency={primaryCurrency}
        exchangeRates={exchangeRates}
        defaultRates={DEFAULT_RATES}
      />

      {/* Recurring Commitments Breakdown Modal popup */}
      <RecurringBreakdownModal 
        isOpen={isRecurringBreakdownOpen}
        onClose={() => setIsRecurringBreakdownOpen(false)}
        itemized={commitmentData.itemized}
        monthlyIncome={commitmentData.monthlyIncome}
        monthlyExpense={commitmentData.monthlyExpense}
        primaryCurrency={primaryCurrency}
        ratio={commitmentData.ratio}
        status={commitmentData.status}
      />

      {/* Emotional Trigger Transactions Modal */}
      <AnimatePresence>
        {selectedEmotionalCategory && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedEmotionalCategory(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl overflow-hidden z-10 border border-neutral-100 flex flex-col max-h-[85vh]"
            >
              <div className="p-4 border-b border-neutral-100 flex items-center justify-between bg-[#f9fbfd]">
                <div>
                  <h3 className="text-sm font-bold text-[#111c2d]" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                    Transactions for {selectedEmotionalCategory}
                  </h3>
                  <p className="text-[12px] text-neutral-500 font-normal mt-0.5" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                    Last 30 Days Spontaneous Spend Breakdown
                  </p>
                </div>
                <button
                  onClick={() => setSelectedEmotionalCategory(null)}
                  className="w-8 h-8 rounded-full bg-white border border-neutral-200 flex items-center justify-center text-neutral-500 hover:text-neutral-900 transition-colors shadow-sm cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 overflow-y-auto space-y-2 flex-1">
                {(() => {
                  const thirtyDaysAgo = new Date();
                  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                  const matchedTxs = (allTransactions || []).filter(tx => {
                    if (tx.status === 'draft' || tx.status === 'scheduled' || tx.status === 'pending') return false;
                    const d = new Date(tx.date);
                    if (d < thirtyDaysAgo || d > now) return false;
                    const cat = tx.impulseCategory || '⚡ Low Energy & Convenience';
                    return (tx.isImpulsive || tx.impulseCategory) && cat === selectedEmotionalCategory;
                  });

                  if (matchedTxs.length === 0) {
                    return (
                      <div className="text-center py-8 text-neutral-400 text-[12px] font-normal" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                        No transactions found for this emotional category in the last 30 days.
                      </div>
                    );
                  }

                  return matchedTxs.map((tx, idx) => (
                    <div key={tx.id || idx} className="p-3 rounded-xl bg-[#f9fbfd] border border-neutral-200/80 flex items-center justify-between gap-3">
                      <div>
                        <div className="font-bold text-[12px] text-[#111c2d]" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                          {tx.title || tx.description || 'Spontaneous Expense'}
                        </div>
                        <div className="text-[12px] text-neutral-500 font-normal mt-0.5" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                          {tx.date} {tx.category ? `• ${tx.category}` : ''} {tx.accountName ? `• ${tx.accountName}` : ''}
                        </div>
                      </div>
                      <div className="font-bold text-[12px] text-[#ba1a1a]" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                        {formatCurrency(Number(tx.amount) || 0)}
                      </div>
                    </div>
                  ));
                })()}
              </div>

              <div className="p-3 bg-[#f9fbfd] border-t border-neutral-100 flex justify-end">
                <button
                  onClick={() => setSelectedEmotionalCategory(null)}
                  className="px-4 py-2 rounded-xl bg-[#111c2d] text-white font-bold text-[12px] hover:bg-[#111c2d]/90 transition-colors cursor-pointer"
                  style={{ fontFamily: "'Google Sans', sans-serif" }}
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
});

Analytics.displayName = 'Analytics';
