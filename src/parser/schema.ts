import { z } from "zod";

/**
 * Transaction Schema
 * 
 * Defines the structure for parsed transaction data with runtime validation.
 * All transactions must conform to this schema before being saved to storage.
 */
export const TransactionSchema = z.object({
  amount: z.number()
    .positive()
    .describe("Transaction amount as a positive number"),
  
  currency: z.string()
    .length(3)
    .describe("3-letter currency code e.g. USD, INR, GBP"),
  
  merchant: z.string()
    .describe("Merchant or payee name"),
  
  category: z.enum(["food", "transport", "shopping", "bills", "health", "other"])
    .describe("Best matching category"),
  
  transactionType: z.enum(["debit", "credit", "both"])
    .describe("Transaction type: debit (expense), credit (income), or both (transfer/mixed)"),
  
  date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe("Transaction date in YYYY-MM-DD format"),
  
  note: z.string()
    .optional()
    .describe("Any extra context from the email"),
  
  account: z.string()
    .optional()
    .describe("Bank or card name from the email"),
  
  isTransaction: z.boolean()
    .describe("False if this email does not contain a transaction"),
});

/**
 * Transaction Type
 * 
 * TypeScript type inferred from the Zod schema.
 * Use this type for type-safe transaction handling throughout the codebase.
 */
export type Transaction = z.infer<typeof TransactionSchema>;
