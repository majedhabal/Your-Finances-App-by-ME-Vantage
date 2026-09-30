import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { getEffectiveAiTokens } from '../lib/tokenConsumption';
import { 
  Sparkles, 
  Lock, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Clock, 
  Mic, 
  MicOff, 
  ArrowRight, 
  DollarSign, 
  ShieldCheck, 
  Coins, 
  Flame, 
  HelpCircle,
  X,
  TrendingDown,
  ShoppingBag,
  ChevronRight,
  Zap,
  Tag,
  Check
} from 'lucide-react';
import { collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc, serverTimestamp, runTransaction, updateDoc } from 'firebase/firestore';
import { db, auth, getCurrentUser } from '../lib/firebase';
import { generateAIContent } from '../lib/gemini';
import { logAIUsage } from '../lib/aiUsageTracker';
import { consumeAiTokensAndScans } from '../lib/tokenConsumption';

interface ShouldIBuyThisProps {
  profile: any;
  accounts?: any[];
  transactions?: any[];
  accountBalances?: Record<string, number>;
  recurringTransactions?: any[];
  isEmbedded?: boolean;
  onClose?: () => void;
  onUpdateProfile?: (profile: any) => void;
}

export const ShouldIBuyThis: React.FC<ShouldIBuyThisProps> = ({
  profile = {},
  accounts = [],
  transactions = [],
  accountBalances = {},
  recurringTransactions = [],
  isEmbedded = false,
  onClose,
  onUpdateProfile
}) => {
  const currency = profile?.baseCurrency || 'AED';

  // Subscription Tier & AI Token Check
  const rawTier = (profile?.subscriptionTier || 'free').toString().toLowerCase().trim();
  const isTier2Or3 = rawTier.includes('tier 2') || 
                     rawTier.includes('tier 3') || 
                     rawTier.includes('tier2') || 
                     rawTier.includes('tier3') || 
                     profile?.subscriptionTier === 'Tier 2' || 
                     profile?.subscriptionTier === 'Tier 3' || 
                     profile?.subscriptionTier === 'Tier 2 (Pro)' || 
                     profile?.subscriptionTier === 'Tier 3 (Elite)' ||
                     rawTier.includes('premium') ||
                     rawTier.includes('pro');

  const currentTokens = getEffectiveAiTokens(profile);
  const hasAIAccess = isTier2Or3 || !!(profile?.vantageAiUnlockedUntil && new Date(profile.vantageAiUnlockedUntil).getTime() > Date.now()) || currentTokens > 0;

  // Input state
  const [queryInput, setQueryInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [fetchedRecurring, setFetchedRecurring] = useState<any[]>([]);

  // Firestore listener for recurring transactions if not provided via props
  useEffect(() => {
    if (recurringTransactions && recurringTransactions.length > 0) return;
    if (!profile?.uid) return;
    const unsub = onSnapshot(
      collection(db, `users/${profile.uid}/recurringTransactions`),
      (snap) => {
        setFetchedRecurring(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      },
      (err) => console.warn('Recurring transactions listener deferred:', err)
    );
    return () => unsub();
  }, [profile?.uid, recurringTransactions]);

  const effectiveRecurring = recurringTransactions && recurringTransactions.length > 0 ? recurringTransactions : fetchedRecurring;
  
  // Results / Verdict state
  const [verdictData, setVerdictData] = useState<{
    status: 'green' | 'amber' | 'red' | null;
    itemName: string;
    price: number;
    parsedCurrency: string;
    workHours: number;
    pricePctBuffer: number;
    verdictTitle: string;
    verdictMessage: string;
    aiAlternatives: string[];
    savingsGoalName: string;
    savingsGoalRemaining: number;
  } | null>(null);

  // Cool off vault items state
  const [coolOffItems, setCoolOffItems] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'evaluator' | 'vault'>('evaluator');
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);
  const [purchaseSuccess, setPurchaseSuccess] = useState<string | null>(null);

  // Firestore listener for Cool-Off Vault items
  useEffect(() => {
    if (!profile?.uid) return;
    const unsub = onSnapshot(
      query(collection(db, `users/${profile.uid}/coolOffItems`), orderBy('createdAt', 'desc')),
      (snap) => {
        setCoolOffItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      },
      (err) => console.warn('Cool-off items listener deferred:', err)
    );
    return () => unsub();
  }, [profile?.uid]);

  // Compute live financial runway & hourly wage based on recurring income transactions only
  const metrics = useMemo(() => {
    // Liquid Cash total
    const liquidCash = (accounts || [])
      .filter(a => {
        const type = (a.type || '').toLowerCase();
        return type === 'bank' || type === 'cash' || type === 'checking' || type === 'savings';
      })
      .reduce((sum, a) => {
        const bal = accountBalances[a.id] !== undefined ? accountBalances[a.id] : (a.currentBalance || 0);
        return sum + Math.max(0, bal);
      }, 0);

    const safeLiquidCash = liquidCash > 0 ? liquidCash : 15000;

    // Monthly Wage / Salary based strictly on recurring income transactions
    let monthlyWage = 0;
    const activeRecurringIncomes = (effectiveRecurring || []).filter(r => {
      const isInc = (r.type === 'income' || r.transactionType === 'income' || r.type === 'Inflow');
      const isActive = r.isActive !== false;
      return isInc && isActive;
    });

    if (activeRecurringIncomes.length > 0) {
      monthlyWage = activeRecurringIncomes.reduce((sum, r) => {
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
        } else {
          monthlyAmount = monthlyAmount / (interval || 1);
        }
        return sum + monthlyAmount;
      }, 0);
    } else {
      monthlyWage = profile?.monthlySalary && profile.monthlySalary > 0 ? profile.monthlySalary : 15000;
    }

    // 40 hours per week -> 40 * 52 / 12 = 173.33 hours per month
    const monthlyHours = 40 * (52 / 12);
    const hourlyRate = Math.max(25, monthlyWage / monthlyHours);
    // Unallocated Monthly Discretionary Safe Buffer (e.g. 35% of liquid or unallocated)
    const unallocatedBuffer = Math.max(1000, safeLiquidCash * 0.35);

    return {
      liquidCash: safeLiquidCash,
      monthlyWage,
      hourlyRate,
      unallocatedBuffer
    };
  }, [accounts, accountBalances, effectiveRecurring, profile]);

  // Voice recognition handler
  const toggleVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      setFeedbackToast('Voice recognition is not supported in this browser. Please use text input.');
      setTimeout(() => setFeedbackToast(null), 3000);
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = i18nLangToSpeechLang();

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setQueryInput(transcript);
        setIsListening(false);
      };

      recognition.start();
    } catch (e) {
      console.warn('Speech recognition error:', e);
      setIsListening(false);
    }
  };

  const i18nLangToSpeechLang = () => 'en-US';

  // Extract item name and price
  const parseQuery = (text: string) => {
    // Regex for numbers
    const priceMatch = text.match(/(\d+(?:,\d+)*(?:\.\d+)?)\s*(aed|usd|eur|gbp|\$|€|£)?/i) || 
                       text.match(/(aed|usd|eur|gbp|\$|€|£)?\s*(\d+(?:,\d+)*(?:\.\d+)?)/i);

    let price = 0;
    if (priceMatch) {
      const rawNum = priceMatch[1] && !isNaN(parseFloat(priceMatch[1].replace(/,/g, ''))) 
        ? priceMatch[1] 
        : priceMatch[2];
      price = parseFloat((rawNum || '0').replace(/,/g, ''));
    }

    let itemName = text
      .replace(/should i buy|can i buy|buy|for|costing|priced at|\d+(?:,\d+)*(?:\.\d+)?|aed|usd|eur|gbp|\$|€|£|\?/gi, '')
      .trim();

    if (!itemName) itemName = 'Requested Item';
    if (price <= 0) price = 450; // Fallback demo price

    return { itemName, price };
  };

  // Evaluate query with online price check & work hours calculation
  const handleEvaluate = async (overrideText?: string) => {
    const textToEvaluate = overrideText || queryInput;
    if (!textToEvaluate.trim()) return;

    const tokenCost = 6500;
    if (currentTokens < tokenCost) {
      alert(`No Vantage AI tokens remaining! This request requires ${tokenCost} tokens, but you only have ${currentTokens} remaining.`);
      return;
    }

    setIsEvaluating(true);
    setVerdictData(null);
    logAIUsage('shouldIBuy');

    let itemName = textToEvaluate;
    let price = 0;
    let verdictTitle = '';
    let verdictMessage = '';
    let status: 'green' | 'amber' | 'red' = 'green';
    let aiAlternatives = [
      `Refurbished or pre-owned model (~30% lower cost)`,
      `Wait 14 days for mid-month promotional discount or seasonal sale`,
      `Borrow or rent for short-term use if needed only once`
    ];

    try {
      const tokenCost = 6500;
      if (profile?.uid) {
        await consumeAiTokensAndScans(profile.uid, profile, tokenCost, 0);
      }

      const user = await getCurrentUser();
      const idToken = user ? await user.getIdToken() : '';
      const response = await fetch('/api/ai/should-i-buy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { 'X-Vantage-Authorization': `Bearer ${idToken}` } : {})
        },
        body: JSON.stringify({
          query: textToEvaluate,
          currency,
          hourlyRate: metrics.hourlyRate,
          liquidCash: metrics.liquidCash,
          unallocatedBuffer: metrics.unallocatedBuffer,
          geminiKey: profile?.geminiKey
        })
      });

      if (response.ok) {
        const data = await response.json();

        if (data && data.price) {
          itemName = data.itemName || textToEvaluate;
          price = Number(data.price) || 450;
          verdictTitle = data.verdictTitle || 'Online Price Checked';
          verdictMessage = data.verdictMessage || '';
          status = data.verdict || 'green';
          if (data.alternatives && Array.isArray(data.alternatives)) {
            aiAlternatives = data.alternatives;
          }
        }
      } else {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Server error (Status ${response.status})`);
      }
    } catch (e: any) {
      console.error('Should I Buy AI evaluation failed:', e);
      alert(e.message || 'Secure handshake with the AI model failed. Please verify system connection.');
      setIsEvaluating(false);
      return;
    }

    if (price <= 0) {
      const parsed = parseQuery(textToEvaluate);
      itemName = parsed.itemName;
      price = parsed.price;
    }

    const workHours = price / metrics.hourlyRate;
    const pricePctBuffer = (price / metrics.unallocatedBuffer) * 100;

    if (!verdictMessage) {
      if (pricePctBuffer <= 15 && price <= metrics.unallocatedBuffer) {
        status = 'green';
        verdictTitle = 'Go for it! Safe Buy 🟢';
        verdictMessage = `Buying this item is equivalent to about ${workHours.toFixed(2)} hours of work at your hourly rate of ${metrics.hourlyRate.toFixed(2)} ${currency}. While this purchase is well within your unallocated buffer of ${metrics.unallocatedBuffer.toFixed(2)} ${currency}, taking a brief pause ensures it's a mindful choice rather than an impulse.`;
      } else if (pricePctBuffer > 15 && pricePctBuffer <= 45) {
        status = 'amber';
        verdictTitle = 'Caution. Pause & Ponder 🟡';
        verdictMessage = `Buying this item is equivalent to about ${workHours.toFixed(2)} hours of work at your hourly rate of ${metrics.hourlyRate.toFixed(2)} ${currency}. While this takes up ${pricePctBuffer.toFixed(2)}% of your unallocated buffer of ${metrics.unallocatedBuffer.toFixed(2)} ${currency}, try locking it in a 48-hour cool-off envelope first.`;
      } else {
        status = 'red';
        verdictTitle = 'Hold off. Hard Stop 🔴';
        verdictMessage = `Buying this item requires ${workHours.toFixed(2)} hours of work at your hourly rate of ${metrics.hourlyRate.toFixed(2)} ${currency}, exceeding your unallocated buffer of ${metrics.unallocatedBuffer.toFixed(2)} ${currency}. Let's redirect this cash to your active savings goal instead.`;
      }
    }

    setVerdictData({
      status,
      itemName,
      price,
      parsedCurrency: currency,
      workHours,
      pricePctBuffer,
      verdictTitle,
      verdictMessage,
      aiAlternatives,
      savingsGoalName: 'Family Villa Envelope',
      savingsGoalRemaining: 500
    });

    setIsEvaluating(false);
  };

  // Lock in 48-Hour Cool-Off Vault
  const handleLockInCoolOff = async () => {
    if (!verdictData || !profile?.uid) return;

    try {
      const now = new Date();
      const unlocksAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);

      await addDoc(collection(db, `users/${profile.uid}/coolOffItems`), {
        userId: profile.uid,
        itemName: verdictData.itemName,
        price: verdictData.price,
        currency: verdictData.parsedCurrency,
        workHours: verdictData.workHours,
        status: 'locked',
        createdAt: serverTimestamp(),
        unlocksAt: unlocksAt.toISOString()
      });

      setFeedbackToast(`🔒 Item locked in 48-Hour Cool-Off Vault! +15 Restraint Streak Bonus Points earned!`);
      setTimeout(() => setFeedbackToast(null), 4000);
      setVerdictData(null);
      setQueryInput('');
      setActiveTab('vault');
    } catch (e) {
      console.error('Lock cool-off item error:', e);
    }
  };

  // Confirm purchase & log transaction
  const handleConfirmPurchase = async () => {
    if (!verdictData || !profile?.uid) return;

    try {
      const targetAcc = (accounts || []).find(a => a.type === 'Bank' || a.type === 'Cash' || a.type === 'bank' || a.type === 'cash') || accounts[0];

      await addDoc(collection(db, `users/${profile.uid}/transactions`), {
        userId: profile.uid,
        accountId: targetAcc ? targetAcc.id : 'cash_wallet',
        type: 'expense',
        amount: verdictData.price,
        currency: verdictData.parsedCurrency,
        category: 'Shopping',
        subCategory: 'Discretionary Impulse',
        notes: `Impulse purchase: ${verdictData.itemName}`,
        date: new Date().toISOString().split('T')[0],
        status: 'confirmed',
        createdAt: serverTimestamp()
      });

      // Update account balance
      if (targetAcc?.id) {
        try {
          const accRef = doc(db, `users/${profile.uid}/accounts`, targetAcc.id);
          await runTransaction(db, async (tx) => {
            const accDoc = await tx.get(accRef);
            if (accDoc.exists()) {
              const curBal = accDoc.data().currentBalance || 0;
              tx.update(accRef, { currentBalance: Math.max(0, curBal - verdictData.price), updatedAt: serverTimestamp() });
            }
          });
        } catch (err) {
          console.warn('Account balance update deferred:', err);
        }
      }

      setPurchaseSuccess(`🛒 Purchase confirmed! Logged ${verdictData.price} ${currency} to your expense ledger.`);
      setTimeout(() => setPurchaseSuccess(null), 4000);
      setVerdictData(null);
      setQueryInput('');
    } catch (e) {
      console.error('Confirm purchase error:', e);
    }
  };

  // Remove cool-off item
  const handleRemoveCoolOffItem = async (itemId: string) => {
    if (!profile?.uid) return;
    try {
      await deleteDoc(doc(db, `users/${profile.uid}/coolOffItems`, itemId));
      setFeedbackToast('Item removed from Cool-Off Vault.');
      setTimeout(() => setFeedbackToast(null), 2500);
    } catch (e) {
      console.error('Delete cool off item error:', e);
    }
  };

  // Format hours remaining
  const formatRemainingTime = (unlocksAtStr: string) => {
    if (!unlocksAtStr) return '48 hours remaining';
    const diff = new Date(unlocksAtStr).getTime() - new Date().getTime();
    if (diff <= 0) return 'Unlocked! 🟢';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${mins}m left in Vault`;
  };

  return (
    <div className="w-full flex flex-col gap-5 text-left font-sans select-none" style={{ fontFamily: "'Google Sans', sans-serif" }}>
      
      {/* LOCKED TIER 1 / FREE TEASER CARD */}
      {!isTier2Or3 && (
        <div className="p-6 rounded-2xl bg-white text-[#111C2D] border border-neutral-200 shadow-xl relative overflow-hidden">
          <div className="flex items-start justify-between relative z-10 mb-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold shadow-sm">
                <ShoppingBag size={24} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                    Tier 2 & Tier 3 Exclusive
                  </span>
                  <Lock size={12} className="text-amber-600" />
                </div>
                <h3 className="text-lg font-bold text-[#111C2D] mt-0.5">
                  Should I Buy This? — Impulse Decision Engine
                </h3>
              </div>
            </div>
          </div>

          <p className="text-sm text-neutral-600 font-normal leading-relaxed mb-4 relative z-10">
            An empathetic conversational assistant evaluating impulse purchases against your live cash runway, upcoming bills, work-time equivalents, and 48-hour cool-off restraint envelopes.
          </p>

          <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200 mb-4 flex items-center justify-between text-xs text-amber-900 font-normal">
            <div className="flex items-center gap-2">
              <Zap size={16} className="text-amber-600 shrink-0" />
              <span>Includes: Work-Hours Translation, 48-Hr Cool-Off Vault & Frictionless Expense Logging</span>
            </div>
          </div>

          <button
            onClick={() => {
              window.dispatchEvent(new CustomEvent('open-premium-modal'));
            }}
            className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm rounded-xl transition-all shadow-md active:scale-98 flex items-center justify-center gap-2 cursor-pointer"
          >
            <Sparkles size={16} />
            <span>Upgrade to Tier 2 (Pro) / Tier 3 (Elite) to Unlock</span>
          </button>
        </div>
      )}

      {/* UNLOCKED TIER 2 & TIER 3 MAIN WORKFLOW */}
      {isTier2Or3 && (
        <div className="p-6 rounded-2xl bg-white text-[#111C2D] border border-neutral-200 shadow-xl relative overflow-hidden">
          <div className="absolute top-[-40px] right-[-40px] w-56 h-56 rounded-full bg-[#A6DDB1]/10 blur-3xl pointer-events-none" />

          {/* Toast notifications */}
          <AnimatePresence>
            {feedbackToast && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mb-4 p-3 rounded-xl bg-[#A6DDB1]/20 border border-[#A6DDB1]/40 text-[#A6DDB1] text-xs font-normal flex items-center justify-between"
              >
                <span>{feedbackToast}</span>
                <X size={14} className="cursor-pointer" onClick={() => setFeedbackToast(null)} />
              </motion.div>
            )}
            {purchaseSuccess && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-normal flex items-center justify-between"
              >
                <span>{purchaseSuccess}</span>
                <X size={14} className="cursor-pointer" onClick={() => setPurchaseSuccess(null)} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-neutral-100 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#A6DDB1] text-slate-950 flex items-center justify-center font-bold shadow-md shadow-[#A6DDB1]/20 shrink-0">
                <ShoppingBag size={20} />
              </div>
              <div className="w-full text-center flex flex-col items-center">
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold text-slate-950 bg-[#A6DDB1] px-2.5 py-0.5 rounded-full shrink-0">
                    Tier 2 & 3 Enabled
                  </span>
                  <span className="text-xs text-neutral-500 font-normal text-center">AI Impulse Coach</span>
                </div>
                <h3 className="text-base font-bold text-[#111C2D] mt-0.5 text-center">
                  Should I Buy This?
                </h3>
              </div>
            </div>

            {/* Tab switch buttons */}
            <div className="flex bg-neutral-50 p-1 rounded-xl border border-neutral-200 shrink-0 self-start sm:self-auto">
              <button
                onClick={() => setActiveTab('evaluator')}
                className={`px-3 py-1.5 rounded-lg text-xs font-normal transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'evaluator' ? 'bg-[#A6DDB1] text-slate-950 font-bold shadow-sm' : 'text-neutral-500 hover:text-neutral-800'
                }`}
              >
                Evaluator
              </button>
              <button
                onClick={() => setActiveTab('vault')}
                className={`px-3 py-1.5 rounded-lg text-xs font-normal transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  activeTab === 'vault' ? 'bg-[#A6DDB1] text-slate-950 font-bold shadow-sm' : 'text-neutral-500 hover:text-neutral-800'
                }`}
              >
                <Clock size={12} />
                <span>Cool-Off Vault</span>
                {coolOffItems.length > 0 && (
                  <span className="w-4 h-4 rounded-full bg-amber-400 text-slate-950 text-[10px] font-bold flex items-center justify-center">
                    {coolOffItems.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* AI Token Consumption & Allowance Widget */}
          <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-100 flex flex-col gap-3 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#A6DDB1]/20 border border-[#A6DDB1]/30 flex items-center justify-center text-[#A6DDB1]">
                  <Sparkles size={16} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#111C2D]">AI Token Allowance & Consumption</h4>
                </div>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-[#2A5235] font-mono">
                  {currentTokens.toLocaleString()}
                </span>
                <span className="text-[10px] text-neutral-500 block font-normal">Tokens Remaining</span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[11px] text-neutral-500 font-normal">
                <span>Consumed Allowance</span>
                <span>Max Capacity: 50,000 Tokens</span>
              </div>
              <div className="w-full h-2 bg-neutral-200 rounded-full overflow-hidden p-0.5 border border-neutral-100">
                <div 
                  className="h-full bg-[#A6DDB1] rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, ((50000 - currentTokens) / 50000) * 100))}%` }}
                />
              </div>
            </div>
          </div>

          {/* VANTAGE SLIM METRICS HEADER BAR */}
          <div className="flex flex-col gap-2 p-3 rounded-xl bg-neutral-50 border border-neutral-100 mb-4 text-xs">
