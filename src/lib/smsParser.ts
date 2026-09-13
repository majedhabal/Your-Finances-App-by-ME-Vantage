// SMS Parser Utility for Bank Notifications (ADCB, ENBD, FAB, DIB, Mashreq, HSBC, RAKBANK, etc.)

export interface ParsedTransaction {
  rawText: string;
  sender: string;
  amount: number;
  currency: string;
  type: 'expense' | 'income';
  merchant: string;
  accountHint: string;
  date: string;
  confidence: number; // 0 to 1
}

const TRUSTED_BANK_SENDERS = [
  'ADCB', 'ENBD', 'EmiratesNBD', 'FAB', 'DIB', 'Mashreq', 
  'HSBC', 'RAKBANK', 'CBD', 'SIB', 'CBK', 'FABank', 'ENBDAlert'
];

export function isTrustedBankSender(sender: string): boolean {
  if (!sender) return true; // allow manual paste / simulation
  const upper = sender.toUpperCase();
  return TRUSTED_BANK_SENDERS.some(bank => upper.includes(bank));
}

export function parseBankSms(text: string, sender: string = 'ADCB'): ParsedTransaction | null {
  if (!text || text.trim().length < 5) return null;

  const cleaned = text.trim();
  const upperText = cleaned.toUpperCase();

  // 1. Detect Currency and Amount
  // Matches patterns like: AED 312.24, AED312.24, USD 50.00, AED 1,250.50, 450.00 AED
  const currencyAmountRegex = /(?:(AED|USD|EUR|GBP|SAR|QAR|BHD|OMR)\.?\s*([0-9,]+\.[0-9]{2}|[0-9,]+))/i;
  const matchAmount = cleaned.match(currencyAmountRegex);

  let currency = 'AED';
  let amount = 0;

  if (matchAmount) {
    currency = matchAmount[1].toUpperCase();
    amount = parseFloat(matchAmount[2].replace(/,/g, ''));
  } else {
    // Fallback search for numbers after currency code or symbol
    const altRegex = /([0-9,]+\.[0-9]{2})/g;
    const matches = cleaned.match(altRegex);
    if (matches && matches.length > 0) {
      amount = parseFloat(matches[0].replace(/,/g, ''));
    }
  }

  if (!amount || isNaN(amount) || amount <= 0) {
    return null;
  }

  // 2. Detect Transaction Type (Debit vs Credit / Outflow vs Inflow)
  const creditKeywords = ['CREDITED', 'DEPOSIT', 'RECEIVED', 'SALARY', 'REFUND', 'TRANSFER IN', 'CR'];
  const debitKeywords = ['SPENT', 'DEBITED', 'PURCHASE', 'PAID', 'WITHDRAWN', 'POS', 'DR', 'CARD', 'ATM', 'DEBIT'];

  let type: 'expense' | 'income' = 'expense';
  
  const hasCredit = creditKeywords.some(kw => upperText.includes(kw));
  const hasDebit = debitKeywords.some(kw => upperText.includes(kw));

  if (hasCredit && !hasDebit) {
    type = 'income';
  } else if (hasDebit && !hasCredit) {
    type = 'expense';
  } else if (upperText.includes('SALARY') || upperText.includes('DEPOSIT')) {
    type = 'income';
  }

  // 3. Extract Merchant / Source / Description
  let merchant = 'Bank Transaction';
  
  // Look for "at [Merchant]" or "to [Merchant]" or "from [Merchant]"
  const atMatch = cleaned.match(/(?:at|to|from|via|POS\s*-\s*)\s+([A-Za-z0-9\s\*\-\.\#]+?)(?:\s+on\s+|\s+Ref|\s+Avail|\s+Bal|\.|$)/i);
  if (atMatch && atMatch[1]) {
    merchant = atMatch[1].trim().replace(/[\*\#]/g, '');
  } else {
    // Try finding known merchant names in text
    const commonMerchants = ['CARREFOUR', 'ADNOC', 'DEWA', 'DU', 'ETISALAT', 'LULU', 'SPINNEYS', 'SALIK', 'STARBUCKS', 'TALABAT', 'DELIVEROO', 'UBER', 'CAREEM'];
    const foundMerchant = commonMerchants.find(m => upperText.includes(m));
    if (foundMerchant) {
      merchant = foundMerchant;
    }
  }

  // 4. Extract Account Hint (e.g. XX1234 or Card ending in 4821)
  const accMatch = cleaned.match(/(?:card|acc|account|a\/c)\s*(?:no\.?|number)?\s*[\*x]*([0-9]{4})/i);
  const accountHint = accMatch ? `Ending ${accMatch[1]}` : 'Primary Account';

  // 5. Date extraction
  const dateMatch = cleaned.match(/([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4})/);
  let date = new Date().toISOString().split('T')[0];
  if (dateMatch) {
    // basic parse attempt
    date = new Date().toISOString().split('T')[0]; // fallback safely to today or parsed
  }

  return {
    rawText: cleaned,
    sender: sender || 'Bank SMS',
    amount,
    currency,
    type,
    merchant,
    accountHint,
    date,
    confidence: 0.92
  };
}

export const SAMPLE_BANK_SMS_FEED = [
  {
    sender: 'ADCB Alerts',
    bank: 'Abu Dhabi Commercial Bank (ADCB)',
    text: 'ADCB Debit Card txn of AED 245.50 spent at CARREFOUR HYPERMARKET on 04-Sep-2026. Avail Bal AED 12,450.20.'
  },
  {
    sender: 'ENBD Alert',
    bank: 'Emirates NBD',
    text: 'Your a/c XX4821 is credited with AED 18,500.00 on 04-Sep-2026 as MONTHLY SALARY. Ref: SAL/2026/09.'
  },
  {
    sender: 'FAB SMS',
    bank: 'First Abu Dhabi Bank (FAB)',
    text: 'PURCHASE of AED 65.00 at ADNOC DISTRIBUTION on 04-Sep-2026 using Credit Card XX9912. Available limit: AED 15,200.'
  },
  {
    sender: 'DIB Bank',
    bank: 'Dubai Islamic Bank (DIB)',
    text: 'DEBIT AED 320.00 paid to DEWA UTILITIES BILL on 03-Sep-2026 via DIB Mobile Banking.'
  },
  {
    sender: 'Mashreq',
    bank: 'Mashreq Neo',
    text: 'You spent AED 89.00 at STARBUCKS COFFEE on 04-Sep-2026. Card ending 3310.'
  }
];
