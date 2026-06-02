import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { DefaultAzureCredential } from '@azure/identity'
import { Durations, LogsQueryClient, type LogsQueryResult } from '@azure/monitor-query-logs'
import { AzureOpenAI } from 'openai'

const app = express()
const port = Number(process.env.PORT ?? 7071)

app.use(cors())
app.use(express.json({ limit: '1mb' }))

type TimeRange = '1h' | '24h' | '7d'

const durationByRange: Record<TimeRange, string> = {
  '1h': Durations.oneHour,
  '24h': Durations.twentyFourHours,
  '7d': Durations.sevenDays,
}

function getOpenAIClient() {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT
  const apiKey = process.env.AZURE_OPENAI_API_KEY
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? '2024-10-21'

  if (!endpoint || !apiKey || !deployment) {
    return null
  }

  return {
    deployment,
    client: new AzureOpenAI({
      endpoint,
      apiKey,
      apiVersion,
      deployment,
    }),
  }
}

function normalizeLogsResult(result: LogsQueryResult) {
  if (result.status !== 'Success') {
    return {
      status: result.status,
      tables: [],
      error: 'partialError' in result ? result.partialError : undefined,
    }
  }

  return {
    status: result.status,
    tables: result.tables.map((table) => ({
      name: table.name,
      columns: table.columnDescriptors.map((column) => ({
        name: column.name,
        type: column.type,
      })),
      rows: table.rows,
    })),
  }
}

function validateWorkspaceRequest(body: unknown) {
  if (!body || typeof body !== 'object') {
    throw new Error('Request body is required.')
  }

  const request = body as {
    workspaceId?: unknown
    query?: unknown
    timeRange?: unknown
  }

  if (typeof request.workspaceId !== 'string' || request.workspaceId.trim().length === 0) {
    throw new Error('workspaceId is required.')
  }

  if (typeof request.query !== 'string' || request.query.trim().length === 0) {
    throw new Error('query is required.')
  }

  const timeRange = request.timeRange === '1h' || request.timeRange === '7d' ? request.timeRange : '24h'

  return {
    workspaceId: request.workspaceId.trim(),
    query: request.query.trim(),
    timeRange,
  }
}

app.get('/api/health', (_request, response) => {
  response.json({
    ok: true,
    azureMonitorAuth: 'DefaultAzureCredential',
    azureOpenAIConfigured: Boolean(getOpenAIClient()),
  })
})

app.post('/api/azure/query', async (request, response) => {
  try {
    const { workspaceId, query, timeRange } = validateWorkspaceRequest(request.body)
    const credential = new DefaultAzureCredential()
    const client = new LogsQueryClient(credential)
    const result = await client.queryWorkspace(workspaceId, query, durationByRange[timeRange], {
      serverTimeoutInSeconds: 30,
    })

    response.json(normalizeLogsResult(result))
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : 'Unable to query Azure Monitor.',
    })
  }
})

app.post('/api/ai/analyze', async (request, response) => {
  try {
    const openai = getOpenAIClient()

    if (!openai) {
      response.status(400).json({
        error:
          'Azure OpenAI is not configured. Set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, and AZURE_OPENAI_DEPLOYMENT on the backend.',
      })
      return
    }

    const { question, telemetryResult } = request.body as {
      question?: unknown
      telemetryResult?: unknown
    }

    if (typeof question !== 'string' || question.trim().length === 0) {
      throw new Error('question is required.')
    }

    const completion = await openai.client.chat.completions.create({
      model: openai.deployment,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'You are Telemetry Copilot, an Azure observability analyst. Explain telemetry results with concise RCA, impact, evidence, and recommended actions. Do not invent facts beyond the provided data.',
        },
        {
          role: 'user',
          content: JSON.stringify(
            {
              question,
              telemetryResult,
            },
            null,
            2,
          ),
        },
      ],
    })

    response.json({
      answer: completion.choices[0]?.message.content ?? 'No analysis returned.',
    })
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : 'Unable to analyze telemetry.',
    })
  }
})

app.listen(port, () => {
  console.log(`Telemetry Copilot API listening on http://localhost:${port}`)
})
