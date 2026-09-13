import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check } from 'lucide-react';
import { doc, collection, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { evaluateMathExpression } from '../lib/constants';

interface BudgetConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: any;
  editingBudget: any | null;
  effectiveCategories: any[];
}

export const BudgetConfigModal: React.FC<BudgetConfigModalProps> = ({ 
  isOpen, 
  onClose, 
  profile, 
  editingBudget, 
  effectiveCategories 
}) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.body.classList.add('hide-header-footer');
      window.dispatchEvent(new CustomEvent('budget-config-modal-toggled', { detail: { isOpen: true } }));
    } else {
      document.body.style.overflow = 'auto';
      document.body.classList.remove('hide-header-footer');
      window.dispatchEvent(new CustomEvent('budget-config-modal-toggled', { detail: { isOpen: false } }));
    }
    return () => {
      document.body.style.overflow = 'auto';
      document.body.classList.remove('hide-header-footer');
      window.dispatchEvent(new CustomEvent('budget-config-modal-toggled', { detail: { isOpen: false } }));
    };
  }, [isOpen]);

  const [title, setTitle] = useState('');
  const [maxBudget, setMaxBudget] = useState('');
  const [currency, setCurrency] = useState('AED');
  const [mappedCategories, setMappedCategories] = useState<string[]>([]);
  const [mappedSubCategories, setMappedSubCategories] = useState<string[]>([]);
  const [expandedCats, setExpandedCats] = useState<string[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [categoryGroup, setCategoryGroup] = useState<'needs' | 'wants' | 'savings'>('needs');
  const [emoji, setEmoji] = useState('🍟');
  const [isLoading, setIsLoading] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  useEffect(() => {
    if (editingBudget) {
      setTitle(editingBudget.categoryTitle || editingBudget.title || editingBudget.category || '');
      setMaxBudget((editingBudget.allocatedAmount !== undefined ? editingBudget.allocatedAmount : (editingBudget.maxBudget || 0)).toString());
      setCurrency(editingBudget.currency || 'AED');
      setPeriod(editingBudget.period || 'daily');
      setCategoryGroup((editingBudget.categoryGroup as 'needs' | 'wants' | 'savings') || 'needs');
      setEmoji(editingBudget.emoji || (editingBudget.iconAsset && editingBudget.iconAsset.length === 1 ? editingBudget.iconAsset : '🍟'));
      
      const loadedCats = editingBudget.mappedCategories || (editingBudget.category ? [editingBudget.category] : []);
      const loadedSubs = editingBudget.mappedSubCategories || (editingBudget.subcategory && editingBudget.subcategory !== 'All' ? [editingBudget.subcategory] : []);
      setMappedCategories(loadedCats);
      setMappedSubCategories(loadedSubs);
      setExpandedCats(loadedCats);
    } else {
      setTitle('');
      setMaxBudget('');
      setCurrency('AED');
      setPeriod('daily');
      setCategoryGroup('needs');
      setEmoji('🍟');
      setMappedCategories([]);
      setMappedSubCategories([]);
      setExpandedCats([]);
    }
    setIsDropdownOpen(false);
  }, [editingBudget, isOpen, effectiveCategories]);

  const handleToggleCategory = (categoryName: string) => {
    const categoryDef = effectiveCategories.find(c => c.name === categoryName);
    const subCategories = categoryDef ? (categoryDef.subcategories || []) : [];

    const isSelected = mappedCategories.includes(categoryName);
    let newCats = [...mappedCategories];
    let newSubs = [...mappedSubCategories];

    if (isSelected) {
      newCats = newCats.filter(c => c !== categoryName);
      newSubs = newSubs.filter(sub => !subCategories.includes(sub));
      setExpandedCats(prev => prev.filter(c => c !== categoryName));
    } else {
      newCats.push(categoryName);
      subCategories.forEach((sub: string) => {
        if (!newSubs.includes(sub)) newSubs.push(sub);
      });
      if (!expandedCats.includes(categoryName)) {
        setExpandedCats(prev => [...prev, categoryName]);
      }
    }
    setMappedCategories(newCats);
    setMappedSubCategories(newSubs);

    if (newCats.length > 0) {
      const firstCatData = effectiveCategories.find(c => c.name === newCats[0]);
      if (firstCatData?.emoji) {
        setEmoji(firstCatData.emoji);
      }
    }
  };

  const handleToggleSubCategory = (subName: string, parentCategoryName: string) => {
    const isSelected = mappedSubCategories.includes(subName);
    let newSubs = [...mappedSubCategories];
    let newCats = [...mappedCategories];

    if (isSelected) {
      newSubs = newSubs.filter(s => s !== subName);
    } else {
      newSubs.push(subName);
      if (!newCats.includes(parentCategoryName)) {
        newCats.push(parentCategoryName);
      }
      if (!expandedCats.includes(parentCategoryName)) {
        setExpandedCats(prev => [...prev, parentCategoryName]);
      }
    }
    setMappedCategories(newCats);
    setMappedSubCategories(newSubs);

    if (newCats.length > 0) {
      const firstCatData = effectiveCategories.find(c => c.name === newCats[0]);
      if (firstCatData?.emoji) {
        setEmoji(firstCatData.emoji);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.uid || !title || !maxBudget) return;

    const parsedMaxBudget = parseFloat(evaluateMathExpression(maxBudget));

    if (editingBudget) {
      const isUnchanged = (editingBudget.categoryTitle === title || editingBudget.title === title) &&
                          (editingBudget.allocatedAmount === parsedMaxBudget || editingBudget.maxBudget === parsedMaxBudget) &&
                          editingBudget.currency === currency &&
                          JSON.stringify(editingBudget.mappedCategories || []) === JSON.stringify(mappedCategories) &&
                          JSON.stringify(editingBudget.mappedSubCategories || []) === JSON.stringify(mappedSubCategories) &&
                          editingBudget.period === period &&
                          (editingBudget.emoji === emoji || editingBudget.iconAsset === emoji);
      if (isUnchanged) {
        onClose();
        return;
      }
    }

    setIsLoading(true);

    try {
      const bId = editingBudget?.id || editingBudget?.budgetId;
      const budgetRef = bId 
        ? doc(db, `users/${profile.uid}/miniBudgets`, bId)
        : doc(collection(db, `users/${profile.uid}/miniBudgets`));
        
      const iconAssetVal = emoji || 'shopping-cart';
      const spentAmountVal = editingBudget ? (editingBudget.spentAmount !== undefined ? editingBudget.spentAmount : (editingBudget.spent || 0)) : 0.00;

      const fallbackCategory = mappedCategories.length > 0 ? mappedCategories[0] : (effectiveCategories[0]?.name || 'Food & Drinks');
      const fallbackSubcategory = mappedSubCategories.length > 0 ? mappedSubCategories[0] : null;

      await setDoc(budgetRef, {
        budgetId: budgetRef.id,
        id: budgetRef.id,
        userId: profile.uid,
        categoryTitle: title,
        title: title,
        allocatedAmount: parsedMaxBudget,
        maxBudget: parsedMaxBudget,
        spentAmount: spentAmountVal,
        spent: spentAmountVal,
        currency,
        iconAsset: iconAssetVal,
        emoji: emoji || '🍟',
        category: fallbackCategory,
        subcategory: fallbackSubcategory,
        categoryGroup: categoryGroup || 'needs',
        mappedCategories,
        mappedSubCategories,
        period,
        createdAt: editingBudget?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, { merge: true });
      
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${profile.uid}/miniBudgets`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-white" />
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }} 
            animate={{ scale: 1, opacity: 1 }} 
            exit={{ scale: 0.9, opacity: 0 }} 
            className="relative w-full max-w-[360px] md:max-w-[400px] bg-white border-[1px] border-neutral-200 rounded-2xl p-5 shadow-2xl transition-all"
          >
            <div className="flex flex-col items-center gap-0.5 mb-4">
              <h4 className="text-black text-center leading-none"
                  style={{ 
                    fontFamily: "'Google Sans', sans-serif", 
                    fontWeight: 700, 
                    fontSize: 'clamp(15px, 4.2vw, 19px)' 
                  }}>
                {editingBudget ? 'Edit your budget' : 'Create a budget'}
              </h4>
              <p className="text-emerald-700 text-center leading-none mt-1"
                 style={{ 
                   fontFamily: "'Google Sans', sans-serif", 
                   fontWeight: 400, 
                   fontSize: 'clamp(12px, 2.2vw, 12px)' 
                 }}>
                {editingBudget ? 'You can edit all of the details about your budget and the changes will show immediately' : 'You can set your budget and assign different categories to better track your spending, you will receive notification on your remaining budget'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-[clamp(12px,2.8vw,14px)]">
              {/* Budget Title */}
              <div className="space-y-1 text-left flex flex-col justify-start items-stretch">
                <label className="px-1 leading-none text-slate-500 font-normal"
                       style={{ 
                         fontFamily: "'Google Sans', sans-serif", 
                         fontSize: 'clamp(12px, 2.5vw, 12px)' 
                       }}>
                  Budget Title
                </label>
                <input 
                  value={title} 
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g., Daily Coffee"
                  className="w-full bg-vantage-text/5 border border-[#E1E8ED] rounded-lg px-2.5 text-black outline-none transition-all placeholder:text-[#57606F]/40"
                  style={{ 
                    fontFamily: "'Google Sans', sans-serif", 
                    fontWeight: 400, 
                    fontSize: 'clamp(12px, 2.8vw, 13px)', 
                    height: 'clamp(34px, 9vw, 38px)' 
                  }}
                />
              </div>

              {/* Category Selections Dropdown */}
              <div 
                id="category-selection-container" 
                ref={categoryDropdownRef}
                className="space-y-1 text-left flex flex-col justify-start items-stretch relative"
              >
                <label className="px-1 leading-none text-slate-500 font-normal"
                       style={{ 
                         fontFamily: "'Google Sans', sans-serif", 
                         fontSize: 'clamp(12px, 2.5vw, 12px)' 
                       }}>
                  Category Selections
                </label>
                <button
                  type="button"
                  id="category-selection-trigger"
                  onClick={() => setIsDropdownOpen(prev => !prev)}
                  className="w-full bg-vantage-text/5 border border-[#E1E8ED] rounded-xl px-3 text-black transition-colors hover:bg-neutral-50 flex items-center justify-between text-left cursor-pointer outline-none select-none"
                  style={{ 
                    fontFamily: "'Google Sans', sans-serif", 
                    fontWeight: 400,
                    fontSize: 'clamp(12px, 2.8vw, 13px)', 
                    height: 'clamp(34px, 9vw, 38px)' 
                  }}
                >
                  <span className="truncate">
                    {mappedCategories.length === 0 
                      ? "Select Tracking Categories ▼" 
                      : `${mappedCategories.length} Categories, ${mappedSubCategories.length} Selected`}
                  </span>
                  <span className="text-neutral-400 text-[12px] shrink-0">
                    {isDropdownOpen ? '▲' : '▼'}
                  </span>
                </button>

                {/* Dropdown Menu Overlay / Popover */}
                {isDropdownOpen && (
                  <div 
                    id="category-selection-menu"
                    className="absolute z-[250] left-0 right-0 mt-1 max-h-[260px] overflow-y-auto bg-white border border-neutral-200 rounded-xl shadow-xl p-3 flex flex-col gap-2.5 sm:max-h-[280px] md:max-h-[320px]"
                    style={{
                      fontFamily: "'Google Sans', sans-serif"
                    }}
                  >
                    <div className="flex items-center justify-between pb-2 mb-1 border-b border-neutral-100 sticky -top-3 -mx-3 px-3 pt-1 bg-white z-20">
                      <span className="text-xs font-bold text-slate-700">
                        Category Selections ({mappedCategories.length})
                      </span>
                    </div>

                    <div className="flex flex-col gap-2.5">
                      {effectiveCategories.map((cat, idx) => {
                        const isCatSelected = mappedCategories.includes(cat.name);
                        const isCatExpanded = expandedCats.includes(cat.name);
                        const catSubcategories = cat.subcategories || [];

                        return (
                          <div key={`daily-log-cat-sel-${cat.name || 'node'}-${idx}`} className="flex flex-col gap-1">
                            <div className="flex items-center justify-between gap-2 p-1.5 rounded-lg border border-neutral-100 bg-white hover:bg-neutral-50 transition-colors">
                              <label className="flex items-center gap-2 flex-1 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={isCatSelected}
                                  onChange={() => handleToggleCategory(cat.name)}
                                  className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500 accent-slate-900 cursor-pointer"
                                />
                                <span 
                                  style={{ 
                                    fontFamily: "'Google Sans', sans-serif",
                                    fontSize: 'clamp(0.95rem, 2vw, 1.15rem)',
                                    fontWeight: 500
                                  }}
                                  className="text-slate-800"
                                >
                                  {cat.name}
                                </span>
                              </label>
                              
                              {catSubcategories.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setExpandedCats(prev => 
                                      prev.includes(cat.name) 
                                        ? prev.filter(c => c !== cat.name) 
                                        : [...prev, cat.name]
                                    );
                                  }}
                                  className="text-neutral-400 hover:text-black transition-colors px-2 py-0.5 text-xs select-none cursor-pointer"
                                >
                                  {isCatExpanded ? '▲' : '▼'}
                                </button>
                              )}
                            </div>

                            {isCatExpanded && catSubcategories.length > 0 && (
                              <div className="flex flex-col gap-1 ml-6 pl-2 border-l-2 border-neutral-100">
                                {catSubcategories.map((sub: string, subIdx: number) => {
                                  const isSubSelected = mappedSubCategories.includes(sub);
                                  return (
                                    <label 
                                      key={`sub-cat-${cat.name}-${sub}-${subIdx}`}
                                      className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-neutral-50 cursor-pointer text-left"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isSubSelected}
                                        onChange={() => handleToggleSubCategory(sub, cat.name)}
                                        className="w-3.5 h-3.5 rounded border-slate-300 text-neutral-600 focus:ring-neutral-400 accent-neutral-600 cursor-pointer"
                                      />
                                      <span 
                                        style={{ 
                                          fontFamily: "'Google Sans', sans-serif",
                                          fontSize: 'clamp(0.85rem, 1.8vw, 1rem)',
                                          fontWeight: 400
                                        }}
                                        className="text-neutral-600"
                                      >
                                        {sub}
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="pt-2 mt-1 border-t border-neutral-100 sticky -bottom-3 -mx-3 px-3 pb-1 bg-white z-20">
                      <button
                        type="button"
                        onClick={() => setIsDropdownOpen(false)}
                        className="w-full py-1.5 px-3 text-xs font-bold bg-[#111C2D] text-white rounded-lg hover:bg-[#1f2d42] transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                        style={{ fontFamily: "'Google Sans', sans-serif" }}
                      >
                        <Check size={14} />
                        <span>Confirm & Close Selection</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Space-optimized grid for Max Amount and Currency */}
              <div className="grid grid-cols-2" style={{ gap: 'clamp(12px, 2.8vw, 14px)' }}>
                <div className="space-y-1 text-left flex flex-col justify-start items-stretch">
                  <label className="px-1 leading-none text-slate-500 font-normal"
                         style={{ 
                           fontFamily: "'Google Sans', sans-serif", 
                           fontSize: 'clamp(12px, 2.5vw, 12px)' 
                         }}>
                    Max Amount
                  </label>
                  <input 
                    type="text"
                    value={maxBudget} 
                    onChange={e => setMaxBudget(e.target.value.replace(/[^0-9+\-*/.()]/g, ''))}
                    onBlur={() => setMaxBudget(prev => evaluateMathExpression(prev))}
                    placeholder="0 or e.g., 7000*6"
                    className="w-full bg-vantage-text/5 border border-[#E1E8ED] rounded-lg px-2.5 text-black outline-none transition-all placeholder:text-[#57606F]/40 font-mono"
                    style={{ 
                      fontFamily: "'Google Sans', sans-serif", 
                      fontWeight: 400, 
                      fontSize: 'clamp(12px, 2.8vw, 13px)', 
                      height: 'clamp(34px, 9vw, 38px)' 
                    }}
                  />
                </div>

                <div className="space-y-1 text-left flex flex-col justify-start items-stretch">
                  <label className="px-1 leading-none text-slate-500 font-normal"
                         style={{ 
                           fontFamily: "'Google Sans', sans-serif", 
                           fontSize: 'clamp(12px, 2.5vw, 12px)' 
                         }}>
                    Currency
                  </label>
                  <select 
                    value={currency} 
                    onChange={e => setCurrency(e.target.value)}
                    className="w-full bg-vantage-text/5 border border-[#E1E8ED] rounded-lg px-2 text-black outline-none transition-all placeholder:text-[#57606F]/40 cursor-pointer"
                    style={{ 
                      fontFamily: "'Google Sans', sans-serif", 
                      fontWeight: 400, 
                      fontSize: 'clamp(12px, 2.8vw, 13px)', 
                      height: 'clamp(34px, 9vw, 38px)' 
                    }}
                  >
                    <option value="AED">AED</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
              </div>

              {/* Space-optimized Budget Period */}
              <div className="w-full">
                <div className="space-y-1 text-left flex flex-col justify-start items-stretch">
                  <label className="px-1 leading-none text-slate-500 font-normal"
                         style={{ 
                           fontFamily: "'Google Sans', sans-serif", 
                           fontSize: 'clamp(12px, 2.5vw, 12px)' 
                         }}>
                    Budget Period
                  </label>
                  <select 
                    value={period} 
                    onChange={e => setPeriod(e.target.value as any)}
                    className="w-full bg-vantage-text/5 border border-[#E1E8ED] rounded-lg px-2 text-black outline-none transition-all placeholder:text-[#57606F]/40 cursor-pointer"
                    style={{ 
                      fontFamily: "'Google Sans', sans-serif", 
                      fontWeight: 400, 
                      fontSize: 'clamp(12px, 2.8vw, 13px)', 
                      height: 'clamp(34px, 9vw, 38px)' 
                    }}
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
              </div>

              <button 
                type="submit" 
                disabled={isLoading}
                className="w-full h-[38px] md:h-[42px] bg-[#A6DDB1] rounded-lg text-slate-900 active:scale-95 transition-all disabled:opacity-50 mt-4 flex items-center justify-center cursor-pointer shadow-lg shadow-[#A6DDB1]/20 font-bold"
                style={{
                  fontFamily: "'Google Sans', sans-serif",
                  fontSize: 'clamp(12px, 2.8vw, 13px)'
                }}
              >
                {editingBudget ? 'Update your budget details' : 'Create your budget'}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
