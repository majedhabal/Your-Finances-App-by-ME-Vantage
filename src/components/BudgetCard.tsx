import React from 'react';
import { motion } from 'motion/react';
import { Plus, Trash2, Home, Utensils, Car, Film, ShoppingBag, HelpCircle, GripVertical } from 'lucide-react';
import { triggerHaptic, hapticPresets } from '../lib/haptics';
import { useTranslation } from '@/lib/i18n';

import { formatLabel, translateCategoryOrSubcategory } from '../lib/stringUtils';

export interface BudgetCategory {
  id: string;
  budgetId?: string;
  title?: string;
  name?: string;
  categoryTitle?: string;
  allocatedAmount?: number;
  currency: string;
  category?: string;
  subcategory?: string | null;
  categoryGroup?: 'needs' | 'wants' | 'savings' | string;
  emoji?: string;
  iconAsset?: string;
  spentAmount?: number;
  spent?: number;
  period?: 'daily' | 'weekly' | 'monthly';
  lastHistorySnapshotDate?: any;
  createdAt?: any;
  isUnallocated?: boolean;
}

interface BudgetCardProps {
  budget: BudgetCategory;
  spent?: number;
  compact?: boolean;
  onCardClick?: () => void;
  onPlusClick?: (e: React.MouseEvent) => void;
  onDeleteClick?: (e: React.MouseEvent) => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  showDragHandle?: boolean;
  dragHandleProps?: any;
  uiOverrides?: {
    container?: string;
    headerContainer?: string;
    iconContainer?: string;
    title?: string;
    category?: string;
    valuesContainer?: string;
    amount?: string;
    usage?: string;
    actionButtons?: string;
    progressBarContainer?: string;
    progressBarFill?: string;
  };
}

const getCategoryIcon = (category: string) => {
  const cat = (category || '').toLowerCase();
  if (cat.includes('house') || cat.includes('housing') || cat.includes('rent') || cat.includes('home') || cat.includes('utilities')) {
    return Home;
  }
  if (cat.includes('food') || cat.includes('drink') || cat.includes('grocery') || cat.includes('groceries') || cat.includes('supermarket') || cat.includes('dining') || cat.includes('restaurant')) {
    return Utensils;
  }
  if (cat.includes('transport') || cat.includes('car') || cat.includes('vehicle') || cat.includes('fuel') || cat.includes('gas') || cat.includes('commute')) {
    return Car;
  }
  if (cat.includes('entertainment') || cat.includes('movie') || cat.includes('sub') || cat.includes('netflix') || cat.includes('leisure') || cat.includes('spotify') || cat.includes('play')) {
    return Film;
  }
  if (cat.includes('shopping') || cat.includes('bag') || cat.includes('clothes') || cat.includes('clothing') || cat.includes('electronics')) {
    return ShoppingBag;
  }
  return HelpCircle;
};

