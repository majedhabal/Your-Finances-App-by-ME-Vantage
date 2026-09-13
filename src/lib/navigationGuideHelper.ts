export interface NavigationGuide {
  title: string;
  steps: string[];
  targetTab?: 'essentials' | 'accounts' | 'analytics' | 'activity' | 'settings' | 'ai';
  targetModal?: 'transaction' | 'account' | 'goal' | 'none';
  actionLabel?: string;
}

export function getNavigationGuide(query: string): NavigationGuide | null {
  const q = query.toLowerCase();

  if (q.includes('add transaction') || q.includes('record expense') || q.includes('log spending') || q.includes('add payment')) {
    return {
      title: "How to Add a Transaction",
      steps: [
        "Click the quick-add or '+' transaction button in the app navigation.",
        "Select your transaction type: Expense, Income, or Transfer.",
        "Enter the amount, currency, category, and select the source account.",
        "Click save to instantly record the transaction and update your account ledger and budget in real time."
      ],
      targetModal: 'transaction',
      actionLabel: "➕ Open Add Transaction Modal"
    };
  }

  if (q.includes('budget') || q.includes('spending limit') || q.includes('envelope')) {
    return {
      title: "How to View Your Monthly Budget",
      steps: [
        "Navigate to the Essentials tab in the bottom or side navigation bar.",
        "Scroll down to the Mini Budgets section.",
        "Review your category budgets (such as Groceries, Utilities, and Entertainment) along with live spent progress bars and remaining allowances."
      ],
      targetTab: 'essentials',
      actionLabel: "📊 Go to Essentials & Budgets"
    };
  }

  if (q.includes('add account') || q.includes('bank account') || q.includes('wallet') || q.includes('card')) {
    return {
      title: "How to Add a Bank Account or Wallet",
      steps: [
        "Click on the Accounts tab in the main navigation menu.",
        "Click the 'Add Account' button at the top right of the accounts view.",
        "Select your account type (Checking, Savings, Cash, or Investment), enter the account name, currency, and opening balance.",
        "Save to synchronize the account into your net worth calculations."
      ],
      targetTab: 'accounts',
      actionLabel: "🏦 Go to Accounts Manager"
    };
  }

  if (q.includes('analytic') || q.includes('chart') || q.includes('forecast') || q.includes('report') || q.includes('cash flow')) {
    return {
      title: "How to View Analytics & Cash Flow",
      steps: [
        "Click on the Analytics tab in the navigation menu.",
        "Select your desired time horizon (7 Days, 30 Days, YTD, or All Time).",
        "Explore interactive 3D visual bar charts, income vs expenses breakdown, and category distribution percentages."
      ],
      targetTab: 'analytics',
      actionLabel: "📈 Open Analytics Dashboard"
    };
  }

  if (q.includes('buy') || q.includes('purchase') || q.includes('price') || q.includes('cost') || q.includes('worth') || q.includes('afford') || q.includes('should i')) {
    return {
      title: "Evaluate Item Purchase & Price",
      steps: [
        "Vantage AI has detected a purchase or item pricing inquiry.",
        "Our dedicated 'Should I Buy This?' assistant analyzes whether the item fits within your current budget, liquidity, and savings goals.",
        "Click the button below to launch the purchase decision analyzer."
      ],
      actionLabel: "🛍️ Launch 'Should I Buy This?' Analyzer"
    };
  }

  if (q.includes('debt') || q.includes('loan') || q.includes('mortgage') || q.includes('borrow')) {
    return {
      title: "How to Manage Debt & Loans",
      steps: [
        "Navigate to the Essentials tab.",
        "Locate the Debt Management section.",
        "Add your loan, personal credit, or mortgage details to track repayment progress and automatically link liability accounts."
      ],
      targetTab: 'essentials',
      actionLabel: "💳 Go to Debt Management"
    };
  }

  if (q.includes('transaction history') || q.includes('all transactions') || q.includes('past spending')) {
    return {
      title: "How to View Transaction History",
      steps: [
        "Click on the Activity tab in the navigation menu.",
        "Browse the complete searchable and filterable transaction ledger.",
        "Use filters by category, date range, or account to inspect past records."
      ],
      targetTab: 'activity',
      actionLabel: "📜 View Activity Ledger"
    };
  }

  return null;
}