<div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="flex flex-col">
                <span className="text-[10px] text-neutral-500 font-normal">Living Expense Fund</span>
                <span className="text-sm font-bold text-[#111C2D] font-mono mt-0.5">
                  {currency} {metrics.liquidCash.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex flex-col border-t sm:border-t-0 sm:border-l border-neutral-200 pt-2 sm:pt-0 sm:pl-3">
                <span className="text-[10px] text-neutral-500 font-normal">Free-to-Spend Limit</span>
                <span className="text-sm font-bold text-[#2A5235] font-mono mt-0.5">
                  {currency} {metrics.unallocatedBuffer.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex flex-col border-t sm:border-t-0 sm:border-l border-neutral-200 pt-2 sm:pt-0 sm:pl-3">
                <span className="text-[10px] text-neutral-500 font-normal">Hourly Rate</span>
                <span className="text-sm font-bold text-amber-500 font-mono mt-0.5">
                  {currency} {metrics.hourlyRate.toFixed(1)}/hr
                </span>
              </div>
            </div>
          </div>

          {/* TAB 1: EVALUATOR WORKFLOW */}
          {activeTab === 'evaluator' && (
            <div className="flex flex-col gap-4">
              
              {/* Natural Language Query Bar */}
              <div className="flex flex-col gap-2">
                <label className="text-xs text-neutral-500 font-normal">
                  What would you like to buy? Type or speak item name & price:
                </label>

                <div className="flex items-center gap-2 relative">
                  <input
                    type="text"
                    value={queryInput}
                    onChange={(e) => setQueryInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleEvaluate()}
                    placeholder="e.g., Should I buy these 450 AED wireless headphones?"
                    className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-[#111C2D] text-xs placeholder:text-neutral-500 focus:outline-none focus:border-[#A6DDB1] transition-all"
                  />

                  {/* Voice Button */}
                  <button
                    onClick={toggleVoiceInput}
                    title="Speak prompt"
                    className={`p-3 rounded-xl border transition-all cursor-pointer shrink-0 ${
                      isListening 
                        ? 'bg-rose-500 text-white border-rose-400 animate-pulse' 
                        : 'bg-neutral-50 hover:bg-neutral-100 text-neutral-500 border-neutral-200'
                    }`}
                  >
                    {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                  </button>

                  <button
                    onClick={() => handleEvaluate()}
                    disabled={isEvaluating || !queryInput.trim()}
                    className="px-4 py-3 bg-[#A6DDB1] hover:bg-[#96cdb1] text-slate-950 font-bold text-xs rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-50 shrink-0 cursor-pointer flex items-center gap-1.5"
                  >
                    {isEvaluating ? (
                      <span className="animate-spin text-slate-950">⌛</span>
                    ) : (
                      <>
                        <span>Evaluate</span>
                        <ArrowRight size={14} />
                      </>
                    )}
                  </button>
                </div>

                {/* Preset Chips */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-[10px] text-neutral-500 font-normal">Examples:</span>
                  {[
                    "450 AED wireless headphones",
                    "1,200 AED weekend stay",
                    "180 AED dinner out",
                    "3,500 AED camera"
                  ].map((preset, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setQueryInput(preset);
                        handleEvaluate(preset);
                      }}
                      className="px-2.5 py-1 rounded-full bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 text-[11px] text-neutral-600 hover:text-neutral-900 transition-all cursor-pointer"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* VERDICT CARD */}
              <AnimatePresence>
                {verdictData && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.98, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98, y: -10 }}
                    className={`p-6 rounded-2xl border-2 flex flex-col gap-4 relative overflow-hidden transition-all shadow-xl ${
                      verdictData.status === 'green'
                        ? 'bg-emerald-50 border-[#A6DDB1] text-[#111C2D] shadow-emerald-200/50'
                        : verdictData.status === 'amber'
                        ? 'bg-amber-50 border-amber-500 text-[#111C2D] shadow-amber-200/50'
                        : 'bg-rose-50 border-rose-500 text-[#111C2D] shadow-rose-200/50'
                    }`}
                  >
                    {/* Top indicator header */}
                    <div className="flex items-start justify-between border-b border-neutral-200 pb-4">
                      <div className="flex items-center gap-3 min-w-0 flex-1 mr-3">
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold shrink-0 shadow-md ${
                          verdictData.status === 'green' ? 'bg-[#A6DDB1] text-slate-950' : verdictData.status === 'amber' ? 'bg-amber-400 text-slate-950' : 'bg-rose-500 text-white'
                        }`}>
                          {verdictData.status === 'green' && <CheckCircle2 size={24} />}
                          {verdictData.status === 'amber' && <AlertTriangle size={24} />}
                          {verdictData.status === 'red' && <XCircle size={24} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-neutral-600 font-normal line-clamp-2">
                            Parsed Item: <span className="text-[#111C2D] font-bold">{verdictData.itemName}</span> ({verdictData.price} {verdictData.parsedCurrency})
                          </div>
                          <h4 className={`text-lg font-bold mt-0.5 border-[1px] rounded-[5px] px-2 py-0.5 inline-block w-fit ${
                            verdictData.status === 'green' ? 'text-emerald-700 border-[#A6DDB1]' : verdictData.status === 'amber' ? 'text-amber-700 border-amber-300' : 'text-rose-700 border-rose-300'
                          }`}>
                            {verdictData.verdictTitle}
                          </h4>
                        </div>
                      </div>

                      {/* Work Hours Translation Engine Badge */}
                      <div className="px-3.5 py-2 rounded-xl bg-white border border-neutral-200 text-right shrink-0">
                        <span className="text-[11px] text-neutral-500 block font-normal">Work-Time Cost</span>
                        <span className="text-sm font-bold text-amber-500 font-mono">
                          ⏱️ ~{verdictData.workHours.toFixed(1)} hrs labor
                        </span>
                      </div>
                    </div>

                    {/* Verdict Description */}
                    <p className="text-sm text-[#111C2D] font-normal leading-relaxed">
                      {verdictData.verdictMessage}
                    </p>



                    {/* Action Handlers */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-3 border-t border-neutral-200">
                      
                      {/* Lock in 48-Hr Cool-Off Envelope */}
                      <button
                        onClick={handleLockInCoolOff}
                        className="py-3 px-4 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer shadow-sm"
                      >
                        <Clock size={16} />
                        <span>Lock in 48-Hr Cool-Off Envelope</span>
                      </button>

                      {/* Confirm Purchase Frictionless Expense Logging */}
                      <button
                        onClick={handleConfirmPurchase}
                        className="py-3 px-4 bg-[#A6DDB1] hover:bg-[#96cdb1] text-slate-950 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer shadow-md"
                      >
                        <ShoppingBag size={16} />
                        <span>Confirm Purchase & Log Expense</span>
                      </button>

                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

            </div>
          )}

          {/* TAB 2: COOL-OFF VAULT LIST */}
          {activeTab === 'vault' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between pb-2">
                <span className="text-xs text-neutral-500 font-normal">
                  Active Impulse Restraint Wishlist Envelopes:
                </span>
                <span className="text-xs text-[#2A5235] font-bold">
                  {coolOffItems.length} Saved Items
                </span>
              </div>

              {coolOffItems.length === 0 ? (
                <div className="p-8 rounded-xl bg-neutral-50 border border-neutral-200 text-center flex flex-col items-center gap-2 text-neutral-500">
                  <Clock size={32} className="text-neutral-500 mb-1" />
                  <p className="text-xs font-normal">Your 48-Hour Cool-Off Vault is empty.</p>
                  <p className="text-[11px] text-neutral-500 font-normal">
                    When considering non-essential items, lock them here for 48 hours to earn restraint streak bonus points!
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2 max-h-[320px] overflow-y-auto pr-1">
                  {coolOffItems.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 rounded-xl bg-neutral-50 border border-neutral-200 flex flex-col gap-3 text-left hover:bg-neutral-100 transition-all"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-amber-100 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0 mt-0.5">
                            <Clock size={18} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold text-[#111C2D] whitespace-normal break-words">
                              {item.itemName}
                            </div>
                            <div className="text-[11px] text-neutral-500 font-normal mt-0.5">
                              {item.price} {item.currency || currency} • ~{(item.workHours || 0).toFixed(1)} hrs work
                            </div>
                            <div className="text-[10px] text-amber-500 font-mono mt-0.5">
                              ⏳ {formatRemainingTime(item.unlocksAt)}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => handleRemoveCoolOffItem(item.id)}
                          className="p-1.5 text-neutral-500 hover:text-rose-400 transition-colors cursor-pointer shrink-0"
                          title="Remove item"
                        >
                          <X size={16} />
                        </button>
                      </div>

                      <button
                        onClick={() => {
                          setQueryInput(`${item.price} ${item.currency || currency} ${item.itemName}`);
                          setActiveTab('evaluator');
                          handleEvaluate(`${item.price} ${item.currency || currency} ${item.itemName}`);
                        }}
                        className="w-full py-2 bg-[#A6DDB1] text-slate-950 font-bold text-xs rounded-lg hover:bg-[#96cdb1] transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <span>Buy Now</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      )}

    </div>
  );
};
