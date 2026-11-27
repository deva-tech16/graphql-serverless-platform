import { useState } from "react";
import { useQuery, useMutation, gql } from "@apollo/client";

const GET_USERS = gql`
  query { users { id name email created_at } }
`;
const CREATE_USER = gql`
  mutation CreateUser($name: String!, $email: String!) {
    createUser(name: $name, email: $email) { id name email created_at }
  }
`;
const UPDATE_USER = gql`
  mutation UpdateUser($id: ID!, $name: String, $email: String) {
    updateUser(id: $id, name: $name, email: $email) { id name email }
  }
`;
const DELETE_USER = gql`
  mutation DeleteUser($id: ID!) { deleteUser(id: $id) }
`;

type User = { id: string; name: string; email: string; created_at?: string };

export default function App() {
  const { data, loading, error, refetch } = useQuery(GET_USERS);
  const [createUser] = useMutation(CREATE_USER, { onCompleted: () => refetch() });
  const [updateUser] = useMutation(UPDATE_USER, { onCompleted: () => { setEditing(null); refetch(); } });
  const [deleteUser] = useMutation(DELETE_USER, { onCompleted: () => refetch() });

  const [form, setForm] = useState({ name: "", email: "" });
  const [editing, setEditing] = useState<User | null>(null);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email) return;
    createUser({ variables: form });
    setForm({ name: "", email: "" });
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    updateUser({ variables: { id: editing.id, name: editing.name, email: editing.email } });
  };

  return (
    <div style={{ maxWidth: 700, margin: "40px auto", fontFamily: "system-ui, sans-serif", padding: "0 20px" }}>
      <h1 style={{ borderBottom: "2px solid #333", paddingBottom: 10 }}>
        GraphQL Serverless Platform
      </h1>

      {/* Create form */}
      <section style={{ marginBottom: 32 }}>
        <h2>Create User</h2>
        <form onSubmit={handleCreate} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            placeholder="Name" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            style={inputStyle}
          />
          <input
            placeholder="Email" value={form.email} type="email"
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            style={inputStyle}
          />
          <button type="submit" style={btnStyle("#2563eb")}>Create</button>
        </form>
      </section>

      {/* Edit form */}
      {editing && (
        <section style={{ marginBottom: 32, background: "#f0f9ff", padding: 16, borderRadius: 8 }}>
          <h2>Edit User #{editing.id}</h2>
          <form onSubmit={handleUpdate} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              value={editing.name}
              onChange={e => setEditing(ed => ed ? { ...ed, name: e.target.value } : ed)}
              style={inputStyle}
            />
            <input
              value={editing.email} type="email"
              onChange={e => setEditing(ed => ed ? { ...ed, email: e.target.value } : ed)}
              style={inputStyle}
            />
            <button type="submit" style={btnStyle("#16a34a")}>Save</button>
            <button type="button" onClick={() => setEditing(null)} style={btnStyle("#6b7280")}>Cancel</button>
          </form>
        </section>
      )}

      {/* Users list */}
      <section>
        <h2>Users {data && `(${data.users.length})`}</h2>
        {loading && <p>Loading...</p>}
        {error && <p style={{ color: "red" }}>Error: {error.message}</p>}
        {data?.users.map((u: User) => (
          <div key={u.id} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "12px 16px", marginBottom: 8, background: "#f9fafb",
            borderRadius: 8, border: "1px solid #e5e7eb"
          }}>
            <div>
              <strong>{u.name}</strong>
              <span style={{ color: "#6b7280", marginLeft: 12 }}>{u.email}</span>
              <span style={{ color: "#9ca3af", marginLeft: 12, fontSize: 12 }}>
                {u.created_at ? new Date(u.created_at).toLocaleString() : ""}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setEditing(u)} style={btnStyle("#f59e0b")}>Edit</button>
              <button onClick={() => deleteUser({ variables: { id: u.id } })} style={btnStyle("#dc2626")}>Delete</button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db",
  fontSize: 14, minWidth: 180
};

const btnStyle = (bg: string): React.CSSProperties => ({
  padding: "8px 16px", background: bg, color: "#fff",
  border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14
});