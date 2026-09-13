import React, { useState, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n';
import { motion, AnimatePresence } from 'motion/react';
import { X, Wallet, Building2 as BankIcon, Landmark, CreditCard, HandCoins, Home, ChevronRight, Check, Plus } from 'lucide-react';
import { collection, serverTimestamp, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { useVantageActions } from '../hooks/useVantageActions';
import { evaluateMathExpression } from '../lib/constants';

interface AddAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  uid: string;
  onAccountAdded: () => void;
  profile?: any;
}

type AccountType = 'cash' | 'bank' | 'investment' | 'credit' | 'loan' | 'mortgage';

interface GlassInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  focused: boolean;
  prefixElement?: React.ReactNode;
}

const GlassInput: React.FC<GlassInputProps> = ({ label, focused, prefixElement, className, style, ...props }) => {
  return (
    <div className="w-full flex flex-col gap-1.5">
      <label 
        style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 'clamp(0.9rem, 2vw, 1.05rem)', fontWeight: 400, color: '#1E2229' }} 
        className="px-1 text-left"
      >
        {label}
      </label>
      <div 
        style={{
          display: 'flex',
          alignItems: 'center',
          background: '#FFFFFF',
          borderRadius: '12px',
          border: focused ? '1.5px solid #A6DDB1' : '1px solid rgba(30, 34, 41, 0.08)',
          boxShadow: focused ? '0 0 8px rgba(166, 221, 177, 0.3)' : 'none',
          padding: '0 1rem',
          transition: 'all 0.2s ease',
          outline: 'none',
          fontFamily: "'Google Sans', sans-serif",
          color: '#1E2229',
          width: '100%',
        }}
        className="h-12 min-h-[48px]"
      >
        {prefixElement && (
          <div className="flex items-center shrink-0 pr-2 border-r border-vantage-text/10 mr-2 select-none">
            {prefixElement}
          </div>
        )}
        <input
          {...props}
          style={{
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontSize: 'clamp(1.05rem, 2.5vw, 1.25rem)',
            fontWeight: 500,
            color: '#1E2229',
            fontFamily: "'Google Sans', sans-serif",
            width: '100%',
            padding: '0',
            ...style,
          }}
        />
      </div>
    </div>
  );
};

interface GlassSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  focused: boolean;
}

const GlassSelect: React.FC<GlassSelectProps> = ({ label, focused, children, style, ...props }) => {
  return (
    <div className="w-full flex flex-col gap-1.5">
      <label 
        style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 'clamp(0.9rem, 2vw, 1.05rem)', fontWeight: 400, color: '#1E2229' }} 
        className="px-1 text-left"
      >
        {label}
      </label>
      <div style={{ position: 'relative', width: '100%' }}>
        <select
          {...props}
          style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            border: focused ? '1.5px solid #A6DDB1' : '1px solid rgba(30, 34, 41, 0.08)',
            boxShadow: focused ? '0 0 8px rgba(166, 221, 177, 0.3)' : 'none',
            padding: '1rem',
            paddingRight: '2.5rem',
            fontSize: 'clamp(1.05rem, 2.5vw, 1.25rem)',
            fontWeight: 500,
            color: '#1E2229',
            transition: 'all 0.2s ease',
            outline: 'none',
            fontFamily: "'Google Sans', sans-serif",
            width: '100%',
            appearance: 'none',
            cursor: 'pointer',
            ...style,
          }}
        >
          {children}
        </select>
        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-vantage-muted">
          <ChevronRight size={16} className="rotate-90 text-[#1E2229]" />
        </div>
      </div>
    </div>
  );
};

