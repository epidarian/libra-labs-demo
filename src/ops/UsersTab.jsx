import { useId, useMemo, useState } from "react";
import { longDate, ops, useOps } from "./api.js";
import { useConfirm } from "./Modal.jsx";
import { Notice } from "./Notice.jsx";
import { Empty, SectionHead, Segmented, Switch, Tip, plural } from "./ui.jsx";

function tidyTag(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function UserTags({ user, run, pictureTags, knownTags }) {
  const [draft, setDraft] = useState("");
  const listId = useId();
  const tags = user.tags || [];
  const suggestions = knownTags.filter((tag) => !tags.includes(tag));

  const add = async (event) => {
    event.preventDefault();
    const tag = tidyTag(draft);
    if (!tag || tags.includes(tag)) return;
    setDraft("");
    await run(() => ops(`users/${user.id}/tags`, { method: "POST", body: { tag } }), {
      ok: pictureTags && !pictureTags.get(tag) ? `Tagged “${tag}”. No picture has that tag yet.` : `Tagged “${tag}”.`,
    });
  };

  const remove = (name) =>
    run(() => ops(`users/${user.id}/tags/${encodeURIComponent(name)}`, { method: "DELETE" }), {
      ok: `Removed “${name}” from ${user.email}.`,
    });

  return (
    <form className="ops__tags" onSubmit={add}>
      {tags.map((name) => {
        const count = pictureTags?.get(name) || 0;
        const unused = Boolean(pictureTags) && !count;
        return (
          <button
            type="button"
            key={name}
            className={unused ? "ops__tag ops__tagbtn ops__tag--unused" : "ops__tag ops__tagbtn"}
            title={
              unused
                ? "No picture has this tag. Click to remove."
                : pictureTags
                  ? `On ${plural(count, "picture")}. Click to remove.`
                  : "Click to remove"
            }
            aria-label={`Remove the ${name} tag from ${user.email}`}
            onClick={() => remove(name)}
          >
            {name} ×
          </button>
        );
      })}
      <input
        className="ops__taginput"
        list={suggestions.length ? listId : undefined}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        aria-label={`Tag to add to ${user.email}`}
        placeholder="Add tag"
        title="Type a tag and press Enter"
      />
      {suggestions.length ? (
        <datalist id={listId}>
          {suggestions.map((tag) => (
            <option key={tag} value={tag} />
          ))}
        </datalist>
      ) : null}
    </form>
  );
}

export function UsersTab() {
  const { data, error, run, send } = useOps("users");
  const gallery = useOps("gallery");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [ask, confirmDialog] = useConfirm();
  const users = data?.users ?? [];

  // How many pictures carry each tag, so a tag that matches nothing stands out.
  const pictureTags = useMemo(() => {
    if (!gallery.data) return null;
    const counts = new Map();
    for (const work of gallery.data.works) {
      for (const tag of work.tags || []) counts.set(tag, (counts.get(tag) || 0) + 1);
    }
    return counts;
  }, [gallery.data]);
  const knownTags = useMemo(() => {
    const all = new Set(pictureTags ? pictureTags.keys() : []);
    for (const user of users) for (const tag of user.tags || []) all.add(tag);
    return [...all].sort();
  }, [pictureTags, users]);

  const isAdmin = (user) => user.role === "admin" || user.envAdmin;
  const needle = query.trim().toLowerCase();
  const shown = users.filter((user) => {
    if (filter === "admins" && !isAdmin(user)) return false;
    if (filter === "blocked" && !user.disabled_at) return false;
    if (!needle) return true;
    return user.email.toLowerCase().includes(needle) || (user.tags || []).some((tag) => tag.includes(needle));
  });

  const setRole = (user, role) => {
    if (role === user.role) return;
    const promote = role === "admin";
    ask({
      title: promote ? `Make ${user.email} an admin?` : `Remove admin from ${user.email}?`,
      body: promote
        ? "An admin can open this panel and change everything in it, including other accounts."
        : user.envAdmin
          ? "This account is also listed in OPS_ADMIN_EMAILS, so it stays an admin until it is removed from that setting."
          : "They lose access to this panel.",
      label: promote ? "Make admin" : "Remove admin",
      danger: !promote,
      action: () => send(() => ops(`users/${user.id}`, { method: "PATCH", body: { role } })),
      done: promote ? `${user.email} is now an admin.` : `${user.email} is no longer an admin.`,
    });
  };

  const setAllowed = (user, allowed) => {
    if (allowed) {
      run(() => ops(`users/${user.id}`, { method: "PATCH", body: { disabled: false } }), {
        ok: `${user.email} can sign in again.`,
      });
      return;
    }
    ask({
      title: `Block ${user.email}?`,
      body: "They are signed out everywhere and cannot sign back in until you allow it again. Nothing is deleted.",
      label: "Block",
      action: () => send(() => ops(`users/${user.id}`, { method: "PATCH", body: { disabled: true } })),
      done: `${user.email} is blocked.`,
    });
  };

  const signOut = (user) =>
    ask({
      title: `Sign ${user.email} out everywhere?`,
      body: `This ends ${plural(user.sessions, "session")}. They can sign in again straight away.`,
      label: "Sign out",
      danger: false,
      action: () => send(() => ops(`users/${user.id}/sessions`, { method: "DELETE" })),
      done: `${user.email} was signed out.`,
    });

  const remove = (user) =>
    ask({
      title: `Delete ${user.email}?`,
      body: "The account, its tags and its sessions are removed for good.",
      label: "Delete",
      action: () => send(() => ops(`users/${user.id}`, { method: "DELETE" })),
      done: `Deleted ${user.email}.`,
    });

  return (
    <section className="panel ops__section">
      <SectionHead title="Accounts" count={data ? (shown.length === users.length ? users.length : `${shown.length} of ${users.length}`) : null}>
        <input
          className="gallery-find"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Find an account"
          placeholder="Search email or tag"
        />
        <Segmented
          label="Accounts to show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "admins", label: "Admins" },
            { value: "blocked", label: "Blocked" },
          ]}
        />
      </SectionHead>
      <Notice error={error} loading={!data && !error} />
      {data && shown.length === 0 ? <Empty>{users.length ? "No account matches." : "No accounts."}</Empty> : null}
      {shown.length ? (
        <div className="ops__scroll">
          <table className="ops__table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>
                  Tags
                  <Tip text="An account can see hidden pictures that carry one of its tags. Click a tag to remove it." />
                </th>
                <th>Sign-in</th>
                <th>Sessions</th>
                <th>Joined</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((user) => {
                const self = user.id === data.me;
                const own = self ? "You cannot change your own account here" : undefined;
                return (
                  <tr key={user.id}>
                    <td>
                      {user.email}
                      {self ? <span className="chip chip--hot">You</span> : null}
                    </td>
                    <td>
                      <select
                        className="ops__select"
                        value={user.role}
                        disabled={self}
                        title={own}
                        aria-label={`Role of ${user.email}`}
                        onChange={(event) => setRole(user, event.target.value)}
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                      {user.envAdmin ? (
                        <span className="chip" title="Listed in OPS_ADMIN_EMAILS, so an admin whatever the role says">
                          Admin via config
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <UserTags user={user} run={run} pictureTags={pictureTags} knownTags={knownTags} />
                    </td>
                    <td>
                      <Switch
                        label={`${user.email} can sign in`}
                        checked={!user.disabled_at}
                        disabled={self}
                        title={own || (user.disabled_at ? `Blocked ${longDate(user.disabled_at)}` : undefined)}
                        on="Allowed"
                        off="Blocked"
                        onChange={(allowed) => setAllowed(user, allowed)}
                      />
                    </td>
                    <td>
                      <span className="ops__pair">
                        {user.sessions}
                        {user.sessions ? (
                          <button type="button" className="ops__btn ops__btn--small" onClick={() => signOut(user)}>
                            Sign out
                          </button>
                        ) : null}
                      </span>
                    </td>
                    <td>{longDate(user.created_at)}</td>
                    <td className="ops__rowtools">
                      <button
                        type="button"
                        className="ops__btn ops__btn--small ops__btn--danger"
                        disabled={self}
                        title={own}
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
      {confirmDialog}
    </section>
  );
}
