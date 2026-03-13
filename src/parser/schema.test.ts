import { describe, it, expect } from "vitest";
import { TransactionSchema, type Transaction } from "./schema.js";

describe("TransactionSchema", () => {
  it("should validate a complete valid transaction", () => {
    const validTransaction = {
      amount: 50.25,
      currency: "USD",
      merchant: "Starbucks",
      category: "food" as const,
      transactionType: "debit" as const,
      date: "2024-01-15",
      note: "Morning coffee",
      account: "Chase Credit Card",
      isTransaction: true,
    };

    const result = TransactionSchema.safeParse(validTransaction);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validTransaction);
    }
  });

  it("should validate a transaction without optional fields", () => {
    const minimalTransaction = {
      amount: 100,
      currency: "INR",
      merchant: "Amazon",
      category: "shopping" as const,
      transactionType: "credit" as const,
      date: "2024-02-20",
      isTransaction: true,
    };

    const result = TransactionSchema.safeParse(minimalTransaction);
    expect(result.success).toBe(true);
  });

  it("should reject negative amounts", () => {
    const invalidTransaction = {
      amount: -50,
      currency: "USD",
      merchant: "Test",
      category: "food" as const,
      transactionType: "debit" as const,
      date: "2024-01-15",
      isTransaction: true,
    };

    const result = TransactionSchema.safeParse(invalidTransaction);
    expect(result.success).toBe(false);
  });

  it("should reject invalid currency codes", () => {
    const invalidTransaction = {
      amount: 50,
      currency: "US", // Too short
      merchant: "Test",
      category: "food" as const,
      transactionType: "debit" as const,
      date: "2024-01-15",
      isTransaction: true,
    };

    const result = TransactionSchema.safeParse(invalidTransaction);
    expect(result.success).toBe(false);
  });

  it("should reject invalid date formats", () => {
    const invalidTransaction = {
      amount: 50,
      currency: "USD",
      merchant: "Test",
      category: "food" as const,
      transactionType: "debit" as const,
      date: "01/15/2024", // Wrong format
      isTransaction: true,
    };

    const result = TransactionSchema.safeParse(invalidTransaction);
    expect(result.success).toBe(false);
  });

  it("should reject invalid categories", () => {
    const invalidTransaction = {
      amount: 50,
      currency: "USD",
      merchant: "Test",
      category: "invalid" as any,
      transactionType: "debit" as const,
      date: "2024-01-15",
      isTransaction: true,
    };

    const result = TransactionSchema.safeParse(invalidTransaction);
    expect(result.success).toBe(false);
  });

  it("should reject invalid transaction types", () => {
    const invalidTransaction = {
      amount: 50,
      currency: "USD",
      merchant: "Test",
      category: "food" as const,
      transactionType: "invalid" as any,
      date: "2024-01-15",
      isTransaction: true,
    };

    const result = TransactionSchema.safeParse(invalidTransaction);
    expect(result.success).toBe(false);
  });

  it("should require isTransaction field", () => {
    const invalidTransaction = {
      amount: 50,
      currency: "USD",
      merchant: "Test",
      category: "food" as const,
      transactionType: "debit" as const,
      date: "2024-01-15",
      // Missing isTransaction
    };

    const result = TransactionSchema.safeParse(invalidTransaction);
    expect(result.success).toBe(false);
  });
});
