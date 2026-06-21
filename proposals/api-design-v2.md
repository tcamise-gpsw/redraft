# API Design v2 Proposal

> **Status**: Draft — under review

## Overview

This proposal outlines the second major revision of our internal REST API, focusing on
consistency, versioning, and backwards compatibility.

## Background

The current API (v1) was designed rapidly and has accumulated several inconsistencies:

- Mixed snake_case and camelCase field names
- Inconsistent error response shapes
- No standard pagination envelope
- Missing rate limit headers on several endpoints

### Mermaid Diagram

```mermaid
sequenceDiagram
    Alice ->> Bob: Hello Bob, how are you?
    Bob-->>John: How about you John?
    Bob--x Alice: I am good thanks!
    Bob-x John: I am good thanks!
    Note right of John: Bob thinks a long<br/>long time, so long<br/>that the text does<br/>not fit on a row.

    Bob-->Alice: Checking with John...
    Alice->John: Yes... John, how are you?
```