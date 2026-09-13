import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { BADGES } from '../lib/badgeUtils';
import { useTranslation } from '@/lib/i18n';

interface BadgesModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentStreak: number;
  profile?: any;
}

export const BadgesModal: React.FC<BadgesModalProps> = ({ isOpen, onClose, currentStreak, profile }) => {
  const { t } = useTranslation();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold font-['Google_Sans'] text-neutral-900">{t('badges_modal.your_badges', 'Your Badges')}</h2>
              <button onClick={onClose} className="p-1 rounded-full hover:bg-neutral-100">
                <X size={20} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {BADGES.map((badge) => {
                const hasBadgeInProfile = profile?.badges?.includes(badge.id) || profile?.claimedRewards?.includes(`badge_${badge.id}`);
                const isUnlocked = currentStreak >= badge.threshold || hasBadgeInProfile;
                const badgeTitle = t(`badges_modal.${badge.id}_badge`, badge.title);
                return (
                  <div key={badge.id} className="flex flex-col items-center gap-2 p-3 rounded-xl border border-neutral-100 bg-neutral-50/50">
                    <img 
                      src={badge.image} 
                      alt={badgeTitle} 
                      className={`w-20 h-20 object-contain transition-transform duration-300 hover:scale-105 ${isUnlocked ? '' : 'grayscale opacity-50'}`}
                    />
                    <span className={`text-xs font-['Google_Sans'] ${isUnlocked ? 'text-neutral-900 font-bold' : 'text-neutral-400'}`}>
                      {badgeTitle}
                    </span>
                    <span className="text-[10px] text-neutral-400">
                      {isUnlocked ? t('badges_modal.unlocked', 'Unlocked') : t('badges_modal.days_streak', { count: badge.threshold })}
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
