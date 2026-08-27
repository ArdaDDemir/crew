---
status: accepted
date: 2026-08-27
decision-makers: Arda
---

# OpenAI-compatible provider (OpenRouter default)

## Context and Problem Statement

Bots need a model. We want OpenRouter now and other OpenAI-compatible endpoints later, without a vendor SDK in core.

## Considered Options

- Official OpenRouter Agent SDK inside core
- Provider port: `complete(ChatRequest) -> Stream<ChatEvent>` with an HTTP adapter (`base_url` + key)
- Separate SDK per vendor

## Decision Outcome

Chosen option: "Provider port + OpenAI-compatible HTTP adapter", because OpenRouter, local servers, and later extras share Chat Completions. Default `base_url` is `https://openrouter.ai/api/v1`.

Core never imports `@openrouter/*`. Tests use a scripted fake, not the network.

### Consequences

- Good, because one adapter covers OpenRouter and any OpenAI-compatible server
- Bad, because Anthropic-native APIs wait until a second adapter exists

### Confirmation

`packages/core` talks to a `Provider` interface. OpenRouter lives in an adapter package.
