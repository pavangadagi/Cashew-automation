import type { Transaction } from "../../parser/schema.js";

/**
 * AI Provider Interface
 * 
 * Defines the contract for AI-powered transaction parsing.
 * All AI providers must implement a consistent interface that accepts
 * email body text and returns a validated Transaction object.
 */
export interface IAiProvider {
  /**
   * Parse email body text into a structured Transaction object
   * @param emailBody - Raw email body text to parse
   * @returns Promise resolving to a validated Transaction object
   */
  parseEmailTransaction(emailBody: string): Promise<Transaction>;
}
