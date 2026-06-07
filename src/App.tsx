import { useMemo, useState } from 'react'
import { analyzeTelemetry, discoverSchema, type BreakdownRow } from './analysis/telemetryAnalyzer'
import { sampleTelemetry } from './data/sampleTelemetry'
import './App.css'

const demoQuestions = [
  'What is wrong with my system?',
  'Why are errors increasing?',
  'Which region is impacted?',
  'Show slow APIs.',
]

const analysisSteps = [
  'Discovered telemetry schema',
  'Checked recent deployment events',
  'Compared failures before/after build',
  'Correlated dependency timeouts',
  'Generated RCA with 87% confidence',
]

type DemoQuestion = (typeof demoQuestions)[number]

type CopilotResponse = {
  summary: string
  finding: string
  rootCause: string
  evidence: string
  nextAction: string
  kql: string
  findings: string[]
}

type UiSchemaSummary = {
  summary?: string
  tables: Array<{
    name: string
    records: number
    columns: string[]
  }>
  customDimensions: Array<{
    key: string
    examples: string[]
    likelyMeaning: string
  }>
}

type LiveCopilotResponse = Partial<CopilotResponse> & {
  queryResult?: AzureTelemetryResult
  error?: string
}

type LiveDiscoveryResponse = UiSchemaSummary & {
  kql?: string
  queryResult?: AzureTelemetryResult
  error?: string
}

type AzureTelemetryResult = {
  status?: string
  tables?: Array<{ name: string; rows: unknown[] }>
  error?: string
}

const copilotResponses: Record<DemoQuestion, CopilotResponse> = {
  'What is wrong with my system?': {
    summary:
      'Checkout is unhealthy after the latest deployment. Failures and latency increased on POST /checkout, concentrated on ProviderB traffic in West Europe.',
    finding: 'Checkout failures increased after deployment',
    rootCause: 'ProviderB payment timeout',
    evidence: '504s + dependency failures + West Europe + provider-routing-v2',
    nextAction: 'Disable provider-routing-v2 and fail over to ProviderA',
    kql: `requests
| where operation_Name == "POST /checkout"
| summarize requests=count(),
    failures=countif(success == false),
    failureRate=round(100.0 * countif(success == false) / count(), 2),
    avgDurationMs=round(avg(duration), 0)
  by tostring(customDimensions.buildVersion),
     tostring(customDimensions.region),
     tostring(customDimensions.paymentProvider),
     tostring(customDimensions.featureFlag)
| order by failureRate desc`,
    findings: [
      'Failures start after build 2026.06.01.4.',
      'Failing requests are concentrated in West Europe.',
      'ProviderB dependency calls show GatewayTimeout.',
      'provider-routing-v2 is present on impacted requests.',
    ],
  },
  'Why are errors increasing?': {
    summary:
      'Errors are increasing because ProviderB authorization calls are timing out. The failures surface as HTTP 504 responses after retry budget exhaustion.',
    finding: 'HTTP 504 errors increased',
    rootCause: 'ProviderB.AuthorizePayment timeout',
    evidence: 'GatewayTimeout dependency rows + exceptions + retry exhaustion',
    nextAction: 'Route payment authorization away from ProviderB',
    kql: `dependencies
| where target == "ProviderB.AuthorizePayment"
| summarize calls=count(),
    failures=countif(success == false),
    avgDurationMs=round(avg(duration), 0)
  by resultCode,
     tostring(customDimensions.region),
     tostring(customDimensions.buildVersion)
| order by failures desc`,
    findings: [
      'ProviderB dependency failures align with checkout 504s.',
      'Exceptions mention PaymentAuthorizationTimeout.',
      'RetryBudgetExhausted appears after repeated dependency timeouts.',
      'ProviderA traffic remains comparatively healthy.',
    ],
  },
  'Which region is impacted?': {
    summary:
      'The incident is not global. Impact is concentrated in West Europe, especially tenants routed to ProviderB after the provider-routing-v2 rollout.',
    finding: 'West Europe is the primary impacted region',
    rootCause: 'Regional ProviderB routing after rollout',
    evidence: 'tenantId + region + paymentProvider custom dimensions',
    nextAction: 'Disable ProviderB route for West Europe tenants',
    kql: `requests
| where operation_Name == "POST /checkout"
| summarize requests=count(),
    failures=countif(success == false),
    failureRate=round(100.0 * countif(success == false) / count(), 2),
    avgDurationMs=round(avg(duration), 0)
  by tostring(customDimensions.tenantId),
     tostring(customDimensions.region),
     tostring(customDimensions.paymentProvider)
| order by failureRate desc`,
    findings: [
      'West Europe has the highest checkout failure concentration.',
      'contoso-retail and adatum-store appear in the impacted tenant set.',
      'North Europe ProviderA traffic does not show the same failure pattern.',
      'The blast radius is limited to ProviderB-routed checkout traffic.',
    ],
  },
  'Show slow APIs.': {
    summary:
      'POST /checkout is the slow API. Its latency moved from normal sub-second behavior to sustained 1.2s-1.6s requests after deployment.',
    finding: 'POST /checkout latency spiked',
    rootCause: 'Slow ProviderB downstream authorization',
    evidence: 'durationMs increase + dependency timeout + post-deployment timing',
    nextAction: 'Add adaptive alert on p95 checkout latency by provider',
    kql: `requests
| summarize requests=count(),
    avgDurationMs=round(avg(duration), 0),
    p95DurationMs=percentile(duration, 95),
    failures=countif(success == false)
  by operation_Name,
     bin(timestamp, 15m),
     tostring(customDimensions.buildVersion)
| order by p95DurationMs desc`,
    findings: [
      'POST /checkout is slower than the other sampled operations.',
      'Latency spike begins after deployment rel-4821.',
      'Slow requests correlate with ProviderB dependency calls.',
      'A p95 latency alert by provider would catch this earlier.',
    ],
  },
}

