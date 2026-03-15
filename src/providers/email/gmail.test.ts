import { describe, it, expect, vi, beforeEach } from "vitest";
import { GmailProvider } from "./gmail.js";
import type { GmailProviderConfig } from "./gmail.js";

// ---------------------------------------------------------------------------
// Mock googleapis
//
// vi.mock is hoisted to the top of the file by vitest. vi.hoisted() lets us
// declare variables that are also hoisted so they can be referenced inside
// the vi.mock factory.
// ---------------------------------------------------------------------------
const { mockList, mockGet, mockModify } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockGet: vi.fn(),
  mockModify: vi.fn(),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        setCredentials: vi.fn(),
      })),
    },
    gmail: vi.fn().mockReturnValue({
      users: {
        messages: {
          list: mockList,
          get: mockGet,
          modify: mockModify,
        },
      },
    }),
  },
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal but complete mock Gmail API message response.
 * Uses direct (non-multipart) body data by default.
 */
function createMockGmailMessage(
  _id: string,
  options: {
    subject?: string;
    from?: string;
    date?: string;
    body?: string;
  } = {}
) {
  const {
    subject = "Transaction Alert",
    from = "alerts@hdfcbank.net",
    date = "Mon, 15 Jan 2024 10:00:00 +0000",
    body = "Test email body",
  } = options;

  return {
    data: {
      payload: {
        headers: [
          { name: "Subject", value: subject },
          { name: "From", value: from },
          { name: "Date", value: date },
        ],
        body: {
          data: Buffer.from(body).toString("base64url"),
        },
      },
    },
  };
}

