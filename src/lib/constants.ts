
export const APP_VERSION = '1.2.0';

export interface CategoryDef {
  name: string;
  nature: 'Need' | 'Want' | 'Must' | 'Income';
  subcategories: string[];
  emoji: string;
}

export const MASTER_CATEGORIES: CategoryDef[] = [
  {
    name: 'Savings & Investments',
    nature: 'Want',
    emoji: '📈',
    subcategories: [
      'Emergency Fund Allocations',
      'Retirement & Pension Planning',
      'Investments & Stocks (Trading accounts, ETFs, crypto)',
      'Savings Account Contributions',
      'Crowd sharing real-estate investments'
    ]
  },
  {
    name: 'Remittances',
    nature: 'Want',
    emoji: '💸',
    subcategories: [
      'Family Support Back Home (Regular monthly stipends sent to parents/family)',
      'Property / Debt Back Home (Mortgages, loans, or investments held in home country)',
      'Gift & Special Occasion Transfers',
      'Transfer & FX Fees (Bank markups, exchange house charges)'
    ]
  },
  {
    name: 'Government Fees, Debt & Financial Obligations',
    nature: 'Must',
    emoji: '🏛️',
    subcategories: [
      'Residency & Visa Fees',
      'Official Documentation & ID Fees',
      'Loan Repayments Fees / EMIs Fees/ BNPY Fees',
      'Bank Charges & FX Fees (Remittance fees, currency conversion)',
      'Taxes & Fines (Traffic fines, local VAT)'
    ]
  },
  {
    name: 'Housing & Living',
    nature: 'Must',
    emoji: '🏠',
    subcategories: [
      'Rent / Mortgage',
      'Electricity & Water',
      'AC / District Cooling',
      'Home Maintenance & Repairs',
      'Furnishings & Home Decor',
      'Property Taxes / HOA Fees',
      'House Insurance'
    ]
  },
  {
    name: 'Food & Dining',
    nature: 'Need',
    emoji: '🍽️',
    subcategories: [
      'Groceries (Supermarkets, local markets)',
      'Restaurants & Dining Out',
      'Coffee & Snacks',
      'Workplace Meals (Canteen charges, daily work lunches)'
    ]
  },
  {
    name: 'Transportation & Mobility',
    nature: 'Need',
    emoji: '🚗',
    subcategories: [
      'Public Transit & Passes',
      'Fuel / EV Charging',
      'Car Payment / Lease',
      'Rideshare & Taxis',
      'Road Tolls & Parking',
      'Car Maintenance, Wash & Insurance'
    ]
  },
  {
    name: 'Family, Children & Household',
    nature: 'Must',
    emoji: '👨‍👩‍👧‍👦',
    subcategories: [
      'School & Nursery Tuition',
      'School Supplies & Extras (Bus fees, uniforms, extracurriculars)',
      'Babysitting & Childcare',
      'Domestic Help / Maid (Salary, agency fees, visa sponsorship)',
      'Pet Care (Food, vet, grooming)'
    ]
  },
  {
    name: 'Health & Wellness',
    nature: 'Need',
    emoji: '💊',
    subcategories: [
      'Medical & Doctor Visits (Co-pays, consultations)',
      'Pharmacy (Medications & Supplements)',
      'Health & Life Insurances',
      'Personal Care & Grooming'
    ]
  },
  {
    name: 'Bills & Subscriptions',
    nature: 'Want',
    emoji: '📱',
    subcategories: [
      'Mobile & Data',
      'Home Internet & TV',
      'Digital Subscriptions (Streaming, cloud, AI tools, software)',
      'Gym & Fitness Subscriptions',
      'Memberships & Club Fees'
    ]
  },
  {
    name: 'Travel & Vacations',
    nature: 'Want',
    emoji: '✈️',
    subcategories: [
      'Flights & Airfare',
      'Hotels & Accommodation',
      'Vacation Spending (Food, tours, activities abroad)',
      'Annual Flight / Home Visits'
    ]
  },
  {
    name: 'Lifestyle, Shopping & Entertainment',
    nature: 'Want',
    emoji: '🛍️',
    subcategories: [
      'Clothing, Shoes & Accessories',
      'Electronics & Gadgets',
      'Entertainment & Outings (Movies, events, concerts, theme parks)',
      'Hobbies & Sports (Sports gear, padel court bookings, hobbies)',
      'Gifts, Donations & Celebrations (Local physical gifts, party spending, charity)'
    ]
  },
  {
    name: 'Income',
    nature: 'Income',
    emoji: '💰',
    subcategories: [
      'Primary Employment (Salary, bonuses, commissions)',
      'Freelance & Side Hustles (Invoices, gig work, consulting fees)',
      'Gifts & Windfalls (Inheritance, cash gifts, lottery, prizes)',
      'Investment Income (Dividends, interest, capital gains)',
      'Rental & Property Income (Short-term/long-term property rent)',
      'Asset Sales (Sale of goods, vehicles, or personal items)',
      'Cashback & Rewards (Credit card rebates, loyalty program payouts)',
      'Tax-Refund'
    ]
  },
  {
    name: 'Others',
    nature: 'Want',
    emoji: '📁',
    subcategories: [
      'Missing / Uncategorized (Items pending classification)',
      'Opening Balances (Beginning account or portfolio values)',
      'Adjustments (Corrections or manual balance syncs)',
      'Inter-account Transfers (Internal moves between personal accounts)'
    ]
  },
  {
    name: 'Account Fund Transfers',
    nature: 'Want',
    emoji: '🔄',
    subcategories: [
      'Internal Transfers',
      'Inter-account Transfer',
      'Wallet Top-up'
    ]
  }
];

export function evaluateMathExpression(val: string | number): string {
  if (val === undefined || val === null) return '';
  const strVal = String(val).trim();
  if (!strVal) return '';
  
  // Strip out anything that is NOT a digit, decimal, +, -, *, /, (, or )
  const sanitized = strVal.replace(/[^0-9+\-*/.()]/g, '');
  if (!sanitized) return strVal;
  
  // If there are no math operators, just return the sanitized string
  if (!/[+\-*/]/.test(sanitized)) {
    return sanitized;
  }
  
  try {
    // Basic safety check: ensure parentheses are balanced
    const openParen = (sanitized.match(/\(/g) || []).length;
    const closeParen = (sanitized.match(/\)/g) || []).length;
    if (openParen !== closeParen) {
      return strVal;
    }
    
    // Safely evaluate using Function constructor
    const fn = new Function(`return (${sanitized})`);
    const result = fn();
    
    if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
      // Round to 4 decimal places to avoid floating point issues (e.g., 0.1 + 0.2)
      return (Math.round(result * 10000) / 10000).toString();
    }
  } catch (e) {
    // If formula is incomplete (e.g. trailing "7000+"), keep original typed text
  }
  
  return strVal;
}