export const BudgetCard: React.FC<BudgetCardProps> = ({
  budget,
  spent,
  compact = false,
  onCardClick,
  onPlusClick,
  onDeleteClick,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  showDragHandle,
  dragHandleProps,
  uiOverrides,
}) => {
  const { t } = useTranslation();
  // Extract fields aligning with exact payload
  const maxLimit = budget.allocatedAmount || 1;
  const spentVal = spent !== undefined ? spent : (budget.spentAmount !== undefined ? budget.spentAmount : (budget.spent || 0));
  const ratio = maxLimit > 0 ? spentVal / maxLimit : 0;
  const progress = Math.min(ratio * 100, 100);
  const isOver = spentVal > maxLimit;
  
  const progressColor = isOver 
    ? 'bg-rose-500' 
    : progress >= 90 
      ? 'bg-red-500' 
      : progress >= 80 
        ? 'bg-amber-400' 
        : 'bg-[#A6DDB1]';
  
  const rawTitle = budget.title 
    ? budget.title 
    : (budget.name 
        ? budget.name 
        : (budget.categoryTitle 
            ? (budget.categoryTitle.includes(' > ') ? budget.categoryTitle.split(' > ').pop()?.trim() : budget.categoryTitle)
            : (budget.subcategory || budget.category)));

  const titleText = rawTitle 
    ? translateCategoryOrSubcategory(rawTitle, t) 
    : t('budget_card.allocation', 'Allocation');
     
  const IconComponent = getCategoryIcon(String(rawTitle || titleText));

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={{ scale: 0.98 }}
      onClick={onCardClick}
      draggable={draggable}
      onDragStart={onDragStart as any}
      onDragOver={onDragOver as any}
      onDrop={onDrop as any}
      style={{ fontFamily: "'Google Sans', sans-serif" }}
      className={uiOverrides?.container || "p-4 bg-white rounded-2xl border border-[#E1E8ED] hover:border-[#366945]/40 transition-all shadow-sm cursor-pointer group relative"}
    >
      <div className="flex justify-between items-start gap-3 mb-2">
        {/* Icon & Title Information */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {showDragHandle && (
            <div 
              {...dragHandleProps}
              className="text-neutral-400 hover:text-neutral-700 cursor-grab active:cursor-grabbing p-0.5 flex items-center justify-center shrink-0 select-none -ml-1"
              title={t('common.drag_to_reorder', 'Drag to reorder')}
            >
              <GripVertical size={16} />
            </div>
          )}
          <div className={uiOverrides?.iconContainer || "w-9 h-9 rounded-xl bg-[#E8F8EE] flex items-center justify-center text-[#366945] shrink-0 group-hover:scale-105 transition-all"}>
            <IconComponent size={18} />
          </div>
          <div className="min-w-0 flex-1 pr-1">
            <div className={uiOverrides?.title || "text-sm font-bold text-[#111C2D] truncate"} style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}>
              {titleText}
            </div>
            <div className={uiOverrides?.usage || "text-[12px] text-gray-500 font-normal mt-0.5"} style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 400 }}>
              {progress.toFixed(0)}% {t('budget_card.used', 'Used')}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className={uiOverrides?.actionButtons || "flex items-center gap-1.5 shrink-0"} onClick={(e) => e.stopPropagation()}>
          {onPlusClick && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                triggerHaptic(hapticPresets.medium);
                onPlusClick(e);
              }}
              className="p-2 rounded-xl text-[#366945] bg-[#E8F8EE] hover:bg-[#366945] hover:text-white transition-all shadow-xs hover:shadow-md cursor-pointer border-none flex items-center justify-center shrink-0 scale-100 hover:scale-105 active:scale-95"
              title="Add transaction"
            >
              <Plus size={16} />
            </button>
          )}
          {onDeleteClick && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteClick(e);
              }}
              className="p-1.5 rounded-lg text-rose-500 bg-rose-50 hover:bg-rose-100 hover:text-rose-700 transition-all cursor-pointer border-none flex items-center justify-center shrink-0"
              title="Delete budget"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Amount display above the progress bar */}
      <div className="flex justify-between items-baseline mb-1.5 px-0.5">
        <span className="text-[11px] text-gray-400 font-normal" style={{ fontFamily: "'Google Sans', sans-serif" }}>
          {budget.isUnallocated ? t('budgets.total_expenses', 'Total Expenses') : t('budget_card.amount_spent', 'Spent / Limit')}
        </span>
        <div className={`${uiOverrides?.amount || "text-xs font-bold text-[#111C2D]"} privacy-balance`} style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700 }}>
          {budget.isUnallocated ? (
            <span>{budget.currency || 'AED'} {spentVal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
          ) : (
            <span>
              {budget.currency || 'AED'} {spentVal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} <span className="text-gray-400 font-normal">/ {budget.currency || 'AED'} {maxLimit.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
            </span>
          )}
        </div>
      </div>

      {/* Progress slider bar */}
      {!budget.isUnallocated && (
        <div className={uiOverrides?.progressBarContainer || "w-full h-1.5 bg-neutral-100 rounded-full overflow-hidden mb-2"}>
          <div 
            style={{ width: `${progress}%` }}
            className={uiOverrides?.progressBarFill || `h-full rounded-full transition-all duration-500 ${progressColor}`}
          />
        </div>
      )}

      {!budget.isUnallocated ? (
        <div className="flex justify-between items-center text-[12px] font-bold text-[#366945]">
          <span style={{ fontFamily: "'Google Sans', sans-serif" }}>{progress.toFixed(0)}% {t('budget_card.reached', 'used')}</span>
          <span className="text-gray-400 font-normal group-hover:text-[#366945] transition-colors text-[11px]" style={{ fontFamily: "'Google Sans', sans-serif" }}>
            {t('budget_card.tap_details', 'Tap to view details →')}
          </span>
        </div>
      ) : (
        <div className="flex justify-end items-center text-[12px]">
          <span className="text-gray-400 font-normal group-hover:text-[#366945] transition-colors text-[11px]" style={{ fontFamily: "'Google Sans', sans-serif" }}>
            {t('budget_card.tap_details', 'Tap to view details →')}
          </span>
        </div>
      )}
    </motion.div>
  );
};

