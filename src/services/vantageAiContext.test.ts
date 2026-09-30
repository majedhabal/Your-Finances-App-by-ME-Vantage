import assert from 'assert';
import { 
  RawTransaction, 
  CATEGORY_MAP, 
  normalizeCategory, 
  parseLocalDate, 
  buildAiPromptContext,
  getCanonicalCategoryId 
} from './vantageAiContext';

async function runTests() {
  console.log('--- Running Vantage AI Context & Category Normalization Tests ---');

  // Test 1: parseLocalDate with various date formats
  console.log('\n[Test 1] parseLocalDate across timezone formats');
  const d1 = parseLocalDate('2026-05-15');
  assert.strictEqual(d1.getFullYear(), 2026);
  assert.strictEqual(d1.getMonth(), 4); // 0-indexed May
  assert.strictEqual(d1.getDate(), 15);

  const d2 = parseLocalDate('2026-07-20T14:30:00.000Z');
  assert.strictEqual(d2.getFullYear(), 2026);
  assert.strictEqual(d2.getMonth(), 6); // July
  assert.strictEqual(d2.getDate(), 20);

  const mockFirestoreDate = {
    toDate: () => new Date(2026, 8, 25)
  };
  const d3 = parseLocalDate(mockFirestoreDate);
  assert.strictEqual(d3.getFullYear(), 2026);
  assert.strictEqual(d3.getMonth(), 8);
  assert.strictEqual(d3.getDate(), 25);
  console.log('✓ parseLocalDate successfully parses ISO strings, date-only strings, and Firestore Timestamp objects');

  // Test 2: normalizeCategory with Arabic and Canonical English tokens
  console.log('\n[Test 2] normalizeCategory dictionary mappings');
  assert.strictEqual(normalizeCategory('طعام ومطاعم'), 'Food & Dining');
  assert.strictEqual(normalizeCategory('بقالة'), 'Groceries');
  assert.strictEqual(normalizeCategory('مواصلات'), 'Transportation');
  assert.strictEqual(normalizeCategory('تسوق'), 'Shopping');
  assert.strictEqual(normalizeCategory('فواتير'), 'Utilities');

  assert.strictEqual(normalizeCategory('food_dining'), 'Food & Dining');
  assert.strictEqual(normalizeCategory('groceries'), 'Groceries');
  assert.strictEqual(normalizeCategory('transportation'), 'Transportation');
  assert.strictEqual(normalizeCategory('shopping'), 'Shopping');
  assert.strictEqual(normalizeCategory('bills_utilities'), 'Utilities');

  // Unknown category fallback
  assert.strictEqual(normalizeCategory('Custom Hobby'), 'Custom Hobby');
  assert.strictEqual(normalizeCategory(''), 'General');
  console.log('✓ normalizeCategory properly normalizes Arabic and canonical tokens');

  // Test 3: buildAiPromptContext
  console.log('\n[Test 3] buildAiPromptContext computation & formattedLog');
  const sampleTransactions: RawTransaction[] = [
    {
      id: 'tx1',
      description: 'Carrefour Supermarket',
      amount: 250,
      category: 'بقالة',
      date: '2026-06-10'
    },
    {
      id: 'tx2',
      description: 'Uber Ride',
      amount: 45,
      category: 'transportation',
      date: '2026-06-12T08:00:00Z'
    },
    {
      id: 'tx3',
      description: 'Monthly Salary',
      amount: -15000, // Income represented as negative
      category: 'Income',
      date: '2026-06-01'
    },
    {
      id: 'tx4',
      description: 'Old Transaction Out of Range',
      amount: 100,
      category: 'Shopping',
      date: '2026-01-01'
    }
  ];

  const startDate = new Date(2026, 5, 1); // 2026-06-01
  const endDate = new Date(2026, 5, 30);   // 2026-06-30

  const context = buildAiPromptContext(sampleTransactions, startDate, endDate);

  assert.strictEqual(context.transactionCount, 3, 'Should filter out transactions outside of date range');
  assert.strictEqual(context.totalSpent, 295, '250 + 45 = 295');
  assert.strictEqual(context.totalIncome, 15000, 'Income should be 15000');
  assert.strictEqual(context.categoryBreakdown['Groceries'], 250, 'Groceries category total should be 250');
  assert.strictEqual(context.categoryBreakdown['Transportation'], 45, 'Transportation category total should be 45');

  assert.ok(context.formattedLog.includes('Carrefour Supermarket | Groceries | 250 AED'), 'Log must contain normalized item summary');
  assert.ok(context.formattedLog.includes('Uber Ride | Transportation | 45 AED'), 'Log must contain normalized item summary');
  console.log('✓ buildAiPromptContext correctly filters date ranges, computes category totals, and builds formattedLog');

  // Test 4: getCanonicalCategoryId schema constraint helper
  console.log('\n[Test 4] getCanonicalCategoryId for Firestore writes');
  assert.strictEqual(getCanonicalCategoryId('Food & Dining'), 'food_dining');
  assert.strictEqual(getCanonicalCategoryId('Groceries'), 'groceries');
  assert.strictEqual(getCanonicalCategoryId('بقالة'), 'groceries');
  assert.strictEqual(getCanonicalCategoryId('Transportation & Mobility'), 'transportation');
  assert.strictEqual(getCanonicalCategoryId('Bills & Subscriptions'), 'bills_utilities');
  assert.strictEqual(getCanonicalCategoryId('Transfer'), 'transfer');
  console.log('✓ getCanonicalCategoryId generates immutable canonical tokens');

  console.log('\nALL TESTS PASSED SUCCESSFULLY! (4/4)');
}

runTests().catch(err => {
  console.error('Test failure:', err);
  process.exit(1);
});
