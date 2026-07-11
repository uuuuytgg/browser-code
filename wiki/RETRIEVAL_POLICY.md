# Retrieval Policy

## Goal

When answering a user question, BrowserCode should not scan the entire vault randomly.

It should use the Lite retrieval flow:

1. Search claims
2. Search topics/entities
3. Search sources
4. Build answer_context
5. Answer from answer_context

## Priority

Use evidence in this order:

1. Claims
2. Topic / Entity pages
3. Source pages
4. Query logs

## Insufficient Context

If retrieved context is insufficient:
- say what is missing
- suggest which source/topic should be added
- do not fabricate

## Query Logs

For complex answers, save a query log under `kb/queries`.
