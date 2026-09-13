import React from 'react';

interface VantageVoiceAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  uid: string;
  accounts: any[];
  transactions: any[];
  accountBalances: Record<string, number>;
  profile: any;
  onNavigateTab?: (tab: 'essentials' | 'accounts' | 'analytics' | 'activity' | 'settings' | 'ai') => void;
  onOpenModal?: (modal: 'transaction' | 'account' | 'goal') => void;
}

export const VantageVoiceAssistant: React.FC<VantageVoiceAssistantProps> = () => {
  return null;
};
