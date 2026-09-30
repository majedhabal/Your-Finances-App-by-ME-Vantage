import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from '@/lib/i18n';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Filter, ArrowUpRight, ArrowDownLeft, FileDown, RefreshCw, ChevronRight, Plus, Mic, GitBranch, CalendarClock, ShoppingCart, Car, Activity, Tag, Sparkles, Bot, X, Lock, Info, MessageSquare } from 'lucide-react';
import { collection, query, orderBy, onSnapshot, getDocs } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import i18nextInstance from '../lib/i18n';
import { TransactionDetailModal } from './TransactionDetailModal';
import { AddTransactionModal } from './AddTransactionModal';
import { MASTER_CATEGORIES } from '../lib/constants';
import { getAuth } from 'firebase/auth';
import { formatLabel, translateCategoryOrSubcategory } from '../lib/stringUtils';
import { projectRecurringTransactions } from '../lib/projection';
import { getLocalTodayString } from '../lib/dateSimulator';
import * as XLSX from 'xlsx';

export interface Transaction {
  id: string;
  date: string;
  amount: number;
  notes: string;
  category: string;
  subcategory?: string;
  subCategory?: string;
  isSplit?: boolean;
  splitGroupId?: string | null;
  accountId: string;
  type: 'Inflow' | 'Outflow' | 'Transfer' | 'income' | 'expense' | 'transfer' | string;
  status?: string;
  recurringId?: string;
  emoji?: string;
  isUpcoming?: boolean;
  toAccountId?: string;
  transferSide?: string;
  isUpcomingSalaryAllocation?: boolean;
  hasMirror?: boolean;
  time?: string;
  confirmationDate?: string;
}

interface TransactionsProps {
  uid: string;
  accounts: any[];
  baseCurrency: string;
  getRateToAED: (curr: string) => number;
  profile: any;
}

export const Transactions: React.FC<TransactionsProps> = ({
  uid, accounts, baseCurrency, getRateToAED, profile
}) => {
  const t = (key: string, defaultValue?: string) => {
    try {
      const res = i18nextInstance.t(key);
      return res !== key ? res : (defaultValue || key);
    } catch (e) {
      return defaultValue || key;
    }
  };
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [rawRecurringRules, setRawRecurringRules] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'current' | 'future'>('current');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<'All' | 'Inflow' | 'Outflow'>('All');
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showInfoTooltip, setShowInfoTooltip] = useState(false);
  const [selectedTxIds, setSelectedTxIds] = useState<string[]>([]);

  const toggleSelectTx = (id: string, e: React.MouseEvent | React.ChangeEvent) => {
    e.stopPropagation();
    setSelectedTxIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // Custom filter states
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [focusedStart, setFocusedStart] = useState(false);
  const [focusedEnd, setFocusedEnd] = useState(false);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>(['All']);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['All']);
  const [selectedSubcategories, setSelectedSubcategories] = useState<string[]>(['All']);
  const [categories, setCategories] = useState<any[]>([]);

  useEffect(() => {
    const filterAccId = localStorage.getItem('transactions_filter_account_id');
    if (filterAccId) {
      setSelectedAccountIds([filterAccId]);
      setIsFilterDrawerOpen(true);
      localStorage.removeItem('transactions_filter_account_id');
    }
    const filterCat = localStorage.getItem('transactions_filter_category');
    if (filterCat) {
      setSelectedCategories([filterCat]);
      setIsFilterDrawerOpen(true);
      localStorage.removeItem('transactions_filter_category');
    }
    const filterCats = localStorage.getItem('transactions_filter_categories');
    if (filterCats) {
      try {
        const parsed = JSON.parse(filterCats);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSelectedCategories(parsed);
          setIsFilterDrawerOpen(true);
        }
      } catch (e) {}
      localStorage.removeItem('transactions_filter_categories');
    }
    const filterSubs = localStorage.getItem('transactions_filter_subcategories');
    if (filterSubs) {
      try {
        const parsed = JSON.parse(filterSubs);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSelectedSubcategories(parsed);
          setIsFilterDrawerOpen(true);
        }
      } catch (e) {}
      localStorage.removeItem('transactions_filter_subcategories');
    }
    const filterStart = localStorage.getItem('transactions_filter_start_date');
    if (filterStart) {
      setStartDate(filterStart);
      setIsFilterDrawerOpen(true);
      localStorage.removeItem('transactions_filter_start_date');
    }
    const filterEnd = localStorage.getItem('transactions_filter_end_date');
    if (filterEnd) {
      setEndDate(filterEnd);
      setIsFilterDrawerOpen(true);
      localStorage.removeItem('transactions_filter_end_date');
    }
    if (localStorage.getItem('vantage_transactions_view_mode') === 'future') {
      localStorage.removeItem('vantage_transactions_view_mode');
      setViewMode('future');
    }
  }, []);

  useEffect(() => {
    const handleSwitchTab = (e: any) => {
      if (e.detail?.tab === 'activity') {
        if (e.detail?.accountId) {
          setSelectedAccountIds([e.detail.accountId]);
          setIsFilterDrawerOpen(true);
        }
        if (e.detail?.category) {
          setSelectedCategories([e.detail.category]);
          setIsFilterDrawerOpen(true);
        }
        if (e.detail?.categories && Array.isArray(e.detail.categories)) {
          setSelectedCategories(e.detail.categories);
          setIsFilterDrawerOpen(true);
        }
        if (e.detail?.subcategories && Array.isArray(e.detail.subcategories)) {
          setSelectedSubcategories(e.detail.subcategories);
          setIsFilterDrawerOpen(true);
        }
        if (e.detail?.startDate) {
          setStartDate(e.detail.startDate);
          setIsFilterDrawerOpen(true);
        }
        if (e.detail?.endDate) {
          setEndDate(e.detail.endDate);
          setIsFilterDrawerOpen(true);
        }
      }
    };
    window.addEventListener('switch-tab', handleSwitchTab);
    return () => window.removeEventListener('switch-tab', handleSwitchTab);
  }, []);

