# TelemetryAI

TelemetryAI is an AI telemetry intelligence prototype for the Microsoft Build AI hackathon. It helps teams turn Azure-style observability data into actionable insight when they do not already know the telemetry schema, custom dimensions, or KQL.

## Problem

Engineering teams often collect Application Insights and Azure Monitor telemetry, but incident analysis still depends on dashboard availability, KQL expertise, and manual correlation across requests, exceptions, traces, dependencies, deployments, feature flags, and custom dimensions.

## Solution

TelemetryAI demonstrates a workflow where an AI agent:

1. Auto-discovers telemetry tables, columns, and custom dimensions.
2. Explains the likely meaning of custom dimensions such as `buildVersion`, `tenantId`, `region`, `featureFlag`, and `paymentProvider`.
3. Converts natural-language questions into KQL-style queries.
4. Correlates requests, dependencies, exceptions, traces, and deployment events.
5. Produces an evidence-grounded root-cause analysis report with recommended actions.

## Current MVP

The current prototype uses synthetic Azure Application Insights-style telemetry for a checkout incident:

- Build `2026.06.01.4` is deployed.
- Checkout failures and latency increase.
- Failures correlate with `region=West Europe`, `paymentProvider=ProviderB`, and `featureFlag=provider-routing-v2`.
- Dependency telemetry shows `ProviderB.AuthorizePayment` gateway timeouts.
- The app generates a KQL query, summary, findings, and RCA report.

## Microsoft AI stack plan

This prototype is structured so the deterministic local analysis can be replaced or augmented with Microsoft AI services:

- Azure OpenAI / Azure AI Foundry for schema interpretation, KQL generation, and RCA narrative.
- Azure Monitor / Log Analytics API for live telemetry.
- GitHub Copilot used during development and disclosed here per hackathon guidelines.
- Optional Azure Static Web Apps or Azure App Service for deployment.

## Architecture

```text
User question
  -> Telemetry discovery
  -> Custom dimension interpreter
  -> KQL generator
  -> Query/result analyzer
  -> RCA report generator
  -> Web UI
```

## Tech stack

- React
- TypeScript
- Vite
- Synthetic Azure-style telemetry dataset

## Setup

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Data privacy

The demo uses synthetic telemetry only. Do not commit secrets, API keys, customer data, employer data, or proprietary third-party data to this repository.

## Team roles

Update before submission:

- Team member 1: Product, architecture, implementation
- Team member 2: AI integration, Azure deployment
- Team member 3: Demo, testing, documentation
