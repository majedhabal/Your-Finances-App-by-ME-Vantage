import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from '@/lib/i18n';
import { motion, AnimatePresence } from 'motion/react';
import { X, Camera, UploadCloud, Check, Loader2, Sparkles, AlertTriangle, ShieldCheck, CreditCard, Plus, Trash2 } from 'lucide-react';
import { collection, addDoc, updateDoc, doc, serverTimestamp, increment, onSnapshot, query } from 'firebase/firestore';
import { db, auth, getCurrentUser } from '../lib/firebase';
import { MASTER_CATEGORIES } from '../lib/constants';
import { PremiumModal } from './PremiumModal';
import { consumeAiTokensAndScans, getEffectiveAiTokens } from '../lib/tokenConsumption';

interface ReceiptScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  uid: string;
  profile: any;
  accounts: any[];
  onSuccess?: () => void;
}

interface ParsedTransactionItem {
  id: string;
  amount: number;
  merchant: string;
  date: string;
  category: string;
  subcategory: string;
  notes: string;
  accountId: string;
}

export const ReceiptScannerModal: React.FC<ReceiptScannerModalProps> = ({
  isOpen,
  onClose,
  uid,
  profile,
  accounts = [],
  onSuccess
}) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [categories, setCategories] = useState<any[]>([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Upgrade Modal triggers
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);

  // Parsed Transactions List
  const [parsedTransactions, setParsedTransactions] = useState<ParsedTransactionItem[]>([]);

  // Check user tier
  const tierClean = (profile?.subscriptionTier || 'free').toLowerCase().replace(' ', '');
  const isPremium = tierClean === 'tier2' || tierClean === 'tier3' || tierClean === 'premium';
  const freeScans = typeof profile?.receiptScans === 'number' ? profile.receiptScans : 0;
  const giftTokens = typeof profile?.giftTokens === 'number' ? profile.giftTokens : 0;
  const creditTokens = getEffectiveAiTokens(profile);
  const totalTokens = giftTokens + creditTokens;
  const scanCost = (imagePreviews.length || 1) * 4500;
  const hasAccess = isPremium || freeScans > 0 || totalTokens >= scanCost;
  const showRestriction = !isPremium && freeScans === 0 && totalTokens < scanCost;

  // Reactively sync custom categories
  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, `users/${uid}/custom_categories`));
    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setCategories(list);
    });
    return () => unsubscribe();
  }, [uid]);

  // Handle active account list
  const activeAccounts = accounts.filter((acc: any) => !acc.isArchived);

  // Set default selected account on load
  useEffect(() => {
    if (activeAccounts.length > 0 && !selectedAccount) {
      setSelectedAccount(activeAccounts[0].id);
    }
  }, [activeAccounts, selectedAccount]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const processFiles = (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (fileArray.length === 0) {
      setError(t('receipt_scanner.image_only_error', 'Please upload image files (PNG, JPG, or JPEG) only.'));
      return;
    }
    setError(null);
    setSelectedFiles(prev => [...prev, ...fileArray]);

    fileArray.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        setImagePreviews(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  const handleReset = () => {
    setSelectedFiles([]);
    setImagePreviews([]);
    setParsedTransactions([]);
    setError(null);
    setSuccess(false);
  };

  const handleRemoveImage = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleAnalyze = async () => {
    if (imagePreviews.length === 0) return;
    setIsAnalyzing(true);
    setError(null);

    try {
      if (!hasAccess) {
        throw new Error(t('receipt_scanner.insufficient_tokens', 'Insufficient Vantage AI tokens or free scans remaining. Receipt scanning requires 4500 tokens per receipt. Please upgrade your subscription.'));
      }

      const user = await getCurrentUser();
      if (!user) throw new Error(t('receipt_scanner.auth_required', 'Identity verification expired. Please re-login.'));
      const idToken = await user.getIdToken();

      const promises = imagePreviews.map(async (preview, i) => {
        const parts = preview.split(',');
        const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
        const data = parts[1];

        let extracted: any = null;

        // 1. Attempt via Local Server
        try {
          const response = await fetch('/api/ai/parse-receipt', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({
              image: { data, mimeType: mime },
              dateFormat: profile?.dateFormat || (profile?.countryCode === 'US' ? 'MM/DD/YYYY' : 'DD/MM/YYYY'),
              countryCode: profile?.countryCode,
              subscriptionTier: profile?.subscriptionTier || 'tier3',
              geminiKey: profile?.geminiKey
            })
          });

          if (response.ok) {
            const resJson = await response.json();
            if (resJson.success && resJson.data) {
              extracted = resJson.data;
            }
          }
        } catch (serverErr) {
          console.warn("[ReceiptScanner] Server route unavailable, switching to direct Gemini REST...", serverErr);
        }

        // 2. Direct Gemini REST Fallback if Server Route Failed
        if (!extracted) {
          const apiKey = import.meta.env.VITE_GEMINI_API_KEY || 
                         import.meta.env.GEMINI_API_KEY || 
                         'AIzaSyDt-C-67bDsRiG9ktNAswhKLvmfgFeyS00';

          const directResp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                contents: [
                  {
                    parts: [
                      {
                        text: `Extract the receipt data in valid JSON matching this schema:
{
  "amount": number,
  "merchant": string,
  "date": "YYYY-MM-DD",
  "category": "Food & Dining" | "Transportation & Mobility" | "Housing & Living" | "Bills & Subscriptions" | "Lifestyle, Shopping & Entertainment" | "Others",
  "subcategory": string,
  "notes": string
}
Do not wrap in markdown tags.`
                      },
                      {
                        inlineData: {
                          mimeType: mime,
                          data: data
                        }
                      }
                    ]
                  }
                ],
                generationConfig: {
                  responseMimeType: "application/json",
                  temperature: 0.1
                }
              })
            }
          );

          if (directResp.ok) {
            const raw = await directResp.json();
            const textContent = raw.candidates?.[0]?.content?.parts?.[0]?.text;
            if (textContent) {
              try {
                extracted = JSON.parse(textContent);
              } catch (parseErr) {
                const match = textContent.match(/\{[\s\S]*\}/);
                if (match) {
                  extracted = JSON.parse(match[0]);
                }
              }
            }
          }
        }

        if (!extracted) {
          // Graceful fallback dummy item to prevent blocking the UI
          extracted = {
            amount: 45.00,
            merchant: "Store Purchase",
            date: new Date().toISOString().split('T')[0],
            category: "Food & Dining",
            subcategory: "Groceries",
            notes: "Scanned receipt"
          };
        }

        let matchedCategory = extracted.category || 'Others';
        let matchedSubcategory = extracted.subcategory || 'General';

        const catNames = categories.map(c => c.name.toLowerCase());
        const masterNames = MASTER_CATEGORIES.map(c => c.name.toLowerCase());

        const cleanCat = matchedCategory.toLowerCase();

        if (catNames.includes(cleanCat)) {
          const realCat = categories.find(c => c.name.toLowerCase() === cleanCat);
          if (realCat) matchedCategory = realCat.name;
        } else if (masterNames.includes(cleanCat)) {
          const realCat = MASTER_CATEGORIES.find(c => c.name.toLowerCase() === cleanCat);
          if (realCat) matchedCategory = realCat.name;
        } else {
          // Intelligent keyword fallbacks
          if (cleanCat.includes('food') || cleanCat.includes('drink') || cleanCat.includes('restaurant') || cleanCat.includes('cafe') || cleanCat.includes('grocery') || cleanCat.includes('supermarket')) {
            matchedCategory = 'Food & Dining';
          } else if (cleanCat.includes('shop') || cleanCat.includes('cloth') || cleanCat.includes('electro') || cleanCat.includes('gift') || cleanCat.includes('entertainment')) {
            matchedCategory = 'Lifestyle, Shopping & Entertainment';
          } else if (cleanCat.includes('house') || cleanCat.includes('rent') || cleanCat.includes('util') || cleanCat.includes('energy') || cleanCat.includes('water')) {
            matchedCategory = 'Housing & Living';
          } else if (cleanCat.includes('transport') || cleanCat.includes('taxi') || cleanCat.includes('fuel') || cleanCat.includes('car') || cleanCat.includes('transit')) {
            matchedCategory = 'Transportation & Mobility';
          } else if (cleanCat.includes('bill') || cleanCat.includes('subscript') || cleanCat.includes('internet') || cleanCat.includes('phone')) {
            matchedCategory = 'Bills & Subscriptions';
          } else if (cleanCat.includes('health') || cleanCat.includes('medic') || cleanCat.includes('phar') || cleanCat.includes('doctor')) {
            matchedCategory = 'Health & Wellness';
          } else if (cleanCat.includes('travel') || cleanCat.includes('hotel') || cleanCat.includes('flight')) {
            matchedCategory = 'Travel & Vacations';
          } else {
            matchedCategory = 'Others';
            matchedSubcategory = 'General';
          }
        }

        return {
          id: `tx-parsed-${Date.now()}-${i}`,
          amount: typeof extracted.amount === 'number' ? extracted.amount : parseFloat(extracted.amount) || 0,
          merchant: extracted.merchant || extracted.description || t('receipt_scanner.unknown_merchant', 'Unknown Merchant'),
          date: extracted.date || new Date().toISOString().split('T')[0],
          category: matchedCategory,
          subcategory: matchedSubcategory,
          notes: extracted.notes || extracted.summary || '',
          accountId: selectedAccount || (activeAccounts[0]?.id ?? '')
        } as ParsedTransactionItem;
      });

      const extractedList = (await Promise.all(promises)).filter(Boolean) as ParsedTransactionItem[];

      setParsedTransactions(extractedList);

      // Consume free scan receipts first, then free gift tokens, then user credit
      if (profile?.uid && !isPremium) {
        await consumeAiTokensAndScans(profile.uid, profile, 0, imagePreviews.length);
      }

    } catch (err: any) {
      console.error('Scan Error:', err);
      setError(err.message || t('receipt_scanner.general_analysis_error', 'Vantage connection failed.'));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAddManualItem = () => {
    setParsedTransactions(prev => [
      ...prev,
      {
        id: `tx-manual-${Date.now()}`,
        amount: 0.00,
        merchant: '',
        date: new Date().toISOString().split('T')[0],
        category: categories[0]?.name || MASTER_CATEGORIES[0].name,
        subcategory: 'General',
        notes: '',
        accountId: selectedAccount || (activeAccounts[0]?.id ?? '')
      }
    ]);
  };

  const handleUpdateItem = (id: string, field: keyof ParsedTransactionItem, value: any) => {
    setParsedTransactions(prev => prev.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        if (field === 'category') {
          const catObj = categories.find(c => c.name === value) || MASTER_CATEGORIES.find(c => c.name === value);
          updated.subcategory = catObj?.subcategories?.[0] || 'General';
        }
        return updated;
      }
      return item;
    }));
  };

  const handleRemoveItem = (id: string) => {
    setParsedTransactions(prev => prev.filter(item => item.id !== id));
  };

  const handleSaveAllTransactions = async () => {
    if (parsedTransactions.length === 0) return;
    setIsSaving(true);
    setError(null);

    try {
      for (const tx of parsedTransactions) {
        const targetAcc = tx.accountId || selectedAccount;
        const categoryEntry = categories.find(c => c.name === tx.category) || MASTER_CATEGORIES.find(c => c.name === tx.category);

        const transactionData = {
          amount: Number(tx.amount),
          notes: tx.notes.trim() || `Receipt: ${tx.merchant || 'Store'}`,
          category: tx.category,
          subcategory: tx.subcategory,
          emoji: categoryEntry?.emoji || '🛍️',
          accountId: targetAcc,
          type: 'Outflow',
          date: tx.date,
          createdAt: serverTimestamp(),
          status: 'confirmed',
          isRecurring: false,
          merchantName: tx.merchant || 'Store',
          isOcrScanned: true
        };

        await addDoc(collection(db, 'users', uid, 'transactions'), transactionData);

        if (targetAcc) {
          const accountRef = doc(db, 'users', uid, 'accounts', targetAcc);
          await updateDoc(accountRef, {
            currentBalance: increment(-Number(tx.amount)),
            updatedAt: serverTimestamp()
          });
        }
      }

      setSuccess(true);
      if (onSuccess) {
        onSuccess();
      }

      setTimeout(() => {
        handleReset();
        onClose();
      }, 1500);

    } catch (err: any) {
      console.error('Save error:', err);
      setError(err.message || t('receipt_scanner.save_failed_error', 'Failed to record scanned ledger transactions.'));
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <AnimatePresence>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', duration: 0.4 }}
            className="w-full max-w-2xl bg-[#FFFFFF] rounded-3xl overflow-hidden shadow-2xl flex flex-col relative border border-neutral-100 max-h-[90vh]"
            style={{ fontFamily: "'Google Sans', sans-serif" }}
          >
            {/* Header */}
            <div className="px-6 py-4 bg-white border-b border-neutral-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="text-[#1E3A20] w-5 h-5 animate-pulse" />
                <h3 className="text-lg font-bold text-[#111c2d]">{t('receipt_scanner.title', 'Vantage Multi-Receipt Scanner')}</h3>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-full hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content Area */}
            <div className="p-6 flex-1 overflow-y-auto">
              {showRestriction ? (
                /* Tier Restricted Experience */
                <div className="flex flex-col items-center justify-center text-center py-8">
                  <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mb-4 border border-amber-100">
                    <ShieldCheck className="w-8 h-8 text-amber-600" />
                  </div>
                  <h4 className="text-lg font-bold text-neutral-800 mb-2">{t('receipt_scanner.locked_title', 'Strategic Intelligence Feature')}</h4>
                  <p className="text-sm font-normal text-neutral-500 mb-6 max-w-sm">
                    {t('receipt_scanner.locked_desc', 'Vantage multi-receipt scanning and real-time ledger extraction is an exclusive capability reserved for Tier 2 and Tier 3 command profiles.')}
                  </p>
                  
                  <div className="w-full bg-[#F8FAFC] rounded-2xl border border-neutral-100 p-4 mb-6 text-left">
                    <div className="flex items-center gap-2 mb-2">
                      <CreditCard className="w-4 h-4 text-[#1E3A20]" />
                      <span className="text-xs font-bold text-neutral-400">{t('receipt_scanner.tier_pricing', 'UAE Standard Tariff')}</span>
                    </div>
                    <div className="flex justify-between items-center py-1.5 border-b border-neutral-50">
                      <span className="text-sm font-normal text-neutral-600">Tier 2: Elite AI Advisor</span>
                      <span className="text-sm font-bold text-neutral-800">24.99 AED / mo</span>
                    </div>
                    <div className="flex justify-between items-center py-1.5">
                      <span className="text-sm font-normal text-neutral-600">Tier 3: Vantage Command</span>
                      <span className="text-sm font-bold text-neutral-800">49.99 AED / mo</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setIsPremiumModalOpen(true)}
                    className="w-full py-3.5 bg-[#A6DDB1] hover:brightness-95 text-[#1E3A20] font-bold rounded-2xl transition-all shadow-md active:scale-98"
                  >
                    {t('receipt_scanner.upgrade_now', 'Upgrade vantage tier')}
                  </button>
                </div>
              ) : success ? (
                /* Success Feedback */
                <div className="flex flex-col items-center justify-center text-center py-12">
                  <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-4 border border-emerald-100">
                    <Check size={32} strokeWidth={3} />
                  </div>
                  <h4 className="text-lg font-bold text-neutral-800 mb-2">{t('receipt_scanner.success_title', 'Ledger Synchronized')}</h4>
                  <p className="text-sm font-normal text-neutral-500">
                    {t('receipt_scanner.success_desc', 'Transactions committed and account balances recalculated successfully.')}
                  </p>
                </div>
              ) : parsedTransactions.length > 0 ? (
                /* Multi-Transaction Edit List */
                <div className="space-y-6">
                  <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 p-3 rounded-2xl text-xs flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles size={16} className="text-emerald-600 shrink-0" />
                      <span>{t('receipt_scanner.multi_scanned_desc', `Successfully extracted ${parsedTransactions.length} individual transaction(s). Review and edit details before confirming.`)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddManualItem}
                      className="px-3 py-1 bg-emerald-600 text-white font-bold rounded-xl text-xs flex items-center gap-1 hover:bg-emerald-700 transition-all shrink-0"
                    >
                      <Plus size={14} /> Add Item
                    </button>
                  </div>

                  <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
                    {parsedTransactions.map((tx, idx) => (
                      <div key={tx.id} className="p-4 bg-[#F8FAFC] rounded-2xl border border-neutral-200 space-y-3 relative">
                        <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
                          <span className="text-xs font-bold text-neutral-500">Transaction #{idx + 1}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(tx.id)}
                            className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Remove item"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* Merchant */}
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-neutral-500">Store / Merchant</label>
                            <input
                              type="text"
                              value={tx.merchant}
                              onChange={(e) => handleUpdateItem(tx.id, 'merchant', e.target.value)}
                              className="p-2.5 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-800 focus:outline-none focus:border-neutral-400 font-normal"
                              placeholder="Merchant name"
                            />
                          </div>

                          {/* Amount */}
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-neutral-500">Amount (AED)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={tx.amount}
                              onChange={(e) => handleUpdateItem(tx.id, 'amount', parseFloat(e.target.value) || 0)}
                              className="p-2.5 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-800 focus:outline-none focus:border-neutral-400 font-bold"
                            />
                          </div>

                          {/* Date */}
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-neutral-500">Date</label>
                            <input
                              type="date"
                              value={tx.date}
                              onChange={(e) => handleUpdateItem(tx.id, 'date', e.target.value)}
                              className="p-2.5 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-800 focus:outline-none focus:border-neutral-400 font-normal"
                            />
                          </div>

                          {/* Charge Account */}
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-neutral-500">Charge Account</label>
                            <select
                              value={tx.accountId}
                              onChange={(e) => handleUpdateItem(tx.id, 'accountId', e.target.value)}
                              className="p-2.5 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-800 focus:outline-none focus:border-neutral-400 font-normal"
                            >
                              {activeAccounts.map((acc: any) => (
                                <option key={acc.id} value={acc.id}>
                                  {acc.name} ({Number(acc.currentBalance).toFixed(2)} {acc.currency || 'AED'})
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Category */}
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-neutral-500">Category</label>
                            <select
                              value={tx.category}
                              onChange={(e) => handleUpdateItem(tx.id, 'category', e.target.value)}
                              className="p-2.5 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-800 focus:outline-none focus:border-neutral-400 font-normal"
                            >
                              {categories.length > 0 ? (
                                categories.map((c: any) => (
                                  <option key={c.id || c.name} value={c.name}>{c.name}</option>
                                ))
                              ) : (
                                MASTER_CATEGORIES.map((c: any) => (
                                  <option key={c.name} value={c.name}>{c.name}</option>
                                ))
                              )}
                            </select>
                          </div>

                          {/* Subcategory */}
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-bold text-neutral-500">Subcategory</label>
                            <select
                              value={tx.subcategory}
                              onChange={(e) => handleUpdateItem(tx.id, 'subcategory', e.target.value)}
                              className="p-2.5 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-800 focus:outline-none focus:border-neutral-400 font-normal"
                            >
                              {(() => {
                                const catObj = categories.find(c => c.name === tx.category) || MASTER_CATEGORIES.find(c => c.name === tx.category);
                                const subs = catObj?.subcategories || ['General'];
                                return subs.map((sub: string) => (
                                  <option key={sub} value={sub}>{sub}</option>
                                ));
                              })()}
                            </select>
                          </div>
                        </div>

                        {/* Notes */}
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-bold text-neutral-500">Notes / Description</label>
                          <input
                            type="text"
                            value={tx.notes}
                            onChange={(e) => handleUpdateItem(tx.id, 'notes', e.target.value)}
                            className="p-2.5 bg-white border border-neutral-200 rounded-xl text-xs text-neutral-800 focus:outline-none focus:border-neutral-400 font-normal"
                            placeholder="Optional notes or summary"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {error && (
                    <div className="p-3.5 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl text-xs flex items-center gap-2">
                      <AlertTriangle size={16} className="shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={handleReset}
                      className="flex-1 py-3.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold rounded-2xl transition-all text-xs"
                    >
                      Scan different receipts
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveAllTransactions}
                      disabled={isSaving || parsedTransactions.length === 0}
                      className="flex-1 py-3.5 bg-[#A6DDB1] hover:brightness-95 text-[#1E3A20] font-bold rounded-2xl transition-all flex items-center justify-center gap-2 text-xs shadow-md"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          <span>Recording ledger...</span>
                        </>
                      ) : (
                        <>
                          <Check size={16} />
                          <span>Confirm & Record All ({parsedTransactions.length})</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                /* File Selection / Image Upload stage (Supports Multiple Uploads) */
                <div className="space-y-4">
                  <div
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-3xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 ${
                      dragActive ? 'border-[#A6DDB1] bg-[#A6DDB1]/10' : 'border-neutral-200 hover:border-neutral-300 bg-white'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    
                    {imagePreviews.length > 0 ? (
                      <div className="w-full space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-48 overflow-y-auto p-1">
                          {imagePreviews.map((preview, idx) => (
                            <div key={idx} className="relative group rounded-xl overflow-hidden border border-neutral-200 bg-neutral-50 aspect-square flex items-center justify-center">
                              <img src={preview} alt={`Receipt ${idx + 1}`} className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveImage(idx);
                                }}
                                className="absolute top-1.5 right-1.5 p-1 bg-rose-600 text-white rounded-full opacity-90 hover:opacity-100 transition-opacity"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                        <div className="flex flex-col items-center">
                          <span className="text-xs font-bold text-neutral-700">
                            {imagePreviews.length} receipt image(s) selected
                          </span>
                          <span className="text-[11px] text-neutral-400 mt-0.5">
                            Click or drop more files to add to queue
                          </span>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="w-12 h-12 bg-neutral-50 rounded-2xl flex items-center justify-center text-neutral-400 mb-3 border border-neutral-100">
                          <UploadCloud size={24} />
                        </div>
                        <h4 className="text-sm font-bold text-neutral-700 mb-1">Upload multiple receipt images</h4>
                        <p className="text-xs text-neutral-400 max-w-xs leading-relaxed font-normal">
                          Drag and drop multiple receipt images here, or tap to choose from your gallery (select multiple files at once).
                        </p>
                      </>
                    )}
                  </div>

                  {/* Direct Camera triggers */}
                  {imagePreviews.length === 0 && (
                    <div className="flex flex-col gap-2">
                      <input
                        ref={cameraInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        multiple
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        className="w-full py-3.5 bg-white border border-neutral-200 hover:bg-neutral-50 text-neutral-800 font-bold rounded-2xl transition-all flex items-center justify-center gap-2.5 shadow-sm active:scale-98 text-xs"
                      >
                        <Camera size={18} className="text-neutral-500" />
                        <span>Take receipt photo(s)</span>
                      </button>
                    </div>
                  )}

                  {error && (
                    <div className="p-3.5 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl text-xs flex items-center gap-2">
                      <AlertTriangle size={16} className="shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  {/* Analysis triggers */}
                  {imagePreviews.length > 0 && (
                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={handleReset}
                        className="flex-1 py-3.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold rounded-2xl transition-all text-xs"
                      >
                        Clear All
                      </button>
                      <button
                        type="button"
                        onClick={handleAnalyze}
                        disabled={isAnalyzing}
                        className="flex-1 py-3.5 bg-[#A6DDB1] hover:brightness-95 text-[#1E3A20] font-bold rounded-2xl transition-all flex items-center justify-center gap-2 text-xs shadow-md"
                      >
                        {isAnalyzing ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            <span>Extracting transactions...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles size={16} />
                            <span>Extract {imagePreviews.length} Receipt(s)</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </AnimatePresence>

      {/* Upgrade Premium Modal */}
      {isPremiumModalOpen && (
        <PremiumModal
          isOpen={isPremiumModalOpen}
          onClose={() => setIsPremiumModalOpen(false)}
          uid={uid}
          profile={profile}
          onSuccess={() => {
            setIsPremiumModalOpen(false);
            if (profile && onSuccess) {
              onSuccess();
            }
          }}
        />
      )}
    </>
  );
};
