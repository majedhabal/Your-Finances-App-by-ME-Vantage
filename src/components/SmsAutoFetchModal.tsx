import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, MessageSquare, ShieldCheck, Check } from 'lucide-react';
import { ParsedTransaction } from '../lib/smsParser';

interface SmsAutoFetchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onParsedTransactionSelect: (tx: ParsedTransaction) => void;
}

export const SmsAutoFetchModal: React.FC<SmsAutoFetchModalProps> = ({
  isOpen, onClose
}) => {
  const [hasPermission, setHasPermission] = useState<boolean>(() => {
    return localStorage.getItem('vantage_sms_permission_granted') === 'true';
  });
  const [autoOpen, setAutoOpen] = useState<boolean>(() => {
    return localStorage.getItem('vantage_sms_auto_open') !== 'false';
  });

  if (!isOpen) return null;

  const handleRequestPermission = () => {
    localStorage.setItem('vantage_sms_permission_granted', 'true');
    setHasPermission(true);
  };

  const handleRevokePermission = () => {
    localStorage.setItem('vantage_sms_permission_granted', 'false');
    setHasPermission(false);
  };

  const handleToggleAutoOpen = (val: boolean) => {
    setAutoOpen(val);
    localStorage.setItem('vantage_sms_auto_open', val ? 'true' : 'false');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-lg overflow-hidden text-gray-800"
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">SMS Transaction Auto-Fetch</h2>
              <p className="text-sm text-gray-500 font-normal">Automatic bank notification reading & smart parsing</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6">
          
          {!hasPermission ? (
            <div className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-5 space-y-4">
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-emerald-900">Google Play Privacy Compliance & SMS Permission</h3>
                  <p className="text-xs text-emerald-800 mt-1 font-normal leading-relaxed">
                    To automatically capture expenses and income from your bank SMS notifications (ADCB, Emirates NBD, FAB, DIB, etc.), the app requires Android <code className="bg-emerald-100/80 px-1 py-0.5 rounded font-mono text-emerald-900">READ_SMS</code> permission. 
                  </p>
                  <p className="text-xs text-emerald-800 mt-2 font-normal leading-relaxed">
                    <strong>100% On-Device Privacy:</strong> SMS data is parsed entirely locally on your device. Messages are never transmitted or uploaded to any external servers.
                  </p>
                </div>
              </div>
              <div className="pt-2 flex justify-end">
                <button
                  onClick={handleRequestPermission}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition-all shadow-xs flex items-center space-x-2"
                >
                  <Check className="w-4 h-4" />
                  <span>Grant SMS Reading Permission</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                  <div>
                    <p className="text-sm font-bold text-emerald-900">SMS Foreground Listener Active</p>
                    <p className="text-xs text-emerald-700 font-normal">Automatically reading incoming bank SMS and opening transaction window</p>
                  </div>
                </div>
                <button
                  onClick={handleRevokePermission}
                  className="text-xs text-gray-500 hover:text-red-600 font-bold underline"
                >
                  Revoke Permission
                </button>
              </div>

              <div className="pt-3 border-t border-emerald-200/60">
                <label className="text-xs font-bold text-emerald-900 flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoOpen}
                    onChange={(e) => handleToggleAutoOpen(e.target.checked)}
                    className="rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                  />
                  <span>Auto-open transaction window on incoming bank SMS</span>
                </label>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <p className="text-xs text-gray-400 font-normal">
            Compliant with Google Play sensitive SMS permissions policy.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-xl text-xs transition-colors"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
};
