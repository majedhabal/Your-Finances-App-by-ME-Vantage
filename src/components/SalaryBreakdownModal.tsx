import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from '@/lib/i18n';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown,
  ChevronUp,
  Calendar, 
  CheckCircle, 
  AlertCircle,
  HelpCircle,
  Plus,
  Trash2,
  Check,
  Coins,
  GripVertical,
  Edit2
} from 'lucide-react';
import { EditMonthlyPayrollModal } from './EditMonthlyPayrollModal';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc,
  onSnapshot,
  serverTimestamp,
  query,
  where,
  getDocs,
  deleteDoc,
  writeBatch
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { MASTER_CATEGORIES } from '../lib/constants';
import { SpendFromAccountModal } from './SpendFromAccountModal';
import { formatLabel } from '../lib/stringUtils';

const migrateEnvelopesList = (list: string[]): string[] => {
  return list.map(key => {
    if (key === 'rent') return 'housing__rent';
    if (key === 'savings') return 'investments__savings';
    if (key === 'loans') return 'financial_expenses__loan';
    if (key === 'groceries') return 'food_&_drinks__groceries';
    if (key === 'shopping') return 'shopping__clothes';
    if (key === 'transportation') return 'vehicle__fuel'; 
    if (key === 'others') return 'financial_expenses__fees'; 
    return key;
  });
};

const migrateAllocations = (alloc: Record<string, number>): Record<string, number> => {
  const next: Record<string, number> = {};
  if (!alloc) return next;
  Object.keys(alloc).forEach(key => {
    let newKey = key;
    if (key === 'rent') newKey = 'housing__rent';
    else if (key === 'savings') newKey = 'investments__savings';
    else if (key === 'loans') newKey = 'financial_expenses__loan';
    else if (key === 'groceries') newKey = 'food_&_drinks__groceries';
    else if (key === 'shopping') newKey = 'shopping__clothes';
    else if (key === 'transportation') newKey = 'vehicle__fuel';
    else if (key === 'others') newKey = 'financial_expenses__fees';
    
    const val = alloc[key];
    next[newKey] = (typeof val === 'number' && !isNaN(val)) ? val : 0;
  });
  return next;
};

interface SalaryBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: any;
  budgets: any[];
  onSuccess: () => void;
  onOpenPremiumModal: () => void;
}

interface CustomAuxiliaryIncome {
  id: string;
  title: string;
  amount: number;
  isOneTime?: boolean;
}

interface CustomBudget {
  id: string;
  name: string;
  assignedCategories: string[]; // envelope keys
  amount: number;
}

interface Transaction {
  id: string;
  amount: number;
  category: string;
  subCategory?: string;
  date: string;
  notes?: string;
  type: 'income' | 'expense' | 'transfer';
  accountId: string;
  isRecurring?: boolean;
}

