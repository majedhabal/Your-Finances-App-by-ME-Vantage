import { collection, query, getDocs, doc, setDoc, getDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { MASTER_CATEGORIES, CategoryDef } from './constants';

export interface CustomCategory extends CategoryDef {
  id?: string;
  isArchived?: boolean;
}

// Fallback / standard presets mapping
export const DEFAULT_PRESET_MAP: CategoryDef[] = MASTER_CATEGORIES;

/**
 * Fetches the master configurations onboarding presets.
 * If the config document doesn't exist, it seeds it with our default MASTER_CATEGORIES
 * and returns it immediately.
 */
export async function fetchGlobalPresets(): Promise<CategoryDef[]> {
  const docRef = doc(db, 'global_configurations', 'onboarding_presets');
  try {
    const initialPreset = {
      defaultCategoryMap: DEFAULT_PRESET_MAP,
      updatedAt: new Date().toISOString(),
      version: '1.4.0'
    };
    
    await setDoc(docRef, initialPreset, { merge: true });
    return DEFAULT_PRESET_MAP;
  } catch (err) {
    console.warn("Failed to update global presets in Firebase, falling back to local Constant categories map:", err);
    return DEFAULT_PRESET_MAP;
  }
}

export function mapOldCategoryToNew(oldCat: string, oldSub: string): { category: string; subcategory: string } {
  const c = (oldCat || '').toLowerCase();
  const s = (oldSub || '').toLowerCase();

  if (c.includes('housing') || c.includes('rent')) {
    if (s.includes('util') || s.includes('water') || s.includes('energy')) return { category: 'Housing & Living', subcategory: 'Electricity & Water' };
    if (s.includes('maint') || s.includes('repair')) return { category: 'Housing & Living', subcategory: 'Home Maintenance & Repairs' };
    if (s.includes('insurance') || s.includes('house')) return { category: 'Housing & Living', subcategory: 'House Insurance' };
    return { category: 'Housing & Living', subcategory: 'Rent / Mortgage' };
  }
  if (c.includes('grocer') || s.includes('grocer')) {
    return { category: 'Food & Dining', subcategory: 'Groceries (Supermarkets, local markets)' };
  }
  if (c.includes('vehicle') || c.includes('car')) {
    if (s.includes('fuel') || s.includes('gas') || s.includes('charging')) return { category: 'Transportation & Mobility', subcategory: 'Fuel / EV Charging' };
    if (s.includes('toll') || s.includes('salik') || s.includes('park')) return { category: 'Transportation & Mobility', subcategory: 'Road Tolls & Parking' };
    if (s.includes('loan') || s.includes('lease') || s.includes('rental')) return { category: 'Transportation & Mobility', subcategory: 'Car Payment / Lease' };
    if (s.includes('maint') || s.includes('wash') || s.includes('insurance')) return { category: 'Transportation & Mobility', subcategory: 'Car Maintenance, Wash & Insurance' };
    return { category: 'Transportation & Mobility', subcategory: 'Fuel / EV Charging' };
  }
  if (c.includes('transport')) {
    if (s.includes('taxi') || s.includes('ride') || s.includes('uber') || s.includes('careem')) return { category: 'Transportation & Mobility', subcategory: 'Rideshare & Taxis' };
    return { category: 'Transportation & Mobility', subcategory: 'Public Transit & Passes' };
  }
  if (c.includes('food') || c.includes('drink') || c.includes('restaurant') || c.includes('cafe') || c.includes('dining')) {
    if (s.includes('cafe') || s.includes('coffee') || s.includes('snack')) return { category: 'Food & Dining', subcategory: 'Coffee & Snacks' };
    return { category: 'Food & Dining', subcategory: 'Restaurants & Dining Out' };
  }
  if (c.includes('subscript')) {
    return { category: 'Bills & Subscriptions', subcategory: 'Digital Subscriptions (Streaming, cloud, AI tools, software)' };
  }
  if (c.includes('shop')) {
    if (s.includes('cloth') || s.includes('shoe') || s.includes('apparel')) return { category: 'Lifestyle, Shopping & Entertainment', subcategory: 'Clothing, Shoes & Accessories' };
    if (s.includes('electronic') || s.includes('gadget')) return { category: 'Lifestyle, Shopping & Entertainment', subcategory: 'Electronics & Gadgets' };
    return { category: 'Lifestyle, Shopping & Entertainment', subcategory: 'Clothing, Shoes & Accessories' };
  }
  if (c.includes('self-care') || c.includes('salon') || c.includes('beauty')) {
    return { category: 'Health & Wellness', subcategory: 'Personal Care & Grooming' };
  }
  if (c.includes('generosity')) {
    if (s.includes('back home') || s.includes('stipend')) return { category: 'Remittances', subcategory: 'Family Support Back Home (Regular monthly stipends sent to parents/family)' };
    return { category: 'Lifestyle, Shopping & Entertainment', subcategory: 'Gifts, Donations & Celebrations (Local physical gifts, party spending, charity)' };
  }
  if (c.includes('entertainment') || c.includes('life')) {
    if (s.includes('gym') || s.includes('fitness')) return { category: 'Bills & Subscriptions', subcategory: 'Gym & Fitness Subscriptions' };
    if (s.includes('holiday') || s.includes('hotel') || s.includes('travel')) return { category: 'Travel & Vacations', subcategory: 'Hotels & Accommodation' };
    if (s.includes('education') || s.includes('school')) return { category: 'Family, Children & Household', subcategory: 'School & Nursery Tuition' };
    if (s.includes('health') || s.includes('doctor') || s.includes('medical')) return { category: 'Health & Wellness', subcategory: 'Medical & Doctor Visits (Co-pays, consultations)' };
    return { category: 'Lifestyle, Shopping & Entertainment', subcategory: 'Entertainment & Outings (Movies, events, concerts, theme parks)' };
  }
  if (c.includes('communicat') || c.includes('phone') || c.includes('internet')) {
    if (s.includes('phone') || s.includes('mobile')) return { category: 'Bills & Subscriptions', subcategory: 'Mobile & Data' };
    return { category: 'Bills & Subscriptions', subcategory: 'Home Internet & TV' };
  }
  if (c.includes('financial') || c.includes('fee') || c.includes('tax') || c.includes('fine') || c.includes('loan')) {
    if (s.includes('tax') || s.includes('fine') || s.includes('vat')) return { category: 'Government Fees, Debt & Financial Obligations', subcategory: 'Taxes & Fines (Traffic fines, local VAT)' };
    if (s.includes('loan') || s.includes('emi')) return { category: 'Government Fees, Debt & Financial Obligations', subcategory: 'Loan Repayments Fees / EMIs Fees/ BNPY Fees' };
    return { category: 'Government Fees, Debt & Financial Obligations', subcategory: 'Bank Charges & FX Fees (Remittance fees, currency conversion)' };
  }
  if (c.includes('invest')) {
    if (s.includes('saving')) return { category: 'Savings & Investments', subcategory: 'Savings Account Contributions' };
    if (s.includes('real estate')) return { category: 'Savings & Investments', subcategory: 'Crowd sharing real-estate investments' };
    return { category: 'Savings & Investments', subcategory: 'Investments & Stocks (Trading accounts, ETFs, crypto)' };
  }
  if (c.includes('income')) {
    if (s.includes('rental') || s.includes('property')) return { category: 'Income', subcategory: 'Rental & Property Income (Short-term/long-term property rent)' };
    if (s.includes('dividend') || s.includes('interest') || s.includes('investment')) return { category: 'Income', subcategory: 'Investment Income (Dividends, interest, capital gains)' };
    if (s.includes('sale')) return { category: 'Income', subcategory: 'Asset Sales (Sale of goods, vehicles, or personal items)' };
    if (s.includes('cashback') || s.includes('reward')) return { category: 'Income', subcategory: 'Cashback & Rewards (Credit card rebates, loyalty program payouts)' };
    if (s.includes('freelance') || s.includes('invoice')) return { category: 'Income', subcategory: 'Freelance & Side Hustles (Invoices, gig work, consulting fees)' };
    return { category: 'Income', subcategory: 'Primary Employment (Salary, bonuses, commissions)' };
  }
  if (c.includes('remitt')) {
    return { category: 'Remittances', subcategory: 'Family Support Back Home (Regular monthly stipends sent to parents/family)' };
  }
  if (c.includes('gov') || c.includes('visa')) {
    return { category: 'Government Fees, Debt & Financial Obligations', subcategory: 'Residency & Visa Fees' };
  }
  if (c.includes('health')) {
    return { category: 'Health & Wellness', subcategory: 'Medical & Doctor Visits (Co-pays, consultations)' };
  }
  if (c.includes('family') || c.includes('child')) {
    return { category: 'Family, Children & Household', subcategory: 'School & Nursery Tuition' };
  }
  if (c.includes('travel') || c.includes('flight')) {
    return { category: 'Travel & Vacations', subcategory: 'Flights & Airfare' };
  }

  if (s.includes('starting balance') || s.includes('opening')) return { category: 'Others', subcategory: 'Opening Balances (Beginning account or portfolio values)' };
  if (s.includes('transfer')) return { category: 'Others', subcategory: 'Inter-account Transfers (Internal moves between personal accounts)' };
  return { category: 'Others', subcategory: 'Missing / Uncategorized (Items pending classification)' };
}

/**
 * Perform copy of global map to user's private custom_categories collection
 * and migrate existing user categories and transactions to version 1.3.0
 */
export async function seedUserCustomCategories(userId: string): Promise<void> {
  if (!userId || userId === 'dev-sandbox-user') return;
  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.exists() ? userSnap.data() : {};

    if (userData.categoryMigrationVersion === '1.4.0') {
      console.log("User categories already migrated to version 1.4.0. Skipping migration.");
      return;
    }

    const presetMap = await fetchGlobalPresets();
    const customColRef = collection(db, 'users', userId, 'custom_categories');
    const existingSnap = await getDocs(customColRef);
    const batch = writeBatch(db);

    existingSnap.forEach((dSnap) => {
      batch.delete(dSnap.ref);
    });

    presetMap.forEach((catObj) => {
      const newDocRef = doc(customColRef);
      batch.set(newDocRef, {
        name: catObj.name,
        nature: catObj.nature,
        emoji: catObj.emoji,
        subcategories: catObj.subcategories || [],
        isArchived: false,
        createdAt: new Date().toISOString()
      });
    });

    const txColRef = collection(db, 'users', userId, 'transactions');
    const txSnap = await getDocs(txColRef);

    txSnap.forEach((txDoc) => {
      const txData = txDoc.data();
      const oldCat = txData.category || '';
      const oldSub = txData.subCategory || txData.subcategory || '';
      const mapped = mapOldCategoryToNew(oldCat, oldSub);
      batch.update(txDoc.ref, {
        category: mapped.category,
        subCategory: mapped.subcategory,
        subcategory: mapped.subcategory
      });
    });

    batch.set(userRef, { categoryMigrationVersion: '1.4.0', updatedAt: new Date().toISOString() }, { merge: true });

    await batch.commit();
    console.log(`Successfully synced user ${userId} to category architecture 1.4.0 and updated transactions.`);
  } catch (err) {
    console.error("Failed to sync custom categories and transactions for user:", err);
  }
}
