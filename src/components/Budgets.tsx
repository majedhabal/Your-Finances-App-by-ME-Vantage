import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ListTodo, Plus, RefreshCw, GripVertical, ChevronUp, ChevronDown } from 'lucide-react';
import { collection, query, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { BudgetCard } from './BudgetCard';
import { BudgetDetailView } from './BudgetDetailView';
import { BudgetConfigModal } from './BudgetConfigModal';
import { MASTER_CATEGORIES } from '../lib/constants';
import { useTranslation } from '@/lib/i18n';
import { isTxMatchingBudget, isTxMatchingBudgetOrUnallocated, isTxCalculatedInOtherBudgets, getUnallocatedCategoriesAndSubcategories, isIgnoredForUnallocated } from '../lib/transactionUtils';

interface BudgetsProps {
  profile: any;
}

export const Budgets: React.FC<BudgetsProps> = ({ profile }) => {
  const { t } = useTranslation();
  const [envelopes, setEnvelopes] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBudget, setSelectedBudget] = useState<any | null>(null);
  const [editingBudget, setEditingBudget] = useState<any | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const lastReorderTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!profile?.uid) return;
    setLoading(true);

    const bQuery = query(collection(db, 'users', profile.uid, 'miniBudgets'));
    const unsubscribeBudgets = onSnapshot(bQuery, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() });
      });

      if (Date.now() - lastReorderTimeRef.current < 2000 && envelopes.length === list.length) {
        const idMap = new Map(list.map(item => [item.id, item]));
        const merged = envelopes.map(env => idMap.get(env.id) || env);
        list.forEach(item => {
          if (!merged.some(m => m.id === item.id)) {
            merged.push(item);
          }
        });
        setEnvelopes(merged);
      } else {
        list.sort((a, b) => {
          const orderA = typeof a.order === 'number' ? a.order : 999;
          const orderB = typeof b.order === 'number' ? b.order : 999;
          return orderA - orderB;
        });
        setEnvelopes(list);
      }
      setLoading(false);
    }, (err) => {
      console.error("Failed synchronization pipeline inside budget sheets:", err);
      setLoading(false);
    });

    const txQuery = query(collection(db, 'users', profile.uid, 'transactions'));
    const unsubscribeTx = onSnapshot(txQuery, (snapshot) => {
      const txs: any[] = [];
      snapshot.forEach(doc => {
        txs.push({ id: doc.id, ...doc.data() });
      });
      setTransactions(txs);
    }, (err) => {
      console.error("Failed synchronization pipeline for transactions:", err);
    });

    return () => {
      unsubscribeBudgets();
      unsubscribeTx();
    };
  }, [profile]);

  const saveNewOrder = async (reordered: any[]) => {
    lastReorderTimeRef.current = Date.now();
    setEnvelopes(reordered);
    if (!profile?.uid) return;
    try {
      await Promise.all(
        reordered.map((item, idx) =>
          updateDoc(doc(db, 'users', profile.uid, 'miniBudgets', item.id), { order: idx })
        )
      );
    } catch (err) {
      console.error("Failed to save budget order:", err);
    }
  };

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const updated = [...envelopes];
    const temp = updated[index];
    updated[index] = updated[index - 1];
    updated[index - 1] = temp;
    const reordered = updated.map((item, idx) => ({ ...item, order: idx }));
    saveNewOrder(reordered);
  };

  const handleMoveDown = (index: number) => {
    if (index >= envelopes.length - 1) return;
    const updated = [...envelopes];
    const temp = updated[index];
    updated[index] = updated[index + 1];
    updated[index + 1] = temp;
    const reordered = updated.map((item, idx) => ({ ...item, order: idx }));
    saveNewOrder(reordered);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) return;

    const updated = [...envelopes];
    const [movedItem] = updated.splice(draggedIndex, 1);
    updated.splice(targetIndex, 0, movedItem);

    const reordered = updated.map((item, idx) => ({ ...item, order: idx }));
    saveNewOrder(reordered);
    setDraggedIndex(null);
  };

  return (
    <div className="w-full max-w-[1200px] mx-auto px-[clamp(1rem,3vw,2rem)] py-6 box-border flex flex-col gap-6">
      
      {/* SUB-TAB ROUTING VIEWS CHANGER PANEL */}
      <div 
        className="w-full p-5 flex items-center justify-between select-none"
        style={{
          background: 'var(--glass-bg)',
          backdropFilter: 'var(--glass-blur)',
          border: 'var(--glass-border)',
          borderRadius: '24px'
        }}
      >
        <div className="flex items-center gap-2.5">
          <ListTodo size={18} className="text-[#A6DDB1]" />
          <div className="flex flex-col">
            <h4 className="text-sm font-bold text-white m-0 lowercase">{t('budgets.envelope_budget_pools')}</h4>
            <span className="text-[12px] text-neutral-400 font-medium mt-0.5">{t('budgets.automated_salary_breakdowns')} (Drag to reorder)</span>
          </div>
        </div>
        <button 
          onClick={() => window.dispatchEvent(new CustomEvent('open-add-tx-modal'))}
          className="px-4 py-2.5 rounded-full font-bold text-xs bg-[#A6DDB1] text-[#1E2229] transition-all hover:brightness-105 active:scale-95 cursor-pointer border-none flex items-center gap-1.5"
        >
          <Plus size={14} strokeWidth={2.5} />
          <span>{t('budgets.configure_target_envelope')}</span>
        </button>
      </div>

      {/* CORE CARDS WRAPPER CONTAINER */}
      {loading ? (
        <div className="py-20 text-center flex items-center justify-center gap-2 text-neutral-400 text-xs font-mono select-none">
          <RefreshCw size={14} className="animate-spin text-[#A6DDB1]" />
          <span>{t('budgets.syncing_active_constraints')}</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full box-border">


          {envelopes.map((budget, idx) => (
            <div
              key={budget.id}
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={(e) => handleDrop(e, idx)}
              className="relative group bg-white rounded-2xl overflow-hidden border border-neutral-100 shadow-sm cursor-grab active:cursor-grabbing"
            >
              <div className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-neutral-100 rounded-lg p-1 shadow-xs border border-neutral-200">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleMoveUp(idx); }}
                  disabled={idx === 0}
                  className="p-1 hover:bg-neutral-200 text-neutral-600 rounded disabled:opacity-30 cursor-pointer transition-colors"
                  title="Move Up"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleMoveDown(idx); }}
                  disabled={idx === envelopes.length - 1}
                  className="p-1 hover:bg-neutral-200 text-neutral-600 rounded disabled:opacity-30 cursor-pointer transition-colors"
                  title="Move Down"
                >
                  <ChevronDown size={14} />
                </button>
                <div 
                  draggable
                  onDragStart={(e) => handleDragStart(e, idx)}
                  className="p-1 text-neutral-600 cursor-grab active:cursor-grabbing hover:bg-neutral-200 rounded transition-colors flex items-center justify-center"
                  title="Drag to reorder"
                >
                  <GripVertical size={14} />
                </div>
              </div>
              <div className="p-1">
                <BudgetCard 
                  budget={{
                    ...budget,
                    allocatedAmount: budget.allocatedAmount || budget.limit || budget.maxBudget || 0,
                    title: budget.title || budget.category || t('budgets.envelope_limit')
                  }} 
                  spent={budget.spent || 0}
                  onCardClick={() => setSelectedBudget(budget)} 
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL CONTAINER INNER INTERCEPT VIEW LAYER */}
      <AnimatePresence>
        {selectedBudget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 box-border">
            <div className="absolute inset-0 bg-[#1E2229]/80 backdrop-blur-md" onClick={() => setSelectedBudget(null)} />
            <motion.div 
              initial={{ opacity: 0, scale: 0.97, y: 15 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.97, y: 15 }}
              className="relative w-full max-w-[500px] bg-[#1E2229] border border-white/10 rounded-3xl p-6 box-border max-h-[90vh] overflow-y-auto container-scroll-patch shadow-2xl"
            >
              <BudgetDetailView 
                budget={selectedBudget} 
                transactions={transactions} 
                accounts={[]} 
                uid={profile.uid} 
                allBudgets={envelopes}
                onBack={() => setSelectedBudget(null)} 
                onEdit={() => {
                  if (selectedBudget && !selectedBudget.isUnallocated) {
                    setEditingBudget(selectedBudget);
                    setSelectedBudget(null);
                  }
                }} 
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <BudgetConfigModal 
        isOpen={editingBudget !== null}
        onClose={() => setEditingBudget(null)}
        profile={profile}
        editingBudget={editingBudget}
        effectiveCategories={MASTER_CATEGORIES}
      />
    </div>
  );
};