export function Art({ motif }) {
  return (
    <div className={`art art--${motif}`} aria-hidden="true">
      <i className="art__a" />
      <i className="art__b" />
      <i className="art__c" />
      <i className="art__d" />
    </div>
  );
}
