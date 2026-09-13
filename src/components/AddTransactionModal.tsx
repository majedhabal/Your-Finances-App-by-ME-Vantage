import React, { useState, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n';
import { motion, AnimatePresence } from 'motion/react';
import { X, RefreshCw, Sparkles, GitBranch } from 'lucide-react';
import { collection, addDoc, serverTimestamp, onSnapshot, query, doc, updateDoc, increment, getDocs, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { formatLabel, translateCategoryOrSubcategory } from '../lib/stringUtils';
import { getCachedAccessToken, createGoogleCalendarEvent, createGoogleTask, connectGoogleWorkspace } from '../lib/googleAuth';
import { MASTER_CATEGORIES } from '../lib/constants';
import { getLocalTodayString, getLocalCurrentMonthString } from '../lib/dateSimulator';
import { DEFAULT_RATES } from '../lib/exchangeRates';

const getRateToAED = (curr: string) => {
  const c = curr || 'AED';
  if (c === 'AED') return 1;
  try {
    const cached = localStorage.getItem('vantage_exchange_rates');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed[c]) return parsed[c];
    }
  } catch (e) {}
  return (DEFAULT_RATES as any)[c] || 1;
};

// Helper to calculate next generation date for recurring logic
const calculateNextDate = (baseDate: string, freq: string, interval: number, dayOption: string = 'sameDate') => {
  const [year, month, day] = baseDate.split('-').map(Number);
  const d = new Date(year, month - 1, day, 12, 0, 0);
  const originalDay = d.getDate();
  const originalWeekday = d.getDay();

  if (freq === 'daily') {
    d.setDate(d.getDate() + interval);
  } else if (freq === 'weekly') {
    d.setDate(d.getDate() + (interval * 7));
  } else if (freq === 'monthly') {
    if (dayOption === 'sameDate') {
      d.setMonth(d.getMonth() + interval);
      if (d.getDate() < originalDay) d.setDate(0);
    } else {
      d.setMonth(d.getMonth() + interval);
      const diff = originalWeekday - d.getDay();
      d.setDate(d.getDate() + diff);
    }
  } else if (freq === 'yearly') {
    if (dayOption === 'sameDate') {
      d.setFullYear(d.getFullYear() + interval);
    } else {
      d.setFullYear(d.getFullYear() + interval);
      const diff = originalWeekday - d.getDay();
      d.setDate(d.getDate() + diff);
    }
  }
  
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export const AddTransactionModal: React.FC<any> = ({
  isOpen, onClose, uid, onSuccess, accounts = [], mode = 'expense', setMode, profile, getRateToAED: propGetRateToAED, initialSmsData
}) => {
  const { t } = useTranslation();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.body.classList.add('hide-header-footer');
      window.dispatchEvent(new CustomEvent('add-transaction-modal-toggled', { detail: { isOpen: true } }));
    } else {
      document.body.style.overflow = 'auto';
      document.body.classList.remove('hide-header-footer');
      window.dispatchEvent(new CustomEvent('add-transaction-modal-toggled', { detail: { isOpen: false } }));
    }
    return () => {
      document.body.style.overflow = 'auto';
      document.body.classList.remove('hide-header-footer');
      window.dispatchEvent(new CustomEvent('add-transaction-modal-toggled', { detail: { isOpen: false } }));
    };
  }, [isOpen]);

  const getRateToAED = propGetRateToAED || ((curr: string) => (curr === 'AED' ? 1 : 1));
  const baseCurrency = profile?.baseCurrency || profile?.currency || 'AED';
  const isFree = !profile?.subscriptionTier || profile?.subscriptionTier?.toLowerCase() === 'free';
  const [categories, setCategories] = useState<any[]>([]);

  useEffect(() => {
    if (initialSmsData && isOpen) {
      if (initialSmsData.amount) setAmount(initialSmsData.amount.toString());
      if (initialSmsData.merchant) setNotes(initialSmsData.merchant);
      if (initialSmsData.type && setMode) {
        setMode(initialSmsData.type === 'income' ? 'income' : 'expense');
      }

      const activeAccs = (accounts || []).filter((acc: any) => !acc.isArchived);
      if (activeAccs.length > 0) {
        const smsText = (initialSmsData.rawText || '').toUpperCase();
        const smsSender = (initialSmsData.sender || '').toUpperCase();
        
        const matchedAccount = activeAccs.find((acc: any) => {
          const accName = (acc.name || '').toUpperCase();
          const bankKeywords = ['ADCB', 'ENBD', 'FAB', 'DIB', 'MASHREQ', 'HSBC', 'RAKBANK', 'CBD', 'SIB', 'CBK'];
          for (const kw of bankKeywords) {
            if ((smsText.includes(kw) || smsSender.includes(kw)) && accName.includes(kw)) {
              return true;
            }
          }
          if (accName.includes(smsSender) || smsSender.includes(accName)) {
            return true;
          }
          return false;
        });

        if (matchedAccount) {
          setAccountId(matchedAccount.id);
        }
      }
    }
  }, [initialSmsData, isOpen, accounts]);

  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, `users/${uid}/custom_categories`));
    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCategories(list.length > 0 ? list : MASTER_CATEGORIES.map((c, i) => ({ ...c, id: `default-${i}` })));
    });
    return () => unsubscribe();
  }, [uid]);

  const defaultCategory = categories.length > 0 ? categories[0].name : '';
  const [amount, setAmount] = useState('');
  const numericAmount = Number(amount) || 0;
  const [notes, setNotes] = useState('');
  const [category, setCategory] = useState(defaultCategory);
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [showCategorySuggestions, setShowCategorySuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [recentCategories, setRecentCategories] = useState<{ category: string; subcategory: string }[]>([]);

  useEffect(() => {
    if (!uid) return;
    try {
      const recentKey = `vantage_recent_categories_${uid}`;
      const stored = JSON.parse(localStorage.getItem(recentKey) || '[]');
      if (stored.length > 0) {
        setRecentCategories(stored);
      } else {
        setRecentCategories([
          { category: 'Food & Dining', subcategory: 'Groceries (Supermarkets, local markets)' },
          { category: 'Food & Dining', subcategory: 'Coffee & Snacks' },
          { category: 'Transportation & Mobility', subcategory: 'Fuel / EV Charging' }
        ]);
      }
    } catch (e) {
      setRecentCategories([
        { category: 'Food & Dining', subcategory: 'Groceries (Supermarkets, local markets)' },
        { category: 'Food & Dining', subcategory: 'Coffee & Snacks' },
        { category: 'Transportation & Mobility', subcategory: 'Fuel / EV Charging' }
      ]);
    }
  }, [uid, isOpen]);

  function getCategorySuggestions(query: string, cats: any[]) {
    const q = query.toLowerCase().trim();
    if (q.length < 2) return [];

    const results: { category: string; subcategory: string }[] = [];

    // Comprehensive keyword mapping dictionary with rich synonyms and merchants
    const addMap = (kwList: string[], category: string, subcategory: string) => {
      if (kwList.some(kw => q.includes(kw))) {
        results.push({ category, subcategory });
      }
    };

    // Food & Dining
    addMap(['wash', 'powder', 'soap', 'detergent', 'grocery', 'groceries', 'milk', 'bread', 'fruit', 'veg', 'vegetable', 'super', 'market', 'meat', 'chicken', 'fish', 'egg', 'cheese', 'water', 'rice', 'oil', 'salt', 'pepper', 'spice', 'spices', 'sugar', 'herb', 'condiment', 'sauce', 'butter', 'pasta', 'flour', 'chocolate', 'candy', 'lulu', 'carrefour', 'spinneys', 'coop', 'waitrose', 'hypermarket', 'snack', 'food', 'supermarket'], 'Food & Dining', 'Groceries (Supermarkets, local markets)');
    addMap(['coffee', 'cafe', 'tea', 'starbucks', 'costa', 'juice', 'bakery', 'pastry', 'donut', 'latte', 'espresso', 'cappuccino', 'biscuit', 'cookie'], 'Food & Dining', 'Coffee & Snacks');
    addMap(['restaurant', 'dine', 'dinner', 'lunch', 'breakfast', 'burger', 'pizza', 'sushi', 'grill', 'kebab', 'shawarma', 'mcdonalds', 'kfc', 'talabat', 'deliveroo', 'uber eats', 'eat', 'buffet', 'steak', 'pasta', 'italian', 'chinese', 'indian', 'arabic', 'seafood'], 'Food & Dining', 'Restaurants & Dining Out');

    // Transportation & Mobility
    addMap(['fuel', 'gas', 'petrol', 'charg', 'ev ', 'adnoc', 'enoc', 'Emirates', 'station', 'diesel'], 'Transportation & Mobility', 'Fuel / EV Charging');
    addMap(['toll', 'salik', 'park', 'traffic', 'fine', 'darb', 'meter'], 'Transportation & Mobility', 'Road Tolls & Parking');
    addMap(['uber', 'careem', 'taxi', 'ride', 'cab', 'lyft', 'metro', 'bus', 'train', 'transport'], 'Transportation & Mobility', 'Rideshare & Taxis');
    addMap(['car payment', 'lease', 'loan', 'installment', 'auto loan', 'vehicle finance'], 'Transportation & Mobility', 'Car Payment / Lease');
    addMap(['car wash', 'service', 'garage', 'mechanic', 'tire', 'battery', 'insurance', 'registration', 'renewal', 'mulkiya'], 'Transportation & Mobility', 'Car Maintenance, Wash & Insurance');

    // Housing & Living
    addMap(['rent', 'mortgage', 'hous', 'apartment', 'villa', 'lease', 'landlord', 'tenant', 'real estate'], 'Housing & Living', 'Rent / Mortgage');
    addMap(['electric', 'water', 'dewa', 'utility', 'bill', 'empac', 'gas', 'power', 'cooling', 'empower'], 'Housing & Living', 'Utilities (Electricity, Water, Gas)');
    addMap(['maintenance', 'repair', 'plumb', 'electrician', 'ac service', 'carpenter', 'pest', 'cleaning', 'maid', 'nanny'], 'Housing & Living', 'Home Maintenance & Repairs');
    addMap(['furniture', 'sofa', 'bed', 'table', 'chair', 'decor', 'lamp', 'curtain', 'ikea', 'home box', 'pan emirates'], 'Housing & Living', 'Furniture & Home Decor');

    // Bills & Subscriptions
    addMap(['internet', 'wifi', 'broadband', 'du', 'etisalat', 'virgin', 'fiber', 'router'], 'Bills & Subscriptions', 'Home Internet & TV');
    addMap(['phone', 'mobile', 'cell', 'sim', 'data', 'postpaid', 'prepaid', 'plan'], 'Bills & Subscriptions', 'Mobile & Data');
    addMap(['netflix', 'spotify', 'apple', 'google', 'subscript', 'software', 'cloud', 'ai tool', 'chatgpt', 'disney', 'prime', 'youtube', 'microsoft', 'adobe', 'membership'], 'Bills & Subscriptions', 'Digital Subscriptions (Streaming, cloud, AI tools, software)');
    addMap(['gym', 'fitness', 'yoga', 'workout', 'crossfit', 'trainer', 'membership', 'sport', 'wellness'], 'Bills & Subscriptions', 'Gym & Fitness Subscriptions');

    // Lifestyle, Shopping & Entertainment
    addMap(['cloth', 'shoe', 'apparel', 'shirt', 'pant', 'dress', 'bag', 'watch', 'fashion', 'zara', 'h&m', 'nike', 'adidas', 'mall', 'shopping'], 'Lifestyle, Shopping & Entertainment', 'Clothing, Shoes & Accessories');
    addMap(['electronic', 'gadget', 'laptop', 'computer', 'phone', 'tablet', 'headphone', 'speaker', 'apple store', 'sharaf dg', 'virgin megastore', 'amazon', 'noon'], 'Lifestyle, Shopping & Entertainment', 'Electronics & Gadgets');
    addMap(['movie', 'cinema', 'concert', 'ticket', 'event', 'theme park', 'bowling', 'game', 'entertainment', 'outings'], 'Lifestyle, Shopping & Entertainment', 'Entertainment & Outings (Movies, events, concerts, theme parks)');
    addMap(['gift', 'donation', 'charity', 'birthday', 'wedding', 'celebration', 'zakat', 'sadaqah', 'tip', 'tips'], 'Lifestyle, Shopping & Entertainment', 'Gifts, Donations & Celebrations (Local physical gifts, party spending, charity)');
    addMap(['salon', 'spa', 'haircut', 'barber', 'facial', 'nails', 'massage', 'grooming', 'personal care'], 'Health & Wellness', 'Personal Care & Grooming');

    // Health & Wellness
    addMap(['doctor', 'medic', 'health', 'pharmacy', 'clinic', 'hospital', 'dentist', 'co-pay', 'consultation', 'medicine', 'prescription', 'pills'], 'Health & Wellness', 'Medical & Doctor Visits (Co-pays, consultations)');
    addMap(['pharmacy', 'drug', 'boots', 'life pharmacy', 'medication'], 'Health & Wellness', 'Pharmacy & Medications');
    addMap(['optic', 'glasses', 'lens', 'dental', 'orthodontist', 'braces'], 'Health & Wellness', 'Dental & Optical Care');

    // Travel & Vacations
    addMap(['flight', 'air', 'travel', 'holiday', 'vacation', 'airline', 'emirates', 'flydubai', 'ticket', 'trip'], 'Travel & Vacations', 'Flights & Airfare');
    addMap(['hotel', 'stay', 'airbnb', 'resort', 'booking', 'accommodation', 'hostel'], 'Travel & Vacations', 'Hotels & Accommodation');

    // Family, Children & Household
    addMap(['school', 'tuition', 'nursery', 'education', 'kid', 'child', 'university', 'college', 'books', 'uniform'], 'Family, Children & Household', 'School & Nursery Tuition');
    addMap(['pet', 'dog', 'cat', 'veterinarian', 'vet', 'pet food', 'grooming', 'animal'], 'Family, Children & Household', 'Pet Care & Veterinary');

    // Government Fees, Debt & Financial
    addMap(['tax', 'vat', 'fine', 'traffic', 'government', 'municipality', 'police', 'license'], 'Government Fees, Debt & Financial Obligations', 'Taxes & Fines (Traffic fines, local VAT)');
    addMap(['visa', 'residency', 'emirates id', 'passport', 'attestation', 'gdrfa', 'icp'], 'Government Fees, Debt & Financial Obligations', 'Residency & Visa Fees');
    addMap(['fee', 'charge', 'interest', 'fx', 'conversion', 'transfer fee', 'bank charge'], 'Government Fees, Debt & Financial Obligations', 'Bank Charges & FX Fees (Remittance fees, currency conversion)');
    addMap(['loan', 'emi', 'repayment', 'debt', 'credit card payment', 'mortgage payment'], 'Government Fees, Debt & Financial Obligations', 'Loan Repayments Fees / EMIs Fees/ BNPY Fees');

    // Savings & Investments
    addMap(['saving', 'deposit', 'bank saving', 'vault'], 'Savings & Investments', 'Savings Account Contributions');
    addMap(['invest', 'stock', 'crypto', 'etf', 'trading', 'broker', 'sarwa', 'bitcoin', 'share', 'dividend'], 'Savings & Investments', 'Investments & Stocks (Trading accounts, ETFs, crypto)');
    addMap(['real estate', 'property investment', 'crowdfund'], 'Savings & Investments', 'Crowd sharing real-estate investments');

    // Remittances
    addMap(['remit', 'home support', 'family support', 'stipend', 'parents', 'transfer home', 'western union', 'moneygram'], 'Remittances', 'Family Support Back Home (Regular monthly stipends sent to parents/family)');

    // Income
    addMap(['salary', 'wage', 'pay', 'income', 'payroll', 'commission', 'bonus', 'stipend'], 'Income', 'Primary Employment (Salary, bonuses, commissions)');
    addMap(['freelance', 'side hustle', 'invoice', 'consulting', 'gig', 'project'], 'Income', 'Freelance & Side Hustles (Invoices, gig work, consulting fees)');
    addMap(['rental', 'property rent', 'tenant rent'], 'Income', 'Rental & Property Income (Short-term/long-term property rent)');
    addMap(['dividend', 'interest income', 'capital gain'], 'Income', 'Investment Income (Dividends, interest, capital gains)');
    addMap(['cashback', 'reward', 'rebate', 'loyalty'], 'Income', 'Cashback & Rewards (Credit card rebates, loyalty program payouts)');

    // Others & Transfers
    addMap(['transfer', 'move', 'between accounts', 'internal'], 'Others', 'Inter-account Transfers (Internal moves between personal accounts)');
    addMap(['opening', 'starting', 'balance', 'initial'], 'Others', 'Opening Balances (Beginning account or portfolio values)');

    // Also search across all cats and subcategories dynamically with token matching
    const queryTokens = q.split(/\s+/).filter(t => t.length > 0);

    cats.forEach(c => {
      const cName = c.name || '';
      const cNameLower = cName.toLowerCase();
      
      if (queryTokens.some(token => cNameLower.includes(token))) {
        if (c.subcategories && c.subcategories.length > 0) {
          results.push({ category: cName, subcategory: c.subcategories[0] });
        }
      }

      if (c.subcategories) {
        c.subcategories.forEach((sub: string) => {
          const subLower = sub.toLowerCase();
          if (queryTokens.some(token => subLower.includes(token) || cNameLower.includes(token))) {
            results.push({ category: cName, subcategory: sub });
          }
        });
      }
    });

    const unique = Array.from(new Map(results.map(item => [`${item.category}|${item.subcategory}`, item])).values());
    return unique;
  }
  
  const [subcategory, setSubcategory] = useState('');

  useEffect(() => {
    if (categories.length > 0) {
      if (!category || !categories.some(c => c.name === category)) {
        const firstCat = categories[0].name;
        setCategory(firstCat);
        if (categories[0].subcategories && categories[0].subcategories.length > 0) {
          setSubcategory(categories[0].subcategories[0]);
        }
      }
    }
  }, [categories]);
  const activeAccounts = accounts.filter((acc: any) => !acc.isArchived);
  const [accountId, setAccountId] = useState(activeAccounts[0]?.id || '');
  const [toAccountId, setToAccountId] = useState(activeAccounts[1]?.id || activeAccounts[0]?.id || '');

  const selectedAccount = activeAccounts.find((a: any) => a.id === accountId);
  const accountCurrency = selectedAccount?.currency || 'AED';

  useEffect(() => {
      if (activeAccounts.length > 0 && !accountId) {
          setAccountId(activeAccounts[0].id);
      }
      if (activeAccounts.length > 1 && !toAccountId) {
          setToAccountId(activeAccounts[1].id);
      } else if (activeAccounts.length === 1 && !toAccountId) {
          setToAccountId(activeAccounts[0].id);
      }
  }, [activeAccounts, accountId, toAccountId]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [isImpulsive, setIsImpulsive] = useState(false);
  const [impulseCategory, setImpulseCategory] = useState('⚡ Low Energy & Convenience');
  
  const IMPULSE_CATEGORIES = [
    { id: 'low_energy', label: '⚡ Low Energy & Convenience', desc: 'Weekday food delivery or instant ride' },
    { id: 'social', label: '👀 Social Comparison & Status', desc: 'Peer influence or status purchase' },
    { id: 'craving', label: '🍔 Craving & Indulgence', desc: 'Coffee, snacks, and dessert runs' },
    { id: 'stress', label: '💆 Stress & Mood Fix', desc: 'Retail therapy or emotional comfort' },
    { id: 'reward', label: '🎉 Reward & Celebration', desc: 'Treating yourself for hard work' },
    { id: 'fomo', label: '🏷️ Deal FOMO & Scarcity', desc: 'Impulse discount or limited-time deal' },
  ];
  const [frequency, setFrequency] = useState('Monthly');
  const [interval, setInterval] = useState('1');
  const [dayOption, setDayOption] = useState('sameDate');
  const [specificDayOfMonth, setSpecificDayOfMonth] = useState('');
  const [duration, setDuration] = useState('Indefinite');
  const [durationLimit, setDurationLimit] = useState('');
  const [date, setDate] = useState(getLocalTodayString());
  const [startDate, setStartDate] = useState(getLocalTodayString());
  const [isSyncedToCalendar, setIsSyncedToCalendar] = useState(false);
  const [isSyncedToTasks, setIsSyncedToTasks] = useState(false);
  const [loading, setLoading] = useState(false);

  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [splitCount, setSplitCount] = useState<number | string>(12);
  const [splitRecurrence, setSplitRecurrence] = useState<string>('Monthly');
  const [interestRate, setInterestRate] = useState<number | string>(0);
  const [splitLoading, setSplitLoading] = useState(false);

  const baseAmt = Number(amount) || 0;
  const countNum = Number(splitCount) || 12;
  const intRateNum = Number(interestRate) || 0;
  const totalInterest = baseAmt * (intRateNum / 100) * (countNum / 12);
  const totalWithInterest = baseAmt + totalInterest;
  const perInstallmentAmount = countNum > 0 ? totalWithInterest / countNum : baseAmt;

  const handleSplitAddConfirm = async () => {
    if (!amount || !accountId) return;
    if (countNum <= 0) {
      alert("Please enter a valid number of installments.");
      return;
    }
    setSplitLoading(true);
    try {
      const selectedCategoryEntry = categories.find(c => c.name === category);
      const transactionType = mode === 'income' ? 'Inflow' : 'Outflow';
      const recType = mode === 'income' ? 'income' : 'expense';
      const currentMonthPeriod = getLocalCurrentMonthString();

      let matchedBudgetId = null;
      try {
        const miniBudgetsQuery = query(
          collection(db, 'users', uid, 'miniBudgets'),
          where('period', '==', currentMonthPeriod),
          where('category', '==', category),
          where('subcategory', '==', subcategory)
        );
        const miniBudgetsSnap = await getDocs(miniBudgetsQuery);
        if (!miniBudgetsSnap.empty) {
          matchedBudgetId = miniBudgetsSnap.docs[0].id;
        }
      } catch (lookupErr) {
        console.warn("Could not bind budgetId automatically:", lookupErr);
      }

      // 1. Create recurring installment plan
      await addDoc(collection(db, 'users', uid, 'recurringTransactions'), {
        userId: uid,
        title: notes.trim() || 'Installment Plan',
        amount: Number(perInstallmentAmount.toFixed(2)),
        totalAmount: baseAmt,
        totalWithInterest: Number(totalWithInterest.toFixed(2)),
        transactionType: recType,
        type: recType,
        recurrency: splitRecurrence.toLowerCase(),
        frequency: splitRecurrence,
        interval: 1,
        dayOption: new Date(date || Date.now()).getDate(),
        duration: 'numEvents',
        durationLimit: String(countNum),
        installmentsTotal: countNum,
        installmentsPaid: 0,
        eventsRemaining: countNum,
        interestRate: intRateNum,
        category: category || 'General',
        subcategory: subcategory || 'General',
        accountId: accountId,
        sourceAccountId: accountId,
        startDate: date || getLocalTodayString(),
        nextGenerationDate: date || getLocalTodayString(),
        nextExecutionDate: date || getLocalTodayString(),
        isActive: true,
        emoji: selectedCategoryEntry?.emoji || '💳',
        notes: `Installment plan: ${countNum} payments of ${perInstallmentAmount.toFixed(2)} (${notes.trim()})`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // 2. Create the initial transaction record (first installment / principal)
      const transactionData = {
        amount: Number(perInstallmentAmount.toFixed(2)),
        currency: accountCurrency,
        notes: `${notes.trim()} (Split into ${countNum} installments)`.trim(),
        category,
        subcategory,
        subCategory: subcategory,
        emoji: selectedCategoryEntry?.emoji || '💳',
        accountId,
        type: transactionType,
        date: date,
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        createdAt: serverTimestamp(),
        status: 'confirmed',
        isRecurring: false,
        isInstallment: true,
        installmentsTotal: countNum,
        installmentAmount: Number(perInstallmentAmount.toFixed(2)),
        totalAmount: baseAmt,
        budgetId: matchedBudgetId
      };

      await addDoc(collection(db, 'users', uid, 'transactions'), transactionData);

      // 3. Update account balance for first installment
      const accountRef = doc(db, 'users', uid, 'accounts', accountId);
      const amountChange = transactionType === 'Inflow' ? Number(perInstallmentAmount.toFixed(2)) : -Number(perInstallmentAmount.toFixed(2));
      await updateDoc(accountRef, {
        currentBalance: increment(amountChange),
        updatedAt: serverTimestamp()
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Split transaction save error:", err);
      alert(`Failed to create split transaction: ${err?.message || 'Please verify details.'}`);
    } finally {
      setSplitLoading(false);
      setIsSplitModalOpen(false);
    }
  };

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

  // --- Aesthetic Helpers ---
  const inputStyles = "w-full bg-[#f4f4f8] border border-[#d8d8e5] rounded-xl px-4 py-3 text-sm text-[#111c2d] focus:border-[#a6ddb1] outline-none transition-all";
  const labelStyles = "text-[10px] font-bold text-[#8c8c99] mb-1 block";

  const handleSave = async () => {
    if (!amount || !accountId) return;
    if (mode === 'transfer' && (!toAccountId || toAccountId === accountId)) return;
    
    setLoading(true);
    try {
      const selectedCategoryEntry = categories.find(c => c.name === category);
      
      const today = getLocalTodayString();
      const isStartingToday = startDate === today;

      if (mode === 'transfer') {
        // --- TRANSFER LOGIC (Dual Entry with Currency Conversion) ---
        const sourceAcc = accounts.find((a: any) => a.id === accountId);
        const destAcc = accounts.find((a: any) => a.id === toAccountId);

        const sourceCurrency = sourceAcc?.currency || 'AED';
        const destCurrency = destAcc?.currency || 'AED';
        const sourceAmount = Number(amount);

        const sourceRate = getRateToAED(sourceCurrency);
        const destRate = getRateToAED(destCurrency);
        const sourceAmountInAED = sourceAmount * sourceRate;
        const destAmount = destCurrency === sourceCurrency 
          ? sourceAmount 
          : Number((sourceAmountInAED / destRate).toFixed(4));

        // 1. Create Outflow for Source
        const outflowData = {
          amount: sourceAmount,
          currency: sourceCurrency,
          toAmount: destAmount,
          notes: notes.trim() || `Transfer to ${destAcc?.name || 'Account'}`,
          category: 'Transfer',
          subcategory: 'Internal Transfer',
          emoji: '💸',
          accountId,
          toAccountId,
          type: 'Outflow', // Explicitly negative
          transactionType: 'transfer',
          date: date,
          time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          createdAt: serverTimestamp(),
          status: 'confirmed',
          isRecurring: false,
          hasMirror: true // Mark as dual entry
        };

        // 2. Create Inflow for Destination
        const inflowData = {
          amount: destAmount,
          currency: destCurrency,
          notes: notes.trim() || `Transfer from ${sourceAcc?.name || 'Account'}`,
          category: 'Transfer',
          subcategory: 'Internal Transfer',
          emoji: '💰',
          accountId: toAccountId,
          fromAccountId: accountId,
          type: 'Inflow', // Explicitly positive
          transactionType: 'transfer',
          date: date,
          time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          createdAt: serverTimestamp(),
          status: 'confirmed',
          isRecurring: false,
          hasMirror: true
        };

        await addDoc(collection(db, 'users', uid, 'transactions'), outflowData);
        await addDoc(collection(db, 'users', uid, 'transactions'), inflowData);

        // Atomic Balance Updates
        const sourceRef = doc(db, 'users', uid, 'accounts', accountId);
        const destRef = doc(db, 'users', uid, 'accounts', toAccountId);

        await updateDoc(sourceRef, {
          currentBalance: increment(-sourceAmount),
          updatedAt: serverTimestamp()
        });
        await updateDoc(destRef, {
          currentBalance: increment(destAmount),
          updatedAt: serverTimestamp()
        });

      } else {
        // --- STANDARD TRANSACTION LOGIC ---
        const transactionType = mode === 'income' ? 'Inflow' : 'Outflow';
        const currentMonthPeriod = getLocalCurrentMonthString(); // e.g., "2026-07"

        // Look up if an active budget envelope matches this category/subcategory for the current month
        let matchedBudgetId = null;
        try {
          const miniBudgetsQuery = query(
            collection(db, 'users', uid, 'miniBudgets'),
            where('period', '==', currentMonthPeriod),
            where('category', '==', category),
            where('subcategory', '==', subcategory)
          );
          const miniBudgetsSnap = await getDocs(miniBudgetsQuery);
          if (!miniBudgetsSnap.empty) {
            matchedBudgetId = miniBudgetsSnap.docs[0].id;
          }
        } catch (lookupErr) {
          console.warn("Could not bind budgetId automatically:", lookupErr);
        }

        const transactionData = {
          amount: Number(amount),
          currency: accountCurrency,
          notes: notes.trim(),
          category,
          subcategory,
          subCategory: subcategory,
          emoji: selectedCategoryEntry?.emoji || '💳',
          accountId,
          type: transactionType,
          date: date,
          time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          createdAt: serverTimestamp(),
          status: 'confirmed',
          isRecurring,
          budgetId: matchedBudgetId, // This ensures floating-button expenses tie directly into your budget pools
          isImpulsive: mode === 'expense' ? isImpulsive : false,
          impulseCategory: mode === 'expense' && isImpulsive ? impulseCategory : null
        };
        
        const shouldCreateNow = !isRecurring || (isRecurring && isStartingToday);

        if (shouldCreateNow) {
          await addDoc(collection(db, 'users', uid, 'transactions'), transactionData);
          
          const accountRef = doc(db, 'users', uid, 'accounts', accountId);
          const amountChange = transactionType === 'Inflow' ? Number(amount) : -Number(amount);
          await updateDoc(accountRef, {
            currentBalance: increment(amountChange),
            updatedAt: serverTimestamp()
          });
        }
        
        if (isRecurring) {
            const nextGenDate = isStartingToday 
              ? calculateNextDate(startDate, frequency.toLowerCase(), Number(interval), dayOption)
              : startDate;

            await addDoc(collection(db, 'users', uid, 'recurringTransactions'), {
                userId: uid,
                title: notes.trim() || 'Recurring Transaction',
                amount: Number(amount),
                currency: accountCurrency,
                type: transactionType === 'Inflow' ? 'income' : 'expense',
                transactionType: transactionType === 'Inflow' ? 'income' : 'outflow',
                recurrency: frequency.toLowerCase(),
                frequency,
                interval: Number(interval),
                dayOption,
                specificDayOfMonth: dayOption === 'specificDay' ? Number(specificDayOfMonth) : null,
                duration,
                durationLimit,
                startDate,
                isSyncedToCalendar,
                isSyncedToTasks,
                category,
                subcategory,
                accountId,
                sourceAccountId: accountId,
                nextGenerationDate: nextGenDate,
                nextExecutionDate: nextGenDate,
                isActive: true,
                emoji: selectedCategoryEntry?.emoji || '📁',
                notes: notes.trim(),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });

            // Google Workspace Sync... (omitted for brevity but kept in original code)
            if (isSyncedToCalendar || isSyncedToTasks) {
              try {
                let token = getCachedAccessToken();
                if (!token) token = await connectGoogleWorkspace();
                if (token) {
                  const accountName = accounts.find((a: any) => a.id === accountId)?.name || 'Account';
                  if (isSyncedToCalendar) {
                    await createGoogleCalendarEvent(token, {
                      title: notes.trim() || 'Recurring Transaction',
                      amount: Number(amount),
                      currency: 'AED',
                      accountName,
                      dueDate: startDate,
                      recurrency: frequency,
                      interval: Number(interval)
                    });
                  }
                  if (isSyncedToTasks) {
                    await createGoogleTask(token, {
                      title: notes.trim() || 'Recurring Transaction',
                      amount: Number(amount),
                      currency: 'AED',
                      accountName,
                      dueDate: startDate
                    });
                  }
                }
              } catch (syncErr) { console.error("Sync Error:", syncErr); }
            }
        }
      }
      
      if (mode !== 'transfer' && category) {
        try {
          const recentKey = `vantage_recent_categories_${uid || 'default'}`;
          const existingRecent = JSON.parse(localStorage.getItem(recentKey) || '[]');
          const newItem = { category, subcategory: subcategory || '' };
          const filtered = existingRecent.filter((item: any) => !(item.category === newItem.category && item.subcategory === newItem.subcategory));
          const updated = [newItem, ...filtered].slice(0, 3);
          localStorage.setItem(recentKey, JSON.stringify(updated));
        } catch (e) {
          console.error("Error saving recent category:", e);
        }
      }

      onSuccess();
      onClose();
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-start justify-center p-4 overflow-y-auto bg-black/10 backdrop-blur-[2px]">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0" />
          
          <motion.div
            initial={{ opacity: 0, y: 80, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.98 }}
            transition={{ type: 'spring', damping: 26, stiffness: 280 }}
            className="relative w-full max-w-[400px] mt-8 mb-24 bg-white rounded-[30px] shadow-2xl border border-[#ececf1] p-6 pb-12 flex flex-col gap-5"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-extrabold text-[#111c2d]">
                  {mode === 'transfer' ? t('add_transaction.transfer_title', 'Create Transfer') : 
                   mode === 'income' ? t('add_transaction.income_title', 'Add Income') : 
                   t('add_transaction.expense_title', 'Add Expense')}
                </h3>
                <p className="text-[10px] font-bold text-[#8c8c99]">{t('add_transaction.control')}</p>
              </div>
              <div className="flex bg-[#f4f4f8] p-1 rounded-xl border border-[#d8d8e5]">
                <button 
                  type="button"
                  onClick={() => setMode('expense')}
                  className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all ${mode === 'expense' ? 'bg-[#a6ddb1] text-[#1E3A20]' : 'text-[#8c8c99]'}`}
                >
                  {t('add_transaction.mode_expense', 'Expense')}
                </button>
                <button 
                  type="button"
                  onClick={() => setMode('income')}
                  className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all ${mode === 'income' ? 'bg-[#a6ddb1] text-[#1E3A20]' : 'text-[#8c8c99]'}`}
                >
                  {t('add_transaction.mode_income', 'Income')}
                </button>
                <button 
                  type="button"
                  onClick={() => setMode('transfer')}
                  className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all ${mode === 'transfer' ? 'bg-[#a6ddb1] text-[#1E3A20]' : 'text-[#8c8c99]'}`}
                >
                  {t('add_transaction.mode_transfer', 'Transfer')}
                </button>
              </div>
            </div>

            {initialSmsData && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 flex items-center space-x-2 text-emerald-800 text-xs">
                <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-bold">Auto-detected from SMS</span>
                <span className="text-gray-500 truncate text-[11px]">({initialSmsData.sender})</span>
              </div>
            )}

            {/* Inputs */}
            <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-4">
              <div>
                <label className={labelStyles}>{t('add_transaction.amount')}</label>
                <div className="relative">
                    <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inputStyles} pr-12`} placeholder={t('add_transaction.amount_placeholder')} />
                    <span className="absolute right-4 top-3 text-sm font-bold text-[#8c8c99]">{accountCurrency}</span>
                </div>
                {numericAmount > 0 && (
                  <p className="text-[12px] text-[#57606F] mt-1.5 pl-1 font-normal" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                    ≈ {baseCurrency} <span className="font-bold">{((Number(amount) || 0) * getRateToAED(accountCurrency) / getRateToAED(baseCurrency)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </p>
                )}
                {mode === 'transfer' && numericAmount > 0 && accountId !== toAccountId && (() => {
                  const sourceAcc = accounts.find((a: any) => a.id === accountId);
                  const destAcc = accounts.find((a: any) => a.id === toAccountId);
                  const srcCurr = sourceAcc?.currency || 'AED';
                  const dstCurr = destAcc?.currency || 'AED';
                  if (srcCurr !== dstCurr) {
                    const srcRate = getRateToAED(srcCurr);
                    const dstRate = getRateToAED(dstCurr);
                    const converted = (numericAmount * srcRate) / dstRate;
                    return (
                      <p className="text-[12px] text-emerald-700 mt-1 pl-1 font-normal" style={{ fontFamily: "'Google Sans', sans-serif" }}>
                        Destination receives: <span className="font-bold">{converted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} {dstCurr}</span> (Rate: 1 {srcCurr} = {(srcRate / dstRate).toFixed(4)} {dstCurr})
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className={labelStyles}>{mode === 'transfer' ? t('add_transaction.from_account', 'Source Account') : t('add_transaction.source_account')}</label>
                  <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputStyles}>
                    {activeAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                  </select>
                </div>

                {mode === 'transfer' && (
                  <div>
                    <label className={labelStyles}>{t('add_transaction.to_account', 'Destination Account')}</label>
                    <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} className={inputStyles}>
                      {activeAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {mode !== 'transfer' && (
                <>
                  <div className="relative">
                    <div className="flex items-center justify-between">
                      <label className={labelStyles}>Predictive Category Search</label>
                      {isSearching && (
                        <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 animate-pulse font-normal">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                          <span>Searching...</span>
                        </div>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        value={categorySearchQuery}
                        onFocus={() => setShowCategorySuggestions(true)}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCategorySearchQuery(val);
                          setShowCategorySuggestions(true);
                          if (val.trim().length >= 3) {
                            setIsSearching(true);
                            setTimeout(() => {
                              const suggestions = getCategorySuggestions(val, categories);
                              if (suggestions.length > 0) {
                                setCategory(suggestions[0].category);
                                if (suggestions[0].subcategory) {
                                  setSubcategory(suggestions[0].subcategory);
                                }
                              }
                              setIsSearching(false);
                            }, 200);
                          } else {
                            setIsSearching(false);
                          }
                        }}
                        placeholder="Type 3+ letters (e.g. washing powder, groceries)..."
                        className={`${inputStyles} text-sm mb-2 pr-9`}
                      />
                      {isSearching ? (
                        <div className="absolute right-3 top-3 w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                      ) : categorySearchQuery.trim().length > 0 ? (
                        <button
                          type="button"
                          onClick={() => {
                            setCategorySearchQuery('');
                            setShowCategorySuggestions(true);
                          }}
                          className="absolute right-3 top-2.5 text-neutral-400 hover:text-neutral-600 p-0.5 rounded-full hover:bg-neutral-100 transition-colors"
                          title="Clear search"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      ) : null}
                    </div>
                    {showCategorySuggestions && categorySearchQuery.trim().length >= 3 ? (
                      <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-neutral-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                        {getCategorySuggestions(categorySearchQuery, categories).length > 0 ? (
                          getCategorySuggestions(categorySearchQuery, categories).map((sug, idx) => (
                            <div
                              key={idx}
                              onClick={() => {
                                setCategory(sug.category);
                                setSubcategory(sug.subcategory);
                                setCategorySearchQuery(`${sug.category} > ${sug.subcategory}`);
                                setShowCategorySuggestions(false);
                              }}
                              className="px-3 py-2 hover:bg-neutral-50 cursor-pointer text-xs flex items-center justify-between border-b border-neutral-100 last:border-0 font-sans font-normal"
                            >
                              <span className="font-bold text-neutral-800 font-sans">{sug.category}</span>
                              <span className="text-neutral-500 italic truncate max-w-[200px] font-sans">{sug.subcategory}</span>
                            </div>
                          ))
                        ) : (
                          <div className="px-4 py-4 text-center font-sans">
                            <p className="text-xs font-bold text-neutral-700 mb-0.5">No results found</p>
                            <p className="text-[11px] text-neutral-400 font-normal">Try a different term</p>
                          </div>
                        )}
                      </div>
                    ) : showCategorySuggestions && categorySearchQuery.trim().length === 0 && recentCategories.length > 0 ? (
                      <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-neutral-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                        <div className="px-3 py-1.5 bg-neutral-50 text-[10px] font-bold text-neutral-400 tracking-wide border-b border-neutral-100 font-sans">
                          Recent Categories
                        </div>
                        {recentCategories.slice(0, 3).map((rec, idx) => (
                          <div
                            key={idx}
                            onClick={() => {
                              setCategory(rec.category);
                              setSubcategory(rec.subcategory);
                              setCategorySearchQuery(`${rec.category} > ${rec.subcategory}`);
                              setShowCategorySuggestions(false);
                            }}
                            className="px-3 py-2.5 hover:bg-neutral-50 cursor-pointer text-xs flex items-center justify-between border-b border-neutral-100 last:border-0 font-sans font-normal"
                          >
                            <span className="font-bold text-neutral-800 font-sans">{rec.category}</span>
                            <span className="text-neutral-500 italic truncate max-w-[200px] font-sans">{rec.subcategory}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <label className={labelStyles}>{t('add_transaction.category')}</label>
                    <select 
                      value={category} 
                      onChange={(e) => {
                        const newCat = e.target.value;
                        setCategory(newCat);
                        const currentCat = categories.find(c => c.name === newCat);
                        if (currentCat && currentCat.subcategories && currentCat.subcategories.length > 0) {
                          setSubcategory(currentCat.subcategories[0]);
                        } else {
                          setSubcategory('');
                        }
                      }} 
                      className={inputStyles}
                    >
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.name}>
                          {translateCategoryOrSubcategory(cat.name, t)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className={labelStyles}>{t('add_transaction.sub_category')}</label>
                    <select value={subcategory} onChange={(e) => setSubcategory(e.target.value)} className={inputStyles}>
                        {categories.find(c => c.name === category)?.subcategories?.map((sub: string) => (
                            <option key={`${category}-${sub}`} value={sub}>
                              {translateCategoryOrSubcategory(sub, t)}
                            </option>
                        )) || <option value="">{t('add_transaction.no_subcategory', 'None')}</option>}
                    </select>
                  </div>
                </>
              )}

              {mode === 'expense' && (
                <div className="p-4 rounded-2xl bg-[#f9fafb] border border-[#e5e7eb] space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-base">⚡</span>
                      <div>
                        <label className="text-xs font-bold text-[#111c2d] font-sans" style={{ fontFamily: "'Google Sans', sans-serif" }}>Mark as Impulse / Unplanned</label>
                        <p className="text-[11px] text-[#6b7280] font-normal font-sans" style={{ fontFamily: "'Google Sans', sans-serif" }}>Categorize emotional or spontaneous spending</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsImpulsive(!isImpulsive)}
                      className={`w-12 h-6 rounded-full p-1 transition-all ${isImpulsive ? 'bg-[#366945]' : 'bg-[#d8d8e5]'}`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white transition-all ${isImpulsive ? 'translate-x-6' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  {isImpulsive && (
                    <div className="space-y-2 pt-2 border-t border-neutral-200">
                      <label className="text-[10px] font-bold text-[#6b7280] block font-sans" style={{ fontFamily: "'Google Sans', sans-serif" }}>Select Emotional Motive</label>
                      <select
                        value={impulseCategory}
                        onChange={(e) => setImpulseCategory(e.target.value)}
                        className={`${inputStyles} pr-10 text-xs sm:text-sm`}
                      >
                        {IMPULSE_CATEGORIES.map(cat => (
                          <option key={cat.id} value={cat.label}>{cat.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className={labelStyles}>{t('add_transaction.date', 'Transaction Date')}</label>
                <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setStartDate(e.target.value); }} className={inputStyles} />
              </div>

              <div>
                <label className={labelStyles}>{t('add_transaction.notes')}</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputStyles} h-24`} placeholder={t('add_transaction.notes_placeholder')} />
              </div>

              <div className="flex items-center justify-between py-2">
                <label className="text-sm font-bold text-[#111c2d]">{t('add_transaction.recurring_transaction')}</label>
                <button
                   type="button"
                   onClick={() => setIsRecurring(!isRecurring)}
                   className={`w-12 h-6 rounded-full p-1 transition-all ${isRecurring ? 'bg-[#a6ddb1]' : 'bg-[#d8d8e5]'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-all ${isRecurring ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>

               {isRecurring && (
                <div className="space-y-4 pt-2">
                   <div>
                       <label className={labelStyles}>{t('add_transaction.frequency')}</label>
                       <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className={inputStyles}>
                         <option value="Weekly">{t('add_transaction.frequency_weekly')}</option>
                         <option value="Monthly">{t('add_transaction.frequency_monthly')}</option>
                         <option value="Yearly">{t('add_transaction.frequency_yearly')}</option>
                         <option value="Daily">{t('add_transaction.frequency_daily')}</option>
                       </select>
                   </div>
                   <div>
                       <label className={labelStyles}>{t('add_transaction.interval')}</label>
                       <input type="number" value={interval} onChange={(e) => setInterval(e.target.value)} className={inputStyles} />
                   </div>
                   <div>
                       <label className={labelStyles}>{t('add_transaction.day_option')}</label>
                       <select value={dayOption} onChange={(e) => setDayOption(e.target.value)} className={inputStyles}>
                         <option value="sameDate">{t('add_transaction.day_option_same')}</option>
                         <option value="sameWeekday">{t('add_transaction.day_option_weekday')}</option>
                         <option value="specificDay">{t('add_transaction.day_option_specific')}</option>
                       </select>
                   </div>
                   {dayOption === 'specificDay' && (
                       <div>
                           <label className={labelStyles}>{t('add_transaction.day_option_specific')}</label>
                           <input type="number" min="1" max="31" value={specificDayOfMonth} onChange={(e) => setSpecificDayOfMonth(e.target.value)} className={inputStyles} placeholder={t('add_transaction.day_option_specific_placeholder')} />
                       </div>
                   )}
                   <div>
                       <label className={labelStyles}>{t('add_transaction.duration')}</label>
                       <select value={duration} onChange={(e) => setDuration(e.target.value)} className={inputStyles}>
                         <option value="Indefinite">{t('add_transaction.duration_indefinite')}</option>
                         <option value="Limited">{t('add_transaction.duration_limited')}</option>
                       </select>
                   </div>
                   {duration === 'Limited' && (
                       <div>
                           <label className={labelStyles}>{t('add_transaction.duration_limit')}</label>
                           <input type="text" value={durationLimit} onChange={(e) => setDurationLimit(e.target.value)} className={inputStyles} placeholder={t('add_transaction.duration_limit_placeholder')} />
                       </div>
                   )}
                   <div>
                       <label className={labelStyles}>{t('add_transaction.start_date')}</label>
                       <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputStyles} />
                   </div>
                   
                   <div className="flex items-center justify-between">
                       <label className="text-[14px] font-bold text-[#111c2d]">{t('add_transaction.sync_calendar')}</label>
                       <button 
                         type="button" 
                         onClick={() => {
                           if (isFree) {
                             window.dispatchEvent(new CustomEvent('trigger-premium-modal'));
                           } else {
                             setIsSyncedToCalendar(!isSyncedToCalendar);
                           }
                         }} 
                         className={`w-10 h-5 rounded-full p-0.5 transition-all ${isSyncedToCalendar ? 'bg-[#a6ddb1]' : 'bg-[#d8d8e5]'}`}
                       >
                          <div className={`w-4 h-4 rounded-full bg-white transition-all ${isSyncedToCalendar ? 'translate-x-5' : 'translate-x-0'}`} />
                       </button>
                   </div>
                   {isFree && (
                       <span className="text-[10px] text-neutral-400 block -mt-2 mb-2 font-normal">Requires Tier 1, 2, or 3 upgrade to sync with Google Calendar.</span>
                   )}
                   <div className="flex items-center justify-between">
                       <label className="text-[14px] font-bold text-[#111c2d]">{t('add_transaction.sync_tasks')}</label>
                       <button 
                         type="button" 
                         onClick={() => {
                           if (isFree) {
                             window.dispatchEvent(new CustomEvent('trigger-premium-modal'));
                           } else {
                             setIsSyncedToTasks(!isSyncedToTasks);
                           }
                         }} 
                         className={`w-10 h-5 rounded-full p-0.5 transition-all ${isSyncedToTasks ? 'bg-[#a6ddb1]' : 'bg-[#d8d8e5]'}`}
                       >
                          <div className={`w-4 h-4 rounded-full bg-white transition-all ${isSyncedToTasks ? 'translate-x-5' : 'translate-x-0'}`} />
                       </button>
                   </div>
                   {isFree && (
                       <span className="text-[10px] text-neutral-400 block -mt-2 mb-2 font-normal">Requires Tier 1, 2, or 3 upgrade to sync with Google Tasks.</span>
                   )}
                </div>
               )}

              {/* Action Button */}
              <button type="submit" disabled={loading} className="w-full py-4 bg-[#a6ddb1] text-[#111c2d] rounded-2xl font-bold text-sm hover:brightness-105 transition-all flex items-center justify-center">
                {loading ? <RefreshCw className="animate-spin" /> : t('add_transaction.commit')}
              </button>

              {mode !== 'transfer' && (
                <button
                  type="button"
                  onClick={() => {
                    if (!amount || Number(amount) <= 0) {
                      alert("Please enter a valid amount first before splitting.");
                      return;
                    }
                    setIsSplitModalOpen(true);
                  }}
                  disabled={loading}
                  className="w-full py-3.5 rounded-2xl border-2 border-[#366945] bg-white text-[#366945] text-sm font-bold hover:bg-[#366945]/5 transition-all flex items-center justify-center gap-2 cursor-pointer font-sans shadow-sm mt-2"
                >
                  <GitBranch size={16} />
                  <span>{t('transaction_detail_modal.split_transaction', 'Split transaction')}</span>
                </button>
              )}
            </form>
          </motion.div>
        </div>
      )}

      {isSplitModalOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/40" onClick={() => setIsSplitModalOpen(false)} />
          <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative w-full max-w-[440px] bg-white rounded-3xl p-6 shadow-2xl border border-neutral-100 flex flex-col gap-5 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-neutral-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-[#366945] flex items-center justify-center">
                  <GitBranch size={18} />
                </div>
                <h3 className="text-lg font-bold text-[#111c2d] font-sans m-0">{t('transaction_detail_modal.split_transaction_title')}</h3>
              </div>
              <button onClick={() => setIsSplitModalOpen(false)} className="w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-500 flex items-center justify-center transition-all cursor-pointer border-none">
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-neutral-500 font-normal font-sans m-0">
              Convert this transaction into a structured recurring installment plan over time (e.g., credit card installment plan).
            </p>

            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[#414941] font-sans opacity-80">{t('transaction_detail_modal.split_count')}</label>
                <input 
                  type="number" 
                  min="1" 
                  max="120"
                  value={splitCount} 
                  onChange={(e) => setSplitCount(e.target.value)} 
                  className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm font-bold text-[#111c2d] outline-none focus:border-[#366945] font-sans" 
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[#414941] font-sans opacity-80">{t('transaction_detail_modal.split_recurrence')}</label>
                <select 
                  value={splitRecurrence} 
                  onChange={(e) => setSplitRecurrence(e.target.value)} 
                  className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm font-bold text-[#111c2d] outline-none focus:border-[#366945] font-sans cursor-pointer"
                >
                  <option value="Monthly">Monthly</option>
                  <option value="Weekly">Weekly</option>
                  <option value="Bi-Weekly">Bi-Weekly</option>
                  <option value="Yearly">Yearly</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[#414941] font-sans opacity-80">{t('transaction_detail_modal.split_interest')}</label>
                <input 
                  type="number" 
                  step="0.01" 
                  min="0"
                  value={interestRate} 
                  onChange={(e) => setInterestRate(e.target.value)} 
                  className="w-full bg-white border border-neutral-200 rounded-xl px-4 py-3 text-sm font-bold text-[#111c2d] outline-none focus:border-[#366945] font-sans" 
                  placeholder="0.00"
                />
              </div>

              <div className="p-4 rounded-2xl bg-[#f8fafc] border border-neutral-200/60 space-y-2">
                <div className="flex justify-between text-xs text-neutral-600 font-normal font-sans">
                  <span>{t('transaction_detail_modal.original_amount')}:</span>
                  <span className="font-bold text-[#111c2d]">{baseAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {accountCurrency}</span>
                </div>
                {intRateNum > 0 && (
                  <div className="flex justify-between text-xs text-neutral-600 font-normal font-sans">
                    <span>{t('transaction_detail_modal.total_interest')}:</span>
                    <span className="font-bold text-amber-700">{totalInterest.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {accountCurrency}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-neutral-200 flex justify-between items-center text-sm font-bold text-[#366945]">
                  <span>{t('transaction_detail_modal.per_installment')}:</span>
                  <span className="text-lg">{perInstallmentAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {accountCurrency} / {splitRecurrence}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button 
                type="button" 
                onClick={() => setIsSplitModalOpen(false)} 
                className="flex-1 py-3 border border-neutral-200 rounded-xl bg-white text-neutral-700 text-sm font-bold hover:bg-neutral-50 transition-all cursor-pointer font-sans"
              >
                {t('transaction_detail_modal.cancel', 'Cancel')}
              </button>
              <button 
                type="button" 
                disabled={splitLoading} 
                onClick={handleSplitAddConfirm} 
                className="flex-1 py-3 rounded-xl bg-[#366945] text-white text-sm font-bold hover:opacity-95 transition-all flex items-center justify-center gap-2 cursor-pointer border-none font-sans shadow-sm"
              >
                {splitLoading ? <span>Processing...</span> : <span>{t('transaction_detail_modal.confirm_split')}</span>}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
