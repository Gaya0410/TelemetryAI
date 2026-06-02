export type TelemetryTable = 'requests' | 'exceptions' | 'dependencies' | 'traces' | 'customEvents'

export type TelemetryRecord = {
  id: string
  timestamp: string
  table: TelemetryTable
  operationName: string
  durationMs?: number
  success?: boolean
  resultCode?: string
  severityLevel?: 'info' | 'warning' | 'error'
  message?: string
  dependencyTarget?: string
  customDimensions: Record<string, string>
}

const baseTime = Date.UTC(2026, 5, 1, 9, 0, 0)

function at(minutes: number) {
  return new Date(baseTime + minutes * 60_000).toISOString()
}

function request(
  id: string,
  minutes: number,
  operationName: string,
  durationMs: number,
  success: boolean,
  resultCode: string,
  customDimensions: Record<string, string>,
): TelemetryRecord {
  return {
    id,
    timestamp: at(minutes),
    table: 'requests',
    operationName,
    durationMs,
    success,
    resultCode,
    customDimensions,
  }
}

function dependency(
  id: string,
  minutes: number,
  operationName: string,
  dependencyTarget: string,
  durationMs: number,
  success: boolean,
  resultCode: string,
  customDimensions: Record<string, string>,
): TelemetryRecord {
  return {
    id,
    timestamp: at(minutes),
    table: 'dependencies',
    operationName,
    dependencyTarget,
    durationMs,
    success,
    resultCode,
    customDimensions,
  }
}

function exception(
  id: string,
  minutes: number,
  operationName: string,
  message: string,
  customDimensions: Record<string, string>,
): TelemetryRecord {
  return {
    id,
    timestamp: at(minutes),
    table: 'exceptions',
    operationName,
    success: false,
    resultCode: '500',
    severityLevel: 'error',
    message,
    customDimensions,
  }
}

function trace(
  id: string,
  minutes: number,
  operationName: string,
  severityLevel: 'info' | 'warning' | 'error',
  message: string,
  customDimensions: Record<string, string>,
): TelemetryRecord {
  return {
    id,
    timestamp: at(minutes),
    table: 'traces',
    operationName,
    severityLevel,
    message,
    customDimensions,
  }
}

function customEvent(
  id: string,
  minutes: number,
  operationName: string,
  customDimensions: Record<string, string>,
): TelemetryRecord {
  return {
    id,
    timestamp: at(minutes),
    table: 'customEvents',
    operationName,
    customDimensions,
  }
}

const shared = {
  serviceName: 'checkout-api',
  cloudRole: 'aks-checkout-prod',
  environment: 'production',
}

const healthyBuild = '2026.06.01.3'
const incidentBuild = '2026.06.01.4'

