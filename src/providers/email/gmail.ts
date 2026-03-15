import { google, type gmail_v1 } from "googleapis";
import type { EmailMessage, IEmailProvider } from "./IEmailProvider.js";

/**
 * Gmail Provider Configuration
 *
 * Contains OAuth2 credentials and sender filter patterns required
 * to authenticate with the Gmail API and scope email retrieval.
 */
export interface GmailProviderConfig {
  /** OAuth2 client ID from Google Cloud Console */
  clientId: string;
  /** OAuth2 client secret from Google Cloud Console */
  clientSecret: string;
  /** OAuth2 refresh token obtained via the generate-gmail-refresh-token script */
  refreshToken: string;
  /**
   * Array of sender address patterns used to filter transaction emails.
   * Each entry is passed as a `from:` filter in the Gmail search query.
   * Example: ["alerts@hdfcbank.net", "noreply@icicibank.com"]
   */
  senderPatterns: string[];
}

/**
 * Gmail Email Provider
 *
 * Implements IEmailProvider using the Gmail REST API via the googleapis
 * package. Fetches all unread emails from the last 3 days matching
 * configured sender patterns and marks processed emails by removing
 * the UNREAD label.
 *
 * Authentication uses OAuth2 long-lived refresh tokens so that the
 * process can run unattended on a schedule without requiring interactive
 * re-authentication.
 */
export class GmailProvider implements IEmailProvider {
  private readonly config: GmailProviderConfig;

  constructor(config: GmailProviderConfig) {
    this.config = config;
  }

  // ---------------------------------------------------------------------------
  // IEmailProvider implementation
  // ---------------------------------------------------------------------------

  /**
   * Fetch unprocessed emails matching configured sender patterns.
   *
   * Queries Gmail for unread messages received in the last 3 days from
   * any of the configured sender addresses. Paginates through all results
   * to ensure no messages are missed. Returns an empty array if no
   * matching emails are found.
   *
   * @returns Array of EmailMessage objects
   */
  async fetchUnprocessedEmails(): Promise<EmailMessage[]> {
    const gmail = this.createGmailClient();

    // Build a Gmail search query: unread AND last 3 days AND (from:sender1 OR from:sender2 …)
    const fromClauses = this.config.senderPatterns
      .map((pattern) => `from:${pattern}`)
      .join(" OR ");

    const query =
      this.config.senderPatterns.length > 0
        ? `is:unread newer_than:3d (${fromClauses})`
        : "is:unread newer_than:3d";

    // Collect all message IDs across pages
    const messageRefs: Array<{ id?: string | null }> = [];
    let nextPageToken: string | null | undefined = null;

    do {
      const listParams: gmail_v1.Params$Resource$Users$Messages$List = {
        userId: "me",
        q: query,
        maxResults: 100,
      };
      if (nextPageToken) listParams.pageToken = nextPageToken;

      // eslint-disable-next-line no-await-in-loop
      const listResponse = await gmail.users.messages.list(listParams);
      const page = listResponse.data.messages ?? [];
      for (const m of page) messageRefs.push(m);
      nextPageToken = listResponse.data.nextPageToken;
    } while (nextPageToken);

    if (messageRefs.length === 0) {
      return [];
    }

    // Fetch full message data for each reference
    const emails: EmailMessage[] = [];

    for (const ref of messageRefs) {
      if (!ref.id) continue;

      try {
        const fullMessage = await gmail.users.messages.get({
          userId: "me",
          id: ref.id,
          format: "full",
        });

        const email = this.parseGmailMessage(ref.id, fullMessage.data);
        if (email) {
          emails.push(email);
        }
      } catch (error) {
        console.error(
          `[GmailProvider] Failed to fetch message ${ref.id}:`,
          error
        );
      }
    }

    return emails;
  }

  /**
   * Mark an email as processed by removing the UNREAD label.
   *
   * @param emailId - Gmail message ID to mark as read
   */
  async markAsProcessed(emailId: string): Promise<void> {
    const gmail = this.createGmailClient();

    await gmail.users.messages.modify({
      userId: "me",
      id: emailId,
      requestBody: {
        removeLabelIds: ["UNREAD"],
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Create an authenticated Gmail API client using the stored OAuth2
   * credentials. The access token is refreshed automatically when expired.
   */
  private createGmailClient() {
    const auth = new google.auth.OAuth2(
      this.config.clientId,
      this.config.clientSecret
    );

    auth.setCredentials({
      refresh_token: this.config.refreshToken,
    });

    return google.gmail({ version: "v1", auth });
  }

  /**
   * Convert a raw Gmail API message object into the normalised EmailMessage
   * interface understood by the rest of the pipeline.
   *
   * @param id      - Gmail message ID
   * @param message - Full message payload from the Gmail API
   * @returns EmailMessage, or null if the message cannot be parsed
   */
  private parseGmailMessage(
    id: string,
    message: ReturnType<typeof Object.create>
  ): EmailMessage | null {
    const headers: Array<{ name: string; value: string }> =
      message.payload?.headers ?? [];

    const subject = this.getHeader(headers, "Subject") ?? "(No Subject)";
    const from = this.getHeader(headers, "From") ?? "";
    const date = this.getHeader(headers, "Date") ?? new Date().toISOString();
    const body = this.extractBody(message.payload);

    return { id, subject, from, body, date };
  }

  /**
   * Look up a header value by name (case-insensitive).
   */
  private getHeader(
    headers: Array<{ name: string; value: string }>,
    name: string
  ): string | undefined {
    const lower = name.toLowerCase();
    return headers.find((h) => h.name.toLowerCase() === lower)?.value;
  }

  /**
   * Recursively extract the plain-text body from a Gmail message payload.
   *
   * Preference order:
   * 1. Direct `text/plain` body on the payload itself
   * 2. `text/plain` part in multipart messages
   * 3. `text/html` part as fallback
   * 4. Recursively search nested `multipart/*` parts
   *
   * All Gmail body data is base64url-encoded.
   *
   * @param payload - Gmail message payload (may be nested)
   * @returns Decoded body string, or empty string if nothing found
   */
  private extractBody(payload: ReturnType<typeof Object.create>): string {
    if (!payload) return "";

    // Case 1: body data is directly on the payload (non-multipart messages)
    if (payload.body?.data) {
      return Buffer.from(payload.body.data, "base64url").toString("utf-8");
    }

    const parts: Array<ReturnType<typeof Object.create>> = payload.parts ?? [];

    // Case 2: prefer text/plain part
    for (const part of parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return Buffer.from(part.body.data, "base64url").toString("utf-8");
      }
    }

    // Case 3: fall back to text/html
    for (const part of parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        return Buffer.from(part.body.data, "base64url").toString("utf-8");
      }
    }

    // Case 4: recursively search nested multipart parts
    for (const part of parts) {
      if (part.mimeType?.startsWith("multipart/")) {
        const nested = this.extractBody(part);
        if (nested) return nested;
      }
    }

    return "";
  }
}
