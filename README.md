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
- The app generates a KQL query, summary, charts, findings, and RCA report.
- The product UI includes an Azure telemetry connector form for Workspace ID, Application Insights App ID, time range, and authentication mode.

## Microsoft AI stack plan

This prototype is structured so the deterministic local analysis can be replaced or augmented with Microsoft AI services:

- Azure OpenAI / Azure AI Foundry for schema interpretation, KQL generation, and RCA narrative.
- Azure Monitor / Log Analytics API for live telemetry.
- GitHub Copilot used during development and disclosed here per hackathon guidelines.
- Optional Azure Static Web Apps or Azure App Service for deployment.

## Dev server vs Azure AI

`npm run dev` starts the local Vite development server. It is not an Azure AI instance and it does not process real Azure telemetry by itself. It serves the React web app at `http://localhost:5173/` with hot reload while the product is being built.

For real Azure telemetry, the next production component should be a backend API, deployed on Azure App Service, Azure Functions, or Container Apps. That backend should use managed identity or Microsoft Entra ID to call Azure Monitor / Log Analytics and Azure OpenAI. Secrets, client credentials, and API keys should not be entered into or stored in the browser.

This repository now includes the backend API:

- `GET /api/health` checks backend availability and Azure OpenAI configuration.
- `POST /api/azure/query` queries a Log Analytics workspace using `DefaultAzureCredential`.
- `POST /api/ai/analyze` sends telemetry query results to Azure OpenAI for RCA-style analysis.

For local Azure Monitor access, authenticate with Azure first:

```bash
az login
```

For Azure OpenAI analysis, set these values in `.env`:

```bash
AZURE_OPENAI_ENDPOINT=
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_DEPLOYMENT=
AZURE_OPENAI_API_VERSION=2024-10-21
```

## Architecture

```text
User question
  -> Data source selector
  -> Azure Monitor connector or sample telemetry
  -> Telemetry discovery
  -> Custom dimension interpreter
  -> KQL generator
  -> Query/result analyzer
  -> AI-generated charts and breakdowns
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

For the full local product flow with the secure API backend:

```bash
copy .env.example .env
npm run dev:full
```

The React app runs at `http://localhost:5173/` and proxies `/api/*` requests to the backend at `http://localhost:7071/`.

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
