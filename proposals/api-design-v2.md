# API Design v2 Proposal

## Overview

This proposal outlines the second major revision of our internal REST API, focusing on
consistency, versioning, and backwards compatibility.

## Background

The current API (v1) was designed rapidly and has accumulated several inconsistencies:

- Mixed snake_case and camelCase field names
- Inconsistent error response shapes
- No standard pagination envelope
- Missing rate limit headers on several endpoints

## Proposed Changes

### 1. Unified Field Naming

All fields will use `camelCase` in JSON responses to align with JavaScript conventions.

```json
{
  "userId": "abc123",
  "createdAt": "2025-06-01T12:00:00Z",
  "displayName": "Alice"
}
```

### 2. Standard Error Shape

Every error response will follow this envelope:

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "The requested resource could not be found.",
    "requestId": "req_abc123"
  }
}
```

### 3. Pagination

All list endpoints will support cursor-based pagination:

```
GET /v2/items?cursor=eyJpZCI6MTB9&limit=20
```

Response:

```json
{
  "items": [...],
  "nextCursor": "eyJpZCI6MzB9",
  "hasMore": true
}
```

### 4. Rate Limit Headers

Every response will include:

- `X-RateLimit-Limit`: requests allowed per window
- `X-RateLimit-Remaining`: requests left in current window
- `X-RateLimit-Reset`: Unix timestamp when the window resets

## Migration Plan

1. **Phase 1 (Month 1–2)**: Deploy v2 API alongside v1; update SDK
2. **Phase 2 (Month 3–4)**: Migrate all internal consumers to v2
3. **Phase 3 (Month 5–6)**: Deprecation notices on v1; sunset v1 at Month 9

## Open Questions

- Should we support both v1 and v2 simultaneously in the SDK, or hard-cut?
- What SLA do we commit to for v1 deprecation notices?
- Do we need a compatibility shim for external partners still on v1?

## Success Metrics

- All internal services migrated to v2 within 4 months
- Zero v1-related on-call pages after Month 6
- SDK adoption at 80%+ within 3 months of v2 GA
