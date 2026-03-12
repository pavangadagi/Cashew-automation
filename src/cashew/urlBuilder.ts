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
  // URL builder implementation will be added in subsequent tasks
  return "cashew://app/addTransaction";
}
