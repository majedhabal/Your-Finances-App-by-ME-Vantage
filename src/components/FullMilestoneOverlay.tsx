import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy } from 'lucide-react';

interface FullMilestoneOverlayProps {
  reward: any;
  onClose: () => void;
}

export const FullMilestoneOverlay: React.FC<FullMilestoneOverlayProps> = ({ reward, onClose }) => {
  const isBadge = reward?.type === 'badge';

  const handleAction = () => {
    if (isBadge) {
      window.dispatchEvent(new CustomEvent('open-badges-modal'));
    }
    onClose();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] bg-gradient-to-br from-amber-500 to-orange-600 flex flex-col items-center justify-center p-6 text-white"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center max-w-sm w-full bg-white/10 backdrop-blur-md p-8 rounded-3xl border border-white/20 shadow-2xl flex flex-col items-center"
        >
          {isBadge ? (
            <>
              {reward.image && (
                <motion.img 
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', damping: 12, stiffness: 100 }}
                  src={reward.image} 
                  alt={reward.title} 
                  className="w-36 h-36 object-contain mb-6 drop-shadow-2xl" 
                />
              )}
              <div className="flex items-center gap-2 text-amber-200 font-semibold text-sm mb-2 uppercase tracking-wider">
                <Trophy size={16} /> Milestone Badge Unlocked
              </div>
              <h2 className="text-2xl font-bold font-['Google_Sans'] mb-4">{reward.title}</h2>
              <p className="text-white/90 text-sm mb-8 font-['Google_Sans'] leading-relaxed">
                You have achieved a magnificent milestone! This badge is now permanently added to your profile.
              </p>
            </>
          ) : (
            <>
              {reward.streakThreshold && (
                <div className="text-6xl font-bold mb-2 text-amber-200">{reward.streakThreshold}</div>
              )}
              <div className="text-2xl font-bold mb-4">Milestone Reached!</div>
              <div className="bg-white/20 p-6 rounded-2xl mb-8 w-full">
                <div className="text-sm font-semibold text-amber-200 uppercase tracking-wider mb-1">Reward Unlocked</div>
                <div className="text-xl font-bold">{reward.title}</div>
              </div>
            </>
          )}

          <button 
            onClick={handleAction} 
            className="w-full py-3.5 bg-white text-orange-600 font-bold rounded-2xl hover:bg-orange-50 transition-all shadow-lg active:scale-95 font-['Google_Sans']"
          >
            {isBadge ? 'Awesome, View Badges' : 'Claim Reward'}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
