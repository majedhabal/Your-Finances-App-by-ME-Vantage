import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, ArrowRight, X } from 'lucide-react';

interface EditRecurringScopeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectScope: (scope: 'only_this' | 'future') => void;
  isLoading?: boolean;
}

export const EditRecurringScopeModal: React.FC<EditRecurringScopeModalProps> = ({
  isOpen,
  onClose,
  onSelectScope,
  isLoading = false
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm"
      />
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 15 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 15 }}
        className="relative w-full max-w-md bg-white border border-neutral-200 rounded-2xl shadow-xl overflow-hidden flex flex-col p-6"
        style={{ fontFamily: "'Google Sans', sans-serif" }}
      >
        <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-neutral-100 text-neutral-700 flex items-center justify-center">
              <RefreshCw size={18} />
            </div>
            <h3 className="text-base font-bold text-neutral-900">
              Do you want to edit this transaction only? or future transactions?
            </h3>
          </div>
          <button 
            onClick={onClose}
            className="p-2 bg-neutral-100 hover:bg-neutral-200 rounded-xl transition-colors text-neutral-500"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-3.5 my-5">
          <button
            onClick={() => onSelectScope('only_this')}
            disabled={isLoading}
            className="w-full text-left p-4 rounded-xl border border-neutral-200 hover:border-neutral-400 bg-white hover:bg-neutral-50 transition-all flex flex-col gap-1 group active:scale-[0.99] disabled:opacity-50 cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-neutral-900 group-hover:text-emerald-700">
                1. Only this transaction
              </span>
              <ArrowRight size={16} className="text-neutral-400 group-hover:translate-x-0.5 transition-transform" />
            </div>
            <p className="text-xs text-neutral-500 font-normal leading-relaxed">
              This will only affect the current recurring transaction and NOT the future recurring transactions.
            </p>
          </button>

          <button
            onClick={() => onSelectScope('future')}
            disabled={isLoading}
            className="w-full text-left p-4 rounded-xl border border-neutral-200 hover:border-neutral-400 bg-white hover:bg-neutral-50 transition-all flex flex-col gap-1 group active:scale-[0.99] disabled:opacity-50 cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-neutral-900 group-hover:text-emerald-700">
                2. Future transactions
              </span>
              <ArrowRight size={16} className="text-neutral-400 group-hover:translate-x-0.5 transition-transform" />
            </div>
            <p className="text-xs text-neutral-500 font-normal leading-relaxed">
              This will affect the current transaction and all future associated transactions.
            </p>
          </button>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-2 text-xs text-neutral-500">
            <RefreshCw size={14} className="animate-spin" />
            <span>Processing update...</span>
          </div>
        )}
      </motion.div>
    </div>
  );
};
