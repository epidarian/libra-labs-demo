export function Notice({ error, loading }) {
  if (error) {
    return (
      <p className="ops__error" role="alert">
        {error}
      </p>
    );
  }
  if (loading) return <p className="ops__muted">Loading…</p>;
  return null;
}
