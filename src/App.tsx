import { useMemo, useState } from 'react'
import { analyzeTelemetry, discoverSchema } from './analysis/telemetryAnalyzer'
import { sampleTelemetry } from './data/sampleTelemetry'
import './App.css'

const demoQuestions = [
  'Why did checkout failures increase after the latest deployment?',
  'Which custom dimensions explain the incident blast radius?',
  'Generate an RCA for the checkout latency spike.',
]

function App() {
  const [question, setQuestion] = useState(demoQuestions[0])
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

      <section className="grid two">
        <article className="panel">
          <p className="eyebrow">Auto-discovery</p>
          <h2>Telemetry map</h2>
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

      <section className="panel rca-panel">
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