export const AddAccountModal: React.FC<AddAccountModalProps> = ({ isOpen, onClose, uid, onAccountAdded, profile }) => {
  const { t } = useTranslation();
  const { createAccount } = useVantageActions(uid);
  const [step, setStep] = useState<'type' | 'details'>('type');
  const [selectedType, setSelectedType] = useState<AccountType | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Form Fields
  const [name, setName] = useState('');
  const [startingBalance, setStartingBalance] = useState('');
  const [currency, setCurrency] = useState('AED');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [interestRate, setInterestRate] = useState('');
  
  useEffect(() => {
    if (isOpen) {
      setCurrency(profile?.baseCurrency || profile?.currency || 'AED');
      document.body.classList.add('hide-header-footer');
    } else {
      document.body.classList.remove('hide-header-footer');
    }
    window.dispatchEvent(new CustomEvent('account-modal-toggled', { detail: { isOpen } }));
    return () => {
      document.body.classList.remove('hide-header-footer');
      window.dispatchEvent(new CustomEvent('account-modal-toggled', { detail: { isOpen: false } }));
    };
  }, [isOpen, profile]);
  
  // New Fields
  const [totalGainLoss, setTotalGainLoss] = useState('');
  const [includeInLiquidity, setIncludeInLiquidity] = useState(true);
  const [creditLimit, setCreditLimit] = useState('');
  const [paymentDueDate, setPaymentDueDate] = useState('');
  const [recurringProtocol, setRecurringProtocol] = useState('');
  
  // Bank Account Specific Fields
  const [bankAccountType, setBankAccountType] = useState<'Checking' | 'Savings'>('Checking');
  const [minBalanceFloor, setMinBalanceFloor] = useState('');
  const [defaultTransferFee, setDefaultTransferFee] = useState('');

  // Sub-Assets for Investment removed
  const [platformFees, setPlatformFees] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const accountTypes = [
    { id: 'bank', label: t('add_account.bank_account'), icon: BankIcon, desc: t('add_account.bank_account_desc') },
    { id: 'cash', label: t('add_account.cash_account'), icon: Wallet, desc: t('add_account.cash_account_desc') },
    { id: 'credit', label: t('add_account.credit_card'), icon: CreditCard, desc: t('add_account.credit_card_desc') },
    { id: 'investment', label: t('add_account.investment_portfolio'), icon: Landmark, desc: t('add_account.investment_portfolio_desc') },
  ];

  const handleSelectType = (type: any) => {
    setSelectedType(type.id);
    setStep('details');
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedType) return;

    const isFree = !profile?.subscriptionTier || profile?.subscriptionTier?.toLowerCase() === 'free';
    if (isFree) {
      try {
        const accountsSnapshot = await getDocs(collection(db, 'users', uid, 'accounts'));
        if (accountsSnapshot.size >= 2) {
          setErrorMessage("FREE LIMIT EXCEEDED: Free tier users can only create up to 2 accounts. Please upgrade to unlock unlimited accounts.");
          window.dispatchEvent(new CustomEvent('trigger-premium-modal'));
          return;
        }
      } catch (err) {
        console.error("Failed to check accounts limit:", err);
      }
    }
    
    setErrorMessage(null);
    setIsLoading(true);
    try {
      let parsedStartingBalance = parseFloat(evaluateMathExpression(startingBalance));
      if (['loan', 'mortgage', 'credit'].includes(selectedType || '')) {
        parsedStartingBalance = -Math.abs(parsedStartingBalance);
      }

      const accountData: any = {
        name,
        type: selectedType,
        startingBalance: 0, // permanently locked at 0
        initialStartingBalance: parsedStartingBalance, // Pass to createAccount to handle atomically
        currency,
        createdAt: serverTimestamp(),
      };

      if (selectedType === 'cash') {
        accountData.atmAutoSync = false;
        accountData.dailySpendReminder = false;
      }

      if (selectedType === 'bank') {
        accountData.bankAccountNumber = bankAccountNumber;
        accountData.interestRate = parseFloat(evaluateMathExpression(interestRate)) || 0;
        accountData.bankAccountType = bankAccountType;
        accountData.minBalanceFloor = parseFloat(evaluateMathExpression(minBalanceFloor)) || 0;
        accountData.defaultTransferFee = parseFloat(evaluateMathExpression(defaultTransferFee)) || 0;
      }

      if (selectedType === 'investment') {
        accountData.totalGainLoss = parseFloat(evaluateMathExpression(totalGainLoss)) || 0;
        accountData.includeInLiquidity = includeInLiquidity;
        accountData.platformFees = parseFloat(evaluateMathExpression(platformFees)) || 0;
      }

      if (selectedType === 'credit') {
        accountData.creditLimit = parseFloat(evaluateMathExpression(creditLimit)) || 0;
        accountData.paymentDueDate = paymentDueDate;
      }

      if (selectedType === 'loan' || selectedType === 'mortgage') {
        accountData.interestRate = parseFloat(evaluateMathExpression(interestRate)) || 0;
        accountData.recurringProtocol = recurringProtocol;
      }
      
      await createAccount(accountData);

      onAccountAdded();
      handleClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${uid}/accounts`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setStep('type');
    setSelectedType(null);
    setName('');
    setStartingBalance('');
    setCurrency(profile?.baseCurrency || profile?.currency || 'AED');
    setBankAccountNumber('');
    setInterestRate('');
    setTotalGainLoss('');
    setPlatformFees('');
    setIncludeInLiquidity(true);
    setCreditLimit('');
    setPaymentDueDate('');
    setRecurringProtocol('');
    setBankAccountType('Checking');
    setMinBalanceFloor('');
    setDefaultTransferFee('');
    onClose();
  };

  const baseCurrency = profile?.baseCurrency || profile?.currency || 'AED';
  const enabledCurrencies = profile?.enabledCurrencies || [];
  const isFree = !profile?.subscriptionTier || profile?.subscriptionTier?.toLowerCase() === 'free';
  const currencies = isFree ? [baseCurrency] : Array.from(new Set([baseCurrency, ...enabledCurrencies]));

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] overflow-y-auto overflow-x-hidden">
          <div className="min-h-full w-full flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleClose}
              className="fixed inset-0 bg-[#1E2229]/60 backdrop-blur-[6px]"
            />
            
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ duration: 0.15 }}
              style={{
                fontFamily: "'Google Sans', sans-serif",
                background: '#FFFFFF',
                borderRadius: '24px',
                border: '1px solid rgba(0, 0, 0, 0.08)',
              }}
              className="relative w-full max-w-[92%] md:max-w-[420px] shadow-2xl"
            >
              <div className="p-6 md:p-8 flex flex-col gap-6">
              <div className="flex justify-between items-start">
                <div className="flex flex-col gap-1 animate-none">
                  <h3 style={{ fontFamily: "'Google Sans', sans-serif", fontSize: '24px', color: '#111c2d' }} className="font-bold tracking-tight">
                    {step === 'type' ? t('add_account.define_identity') : t('add_account.account_details')}
                  </h3>
                  <p style={{ fontFamily: "'Google Sans', sans-serif", fontSize: '15px', color: '#6b7280' }} className="font-normal">
                    {step === 'type' ? t('add_account.select_source') : t(`add_account.${selectedType}_configuration`)}
                  </p>
                </div>
                <button onClick={handleClose} className="p-1 hover:bg-gray-100 rounded-full transition-colors cursor-pointer">
                  <X size={24} className="text-[#111c2d]" />
                </button>
              </div>

              {step === 'type' ? (
                <div className="flex flex-col gap-3.5 w-full animate-none">
                  {accountTypes.map((type) => (
                    <button
                      key={type.id}
                      onClick={() => handleSelectType(type)}
                      style={{ 
                        fontFamily: "'Google Sans', sans-serif",
                        background: '#F9FAFB',
                        borderRadius: '16px',
                        border: '1px solid rgba(0, 0, 0, 0.06)',
                      }}
                      className="group w-full flex items-center justify-between p-4 hover:border-[#A6DDB1] hover:bg-white transition-all text-left"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-[#E8F1FF] flex items-center justify-center shrink-0 transition-colors">
                          <type.icon className="text-[#366945] shrink-0" size={24} />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span 
                            style={{ fontFamily: "'Google Sans', sans-serif", fontSize: '16px' }} 
                            className="font-bold text-[#111c2d]"
                          >
                            {type.label}
                          </span>
                          <p 
                            style={{ fontFamily: "'Google Sans', sans-serif", fontSize: '13px' }} 
                            className="text-[#6b7280] font-normal"
                          >
                            {type.desc}
                          </p>
                        </div>
                      </div>
                      <ChevronRight size={18} className="text-gray-400 group-hover:text-[#111c2d] transition-colors" />
                    </button>
                  ))}
                </div>
              ) : (
                <form onSubmit={handleAddAccount} className="flex flex-col gap-5">
                  <div className="flex flex-col gap-4 w-full p-1">
                    {/* Account Label */}
                    <GlassInput
                      required
                      type="text"
                      label={t('add_account.account_label')}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t('add_account.placeholder_label')}
                      focused={focusedField === 'name'}
                      onFocus={() => setFocusedField('name')}
                      onBlur={() => setFocusedField(null)}
                    />

                    {/* Currency */}
                    <GlassSelect
                      label={t('add_account.currency')}
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      focused={focusedField === 'currency'}
                      onFocus={() => setFocusedField('currency')}
                      onBlur={() => setFocusedField(null)}
                    >
                      {currencies.map(c => <option key={c} value={c} className="bg-white text-black">{c}</option>)}
                    </GlassSelect>
                    {isFree && (
                      <span className="text-[11px] text-[#A0AEC0] font-normal mt-1 block">
                        {t('add_account.free_tier_restricted', { currency: baseCurrency })}
                      </span>
                    )}

                    {/* Starting Balance */}
                    <GlassInput
                      required
                      type="text"
                      label={t('add_account.starting_balance')}
                      value={startingBalance}
                      onChange={(e) => setStartingBalance(e.target.value.replace(/[^0-9+\-*/.()]/g, ''))}
                      onBlur={() => {
                        setStartingBalance(prev => evaluateMathExpression(prev));
                        setFocusedField(null);
                      }}
                      placeholder={t('add_account.placeholder_balance')}
                      prefixElement={
                        <span style={{ fontFamily: "'Google Sans', sans-serif" }} className="font-bold text-[#1E2229] select-none whitespace-nowrap">
                          {currency}
                        </span>
                      }
                      focused={focusedField === 'startingBalance'}
                      onFocus={() => setFocusedField('startingBalance')}
                    />

                    {selectedType === 'bank' && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="w-full flex flex-col gap-4 animate-none"
                      >
                        {/* Account Sub-Type */}
                        <div className="w-full flex flex-col gap-1.5 animate-none">
                           <label style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 'clamp(0.9rem, 2vw, 1.05rem)', fontWeight: 400, color: '#1E2229' }} className="px-1 text-left">
                             {t('add_account.sub_type')}
                           </label>
                           <div className="grid grid-cols-2 gap-3 w-full animate-none">
                              {['Checking', 'Savings'].map((tVal) => (
                                <button
                                  key={tVal}
                                  type="button"
                                  onClick={() => setBankAccountType(tVal as any)}
                                  style={{ 
                                    fontFamily: "'Google Sans', sans-serif",
                                    fontSize: 'clamp(1.05rem, 2.5vw, 1.25rem)',
                                    fontWeight: bankAccountType === tVal ? 700 : 400,
                                    background: bankAccountType === tVal ? '#A6DDB1' : 'rgba(255, 255, 255, 0.40)',
                                    border: bankAccountType === tVal ? '1.5px solid #A6DDB1' : '1px solid rgba(30, 34, 41, 0.08)',
                                    color: '#1E2229',
                                    boxShadow: bankAccountType === tVal ? '0 0 8px rgba(166, 221, 177, 0.3)' : 'none',
                                    borderRadius: '12px'
                                  }}
                                  className="h-12 min-h-[48px] transition-all active:scale-95 flex items-center justify-center cursor-pointer"
                                >
                                  {tVal === 'Checking' ? t('add_account.checking') : t('add_account.savings')}
                                </button>
                              ))}
                           </div>
                        </div>

                        {/* Bank Account Number */}
                        <GlassInput
                          label={t('add_account.iban')}
                          placeholder={t('add_account.placeholder_iban')}
                          value={bankAccountNumber}
                          onChange={(e) => setBankAccountNumber(e.target.value)}
                          focused={focusedField === 'bankAccountNumber'}
                          onFocus={() => setFocusedField('bankAccountNumber')}
                          onBlur={() => setFocusedField(null)}
                        />

                        {/* Interest Rate */}
                        <GlassInput
                          label={t('add_account.interest_rate')}
                          placeholder={t('add_account.placeholder_interest')}
                          value={interestRate}
                          onChange={(e) => setInterestRate(e.target.value.replace(/[^0-9+\-*/.()]/g, ''))}
                          onBlur={() => {
                            setInterestRate(prev => evaluateMathExpression(prev));
                            setFocusedField(null);
                          }}
                          prefixElement={<span style={{ fontFamily: "'Google Sans', sans-serif" }} className="font-bold text-[#1E2229]">%</span>}
                          focused={focusedField === 'interestRate'}
                          onFocus={() => setFocusedField('interestRate')}
                        />

                        {/* Min Balance Floor */}
                        <GlassInput
                          label={t('add_account.min_balance')}
                          placeholder={t('add_account.placeholder_min_balance')}
                          value={minBalanceFloor}
                          onChange={(e) => setMinBalanceFloor(e.target.value.replace(/[^0-9+\-*/.()]/g, ''))}
                          onBlur={() => {
                            setMinBalanceFloor(prev => evaluateMathExpression(prev));
                            setFocusedField(null);
                          }}
                          prefixElement={<span style={{ fontFamily: "'Google Sans', sans-serif" }} className="font-bold text-[#1E2229]">{currency}</span>}
                          focused={focusedField === 'minBalanceFloor'}
                          onFocus={() => setFocusedField('minBalanceFloor')}
                        />

                        {/* Default Transfer Fee */}
                        <GlassInput
                          label={t('add_account.transfer_fee')}
                          placeholder={t('add_account.placeholder_transfer_fee')}
                          value={defaultTransferFee}
                          onChange={(e) => setDefaultTransferFee(e.target.value.replace(/[^0-9+\-*/.()]/g, ''))}
                          onBlur={() => {
                            setDefaultTransferFee(prev => evaluateMathExpression(prev));
                            setFocusedField(null);
                          }}
                          prefixElement={<span style={{ fontFamily: "'Google Sans', sans-serif" }} className="font-bold text-[#1E2229]">{currency}</span>}
                          focused={focusedField === 'defaultTransferFee'}
                          onFocus={() => setFocusedField('defaultTransferFee')}
                        />
                      </motion.div>
                    )}



                    {selectedType === 'credit' && (
                      <div className="w-full flex flex-col gap-4 animate-none">
                        {/* Credit Limit */}
                        <GlassInput
                          label={t('add_account.credit_limit')}
                          placeholder={t('add_account.placeholder_balance')}
                          value={creditLimit}
                          onChange={(e) => setCreditLimit(e.target.value.replace(/[^0-9+\-*/.()]/g, ''))}
                          onBlur={() => {
                            setCreditLimit(prev => evaluateMathExpression(prev));
                            setFocusedField(null);
                          }}
                          prefixElement={<span style={{ fontFamily: "'Google Sans', sans-serif" }} className="font-bold text-[#1E2229]">{currency}</span>}
                          focused={focusedField === 'creditLimit'}
                          onFocus={() => setFocusedField('creditLimit')}
                        />

                        {/* Payment Due Date */}
                        <GlassInput
                          label={t('add_account.due_date')}
                          type="date"
                          placeholder=""
                          value={paymentDueDate}
                          onChange={(e) => setPaymentDueDate(e.target.value)}
                          focused={focusedField === 'paymentDueDate'}
                          onFocus={() => setFocusedField('paymentDueDate')}
                          onBlur={() => setFocusedField(null)}
                        />
                      </div>
                    )}

                    {(selectedType === 'loan' || selectedType === 'mortgage') && (
                      <div className="w-full flex flex-col gap-4 animate-none">
                        {/* Interest Rate */}
                        <GlassInput
                          label={t('add_account.interest_rate')}
                          placeholder={t('add_account.placeholder_interest')}
                          value={interestRate}
                          onChange={(e) => setInterestRate(e.target.value)}
                          prefixElement={<span style={{ fontFamily: "'Google Sans', sans-serif" }} className="font-bold text-[#1E2229]">%</span>}
                          focused={focusedField === 'interestRate'}
                          onFocus={() => setFocusedField('interestRate')}
                          onBlur={() => setFocusedField(null)}
                        />

                        {/* Recurring Payment Protocol */}
                        <GlassInput
                          label={t('add_account.recurring_protocol')}
                          placeholder={t('add_account.placeholder_recurring')}
                          value={recurringProtocol}
                          onChange={(e) => setRecurringProtocol(e.target.value)}
                          focused={focusedField === 'recurringProtocol'}
                          onFocus={() => setFocusedField('recurringProtocol')}
                          onBlur={() => setFocusedField(null)}
                        />
                      </div>
                    )}
                  </div>

                  {errorMessage && (
                    <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.15)' }} className="p-3.5 rounded-xl flex flex-col gap-2 animate-none">
                       <div className="flex items-center gap-2">
                          <X size={16} className="text-[#EF4444]" />
                          <span style={{ fontFamily: "'Google Sans', sans-serif", fontSize: 'clamp(0.85rem, 2vw, 0.95rem)', fontWeight: 400 }} className="text-[#EF4444] tracking-normal text-left">
                            {errorMessage}
                          </span>
                       </div>
                       {errorMessage.includes("FREE LIMIT EXCEEDED") && (
                         <button 
                           type="button"
                           onClick={() => window.dispatchEvent(new CustomEvent('trigger-premium-modal'))}
                           className="text-[#EF4444] font-bold text-sm underline text-left mt-1"
                           style={{ fontFamily: "'Google Sans', sans-serif" }}
                         >
                           {t('add_account.explore_options', 'Do you want to explore other options?')}
                         </button>
                       )}
                    </div>
                  )}

                  <div className="flex gap-4 pt-2 w-full mt-2 shrink-0 animate-none">
                    <button 
                      type="button"
                      onClick={() => setStep('type')}
                      style={{ 
                        fontFamily: "'Google Sans', sans-serif",
                        fontSize: 'clamp(1.1rem, 2.6vw, 1.35rem)', 
                        fontWeight: 400,
                        background: 'rgba(255, 255, 255, 0.40)',
                        border: '1px solid rgba(30, 34, 41, 0.08)',
                        color: '#1E2229'
                      }}
                      className="flex-1 py-1 rounded-xl shadow-sm transition-all active:scale-95 h-12 md:h-14 flex items-center justify-center cursor-pointer"
                    >
                      {t('add_account.back')}
                    </button>
                    <button 
                      disabled={isLoading}
                      type="submit"
                      style={{ 
                        fontFamily: "'Google Sans', sans-serif",
                        fontSize: 'clamp(1.1rem, 2.6vw, 1.35rem)', 
                        fontWeight: 700,
                        background: '#A6DDB1',
                        border: '1.5px solid #A6DDB1',
                        color: '#1E2229',
                        boxShadow: '0 4px 15px rgba(166, 221, 177, 0.25)'
                      }}
                      className="flex-[2] py-1 rounded-xl active:scale-95 transition-all flex items-center justify-center gap-2 h-12 md:h-14 cursor-pointer disabled:opacity-50"
                    >
                      {isLoading ? (
                        <div className="w-5 h-5 border-2 border-[#1E2229]/20 border-t-[#1E2229] rounded-full animate-spin" />
                      ) : (
                        <>
                          <Check size={18} />
                          <span>{t('add_account.create_account_button')}</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        </div>
      </div>
      )}
    </AnimatePresence>
  );
};
