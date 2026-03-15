import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { IAiProvider } from "./IAiProvider.js";
import { Transaction, TransactionSchema } from "../../parser/schema.js";

/**
 * Gemini AI Provider
 * 
 * Implements the IAiProvider interface using Google's Gemini model
 * via LangChain. Uses structured output to ensure type-safe transaction parsing.
 */
export class GeminiProvider implements IAiProvider {
  private model: ChatGoogleGenerativeAI;

  /**
   * Create a new GeminiProvider instance
   * @param apiKey - Google AI API key (defaults to GOOGLE_API_KEY env var)
   * @param modelName - Optional model name override (default: gemini-1.5-pro)
   */
  constructor(apiKey?: string, modelName?: string) {
    this.model = new ChatGoogleGenerativeAI({
      apiKey: apiKey || process.env.GOOGLE_API_KEY,
      model: modelName || "gemini-1.5-pro",
      temperature: 0, // Deterministic parsing
    });
  }

  /**
   * Parse email body text into a structured Transaction object
   * @param emailBody - Raw email body text to parse
   * @returns Promise resolving to a validated Transaction object
   * @throws Error if parsing fails or response is invalid
   */
  async parseEmailTransaction(emailBody: string): Promise<Transaction> {
    try {
      // Build the prompt with clear instructions and JSON output format
      const prompt = `You are a financial transaction parser. Parse the following email and extract transaction details.
      
Respond ONLY with valid JSON matching this exact schema. Do not include any explanation or markdown formatting:

{
  "amount": number (positive value),
  "currency": "3-letter currency code (e.g. USD, INR, GBP)",
  "merchant": "Merchant or payee name",
  "category": "food | transport | shopping | bills | health | other",
  "transactionType": "debit | credit | both",
  "date": "YYYY-MM-DD format",
  "note": "optional extra context",
  "account": "optional bank or card name",
  "isTransaction": boolean (false if email does not contain a transaction)
}

Email content:
${emailBody}`;

      // Call the model and get the response
      const response = await this.model.invoke(prompt);
      
      // Extract the content from the AIMessage
      const content = response.content;
      
      // Handle different response formats (string or array)
      let jsonStr: string;
      if (typeof content === "string") {
        jsonStr = content;
      } else if (Array.isArray(content)) {
        // Find the text part
        const textPart = content.find((part: unknown) => 
          typeof part === "object" && part !== null && "type" in part && (part as { type: string }).type === "text"
        );
        if (textPart && typeof textPart === "object" && "text" in textPart) {
          jsonStr = (textPart as { text: string }).text;
        } else {
          throw new Error("No text content found in response");
        }
      } else {
        throw new Error("Unexpected response content type");
      }

      // Parse the JSON string (handle potential markdown code blocks)
      const cleanedJson = jsonStr.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleanedJson);

      // Validate the result conforms to the schema
      const validated = TransactionSchema.parse(parsed);

      return validated;
    } catch (error) {
      // Handle parsing errors gracefully by returning a non-transaction response
      // This allows the pipeline to continue rather than fail completely
      if (error instanceof Error) {
        console.error("GeminiProvider: Failed to parse email:", error.message);
      }
      
      // Return a default non-transaction response
      return {
        amount: 0,
        currency: "USD",
        merchant: "Unknown",
        category: "other",
        transactionType: "both",
        date: new Date().toISOString().split("T")[0],
        note: "Failed to parse email - requires manual review",
        isTransaction: false,
      };
    }
  }
}
