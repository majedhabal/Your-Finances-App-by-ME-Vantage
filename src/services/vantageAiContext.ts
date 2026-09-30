// services/vantageAiContext.ts
export interface RawTransaction {
  id: string;
  description: string;
  amount: number;
  category: string;
  categoryId?: string;
  date: string | { toDate: () => Date };
  type?: 'expense' | 'income' | string;
  [key: string]: any;
}

export const CATEGORY_MAP: Record<string, string> = {
  // Arabic mapping to normalized standard tokens
  'طعام ومطاعم': 'Food & Dining',
  'بقالة': 'Groceries',
  'مواصلات': 'Transportation',
  'تسوق': 'Shopping',
  'فواتير': 'Utilities',
  // Canonical English tokens
  'food_dining': 'Food & Dining',
  'groceries': 'Groceries',
  'transportation': 'Transportation',
  'shopping': 'Shopping',
  'bills_utilities': 'Utilities'
};

export const normalizeCategory = (rawCategory: string): string => {
  const clean = rawCategory?.trim() || 'General';
  return CATEGORY_MAP[clean] || clean;
};

export const parseLocalDate = (dateVal: any): Date => {
  if (dateVal?.toDate) return dateVal.toDate();
  if (typeof dateVal === 'string') {
    const parts = dateVal.split('T')[0].split('-');
    if (parts.length === 3) {
      // Construct date in local timezone
      return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    }
    return new Date(dateVal);
  }
  return new Date();
};

export const buildAiPromptContext = (
  transactions: RawTransaction[],
  startDate: Date,
  endDate: Date
) => {
  const filtered = transactions.filter((t) => {
    const tDate = parseLocalDate(t.date);
    return tDate >= startDate && tDate <= endDate;
  });

  const categoryTotals: Record<string, number> = {};
  let totalSpent = 0;
  let totalIncome = 0;

  const itemizedSummaries = filtered.map((t) => {
    const category = normalizeCategory(t.category);
    const amount = Number(t.amount) || 0;
    
    if (amount > 0) {
      totalSpent += amount;
      categoryTotals[category] = (categoryTotals[category] || 0) + amount;
    } else {
      totalIncome += Math.abs(amount);
    }

    const description = t.description || t.notes || t.merchant || t.title || 'Transaction';
    return `${parseLocalDate(t.date).toLocaleDateString('en-GB')}: ${description} | ${category} | ${amount} AED`;
  });

  return {
    totalSpent,
    totalIncome,
    categoryBreakdown: categoryTotals,
    transactionCount: filtered.length,
    formattedLog: itemizedSummaries.join('\n')
  };
};

/**
 * Canonical Category ID dictionary mapping for Firestore write operations.
 * Guarantees immutable, canonical categoryId values (e.g. 'groceries', 'food_dining').
 */
export const CANONICAL_CATEGORY_IDS: Record<string, string> = {
  'Food & Dining': 'food_dining',
  'food & dining': 'food_dining',
  'food_dining': 'food_dining',
  'Groceries': 'groceries',
  'groceries': 'groceries',
  'Transportation': 'transportation',
  'Transportation & Mobility': 'transportation',
  'transportation': 'transportation',
  'Shopping': 'shopping',
  'Lifestyle, Shopping & Entertainment': 'shopping',
  'shopping': 'shopping',
  'Utilities': 'bills_utilities',
  'Bills & Subscriptions': 'bills_utilities',
  'bills_utilities': 'bills_utilities',
  'Housing & Living': 'housing_living',
  'housing_living': 'housing_living',
  'Health & Wellness': 'health_wellness',
  'health_wellness': 'health_wellness',
  'Savings & Investments': 'savings_investments',
  'savings_investments': 'savings_investments',
  'Income': 'income',
  'income': 'income',
  'Remittances': 'remittances',
  'remittances': 'remittances',
  'Family, Children & Household': 'family_household',
  'family_household': 'family_household',
  'Travel & Vacations': 'travel_vacations',
  'travel_vacations': 'travel_vacations',
  'Government Fees, Debt & Financial Obligations': 'gov_debt',
  'gov_debt': 'gov_debt',
  'Transfer': 'transfer',
  'transfer': 'transfer',
  'Others': 'others',
  'others': 'others',
  // Arabic mapping to canonical IDs
  'طعام ومطاعم': 'food_dining',
  'بقالة': 'groceries',
  'مواصلات': 'transportation',
  'تسوق': 'shopping',
  'فواتير': 'bills_utilities',
  'سكن ومعيشة': 'housing_living',
  'صحة وعافية': 'health_wellness',
  'مدخرات واستثمارات': 'savings_investments',
  'دخل': 'income',
  'تحويلات مالية': 'remittances'
};

export const getCanonicalCategoryId = (category?: string, subcategory?: string): string => {
  const target = (category || subcategory || '').trim();
  if (!target) return 'others';
  if (CANONICAL_CATEGORY_IDS[target]) return CANONICAL_CATEGORY_IDS[target];

  const lower = target.toLowerCase();
  if (CANONICAL_CATEGORY_IDS[lower]) return CANONICAL_CATEGORY_IDS[lower];

  const subLower = (subcategory || '').toLowerCase();
  if (subLower.includes('grocer') || lower.includes('grocer')) return 'groceries';
  if (lower.includes('food') || lower.includes('dining') || lower.includes('restaurant')) return 'food_dining';
  if (lower.includes('transport') || lower.includes('mobility') || lower.includes('car')) return 'transportation';
  if (lower.includes('shop') || lower.includes('lifestyle')) return 'shopping';
  if (lower.includes('bill') || lower.includes('utilit') || lower.includes('subscript')) return 'bills_utilities';
  if (lower.includes('hous') || lower.includes('rent') || lower.includes('mortgage')) return 'housing_living';
  if (lower.includes('health') || lower.includes('wellness')) return 'health_wellness';
  if (lower.includes('sav') || lower.includes('invest')) return 'savings_investments';
  if (lower.includes('income') || lower.includes('wage') || lower.includes('salary')) return 'income';
  if (lower.includes('remitt')) return 'remittances';
  if (lower.includes('transfer')) return 'transfer';
  if (lower.includes('family') || lower.includes('child')) return 'family_household';
  if (lower.includes('travel') || lower.includes('vacation')) return 'travel_vacations';
  if (lower.includes('gov') || lower.includes('debt')) return 'gov_debt';

  return lower.replace(/[^a-z0-9_]/g, '_').slice(0, 32) || 'others';
};
