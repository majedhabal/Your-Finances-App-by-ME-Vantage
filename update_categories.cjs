const fs = require('fs');

const categories = `
export const APP_VERSION = '1.0.2 Beta';

export interface CategoryDef {
  name: string;
  nature: 'Need' | 'Want' | 'Must' | 'Income';
  subcategories: string[];
  emoji: string;
}

export const MASTER_CATEGORIES: CategoryDef[] = [
  {
    name: 'Housing',
    nature: 'Must',
    emoji: '🏠',
    subcategories: [
      'Rent / Mortgage',
      'Utilities (Energy, Water, etc.)',
      'Maintenance & Repairs',
      'Property insurance',
      'Services'
    ]
  },
  {
    name: 'Groceries',
    nature: 'Need',
    emoji: '🛒',
    subcategories: [
      'Groceries'
    ]
  },
  {
    name: 'Vehicle',
    nature: 'Need',
    emoji: '🏎️',
    subcategories: [
      'Car loan / Rentals',
      'Fuel',
      'Road Tolls (e.g., Salik, etc.)',
      'Parking',
      'Vehicle insurance',
      'Vehicle maintenance',
      'Leasing'
    ]
  },
  {
    name: 'Transportation',
    nature: 'Need',
    emoji: '🚗',
    subcategories: [
      'Public transport',
      'Taxi / Ride-hailing',
      'Long distance travel',
      'Business trips'
    ]
  },
  {
    name: 'Food & Drinks',
    nature: 'Need',
    emoji: '🍱',
    subcategories: [
      'Restaurant',
      'Fast-Food',
      'Café',
      'Bar'
    ]
  },
  {
    name: 'Subscriptions',
    nature: 'Want',
    emoji: '📺',
    subcategories: [
      'Streaming Services (Video/Audio)',
      'Software & Cloud Apps',
      'Digital News & Publications',
      'Membership Clubs'
    ]
  },
  {
    name: 'Shopping',
    nature: 'Want',
    emoji: '🛍️',
    subcategories: [
      'General Shopping (Generic catch-all)',
      'Clothes & Shoes',
      'Electronics & Accessories',
      'Home & Garden',
      'Drug-store & Health',
      'Kids & Pets',
      'Tools & Stationery',
      'Jewels & Accessories'
    ]
  },
  {
    name: 'Self-Care',
    nature: 'Want',
    emoji: '💅',
    subcategories: [
      'Salon & Spa',
      'Skincare & Cosmetics',
      'Wellness',
      'Beauty'
    ]
  },
  {
    name: 'Generosity',
    nature: 'Want',
    emoji: '❤️',
    subcategories: [
      'Gifts',
      'Charity & Donations',
      'Send Money Back Home'
    ]
  },
  {
    name: 'Life & Entertainment',
    nature: 'Want',
    emoji: '🎬',
    subcategories: [
      'Gym & Fitness',
      'Holiday & Hotels',
      'Hobbies & Books',
      'Games',
      'Education',
      'Health care',
      'Cinema & Movies'
    ]
  },
  {
    name: 'Communication',
    nature: 'Need',
    emoji: '📱',
    subcategories: [
      'Internet',
      'Phone',
      'Postal services'
    ]
  },
  {
    name: 'Financial Expenses',
    nature: 'Must',
    emoji: '💳',
    subcategories: [
      'Bank charges & Fees',
      'VAT & Taxes',
      'Insurances',
      'Loans & Fines'
    ]
  },
  {
    name: 'Investments',
    nature: 'Want',
    emoji: '📈',
    subcategories: [
      'ETFs & Index Funds',
      'Savings',
      'Real Estate',
      'SARWA',
      'Collections'
    ]
  },
  {
    name: 'Income',
    nature: 'Income',
    emoji: '💰',
    subcategories: [
      'Wage / Salary',
      'Invoices',
      'Rental income',
      'Dividends',
      'Sale',
      'Cashbacks & Gifts'
    ]
  },
  {
    name: 'Others',
    nature: 'Want',
    emoji: '📁',
    subcategories: [
      'Others',
      'Missing',
      'Starting balance'
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
    const openParen = (sanitized.match(/\\(/g) || []).length;
    const closeParen = (sanitized.match(/\\)/g) || []).length;
    if (openParen !== closeParen) {
      return strVal;
    }
    
    // Safely evaluate using Function constructor
    const fn = new Function(\`return (\${sanitized})\`);
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
`;

fs.writeFileSync('src/lib/constants.ts', categories);
