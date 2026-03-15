import { Client } from "@notionhq/client";
import type { IStorageProvider } from "./IStorageProvider.js";
import type { Transaction } from "../../parser/schema.js";

// Type for Notion page with properties
interface NotionPage {
  properties: Record<string, {
    rich_text?: { plain_text: string }[];
    type?: string;
  }>;
}

// Type for Notion client databases with query method
interface DatabasesWithQuery {
  query(params: {
    database_id: string;
    filter?: object;
    page_size?: number;
  }): Promise<{ results: NotionPage[] }>;
  retrieve(params: { database_id: string }): Promise<unknown>;
  create(params: { parent: { database_id: string }; properties: object }): Promise<unknown>;
  update(params: { page_id: string; properties: object }): Promise<unknown>;
}

/**
 * Notion Storage Provider
 * 
 * Implements the IStorageProvider interface to persist transactions
 * to a Notion database.
 */
export class NotionProvider implements IStorageProvider {
  private client: Client;
  private databaseId: string;
  private processedEmailIds: Set<string> = new Set();

  /**
   * Creates a new NotionProvider instance
   * @param apiKey - Notion API key (from integration)
   * @param databaseId - ID of the Notion database to store transactions
   */
  constructor(apiKey: string, databaseId: string) {
    this.client = new Client({ auth: apiKey });
    this.databaseId = databaseId;
  }

  /**
   * Get databases client with query method
   */
  private get databases(): DatabasesWithQuery {
    return this.client.databases as unknown as DatabasesWithQuery;
  }

  /**
   * Initialize the storage provider
   * Verifies database connectivity by querying the database
   */
  async initialize(): Promise<void> {
    try {
      // Verify database exists and is accessible
      await this.client.databases.retrieve({
        database_id: this.databaseId,
      });
      
      // Pre-load processed email IDs to avoid duplicates
      await this.loadProcessedEmailIds();
      
      console.log(`[NotionProvider] Initialized successfully. Database: ${this.databaseId}`);
    } catch (error) {
      console.error("[NotionProvider] Failed to initialize:", error);
      throw new Error(`Failed to initialize Notion provider: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Load all processed email IDs from the Notion database
   * This is used for deduplication
   */
  private async loadProcessedEmailIds(): Promise<void> {
    try {
      const response = await this.databases.query({
        database_id: this.databaseId,
        filter: {
          property: "Email ID",
          rich_text: {
            is_not_empty: true,
          },
        },
        page_size: 100,
      });

      for (const page of response.results) {
        const emailIdProp = page.properties["Email ID"];
        if (emailIdProp && emailIdProp.rich_text && emailIdProp.rich_text.length > 0) {
          this.processedEmailIds.add(emailIdProp.rich_text[0].plain_text);
        }
      }
      
      console.log(`[NotionProvider] Loaded ${this.processedEmailIds.size} processed email IDs`);
    } catch (error) {
      console.warn("[NotionProvider] Warning: Could not load processed email IDs:", error);
    }
  }

  /**
   * Check if an email has already been processed
   * @param emailId - Unique identifier of the email
   * @returns Promise resolving to true if already processed, false otherwise
   */
  async hasProcessed(emailId: string): Promise<boolean> {
    // Check local cache first for performance
    if (this.processedEmailIds.has(emailId)) {
      return true;
    }

    try {
      // Query Notion to check if email has been processed
      const response = await this.databases.query({
        database_id: this.databaseId,
        filter: {
          property: "Email ID",
          rich_text: {
            equals: emailId,
          },
        },
        page_size: 1,
      });

      const processed = response.results.length > 0;
      
      if (processed) {
        this.processedEmailIds.add(emailId);
      }
      
      return processed;
    } catch (error) {
      console.error(`[NotionProvider] Error checking processed status for ${emailId}:`, error);
      // On error, assume not processed to avoid skipping legitimate emails
      return false;
    }
  }

  /**
   * Save a parsed transaction to Notion database
   * @param tx - Validated Transaction object
   * @param cashewUrl - Generated Cashew deep link URL
   * @param emailId - Unique identifier of the source email
   */
  async saveTransaction(tx: Transaction, cashewUrl: string, emailId: string): Promise<void> {
    try {
      // Map category to Notion select option
      const categoryMap: Record<string, string> = {
        food: "Food",
        transport: "Transport",
        shopping: "Shopping",
        bills: "Bills",
        health: "Health",
        other: "Other",
      };

      // Map transaction type to Notion select option
      const transactionTypeMap: Record<string, string> = {
        debit: "Debit",
        credit: "Credit",
        both: "Both",
      };

      // Build properties object with proper typing
      const properties: {
        Merchant: { title: { text: { content: string } }[] };
        Amount: { number: number };
        Currency: { rich_text: { text: { content: string } }[] };
        Date: { date: { start: string } };
        Category: { select: { name: string } };
        "Transaction Type": { select: { name: string } };
        "Cashew Link": { url: string };
        "Email ID": { rich_text: { text: { content: string } }[] };
        Status: { select: { name: string } };
        Note?: { rich_text: { text: { content: string } }[] };
        Account?: { rich_text: { text: { content: string } }[] };
      } = {
        // Merchant name
        Merchant: {
          title: [
            {
              text: {
                content: tx.merchant,
              },
            },
          ],
        },
        // Transaction amount
        Amount: {
          number: tx.amount,
        },
        // Currency code
        Currency: {
          rich_text: [
            {
              text: {
                content: tx.currency,
              },
            },
          ],
        },
        // Transaction date
        Date: {
          date: {
            start: tx.date,
          },
        },
        // Category
        Category: {
          select: {
            name: categoryMap[tx.category] || "Other",
          },
        },
        // Transaction type
        "Transaction Type": {
          select: {
            name: transactionTypeMap[tx.transactionType] || "Debit",
          },
        },
        // Cashew deep link
        "Cashew Link": {
          url: cashewUrl,
        },
        // Email ID for deduplication
        "Email ID": {
          rich_text: [
            {
              text: {
                content: emailId,
              },
            },
          ],
        },
        // Status - always "Pending" for manual review
        Status: {
          select: {
            name: "Pending",
          },
        },
      };

      // Add optional fields if present
      if (tx.note) {
        properties.Note = {
          rich_text: [
            {
              text: {
                content: tx.note,
              },
            },
          ],
        };
      }

      if (tx.account) {
        properties.Account = {
          rich_text: [
            {
              text: {
                content: tx.account,
              },
            },
          ],
        };
      }

      // Create the page in Notion
      await this.client.pages.create({
        parent: {
          database_id: this.databaseId,
        },
        properties: properties,
      });

      // Add to local cache
      this.processedEmailIds.add(emailId);
      
      console.log(`[NotionProvider] Saved transaction: ${tx.merchant} - ${tx.currency}${tx.amount} (${tx.date})`);
    } catch (error) {
      console.error("[NotionProvider] Failed to save transaction:", error);
      throw new Error(`Failed to save transaction to Notion: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
