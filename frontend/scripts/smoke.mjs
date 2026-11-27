import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { createClient } from 'graphql-ws'

const { FRONTEND_URL, GRAPHQL_TOKEN } = process.env
assert(FRONTEND_URL && GRAPHQL_TOKEN, 'Set FRONTEND_URL and GRAPHQL_TOKEN')
const endpoint = new URL('/graphql', FRONTEND_URL)
const authorization = `Bearer ${GRAPHQL_TOKEN}`
const headers = { 'content-type': 'application/json', authorization }

async function request(query, variables = {}, requestHeaders = headers) {
  return fetch(endpoint, {
    method: 'POST',
    headers: requestHeaders,
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(12000),
  })
}

async function graphql(query, variables) {
  const response = await request(query, variables)
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert(!payload.errors, 'GraphQL returned errors')
  return payload.data
}

const denied = await request('query { users { id } }', {}, { 'content-type': 'application/json' })
assert.equal(denied.status, 401, 'Unauthenticated GraphQL request must be rejected')
const unauthorizedSocket = new WebSocket(endpoint.href.replace(/^http/, 'ws'), 'graphql-transport-ws')
try {
  const closed = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Unauthorized WebSocket check timed out')), 10000)
    unauthorizedSocket.addEventListener('open', () => unauthorizedSocket.send(JSON.stringify({ type: 'connection_init' })))
    unauthorizedSocket.addEventListener('close', event => {
      clearTimeout(timeout)
      resolve(event.code)
    })
  })
  assert.equal(closed, 4403, 'Unauthenticated WebSocket must be rejected')
} finally {
  unauthorizedSocket.close()
}

const email = `smoke-${randomUUID()}@example.invalid`
const create = 'mutation ($email: String!) { createUser(name: "Release check", email: $email) { id } }'
const update = 'mutation ($id: ID!) { updateUser(id: $id, name: "Release check updated") { id name } }'
const remove = 'mutation ($id: ID!) { deleteUser(id: $id) }'

let id
let stop
let received = false
let subscriptionFailure
let connected
const ready = new Promise(resolve => { connected = resolve })
const client = createClient({
  url: endpoint.href.replace(/^http/, 'ws'),
  connectionParams: { authorization },
  retryAttempts: 0,
  connectionAckWaitTimeout: 8000,
  on: { connected },
})

try {
  id = (await graphql(create, { email })).createUser.id
  const data = await graphql('query ($id: ID!) { user(id: $id) { email } }', { id })
  assert.equal(data.user.email, email)

  stop = client.subscribe({ query: 'subscription { userUpdated { id name } }' }, {
    next: payload => {
      if (payload.errors) subscriptionFailure = new Error('GraphQL subscription returned errors')
      const user = payload.data?.userUpdated
      if (user?.id === id && user.name === 'Release check updated') received = true
    },
    error: () => { subscriptionFailure = new Error('GraphQL WebSocket subscription failed') },
    complete: () => {},
  })
  for (let i = 0; i < 40 && !received; i++) {
    if (subscriptionFailure) throw subscriptionFailure
    const socketReady = await Promise.race([ready.then(() => true), delay(300, false)])
    if (socketReady && i % 4 === 0) {
      const result = await graphql(update, { id })
      assert.equal(result.updateUser.name, 'Release check updated')
    }
    await delay(300)
  }
  assert(received, 'Mutation event did not reach the WebSocket subscription')
} finally {
  stop?.()
  await client.dispose()
  if (id) assert.equal((await graphql(remove, { id })).deleteUser, true)
}
console.log('GraphQL HTTP authorization, WebSocket authorization, CRUD and live updates passed')
