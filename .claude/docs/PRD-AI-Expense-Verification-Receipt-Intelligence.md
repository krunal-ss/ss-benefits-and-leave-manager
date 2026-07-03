# PRD -- AI Expense Verification & Receipt Intelligence

## Executive Summary

Automates receipt verification using OCR and AI.

## Goals

-   OCR extraction
-   Duplicate detection
-   Fraud detection
-   AI confidence scoring
-   Manual HR review

## Functional Requirements

1.  Receipt upload
2.  OCR extraction
3.  AI validation
4.  Fraud detection
5.  Confidence score
6.  HR override
7.  Audit log

## Business Rules

-   Duplicate receipts blocked
-   Low confidence -\> HR review
-   Claims outside FY reviewed

## Database

ReceiptVerification table with OCR data, AI score and status.

## APIs

POST /api/receipt/upload POST /api/receipt/verify GET /api/receipt/{id}
POST /api/receipt/approve POST /api/receipt/reject

## UI

Upload screen, Verification panel, HR queue.

## Acceptance Criteria

OCR extracts data, AI validates, HR override logged.

## Future Enhancements

GST API, LLM parsing, Mobile scanning.
