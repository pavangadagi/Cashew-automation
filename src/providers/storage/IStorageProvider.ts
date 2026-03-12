import type { Transaction } from "../../parser/schema.js";

/**
 * Storage Provider Interface
 * 
 * Defines the contract for persisting parsed transactions.
 * Implementations must provide methods for initialization, checking
 * processed status, and saving new transactions.
 */
export interface IStorageProvider {
  /**
   * Initialize the storage provider
   * Performs any setup operations required by the storage backend
   */
  initialize(): Promise<void>;
  
  /**
   * Check if an email has already been processed
   * @param emailId - Unique identifier of the email
   * @returns Promise resolving to true if already processed, false otherwise
   */
  hasProcessed(emailId: string): Promise<boolean>;
  
  /**
   * Save a parsed transaction to storage
   * @param tx - Validated Transaction object
   * @param cashewUrl - Generated Cashew deep link URL
   * @param emailId - Unique identifier of the source email
   */
  saveTransaction(tx: Transaction, cashewUrl: string, emailId: string): Promise<void>;
}