export const sampleTelemetry: TelemetryRecord[] = [
  request('req-001', 0, 'GET /health', 42, true, '200', {
    ...shared,
    region: 'West Europe',
    buildVersion: healthyBuild,
    tenantId: 'contoso-retail',
    featureFlag: 'provider-routing-v1',
  }),
  request('req-002', 4, 'POST /checkout', 310, true, '200', {
    ...shared,
    region: 'West Europe',
    buildVersion: healthyBuild,
    tenantId: 'contoso-retail',
    paymentProvider: 'ProviderA',
    featureFlag: 'provider-routing-v1',
  }),
  request('req-003', 9, 'POST /checkout', 288, true, '200', {
    ...shared,
    region: 'North Europe',
    buildVersion: healthyBuild,
    tenantId: 'fabrikam-market',
    paymentProvider: 'ProviderA',
    featureFlag: 'provider-routing-v1',
  }),
  dependency('dep-001', 10, 'POST /checkout', 'ProviderA.AuthorizePayment', 190, true, '200', {
    ...shared,
    region: 'North Europe',
    buildVersion: healthyBuild,
    tenantId: 'fabrikam-market',
    paymentProvider: 'ProviderA',
  }),
  request('req-004', 14, 'POST /checkout', 344, true, '200', {
    ...shared,
    region: 'West Europe',
    buildVersion: healthyBuild,
    tenantId: 'contoso-retail',
    paymentProvider: 'ProviderA',
    featureFlag: 'provider-routing-v1',
  }),
  request('req-005', 22, 'POST /cart/apply-coupon', 180, true, '200', {
    ...shared,
    region: 'West Europe',
    buildVersion: healthyBuild,
    tenantId: 'adatum-store',
    featureFlag: 'coupon-v2',
  }),
  customEvent('evt-001', 30, 'DeploymentCompleted', {
    ...shared,
    region: 'West Europe',
    buildVersion: incidentBuild,
    deploymentSlot: 'blue',
    releaseId: 'rel-4821',
    featureFlag: 'provider-routing-v2',
  }),
  trace('trc-001', 31, 'DeploymentCompleted', 'info', 'Build 2026.06.01.4 promoted to production', {
    ...shared,
    region: 'West Europe',
    buildVersion: incidentBuild,
    releaseId: 'rel-4821',
  }),
  request('req-006', 37, 'POST /checkout', 1280, false, '504', {
    ...shared,
    region: 'West Europe',
    buildVersion: incidentBuild,
    tenantId: 'contoso-retail',
    paymentProvider: 'ProviderB',
    featureFlag: 'provider-routing-v2',
  }),
  dependency('dep-002', 37, 'POST /checkout', 'ProviderB.AuthorizePayment', 1160, false, 'GatewayTimeout', {
    ...shared,
    region: 'West Europe',
    buildVersion: incidentBuild,
    tenantId: 'contoso-retail',
    paymentProvider: 'ProviderB',
  }),
  exception('exc-001', 38, 'POST /checkout', 'PaymentAuthorizationTimeout: ProviderB exceeded 1000ms threshold', {
    ...shared,
    region: 'West Europe',
    buildVersion: incidentBuild,
    tenantId: 'contoso-retail',
    paymentProvider: 'ProviderB',
    featureFlag: 'provider-routing-v2',
  }),
  request('req-007', 41, 'POST /checkout', 1422, false, '504', {
    ...shared,
    region: 'West Europe',
    buildVersion: incidentBuild,
    tenantId: 'contoso-retail',
    paymentProvider: 'ProviderB',
    featureFlag: 'provider-routing-v2',
  }),
  request('req-008', 43, 'POST /checkout', 340, true, '200', {
    ...shared,
    region: 'North Europe',
    buildVersion: incidentBuild,
    tenantId: 'fabrikam-market',
    paymentProvider: 'ProviderA',
    featureFlag: 'provider-routing-v2',
  }),
  dependency('dep-003', 44, 'POST /checkout', 'ProviderB.AuthorizePayment', 1350, false, 'GatewayTimeout', {
    ...shared,
    region: 'West Europe',
    buildVersion: incidentBuild,
    tenantId: 'contoso-retail',
    paymentProvider: 'ProviderB',
  }),
  trace('trc-002', 45, 'POST /checkout', 'warning', 'ProviderB timeout rate exceeded dynamic baseline', {
    ...shared,
    region: 'West Europe',
    buildVersion: incidentBuild,
    tenantId: 'contoso-retail',
    paymentProvider: 'ProviderB',
  }),
  request('req-009', 49, 'POST /checkout', 1514, false, '504', {
    ...shared,
    region: 'West Europe',
    buildVersion: incidentBuild,
    tenantId: 'adatum-store',
    paymentProvider: 'ProviderB',
    featureFlag: 'provider-routing-v2',
  }),
  exception('exc-002', 50, 'POST /checkout', 'RetryBudgetExhausted after ProviderB authorization timeout', {
    ...shared,
    region: 'West Europe',
    buildVersion: incidentBuild,
    tenantId: 'adatum-store',
    paymentProvider: 'ProviderB',
    featureFlag: 'provider-routing-v2',
  }),
  request('req-010', 55, 'POST /checkout', 302, true, '200', {
    ...shared,
    region: 'North Europe',
    buildVersion: incidentBuild,
    tenantId: 'fabrikam-market',
    paymentProvider: 'ProviderA',
    featureFlag: 'provider-routing-v2',
  }),
  request('req-011', 58, 'POST /checkout', 1660, false, '504', {
    ...shared,
    region: 'West Europe',
    buildVersion: incidentBuild,
    tenantId: 'contoso-retail',
    paymentProvider: 'ProviderB',
    featureFlag: 'provider-routing-v2',
  }),
  dependency('dep-004', 59, 'POST /checkout', 'ProviderB.AuthorizePayment', 1495, false, 'GatewayTimeout', {
    ...shared,
    region: 'West Europe',
    buildVersion: incidentBuild,
    tenantId: 'contoso-retail',
    paymentProvider: 'ProviderB',
  }),
  customEvent('evt-002', 61, 'FeatureFlagEvaluated', {
    ...shared,
    region: 'West Europe',
    buildVersion: incidentBuild,
    tenantId: 'contoso-retail',
    paymentProvider: 'ProviderB',
    featureFlag: 'provider-routing-v2',
    selectedRoute: 'ProviderB',
  }),
]
