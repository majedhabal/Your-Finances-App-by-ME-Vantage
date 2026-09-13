import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { ShouldIBuyThis } from './ShouldIBuyThis';

interface ShouldIBuyThisModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: any;
  accounts?: any[];
  transactions?: any[];
  accountBalances?: Record<string, number>;
  onUpdateProfile?: (profile: any) => void;
}

export const ShouldIBuyThisModal: React.FC<ShouldIBuyThisModalProps> = ({
  isOpen,
  onClose,
  profile,
  accounts = [],
  transactions = [],
  accountBalances = {},
  onUpdateProfile
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-2xl bg-white border border-neutral-200 rounded-3xl p-4 sm:p-6 shadow-2xl overflow-hidden my-auto"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-500 hover:text-neutral-800 flex items-center justify-center transition-all z-20 cursor-pointer"
          >
            <X size={18} />
          </button>

          {/* Embedded Should I Buy This component */}
          <ShouldIBuyThis
            profile={profile}
            accounts={accounts}
            transactions={transactions}
            accountBalances={accountBalances}
            isEmbedded={false}
            onClose={onClose}
            onUpdateProfile={onUpdateProfile}
          />
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