useEffect(() => {
    // 🛡️ CRITICAL GUARD: Abort if Firebase Auth is not active
    if (!uid || !auth.currentUser) return;
    setLoading(true);
    const userId = auth.currentUser.uid;
    const txQuery = query(collection(db, 'users', userId, 'transactions'), orderBy('date', 'desc'));
    const recQuery = query(collection(db, 'users', uid, 'recurringTransactions'));
    const catQuery = query(collection(db, `users/${uid}/custom_categories`));
    
    const unsubscribeTx = onSnapshot(txQuery, (snapshot) => {
      const items: Transaction[] = [];
      snapshot.forEach((doc) => { items.push({ id: doc.id, ...doc.data() } as Transaction); });
      setTransactions(items);
      setLoading(false);
    });

    const unsubscribeRec = onSnapshot(recQuery, (snapshot) => {
      const items: any[] = [];
      snapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() });
      });
      setRawRecurringRules(items);
    });

    const unsubscribeCat = onSnapshot(catQuery, (snapshot) => {
      const items: any[] = [];
      snapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() });
      });
      setCategories(items);
    });

    return () => { 
      unsubscribeTx(); 
      unsubscribeRec(); 
      unsubscribeCat();
    };
  }, [uid]);

  const projectedRecurring = useMemo(() => {
    return projectRecurringTransactions(rawRecurringRules, transactions, 90);
  }, [rawRecurringRules, transactions]);

  const todayStr = getLocalTodayString();
  const upcomingTransactions = [
    ...transactions.filter(t => t.date > todayStr).map(t => ({ ...t, isUpcoming: true })), 
    ...projectedRecurring
  ];
  const historicalTransactions = transactions.filter(t => t.date <= todayStr && t.status !== 'draft' && t.status !== 'pending_confirmation');

  const handleExportExcel = () => {
    if (!transactions || transactions.length === 0) {
      alert('No transactions found to export.');
      return;
    }
    const worksheetData = transactions.map(t => {
      const item = t as any;
      const accountObj = accounts.find(acc => acc.accountId === item.accountId || acc.id === item.accountId);
      const toAccountObj = item.toAccountId ? accounts.find(acc => acc.accountId === item.toAccountId || acc.id === item.toAccountId) : null;
      
      const accountName = accountObj ? (accountObj.name || accountObj.bankAccountType || item.accountId) : (item.accountId || '');
      const toAccountName = toAccountObj ? (toAccountObj.name || toAccountObj.bankAccountType || item.toAccountId) : (item.toAccountId || '');

      return {
        Date: item.date,
        Type: item.type || (item.amount < 0 ? 'Expense' : 'Income'),
        Category: item.category || '',
        Subcategory: item.subcategory || item.subCategory || '',
        Account: accountName,
        ...(toAccountName ? { Destination_Account: toAccountName } : {}),
        Notes_Or_Title: item.notes || item.title || '',
        Amount: item.amount,
        Currency: item.currency || 'AED',
        Status: item.status || 'Confirmed'
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Transactions');
    XLSX.writeFile(workbook, `your_finances_transactions_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Tier 2 & Tier 3 restriction check
  const isTier2Or3User = () => {
    const tier = (profile?.subscriptionTier || '').toString().trim().toLowerCase();
    return tier.includes('tier 2') || tier.includes('tier 3') || tier.includes('tier2') || tier.includes('tier3') || tier === 'premium';
  };

  // Natural Language Search Engine Parser
  const parseNaturalLanguageQuery = (rawQuery: string, list: Transaction[]) => {
    const query = rawQuery.trim().toLowerCase();
    if (!query) {
      return {
        filteredList: list,
        isNaturalQuery: false,
        totalAmount: 0,
        count: list.length,
        answerText: '',
        categoryMatched: null,
        subcategoryMatched: null
      };
    }

    const now = new Date();
    let dateMin: string | null = null;
    let dateMax: string | null = null;
    let dateLabel = '';

    // Date range parsing
    if (query.includes('last weekend')) {
      const day = now.getDay();
      const daysToLastSun = day === 0 ? 7 : day;
      const lastSun = new Date(now);
      lastSun.setDate(now.getDate() - daysToLastSun);
      const lastSat = new Date(lastSun);
      lastSat.setDate(lastSun.getDate() - 1);

      dateMin = lastSat.toISOString().split('T')[0];
      dateMax = lastSun.toISOString().split('T')[0];
      dateLabel = 'last weekend';
    } else if (query.includes('this weekend')) {
      const day = now.getDay();
      const sat = new Date(now);
      sat.setDate(now.getDate() + (6 - day));
      const sun = new Date(sat);
      sun.setDate(sat.getDate() + 1);

      dateMin = sat.toISOString().split('T')[0];
      dateMax = sun.toISOString().split('T')[0];
      dateLabel = 'this weekend';
    } else if (query.includes('today')) {
      dateMin = now.toISOString().split('T')[0];
      dateMax = dateMin;
      dateLabel = 'today';
    } else if (query.includes('yesterday')) {
      const yest = new Date(now);
      yest.setDate(now.getDate() - 1);
      dateMin = yest.toISOString().split('T')[0];
      dateMax = dateMin;
      dateLabel = 'yesterday';
    } else if (query.includes('last week') || query.includes('past week')) {
      const pastWeek = new Date(now);
      pastWeek.setDate(now.getDate() - 7);
      dateMin = pastWeek.toISOString().split('T')[0];
      dateMax = now.toISOString().split('T')[0];
      dateLabel = 'last week';
    } else if (query.includes('this week')) {
      const day = now.getDay();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - day);
      dateMin = startOfWeek.toISOString().split('T')[0];
      dateMax = now.toISOString().split('T')[0];
      dateLabel = 'this week';
    } else if (query.includes('last month')) {
      const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      dateMin = firstOfLastMonth.toISOString().split('T')[0];
      dateMax = lastOfLastMonth.toISOString().split('T')[0];
      dateLabel = 'last month';
    } else if (query.includes('this month')) {
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      dateMin = firstOfMonth.toISOString().split('T')[0];
      dateMax = now.toISOString().split('T')[0];
      dateLabel = 'this month';
    } else if (query.includes('this year') || query.includes('last year')) {
      const yr = query.includes('last year') ? now.getFullYear() - 1 : now.getFullYear();
      dateMin = `${yr}-01-01`;
      dateMax = `${yr}-12-31`;
      dateLabel = query.includes('last year') ? 'last year' : 'this year';
    } else {
      const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
      for (let i = 0; i < months.length; i++) {
        if (query.includes(months[i])) {
          const mStart = new Date(now.getFullYear(), i, 1);
          const mEnd = new Date(now.getFullYear(), i + 1, 0);
          dateMin = mStart.toISOString().split('T')[0];
          dateMax = mEnd.toISOString().split('T')[0];
          dateLabel = `in ${months[i].charAt(0).toUpperCase() + months[i].slice(1)}`;
          break;
        }
      }
    }

    // Type detection
    let typeFilter: 'expense' | 'income' | null = null;
    if (query.includes('spend') || query.includes('spent') || query.includes('expense') || query.includes('bought') || query.includes('cost') || query.includes('dining')) {
      typeFilter = 'expense';
    } else if (query.includes('income') || query.includes('earned') || query.includes('salary') || query.includes('received') || query.includes('deposit')) {
      typeFilter = 'income';
    }

    // Amount range
    let maxAmount: number | null = null;
    let minAmount: number | null = null;
    const underMatch = query.match(/(?:under|less than|below)\s+(\d+(?:\.\d+)?)/);
    if (underMatch) maxAmount = parseFloat(underMatch[1]);

    const overMatch = query.match(/(?:over|more than|above|greater than)\s+(\d+(?:\.\d+)?)/);
    if (overMatch) minAmount = parseFloat(overMatch[1]);

    // Category and Subcategory Deep Matching
    let categoryMatched: string | null = null;
    let subcategoryMatched: string | null = null;

    // Build list of category & subcategory keywords from MASTER_CATEGORIES & user custom categories
    const allCategories = MASTER_CATEGORIES.map(c => c.name);
    const subcatMap: { [subcat: string]: string } = {};
    MASTER_CATEGORIES.forEach(c => {
      c.subcategories.forEach(s => {
        subcatMap[s.toLowerCase()] = s;
      });
    });

    // Alias map for common search terms -> Category/Subcategory
    const categoryAliases: { [key: string]: { category: string; subcategory?: string } } = {
      'dining': { category: 'Food & Drinks', subcategory: 'Restaurant' },
      'dining out': { category: 'Food & Drinks', subcategory: 'Restaurant' },
      'restaurant': { category: 'Food & Drinks', subcategory: 'Restaurant' },
      'restaurants': { category: 'Food & Drinks', subcategory: 'Restaurant' },
      'groceries': { category: 'Food & Drinks', subcategory: 'Groceries' },
      'grocery': { category: 'Food & Drinks', subcategory: 'Groceries' },
      'supermarket': { category: 'Food & Drinks', subcategory: 'Groceries' },
      'supermarkets': { category: 'Food & Drinks', subcategory: 'Groceries' },
      'cafe': { category: 'Food & Drinks', subcategory: 'Cafe' },
      'coffee': { category: 'Food & Drinks', subcategory: 'Cafe' },
      'fuel': { category: 'Vehicle', subcategory: 'Fuel' },
      'gasoline': { category: 'Vehicle', subcategory: 'Fuel' },
      'petrol': { category: 'Vehicle', subcategory: 'Fuel' },
      'salik': { category: 'Vehicle', subcategory: 'Salik' },
      'rent': { category: 'Housing', subcategory: 'Rent' },
      'utilities': { category: 'Housing', subcategory: 'Utilities' },
      'electricity': { category: 'Housing', subcategory: 'Energy' },
      'internet': { category: 'Communication', subcategory: 'Internet' },
      'phone': { category: 'Communication', subcategory: 'Phone' },
      'housing': { category: 'Housing' },
      'shopping': { category: 'Shopping' },
      'electronics': { category: 'Shopping', subcategory: 'Electronics' },
      'clothes': { category: 'Shopping', subcategory: 'Clothes' },
      'clothing': { category: 'Shopping', subcategory: 'Clothes' },
      'subscriptions': { category: 'Life & Entertainment', subcategory: 'Subscriptions' },
      'gym': { category: 'Life & Entertainment', subcategory: 'Gym' },
      'fitness': { category: 'Life & Entertainment', subcategory: 'Fitness' },
      'transport': { category: 'Transportation' },
      'transportation': { category: 'Transportation' },
      'taxi': { category: 'Transportation', subcategory: 'Taxi' },
      'salary': { category: 'Income', subcategory: 'Wage' },
      'wage': { category: 'Income', subcategory: 'Wage' }
    };

    // Check alias exact multi-word or single word keys first
    for (const [alias, mapping] of Object.entries(categoryAliases)) {
      if (query.includes(alias)) {
        categoryMatched = mapping.category;
        if (mapping.subcategory) subcategoryMatched = mapping.subcategory;
        break;
      }
    }

    // Stop words
    const stopWords = new Set([
      'how', 'much', 'did', 'i', 'spend', 'spent', 'on', 'out', 'last', 'weekend', 'this', 'month',
      'week', 'yesterday', 'today', 'the', 'a', 'an', 'for', 'in', 'what', 'total', 'many',
      'show', 'me', 'my', 'transactions', 'transaction', 'expenses', 'income', 'under', 'over',
      'less', 'than', 'more', 'below', 'above', 'past', 'was', 'were', 'all', 'where', 'get'
    ]);

    const tokens = query.split(/\s+/).filter(t => !stopWords.has(t) && !/^\d+$/.test(t));

    const filtered = list.filter(tx => {
      if (dateMin && tx.date < dateMin) return false;
      if (dateMax && tx.date > dateMax) return false;

      if (typeFilter === 'expense' && !(tx.type === 'expense' || tx.type === 'Outflow' || tx.type === 'debit' || tx.type === 'transfer')) return false;
      if (typeFilter === 'income' && !(tx.type === 'income' || tx.type === 'Inflow' || tx.type === 'credit')) return false;

      const amt = Number(tx.amount) || 0;
      if (maxAmount !== null && amt > maxAmount) return false;
      if (minAmount !== null && amt < minAmount) return false;

      // Category and subcategory matching
      if (categoryMatched) {
        const catMatch = (tx.category || '').toLowerCase().includes(categoryMatched.toLowerCase());
        const subMatch = subcategoryMatched ? ((tx.subcategory || tx.subCategory || '').toLowerCase().includes(subcategoryMatched.toLowerCase())) : true;
        const notesMatch = (tx.notes || '').toLowerCase().includes(categoryMatched.toLowerCase());
        
        if (!catMatch && !subMatch && !notesMatch) return false;
      } else if (tokens.length > 0) {
        const searchTarget = `${tx.notes || ''} ${tx.category || ''} ${tx.subcategory || ''} ${tx.subCategory || ''}`.toLowerCase();
        const matchesAnyToken = tokens.some(token => searchTarget.includes(token));
        if (!matchesAnyToken) return false;
      }

      return true;
    });

    const totalAmount = filtered.reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
    const count = filtered.length;

    let answerText = '';
    if (count === 0) {
      answerText = `No matching entries found for "${rawQuery}".`;
    } else {
      const timePhrase = dateLabel ? ` ${dateLabel}` : '';
      const typePhrase = typeFilter === 'income' ? 'received in income' : 'spent';
      
      let categoryPhrase = '';
      if (subcategoryMatched && categoryMatched) {
        categoryPhrase = ` on ${subcategoryMatched} (${categoryMatched})`;
      } else if (categoryMatched) {
        categoryPhrase = ` on ${categoryMatched}`;
      } else if (tokens.length > 0) {
        categoryPhrase = ` on ${tokens.join(' ')}`;
      }

      answerText = `You ${typePhrase} ${baseCurrency} ${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${categoryPhrase}${timePhrase} across ${count} transaction${count === 1 ? '' : 's'}.`;
    }

    return {
      filteredList: filtered,
      isNaturalQuery: true,
      totalAmount,
      count,
      answerText,
      categoryMatched,
      subcategoryMatched
    };
  };

  const availableSubcategories = useMemo(() => {
    const subsSet = new Set<string>();
    categories.forEach(cat => {
      if (selectedCategories.includes('All') || selectedCategories.length === 0 || selectedCategories.includes(cat.name)) {
        if (cat.subcategories && Array.isArray(cat.subcategories)) {
          cat.subcategories.forEach((s: string) => subsSet.add(s));
        }
      }
    });
    transactions.forEach(t => {
      const sub = t.subcategory || t.subCategory;
      if (sub && sub !== 'General' && sub !== 'All') {
        if (selectedCategories.includes('All') || selectedCategories.length === 0 || selectedCategories.includes(t.category)) {
          subsSet.add(sub);
        }
      }
    });
    return Array.from(subsSet).sort();
  }, [categories, selectedCategories, transactions]);

  const filterAndSearchList = (list: Transaction[]) => {
    // Apply Drawer filters first
    const baseFiltered = list.filter(t => {
      const matchesType = selectedType === 'All' || 
                          t.type === selectedType || 
                          (selectedType === 'Inflow' && (t.type === 'income' || t.type === 'Inflow')) ||
                          (selectedType === 'Outflow' && (t.type === 'expense' || t.type === 'Outflow'));

      let matchesDate = true;
      if (startDate) matchesDate = matchesDate && t.date >= startDate;
      if (endDate) matchesDate = matchesDate && t.date <= endDate;

      const matchesAccount = selectedAccountIds.includes('All') || 
                            selectedAccountIds.length === 0 ||
                            selectedAccountIds.some(accId => {
                              if (accId === t.accountId) return true;
                              const accObj = accounts.find(a => (a.accountId || a.id) === accId);
                              return accObj ? (t.accountId === accObj.id || t.accountId === accObj.accountId) : false;
                            });
      const matchesCategory = selectedCategories.includes('All') ||
                              selectedCategories.length === 0 ||
                              selectedCategories.includes(t.category);
      const matchesSubcategory = selectedSubcategories.includes('All') ||
                                selectedSubcategories.length === 0 ||
                                selectedSubcategories.some(sub => (t.subcategory || t.subCategory || '').toLowerCase() === sub.toLowerCase());

      return matchesType && matchesDate && matchesAccount && matchesCategory && matchesSubcategory;
    });

    if (!searchQuery.trim()) {
      return baseFiltered;
    }

    // For Free and Tier 1 users, apply simple substring search so standard search still works
    if (!isTier2Or3User()) {
      const q = searchQuery.toLowerCase().trim();
      return baseFiltered.filter(t => 
        (t.notes || '').toLowerCase().includes(q) ||
        (t.category || '').toLowerCase().includes(q) ||
        (t.subcategory || t.subCategory || '').toLowerCase().includes(q)
      );
    }

    // For Tier 2 and Tier 3 users, apply full Natural Language AI Search
    const parsed = parseNaturalLanguageQuery(searchQuery, baseFiltered);
    return parsed.filteredList;
  };

  const groupTransactionsByDate = (list: Transaction[]) => {
    const groups: { [key: string]: Transaction[] } = {};
    const sorted = [...list].sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      if (dateA !== dateB) return dateB - dateA;
      
      const parseTime = (t: string | undefined) => {
        if (!t) return 0;
        if (t.includes('AM') || t.includes('PM')) {
          const [time, modifier] = t.split(' ');
          if (!time) return 0;
          let [hours, minutes] = time.split(':').map(Number);
          if (isNaN(hours) || isNaN(minutes)) return 0;
          if (modifier === 'PM' && hours !== 12) hours += 12;
          if (modifier === 'AM' && hours === 12) hours = 0;
          return hours * 60 + minutes;
        } else {
          const [hours, minutes] = t.split(':').map(Number);
          if (isNaN(hours) || isNaN(minutes)) return 0;
          return hours * 60 + minutes;
        }
      };
      return parseTime(b.time) - parseTime(a.time);
    });
    sorted.forEach(tx => {
      if (!groups[tx.date]) groups[tx.date] = [];
      groups[tx.date].push(tx);
    });
    return groups;
  };

  const formatDateHeader = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const isToday = date.toDateString() === today.toDateString();
    const isYesterday = date.toDateString() === yesterday.toDateString();

    const formattedDate = date.toLocaleDateString(i18nextInstance.language, { month: 'short', day: 'numeric' });
    
    if (isToday) return `${t('activity.today')}, ${formattedDate}`;
    if (isYesterday) return `${t('activity.yesterday')}, ${formattedDate}`;
    return date.toLocaleDateString(i18nextInstance.language, { weekday: 'long', month: 'short', day: 'numeric' });
  };

  const renderDateHeader = (date: string, items: Transaction[]) => {
    const dayTotalAmount = items.reduce((sum, tx) => {
      const isInflow = ['Inflow', 'income'].includes(tx.type);
      const amt = Number(tx.amount || 0);
      const txAcc = accounts.find(a => (a.accountId || a.id) === tx.accountId);
      const rate = getRateToAED(txAcc?.currency || baseCurrency);
      const baseRate = getRateToAED(baseCurrency);
      const amtInBase = (amt * rate) / baseRate;
      return sum + (isInflow ? amtInBase : -amtInBase);
    }, 0);

    return (
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pl-1 pr-1">
        <h3 className="text-xl font-bold text-[#111c2d] font-sans" style={{ fontFamily: "'Google Sans', sans-serif" }}>
          {formatDateHeader(date)}
        </h3>
        <div className="flex items-center gap-2 text-xs font-normal text-neutral-500 font-sans" style={{ fontFamily: "'Google Sans', sans-serif" }}>
          <span className="font-normal">{items.length} {items.length === 1 ? 'transaction' : 'transactions'}</span>
          <span className="text-neutral-300">•</span>
          <span className="font-bold text-[#111C2D] privacy-balance">
            {dayTotalAmount >= 0 ? '+' : '-'}{baseCurrency} {Math.abs(dayTotalAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>
    );
  };

  const filteredUpcoming = filterAndSearchList(upcomingTransactions);
  const filteredHistorical = filterAndSearchList(historicalTransactions);
  const groupedHistorical = groupTransactionsByDate(filteredHistorical);
  const groupedUpcoming = groupTransactionsByDate(filteredUpcoming);

  const activeBaseList = viewMode === 'current' ? historicalTransactions : upcomingTransactions;
  const naturalSearchResult = searchQuery.trim() ? parseNaturalLanguageQuery(searchQuery, activeBaseList) : null;

  const allTransactionsList = [...historicalTransactions, ...upcomingTransactions];
  const selectedTransactionsList = allTransactionsList.filter(tx => selectedTxIds.includes(tx.id));
  const selectedTotalAmount = selectedTransactionsList.reduce((sum, tx) => {
    const isInflow = ['Inflow', 'income'].includes(tx.type);
    return sum + (isInflow ? tx.amount : -tx.amount);
  }, 0);

  const currentDataset = viewMode === 'current' ? filteredHistorical : filteredUpcoming;
  
  const filteredIncome = currentDataset.filter(tx => ['Inflow', 'income', 'credit'].includes(tx.type)).reduce((sum, tx) => {
    const amt = Number(tx.amount || 0);
    const txAcc = accounts.find(a => (a.accountId || a.id) === tx.accountId);
    const rate = getRateToAED(txAcc?.currency || baseCurrency);
    const baseRate = getRateToAED(baseCurrency);
    return sum + ((amt * rate) / baseRate);
  }, 0);

  const filteredExpenses = currentDataset.filter(tx => ['Outflow', 'expense', 'debit'].includes(tx.type)).reduce((sum, tx) => {
    const amt = Number(tx.amount || 0);
    const txAcc = accounts.find(a => (a.accountId || a.id) === tx.accountId);
    const rate = getRateToAED(txAcc?.currency || baseCurrency);
    const baseRate = getRateToAED(baseCurrency);
    return sum + ((amt * rate) / baseRate);
  }, 0);

  const filteredNet = filteredIncome - filteredExpenses;

  const selectedIncome = selectedTransactionsList.filter(tx => ['Inflow', 'income', 'credit'].includes(tx.type)).reduce((sum, tx) => {
    const amt = Number(tx.amount || 0);
    const txAcc = accounts.find(a => (a.accountId || a.id) === tx.accountId);
    const rate = getRateToAED(txAcc?.currency || baseCurrency);
    const baseRate = getRateToAED(baseCurrency);
    return sum + ((amt * rate) / baseRate);
  }, 0);

  const selectedExpenses = selectedTransactionsList.filter(tx => ['Outflow', 'expense', 'debit'].includes(tx.type)).reduce((sum, tx) => {
    const amt = Number(tx.amount || 0);
    const txAcc = accounts.find(a => (a.accountId || a.id) === tx.accountId);
    const rate = getRateToAED(txAcc?.currency || baseCurrency);
    const baseRate = getRateToAED(baseCurrency);
    return sum + ((amt * rate) / baseRate);
  }, 0);

  const selectedNet = selectedIncome - selectedExpenses;

  const sampleQueries = [
    "How much did I spend on dining out last weekend?",
    "Housing & Utilities payments last month",
    "Salary & Income deposits this year"
  ];

  return (
    <div className="w-full max-w-[1200px] mx-auto px-[clamp(1rem,3vw,2rem)] py-6 box-border flex flex-col gap-6">
      
      <header className="w-full flex justify-between items-center pt-2 relative">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <h2 className="tracking-tight text-neutral-900 leading-none">
              <span className="font-bold text-[26px] text-neutral-900 font-g-sans" style={{ fontFamily: "'Google Sans', sans-serif" }}>Activity</span>
            </h2>
            <button
              onClick={() => setShowInfoTooltip(!showInfoTooltip)}
              className="w-6 h-6 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-600 flex items-center justify-center font-bold text-xs transition-colors cursor-pointer select-none shrink-0"
              title="More information"
              aria-label="Activity overview information"
            >
              <Info size={14} />
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open-sms-auto-fetch'))}
            className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold transition-all flex items-center space-x-2 border border-emerald-200 shadow-xs shrink-0 cursor-pointer"
            title="SMS Auto-Fetch & Bank Parser"
          >
            <MessageSquare size={14} className="text-emerald-600" />
            <span>SMS Auto-Fetch</span>
          </button>
        </div>

        {/* Tooltip Box */}
        <AnimatePresence>
          {showInfoTooltip && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              className="absolute top-12 left-0 z-50 max-w-md bg-white border border-neutral-200 rounded-xl p-4 shadow-xl text-[13px] text-neutral-700 font-normal font-g-sans"
              style={{ fontFamily: "'Google Sans', sans-serif" }}
            >
              <div className="flex items-start justify-between gap-3 mb-1.5">
                <span className="font-bold text-neutral-900">Activity Overview Details</span>
                <button 
                  onClick={() => setShowInfoTooltip(false)}
                  className="text-neutral-400 hover:text-neutral-700 font-bold text-xs px-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <p className="leading-relaxed text-neutral-600 font-normal">
                Below you can see all of your transactions one by one, you can filter through them and you can even ask AI about specific transactions.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* UNIFIED CONTROLLER HEADER BAR */}
      <div className="w-full flex flex-col gap-4">
        <div className="w-full p-4 flex flex-col md:flex-row justify-between items-center gap-4 bg-[#FFFFFF] border border-[#F2F4F7] rounded-[24px] shadow-xs">
          {/* Plain-Language "Ask Me Anything" Search Input */}
          <div className="relative w-full md:flex-1 flex items-center">
            <div className="absolute left-3.5 w-7 h-7 rounded-full bg-[#A6DDB1]/30 flex items-center justify-center text-[#2A5235] pointer-events-none shrink-0">
              <Sparkles size={15} />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder='Ask anything... e.g. "How much did I spend on dining out last weekend?"'
              className="w-full bg-[#FAFAFA] hover:bg-[#FFFFFF] focus:bg-[#FFFFFF] border border-[#E5E7EB] focus:border-[#366945] rounded-full py-2.5 pl-12 pr-28 text-sm text-[#111C2D] outline-none transition-all placeholder:text-neutral-400 font-normal font-sans"
              style={{ fontFamily: "'Google Sans', sans-serif" }}
            />
            
            <div className="absolute right-3 flex items-center gap-2">
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#366945]/10 text-[#2A5235] text-[10px] font-bold shrink-0">
                <Sparkles size={10} />
                <span>Tier 2 & 3</span>
              </span>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="p-1 rounded-full hover:bg-neutral-200 text-neutral-500 transition-colors border-none bg-transparent cursor-pointer"
                  title="Clear search"
                >
                  <X size={15} />
                </button>
              )}
              <Filter 
                size={18} 
                className={`cursor-pointer transition-colors ${isFilterDrawerOpen ? 'text-[#366945]' : 'text-neutral-500 hover:text-neutral-800'}`}
                onClick={() => setIsFilterDrawerOpen(!isFilterDrawerOpen)}
              />
              <button
                type="button"
                onClick={handleExportExcel}
                className="p-1 rounded-full hover:bg-neutral-100 text-neutral-500 hover:text-neutral-800 transition-colors border-none bg-transparent cursor-pointer flex items-center justify-center"
                title="Export All Transactions to Excel (.xlsx)"
              >
                <FileDown size={18} />
              </button>
            </div>
          </div>


        </div>

        {/* Quick Sample Conversational Query Chips - Stacked vertically */}
        <div className="flex flex-col gap-2 px-1 py-1">
          <span className="text-[11px] font-bold text-neutral-500 flex items-center gap-1.5">
            <Bot size={13} className="text-[#366945]" />
            <span>Try asking:</span>
          </span>
          <div className="flex flex-col gap-1.5">
            {sampleQueries.map((q, idx) => (
              <button
                key={idx}
                onClick={() => setSearchQuery(q)}
                className="w-full text-left px-3.5 py-2 rounded-xl bg-white hover:bg-[#F4FDF7] hover:border-[#A6DDB1] border border-[#E5E7EB] text-[12.5px] font-normal text-neutral-700 transition-all cursor-pointer shadow-2xs flex items-center justify-between group"
                style={{ fontFamily: "'Google Sans', sans-serif" }}
              >
                <div className="flex items-center gap-2">
                  <Sparkles size={12} className="text-[#366945] shrink-0 group-hover:scale-110 transition-transform" />
                  <span>{q}</span>
                </div>
                <ChevronRight size={14} className="text-neutral-400 group-hover:text-[#366945] transition-colors shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {/* Conversational Natural Query Answer Banner */}
        <AnimatePresence>
          {searchQuery.trim().length > 0 && (
            !isTier2Or3User() ? (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="w-full p-4 rounded-2xl bg-gradient-to-r from-amber-50/90 via-emerald-50/40 to-white border border-amber-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                style={{ fontFamily: "'Google Sans', sans-serif" }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-[#366945] text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Lock size={17} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-neutral-900 font-sans">
                        Plain-Language AI Search
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold font-sans">
                        Tier 2 & 3 Exclusive
                      </span>
                    </div>
                    <p className="text-xs text-neutral-600 font-normal font-sans mt-0.5">
                      Conversational search across categories, subcategories, and custom date ranges is reserved for Tier 2 and Tier 3 subscribers.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('open-premium-modal'))}
                  className="px-4 py-2 rounded-full bg-[#1E2229] hover:bg-black text-white text-xs font-bold font-sans flex items-center justify-center gap-1.5 transition-all shrink-0 cursor-pointer shadow-xs"
                >
                  <Sparkles size={13} className="text-[#A6DDB1]" />
                  <span>Upgrade to Tier 2 / 3</span>
                </button>
              </motion.div>
            ) : (
              naturalSearchResult && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="w-full p-4 rounded-2xl bg-gradient-to-r from-[#F0FDF4] via-[#ECFDF5] to-[#FFFFFF] border border-[#A6DDB1] shadow-xs flex items-start gap-3"
                  style={{ fontFamily: "'Google Sans', sans-serif" }}
                >
                  <div className="w-8 h-8 rounded-xl bg-[#366945] text-white flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles size={16} />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-[#2A5235]">
                          Plain-Language Insight
                        </span>
                        {naturalSearchResult.categoryMatched && (
                          <span className="px-2 py-0.5 rounded-full bg-[#A6DDB1]/30 text-[#1E3A23] text-[10px] font-bold">
                            {naturalSearchResult.categoryMatched}
                          </span>
                        )}
                        {naturalSearchResult.subcategoryMatched && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                            {naturalSearchResult.subcategoryMatched}
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-bold text-[#111C2D]">
                        {naturalSearchResult.count} result{naturalSearchResult.count === 1 ? '' : 's'}
                      </span>
                    </div>
                    <p className="text-sm font-normal text-neutral-800 leading-relaxed">
                      {naturalSearchResult.answerText}
                    </p>
                  </div>
                </motion.div>
              )
            )
          )}
        </AnimatePresence>

        <div className="w-full flex justify-between items-center bg-white rounded-[24px]">
          <div className="flex gap-2">
            <button 
              onClick={() => setViewMode('future')}
              className={`p-[6px] rounded-[20px] h-[40px] text-[12px] w-[150px] transition-all font-bold flex items-center justify-center ${viewMode === 'future' ? 'text-[#111C2D] bg-[#A6DDB1]' : 'text-[#57606F]'}`}
            >
              {t('activity.future_transactions')}
            </button>
            <button 
              onClick={() => setViewMode('current')}
              className={`p-[6px] rounded-[20px] h-[40px] text-[12px] w-[150px] transition-all font-bold flex items-center justify-center ${viewMode === 'current' ? 'text-[#111C2D] bg-[#A6DDB1]' : 'text-[#57606F]'}`}
            >
              {t('activity.current_transactions')}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isFilterDrawerOpen && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }} 
            animate={{ opacity: 1, height: 'auto' }} 
            exit={{ opacity: 0, height: 0 }} 
            className="w-full bg-white border border-[#E5E7EB] rounded-[24px] p-5 flex flex-col gap-4 shadow-xs overflow-hidden shrink-0"
            style={{ fontFamily: "'Google Sans', sans-serif" }}
          >
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Type / Flow filter */}
              <div className="flex flex-col gap-2">
                <label className="text-[12px] text-gray-500 font-normal">
                  {t('activity.filter_by_type', 'Transaction Type')}
                </label>
                <div className="flex gap-1.5 flex-wrap">
                  {(['All', 'Inflow', 'Outflow'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setSelectedType(type)}
                      className="px-3 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer"
                      style={{
                        backgroundColor: selectedType === type ? '#A6DDB1' : '#F3F4F6',
                        borderColor: selectedType === type ? 'transparent' : '#E5E7EB',
                        color: selectedType === type ? '#111C2D' : '#4B5563'
                      }}
                    >
                      {type === 'All' ? t('activity.all_records') : (type === 'Inflow' ? t('activity.confirmed_inflows') : t('activity.outflow_statements'))}
                    </button>
                  ))}
                </div>
              </div>

              {/* Account filter */}
              <div className="flex flex-col gap-2">
                <label className="text-[12px] text-gray-500 font-normal">
                  {t('activity.filter_by_account', 'Account')}
                </label>
                <div className="w-full bg-white border border-[#E5E7EB] rounded-xl p-2 max-h-40 overflow-y-auto flex flex-col gap-1">
                  <label className="flex items-center gap-2 px-2 py-1 hover:bg-neutral-50 rounded-lg cursor-pointer text-xs font-normal text-neutral-800">
                    <input
                      type="checkbox"
                      checked={selectedAccountIds.includes('All') || selectedAccountIds.length === 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedAccountIds(['All']);
                        } else {
                          setSelectedAccountIds([]);
                        }
                      }}
                      className="rounded border-neutral-300 text-[#366945] focus:ring-[#366945]"
                    />
                    <span className="font-bold">{t('activity.all_accounts', 'All Accounts')}</span>
                  </label>
                  {accounts.filter(a => !a.isArchived).map(acc => {
                    const accId = acc.accountId || acc.id;
                    const isChecked = selectedAccountIds.includes(accId);
                    return (
                      <label key={accId} className="flex items-center gap-2 px-2 py-1 hover:bg-neutral-50 rounded-lg cursor-pointer text-xs font-normal text-neutral-800">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            let next: string[];
                            if (e.target.checked) {
                              next = selectedAccountIds.filter(id => id !== 'All');
                              next.push(accId);
                            } else {
                              next = selectedAccountIds.filter(id => id !== accId && id !== 'All');
                              if (next.length === 0) next = ['All'];
                            }
                            setSelectedAccountIds(next);
                          }}
                          className="rounded border-neutral-300 text-[#366945] focus:ring-[#366945]"
                        />
                        <span>{acc.name} ({acc.currency})</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Category filter */}
              <div className="flex flex-col gap-2">
                <label className="text-[12px] text-gray-500 font-normal">
                  {t('activity.filter_by_category', 'Category')}
                </label>
                <div className="w-full bg-white border border-[#E5E7EB] rounded-xl p-2 max-h-40 overflow-y-auto flex flex-col gap-1">
                  <label className="flex items-center gap-2 px-2 py-1 hover:bg-neutral-50 rounded-lg cursor-pointer text-xs font-normal text-neutral-800">
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes('All') || selectedCategories.length === 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedCategories(['All']);
                    setSelectedSubcategories(['All']);
                        } else {
                          setSelectedCategories([]);
                        }
                      }}
                      className="rounded border-neutral-300 text-[#366945] focus:ring-[#366945]"
                    />
                    <span className="font-bold">{t('activity.all_categories', 'All Categories')}</span>
                  </label>
                  {categories.map(cat => {
                    const catName = cat.name;
                    const isChecked = selectedCategories.includes(catName);
                    return (
                      <label key={cat.id || catName} className="flex items-center gap-2 px-2 py-1 hover:bg-neutral-50 rounded-lg cursor-pointer text-xs font-normal text-neutral-800">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            let next: string[];
                            if (e.target.checked) {
                              next = selectedCategories.filter(id => id !== 'All');
                              next.push(catName);
                            } else {
                              next = selectedCategories.filter(id => id !== catName && id !== 'All');
                              if (next.length === 0) next = ['All'];
                            }
                            setSelectedCategories(next);
                          }}
                          className="rounded border-neutral-300 text-[#366945] focus:ring-[#366945]"
                        />
                        <span>{translateCategoryOrSubcategory(catName, t)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Sub-category filter */}
              <div className="flex flex-col gap-2">
                <label className="text-[12px] text-gray-500 font-normal">
                  {t('activity.filter_by_subcategory', 'Sub-category')}
                </label>
                <div className="w-full bg-white border border-[#E5E7EB] rounded-xl p-2 max-h-40 overflow-y-auto flex flex-col gap-1">
                  <label className="flex items-center gap-2 px-2 py-1 hover:bg-neutral-50 rounded-lg cursor-pointer text-xs font-normal text-neutral-800">
                    <input
                      type="checkbox"
                      checked={selectedSubcategories.includes('All') || selectedSubcategories.length === 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedSubcategories(['All']);
                        } else {
                          setSelectedSubcategories([]);
                        }
                      }}
                      className="rounded border-neutral-300 text-[#366945] focus:ring-[#366945]"
                    />
                    <span className="font-bold">{t('activity.all_subcategories', 'All Sub-categories')}</span>
                  </label>
                  {availableSubcategories.map(subName => {
                    const isChecked = selectedSubcategories.includes(subName);
                    return (
                      <label key={subName} className="flex items-center gap-2 px-2 py-1 hover:bg-neutral-50 rounded-lg cursor-pointer text-xs font-normal text-neutral-800">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            let next: string[];
                            if (e.target.checked) {
                              next = selectedSubcategories.filter(id => id !== 'All');
                              next.push(subName);
                            } else {
                              next = selectedSubcategories.filter(id => id !== subName && id !== 'All');
                              if (next.length === 0) next = ['All'];
                            }
                            setSelectedSubcategories(next);
                          }}
                          className="rounded border-neutral-300 text-[#366945] focus:ring-[#366945]"
                        />
                        <span>{translateCategoryOrSubcategory(subName, t)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Date Range filter */}
              <div className="flex flex-col gap-2">
                <label className="text-[12px] text-gray-500 font-normal">
                  {t('activity.filter_by_date', 'Date Range')}
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type={(focusedStart || startDate) ? 'date' : 'text'}
                    placeholder={t('activity.date_placeholder', 'mm/dd/yyyy')}
                    onFocus={() => setFocusedStart(true)}
                    onBlur={() => setFocusedStart(false)}
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-white border border-[#E5E7EB] rounded-xl py-1.5 px-2 text-xs text-[#111C2D] focus:border-[#A6DDB1] outline-none transition-all font-normal"
                  />
                  <span className="text-gray-400 text-xs font-normal">{t('activity.to', 'to')}</span>
                  <input
                    type={(focusedEnd || endDate) ? 'date' : 'text'}
                    placeholder={t('activity.date_placeholder', 'mm/dd/yyyy')}
                    onFocus={() => setFocusedEnd(true)}
                    onBlur={() => setFocusedEnd(false)}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-white border border-[#E5E7EB] rounded-xl py-1.5 px-2 text-xs text-[#111C2D] focus:border-[#A6DDB1] outline-none transition-all font-normal"
                  />
                </div>
              </div>
            </div>

            {/* Clear filter option if active */}
            {(selectedType !== 'All' || !selectedAccountIds.includes('All') || !selectedCategories.includes('All') || startDate || endDate) && (
              <div className="flex justify-end pt-2 border-t border-neutral-100">
                <button
                  onClick={() => {
                    setSelectedType('All');
                    setSelectedAccountIds(['All']);
                    setSelectedCategories(['All']);
                    setSelectedSubcategories(['All']);
                    setStartDate('');
                    setEndDate('');
                  }}
                  className="text-xs text-red-500 hover:text-red-600 font-bold cursor-pointer flex items-center gap-1 active:scale-95 transition-all"
                >
                  {t('activity.clear_filters', 'Clear Filters')}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedTxIds.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="w-full bg-[#E8F5E9] border border-[#C8E6C9] rounded-2xl p-4 flex items-center justify-between shadow-sm mb-4"
            style={{ fontFamily: "'Google Sans', sans-serif" }}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#366945] text-white flex items-center justify-center font-bold text-xs">
                {selectedTxIds.length}
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-neutral-900">
                  {selectedTxIds.length} transaction{selectedTxIds.length === 1 ? '' : 's'} selected
                </span>
                <span className="text-[11px] text-neutral-600 font-normal">
                  Combined Total Amount
                </span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm font-bold text-[#366945] privacy-balance">
                {selectedTotalAmount >= 0 ? '+' : '-'}{baseCurrency} {Math.abs(selectedTotalAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <button
                onClick={() => setSelectedTxIds([])}
                className="text-xs text-neutral-500 hover:text-neutral-800 font-bold px-3 py-1.5 bg-white rounded-lg border border-neutral-200 cursor-pointer shadow-2xs"
              >
                Clear Selection
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* COMPACT ACTIVITY DASHBOARD (NOT STICKY) */}
      <div className="w-full bg-white border border-neutral-200/80 rounded-2xl p-4 shadow-sm flex flex-col gap-3" style={{ fontFamily: "'Google Sans', sans-serif" }}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-2.5 border-b border-neutral-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#366945]/10 text-[#366945] flex items-center justify-center font-bold">
              <Activity size={16} />
            </div>
            <div>
              <h3 className="text-xs font-bold text-neutral-900 font-sans">
                Activity Financial Summary
              </h3>
              <p className="text-[10px] font-normal text-neutral-500 font-sans">
                {viewMode === 'current' ? 'Current Historical' : 'Future Scheduled'} ({currentDataset.length} items)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {!selectedAccountIds.includes('All') && selectedAccountIds.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700 text-[10px] font-bold">
                Accounts: {selectedAccountIds.map(id => accounts.find(a => (a.accountId || a.id) === id)?.name || id).join(', ')}
              </span>
            )}
            {!selectedCategories.includes('All') && selectedCategories.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-[#366945] text-[10px] font-bold">
                Categories: {selectedCategories.join(', ')}
              </span>
            )}
            {!selectedSubcategories.includes('All') && selectedSubcategories.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-50/80 text-[#1E4327] text-[10px] font-bold border border-[#a6ddb1]/40">
                Sub-categories: {selectedSubcategories.join(', ')}
              </span>
            )}
            {selectedType !== 'All' && (
              <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold">
                Type: {selectedType}
              </span>
            )}
            {((startDate && !startDate.includes('Invalid')) || (endDate && !endDate.includes('Invalid'))) && (
              <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 text-[10px] font-bold">
                Date: {startDate && !startDate.includes('Invalid') ? startDate : 'Start'} to {endDate && !endDate.includes('Invalid') ? endDate : 'End'}
              </span>
            )}
          </div>
        </div>

        {/* Dashboard Metrics Grid (Compact) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Income Card */}
          <div className="p-3 rounded-xl bg-emerald-50/40 border border-emerald-100/80 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[11px] font-normal text-neutral-600">Total Income</span>
              <span className="text-sm font-bold text-emerald-700 privacy-balance mt-0.5">
                +{baseCurrency} {filteredIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-neutral-400 font-normal">
                {currentDataset.filter(tx => ['Inflow', 'income', 'credit'].includes(tx.type)).length} inflow
              </span>
            </div>
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <ArrowDownLeft size={15} />
            </div>
          </div>

          {/* Expenses Card */}
          <div className="p-3 rounded-xl bg-rose-50/40 border border-rose-100/80 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[11px] font-normal text-neutral-600">Total Expenses</span>
              <span className="text-sm font-bold text-rose-700 privacy-balance mt-0.5">
                -{baseCurrency} {filteredExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-neutral-400 font-normal">
                {currentDataset.filter(tx => ['Outflow', 'expense', 'debit'].includes(tx.type)).length} outflow
              </span>
            </div>
            <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
              <ArrowUpRight size={15} />
            </div>
          </div>

          {/* Net Cashflow Card */}
          <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200/80 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[11px] font-normal text-neutral-600">Net Balance</span>
              <span className={`text-sm font-bold privacy-balance mt-0.5 ${filteredNet >= 0 ? 'text-[#366945]' : 'text-rose-600'}`}>
                {filteredNet >= 0 ? '+' : '-'}{baseCurrency} {Math.abs(filteredNet).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-neutral-400 font-normal">
                Filtered sum
              </span>
            </div>
            <div className="w-8 h-8 rounded-lg bg-neutral-200 text-neutral-700 flex items-center justify-center shrink-0">
              <Activity size={15} />
            </div>
          </div>
        </div>

        {/* Selected Transactions Live Sub-Panel (if any checked) */}
        <AnimatePresence>
          {selectedTxIds.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="pt-2.5 border-t border-neutral-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 bg-[#F0FDF4] p-3 rounded-xl border border-emerald-200"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-full bg-[#366945] text-white flex items-center justify-center font-bold text-[11px]">
                  {selectedTxIds.length}
                </div>
                <div className="flex flex-col">
                  <span className="text-[11px] font-bold text-neutral-900">
                    Selected Summary ({selectedTxIds.length} checked)
                  </span>
                  <div className="flex items-center gap-2 text-[10px] text-neutral-600 font-normal">
                    <span>Income: <strong className="text-emerald-700">+{baseCurrency} {selectedIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                    <span>•</span>
                    <span>Expenses: <strong className="text-rose-700">-{baseCurrency} {selectedExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <span className={`text-[11px] font-bold ${selectedNet >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  Net: {selectedNet >= 0 ? '+' : '-'}{baseCurrency} {Math.abs(selectedNet).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <button
                  onClick={() => setSelectedTxIds([])}
                  className="px-2.5 py-1 bg-white hover:bg-neutral-100 text-neutral-700 text-[11px] font-bold rounded-lg border border-neutral-200 cursor-pointer shadow-2xs transition-all"
                >
                  Clear
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* HISTORICAL LOG CARDS GRID CONTAINER */}
      <div className="w-full flex flex-col gap-10">
        {viewMode === 'future' ? (
           <div className="flex flex-col gap-8">
             {filteredUpcoming.length > 0 ? (
                Object.entries(groupedUpcoming).map(([date, items], dateIdx) => (
                  <div key={`upcoming-${date}-${dateIdx}`} className="flex flex-col gap-4">
                    {renderDateHeader(date, items)}
                    <div className="bg-[#FFFFFF] border border-[#F2F4F7] rounded-[24px] overflow-hidden">
                      {items.map((tx, idx) => (
                        <React.Fragment key={`${tx.id}-${idx}`}>
                          <TransactionRow 
                            tx={tx} 
                            accounts={accounts} 
                            onClick={() => setSelectedTx(tx)} 
                            isSelected={selectedTxIds.includes(tx.id)}
                            onToggleSelect={(e) => toggleSelectTx(tx.id, e)}
                          />
                          {idx < items.length - 1 && <div className="mx-6 border-b border-neutral-100" />}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))
             ) : (
                <div className="p-10 text-center bg-[#FFFFFF] border border-[#F2F4F7] rounded-[24px] text-neutral-400 font-bold text-sm">
                  {t('activity.no_future_found')}
                </div>
             )}
           </div>
        ) : (
          <div className="flex flex-col gap-8">
            {loading ? (
              <div className="w-full p-12 flex justify-center items-center bg-white border border-[#F2F4F7] rounded-[24px] text-neutral-400 font-bold text-sm gap-3">
                <RefreshCw size={20} className="animate-spin text-[#366945]" />
                <span>{t('activity.syncing_db')}</span>
              </div>
            ) : filteredHistorical.length === 0 ? (
              <div className="w-full p-16 flex flex-col justify-center items-center bg-[#FFFFFF] border border-[#F2F4F7] rounded-[24px] text-center">
                <span className="text-neutral-400 font-bold text-base">{t('activity.no_recorded_logs')}</span>
              </div>
            ) : (
              Object.entries(groupedHistorical).map(([date, items], dateIdx) => (
                <div key={`historical-${date}-${dateIdx}`} className="flex flex-col gap-4">
                  {renderDateHeader(date, items)}
                  <div className="bg-[#FFFFFF] border border-[#F2F4F7] rounded-[24px] overflow-hidden">
                    {items.map((tx, idx) => (
                      <React.Fragment key={`${tx.id}-${idx}`}>
                        <TransactionRow 
                          tx={tx} 
                          accounts={accounts} 
                          onClick={() => setSelectedTx(tx)} 
                          isSelected={selectedTxIds.includes(tx.id)}
                          onToggleSelect={(e) => toggleSelectTx(tx.id, e)}
                        />
                        {idx < items.length - 1 && <div className="mx-6 border-b border-[#F9FAFB]" />}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedTx && (
          <TransactionDetailModal key="tx-detail-modal" tx={selectedTx} uid={uid} isOpen={!!selectedTx} onClose={() => setSelectedTx(null)} />
        )}
        {isAddModalOpen && (
          <AddTransactionModal key="tx-add-modal" isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} uid={uid} accounts={accounts} onSuccess={() => {}} profile={profile} getRateToAED={getRateToAED} />
        )}
      </AnimatePresence>
    </div>
  );
};

/* ==========================================================================
   TRANSACTION ROW CHILD CONTAINER SUB-ELEMENT
   ========================================================================== */
const TransactionRow: React.FC<{ 
  tx: Transaction; 
  accounts: any[]; 
  onClick: () => void;
  isSelected: boolean;
  onToggleSelect: (e: React.MouseEvent) => void;
}> = ({ accounts, tx, onClick, isSelected, onToggleSelect }) => {
  const { t } = useTranslation();
  const isInflow = ['Inflow', 'income'].includes(tx.type);
  const isOutflow = ['Outflow', 'expense'].includes(tx.type);
  const targetAccount = accounts.find(a => (a.accountId || a.id) === tx.accountId);
  const category = tx.category || 'Others';
  const subcategory = tx.subCategory || tx.subcategory || 'General';
  const displayCategory = subcategory === 'General' || subcategory === 'All' ? category : subcategory;
  
  const translatedCategory = translateCategoryOrSubcategory(category, t);
  const translatedSubcategory = translateCategoryOrSubcategory(subcategory, t);
  const displayLabel = subcategory === 'General' || subcategory === 'All' ? translatedCategory : translatedSubcategory;

  const getCatIcon = () => {
    const name = displayCategory.toLowerCase();
    if (name.includes('transfer')) return <RefreshCw size={20} />;
    if (name.includes('grocer')) return <ShoppingCart size={20} />;
    if (name.includes('transp')) return <Car size={20} />;
    if (name.includes('health')) return <Activity size={20} />;
    if (name.includes('shop')) return <Tag size={20} />;
    if (name.includes('income') || name.includes('wage')) return <ArrowDownLeft size={20} />;
    return <ShoppingCart size={20} />;
  };

  const getCatStyles = () => {
    const name = displayCategory.toLowerCase();
    if (name.includes('transfer')) return { bg: 'bg-[#F0F4FF]', text: 'text-[#3B82F6]' };
    if (name.includes('grocer')) return { bg: 'bg-[#e8f5e9]', text: 'text-[#366945]' };
    if (name.includes('transp')) return { bg: 'bg-[#f0f4ff]', text: 'text-[#3f51b5]' };
    if (name.includes('health')) return { bg: 'bg-[#fff0f0]', text: 'text-[#d32f2f]' };
    if (name.includes('shop')) return { bg: 'bg-[#ffedfa]', text: 'text-[#c2185b]' };
    if (name.includes('income') || name.includes('wage')) return { bg: 'bg-[#e8f5e9]', text: 'text-[#366945]' };
    return { bg: 'bg-[#FFFFFF] border border-[#E5E7EB]', text: 'text-neutral-500' };
  };

  const styles = getCatStyles();

  return (
    <div 
      onClick={onClick} 
      className={`w-full flex items-center justify-between p-6 cursor-pointer transition-colors active:scale-[0.99] select-none ${isSelected ? 'bg-[#F0FDF4]' : 'bg-white hover:bg-[#F9FAFB]'}`}
    >
      <div className="flex items-center gap-4 min-w-0 flex-1">
        <div 
          onClick={onToggleSelect}
          className="flex items-center justify-center p-1 cursor-pointer shrink-0"
          title="Select transaction"
        >
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => {}}
            onClick={onToggleSelect}
            className="w-4 h-4 rounded text-[#366945] focus:ring-[#366945] cursor-pointer accent-[#366945]"
          />
        </div>
        <div className={`w-12 h-12 rounded-full shrink-0 flex items-center justify-center ${styles.bg} ${styles.text}`}>
          {getCatIcon()}
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[12px] font-normal text-[#111C2D] truncate font-sans">
            {tx.isUpcoming ? `${displayLabel} — ${new Date(tx.date).toLocaleDateString(i18nextInstance.language, { month: 'short', day: 'numeric', year: 'numeric' })}` : displayLabel}
          </span>
          <div className="flex items-center gap-1.5 text-[12px] text-neutral-400 font-bold mt-0.5 font-sans">
            <span className="truncate">{targetAccount?.name || t('common.checking_account')}</span>
          </div>
        </div>
      </div>
      <div className="shrink-0 pl-4 text-right flex flex-col items-end">
        <span className={`text-[12px] font-bold font-sans privacy-balance ${isInflow ? 'text-[#366945]' : 'text-[#111C2D]'}`}>
          {isInflow ? '+' : '-'}{targetAccount?.currency || 'AED'} {tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <span className="text-[12px] text-neutral-400 font-bold font-sans mt-0.5">
          {tx.time || '10:42 AM'}
        </span>
      </div>
    </div>
  );
};