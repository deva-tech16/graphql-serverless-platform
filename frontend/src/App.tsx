import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { createClient } from 'graphql-ws'
import './App.css'

type User = { id: string; name: string; email: string }
const fields = 'id name email'

async function graphql<T>(token: string, query: string, variables = {}) {
  const response = await fetch('/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  })
  const result = await response.json()
  if (!response.ok || result.errors?.length) {
    throw new Error(result.errors?.[0]?.message ?? `HTTP ${response.status}`)
  }
  return result.data as T
}

export default function App() {
  const [token, setToken] = useState('')
  const [users, setUsers] = useState<User[]>([])
  const [editing, setEditing] = useState<User | null>(null)
  const [error, setError] = useState('')
  const [activity, setActivity] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!token) return
    let active = true
    async function refresh() {
      try {
        const data = await graphql<{ users: User[] }>(token, `query { users { ${fields} } }`)
        if (active) setUsers(data.users)
      } catch (cause) {
        if (active) setError(String(cause))
      }
    }
    const url = new URL('/graphql', window.location.href)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    const client = createClient({
      url: url.href,
      connectionParams: { authorization: `Bearer ${token}` },
      on: { connected: () => { if (active) void refresh() } },
    })
    const cleanups = (['userCreated', 'userUpdated'] as const).map(event =>
      client.subscribe<{ [name: string]: User }>({ query: `subscription { ${event} { ${fields} } }` }, {
        next: ({ data, errors }) => {
          if (!active) return
          if (errors?.length) setActivity(errors[0].message)
          if (data?.[event]) {
            setActivity(event === 'userCreated' ? 'User added' : 'User updated')
            void refresh()
          }
        },
        error: () => { if (active) setActivity('Live updates unavailable') },
        complete: () => {},
      }),
    )
    void refresh()
    return () => {
      active = false
      cleanups.forEach(cleanup => cleanup())
      void client.dispose()
    }
  }, [token])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const values = { name: String(data.get('name')).trim(), email: String(data.get('email')).trim() }
    setError('')
    setBusy(true)
    try {
      if (editing) {
        const { updateUser } = await graphql<{ updateUser: User | null }>(token,
          `mutation ($id: ID!, $name: String!, $email: String!) {
             updateUser(id: $id, name: $name, email: $email) { ${fields} }
           }`, { id: editing.id, ...values })
        if (!updateUser) throw new Error('User no longer exists')
        setUsers(current => current.map(user => user.id === updateUser.id ? updateUser : user))
      } else {
        const { createUser } = await graphql<{ createUser: User }>(token,
          `mutation ($name: String!, $email: String!) { createUser(name: $name, email: $email) { ${fields} } }`, values)
        setUsers(current => current.some(user => user.id === createUser.id) ? current : [...current, createUser])
      }
      setEditing(null)
      form.reset()
    } catch (cause) {
      setError(String(cause))
    } finally {
      setBusy(false)
    }
  }

  async function remove(user: User) {
    if (!window.confirm(`Delete ${user.name}?`)) return
    setError('')
    setBusy(true)
    try {
      await graphql(token, 'mutation ($id: ID!) { deleteUser(id: $id) }', { id: user.id })
      setUsers(current => current.filter(item => item.id !== user.id))
      if (editing?.id === user.id) setEditing(null)
    } catch (cause) {
      setError(String(cause))
    } finally {
      setBusy(false)
    }
  }

  return <main>
    <h1>User directory</h1>
    {!token ? <form onSubmit={event => {
      event.preventDefault()
      setToken(String(new FormData(event.currentTarget).get('token')).trim())
    }}>
      <label>Access token<input name="token" type="password" autoComplete="off" required /></label>
      <button>Connect</button>
    </form> : <>
      <button disabled={busy} onClick={() => {
        setToken('')
        setUsers([])
        setEditing(null)
        setError('')
        setActivity('')
      }}>Disconnect</button>
      <form key={editing?.id ?? 'new'} onSubmit={save}>
        <label>Name<input name="name" defaultValue={editing?.name} maxLength={100} required /></label>
        <label>Email<input name="email" type="email" defaultValue={editing?.email} maxLength={150} required /></label>
        <button disabled={busy}>{editing ? 'Save changes' : 'Add user'}</button>
        {editing && <button type="button" onClick={() => setEditing(null)}>Cancel</button>}
      </form>
      <p role="status">{activity}</p>
      {error && <p role="alert">{error}</p>}
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Actions</th></tr></thead>
        <tbody>{users.map(user => <tr key={user.id}>
          <td>{user.name}</td><td>{user.email}</td>
          <td><button disabled={busy} onClick={() => setEditing(user)}>Edit</button>
            <button disabled={busy} onClick={() => void remove(user)}>Delete</button></td>
        </tr>)}</tbody>
      </table>
    </>}
  </main>
}
