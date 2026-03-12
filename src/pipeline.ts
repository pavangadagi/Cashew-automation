import type { IEmailProvider } from "./providers/email/IEmailProvider.js";
import type { IAiProvider } from "./providers/ai/IAiProvider.js";
import type { IStorageProvider } from "./providers/storage/IStorageProvider.js";

/**
 * Pipeline Component
 * 
 * Orchestrates the complete processing workflow, coordinating between providers
 * to fetch, parse, and store transactions. Implements error handling to ensure
 * single failures don't block the entire batch.
 * 
 * @param emailProvider - Provider for fetching emails
 * @param aiProvider - Provider for parsing transactions
 * @param storageProvider - Provider for persisting transactions
 * @param dryRun - If true, log actions without modifying external systems
 */
export async function runPipeline(
  emailProvider: IEmailProvider,
  aiProvider: IAiProvider,
  storageProvider: IStorageProvider,
  dryRun = false
): Promise<void> {
  // Pipeline implementation will be added in subsequent tasks
  console.log("Pipeline initialized");
}
