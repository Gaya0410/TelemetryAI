import { useMemo, useState } from 'react'
import { analyzeTelemetry, discoverSchema, type BreakdownRow } from './analysis/telemetryAnalyzer'
import { sampleTelemetry } from './data/sampleTelemetry'
import './App.css'

const demoQuestions = [
  'Why did checkout failures increase after the latest deployment?',
  'Which custom dimensions explain the incident blast radius?',
  'Show the user-wise and time-wise failure pattern.',
  'Generate an RCA for the checkout latency spike.',
]

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
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
  const [connectionMode, setConnectionMode] = useState<'sample' | 'azure'>('sample')
  const schema = useMemo(() => discoverSchema(sampleTelemetry), [])
  const analysis = useMemo(() => analyzeTelemetry(sampleTelemetry, question), [question])

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Microsoft Build AI · AI Meets Data</p>
          <h1>TelemetryAI</h1>
          <p className="hero-copy">
            An AI telemetry intelligence agent that discovers unknown Azure observability data,
            explains custom dimensions, generates KQL, and produces evidence-grounded RCA reports.
          </p>
        </div>
        <div className="hero-card">
          <span className="status-dot"></span>
          Demo dataset loaded
          <strong>{sampleTelemetry.length} Azure-style telemetry records</strong>
        </div>
      </section>

      <section className="grid three">
        <article className="metric-card">
          <span>Discovered tables</span>
          <strong>{schema.tables.length}</strong>
          <p>requests, dependencies, traces, exceptions, custom events</p>
        </article>
        <article className="metric-card">
          <span>Custom dimensions</span>
          <strong>{schema.customDimensions.length}</strong>
          <p>region, tenantId, buildVersion, featureFlag, provider, and more</p>
        </article>
        <article className="metric-card">
          <span>Primary signal</span>
          <strong>ProviderB</strong>
          <p>Timeout failures correlated with build 2026.06.01.4</p>
        </article>
      </section>

      <section className="panel">
        <p className="eyebrow">Data source</p>
        <h2>Connect telemetry or use the sample incident</h2>
        <p className="section-copy">
          Use the sample data for an instant walkthrough, or provide Azure Monitor / Application
          Insights details when the secure backend connector is enabled.
        </p>
        <div className="source-tabs">
          <button
            type="button"
            className={connectionMode === 'sample' ? 'active' : ''}
            onClick={() => setConnectionMode('sample')}
          >
            Sample telemetry
          </button>
          <button
            type="button"
            className={connectionMode === 'azure' ? 'active' : ''}
            onClick={() => setConnectionMode('azure')}
          >
            Azure telemetry
          </button>
        </div>
        <div className="connector-card">
          {connectionMode === 'sample' ? (
            <>
              <strong>Sample Application Insights dataset is active</strong>
              <p>
                The current analysis uses synthetic requests, dependencies, traces, exceptions, and
                custom events so the product can be demonstrated without exposing real customer data.
              </p>
            </>
          ) : (
            <>
              <div className="connector-form">
                <label>
                  Log Analytics Workspace ID
                  <input placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
                </label>
                <label>
                  Application Insights App ID
                  <input placeholder="Optional app id" />
                </label>
                <label>
                  Time range
                  <select defaultValue="24h">
                    <option value="1h">Last 1 hour</option>
                    <option value="24h">Last 24 hours</option>
                    <option value="7d">Last 7 days</option>
                  </select>
                </label>
                <label>
                  Authentication
                  <select defaultValue="managed-identity">
                    <option value="managed-identity">Managed identity</option>
                    <option value="entra">Microsoft Entra ID</option>
                  </select>
                </label>
              </div>
              <p className="connector-note">
                API keys and client secrets should never be entered in this browser UI. The next
                implementation step is a secure backend API that uses managed identity to query Azure
                Monitor and returns only approved telemetry results to this page.
              </p>
            </>
          )}
        </div>
      </section>

      <section className="panel">
        <p className="eyebrow">Product flow</p>
        <h2>Analyze telemetry in four steps</h2>
        <div className="demo-steps">
          <a href="#schema-discovery">
            <strong>1. Schema discovery</strong>
            <span>See discovered tables, columns, and custom dimensions.</span>
          </a>
          <a href="#nl-kql">
            <strong>2. Natural language to KQL</strong>
            <span>Click a question or type your own; generated KQL appears beside the answer.</span>
          </a>
          <a href="#breakdowns">
            <strong>3. User/time insights</strong>
            <span>Compare tenant, region, build, and time-window failure patterns.</span>
          </a>
          <a href="#rca">
            <strong>4. RCA report</strong>
            <span>Review impact, evidence, likely cause, and recommended actions.</span>
          </a>
        </div>
      </section>

      <section className="panel" id="nl-kql">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Natural language to KQL</p>
            <h2>Ask telemetry questions without knowing the schema</h2>
          </div>
          <div className="question-buttons">
            {demoQuestions.map((demoQuestion) => (
              <button key={demoQuestion} type="button" onClick={() => setQuestion(demoQuestion)}>
                {demoQuestion}
              </button>
            ))}
          </div>
        </div>

        <label className="question-input">
          Question
          <textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={3} />
        </label>

        <div className="grid two">
          <article className="code-card">
            <h3>Generated KQL</h3>
            <pre>{analysis.generatedKql}</pre>
          </article>
          <article className="summary-card">
            <h3>AI summary</h3>
            <p>{analysis.summary}</p>
            <ul>
              {analysis.findings.map((finding) => (
                <li key={finding}>{finding}</li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <section className="grid two" id="schema-discovery">
        <article className="panel">
          <p className="eyebrow">Auto-discovery</p>
          <h2>Telemetry map</h2>
          <p className="section-copy">
            This is the schema discovery output: the tool inspected the telemetry records and found
            the available tables and fields without the user providing a dashboard or schema.
          </p>
          <div className="table-list">
            {schema.tables.map((table) => (
              <div key={table.name} className="table-pill">
                <strong>{table.name}</strong>
                <span>{table.records} records</span>
                <small>{table.columns.join(', ')}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <p className="eyebrow">Custom dimensions</p>
          <h2>AI field interpreter</h2>
          <p className="section-copy">
            These are the unknown custom dimensions converted into human meaning so a non-KQL user
            can understand what the telemetry contains.
          </p>
          <div className="dimension-list">
            {schema.customDimensions.slice(0, 8).map((dimension) => (
              <div key={dimension.key}>
                <strong>{dimension.key}</strong>
                <p>{dimension.likelyMeaning}</p>
                <small>{dimension.examples.join(' · ')}</small>
              </div>
            ))}
          </div>
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
        <p className="eyebrow">Automated RCA</p>
        <h2>{analysis.rca.incident}</h2>
        <div className="grid two">
          <div>
            <h3>Impact</h3>
            <p>{analysis.rca.impact}</p>
            <h3>Likely root cause</h3>
            <p>{analysis.rca.likelyRootCause}</p>
          </div>
          <div>
            <h3>Evidence</h3>
            <ul>
              {analysis.rca.evidence.map((evidence) => (
                <li key={evidence}>{evidence}</li>
              ))}
            </ul>
            <h3>Recommended actions</h3>
            <ol>
              {analysis.rca.recommendedActions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ol>
          </div>
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
