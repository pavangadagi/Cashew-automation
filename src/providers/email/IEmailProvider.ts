/**
 * Email Message
 * 
 * Represents the structure of email data passed between the Email Provider
 * and the pipeline. Captures essential fields needed for transaction parsing.
 */
export interface EmailMessage {
  id: string;
  subject: string;
  from: string;
  body: string;
  date: string;
}

/**
 * Email Provider Interface
 * 
 * Defines the contract for email retrieval operations.
 * Implementations must provide methods for fetching unprocessed emails
 * and marking emails as processed after successful handling.
 */
export interface IEmailProvider {
  /**
   * Fetch unprocessed emails matching configured sender patterns
   * @returns Array of EmailMessage objects representing unread transaction emails
   */
  fetchUnprocessedEmails(): Promise<EmailMessage[]>;
  
  /**
   * Mark an email as processed to prevent duplicate processing
   * @param emailId - Unique identifier of the email to mark
   */
  markAsProcessed(emailId: string): Promise<void>;
}
