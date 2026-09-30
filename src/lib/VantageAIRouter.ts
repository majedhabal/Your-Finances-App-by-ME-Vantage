import { auth, db, getCurrentUser } from "./firebase";
import { doc, getDoc } from "firebase/firestore";
import { logAIUsage } from "./aiUsageTracker";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const MODEL_LITE = 'gemini-3.6-flash';
export const MODEL_FLASH = 'gemini-3.6-flash';
export const MODEL_PRO = 'gemini-3.6-flash';

export type TaskType = 
  | 'categorize_merchant'
  | 'clean_text'
  | 'parse_receipt_image'
  | 'summarize_document'
  | 'generate_financial_forecast'
  | 'portfolio_optimization'
  | 'shouldIBuy'
  | string;

export interface AIPayload {
  prompt: string;
  image?: { data: string; mimeType: string };
  temperature?: number;
  [key: string]: any;
}

const resolveApiKey = (): string => {
  return (
    import.meta.env.VITE_GEMINI_API_KEY ||
    import.meta.env.GEMINI_API_KEY ||
    (typeof window !== 'undefined' ? localStorage.getItem('vantage_gemini_key') || '' : '') ||
    'AIzaSyDt-C-67bDsRiG9ktNAswhKLvmfgFeyS00'
  );
};

const formatClientAccountsForPrompt = (accounts?: any[], accountBalances?: Record<string, number>, profile?: any, transactions?: any[]) => {
  let context = "";
  if (profile) {
    context += `User Profile: Name: ${profile.fullName || profile.displayName || 'User'}, Base Currency: ${profile.baseCurrency || 'AED'}, Subscription: ${profile.subscriptionTier || 'Free'}, Financial Goals: ${profile.financialGoals || 'None specified'}\n\n`;
  }
  if (accounts && Array.isArray(accounts) && accounts.length > 0) {
    context += "User Accounts & Financial Holdings Detailed Records:\n" + accounts.map((acc: any) => {
      const balance = accountBalances?.[acc.accountId || acc.id] ?? acc.currentBalance ?? acc.startingBalance ?? 0;
      return `- Name: ${acc.name || 'Unnamed Account'} (ID: ${acc.accountId || acc.id || 'N/A'})
  * Type: ${acc.type || 'Unknown'}
  * Bank Account Type: ${acc.bankAccountType || acc.type || 'N/A'}
  * Currency: ${acc.currency || 'AED'}
  * Current Balance: ${balance}
  * Starting Balance: ${acc.startingBalance ?? 'N/A'}
  * Initial Starting Balance: ${acc.initialStartingBalance ?? acc.startingBalance ?? 'N/A'}
  * Credit Limit: ${acc.creditLimit !== undefined ? acc.creditLimit : 'N/A'}
  * Interest Rate: ${acc.interestRate !== undefined ? acc.interestRate + '%' : 'N/A'}
  * Payment Due Date: ${acc.paymentDueDate || 'N/A'}
  * Include In Analytics: ${acc.includeInAnalytics !== undefined ? String(acc.includeInAnalytics) : 'true'}
  * Include In Liquidity: ${acc.includeInLiquidity !== undefined ? String(acc.includeInLiquidity) : 'true'}
  * Total Gain / Loss: ${acc.totalGainLoss !== undefined ? acc.totalGainLoss : 'N/A'}
  * Updated At: ${acc.updatedAt || acc.createdAt || 'N/A'}
  ${acc.subAssets && Array.isArray(acc.subAssets) && acc.subAssets.length > 0 ? `  * Sub-Assets / Holdings:\n` + acc.subAssets.map((sa: any) => `    - Asset: ${sa.assetName || sa.name}, Invested: ${sa.principalInvested ?? 0}, Value: ${sa.investmentValue ?? sa.currentValue ?? 0}, Yield: ${sa.estimatedYield ?? 0}%`).join('\n') : ''}`;
    }).join("\n\n") + "\n\n";
  }
  if (transactions && Array.isArray(transactions) && transactions.length > 0) {
    context += `Recent Transactions (${transactions.length} total):\n` + transactions.slice(0, 25).map((tx: any) => 
      `- Date: ${tx.date || tx.createdAt}, Category: ${tx.category || 'General'}, Account: ${tx.accountName || tx.accountId || 'Account'}, Amount: ${tx.amount} ${tx.currency || 'AED'}, Type: ${tx.type || tx.transactionType || 'Expense'}, Notes: ${tx.notes || tx.title || ''}`
    ).join("\n") + "\n\n";
  }
  return context;
};

export async function executeVantageAITask(taskType: TaskType, payload: AIPayload): Promise<string> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Authentication required for strategic analysis.");
  }

  try {
    let usageKey: 'shouldIBuy' | 'vantageAIChat' | 'aiTransactionsSearch' | 'aiReceiptScanner' | 'vantageAIForecast' | 'otherAIFeatures' = 'otherAIFeatures';
    if (taskType === 'parse_receipt_image') usageKey = 'aiReceiptScanner';
    else if (taskType === 'generate_financial_forecast' || taskType === 'summarize_document') usageKey = 'vantageAIForecast';
    else if (taskType === 'portfolio_optimization' || taskType === 'clean_text') usageKey = 'vantageAIChat';
    else if (taskType === 'categorize_merchant') usageKey = 'aiTransactionsSearch';
    else if (taskType === 'shouldIBuy') usageKey = 'shouldIBuy';
    await logAIUsage(usageKey);
  } catch (e) {
    // Non-blocking log
  }

  const apiKey = resolveApiKey();

  // Try direct browser SDK invocation first (Immune to Cloud Run 403 proxy blocks)
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: MODEL_FLASH,
      generationConfig: {
        temperature: payload.temperature !== undefined ? payload.temperature : 0.1
      }
    });

    const parts: any[] = [];
    if (payload.image) {
      parts.push({
        inlineData: {
          data: payload.image.data,
          mimeType: payload.image.mimeType
        }
      });
    }

    const richContext = formatClientAccountsForPrompt(payload.accounts, payload.accountBalances, payload.profile, payload.transactions || payload.allTransactions || payload.recentHistory);
    const finalPrompt = richContext ? `[REAL-TIME FINANCIAL CONTEXT]\n${richContext}\n[USER REQUEST]\n${payload.prompt}` : payload.prompt;
    parts.push({ text: finalPrompt });

    const result = await model.generateContent(parts);
    const response = await result.response;
    const responseText = response.text();

    if (responseText && responseText.trim().length > 0) {
      return responseText;
    }
  } catch (directError: any) {
    console.warn("[VantageAIRouter] Direct SDK call failed, attempting backend proxy fallback...", directError);
  }

  // Fallback to local server endpoint
  const idToken = await user.getIdToken();
  const res = await fetch("/api/ai/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Vantage-Authorization": `Bearer ${idToken}`
    },
    body: JSON.stringify({
      prompt: payload.prompt,
      model: MODEL_FLASH,
      temperature: payload.temperature || 0.1,
      image: payload.image,
      isImage: !!payload.image,
      accounts: payload.accounts,
      accountBalances: payload.accountBalances,
      transactions: payload.transactions || payload.allTransactions || payload.recentHistory,
      profile: payload.profile
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Advisor Node Error (Status ${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.text;
}

