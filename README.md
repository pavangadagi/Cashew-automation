# Cashew Email Parser

Automated bank transaction email parser with AI integration for the Cashew mobile app.

## Overview

The Cashew Email Parser is a Node.js application that automates the extraction of bank transaction information from Gmail emails, parses them using AI providers, generates Cashew mobile app deep links, and stores the results in Notion.

## Project Structure

```
src/
├── cashew/
│   └── urlBuilder.ts       # Cashew deep link URL builder
├── parser/
│   ├── schema.ts           # Transaction schema with Zod validation
│   └── schema.test.ts      # Schema validation tests
├── providers/
│   ├── ai/
│   │   └── IAiProvider.ts  # AI provider interface
│   ├── email/
│   │   └── IEmailProvider.ts  # Email provider interface
│   └── storage/
│       └── IStorageProvider.ts  # Storage provider interface
├── index.ts                # Application entry point
└── pipeline.ts             # Pipeline orchestration logic
```

## Installation

```bash
npm install
```

## Development

```bash
# Build TypeScript
npm run build

# Run in development mode
npm run dev

# Run tests
npm test -- --run
```

## Transaction Schema

The Transaction schema validates all parsed transaction data:

- **amount**: Positive number representing transaction value
- **currency**: 3-letter ISO currency code (e.g., USD, INR, GBP)
- **merchant**: Merchant or payee name
- **category**: One of: food, transport, shopping, bills, health, other
- **transactionType**: One of: debit (expense), credit (income), both (transfer/mixed)
- **date**: Transaction date in YYYY-MM-DD format
- **note** (optional): Additional context from the email
- **account** (optional): Bank or card name
- **isTransaction**: Boolean indicating if email contains a transaction

## License

MIT
