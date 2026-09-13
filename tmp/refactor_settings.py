with open('src/components/Settings.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Let's verify structure and replace the hook declarations in Settings
old_block = '''  const [activeView, setActiveView] = useState<'main' | 'categories' | 'recurring' | 'privacy' | 'terms' | 'ai_conversations' | 'referrals'>('main');
  
  useEffect(() => {
    const isSubView = activeView !== 'main';
    window.dispatchEvent(new CustomEvent('settings-subview-toggled', { detail: { isOpen: isSubView } }));
    return () => {
      window.dispatchEvent(new CustomEvent('settings-subview-toggled', { detail: { isOpen: false } }));
    };
  }, [activeView]);

  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);
  const [isBadgesModalOpen, setIsBadgesModalOpen] = useState(false);
  const [isPasscodeModalOpen, setIsPasscodeModalOpen] = useState(false);
  const [isPasscodeSet, setIsPasscodeSet] = useState(hasPasscode());
  const [isRestoring, setIsRestoring] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [currencySearch, setCurrencySearch] = useState('');
  const [isRedeemModalOpen, setIsRedeemModalOpen] = useState(false);

  useEffect(() => {
    const handleOpenRedeem = () => setIsRedeemModalOpen(true);
    window.addEventListener('trigger-redeem-invite-modal', handleOpenRedeem);
    return () => window.removeEventListener('trigger-redeem-invite-modal', handleOpenRedeem);
  }, []);
  
  // Custom Delete Profile Warning Dialog States
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteInputVerify, setDeleteInputVerify] = useState('');
  const [isDeletingProfile, setIsDeletingProfile] = useState(false);
  
  // Profile form state
  const [randomPlaceholder] = useState<string>(() => {
    const list = ['John Doe', 'Sara Spence', 'Alex Mercer', 'Taylor Vance', 'Jordan Reed', 'Morgan Chase', 'Kelly Palmer'];
    return list[Math.floor(Math.random() * list.length)];
  });
  const [fullName, setFullName] = useState(profile?.fullName || '');
  const [dob, setDob] = useState(profile?.dob || '');
  const [maritalStatus, setMaritalStatus] = useState(profile?.maritalStatus || 'Single');
  const [hasKids, setHasKids] = useState(profile?.hasKids || false);

  useEffect(() => {
    setHasKids(!!(profile?.hasKids || (profile?.dependents && profile.dependents.length > 0)));
  }, [profile?.hasKids, profile?.dependents]);

  const [financialGoals, setFinancialGoals] = useState(profile?.financialGoals || '');
  const [dateFormat, setDateFormat] = useState(profile?.dateFormat || (profile?.countryCode === 'US' ? 'MM/DD/YYYY' : 'DD/MM/YYYY'));
  const [theme, setTheme] = useState(profile?.theme || 'dark');
  const [fontSize, setFontSizeState] = useState(profile?.fontSize || localStorage.getItem('vantage_font_size') || 'normal');
  const [fontFamily, setFontFamilyState] = useState(profile?.fontFamily || localStorage.getItem('vantage_font_family') || 'Google Sans');
  const [isSaving, setIsSaving] = useState(false);
  const [isAddDependentDropdownOpen, setIsAddDependentDropdownOpen] = useState(false);
  const [newDependentRelation, setNewDependentRelation] = useState("Son");
  const [newDependentAge, setNewDependentAge] = useState<number | string>(0);

  // Premium Feature Toggles
  const [calendarSyncEnabled, setCalendarSyncEnabled] = useState(profile?.calendarSyncEnabled || false);
  const [tasksSyncEnabled, setTasksSyncEnabled] = useState(profile?.tasksSyncEnabled || false);
  const [geminiInsightsEnabled, setGeminiInsightsEnabled] = useState(profile?.geminiInsightsEnabled || false);
  const [fingerprintLoginEnabled, setFingerprintLoginEnabled] = useState(profile?.fingerprintLoginEnabled || false);
  const [dailyLoginReminderEnabled, setDailyLoginReminderEnabled] = useState(profile?.dailyLoginReminderEnabled || false);
  const [dailyLoginReminderHour, setDailyLoginReminderHour] = useState(profile?.dailyLoginReminderHour || 20);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const [pendingHour, setPendingHour] = useState<number | null>(null);
  const [monthlyStatementEnabled, setMonthlyStatementEnabled] = useState(profile?.monthlyStatementEnabled || false);
  const [isStatementVaultOpen, setIsStatementVaultOpen] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [simulateOffline, setSimulateOffline] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('vantage_simulated_offline') === 'true';
  });

  // Section edit states & specific values
  const [isEditingAesthetic, setIsEditingAesthetic] = useState(false);
  const [isEditingGraphics, setIsEditingGraphics] = useState(false);
  const [notificationPref, setNotificationPref] = useState(profile?.notificationPref || 'Stealth');
  const [dataRegion, setDataRegion] = useState(profile?.dataRegion || 'Globalized');'''

new_block = '''  // All useState hooks grouped at top
  const [activeView, setActiveView] = useState<'main' | 'categories' | 'recurring' | 'privacy' | 'terms' | 'ai_conversations' | 'referrals'>('main');
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);
  const [isBadgesModalOpen, setIsBadgesModalOpen] = useState(false);
  const [isPasscodeModalOpen, setIsPasscodeModalOpen] = useState(false);
  const [isPasscodeSet, setIsPasscodeSet] = useState(hasPasscode());
  const [isRestoring, setIsRestoring] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [currencySearch, setCurrencySearch] = useState('');
  const [isRedeemModalOpen, setIsRedeemModalOpen] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteInputVerify, setDeleteInputVerify] = useState('');
  const [isDeletingProfile, setIsDeletingProfile] = useState(false);
  const [randomPlaceholder] = useState<string>(() => {
    const list = ['John Doe', 'Sara Spence', 'Alex Mercer', 'Taylor Vance', 'Jordan Reed', 'Morgan Chase', 'Kelly Palmer'];
    return list[Math.floor(Math.random() * list.length)];
  });
  const [fullName, setFullName] = useState(profile?.fullName || '');
  const [dob, setDob] = useState(profile?.dob || '');
  const [maritalStatus, setMaritalStatus] = useState(profile?.maritalStatus || 'Single');
  const [hasKids, setHasKids] = useState(profile?.hasKids || false);
  const [financialGoals, setFinancialGoals] = useState(profile?.financialGoals || '');
  const [dateFormat, setDateFormat] = useState(profile?.dateFormat || (profile?.countryCode === 'US' ? 'MM/DD/YYYY' : 'DD/MM/YYYY'));
  const [theme, setTheme] = useState(profile?.theme || 'dark');
  const [fontSize, setFontSizeState] = useState(profile?.fontSize || localStorage.getItem('vantage_font_size') || 'normal');
  const [fontFamily, setFontFamilyState] = useState(profile?.fontFamily || localStorage.getItem('vantage_font_family') || 'Google Sans');
  const [isSaving, setIsSaving] = useState(false);
  const [isAddDependentDropdownOpen, setIsAddDependentDropdownOpen] = useState(false);
  const [newDependentRelation, setNewDependentRelation] = useState("Son");
  const [newDependentAge, setNewDependentAge] = useState<number | string>(0);
  const [calendarSyncEnabled, setCalendarSyncEnabled] = useState(profile?.calendarSyncEnabled || false);
  const [tasksSyncEnabled, setTasksSyncEnabled] = useState(profile?.tasksSyncEnabled || false);
  const [geminiInsightsEnabled, setGeminiInsightsEnabled] = useState(profile?.geminiInsightsEnabled || false);
  const [fingerprintLoginEnabled, setFingerprintLoginEnabled] = useState(profile?.fingerprintLoginEnabled || false);
  const [dailyLoginReminderEnabled, setDailyLoginReminderEnabled] = useState(profile?.dailyLoginReminderEnabled || false);
  const [dailyLoginReminderHour, setDailyLoginReminderHour] = useState(profile?.dailyLoginReminderHour || 20);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const [pendingHour, setPendingHour] = useState<number | null>(null);
  const [monthlyStatementEnabled, setMonthlyStatementEnabled] = useState(profile?.monthlyStatementEnabled || false);
  const [isStatementVaultOpen, setIsStatementVaultOpen] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [simulateOffline, setSimulateOffline] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('vantage_simulated_offline') === 'true';
  });
  const [isEditingAesthetic, setIsEditingAesthetic] = useState(false);
  const [isEditingGraphics, setIsEditingGraphics] = useState(false);
  const [notificationPref, setNotificationPref] = useState(profile?.notificationPref || 'Stealth');
  const [dataRegion, setDataRegion] = useState(profile?.dataRegion || 'Globalized');

  // All useEffect hooks grouped together
  useEffect(() => {
    const isSubView = activeView !== 'main';
    window.dispatchEvent(new CustomEvent('settings-subview-toggled', { detail: { isOpen: isSubView } }));
    return () => {
      window.dispatchEvent(new CustomEvent('settings-subview-toggled', { detail: { isOpen: false } }));
    };
  }, [activeView]);

  useEffect(() => {
    const handleOpenRedeem = () => setIsRedeemModalOpen(true);
    window.addEventListener('trigger-redeem-invite-modal', handleOpenRedeem);
    return () => window.removeEventListener('trigger-redeem-invite-modal', handleOpenRedeem);
  }, []);

  useEffect(() => {
    setHasKids(!!(profile?.hasKids || (profile?.dependents && profile.dependents.length > 0)));
  }, [profile?.hasKids, profile?.dependents]);'''

if old_block in content:
    content = content.replace(old_block, new_block)
    with open('src/components/Settings.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print("SUCCESSFULLY REFACTORED SETTINGS HOOKS")
else:
    print("OLD BLOCK NOT FOUND")
