import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface StreakAnimationProps {
  streak: number;
  isBonusStreak?: boolean;
  onComplete: () => void;
  rewardNotification?: any;
}

export const StreakAnimation: React.FC<StreakAnimationProps> = ({ streak, isBonusStreak, onComplete, rewardNotification }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete();
    }, 2000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 1.2 }}
        transition={{ duration: 0.15 }}
        className={`fixed inset-0 z-[9999] flex items-center justify-center ${isBonusStreak ? 'bg-amber-600/95' : 'bg-emerald-600/95'} backdrop-blur-sm`}
      >
        {isBonusStreak && (
          <motion.div
            className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-yellow-300/40 via-transparent to-transparent"
            animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
        <div className="flex flex-col items-center justify-center text-white p-6 text-center z-10">
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="text-9xl font-bold mb-4"
          >
            {streak}
          </motion.div>
          <div className="text-3xl font-bold">{isBonusStreak ? 'Milestone Reached!' : 'Day Streak!'}</div>
          {isBonusStreak && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.25, duration: 0.2 }}
              className="mt-6 p-4 bg-white/20 rounded-2xl text-2xl font-bold"
            >
              {rewardNotification ? `Free ${rewardNotification.title}` : 'Reward Unlocked!'}
            </motion.div>
          )}
          <div className="mt-4 text-xl">{isBonusStreak ? 'Congratulations!' : 'Keep it up!'}</div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