const defaultConfig: GmailProviderConfig = {
  clientId: "test-client-id",
  clientSecret: "test-client-secret",
  refreshToken: "test-refresh-token",
  senderPatterns: ["alerts@hdfcbank.net", "noreply@icicibank.com"],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GmailProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockModify.mockResolvedValue({});
  });

  // ==========================================================================
  // PROPERTY TESTS  (Task 5.2)
  // ==========================================================================

  // --------------------------------------------------------------------------
  // Property 1 – Email Fetching Returns Valid Structure
  // Validates: Requirement 1.2
  // --------------------------------------------------------------------------
  describe("Property 1: Email Fetching Returns Valid Structure", () => {
    it("should return EmailMessage objects where every field is a non-empty string", async () => {
      mockList.mockResolvedValue({
        data: {
          messages: [{ id: "msg1" }, { id: "msg2" }, { id: "msg3" }],
          nextPageToken: undefined,
        },
      });
      mockGet.mockImplementation((params: { id: string }) =>
        Promise.resolve(createMockGmailMessage(params.id))
      );

      const provider = new GmailProvider(defaultConfig);
      const emails = await provider.fetchUnprocessedEmails();

      expect(emails).toHaveLength(3);

      for (const email of emails) {
        // All required EmailMessage fields must be present
        expect(email).toHaveProperty("id");
        expect(email).toHaveProperty("subject");
        expect(email).toHaveProperty("from");
        expect(email).toHaveProperty("body");
        expect(email).toHaveProperty("date");

        // All fields must be strings
        expect(typeof email.id).toBe("string");
        expect(typeof email.subject).toBe("string");
        expect(typeof email.from).toBe("string");
        expect(typeof email.body).toBe("string");
        expect(typeof email.date).toBe("string");
      }
    });

    it("should accurately map Gmail message headers to the corresponding EmailMessage fields", async () => {
      const expectedSubject = "HDFC Bank Transaction Alert";
      const expectedFrom = "alerts@hdfcbank.net";
      const expectedDate = "Mon, 15 Jan 2024 10:00:00 +0000";
      const expectedBody = "Debited INR 1500.00 from account XXXX1234";

      mockList.mockResolvedValue({
        data: { messages: [{ id: "msg1" }], nextPageToken: undefined },
      });
      mockGet.mockResolvedValue(
        createMockGmailMessage("msg1", {
          subject: expectedSubject,
          from: expectedFrom,
          date: expectedDate,
          body: expectedBody,
        })
      );

      const provider = new GmailProvider(defaultConfig);
      const emails = await provider.fetchUnprocessedEmails();

      expect(emails).toHaveLength(1);
      expect(emails[0]).toEqual({
        id: "msg1",
        subject: expectedSubject,
        from: expectedFrom,
        date: expectedDate,
        body: expectedBody,
      });
    });
  });

  // --------------------------------------------------------------------------
  // Property 2 – Email Filtering by Sender Pattern
  // Validates: Requirement 1.4
  // --------------------------------------------------------------------------
  describe("Property 2: Email Filtering by Sender Pattern", () => {
    it("should include every configured sender pattern as a from: clause in the Gmail query", async () => {
      mockList.mockResolvedValue({
        data: { messages: [], nextPageToken: undefined },
      });

      const provider = new GmailProvider(defaultConfig);
      await provider.fetchUnprocessedEmails();

      const queryArg: string = mockList.mock.calls[0][0].q;
      expect(queryArg).toContain("from:alerts@hdfcbank.net");
      expect(queryArg).toContain("from:noreply@icicibank.com");
      expect(queryArg).toContain("is:unread");
      expect(queryArg).toContain("newer_than:3d");
    });

    it("should join multiple sender patterns with OR inside parentheses", async () => {
      mockList.mockResolvedValue({
        data: { messages: [], nextPageToken: undefined },
      });

      const provider = new GmailProvider({
        ...defaultConfig,
        senderPatterns: ["bank1@example.com", "bank2@example.com"],
      });
      await provider.fetchUnprocessedEmails();

      const queryArg: string = mockList.mock.calls[0][0].q;
      expect(queryArg).toMatch(
        /\(from:bank1@example\.com OR from:bank2@example\.com\)/
      );
    });

    it("should fall back to a bare unread query when no sender patterns are configured", async () => {
      mockList.mockResolvedValue({
        data: { messages: [], nextPageToken: undefined },
      });

      const provider = new GmailProvider({
        ...defaultConfig,
        senderPatterns: [],
      });
      await provider.fetchUnprocessedEmails();

      const queryArg: string = mockList.mock.calls[0][0].q;
      expect(queryArg).toBe("is:unread newer_than:3d");
    });
  });

  // --------------------------------------------------------------------------
  // Property 3 – Deduplication Prevents Duplicates
  // Validates: Requirements 1.5, 5.6
  // --------------------------------------------------------------------------
  describe("Property 3: Deduplication Prevents Duplicates", () => {
    it("should not produce duplicate IDs when collecting messages across multiple pages", async () => {
      mockList
        .mockResolvedValueOnce({
          data: {
            messages: [{ id: "msg1" }, { id: "msg2" }],
            nextPageToken: "page2",
          },
        })
        .mockResolvedValueOnce({
          data: {
            messages: [{ id: "msg3" }, { id: "msg4" }],
            nextPageToken: undefined,
          },
        });
      mockGet.mockImplementation((params: { id: string }) =>
        Promise.resolve(createMockGmailMessage(params.id))
      );

      const provider = new GmailProvider(defaultConfig);
      const emails = await provider.fetchUnprocessedEmails();

      const ids = emails.map((e) => e.id);
      const uniqueIds = new Set(ids);
      // Every returned email ID should be unique
      expect(uniqueIds.size).toBe(ids.length);
      expect(emails).toHaveLength(4);
    });

    it("should include every email from every page exactly once", async () => {
      mockList
        .mockResolvedValueOnce({
          data: {
            messages: [{ id: "msg1" }, { id: "msg2" }],
            nextPageToken: "token2",
          },
        })
        .mockResolvedValueOnce({
          data: {
            messages: [{ id: "msg3" }],
            nextPageToken: undefined,
          },
        });
      mockGet.mockImplementation((params: { id: string }) =>
        Promise.resolve(createMockGmailMessage(params.id))
      );

      const provider = new GmailProvider(defaultConfig);
      const emails = await provider.fetchUnprocessedEmails();

      expect(emails).toHaveLength(3);
      const ids = emails.map((e) => e.id);
      expect(ids).toContain("msg1");
      expect(ids).toContain("msg2");
      expect(ids).toContain("msg3");
    });
  });

  // --------------------------------------------------------------------------
  // Property 16 – Provider Method Idempotence
  // Validates: Requirements 10.4, 10.5
  // --------------------------------------------------------------------------
  describe("Property 16: Provider Method Idempotence", () => {
    it("fetchUnprocessedEmails should return identical results on repeated calls given the same API data", async () => {
      mockList.mockResolvedValue({
        data: {
          messages: [{ id: "msg1" }, { id: "msg2" }],
          nextPageToken: undefined,
        },
      });
      mockGet.mockImplementation((params: { id: string }) =>
        Promise.resolve(createMockGmailMessage(params.id))
      );

      const provider = new GmailProvider(defaultConfig);
      const first = await provider.fetchUnprocessedEmails();
      const second = await provider.fetchUnprocessedEmails();

      expect(first).toHaveLength(second.length);
      for (let i = 0; i < first.length; i++) {
        expect(first[i].id).toBe(second[i].id);
        expect(first[i].subject).toBe(second[i].subject);
        expect(first[i].from).toBe(second[i].from);
        expect(first[i].body).toBe(second[i].body);
        expect(first[i].date).toBe(second[i].date);
      }
    });

    it("markAsProcessed should not throw when called multiple times for the same email", async () => {
      const emailId = "test-email-123";
      const provider = new GmailProvider(defaultConfig);

      await expect(provider.markAsProcessed(emailId)).resolves.toBeUndefined();
      await expect(provider.markAsProcessed(emailId)).resolves.toBeUndefined();

      expect(mockModify).toHaveBeenCalledTimes(2);
      expect(mockModify).toHaveBeenCalledWith(
        expect.objectContaining({
          id: emailId,
          requestBody: { removeLabelIds: ["UNREAD"] },
        })
      );
    });
  });

  // ==========================================================================
  // UNIT TESTS  (Task 5.3)
  // ==========================================================================

  // --------------------------------------------------------------------------
  // fetchUnprocessedEmails
  // Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
  // --------------------------------------------------------------------------
  describe("fetchUnprocessedEmails", () => {
    it("should return an empty array when Gmail reports no matching messages", async () => {
      mockList.mockResolvedValue({
        data: { messages: undefined, nextPageToken: undefined },
      });

      const provider = new GmailProvider(defaultConfig);
      const emails = await provider.fetchUnprocessedEmails();

      expect(emails).toEqual([]);
    });

    it("should return an empty array when the messages array is empty", async () => {
      mockList.mockResolvedValue({
        data: { messages: [], nextPageToken: undefined },
      });

      const provider = new GmailProvider(defaultConfig);
      const emails = await provider.fetchUnprocessedEmails();

      expect(emails).toEqual([]);
    });

    it("should silently skip message references that have no id", async () => {
      mockList.mockResolvedValue({
        data: {
          messages: [{ id: undefined }, { id: "msg2" }],
          nextPageToken: undefined,
        },
      });
      mockGet.mockResolvedValue(createMockGmailMessage("msg2"));

      const provider = new GmailProvider(defaultConfig);
      const emails = await provider.fetchUnprocessedEmails();

      // The reference with no id is skipped; only msg2 is returned
      expect(emails).toHaveLength(1);
      expect(emails[0].id).toBe("msg2");
    });

    it("should continue fetching remaining messages after a single get request fails", async () => {
      mockList.mockResolvedValue({
        data: {
          messages: [{ id: "msg1" }, { id: "msg2" }, { id: "msg3" }],
          nextPageToken: undefined,
        },
      });
      mockGet
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce(createMockGmailMessage("msg2"))
        .mockResolvedValueOnce(createMockGmailMessage("msg3"));

      const provider = new GmailProvider(defaultConfig);
      const emails = await provider.fetchUnprocessedEmails();

      // msg1 failed – the provider should swallow the error and continue
      expect(emails).toHaveLength(2);
      expect(emails[0].id).toBe("msg2");
      expect(emails[1].id).toBe("msg3");
    });

    it("should paginate through all pages and return all collected messages", async () => {
      mockList
        .mockResolvedValueOnce({
          data: {
            messages: [{ id: "msg1" }],
            nextPageToken: "token-abc",
          },
        })
        .mockResolvedValueOnce({
          data: {
            messages: [{ id: "msg2" }],
            nextPageToken: undefined,
          },
        });
      mockGet.mockImplementation((params: { id: string }) =>
        Promise.resolve(createMockGmailMessage(params.id))
      );

      const provider = new GmailProvider(defaultConfig);
      const emails = await provider.fetchUnprocessedEmails();

      expect(mockList).toHaveBeenCalledTimes(2);
      expect(emails).toHaveLength(2);
    });

    it("should pass the nextPageToken from the previous page into the subsequent list request", async () => {
      mockList
        .mockResolvedValueOnce({
          data: {
            messages: [{ id: "msg1" }],
            nextPageToken: "my-page-token",
          },
        })
        .mockResolvedValueOnce({
          data: { messages: [], nextPageToken: undefined },
        });
      mockGet.mockResolvedValue(createMockGmailMessage("msg1"));

      const provider = new GmailProvider(defaultConfig);
      await provider.fetchUnprocessedEmails();

      expect(mockList).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ pageToken: "my-page-token" })
      );
    });

    it("should use sender patterns to build the Gmail query for sender filtering", async () => {
      mockList.mockResolvedValue({
        data: { messages: [{ id: "msg1" }], nextPageToken: undefined },
      });
      mockGet.mockResolvedValue(createMockGmailMessage("msg1"));

      const provider = new GmailProvider({
        ...defaultConfig,
        senderPatterns: ["alerts@hdfcbank.net"],
      });
      await provider.fetchUnprocessedEmails();

      const queryArg: string = mockList.mock.calls[0][0].q;
      expect(queryArg).toContain("from:alerts@hdfcbank.net");
      expect(queryArg).toContain("is:unread");
    });

    it("should call Gmail list API with userId 'me'", async () => {
      mockList.mockResolvedValue({
        data: { messages: [], nextPageToken: undefined },
      });

      const provider = new GmailProvider(defaultConfig);
      await provider.fetchUnprocessedEmails();

      expect(mockList).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "me" })
      );
    });

    it("should request full message format when fetching message details", async () => {
      mockList.mockResolvedValue({
        data: { messages: [{ id: "msg1" }], nextPageToken: undefined },
      });
      mockGet.mockResolvedValue(createMockGmailMessage("msg1"));

      const provider = new GmailProvider(defaultConfig);
      await provider.fetchUnprocessedEmails();

      expect(mockGet).toHaveBeenCalledWith(
        expect.objectContaining({ format: "full" })
      );
    });
  });

  // --------------------------------------------------------------------------
  // markAsProcessed
  // Requirements: 1.5
  // --------------------------------------------------------------------------
  describe("markAsProcessed", () => {
    it("should call the Gmail modify API to remove the UNREAD label for the given email", async () => {
      const emailId = "email-id-xyz";
      const provider = new GmailProvider(defaultConfig);

      await provider.markAsProcessed(emailId);

      expect(mockModify).toHaveBeenCalledOnce();
      expect(mockModify).toHaveBeenCalledWith({
        userId: "me",
        id: emailId,
        requestBody: { removeLabelIds: ["UNREAD"] },
      });
    });

    it("should target the authenticated user account with userId 'me'", async () => {
      const provider = new GmailProvider(defaultConfig);

      await provider.markAsProcessed("any-id");

      expect(mockModify).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "me" })
      );
    });
  });

  // --------------------------------------------------------------------------
  // Email body extraction
  // --------------------------------------------------------------------------
  describe("Email body extraction", () => {
    it("should decode body from direct (non-multipart) payload body data", async () => {
      const expectedBody = "Dear customer, your account has been debited.";
      mockList.mockResolvedValue({
        data: { messages: [{ id: "msg1" }], nextPageToken: undefined },
      });
      mockGet.mockResolvedValue(
        createMockGmailMessage("msg1", { body: expectedBody })
      );

      const provider = new GmailProvider(defaultConfig);
      const emails = await provider.fetchUnprocessedEmails();

      expect(emails[0].body).toBe(expectedBody);
    });

    it("should prefer text/plain part over text/html in a multipart message", async () => {
      const plainText = "Plain text transaction content";
      mockList.mockResolvedValue({
        data: { messages: [{ id: "msg1" }], nextPageToken: undefined },
      });
      mockGet.mockResolvedValue({
        data: {
          payload: {
            headers: [
              { name: "Subject", value: "Alert" },
              { name: "From", value: "bank@example.com" },
              { name: "Date", value: "Mon, 15 Jan 2024 10:00:00 +0000" },
            ],
            mimeType: "multipart/alternative",
            body: {},
            parts: [
              {
                mimeType: "text/html",
                body: {
                  data: Buffer.from("<p>HTML version</p>").toString("base64url"),
                },
              },
              {
                mimeType: "text/plain",
                body: {
                  data: Buffer.from(plainText).toString("base64url"),
                },
              },
            ],
          },
        },
      });

      const provider = new GmailProvider(defaultConfig);
      const emails = await provider.fetchUnprocessedEmails();

      expect(emails[0].body).toBe(plainText);
    });

    it("should fall back to text/html body when no text/plain part is present", async () => {
      const htmlContent = "<p>Transaction of INR 500</p>";
      mockList.mockResolvedValue({
        data: { messages: [{ id: "msg1" }], nextPageToken: undefined },
      });
      mockGet.mockResolvedValue({
        data: {
          payload: {
            headers: [
              { name: "Subject", value: "Alert" },
              { name: "From", value: "bank@example.com" },
              { name: "Date", value: "Mon, 15 Jan 2024 10:00:00 +0000" },
            ],
            mimeType: "multipart/mixed",
            body: {},
            parts: [
              {
                mimeType: "text/html",
                body: {
                  data: Buffer.from(htmlContent).toString("base64url"),
                },
              },
            ],
          },
        },
      });

      const provider = new GmailProvider(defaultConfig);
      const emails = await provider.fetchUnprocessedEmails();

      expect(emails[0].body).toBe(htmlContent);
    });

    it("should return an empty string when the message payload contains no body data", async () => {
      mockList.mockResolvedValue({
        data: { messages: [{ id: "msg1" }], nextPageToken: undefined },
      });
      mockGet.mockResolvedValue({
        data: {
          payload: {
            headers: [
              { name: "Subject", value: "Alert" },
              { name: "From", value: "bank@example.com" },
              { name: "Date", value: "Mon, 15 Jan 2024 10:00:00 +0000" },
            ],
            mimeType: "text/plain",
            body: {},
          },
        },
      });

      const provider = new GmailProvider(defaultConfig);
      const emails = await provider.fetchUnprocessedEmails();

      expect(emails[0].body).toBe("");
    });

    it("should extract body from a deeply nested multipart part", async () => {
      const nestedBody = "Nested plain text body";
      mockList.mockResolvedValue({
        data: { messages: [{ id: "msg1" }], nextPageToken: undefined },
      });
      mockGet.mockResolvedValue({
        data: {
          payload: {
            headers: [
              { name: "Subject", value: "Alert" },
              { name: "From", value: "bank@example.com" },
              { name: "Date", value: "Mon, 15 Jan 2024 10:00:00 +0000" },
            ],
            mimeType: "multipart/mixed",
            body: {},
            parts: [
              {
                mimeType: "multipart/alternative",
                body: {},
                parts: [
                  {
                    mimeType: "text/plain",
                    body: {
                      data: Buffer.from(nestedBody).toString("base64url"),
                    },
                  },
                ],
              },
            ],
          },
        },
      });

      const provider = new GmailProvider(defaultConfig);
      const emails = await provider.fetchUnprocessedEmails();

      expect(emails[0].body).toBe(nestedBody);
    });
  });

  // --------------------------------------------------------------------------
  // Default header values
  // --------------------------------------------------------------------------
  describe("Default header values", () => {
    it("should default subject to '(No Subject)' when the Subject header is absent", async () => {
      mockList.mockResolvedValue({
        data: { messages: [{ id: "msg1" }], nextPageToken: undefined },
      });
      mockGet.mockResolvedValue({
        data: {
          payload: {
            headers: [
              { name: "From", value: "bank@example.com" },
              { name: "Date", value: "Mon, 15 Jan 2024 10:00:00 +0000" },
            ],
            body: { data: Buffer.from("body text").toString("base64url") },
          },
        },
      });

      const provider = new GmailProvider(defaultConfig);
      const emails = await provider.fetchUnprocessedEmails();

      expect(emails[0].subject).toBe("(No Subject)");
    });
  });
});
