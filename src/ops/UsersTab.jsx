import { useState } from "react";
import { ops, shortDate, useOps } from "./api.js";
import { Notice } from "./Notice.jsx";

function UserTags({ user, run }) {
  const [tag, setTag] = useState("");
  const add = (event) => {
    event.preventDefault();
    if (!tag.trim()) return;
    run(() => ops(`users/${user.id}/tags`, { method: "POST", body: { tag } }));
    setTag("");
  };

  return (
    <form className="ops__tags" onSubmit={add}>
      {(user.tags || []).map((name) => (
        <button
          type="button"
          className="ops__tag ops__tagbtn"
          key={name}
          onClick={() =>
            run(() => ops(`users/${user.id}/tags/${encodeURIComponent(name)}`, { method: "DELETE" }))
          }
        >
          {name} ×
        </button>
      ))}
      <input
        className="ops__taginput"
        value={tag}
        onChange={(event) => setTag(event.target.value)}
        aria-label={`Tag for ${user.email}`}
        placeholder="Add a tag"
      />
    </form>
  );
}

export function UsersTab() {
  const { data, error, run } = useOps("users");
  const users = data?.users ?? [];

  const patch = (user, body) =>
    run(() => ops(`users/${user.id}`, { method: "PATCH", body }));

  const remove = (user) => {
    if (!window.confirm(`Delete ${user.email}? This cannot be undone.`)) return;
    run(() => ops(`users/${user.id}`, { method: "DELETE" }));
  };

  return (
    <section className="panel ops__section">
      <h2 className="panel__title">Accounts ({users.length})</h2>
      <p className="ops__muted">A shared tag shows those pictures to this account, even when they are not visible.</p>
      <Notice error={error} loading={!data} />
      {data && users.length === 0 ? <p className="ops__muted">No accounts.</p> : null}
      {users.length ? (
        <div className="ops__scroll">
          <table className="ops__table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Tags</th>
                <th>Role</th>
                <th>State</th>
                <th>Sessions</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const self = user.id === data.me;
                return (
                  <tr key={user.id}>
                    <td>
                      {user.email}
                      {self ? <span className="ops__tag">You</span> : null}
                    </td>
                    <td>
                      <UserTags user={user} run={run} />
                    </td>
                    <td>
                      <select
                        className="ops__select"
                        value={user.role}
                        disabled={self}
                        aria-label={`Role for ${user.email}`}
                        onChange={(event) => patch(user, { role: event.target.value })}
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                      {user.envAdmin ? (
                        <span className="ops__tag" title="Listed in OPS_ADMIN_EMAILS">
                          Admin via config
                        </span>
                      ) : null}
                    </td>
                    <td>{user.disabled_at ? `Disabled ${shortDate(user.disabled_at)}` : "Active"}</td>
                    <td>{user.sessions}</td>
                    <td>{shortDate(user.created_at)}</td>
                    <td className="ops__actions">
                      <button
                        type="button"
                        className="ops__btn"
                        disabled={self}
                        onClick={() => patch(user, { disabled: !user.disabled_at })}
                      >
                        {user.disabled_at ? "Enable" : "Disable"}
                      </button>
                      <button
                        type="button"
                        className="ops__btn"
                        disabled={!user.sessions}
                        onClick={() =>
                          run(() => ops(`users/${user.id}/sessions`, { method: "DELETE" }))
                        }
                      >
                        Sign out everywhere
                      </button>
                      <button
                        type="button"
                        className="ops__btn ops__btn--danger"
                        disabled={self}
                        onClick={() => remove(user)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