export const SalaryBreakdownModal: React.FC<SalaryBreakdownModalProps> = ({
  isOpen,
  onClose,
  profile,
  budgets,
  onSuccess,
  onOpenPremiumModal
}) => {
  const { t, i18n } = useTranslation();
  const [selectedYearMonth, setSelectedYearMonth] = useState<string>(() => {
    const today = new Date();
    const str = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    console.log('SalaryBreakdownModal selectedYearMonth initialized to:', str, 'today:', today);
    return str;
  });

  // Base onboarding parameters
  const [payday, setPayday] = useState<number>(28);
  const [selectedIncomes, setSelectedIncomes] = useState<string[]>([]);
  const [customAuxiliaries, setCustomAuxiliaries] = useState<CustomAuxiliaryIncome[]>([]);
  const [auxTitle, setAuxTitle] = useState('');
  const [auxAmount, setAuxAmount] = useState<number | ''>('');

  // Sourced active recurring incomes from Firestore
  const [dbRecurringIncomes, setDbRecurringIncomes] = useState<any[]>([]);
  const [recentIncomeTransactions, setRecentIncomeTransactions] = useState<Transaction[]>([]);
  const [isEditPayrollModalOpen, setIsEditPayrollModalOpen] = useState(false);

  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [formBudgetName, setFormBudgetName] = useState('');
  const [formBudgetAmount, setFormBudgetAmount] = useState<number | ''>('');
  const [formAssignedCategories, setFormAssignedCategories] = useState<string[]>([]);

  const [activeEnvelopes, setActiveEnvelopes] = useState<string[]>([]);
  const [allocations, setAllocations] = useState<Record<string, number>>({});

  const [customBudgets, setCustomBudgets] = useState<CustomBudget[]>([
    { id: 'b_1', name: 'Housing & Rent', assignedCategories: ['housing__rent'], amount: 0 },
    { id: 'b_2', name: 'Groceries & Dining', assignedCategories: ['food_&_drinks__groceries'], amount: 0 },
    { id: 'b_3', name: 'Savings & Investments', assignedCategories: ['investments__savings'], amount: 0 },
    { id: 'b_4', name: 'Loans & Liabilities', assignedCategories: ['financial_expenses__loan'], amount: 0 },
  ]);

  // Track active visual budget envelope keys chosen by user
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('salary-modal-toggled', { detail: { isOpen } }));
    window.dispatchEvent(new CustomEvent('breakdown-modal-toggled', { detail: { isOpen } }));
    if (isOpen || isBudgetModalOpen) {
      document.body.classList.add('hide-header-footer');
    } else {
      document.body.classList.remove('hide-header-footer');
    }
    return () => {
      window.dispatchEvent(new CustomEvent('salary-modal-toggled', { detail: { isOpen: false } }));
      window.dispatchEvent(new CustomEvent('breakdown-modal-toggled', { detail: { isOpen: false } }));
      document.body.classList.remove('hide-header-footer');
    };
  }, [isOpen, isBudgetModalOpen]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const [isIncomeListExpanded, setIsIncomeListExpanded] = useState(false);
  const [isManageCategoriesOpen, setIsManageCategoriesOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Live states for inline schedule generator forms
  const [isCreatingSchedule, setIsCreatingSchedule] = useState(false);
  const [dbAccounts, setDbAccounts] = useState<any[]>([]);
  const [newIncomeNotes, setNewIncomeNotes] = useState('Monthly Payroll');
  const [newIncomeAmount, setNewIncomeAmount] = useState<number | ''>(5000);
  const [newIncomeAccountId, setNewIncomeAccountId] = useState('');
  const [newIncomeType, setNewIncomeType] = useState<'recurring' | 'onetime'>('recurring');
  const [newIncomeRecurrency, setNewIncomeRecurrency] = useState('monthly');
  const [newIncomePayday, setNewIncomePayday] = useState(28);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [showClassificationPrompt, setShowClassificationPrompt] = useState(false);
  const [showSpendFromAccountModal, setShowSpendFromAccountModal] = useState(false);

  // Load user's recurring transactions where type or transactionType is income to feed dynamic multi-income selection
  useEffect(() => {
    if (!profile?.uid || !isOpen) return;

    const q = collection(db, `users/${profile.uid}/recurringTransactions`);
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter((item: any) => {
          const isIncome = (item.transactionType === 'income' || item.type === 'income' || item.transactionType === 'inflow' || item.type === 'inflow') &&
            item.transactionType !== 'expense' && item.transactionType !== 'outflow' && item.transactionType !== 'transfer' &&
            item.type !== 'expense' && item.type !== 'outflow' && item.type !== 'transfer';
          return isIncome && item.isActive !== false;
        });
      setDbRecurringIncomes(items);
    }, (err) => {
      console.warn("Failed to listen to recurring incomes for salary sourcing:", err);
    });

    return () => unsub();
  }, [profile?.uid, isOpen]);

  // Load accounts for target deposit pairing
  useEffect(() => {
    if (!profile?.uid || !isOpen) return;

    const q = collection(db, `users/${profile.uid}/accounts`);
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setDbAccounts(items);
      if (items.length > 0 && !newIncomeAccountId) {
        setNewIncomeAccountId(items[0].id);
      }
    }, (err) => {
      console.error("Failed to fetch accounts context for recurring scheduling:", err);
    });

    return () => unsub();
  }, [profile?.uid, isOpen]);

  // Load recent confirmed income transactions to suggest for linking
  useEffect(() => {
    if (!profile?.uid || !isOpen) return;

    const q = query(
      collection(db, `users/${profile.uid}/transactions`),
      where('type', '==', 'income'),
      where('category', '==', 'Income')
    );

    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      // Sort by date desc
      const sorted = items.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setRecentIncomeTransactions(sorted.slice(0, 5));
    }, (err) => {
      console.warn("Failed to catch recent income transactions:", err);
    });

    return () => unsub();
  }, [profile?.uid, isOpen]);

  // Automatic coupling of linked recurring incomes to checked selection
  useEffect(() => {
    if (dbRecurringIncomes.length > 0 && isOpen) {
      const hasAnySelected = selectedIncomes.some(id => 
        dbRecurringIncomes.some(inc => inc.id === id) || 
        customAuxiliaries.some(aux => aux.id === id)
      );
      if (!hasAnySelected) {
        setSelectedIncomes(dbRecurringIncomes.map(inc => inc.id));
      }
    }
  }, [dbRecurringIncomes, isOpen]);

  useEffect(() => {
    console.log('SalaryBreakdownModal selectedYearMonth changed to:', selectedYearMonth);
  }, [selectedYearMonth]);

  // Load saved blueprint arrangements for selected Year/Month or default settings
  useEffect(() => {
    if (!profile?.uid || !isOpen) return;
    console.log('Loading blueprint for:', selectedYearMonth);
    const fetchBlueprintAndProfile = async () => {
      setIsLoading(true);
      try {
        // Fetch baseline payday and base salary from recurringTransactions exclusively
        const qRecIncomes = collection(db, `users/${profile.uid}/recurringTransactions`);
        const recSnap = await getDocs(qRecIncomes);
        const recItems = recSnap.docs
          .map(d => ({ id: d.id, ...d.data() as any }))
          .filter(item => {
            const isIncome = (item.transactionType === 'income' || item.type === 'income' || item.transactionType === 'inflow' || item.type === 'inflow') &&
              item.transactionType !== 'expense' && item.transactionType !== 'outflow' && item.transactionType !== 'transfer' &&
              item.type !== 'expense' && item.type !== 'outflow' && item.type !== 'transfer';
            return isIncome && item.isActive !== false;
          });

        let defaultSal = recItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
        let defaultPayday = 28;
        const salaryItem = recItems.find((item: any) => 
          (item.category === 'Salary' || (item.category === 'Income' && item.subcategory === 'Wage')) && item.dayOption
        ) || recItems.find((item: any) => item.category === 'Salary' || (item.category === 'Income' && item.subcategory === 'Wage')) || recItems.find((item: any) => item.dayOption);
        if (salaryItem) {
          defaultPayday = Number(salaryItem.dayOption);
        }

        // Fetch selected month's configurations
        const monthRef = doc(db, `users/${profile.uid}/salaryBreakdowns/${selectedYearMonth}`);
        const monthSnap = await getDoc(monthRef);

        if (monthSnap.exists()) {
          const mData = monthSnap.data();
          setPayday(Number(mData.payday || defaultPayday));
          
          if (mData.selectedIncomes) {
            setSelectedIncomes(mData.selectedIncomes);
          } else {
            setSelectedIncomes([]);
          }

          if (mData.customBudgets) {
            setCustomBudgets(mData.customBudgets);
          } else if (mData.activeEnvelopes && mData.allocations) {
            const migrated = mData.activeEnvelopes.map((envKey: string, idx: number) => {
              const cat = allAvailableEnvelopesCatalog.find(e => e.key === envKey);
              const name = cat ? `${cat.category} - ${cat.subcategory}` : formatLabel(envKey);
              return {
                id: `b_${idx}_${Date.now()}`,
                name,
                assignedCategories: [envKey],
                amount: mData.allocations[envKey] || 0
              };
            });
            setCustomBudgets(migrated);
          }

          if (mData.customAuxiliaries) {
            setCustomAuxiliaries(mData.customAuxiliaries);
          } else {
            setCustomAuxiliaries([]);
          }
        } else {
          // Fallback or clone from previous month
          setPayday(defaultPayday);
          setSelectedIncomes([]);
          setCustomAuxiliaries([]);

          // Fetch previous month's configurations context to clone active budget states
          const [yr, mo] = selectedYearMonth.split('-').map(Number);
          const prevDate = new Date(yr, mo - 2, 1);
          const prevStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
          
          const prevRef = doc(db, `users/${profile.uid}/salaryBreakdowns/${prevStr}`);
          const prevSnap = await getDoc(prevRef);
          
          if (prevSnap.exists()) {
            const pData = prevSnap.data();
            if (pData.customBudgets) setCustomBudgets(pData.customBudgets);
            if (pData.selectedIncomes) setSelectedIncomes(pData.selectedIncomes);
            if (pData.customAuxiliaries) setCustomAuxiliaries(pData.customAuxiliaries);
          }
        }
      } catch (err) {
        console.error("Failed to load blueprint details:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBlueprintAndProfile();
  }, [profile?.uid, selectedYearMonth, isOpen]);

  const activeBaseCurrency = profile?.baseCurrency || profile?.currency || 'AED';

  // Dynamic selector days count depending on calendar month & year context
  const maxSelectableDays = useMemo(() => {
    const [year, month] = selectedYearMonth.split('-').map(Number);
    // standard javascript formula: day index 0 of next month maps to last day of active month
    return new Date(year, month, 0).getDate();
  }, [selectedYearMonth]);

  // Adjust current selected payday in case it is larger than max selectable day of shortened month
  useEffect(() => {
    if (payday > maxSelectableDays) {
      setPayday(maxSelectableDays);
    }
  }, [maxSelectableDays, payday]);

  const [userCategories, setUserCategories] = useState<any[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);

  const toggleCategoryExpanded = (categoryName: string) => {
    setExpandedCategories(prev =>
      prev.includes(categoryName)
        ? prev.filter(c => c !== categoryName)
        : [...prev, categoryName]
    );
  };

  // Listen to user categories
  useEffect(() => {
    if (!profile?.uid || !isOpen) return;
    const qStr = `users/${profile.uid}/custom_categories`;
    const unsub = onSnapshot(collection(db, qStr), async (snap) => {
      let list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (list.length === 0) {
        try {
          const { fetchGlobalPresets } = await import('../lib/categoryUtils');
          const presets = await fetchGlobalPresets();
          list = presets.map((p, idx) => ({ id: `preset_${idx}`, ...p }));
        } catch (err) {
          list = MASTER_CATEGORIES.map((p, idx) => ({ id: `local_${idx}`, ...p }));
        }
      }
      setUserCategories(list);
    }, (err) => {
      console.warn("Failed to listen to user categories:", err);
    });
    return () => unsub();
  }, [profile?.uid, isOpen]);

  const uniqueDbAccounts = useMemo(() => {
    const list: any[] = [];
    const seen = new Set<string>();
    dbAccounts.forEach((acc: any) => {
      if (acc && acc.id && !seen.has(acc.id)) {
        seen.add(acc.id);
        list.push(acc);
      }
    });
    return list;
  }, [dbAccounts]);

  const sourceCategories = useMemo(() => {
    const raw = userCategories.length > 0 ? userCategories : MASTER_CATEGORIES;
    const uniqueCats: any[] = [];
    const seenNames = new Set<string>();
    raw.forEach((cat: any) => {
      if (cat && cat.name) {
        const normalized = cat.name.trim().toLowerCase();
        if (!seenNames.has(normalized)) {
          seenNames.add(normalized);
          uniqueCats.push(cat);
        }
      }
    });
    return uniqueCats;
  }, [userCategories]);

  // Master catalog of all available nested envelopes (Category > Sub-Category)
  const allAvailableEnvelopesCatalog = useMemo(() => {
    const list: any[] = [];
    
    // Add target dynamic transfer options from accounts
    uniqueDbAccounts.forEach((acc: any) => {
      // Avoid archived accounts
      if (acc.isArchived) return;
      list.push({
        key: `transfer__${acc.id}`,
        label: `Fund Transfer ➔ ${acc.name}`,
        category: 'ACCOUNT FUND TRANSFERS',
        subcategory: acc.name,
        emoji: '🔄',
        nature: 'Want',
        accountId: acc.id
      });
    });

    sourceCategories.forEach((cat: any) => {
      if (!cat || !cat.name) return;
      const subs = Array.from(new Set(cat.subcategories || []));
      const parentName = cat.name === 'Food & Drinks' ? 'Food & Drink' : cat.name;
      
      if (subs.length > 0) {
        subs.forEach((sub: string) => {
          const key = `${cat.name}__${sub}`.replace(/\s+/g, '_').toLowerCase();
          list.push({
            key,
            label: `${parentName} > ${sub}`,
            category: parentName,
            subcategory: sub,
            emoji: cat.emoji || '📁',
            nature: cat.nature || 'Want'
          });
        });
      } else {
        const key = `${cat.name}__general`.replace(/\s+/g, '_').toLowerCase();
        list.push({
          key,
          label: `${parentName} > General`,
          category: parentName,
          subcategory: 'General',
          emoji: cat.emoji || '📁',
          nature: cat.nature || 'Want'
        });
      }
    });

    const uniqueList: any[] = [];
    const seenKeys = new Set<string>();
    list.forEach(item => {
      if (!seenKeys.has(item.key)) {
        seenKeys.add(item.key);
        uniqueList.push(item);
      }
    });

    return uniqueList;
  }, [sourceCategories, uniqueDbAccounts]);

  const groupedCatalog = useMemo(() => {
    const map: Record<string, { category: string; emoji: string; items: any[] }> = {};
    allAvailableEnvelopesCatalog.forEach(item => {
      const catName = item.category;
      if (!map[catName]) {
        map[catName] = {
          category: catName,
          emoji: item.emoji || '📁',
          items: []
        };
      }
      map[catName].items.push(item);
    });
    return Object.values(map);
  }, [allAvailableEnvelopesCatalog]);

  const verifiedSalaryLedger = useMemo(() => {
    return dbRecurringIncomes.find(item => (item.category === 'Salary' || (item.category === 'Income' && item.subcategory === 'Wage')) && Number(item.amount) > 0 && item.dayOption);
  }, [dbRecurringIncomes]);

  // Calculations: Calculate total aggregated budget drop by summing all checked multi-income sources
  const calculatedIncomeDrop = useMemo(() => {
    let sum = 0;
    dbRecurringIncomes.forEach(item => {
      if (selectedIncomes.includes(item.id)) {
        sum += Number(item.amount || 0);
      }
    });
    customAuxiliaries.forEach(item => {
      if (selectedIncomes.includes(item.id)) {
        sum += Number(item.amount || 0);
      }
    });
    return sum;
  }, [selectedIncomes, dbRecurringIncomes, customAuxiliaries]);

  // Calculations: Allocated custom budgets sum
  const sumAllocated = useMemo(() => {
    let sum = 0;
    customBudgets.forEach(b => {
      sum += Number(b.amount || 0);
    });
    return sum;
  }, [customBudgets]);

  const unallocatedBalance = calculatedIncomeDrop - sumAllocated;
  const isPerfectAllocation = Math.abs(unallocatedBalance) < 0.01;

  const getSourceAccountId = () => {
    const activeDbRec = dbRecurringIncomes.find(inc => selectedIncomes.includes(inc.id));
    if (activeDbRec && activeDbRec.accountId) {
      return activeDbRec.accountId;
    }
    return dbAccounts[0]?.id || '';
  };

  const isFuturePeriod = useMemo(() => {
    const [year, month] = selectedYearMonth.split('-').map(Number);
    const targetPeriodStartDate = new Date(year, month - 1, payday);
    const now = new Date();
    return now < targetPeriodStartDate;
  }, [selectedYearMonth, payday]);

  // Horizontal Navigation controls
  const handlePreviousMonth = () => {
    const [year, month] = selectedYearMonth.split('-').map(Number);
    const prevDate = new Date(year, month - 2, 1);
    const prevStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    setSelectedYearMonth(prevStr);
  };

  const handleNextMonth = () => {
    const [year, month] = selectedYearMonth.split('-').map(Number);
    const nextDate = new Date(year, month, 1);
    const nextStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
    setSelectedYearMonth(nextStr);
  };

  const getFriendlyMonthName = (yrMo: string) => {
    const [year, month] = yrMo.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    return date.toLocaleDateString(i18n.language || 'en-US', { month: 'long', year: 'numeric' });
  };

  const getSalaryBreakdownTitle = (yrMo: string) => {
    const [year, month] = yrMo.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    const monthName = date.toLocaleDateString(i18n.language || 'en-US', { month: 'long' });
    return `${monthName} ${t('salary_breakdown_modal.title', 'Salary Breakdown')}`;
  };

  const getOperationalDateSpanText = (yrMo: string, paydayVal: number) => {
    const [year, month] = yrMo.split('-').map(Number);
    const startDate = new Date(year, month - 1, paydayVal);
    const endDate = new Date(year, month, paydayVal - 1);
    
    const getOrdinalSuffix = (num: number) => {
      if (num > 3 && num < 21) return 'th';
      switch (num % 10) {
        case 1:  return "st";
        case 2:  return "nd";
        case 3:  return "rd";
        default: return "th";
      }
    };

    const startMonthName = startDate.toLocaleDateString(i18n.language || 'en-US', { month: 'long' });
    const endMonthName = endDate.toLocaleDateString(i18n.language || 'en-US', { month: 'long' });

    if (i18n.language && i18n.language !== 'en') {
      if (i18n.language === 'hi') {
        return `${startMonthName} के ${paydayVal} से ${endMonthName} के ${endDate.getDate()} तक`;
      }
      if (i18n.language === 'es') {
        return `Del ${paydayVal} de ${startMonthName} al ${endDate.getDate()} de ${endMonthName}`;
      }
      if (i18n.language === 'ru') {
        return `С ${paydayVal} ${startMonthName} по ${endDate.getDate()} ${endMonthName}`;
      }
      if (i18n.language === 'ar') {
        return `من ${paydayVal} ${startMonthName} إلى ${endDate.getDate()} ${endMonthName}`;
      }
      if (i18n.language === 'ko') {
        return `${startMonthName} ${paydayVal}일부터 ${endMonthName} ${endDate.getDate()}日まで`;
      }
      if (i18n.language === 'ur') {
        return `${paydayVal} ${startMonthName} سے ${endDate.getDate()} ${endMonthName} تک`;
      }
    }

    return `From ${paydayVal}${getOrdinalSuffix(paydayVal)} of ${startMonthName} until ${endDate.getDate()}${getOrdinalSuffix(endDate.getDate())} of ${endMonthName}`;
  };

  const handleAllocationChange = (key: string, value: string) => {
    const numericValue = value === '' ? 0 : Math.max(0, parseFloat(value) || 0);
    setAllocations(prev => ({
      ...prev,
      [key]: numericValue
    }));
  };

  const toggleIncomeSelection = async (id: string) => {
    const isAdding = !selectedIncomes.includes(id);
    setSelectedIncomes(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );

    if (isAdding && profile?.uid) {
      const matchedInc = dbRecurringIncomes.find(x => x.id === id);
      if (matchedInc) {
        try {
          const incRef = doc(db, `users/${profile.uid}/recurringTransactions`, id);
          const yearMonthParts = selectedYearMonth.split('-');
          const year = parseInt(yearMonthParts[0]);
          const month = parseInt(yearMonthParts[1]);
          const nextDateStr = `${year}-${String(month).padStart(2, '0')}-${String(payday).padStart(2, '0')}`;

          await setDoc(incRef, {
            dayOption: String(payday),
            nextGenerationDate: nextDateStr,
            updatedAt: serverTimestamp()
          }, { merge: true });
        } catch (err) {
          console.error("Failed to automatically align schedule date on selection:", err);
        }
      }
    }
  };

  const handleOpenClassificationPrompt = () => {
    if (!auxTitle.trim() || !auxAmount) return;
    setShowClassificationPrompt(true);
  };

  const handleSelectOneTime = () => {
    if (!auxTitle.trim() || !auxAmount) return;
    const newItem: CustomAuxiliaryIncome = {
      id: `aux_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      title: auxTitle.trim(),
      amount: Number(auxAmount),
      isOneTime: true
    };
    setCustomAuxiliaries(prev => [...prev, newItem]);
    setSelectedIncomes(prev => [...prev, newItem.id]);
    setAuxTitle('');
    setAuxAmount('');
    setShowClassificationPrompt(false);
  };

  const handleSelectRecurring = async () => {
    if (!profile?.uid || !auxTitle.trim() || !auxAmount) return;
    try {
      const recRef = doc(collection(db, `users/${profile.uid}/recurringTransactions`));
      
      const targetDay = payday;
      const yearMonthParts = selectedYearMonth.split('-');
      const year = parseInt(yearMonthParts[0]);
      const month = parseInt(yearMonthParts[1]);
      const nextDateStr = `${year}-${String(month).padStart(2, '0')}-${String(payday).padStart(2, '0')}`;
      const lastDateStr = new Date().toISOString().split('T')[0];

      const docId = recRef.id;
      const exactPayload = {
        // Legacy compatibility
        id: docId,
        type: 'income',
        amount: Number(auxAmount),
        notes: auxTitle.trim(),
        recurrency: 'monthly',
        interval: 1,
        category: 'Salary',
        subcategory: 'Wages',
        accountId: dbAccounts[0]?.id || '',
        isActive: true,
        notification: true,
        lastGeneratedDate: lastDateStr,
        nextGenerationDate: nextDateStr,

        // Exact new payload
        recurringId: docId,
        userId: profile.uid,
        title: auxTitle.trim(),
        transactionType: 'income',
        frequency: 'Monthly',
        sourceAccountId: dbAccounts[0]?.id || '',
        destinationAccountId: null,
        startDate: lastDateStr,
        nextExecutionDate: nextDateStr,
        dayOption: Number(targetDay) || 28,
        isBreakdownConfigured: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await setDoc(recRef, exactPayload);

      setSelectedIncomes(prev => [...prev, docId]);
      setAuxTitle('');
      setAuxAmount('');
      setShowClassificationPrompt(false);
    } catch (err) {
      console.error("Failed to write recurring transaction schedule rule:", err);
    }
  };

  const removeCustomIncomeStream = (id: string) => {
    setCustomAuxiliaries(prev => prev.filter(x => x.id !== id));
    setSelectedIncomes(prev => prev.filter(x => x !== id));
  };

  const handleSaveRecurringSchedule = async () => {
    if (!profile?.uid || !newIncomeAmount) return;
    setIsSavingSchedule(true);
    try {
      if (newIncomeType === 'onetime') {
        // Handle One-time Bonus / Income
        const newAux: CustomAuxiliaryIncome = {
          id: `aux-${Date.now()}`,
          title: newIncomeNotes.trim() || 'One-time Bonus',
          amount: Number(newIncomeAmount),
          isOneTime: true
        };
        setCustomAuxiliaries(prev => [...prev, newAux]);
        setSelectedIncomes(prev => [...prev, newAux.id]);
        setIsCreatingSchedule(false);
        setIsSavingSchedule(false);
        return;
      }

      const recRef = doc(collection(db, `users/${profile.uid}/recurringTransactions`));
      
      const originalDate = new Date();
      const nextDate = new Date();
      nextDate.setMonth(nextDate.getMonth() + 1);
      const nextDateStr = nextDate.toISOString().split('T')[0];
      const lastDateStr = originalDate.toISOString().split('T')[0];

      const docId = recRef.id;
      const targetDay = nextDate.getDate();
      const freq = newIncomeRecurrency ? (newIncomeRecurrency.charAt(0).toUpperCase() + newIncomeRecurrency.slice(1)) : 'Monthly';

      const exactPayload = {
        // Legacy compatibility
        id: docId,
        type: 'income',
        amount: Number(newIncomeAmount),
        notes: newIncomeNotes.trim() || 'Monthly Payroll',
        recurrency: newIncomeRecurrency,
        interval: 1,
        category: 'Salary',
        subcategory: 'Wages',
        accountId: newIncomeAccountId || (dbAccounts[0]?.id || ''),
        isActive: true,
        notification: true,
        lastGeneratedDate: lastDateStr,
        nextGenerationDate: nextDateStr,

        // Exact new payload
        recurringId: docId,
        userId: profile.uid,
        title: newIncomeNotes.trim() || 'Monthly Payroll',
        transactionType: 'income',
        frequency: freq,
        sourceAccountId: newIncomeAccountId || (dbAccounts[0]?.id || ''),
        destinationAccountId: null,
        startDate: lastDateStr,
        nextExecutionDate: nextDateStr,
        dayOption: targetDay,
        isBreakdownConfigured: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await setDoc(recRef, exactPayload);

      setSelectedIncomes(prev => [...prev, docId]);
      setIsCreatingSchedule(false);
    } catch (err) {
      console.error("Failed to save recurring income stream:", err);
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const handleOpenCreateBudget = () => {
    setEditingBudgetId(null);
    setFormBudgetName('');
    setFormBudgetAmount('');
    setFormAssignedCategories([]);
    setIsBudgetModalOpen(true);
  };

  const handleOpenEditBudget = (budget: CustomBudget) => {
    setEditingBudgetId(budget.id);
    setFormBudgetName(budget.name);
    setFormBudgetAmount(budget.amount);
    setFormAssignedCategories(budget.assignedCategories || []);
    setIsBudgetModalOpen(true);
  };

  const handleSaveBudgetForm = () => {
    if (!formBudgetName.trim()) return;
    const amountVal = typeof formBudgetAmount === 'number' ? formBudgetAmount : parseFloat(formBudgetAmount) || 0;

    if (editingBudgetId) {
      setCustomBudgets(prev => prev.map(b => b.id === editingBudgetId ? {
        ...b,
        name: formBudgetName.trim(),
        amount: amountVal,
        assignedCategories: formAssignedCategories
      } : b));
    } else {
      const newBudget: CustomBudget = {
        id: `b_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        name: formBudgetName.trim(),
        assignedCategories: formAssignedCategories,
        amount: amountVal
      };
      setCustomBudgets(prev => [...prev, newBudget]);
    }
    setIsBudgetModalOpen(false);
  };

  const handleDeleteBudget = (budgetId: string) => {
    setCustomBudgets(prev => prev.filter(b => b.id !== budgetId));
  };

  const handleBudgetAmountChange = (budgetId: string, value: string) => {
    const numericValue = value === '' ? 0 : Math.max(0, parseFloat(value) || 0);
    setCustomBudgets(prev => prev.map(b => b.id === budgetId ? { ...b, amount: numericValue } : b));
  };

  const [showMismatchWarning, setShowMismatchWarning] = useState(false);
  const [mismatchTargetDay, setMismatchTargetDay] = useState<number | null>(null);

  const commitAllocation = async (targetPayday: number) => {
    if (!profile?.uid) return;
    setIsLoading(true);
    setSaveStatus('idle');

    try {
      const batch = writeBatch(db);

      // Save user profile settings to keep synced
      const userRef = doc(db, `users/${profile.uid}`);
      batch.set(userRef, {
        baseSalary: calculatedIncomeDrop,
        payday: targetPayday,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // 2. Save active month target variables inside the blueprint matching month
      const blueprintRef = doc(db, `users/${profile.uid}/salaryBreakdowns/${selectedYearMonth}`);
      const selectedDbRecurring = dbRecurringIncomes.filter(inc => selectedIncomes.includes(inc.id));
      
      batch.set(blueprintRef, {
        baseSalary: calculatedIncomeDrop,
        baseSalaryInput: calculatedIncomeDrop,
        payday: targetPayday,
        customBudgets,
        selectedIncomes,
        customAuxiliaries,
        selectedDbRecurringIncomes: selectedDbRecurring,
        allAvailableEnvelopesCatalog,
        isConfirmed: false, // Lives as pending/upcoming
        isBreakdownConfigured: true, // Configured flag to clear alert prompts
        confirmedAllocations: {}, // To track independent line confirms
        tier1Approved: false, // Baseline approval step
        yearMonth: selectedYearMonth,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // Clean up any old pending transactions for this payroll period to avoid duplication
      const existingTxsQuery = query(
        collection(db, `users/${profile.uid}/transactions`),
        where('salaryBreakdownPeriod', '==', selectedYearMonth)
      );
      const existingTxsSnap = await getDocs(existingTxsQuery);
      existingTxsSnap.docs.forEach(docSnap => {
        batch.delete(doc(db, `users/${profile.uid}/transactions`, docSnap.id));
      });

      // Synchronize exact total value directly to selected recurring income documents inside the batch, and flag isBreakdownConfigured
      // CRITICAL: Only overwrite the amount if there is EXACTLY one income source to avoid multi-income corruption.
      const totalIncomeSourcesCount = selectedDbRecurring.length + customAuxiliaries.length;
      selectedDbRecurring.forEach(inc => {
        const ref = doc(db, `users/${profile.uid}/recurringTransactions`, inc.id);
        batch.update(ref, {
          isBreakdownConfigured: true,
          updatedAt: serverTimestamp()
        });
      });

      // Commit the atomic batch
      await batch.commit();

      setSaveStatus('success');
      onSuccess();
      setTimeout(() => {
        onClose();
        setSaveStatus('idle');
      }, 1500);

    } catch (err) {
      console.error("Failed to commit breakdown parameters:", err);
      setSaveStatus('error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmAllocation = async () => {
    const selectedDbRecurring = dbRecurringIncomes.filter(inc => selectedIncomes.includes(inc.id));
    const mismatchItem = selectedDbRecurring.find(inc => inc.dayOption && Number(inc.dayOption) !== Number(payday));

    if (mismatchItem) {
      setMismatchTargetDay(Number(mismatchItem.dayOption));
      setShowMismatchWarning(true);
      return;
    }

    try {
      if (profile?.uid) {
        const batch = writeBatch(db);
        
        for (const budget of customBudgets) {
          if (Number(budget.amount) > 0) {
            const deterministicId = `${selectedYearMonth}_budget_${budget.id}`;
            const budRef = doc(db, `users/${profile.uid}/miniBudgets`, deterministicId);
            
            batch.set(budRef, {
              userId: profile.uid,
              categoryTitle: budget.name,
              assignedCategories: budget.assignedCategories,
              allocatedAmount: Number(budget.amount),
              spentAmount: 0,
              currency: activeBaseCurrency,
              period: selectedYearMonth,
              categoryGroup: 'wants',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            }, { merge: true });
          }
        }
        await batch.commit();
      }
    } catch (err) {
      console.error("Failed to auto-create budgets from custom budgets:", err);
    }

    await commitAllocation(payday);
  };

  const handleConfirmOverride = async () => {
    setShowMismatchWarning(false);
    if (mismatchTargetDay !== null) {
      setPayday(mismatchTargetDay);
      await commitAllocation(mismatchTargetDay);
    }
  };

  const toggleEnvelopeActiveState = (key: string) => {
    setActiveEnvelopes(prev => {
      const isSelected = prev.includes(key);
      if (isSelected) {
        // Toggle off
        return prev.filter(k => k !== key);
      } else {
        // Toggle on
        return [...prev, key];
      }
    });
  };

  const onDragEnd = (result: any) => {
    if (!result.destination) return;

    const newEnvelopes = Array.from(activeEnvelopes);
    const [reorderedItem] = newEnvelopes.splice(result.source.index, 1);
    newEnvelopes.splice(result.destination.index, 0, reorderedItem);

    setActiveEnvelopes(newEnvelopes);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
        {/* Modal Window Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full max-w-[700px] max-h-[90vh] sm:max-h-[85vh] bg-white flex flex-col rounded-2xl overflow-hidden mx-auto shadow-2xl"
        >
          {/* Spend from Existing Account Modal */}
          <SpendFromAccountModal
            isOpen={showSpendFromAccountModal}
            onClose={() => setShowSpendFromAccountModal(false)}
            accounts={uniqueDbAccounts}
            onSave={(accountId, amount) => {
              const account = uniqueDbAccounts.find(acc => acc.id === accountId);
              const title = account ? `Spend from: ${account.name}` : "Spend from account";
              setCustomAuxiliaries(prev => [...prev, { id: `transfer__${accountId}`, title, amount }]);
              
              setDoc(doc(db, `users/${profile.uid}/salaryBreakdowns/${selectedYearMonth}`), {
                override: {
                  accountId,
                  amount
                }
              }, { merge: true });
              setShowSpendFromAccountModal(false);
            }}
          />
          
          {/* Calendar Date Mismatch Guard Warning Modal */}
          <AnimatePresence>
            {showMismatchWarning && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-[#FFFFFF] z-[300] flex flex-col items-center justify-center p-6 text-center animate-fade-in"
              >
                <div className="w-14 h-14 bg-amber-50 border border-amber-100 rounded-full flex items-center justify-center text-amber-500 mb-6">
                  <AlertCircle size={28} />
                </div>
                
                <h3 className="text-[#111C2D] text-[18px] font-bold mb-3 leading-tight" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                  Payday Synchronization Mismatch
                </h3>
                
                 <p className="text-[#57606F] text-[14px] leading-relaxed mb-6 max-w-sm" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                   The chosen transaction timeline does not coordinate with your core payroll anchor parameters. Do you wish to override and adjust your system cycle?
                 </p>
                <div className="flex flex-col gap-3 w-full">
                  <button
                    type="button"
                    onClick={handleConfirmOverride}
                    className="w-full py-3.5 bg-[#A6DDB1] text-[#1E293B] rounded-[14px] text-[14px] transition-all cursor-pointer hover:brightness-105 active:scale-[0.98] font-bold shadow-sm"
                    style={{ fontFamily: "'Google Sans', sans-serif" }}
                  >
                    Confirm override and adjust
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowMismatchWarning(false)}
                    className="w-full py-3.5 bg-white border border-[#E1E8ED] text-[#57606F] rounded-[14px] text-[14px] transition-all cursor-pointer hover:bg-neutral-50 font-normal"
                    style={{ fontFamily: "'Google Sans', sans-serif" }}
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Removed legacy style overrides */}

          {/* Premium white canvas loading overlay */}
          {isLoading && (
            <div className="absolute inset-0 bg-[#FFFFFF] z-[300] flex flex-col items-center justify-center p-3 text-center animate-fade-in" style={{ padding: '12px' }}>
              <div className="w-10 h-10 border-4 border-[#4F46E5] border-t-transparent rounded-full animate-spin mb-4" />
              <span className="text-neutral-800 text-sm premium-loader-heading mb-1 block">
                {t('salary_breakdown_modal.confirming_allocations', 'Confirming allocations...')}
              </span>
              <p className="text-xs text-neutral-500 premium-loader-subtext leading-relaxed max-w-[280px]">
                {t('salary_breakdown_modal.updating_ledger', 'updating ledger balances and establishing planned envelopes')}
              </p>
            </div>
          )}

           <div className="sticky top-0 z-20 bg-white border-b border-[#E1E8ED] w-full">
             <div className="flex items-center justify-between p-3 w-full relative">
               <div className="w-8" />
               <h2 className="text-[#111C2D] text-base font-bold leading-tight text-center flex-1">
                 {t('salary_breakdown_modal.title', 'Income Breakdown')}
               </h2>
               <button type="button" onClick={onClose} className="p-1.5 hover:bg-neutral-50 rounded-full transition-colors">
                 <X size={18} className="text-[#111C2D]" />
               </button>
             </div>
             {/* Month Selector */}
             <div className="flex flex-col items-center pb-2.5 text-[#111C2D] w-full">
               <div className="flex items-center justify-between w-full px-4">
                 <button onClick={handlePreviousMonth} className="flex items-center gap-1 text-[#111C2D] group">
                   <div className="rounded-full bg-neutral-50 p-2 group-hover:bg-neutral-100 transition-colors">
                     <ChevronLeft size={16} />
                   </div>
                   <span className="text-sm font-medium">{t('salary_breakdown_modal.previous', 'Previous')}</span>
                 </button>
                 <div className="border border-[#E1E8ED] bg-white rounded-lg px-4 py-1.5 shadow-sm flex items-center justify-center">
                   <h4 className="text-[#111C2D] font-bold text-base leading-none m-0">{getFriendlyMonthName(selectedYearMonth)}</h4>
                 </div>
                 <button onClick={handleNextMonth} className="flex items-center gap-1 text-[#111C2D] group">
                   <span className="text-sm font-medium">{t('salary_breakdown_modal.next', 'Next')}</span>
                   <div className="rounded-full bg-neutral-50 p-2 group-hover:bg-neutral-100 transition-colors">
                     <ChevronRight size={16} />
                   </div>
                 </button>
               </div>
             </div>
           </div>

          <AnimatePresence mode="wait">
            {isCreatingSchedule ? (
              <motion.div
                key="create-schedule-pane"
                initial={{ x: '100%', opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: '100%', opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="flex-1 overflow-y-auto p-4 flex flex-col justify-between bg-white space-y-4"
              >
                <div className="space-y-4">
                  {/* Header inside creator */}
                  <div className="flex items-center gap-2 border-b border-neutral-800 pb-3">
                    <div className="w-8 h-8 rounded-xl bg-[#A6DDB1] flex items-center justify-center border border-[#366945]">
                      <Coins size={14} className="text-white" />
                    </div>
                    <div className="flex flex-col">
                      <span className="breakdown-secondary-text text-[#1E2229]">
                        {newIncomeType === 'recurring' 
                          ? t('salary_breakdown_modal.create_income_stream', 'Create recurring income stream')
                          : t('salary_breakdown_modal.create_onetime_income', 'Log one-time income / bonus')}
                      </span>
                      <span className="breakdown-secondary-text text-[#57606F]">
                        {newIncomeType === 'recurring'
                          ? t('salary_breakdown_modal.establish_source', 'Establish a dynamic incoming source')
                          : t('salary_breakdown_modal.establish_onetime_source', 'Add a unique income for this period')}
                      </span>
                    </div>
                  </div>

                  {/* Type Selector */}
                  <div className="flex p-1 bg-neutral-50 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setNewIncomeType('recurring')}
                      className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${newIncomeType === 'recurring' ? 'bg-white text-[#111C2D] shadow-sm' : 'text-[#57606F] hover:text-[#111C2D]'}`}
                    >
                      {t('salary_breakdown_modal.recurring', 'Recurring')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewIncomeType('onetime')}
                      className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${newIncomeType === 'onetime' ? 'bg-white text-[#111C2D] shadow-sm' : 'text-[#57606F] hover:text-[#111C2D]'}`}
                    >
                      {t('salary_breakdown_modal.onetime_bonus', 'One-time / Bonus')}
                    </button>
                  </div>

                  {/* Inputs */}
                  <div className="space-y-3.5">
                    <div className="flex flex-col gap-1.5">
                      <label className="breakdown-secondary-text text-[#1E2229]">{t('salary_breakdown_modal.income_source_name', 'Income Source Name')}</label>
                      <input 
                        type="text"
                        value={newIncomeNotes}
                        onChange={(e) => setNewIncomeNotes(e.target.value)}
                        placeholder="Enter source name (e.g., Monthly Payroll)"
                        className="w-full bg-white border border-[#D1D5DB] text-sm text-[#111C2D] p-3 rounded-[12px] outline-none"
                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="breakdown-secondary-text text-[#1E2229]">{t('salary_breakdown_modal.amount', 'Amount')} ({activeBaseCurrency})</label>
                      <input 
                        type="number"
                        min="0"
                        value={(newIncomeAmount === '' || isNaN(Number(newIncomeAmount))) ? '' : newIncomeAmount}
                        onChange={(e) => setNewIncomeAmount(e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value) || 0))}
                        placeholder="e.g., 12000"
                        className="w-full bg-[#FFFFFF] border border-[#E5E7EB] text-[#1E2229] p-3 rounded-[12px] outline-none breakdown-secondary-text"
                      />
                    </div>

                    <div className="w-full ml-0 pl-0 mb-0 flex flex-col gap-1.5">
                      <label className="breakdown-secondary-text text-[#1E2229]">{t('salary_breakdown_modal.destination_account', 'Destination Account')}</label>
                      <select
                        value={newIncomeAccountId}
                        onChange={(e) => setNewIncomeAccountId(e.target.value)}
                        className="w-full ml-0 bg-[#FFFFFF] border border-[#E5E7EB] text-[#1E2229] p-3 pl-[12px] pr-[12px] rounded-[12px] outline-none breakdown-secondary-text cursor-pointer appearance-none"
                      >
                        <option value="" disabled>{t('salary_breakdown_modal.select_account', 'Select Target Account...')}</option>
                        {uniqueDbAccounts.map((acc, index) => (
                          <option key={`account-option-${acc.id}-${index}`} value={acc.id} className="bg-white text-[#1E2229]">
                            {acc.name} ({acc.currency})
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={onOpenPremiumModal}
                      className="w-full text-xs font-bold text-emerald-600 underline text-center"
                    >
                      Do you want to explore other options?
                    </button>

                    {newIncomeType === 'recurring' && (
                      <>
                        <div className="flex flex-col gap-1.5 w-full">
                          <label className="breakdown-secondary-text text-[#1E2229]">{t('salary_breakdown_modal.frequency', 'Recurrency Frequency')}</label>
                          <select
                            value={newIncomeRecurrency}
                            onChange={(e) => setNewIncomeRecurrency(e.target.value)}
                            className="w-full bg-[#FFFFFF] border border-[#E5E7EB] text-[#1E2229] p-3 rounded-[12px] outline-none breakdown-secondary-text cursor-pointer appearance-none"
                          >
                            <option value="daily">{t('frequency_daily', 'Daily')}</option>
                            <option value="weekly">{t('frequency_weekly', 'Weekly')}</option>
                            <option value="monthly">{t('frequency_monthly', 'Monthly')}</option>
                            <option value="yearly">{t('frequency_yearly', 'Yearly')}</option>
                          </select>
                        </div>

                        <div className="flex flex-col gap-1.5 w-full">
                          <label className="breakdown-secondary-text text-[#1E2229]">{t('salary_breakdown_modal.payroll_day', 'Payroll Day')}</label>
                          <select
                            value={isNaN(newIncomePayday) ? 28 : newIncomePayday}
                            onChange={(e) => setNewIncomePayday(Number(e.target.value) || 28)}
                            className="w-full bg-[#FFFFFF] border border-[#E5E7EB] text-[#1E2229] p-3 rounded-[12px] outline-none breakdown-secondary-text cursor-pointer appearance-none"
                          >
                            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                              <option key={`create-day-${day}`} value={day} className="bg-white text-[#1E2229]">
                                {t('salary_breakdown_modal.day', 'Day')} {day}
                              </option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Save Button Row */}
                <div className="pt-4 border-t border-neutral-200 flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsCreatingSchedule(false)}
                    className="flex-1 py-2.5 bg-white border border-[#E1E8ED] text-[#1E2229] breakdown-secondary-text rounded-[12px] hover:bg-neutral-50 transition-all cursor-pointer font-normal text-center"
                  >
                    {t('salary_breakdown_modal.cancel', 'Cancel')}
                  </button>
                  <button
                    type="button"
                    disabled={isSavingSchedule || !newIncomeAmount}
                    onClick={handleSaveRecurringSchedule}
                    style={{ 
                      backgroundColor: newIncomeAmount ? '#A6DDB1' : '#F3F5F7',
                      color: newIncomeAmount ? '#1E293B' : '#9CA3AF' 
                    }}
                    className={`flex-1 py-2.5 breakdown-secondary-text rounded-xl transition-all font-normal text-center flex items-center justify-center gap-1.5 ${
                      newIncomeAmount ? 'hover:brightness-95 active:scale-95 cursor-pointer' : 'cursor-not-allowed border border-neutral-200'
                    }`}
                  >
                    {isSavingSchedule ? (
                      <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <span style={{ fontSize: '16px' }}>{t('salary_breakdown_modal.save_link_stream', 'Save & Link Stream')}</span>
                    )}
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="main-allocation-pane"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 overflow-y-auto bg-white w-full"
              >
                <div className="px-4 py-2 space-y-2 flex flex-col w-full">

                  {/* Income Transactions and Payroll Settings Wrapper */}
                  <div className="space-y-2.5 w-full">

                    {/* SECTION HEADER: SELECT INCOME TRANSACTIONS */}
                    <div className="space-y-3">
                      <div 
                        onClick={() => {
                          if (dbRecurringIncomes.length > 0) {
                            setIsIncomeListExpanded(!isIncomeListExpanded);
                          }
                        }}
                        className={`flex items-center justify-between group ${dbRecurringIncomes.length > 0 ? 'cursor-pointer' : ''}`}
                      >
                        <div className="flex flex-col gap-0.5">
                          <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 500 }} className="text-[12px] text-[#57606F] font-bold">{t('salary_breakdown_modal.select_income_transactions', 'Select Income Transactions')}</span>
                        </div>
                      </div>

                      {/* DYNAMIC INCOME CHANNELS */}
                      <div className="flex flex-col w-full px-2 p-2 space-y-3">
                        {dbRecurringIncomes.length === 0 && customAuxiliaries.length === 0 ? (
                           <div className="flex flex-col items-center text-center py-8 bg-white rounded-xl border border-[#E1E8ED] space-y-4">
                             <div className="h-12 w-12 rounded-full bg-neutral-50 flex items-center justify-center text-neutral-400">
                               <Coins size={24} />
                             </div>
                             <div className="space-y-1">
                               <p className="text-sm font-bold text-[#111C2D]">{t('salary_overview.no_income_sources_linked', 'No income sources linked')}</p>
                               <p className="text-xs text-[#57606F]">{t('salary_overview.link_recurring_stream', 'Link a recurring stream to begin allocation')}</p>
                             </div>
                             <div className="flex gap-2">
                               <button
                                 type="button"
                                 onClick={() => setIsCreatingSchedule(true)}
                                 className="px-4 py-2 bg-[#A6DDB1] text-[#366945] rounded-lg text-xs font-bold hover:brightness-95 active:scale-95 transition-all cursor-pointer shadow-sm"
                               >
                                 <span>{t('salary_overview.link_first_income_source', 'Link First Income Source')}</span>
                               </button>
                               <button
                                 type="button"
                                 onClick={() => setShowSpendFromAccountModal(true)}
                                 className="px-4 py-2 bg-[#E1E8ED] text-[#111C2D] rounded-lg text-xs font-bold hover:brightness-95 active:scale-95 transition-all cursor-pointer shadow-sm"
                               >
                                 <span>{t('salary_overview.spend_from_existing_account', 'Spend from existing account')}</span>
                               </button>
                             </div>
                           </div>
                        ) : (
                          <div className="space-y-3 w-full">
                            {/* DB Recurring Incomes */}
                            {dbRecurringIncomes.map((inc, index) => (
                              <div 
                                key={`income-stream-${inc.id}-${index}`}
                                onClick={() => toggleIncomeSelection(inc.id)}
                                className="bg-white border border-[#E1E8ED] rounded-xl p-4 flex items-center justify-between gap-4 cursor-pointer transition-all w-full min-w-0"
                              >
                                <div className="flex items-center gap-4 min-w-0 flex-1">
                                  <div className="min-w-0 flex-1 text-left rtl:text-right">
                                      <p 
                                        className="text-sm text-[#111C2D] whitespace-nowrap" 
                                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                                      >
                                        {inc.notes || inc.title || 'Income'}
                                      </p>
                                      <p 
                                        className="text-xs text-[#57606F]"
                                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                                      >
                                        Primary Source
                                      </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2.5 shrink-0">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setIsEditPayrollModalOpen(true);
                                      }}
                                      className="p-1.5 rounded-lg text-gray-400 hover:text-[#366945] hover:bg-[#E8F8EE] transition-all border-none cursor-pointer flex items-center justify-center"
                                      title={t('edit_payroll.edit', 'Edit Monthly Payroll')}
                                    >
                                      <Edit2 size={15} />
                                    </button>
                                    <p 
                                      className="text-sm"
                                      style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, color: '#1B5E20' }}
                                    >
                                      +{activeBaseCurrency} {Number((inc.periodOverrides && inc.periodOverrides[selectedYearMonth] !== undefined ? inc.periodOverrides[selectedYearMonth] : inc.amount) || 0).toLocaleString()}
                                    </p>
                                    <div className={`w-6 h-6 rounded-md border flex items-center justify-center transition-colors shrink-0 ${selectedIncomes.includes(inc.id) ? 'bg-[#2E7D32] border-[#2E7D32]' : 'bg-white border-[#D1D5DB]'}`}>
                                      {selectedIncomes.includes(inc.id) && <Check size={16} className="text-white" />}
                                    </div>
                                </div>
                              </div>
                            ))}
                            
                            {/* Custom Auxiliaries */}
                            {customAuxiliaries.map((aux, index) => (
                              <div 
                                key={`custom-aux-${aux.id}-${index}`}
                                onClick={() => toggleIncomeSelection(aux.id)}
                                className="bg-white border border-[#E1E8ED] rounded-xl p-4 flex items-center justify-between gap-4 cursor-pointer transition-all w-full min-w-0"
                              >
                                <div className="flex items-center gap-4 min-w-0 flex-1">
                                  <div className="min-w-0 flex-1 text-left rtl:text-right">
                                    <p className="text-sm text-[#111C2D] whitespace-nowrap" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}>
                                      {aux.title}
                                    </p>
                                    <p className="text-xs text-[#57606F]" style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>
                                      {t('special_linked_source', 'Special Linked Source')}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-4 shrink-0">
                                  <p className="text-sm font-bold text-[#1B5E20]" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                                    +{activeBaseCurrency} {Number(aux.amount || 0).toLocaleString()}
                                  </p>
                                  <div className={`w-6 h-6 rounded-md border flex items-center justify-center transition-colors shrink-0 ${selectedIncomes.includes(aux.id) ? 'bg-[#2E7D32] border-[#2E7D32]' : 'bg-white border-[#D1D5DB]'}`}>
                                    {selectedIncomes.includes(aux.id) && <Check size={16} className="text-white" />}
                                  </div>
                                </div>
                              </div>
                            ))}

                            <button
                              type="button"
                              onClick={() => setIsCreatingSchedule(true)}
                              className="w-full flex items-center justify-center gap-2 p-3 mt-1 bg-white border border-dashed border-[#E5E7EB] text-[#57606F] rounded-xl hover:bg-neutral-50 hover:border-[#A6DDB1] hover:text-[#366945] transition-all cursor-pointer group"
                            >
                              <Plus size={16} className="text-[#57606F] group-hover:text-[#366945]" />
                              <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 500 }} className="text-xs">{t('add_different_income_source', 'Add different income source')}</span>
                            </button>

                            {/* Detected Recent Transactions */}
                            {recentIncomeTransactions.length > 0 && (
                              <div className="pt-4 space-y-3">
                                <div className="flex items-center gap-2 px-1">
                                  <div className="h-1 w-1 rounded-full bg-[#A6DDB1]" />
                                  <span className="text-[12px] font-normal text-[#57606F]">{t('detected_recent_incomes', 'Detected Recent Incomes')}</span>
                                </div>
                                
                                {recentIncomeTransactions.filter(tx => !dbRecurringIncomes.some(inc => inc.title === tx.notes || inc.notes === tx.notes)).map((tx, index) => (
                                  <div 
                                    key={`detected-tx-${tx.id}-${index}`}
                                    className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-3 flex items-center justify-between opacity-80 hover:opacity-100 transition-all group"
                                  >
                                    <div className="flex items-center gap-4">
                                      <div className="h-9 w-9 rounded-full bg-white border border-[#E5E7EB] flex items-center justify-center text-neutral-400">
                                        <Calendar size={16} />
                                      </div>
                                      <div>
                                        <p className="text-sm font-bold text-[#111C2D]" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                                          {tx.notes || t('income_transaction', 'Income Transaction')}
                                        </p>
                                        <p className="text-[12px] text-[#57606F]" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                                          {t('recorded_on', 'Recorded on')} {new Date(tx.date).toLocaleDateString()}
                                        </p>
                                      </div>
                                    </div>
                                    <button 
                                      onClick={() => {
                                        setNewIncomeNotes(tx.notes || 'Monthly Payroll');
                                        setNewIncomeAmount(tx.amount);
                                        setNewIncomeAccountId(tx.accountId);
                                        setIsCreatingSchedule(true);
                                      }}
                                      className="px-3 py-1.5 bg-white border border-[#E5E7EB] text-[#111C2D] rounded-lg text-[12px] font-bold hover:border-[#A6DDB1] hover:text-[#366945] transition-all"
                                    >
                                      {t('link_source', 'Link Source')}
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Envelope Categories List (Managed via custom wizard toggles) */}
                  <div className="flex flex-col gap-2 flex-1 min-h-[180px] w-full px-4 mx-auto">
                    
                    {/* Header with "+ Create Budget" button */}
                    <div className="flex items-center justify-between px-0.5 mb-2">
                      <span className="text-[12px] text-neutral-400 font-normal">{t('salary_breakdown_modal.budget_allocation', 'Budget Allocation')}</span>
                      <button
                        type="button"
                        onClick={handleOpenCreateBudget}
                        style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}
                        className="text-[#1E293B] bg-[#A6DDB1] hover:brightness-105 active:scale-95 text-[12px] px-3 py-1.5 rounded-lg transition-all cursor-pointer border-none outline-none select-none flex items-center gap-1.5"
                      >
                        <Plus size={14} />
                        <span>{t('salary_breakdown.create_budget', 'Create Budget')}</span>
                      </button>
                    </div>

                    {/* Inner custom budgets list */}
                    <div className="border border-[#E1E8ED] rounded-[12px] p-2 space-y-2 max-h-[350px] overflow-y-auto">
                      {customBudgets.map((budget, index) => {
                        return (
                          <div 
                            key={`custom-budget-${budget.id}`}
                            className="bg-white border border-[#E1E8ED] p-3 rounded-[12px] flex flex-col gap-1 transition-all hover:border-[#A6DDB1]"
                          >
                            <div className="flex flex-col gap-1 w-full">
                              <div className="flex items-center gap-2 w-full">
                                <span className="w-6 h-6 rounded-full bg-[#f0f9f1] text-[#2E7D32] flex items-center justify-center text-xs font-bold shrink-0">
                                  {index + 1}
                                </span>
                                <span 
                                  style={{ fontFamily: "'Google Sans', sans-serif", fontSize: '14px' }}
                                  className="text-[14px] text-slate-800 font-bold truncate flex-1"
                                >
                                  {budget.name}
                                </span>
                              </div>

                              <div className="flex items-center justify-between gap-3 pl-8 w-full">
                                <div className="relative flex items-center flex-1 h-[34px]">
                                  <span className="absolute left-3 text-[12px] text-zinc-400 font-normal leading-none pointer-events-none">{activeBaseCurrency}</span>
                                  <input 
                                    type="number"
                                    placeholder="0"
                                    min="0"
                                    value={budget.amount === 0 ? '' : budget.amount}
                                    onChange={(e) => handleBudgetAmountChange(budget.id, e.target.value)}
                                    className="w-full h-full bg-[#ffffff] rounded-[10px] border border-[#E1E8ED] text-right focus:border-[#A6DDB1] pr-3 pl-10 text-[14px] text-[#1E2229] outline-none font-bold transition-all"
                                  />
                                </div>
                                <div className="flex flex-col gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditBudget(budget)}
                                    className="w-[32px] h-[32px] flex items-center justify-center rounded-[8px] bg-neutral-100 text-neutral-600 hover:bg-neutral-200 transition-colors shrink-0"
                                    title="Edit budget & categories"
                                  >
                                    <Edit2 size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteBudget(budget.id)}
                                    className="w-[32px] h-[32px] flex items-center justify-center rounded-[8px] bg-red-50 text-red-500 hover:bg-red-100 transition-colors shrink-0"
                                    title="Delete budget"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Assigned category chips */}
                            {budget.assignedCategories && budget.assignedCategories.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1 pl-8">
                                {budget.assignedCategories.map(catKey => {
                                  const catInfo = allAvailableEnvelopesCatalog.find(e => e.key === catKey);
                                  const chipLabel = catInfo ? `${catInfo.emoji} ${t(`subcategories.${catInfo.subcategory}`, formatLabel(catInfo.subcategory))}` : formatLabel(catKey);
                                  return (
                                    <span 
                                      key={catKey}
                                      style={{ fontFamily: "'Google Sans', sans-serif" }}
                                      className="text-[11px] bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded-full flex items-center gap-1"
                                    >
                                      {chipLabel}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {customBudgets.length === 0 && (
                        <div style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="p-8 text-center text-xs text-neutral-500 font-normal border border-dashed border-neutral-300 rounded-xl">
                          {t('no_budgets_created', 'No custom budgets created yet.')}<br />{t('click_create_budget', 'Click "+ Create Budget" to set up your budget categories and amounts.')}
                        </div>
                      )}
                    </div>

                  </div>

                </div>

                {/* Bottom Calculations Panel & Action Button (Fixed Footer) */}
                <div className="p-4 bg-white border border-[#E1E8ED] rounded-[24px] shrink-0 flex flex-col gap-3 mx-4 mb-4 w-[calc(100%-32px)]">
                  {/* Calculations Row Details */}
                  <div className="grid grid-cols-3 gap-2 py-4 text-center w-full bg-[#EAEDF5] rounded-xl mb-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-[#57606F] font-normal" style={{ fontFamily: "'Google Sans', sans-serif" }}>{t("salary_breakdown_modal.income", "Salary Breakdown")}</span>
                      <span className="text-[16px] text-[#1E2229] font-bold" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                        {calculatedIncomeDrop.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 border-l border-[#D1D5DB]">
                      <span className="text-xs text-[#57606F] font-normal" style={{ fontFamily: "'Google Sans', sans-serif" }}>{t("salary_breakdown_modal.expenses", "Allocation")}</span>
                      <span className="text-[16px] text-[#1E2229] font-bold" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                        {sumAllocated.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 border-l border-[#D1D5DB]">
                      <span className="text-[12px] text-[#57606F] font-normal" style={{ fontFamily: "'Google Sans', sans-serif" }}>{t("salary_breakdown_modal.remaining")}</span>
                      <span className="text-[16px] text-[#1E2229] font-bold" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                        {unallocatedBalance.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                      </span>
                    </div>
                  </div>

                  {/* Display a visual success state only when the unallocated balance hits exactly 0 */}
                  {calculatedIncomeDrop === 0 ? (
                    <div className="p-3.5 rounded-[14px] bg-white border border-[#E1E8ED] text-center text-[13px] text-[#57606F] font-normal flex items-center justify-center gap-2.5 leading-relaxed w-full shadow-sm" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                      <HelpCircle size={16} className="text-amber-500 shrink-0" />
                      <span>{t("salary_breakdown_modal.link_income_stream")}</span>
                    </div>
                  ) : isPerfectAllocation ? (
                    <div 
                      className="p-3.5 rounded-[14px] text-center font-bold flex items-center justify-center gap-2.5 select-none w-full bg-[#E8F5E9] border border-[#A6DDB1] text-[#2E7D32] shadow-sm"
                      style={{ fontFamily: "'Google Sans', sans-serif" }}
                    >
                      <CheckCircle size={18} className="shrink-0" />
                      <span>{t("salary_breakdown_modal.perfectly_allocated")}</span>
                    </div>
                  ) : unallocatedBalance < 0 ? (
                    <div className="p-3.5 rounded-[14px] bg-[#FFF5F5] border border-[#FECACA] text-center text-[13px] text-[#DC2626] font-normal flex items-center justify-center gap-2.5 leading-relaxed w-full shadow-sm" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                      <AlertCircle size={16} className="shrink-0" />
                      <span>{t("salary_breakdown_modal.allocation_exceeds", { amount: Math.abs(unallocatedBalance).toLocaleString() })}</span>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-[14px] bg-white border border-[#E1E8ED] text-center text-[13px] text-[#57606F] font-normal flex items-center justify-center gap-2.5 leading-relaxed w-full shadow-sm" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                      <HelpCircle size={16} className="text-amber-500 shrink-0" />
                      <span>{t("salary_breakdown_modal.distribute_remaining", { amount: unallocatedBalance.toLocaleString() })}</span>
                    </div>
                  )}

                  {/* Confirm buttons */}
                  <div className="flex gap-4 w-full mt-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex-1 py-3 bg-white border border-[#344E41] text-[#344E41] text-[14px] rounded-full hover:bg-neutral-50 transition-all cursor-pointer font-bold text-center"
                      style={{ fontFamily: "'Google Sans', sans-serif" }}
                    >
                      {t("salary_breakdown_modal.cancel")}
                    </button>
                    <button
                      type="button"
                      disabled={!isPerfectAllocation || isLoading || calculatedIncomeDrop === 0}
                      onClick={handleConfirmAllocation}
                      style={{ 
                        backgroundColor: (isPerfectAllocation && calculatedIncomeDrop > 0) ? '#344E41' : '#F3F5F7',
                        color: (isPerfectAllocation && calculatedIncomeDrop > 0) ? '#FFFFFF' : '#57606F',
                        fontFamily: "'Google Sans', sans-serif"
                      }}
                      className={`flex-1 py-3 text-[14px] rounded-full transition-all font-bold text-center flex items-center justify-center gap-1.5 ${
                        (isPerfectAllocation && calculatedIncomeDrop > 0) ? 'hover:brightness-95 active:scale-95 cursor-pointer' : 'cursor-not-allowed'
                      }`}
                    >
                      {isLoading ? (
                        <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
                      ) : saveStatus === 'success' ? (
                        <>
                          <CheckCircle size={14} className="shrink-0" />
                          <span>{t("salary_breakdown_modal.applied")}</span>
                        </>
                      ) : (
                        <span>{t("salary_breakdown_modal.confirm_allocation", "Confirm")}</span>
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* GRANULAR OVERLAY MATRIX: "Browse All Categories & Sub-Categories" Multi-select Drawer wizard */}
          <AnimatePresence>
            {isManageCategoriesOpen && (
              <motion.div 
                initial={{ opacity: 0, y: '100%' }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: '100%' }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="absolute inset-x-[5px] bottom-[5px] top-[5px] md:top-[20px] md:mx-auto md:max-w-[calc(100vw-10px)] md:h-[calc(100vh-40px)] bg-[#FFFFFF] border border-[#E1E8ED] rounded-[24px] z-50 flex flex-col overflow-hidden"
              >
                {/* Drawer header */}
                <div className="p-6 flex items-center justify-between shrink-0 bg-white relative w-full">
                  <div className="flex items-center gap-2 text-left">
                    <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 600 }} className="text-[clamp(1.15rem,2.6vw,1.4rem)] text-[#1E2229]">
                      {t("salary_breakdown_modal.browse_all_categories", "Browse All Categories")}
                    </span>
                  </div>
                  <div>
                    <button 
                      type="button"
                      onClick={() => setIsManageCategoriesOpen(false)}
                      style={{ backgroundColor: '#A6DDB1', color: '#1E2229', fontFamily: "'Google Sans', sans-serif", fontWeight: 600 }}
                      className="px-6 py-2.5 text-[clamp(0.8rem,1.8vw,0.95rem)] rounded-[20px] hover:brightness-105 active:scale-95 transition-all cursor-pointer border border-neutral-100"
                    >
                      {t("salary_breakdown_modal.done")}
                    </button>
                  </div>
                </div>

                {/* Checklist options */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4 w-full bg-white">
                  <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[clamp(0.8rem,1.8vw,0.95rem)] text-[#1E2229] leading-relaxed">
                    {t("salary_breakdown_modal.expand_categories_description", "Expand categories below and check subcategories. Checking any item automatically appends it as an active high-density allocation budget envelope.")}
                  </p>

                  <div className="space-y-2">
                    {/* ACCOUNT FUND TRANSFERS Accordion Node */}
                    <div className="border border-[#E1E8ED] rounded-[24px] overflow-hidden bg-[#FFFFFF]">
                      {/* Parent Accordion Row */}
                      <div
                        onClick={() => toggleCategoryExpanded('ACCOUNT FUND TRANSFERS')}
                        className="p-4 flex items-center justify-between cursor-pointer transition-all select-none hover:bg-neutral-50"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg shrink-0">🔄</span>
                          <span
                            style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 500 }}
                            className="text-[clamp(1rem,2.2vw,1.2rem)] text-[#1E2229]"
                          >
                            {t('salary_breakdown_modal.account_fund_transfers', 'Account Fund Transfers')}
                          </span>
                        </div>
                        <span 
                          style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                          className="text-[clamp(0.8rem,1.8vw,0.95rem)] text-neutral-500 flex items-center justify-center"
                        >
                          {expandedCategories.includes('ACCOUNT FUND TRANSFERS') ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                        </span>
                      </div>

                      {/* Accordion Content: Accounts Multi-select */}
                      {expandedCategories.includes('ACCOUNT FUND TRANSFERS') && (
                        <div className="p-4 border-t border-neutral-100 space-y-2.5">
                          <p style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[clamp(0.8rem,1.8vw,0.95rem)] text-[#1E2229] leading-relaxed">
                            {t('salary_breakdown_modal.select_destination_accounts', 'Select destination accounts for this transfer allocation:')}
                          </p>
                          
                          <div className="grid grid-cols-1 gap-1.5">
                            {uniqueDbAccounts.filter(acc => !acc.isArchived).map((acc: any, index: number) => {
                              const key = `transfer__${acc.id}`;
                              const isActive = activeEnvelopes.includes(key);

                              return (
                                <div
                                  key={`transfer-account-${acc.id}-${index}`}
                                  onClick={() => toggleEnvelopeActiveState(key)}
                                  style={{
                                    borderColor: isActive ? '#A6DDB1' : '#F3F4F6'
                                  }}
                                  className={`p-2 rounded-lg border flex items-center justify-between transition-all cursor-pointer ${
                                    isActive ? 'bg-[#f0f9f1] text-[#111c2d]' : 'bg-[#FFFFFF] text-neutral-400 hover:bg-neutral-100'
                                  }`}
                                >
                                  <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[12px] font-normal leading-none">
                                    {acc.name} ({acc.institution || 'Direct'})
                                  </span>

                                  <div
                                    style={{
                                      backgroundColor: isActive ? '#A6DDB1' : '#FFFFFF',
                                      borderColor: isActive ? '#A6DDB1' : '#E5E7EB'
                                    }}
                                    className="w-4 h-4 rounded border flex items-center justify-center transition-all shrink-0"
                                  >
                                    {isActive && (
                                      <Check size={8} className="text-[#1E293B] stroke-[3]" />
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {sourceCategories.map((cat: any, index: number) => {
                      const isExpanded = expandedCategories.includes(cat.name);
                      const subs = cat.subcategories || [];
                      const displayCatName = cat.name === 'Food & Drinks' ? 'Food & Drink' : cat.name;

                      return (
                        <div key={`category-row-${cat.key || cat.name || index}-${index}`} className="bg-white mb-4 rounded-[24px] border border-neutral-100 overflow-hidden">
                          {/* Parent Accordion Row */}
                          <div
                            onClick={() => toggleCategoryExpanded(cat.name)}
                            className="p-4 flex items-center justify-between cursor-pointer transition-all select-none hover:bg-neutral-50"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-lg shrink-0">{cat.emoji || '📁'}</span>
                              <span
                                style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 500 }}
                                className="text-[clamp(1rem,2.2vw,1.2rem)] text-[#1E2229]"
                              >
                                {t(`categories.${cat.name.replace(/ & /g, '_and_')}`, displayCatName) as string}
                              </span>
                            </div>
                            <span 
                              style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                              className="text-[clamp(0.8rem,1.8vw,0.95rem)] text-neutral-500 flex items-center justify-center"
                            >
                              {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                            </span>
                          </div>

                          {/* Nested Subcategories List */}
                          {isExpanded && (
                            <div className="p-3 border-t border-neutral-100 space-y-1.5">
                              {subs.length === 0 ? (
                                <div
                                  onClick={() => {
                                    const key = `${cat.name}__general`.replace(/\s+/g, '_').toLowerCase();
                                    toggleEnvelopeActiveState(key);
                                  }}
                                  style={{
                                    borderColor: activeEnvelopes.includes(`${cat.name}__general`.replace(/\s+/g, '_').toLowerCase()) ? '#A6DDB1' : '#F3F4F6'
                                  }}
                                  className={`p-3 rounded-[12px] border flex items-center justify-between transition-all cursor-pointer ${
                                    activeEnvelopes.includes(`${cat.name}__general`.replace(/\s+/g, '_').toLowerCase()) ? 'bg-[#f0f9f1]' : 'bg-[#FFFFFF] hover:bg-[#F3F5F7]'
                                  }`}
                                >
                                  <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[clamp(0.8rem,1.8vw,0.9rem)] text-[#1E2229]">
                                    {t('common.general', 'General')}
                                  </span>

                                  <div
                                    style={{
                                      backgroundColor: activeEnvelopes.includes(`${cat.name}__general`.replace(/\s+/g, '_').toLowerCase()) ? '#A6DDB1' : '#FFFFFF',
                                      borderColor: activeEnvelopes.includes(`${cat.name}__general`.replace(/\s+/g, '_').toLowerCase()) ? '#A6DDB1' : '#E5E7EB'
                                    }}
                                    className="w-5 h-5 rounded-[6px] border flex items-center justify-center transition-all shrink-0"
                                  >
                                    {activeEnvelopes.includes(`${cat.name}__general`.replace(/\s+/g, '_').toLowerCase()) && (
                                      <Check size={12} className="text-[#1E293B] stroke-[3]" />
                                    )}
                                  </div>
                                </div>
                              ) : (
                                subs.map((sub: string, subIndex: number) => {
                                  const key = `${cat.name}__${sub}`.replace(/\s+/g, '_').toLowerCase();
                                  const isActive = activeEnvelopes.includes(key);

                                  return (
                                    <div
                                      key={`subcategory-row-${key}-${subIndex}`}
                                      onClick={() => toggleEnvelopeActiveState(key)}
                                      style={{
                                        borderColor: isActive ? '#A6DDB1' : '#F3F4F6'
                                      }}
                                      className={`p-3 rounded-[12px] border flex items-center justify-between transition-all cursor-pointer ${
                                        isActive ? 'bg-[#f0f9f1]' : 'bg-[#FFFFFF] hover:bg-[#F3F5F7]'
                                      }`}
                                    >
                                      <span style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }} className="text-[clamp(0.8rem,1.8vw,0.9rem)] text-[#1E2229]">
                                        {t(`subcategories.${sub}`, formatLabel(sub))}
                                      </span>

                                      <div
                                        style={{
                                          backgroundColor: isActive ? '#A6DDB1' : '#FFFFFF',
                                          borderColor: isActive ? '#A6DDB1' : '#E5E7EB'
                                        }}
                                        className="w-5 h-5 rounded-[6px] border flex items-center justify-center transition-all shrink-0"
                                      >
                                        {isActive && (
                                          <Check size={12} className="text-[#1E293B] stroke-[3]" />
                                        )}
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          )}
                      </div>
                      );
                    })}
                  </div>
                </div>

                {/* Footer confirm inside check drawer */}
                <div className="p-3 bg-white border-t border-neutral-100 flex justify-end shrink-0">
                  <button 
                    type="button"
                    onClick={() => setIsManageCategoriesOpen(false)}
                    style={{ backgroundColor: '#A6DDB1', color: '#1E293B', fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}
                    className="px-4 py-2 text-[12px] rounded-xl font-normal hover:brightness-105 active:scale-95 transition-all cursor-pointer text-center w-full"
                  >
                    {t('salary_breakdown_modal.save_category_configuration', 'Save Category Configuration (Active: {{count}})', { count: activeEnvelopes.length })}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Create / Edit Budget Modal */}
          <AnimatePresence>
            {isBudgetModalOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4"
              >
                <motion.div
                  initial={{ scale: 0.95, y: 10 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.95, y: 10 }}
                  className="bg-white rounded-[24px] shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[60vh]"
                >
                  {/* Modal Header */}
                  <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
                    <h3 style={{ fontFamily: "'Google Sans', sans-serif" }} className="text-[16px] text-slate-800 font-bold">
                      {editingBudgetId ? t('salary_breakdown.edit_budget', 'Edit Budget') : t('salary_breakdown.create_budget', 'Create Custom Budget')}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setIsBudgetModalOpen(false)}
                      className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-500 hover:bg-neutral-200 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Modal Body */}
                  <div className="p-6 overflow-y-auto space-y-4 flex-1">
                    <div>
                      <label style={{ fontFamily: "'Google Sans', sans-serif" }} className="block text-[13px] text-slate-700 font-normal mb-1.5">
                        {t('salary_breakdown.budget_name', 'Budget Name')}
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Family Groceries, Utilities, Subscriptions..."
                        value={formBudgetName}
                        onChange={(e) => setFormBudgetName(e.target.value)}
                        style={{ fontFamily: "'Google Sans', sans-serif" }}
                        className="w-full h-[60px] px-3.5 rounded-[12px] border border-neutral-200 text-[14px] text-slate-800 outline-none focus:border-[#A6DDB1]"
                      />
                    </div>

                    <div>
                      <label style={{ fontFamily: "'Google Sans', sans-serif" }} className="block text-[13px] text-slate-700 font-normal mb-1.5">
                        {t('salary_breakdown.budget_amount', 'Budget Amount ({{currency}})', { currency: activeBaseCurrency })}
                      </label>
                      <div className="relative flex items-center">
                        <span className="absolute left-3.5 text-xs text-neutral-400 font-normal">{activeBaseCurrency}</span>
                        <input
                          type="number"
                          placeholder="0.00"
                          min="0"
                          value={formBudgetAmount === '' ? '' : formBudgetAmount}
                          onChange={(e) => setFormBudgetAmount(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                          style={{ fontFamily: "'Google Sans', sans-serif" }}
                          className="w-full h-[60px] pl-10 pr-3.5 rounded-[12px] border border-neutral-200 text-[14px] text-slate-800 outline-none focus:border-[#A6DDB1] font-bold"
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ fontFamily: "'Google Sans', sans-serif" }} className="block text-[13px] text-slate-700 font-normal mb-1.5">
                        {t('salary_breakdown.assign_categories', 'Assign Categories & Sub-Categories')}
                      </label>
                      <div className="border border-neutral-200 rounded-[12px] max-h-64 overflow-y-auto p-2 space-y-2">
                        {groupedCatalog.map((group) => {
                          const isExpanded = expandedCategories.includes(group.category);
                          const selectedCount = group.items.filter(item => formAssignedCategories.includes(item.key)).length;
                          const allSelected = group.items.length > 0 && selectedCount === group.items.length;

                          return (
                            <div key={group.category} className="border border-neutral-100 rounded-[10px] overflow-hidden bg-white">
                              {/* Category Header Row */}
                              <div
                                onClick={() => toggleCategoryExpanded(group.category)}
                                style={{ fontFamily: "'Google Sans', sans-serif" }}
                                className="p-3 flex items-center justify-between cursor-pointer hover:bg-neutral-50 transition-all select-none"
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className="text-base">{group.emoji}</span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[14px] text-slate-800 font-bold">
                                      {t(`categories.${group.category}`, formatLabel(group.category))}
                                    </span>
                                    {selectedCount > 0 && (
                                      <span className="text-[11px] bg-[#E8F5E9] text-[#2E7D32] px-2 py-0.5 rounded-full font-bold">
                                        {selectedCount} {t('common.selected', 'selected')}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const itemKeys = group.items.map(i => i.key);
                                      if (allSelected) {
                                        setFormAssignedCategories(prev => prev.filter(k => !itemKeys.includes(k)));
                                      } else {
                                        setFormAssignedCategories(prev => Array.from(new Set([...prev, ...itemKeys])));
                                      }
                                    }}
                                    className="text-[11px] text-neutral-500 hover:text-slate-800 px-2 py-1 rounded bg-neutral-100 hover:bg-neutral-200 transition-colors"
                                  >
                                    {allSelected ? t('common.deselect_all', 'Deselect All') : t('common.select_all', 'Select All')}
                                  </button>
                                  <div className="text-neutral-400">
                                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                  </div>
                                </div>
                              </div>

                              {/* Subcategories Collapsible List */}
                              {isExpanded && (
                                <div className="border-t border-neutral-100 bg-neutral-50/60 p-2 space-y-1.5">
                                  {group.items.map((env) => {
                                    const isSelected = formAssignedCategories.includes(env.key);
                                    return (
                                      <div
                                        key={env.key}
                                        onClick={() => {
                                          setFormAssignedCategories(prev =>
                                            isSelected
                                              ? prev.filter(k => k !== env.key)
                                              : [...prev, env.key]
                                          );
                                        }}
                                        style={{ fontFamily: "'Google Sans', sans-serif" }}
                                        className={`p-2.5 rounded-[8px] border flex items-center justify-between cursor-pointer transition-all ${
                                          isSelected ? 'bg-[#f0f9f1] border-[#A6DDB1]' : 'bg-white border-neutral-200 hover:bg-neutral-100'
                                        }`}
                                      >
                                        <div className="flex items-center gap-2 pl-2">
                                          <span className="text-[13px] text-slate-700 font-normal">
                                            {t(`subcategories.${env.subcategory}`, formatLabel(env.subcategory))}
                                          </span>
                                        </div>
                                        <div className={`w-4 h-4 rounded-[4px] border flex items-center justify-center ${isSelected ? 'bg-[#A6DDB1] border-[#A6DDB1]' : 'border-neutral-300'}`}>
                                          {isSelected && <Check size={10} className="text-[#1E293B] stroke-[3]" />}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Modal Footer */}
                  <div className="p-4 bg-neutral-50 border-t border-neutral-100 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsBudgetModalOpen(false)}
                      style={{ fontFamily: "'Google Sans', sans-serif" }}
                      className="px-4 py-2 rounded-xl text-xs text-neutral-600 bg-white border border-neutral-200 hover:bg-neutral-100 transition-all font-normal cursor-pointer"
                    >
                      {t('common.cancel', 'Cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveBudgetForm}
                      style={{ fontFamily: "'Google Sans', sans-serif", backgroundColor: '#A6DDB1', color: '#1E293B' }}
                      className="px-5 py-2 rounded-xl text-xs font-bold hover:brightness-105 transition-all cursor-pointer shadow-sm"
                    >
                      {editingBudgetId ? t('common.save_changes', 'Save Changes') : t('salary_breakdown.add_budget', 'Add Budget')}
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <EditMonthlyPayrollModal
            isOpen={isEditPayrollModalOpen}
            onClose={() => setIsEditPayrollModalOpen(false)}
            uid={profile?.uid || ''}
            currency={activeBaseCurrency}
            currentSalaryAmount={calculatedIncomeDrop}
            recurringIncomes={dbRecurringIncomes}
            onSuccess={() => {
              if (onSuccess) onSuccess();
            }}
          />

        </motion.div>
      </div>
    </AnimatePresence>
  );
};