const incidentTimeline = [
  {
    time: '2:05 PM',
    title: 'Deployment completed',
    detail: 'Build 2026.06.01.4 promoted with provider-routing-v2 enabled.',
  },
  {
    time: '2:10 PM',
    title: 'Errors start',
    detail: 'Checkout requests begin returning 504 responses in West Europe.',
  },
  {
    time: '2:12 PM',
    title: 'Latency spike',
    detail: 'ProviderB authorization dependency exceeds the checkout timeout threshold.',
  },
  {
    time: '2:15 PM',
    title: 'RCA generated',
    detail: 'Telemetry Copilot correlates deployment, region, feature flag, dependency, and errors.',
  },
]

const defaultAzureDiscoveryQuery = `union isfuzzy=true withsource=TelemetryTable
  requests,
  dependencies,
  exceptions,
  traces,
  customEvents,
  AppRequests,
  AppDependencies,
  AppExceptions,
  AppTraces,
  AppEvents
| take 1000`

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const content = await response.text()

  try {
    return JSON.parse(content) as T
  } catch {
    throw new Error(`API returned non-JSON response (${response.status}): ${content.slice(0, 120)}`)
  }
}

function uniqueValues(values: string[]) {
  return [...new Set(values)].sort()
}

function describeField(fieldName: string) {
  const normalized = fieldName.toLowerCase()

  if (normalized.includes('time')) return 'Timestamp or time-bucket field used for trend and incident-window analysis.'
  if (normalized.includes('duration')) return 'Latency/duration field useful for slow request and dependency analysis.'
  if (normalized.includes('success')) return 'Boolean health signal used to separate successful and failed telemetry.'
  if (normalized.includes('result') || normalized.includes('status') || normalized.includes('code')) {
    return 'Outcome/status field useful for grouping errors and response codes.'
  }
  if (normalized.includes('operation') || normalized === 'name') {
    return 'Operation or event name field used to identify APIs, dependencies, traces, or custom events.'
  }
  if (normalized.includes('custom') || normalized.includes('propert')) {
    return 'Container for custom application/business dimensions emitted with telemetry.'
  }
  if (normalized.includes('cloud') || normalized.includes('role')) {
    return 'Cloud role or component identity field useful for service ownership and topology.'
  }
  if (normalized.includes('id')) return 'Identifier/correlation field useful for joining telemetry across a request flow.'

  return 'Telemetry field discovered on the selected table. Use it in KQL filters, summaries, or joins as needed.'
}

function BreakdownTable({ rows }: { rows: BreakdownRow[] }) {
  return (
    <div className="breakdown-table">
      <div className="breakdown-header">
        <span>Segment</span>
        <span>Records</span>
        <span>Failures</span>
        <span>Failure rate</span>
        <span>Avg latency</span>
      </div>
      {rows.map((row) => (
        <div key={row.key} className={row.failures > 0 ? 'risk-row' : ''}>
          <strong>{row.key}</strong>
          <span>{row.records}</span>
          <span>{row.failures}</span>
          <span>{formatPercent(row.failureRate)}</span>
          <span>{row.averageDurationMs}ms</span>
        </div>
      ))}
    </div>
  )
}

