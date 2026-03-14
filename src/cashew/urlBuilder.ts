import type { Transaction } from "../parser/schema.js";

/**
 * URL Builder Component
 * 
 * Transforms Transaction objects into Cashew deep link URLs following
 * the mobile app's URL scheme. Constructs query parameters from transaction
 * fields with proper URL encoding.
 * 
 * @param tx - Validated Transaction object
 * @returns Cashew deep link URL string
 */
export function buildCashewUrl(tx: Transaction): string {
  const baseUrl = "cashew://app/addTransaction";
  const params = new URLSearchParams();
  
  // Required parameters
  params.set("amount", tx.amount.toString());
  params.set("title", tx.merchant);
  params.set("date", tx.date);
  
  // Handle transactionType: income=false for debit, income=true for credit, omit for both
  if (tx.transactionType === "debit") {
    params.set("income", "false");
  } else if (tx.transactionType === "credit") {
    params.set("income", "true");
  }
  // For "both" transactionType, we omit the income parameter
  
  // Optional parameters - include only when present
  if (tx.category) {
    params.set("category", tx.category);
  }
  
  if (tx.note) {
    params.set("note", tx.note);
  }
  
  return `${baseUrl}?${params.toString()}`;
}
