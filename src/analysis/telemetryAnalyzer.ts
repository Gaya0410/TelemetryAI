import type { TelemetryRecord, TelemetryTable } from '../data/sampleTelemetry'

export type SchemaSummary = {
  tables: Array<{
    name: TelemetryTable
    records: number
    columns: string[]
  }>
  customDimensions: Array<{
    key: string
    examples: string[]
    likelyMeaning: string
  }>
}

export type AnalysisResult = {
  question: string
  generatedKql: string
  summary: string
  findings: string[]
  rca: {
    incident: string
    impact: string
    evidence: string[]
    likelyRootCause: string
    recommendedActions: string[]
  }
}

const dimensionMeanings: Record<string, string> = {
  serviceName: 'Owning service that emitted the telemetry.',
  cloudRole: 'Runtime role or deployment unit, commonly used in Azure Application Insights.',
  environment: 'Deployment environment such as production, staging, or development.',
  region: 'Azure/user region where the request or dependency call was handled.',
  buildVersion: 'Application build or release version; useful for deployment correlation.',
  tenantId: 'Customer or tenant identifier; useful for blast-radius analysis.',
  paymentProvider: 'Downstream payment dependency selected during checkout.',
  featureFlag: 'Feature flag active for the request; useful for rollout correlation.',
  releaseId: 'Deployment or release pipeline identifier.',
  deploymentSlot: 'Deployment slot used during rollout.',
  selectedRoute: 'Business route chosen by the application logic.',
}

function unique(values: string[]) {
  return [...new Set(values)].sort()
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`
}

function average(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function groupByDimension(records: TelemetryRecord[], dimension: string) {
  const grouped = new Map<string, TelemetryRecord[]>()

  records.forEach((record) => {
    const value = record.customDimensions[dimension] ?? 'unknown'
    grouped.set(value, [...(grouped.get(value) ?? []), record])
  })

  return [...grouped.entries()].map(([key, items]) => ({
    key,
    records: items.length,
    failures: items.filter((item) => item.success === false).length,
    averageDurationMs: Math.round(average(items.map((item) => item.durationMs ?? 0).filter(Boolean))),
  }))
}

export function discoverSchema(records: TelemetryRecord[]): SchemaSummary {
  const tableNames = unique(records.map((record) => record.table)) as TelemetryTable[]
  const dimensions = unique(records.flatMap((record) => Object.keys(record.customDimensions)))

  return {
    tables: tableNames.map((name) => {
      const tableRecords = records.filter((record) => record.table === name)
      const columns = unique(
        tableRecords.flatMap((record) =>
          Object.entries(record)
            .filter(([, value]) => value !== undefined && value !== null)
            .map(([key]) => key),
        ),
      )

      return {
        name,
        records: tableRecords.length,
        columns,
      }
    }),
    customDimensions: dimensions.map((key) => ({
      key,
      examples: unique(records.map((record) => record.customDimensions[key]).filter(Boolean)).slice(0, 4),
      likelyMeaning: dimensionMeanings[key] ?? 'Custom business/application field discovered from telemetry payloads.',
    })),
  }
}

export function analyzeTelemetry(records: TelemetryRecord[], question: string): AnalysisResult {
  const checkoutRequests = records.filter(
    (record) => record.table === 'requests' && record.operationName === 'POST /checkout',
  )
  const preDeployment = checkoutRequests.filter(
    (record) => record.customDimensions.buildVersion === '2026.06.01.3',
  )
  const postDeployment = checkoutRequests.filter(
    (record) => record.customDimensions.buildVersion === '2026.06.01.4',
  )
  const failedPostDeployment = postDeployment.filter((record) => record.success === false)
  const providerBreakdown = groupByDimension(postDeployment, 'paymentProvider').sort(
    (left, right) => right.failures - left.failures,
  )
  const regionBreakdown = groupByDimension(postDeployment, 'region').sort(
    (left, right) => right.failures - left.failures,
  )
  const failedDependencies = records.filter(
    (record) => record.table === 'dependencies' && record.success === false,
  )
  const exceptions = records.filter((record) => record.table === 'exceptions')

  const preFailureRate = preDeployment.length
    ? preDeployment.filter((record) => record.success === false).length / preDeployment.length
    : 0
  const postFailureRate = postDeployment.length ? failedPostDeployment.length / postDeployment.length : 0
  const preLatency = Math.round(average(preDeployment.map((record) => record.durationMs ?? 0)))
  const postLatency = Math.round(average(postDeployment.map((record) => record.durationMs ?? 0)))

  return {
    question,
    generatedKql: `requests
| where operation_Name == "POST /checkout"
| summarize
    requests=count(),
    failures=countif(success == false),
    failureRate=round(100.0 * countif(success == false) / count(), 2),
    avgDurationMs=round(avg(duration), 0)
  by tostring(customDimensions.buildVersion),
     tostring(customDimensions.region),
     tostring(customDimensions.paymentProvider),
     tostring(customDimensions.featureFlag)
| order by failureRate desc`,
    summary: `Checkout failures increased from ${percent(preFailureRate)} before deployment to ${percent(
      postFailureRate,
    )} after build 2026.06.01.4. Average checkout latency moved from ${preLatency}ms to ${postLatency}ms.`,
    findings: [
      `${failedPostDeployment.length} of ${postDeployment.length} checkout requests failed after build 2026.06.01.4.`,
      `Top failing provider: ${providerBreakdown[0]?.key ?? 'unknown'} with ${
        providerBreakdown[0]?.failures ?? 0
      } failed requests.`,
      `Top affected region: ${regionBreakdown[0]?.key ?? 'unknown'} with ${
        regionBreakdown[0]?.failures ?? 0
      } failed requests.`,
      `${failedDependencies.length} dependency failures point to ProviderB.AuthorizePayment GatewayTimeout.`,
      `${exceptions.length} exceptions mention ProviderB timeout or retry budget exhaustion.`,
    ],
    rca: {
      incident: 'Checkout API failure and latency spike after production deployment rel-4821.',
      impact:
        'Customers routed to ProviderB in West Europe experienced elevated 504 responses and checkout latency above one second.',
      evidence: [
        'Failures started immediately after DeploymentCompleted for build 2026.06.01.4.',
        'Failed requests share customDimensions: region=West Europe, paymentProvider=ProviderB, featureFlag=provider-routing-v2.',
        'Dependency telemetry shows ProviderB.AuthorizePayment GatewayTimeout.',
        'Exceptions include PaymentAuthorizationTimeout and RetryBudgetExhausted.',
      ],
      likelyRootCause:
        'The provider-routing-v2 rollout in build 2026.06.01.4 appears to route West Europe checkout traffic to ProviderB, whose authorization dependency is timing out.',
      recommendedActions: [
        'Rollback or disable featureFlag=provider-routing-v2 for West Europe.',
        'Fail over ProviderB traffic to ProviderA until dependency health recovers.',
        'Create an adaptive alert on ProviderB timeout rate by region and buildVersion.',
        'Add deployment annotation correlation to the permanent Azure Monitor workbook.',
      ],
    },
  }
}