function BarChart({
  title,
  rows,
  metric,
}: {
  title: string
  rows: BreakdownRow[]
  metric: 'failures' | 'averageDurationMs'
}) {
  const maxValue = Math.max(...rows.map((row) => row[metric]), 1)

  return (
    <article className="chart-card">
      <h3>{title}</h3>
      <div className="bar-chart">
        {rows.map((row) => {
          const value = row[metric]
          const width = Math.max((value / maxValue) * 100, value > 0 ? 8 : 2)

          return (
            <div key={`${title}-${row.key}`} className="bar-row">
              <span>{row.key}</span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${width}%` }}></div>
              </div>
              <strong>{metric === 'failures' ? value : `${value}ms`}</strong>
            </div>
          )
        })}
      </div>
    </article>
  )
}

function App() {
  const [question, setQuestion] = useState(demoQuestions[0])
  const [activeQuestion, setActiveQuestion] = useState<DemoQuestion>(demoQuestions[0])
  const [visibleAnalysisSteps, setVisibleAnalysisSteps] = useState(analysisSteps.length)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [connectionMode, setConnectionMode] = useState<'sample' | 'azure'>('sample')
  const [workspaceId, setWorkspaceId] = useState('')
  const [timeRange, setTimeRange] = useState<'1h' | '12h' | '24h' | '7d'>('12h')
  const [azureQuery, setAzureQuery] = useState(defaultAzureDiscoveryQuery)
  const [azureStatus, setAzureStatus] = useState('Azure connector is ready to test.')
  const [azureSummary, setAzureSummary] = useState('')
  const [azureAiAnswer, setAzureAiAnswer] = useState('')
  const [azureTelemetryResult, setAzureTelemetryResult] = useState<AzureTelemetryResult | null>(null)
  const [liveCopilotAnswer, setLiveCopilotAnswer] = useState<CopilotResponse | null>(null)
  const [liveSchema, setLiveSchema] = useState<UiSchemaSummary | null>(null)
  const [selectedTableName, setSelectedTableName] = useState('requests')
  const [selectedDimensionKey, setSelectedDimensionKey] = useState('buildVersion')
  const sampleSchema = useMemo(() => discoverSchema(sampleTelemetry), [])
  const schema: UiSchemaSummary = connectionMode === 'azure' && liveSchema ? liveSchema : sampleSchema
  const analysis = useMemo(() => analyzeTelemetry(sampleTelemetry, question), [question])
  const copilotAnswer = connectionMode === 'azure' && liveCopilotAnswer ? liveCopilotAnswer : copilotResponses[activeQuestion]
  const selectedTable = schema.tables.find((table) => table.name === selectedTableName) ?? schema.tables[0]
  const isLiveAzureMode = connectionMode === 'azure' && Boolean(liveSchema)
  const discoveredFieldCount = uniqueValues(schema.tables.flatMap((table) => table.columns)).length
  const tableNamesSummary =
    schema.tables
      .slice(0, 5)
      .map((table) => table.name)
      .join(', ') || 'Run discovery to load live tables'
  const fieldInterpretations =
    selectedTable?.columns.map((column) => {
      const matchedDimension = schema.customDimensions.find((dimension) => dimension.key === column)

      return {
        key: column,
        likelyMeaning: matchedDimension?.likelyMeaning ?? describeField(column),
        examples: matchedDimension?.examples ?? [],
      }
    }) ?? []
  const selectedField =
    fieldInterpretations.find((field) => field.key === selectedDimensionKey) ?? fieldInterpretations[0]

  function chooseQuestion(nextQuestion: DemoQuestion) {
    setQuestion(nextQuestion)
  }

  function selectTable(tableName: string, firstColumn?: string) {
    setSelectedTableName(tableName)

    if (firstColumn) {
      setSelectedDimensionKey(firstColumn)
    }
  }

  async function askCopilot() {
    const typedQuestion = question.trim()

    if (!typedQuestion) {
      return
    }

    const normalizedQuestion = typedQuestion.toLowerCase()
    const matchingQuestion = demoQuestions.find((demoQuestion) => demoQuestion.toLowerCase() === normalizedQuestion)
    const nextQuestion =
      connectionMode === 'azure'
        ? typedQuestion
        : matchingQuestion ??
          (normalizedQuestion.includes('error')
            ? 'Why are errors increasing?'
            : normalizedQuestion.includes('region') || normalizedQuestion.includes('user')
              ? 'Which region is impacted?'
              : normalizedQuestion.includes('slow') || normalizedQuestion.includes('latency')
                ? 'Show slow APIs.'
                : 'What is wrong with my system?')

    setQuestion(nextQuestion)

    if (connectionMode !== 'azure') {
      setActiveQuestion(nextQuestion as DemoQuestion)
    } else if (matchingQuestion) {
      setActiveQuestion(matchingQuestion)
    }

    setIsAnalyzing(true)
    setVisibleAnalysisSteps(0)

    analysisSteps.forEach((_, index) => {
      window.setTimeout(() => {
        setVisibleAnalysisSteps(index + 1)
        if (index === analysisSteps.length - 1) {
          setIsAnalyzing(false)
        }
      }, 450 * (index + 1))
    })

    if (connectionMode !== 'azure') {
      return
    }

    setAzureStatus('Generating KQL, querying telemetry, then analyzing returned rows...')
    setAzureSummary('')
    setAzureAiAnswer('')

    try {
      const response = await fetch('/api/ai/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: nextQuestion,
          workspaceId,
          timeRange,
          telemetryResult: azureTelemetryResult,
          telemetrySchema: liveSchema,
          currentKql: azureQuery,
        }),
      })
      const result = await readJsonResponse<LiveCopilotResponse>(response)

      if (!response.ok || result.error) {
        throw new Error(result.error ?? 'Azure OpenAI Copilot request failed.')
      }

      const executedKql = result.kql ?? azureQuery
      const liveResult = result.queryResult ?? null
      const rowCount = liveResult?.tables?.reduce((total, table) => total + table.rows.length, 0) ?? 0

      setLiveCopilotAnswer({
        summary: result.summary ?? 'Azure OpenAI returned a response without a summary.',
        finding: result.finding ?? 'Live Azure finding',
        rootCause: result.rootCause ?? 'Needs investigation',
        evidence: result.evidence ?? 'See Azure telemetry evidence',
        nextAction: result.nextAction ?? 'Review telemetry and validate next action',
        kql: executedKql,
        findings: Array.isArray(result.findings)
          ? result.findings
          : ['Azure OpenAI generated this response from the executed telemetry query.'],
      })
      setAzureQuery(executedKql)
      setAzureTelemetryResult(liveResult)
      setAzureStatus('Live Copilot query completed.')
      setAzureSummary(`Executed generated KQL and returned ${rowCount} telemetry row(s).`)
    } catch (error) {
      setAzureStatus(error instanceof Error ? error.message : 'Unable to run the live Copilot telemetry query.')
      setLiveCopilotAnswer({
        summary:
          error instanceof Error
            ? error.message
            : 'Unable to generate a live Azure OpenAI answer.',
        finding: 'Live Copilot unavailable',
        rootCause: 'Azure OpenAI is not configured or unreachable',
        evidence: 'Check .env values and backend logs',
        nextAction: 'Configure Azure OpenAI in .env and restart npm run dev:full',
        kql: azureQuery,
        findings: [
          'Sample mode still works with deterministic demo answers.',
          'Live Azure mode requires backend, Azure OpenAI configuration, and either App Insights API key auth or Log Analytics access.',
        ],
      })
    }
  }

  async function testBackend() {
    setAzureStatus('Checking Telemetry Copilot API...')
    setAzureSummary('')
    setAzureAiAnswer('')

    try {
      const response = await fetch('/api/health')
      const result = (await response.json()) as {
        ok?: boolean
        azureOpenAIConfigured?: boolean
        applicationInsightsConfigured?: boolean
        telemetryAuthMode?: string
        error?: string
      }

      if (!response.ok) {
        throw new Error(result.error ?? 'Telemetry Copilot API health check failed.')
      }

      setAzureStatus(
        `API online. Azure OpenAI is ${
          result.azureOpenAIConfigured ? 'configured' : 'not configured yet'
        }. Telemetry auth: ${result.telemetryAuthMode ?? 'not detected'}.`,
      )
    } catch (error) {
      setAzureStatus(
        error instanceof Error
          ? error.message
          : 'Unable to reach the Telemetry Copilot API. Run npm run dev:full to start both frontend and backend.',
      )
    }
  }

  async function queryAzureTelemetry() {
    setAzureStatus('Querying telemetry...')
    setAzureSummary('')
    setAzureAiAnswer('')

    try {
      const response = await fetch('/api/azure/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          timeRange,
          query: azureQuery,
        }),
      })
      const result = (await response.json()) as {
        status?: string
        tables?: Array<{ name: string; rows: unknown[] }>
        error?: string
      }

      if (!response.ok || result.error) {
        throw new Error(result.error ?? 'Azure Monitor query failed.')
      }

      const rowCount = result.tables?.reduce((total, table) => total + table.rows.length, 0) ?? 0
      setAzureTelemetryResult(result)
      setAzureSummary(`Telemetry query returned ${rowCount} rows from ${result.tables?.length ?? 0} table(s).`)
      setAzureStatus('Telemetry query completed.')

      const aiResponse = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          telemetryResult: result,
        }),
      })
      const aiResult = (await aiResponse.json()) as { answer?: string; error?: string }

      setAzureAiAnswer(
        aiResponse.ok && aiResult.answer
          ? aiResult.answer
          : aiResult.error ?? 'Azure OpenAI analysis is not configured yet.',
      )
    } catch (error) {
      setAzureStatus(error instanceof Error ? error.message : 'Unable to query Azure telemetry.')
    }
  }

  async function discoverAzureTelemetry() {
    setAzureStatus('Discovering live Azure schema with Azure OpenAI...')
    setAzureSummary('')
    setAzureAiAnswer('')

    try {
      const response = await fetch('/api/ai/discovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          timeRange,
          discoveryKql: azureQuery,
        }),
      })
      const result = (await response.json()) as LiveDiscoveryResponse

      if (!response.ok || result.error) {
        throw new Error(result.error ?? 'Azure telemetry discovery failed.')
      }

      setLiveSchema({
        summary: result.summary,
        tables: result.tables ?? [],
        customDimensions: result.customDimensions ?? [],
      })
      setAzureTelemetryResult(result.queryResult ?? null)

      if (result.kql) {
        setAzureQuery(result.kql)
      }

      if (result.tables?.[0]) {
        setSelectedTableName(result.tables[0].name)
        setSelectedDimensionKey(result.tables[0].columns[0] ?? '')
      }

      setAzureStatus('Live Azure discovery completed.')
      setAzureSummary(
        `Discovered ${result.tables?.length ?? 0} table(s) and ${
          result.customDimensions?.length ?? 0
        } custom dimension(s). Tables/columns come from metadata when available; custom dimensions are sampled from recent telemetry rows.`,
      )
    } catch (error) {
      setAzureStatus(error instanceof Error ? error.message : 'Unable to discover live Azure telemetry schema.')
    }
  }

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Telemetry Copilot · AI Meets Data</p>
          <h1>Telemetry Copilot</h1>
          <h2 className="hero-title">AI Copilot that makes unknown telemetry usable in minutes</h2>
          <p className="hero-copy">
            Connect Azure-style telemetry or use the sample incident. Telemetry Copilot discovers what
            data exists, explains custom dimensions, converts natural language into KQL, and turns
            noisy signals into a root-cause story.
          </p>
          <div className="hero-actions">
            <a href="#schema-discovery">Explore discovery</a>
          </div>
        </div>
        <div className="hero-card">
          <div>
            <span className="status-dot"></span>
            {isLiveAzureMode ? 'Live telemetry discovered' : 'Unknown telemetry made usable'}
            <strong>
              {isLiveAzureMode
                ? `${schema.tables.length} live telemetry tables`
                : `${sampleTelemetry.length} Azure-style telemetry records`}
            </strong>
            <p>
              {isLiveAzureMode
                ? `${discoveredFieldCount} fields and ${schema.customDimensions.length} custom dimensions discovered from the connected telemetry source.`
                : 'Schema, custom dimensions, KQL, charts, and RCA generated from synthetic telemetry.'}
            </p>
          </div>
          <div className="hero-source-actions" aria-label="Choose data source">
            <button
              type="button"
              className={connectionMode === 'sample' ? 'active' : ''}
              aria-pressed={connectionMode === 'sample'}
              onClick={() => setConnectionMode('sample')}
            >
              Sample telemetry
            </button>
            <button
              type="button"
              className={connectionMode === 'azure' ? 'active' : ''}
              aria-pressed={connectionMode === 'azure'}
              onClick={() => setConnectionMode('azure')}
            >
              Azure telemetry
            </button>
          </div>
        </div>
      </section>

      {connectionMode === 'azure' && (
        <section className="panel azure-connector-panel" id="data-source">
          <p className="eyebrow">Azure telemetry</p>
          <h2>Connect Azure Monitor or Application Insights</h2>
          <div className="connector-card">
            <div className="connector-form">
              <label>
                Log Analytics Workspace ID
                <input
                  value={workspaceId}
                  onChange={(event) => setWorkspaceId(event.target.value)}
                  placeholder="Optional if APPLICATIONINSIGHTS_APP_ID/API_KEY are in .env"
                />
              </label>
              <label>
                Application Insights App ID
                <input placeholder="Configured in backend .env, not entered in browser" disabled />
              </label>
              <label>
                Time range
                <select value={timeRange} onChange={(event) => setTimeRange(event.target.value as typeof timeRange)}>
                  <option value="1h">Last 1 hour</option>
                  <option value="12h">Last 12 hours</option>
                  <option value="24h">Last 24 hours</option>
                  <option value="7d">Last 7 days</option>
                </select>
              </label>
              <label>
                Authentication
                <select defaultValue="app-insights-api-key">
                  <option value="app-insights-api-key">Application Insights API key from .env</option>
                  <option value="managed-identity">DefaultAzureCredential / az login</option>
                </select>
              </label>
            </div>
            <label className="question-input azure-query-input">
              Discovery KQL
              <textarea
                value={azureQuery}
                onChange={(event) => setAzureQuery(event.target.value)}
                rows={4}
              />
            </label>
            <div className="connector-actions">
              <button type="button" onClick={testBackend}>
                Test backend
              </button>
              <button type="button" onClick={discoverAzureTelemetry}>
                Discover schema
              </button>
              <button type="button" className="primary-action" onClick={queryAzureTelemetry}>
                Query Azure telemetry
              </button>
            </div>
            <div className="connector-result">
              <strong>{azureStatus}</strong>
              {azureSummary && <p>{azureSummary}</p>}
              {azureAiAnswer && (
                <div className="ai-answer">
                  <span>Azure OpenAI analysis</span>
                  <p>{azureAiAnswer}</p>
                </div>
              )}
            </div>
            <p className="connector-note">
              API keys and client secrets should never be entered in this browser UI. If
              APPLICATIONINSIGHTS_APP_ID and APPLICATIONINSIGHTS_API_KEY are set in .env, the local
              backend queries Application Insights with that read key. Otherwise it falls back to
              DefaultAzureCredential for Log Analytics.
            </p>
          </div>
        </section>
      )}

      <section className="grid three">
        <article className="metric-card">
          <span>Discovered tables</span>
          <strong>{schema.tables.length}</strong>
          <p>{isLiveAzureMode ? tableNamesSummary : 'requests, dependencies, traces, exceptions, custom events'}</p>
        </article>
        <article className="metric-card">
          <span>{isLiveAzureMode ? 'Discovered fields' : 'Custom dimensions'}</span>
          <strong>{isLiveAzureMode ? discoveredFieldCount : schema.customDimensions.length}</strong>
          <p>
            {isLiveAzureMode
              ? `${schema.customDimensions.length} custom dimensions interpreted from recent telemetry.`
              : 'region, tenantId, buildVersion, featureFlag, provider, and more'}
          </p>
        </article>
        <article className="metric-card">
          <span>{isLiveAzureMode ? 'Live analysis' : 'Primary signal'}</span>
          <strong>{isLiveAzureMode ? liveCopilotAnswer?.finding ?? 'Ready for RCA' : 'ProviderB'}</strong>
          <p>
            {isLiveAzureMode
              ? liveCopilotAnswer?.evidence ?? 'Ask Copilot to detect incidents, evidence, and RCA from live telemetry.'
              : 'Timeout failures correlated with build 2026.06.01.4'}
          </p>
        </article>
      </section>

      <section className="incident-banner">
        <div>
          <span className="incident-icon">🚨</span>
          <p className="eyebrow">Incident detected</p>
          <h2>Checkout failures spiked after deployment</h2>
          <p>
            Telemetry Copilot correlated deployment, dependency, region, feature flag, latency, and error
            signals into one explainable incident.
          </p>
          <div className="incident-actions">
            <a href="#rca">View incident RCA</a>
          </div>
        </div>
        <div className="incident-root">
          <span>Root cause</span>
          <strong>Payment gateway timeout</strong>
          <small>ProviderB · West Europe · provider-routing-v2</small>
        </div>
      </section>

      <section className="panel copilot-panel" id="nl-kql">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Ask Telemetry Copilot</p>
            <h2>Chat with your telemetry, not your dashboards</h2>
            <p className="section-copy">
              Ask in plain English. Telemetry Copilot discovers context, generates KQL, explains the
              answer, and links the evidence back to the incident.
            </p>
          </div>
          <div className="context-card">
            <span>Context understood</span>
            <strong>
              {schema.tables.length} tables · {discoveredFieldCount} fields · {schema.customDimensions.length} custom dimensions
            </strong>
            <p>
              {isLiveAzureMode
                ? `Selected table: ${selectedTable?.name ?? 'none'} · ${selectedTable?.columns.length ?? 0} fields`
                : 'Incident window: 2:05 PM - 2:15 PM · Primary signal: ProviderB timeout'}
            </p>
            <small>
              Mode: {connectionMode === 'azure' ? 'Local Azure OpenAI / QA telemetry' : 'Public demo / synthetic data'}
            </small>
          </div>
        </div>

        <div className="chat-layout">
          <div className="chat-card">
            <div className="chat-message assistant-message">
              <span>Telemetry Copilot</span>
              <p>
                I discovered requests, dependencies, exceptions, traces, custom events, and custom
                dimensions like buildVersion, region, featureFlag, tenantId, and paymentProvider.
              </p>
            </div>
            <div className="chat-message user-message">
              <span>You</span>
              <textarea
                aria-label="Ask anything about your telemetry"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                rows={2}
                placeholder="Ask anything about your telemetry..."
              />
              <button type="button" onClick={askCopilot}>
                Ask Copilot
              </button>
            </div>
            <div className="chat-message assistant-message answer-message">
              <span>Telemetry Copilot answer</span>
              <p>{copilotAnswer.summary}</p>
              <div className="answer-card-grid">
                <article>
                  <small>Finding</small>
                  <strong>{copilotAnswer.finding}</strong>
                </article>
                <article>
                  <small>Root cause</small>
                  <strong>{copilotAnswer.rootCause}</strong>
                </article>
                <article>
                  <small>Evidence</small>
                  <strong>{copilotAnswer.evidence}</strong>
                </article>
                <article>
                  <small>Next action</small>
                  <strong>{copilotAnswer.nextAction}</strong>
                </article>
              </div>
            </div>
            <div className="quick-prompts">
              {demoQuestions.map((demoQuestion) => (
                <button
                  key={demoQuestion}
                  type="button"
                  className={activeQuestion === demoQuestion ? 'active-prompt' : ''}
                  onClick={() => chooseQuestion(demoQuestion)}
                >
                  {demoQuestion}
                </button>
              ))}
            </div>
          </div>

          <aside className="copilot-sidecar">
            <div className="reasoning-card">
              <span>{isAnalyzing ? 'Copilot is analyzing...' : 'Copilot analysis complete'}</span>
              <ul>
                {analysisSteps.map((step, index) => (
                  <li
                    key={step}
                    className={index < visibleAnalysisSteps ? 'analysis-step visible' : 'analysis-step pending'}
                  >
                    <span>{index < visibleAnalysisSteps ? '✓' : '•'}</span>
                    {step}
                  </li>
                ))}
              </ul>
            </div>
            <div className="reasoning-card">
              <span>Evidence for this answer</span>
              <ul>
                {copilotAnswer.findings.map((finding) => (
                  <li key={finding}>✓ {finding}</li>
                ))}
              </ul>
            </div>
            <details className="kql-details">
              <summary>View generated KQL</summary>
              <pre>{copilotAnswer.kql}</pre>
            </details>
            <a className="rca-link-button" href="#rca">Open full RCA</a>
          </aside>
        </div>
      </section>

      <section className="grid two" id="schema-discovery">
        <article className="panel">
          <p className="eyebrow">Auto-discovery</p>
          <h2>Clickable telemetry map</h2>
          <p className="section-copy">
            Telemetry Copilot inspects unknown telemetry and reveals the tables, fields, and useful
            dimensions. Select any discovered table to inspect the schema.
          </p>
          {connectionMode === 'azure' && liveSchema?.summary && (
            <p className="section-copy">{liveSchema.summary}</p>
          )}
          <div className="table-list">
            {schema.tables.map((table) => (
              <button
                key={table.name}
                type="button"
                className={`table-pill discovery-card ${selectedTable?.name === table.name ? 'selected' : ''}`}
                onClick={() => selectTable(table.name, table.columns[0])}
              >
                <strong>{table.name}</strong>
                <span>{table.records} records</span>
                <small>{table.columns.join(', ')}</small>
              </button>
            ))}
          </div>
          {selectedTable && (
            <div className="discovery-detail">
              <span>Selected table</span>
              <strong>{selectedTable.name}</strong>
              <p>{selectedTable.records} records discovered with {selectedTable.columns.length} fields.</p>
              <div className="field-chips">
                {selectedTable.columns.map((column) => (
                  <small key={column}>{column}</small>
                ))}
              </div>
            </div>
          )}
        </article>

        <article className="panel">
          <p className="eyebrow">Selected table fields</p>
          <h2>AI field interpreter</h2>
          <p className="section-copy">
            Select a table on the telemetry map. This panel shows only fields from that table and
            explains how each field can help analysis.
          </p>
          <div className="dimension-list">
            {fieldInterpretations.map((field) => (
              <button
                key={field.key}
                type="button"
                className={`dimension-card discovery-card ${
                  selectedField?.key === field.key ? 'selected' : ''
                }`}
                onClick={() => setSelectedDimensionKey(field.key)}
              >
                <strong>{field.key}</strong>
                <p>{field.likelyMeaning}</p>
                <small>{field.examples.length ? field.examples.join(' · ') : selectedTable?.name}</small>
              </button>
            ))}
          </div>
          {selectedField && (
            <div className="discovery-detail">
              <span>Selected field from {selectedTable?.name}</span>
              <strong>{selectedField.key}</strong>
              <p>{selectedField.likelyMeaning}</p>
              <div className="field-chips">
                {(selectedField.examples.length ? selectedField.examples : ['No examples sampled yet']).map((example) => (
                  <small key={example}>{example}</small>
                ))}
              </div>
            </div>
          )}
        </article>
      </section>

      <section className="panel" id="breakdowns">
        <p className="eyebrow">AI insights across telemetry</p>
        <h2>User-wise, region-wise, build-wise, and time-wise findings</h2>
        <div className="chart-grid">
          <BarChart title="Failures by tenant" rows={analysis.breakdowns.byTenant} metric="failures" />
          <BarChart title="Latency by time window" rows={analysis.breakdowns.byTimeWindow} metric="averageDurationMs" />
        </div>
        <div className="insight-list">
          {analysis.insights.map((insight) => (
            <article key={insight.title} className={`insight-card ${insight.severity.toLowerCase()}`}>
              <span>{insight.severity}</span>
              <strong>{insight.title}</strong>
              <p>{insight.explanation}</p>
            </article>
          ))}
        </div>
        <div className="breakdown-grid">
          <article>
            <h3>User / tenant-wise</h3>
            <BreakdownTable rows={analysis.breakdowns.byTenant} />
          </article>
          <article>
            <h3>Region-wise</h3>
            <BreakdownTable rows={analysis.breakdowns.byRegion} />
          </article>
          <article>
            <h3>Build-wise</h3>
            <BreakdownTable rows={analysis.breakdowns.byBuildVersion} />
          </article>
          <article>
            <h3>Time-wise</h3>
            <BreakdownTable rows={analysis.breakdowns.byTimeWindow} />
          </article>
        </div>
      </section>

      <section className="panel rca-panel" id="rca">
        <div className="rca-header">
          <span className="incident-icon">🚨</span>
          <div>
            <p className="eyebrow">Automated RCA</p>
            <h2>Incident Detected: checkout failure spike</h2>
            <p>{analysis.rca.incident}</p>
          </div>
        </div>
        <div className="rca-story-grid">
          <article className="rca-card root-cause">
            <span>Root Cause</span>
            <strong>Payment gateway timeout</strong>
            <p>ProviderB authorization calls exceeded the checkout timeout threshold.</p>
          </article>
          <article className="rca-card confidence-card">
            <span>Confidence score</span>
            <strong>87%</strong>
            <p>High confidence based on deployment timing, dependency failures, region concentration, and feature flag correlation.</p>
          </article>
          <article className="rca-card">
            <span>Impact</span>
            <strong>West Europe checkout users</strong>
            <p>{analysis.rca.impact}</p>
          </article>
          <article className="rca-card">
            <span>Feature correlation</span>
            <strong>provider-routing-v2</strong>
            <p>Failures appeared after build 2026.06.01.4 enabled the new provider route.</p>
          </article>
        </div>
        <div className="signal-grid">
          <div className="signal-card danger">
            <span>Latency ↑</span>
            <strong>1.3s+</strong>
          </div>
          <div className="signal-card danger">
            <span>Errors ↑</span>
            <strong>504</strong>
          </div>
          <div className="signal-card">
            <span>Region</span>
            <strong>West Europe</strong>
          </div>
          <div className="signal-card">
            <span>Provider</span>
            <strong>ProviderB</strong>
          </div>
        </div>
        <article className="timeline-panel">
          <h3>Incident timeline</h3>
          <div className="timeline">
            {incidentTimeline.map((event) => (
              <div key={event.time} className="timeline-item">
                <time>{event.time}</time>
                <div>
                  <strong>{event.title}</strong>
                  <p>{event.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </article>
        <div className="grid two">
          <article className="evidence-panel">
            <h3>Correlated signals</h3>
            <ul>
              <li>Latency increased after deployment.</li>
              <li>Errors increased with HTTP 504 responses.</li>
              <li>Region concentrated in West Europe.</li>
              <li>Feature flag provider-routing-v2 selected ProviderB.</li>
              {analysis.rca.evidence.map((evidence) => (
                <li key={evidence}>{evidence}</li>
              ))}
            </ul>
          </article>
          <article className="recommendation-panel">
            <h3>Recommended actions</h3>
            <ol>
              <li>Switch provider fallback to ProviderA.</li>
              <li>Disable provider-routing-v2 for West Europe.</li>
              {analysis.rca.recommendedActions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ol>
          </article>
        </div>
      </section>

      <section className="before-after">
        <h2>Before vs after</h2>
        <div className="comparison-grid">
          <span>Unknown telemetry</span>
          <strong>Auto-discovered insights</strong>
          <span>Custom events unclear</span>
          <strong>AI interprets custom dimensions</strong>
          <span>KQL expertise required</span>
          <strong>Natural language to safe KQL</strong>
          <span>Manual RCA</span>
          <strong>Evidence-grounded incident report</strong>
          <span>Static alerts</span>
          <strong>Adaptive alert recommendations</strong>
        </div>
      </section>
    </main>
  )
}

export default App
