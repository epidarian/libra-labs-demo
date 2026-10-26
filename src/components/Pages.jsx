import { Art } from "./Art.jsx";
import { CommissionStatus } from "./CommissionStatus.jsx";
import { ContactForm } from "./ContactForm.jsx";
import { Sensor } from "./Sensor.jsx";

const pad = (n) => String(n).padStart(2, "0");

function WindowHead({ kicker, title, deck, count }) {
  return (
    <header className="window-head">
      <p className="tagline">
        <span className="pill">{kicker}</span>
        {count ? <span>{count}</span> : null}
      </p>
      <h1>{title}</h1>
      {deck ? <p className="deck">{deck}</p> : null}
      <div className="scan" aria-hidden="true">
        <i />
      </div>
    </header>
  );
}

export function Gallery({ page }) {
  return (
    <section className="page" aria-label="Pictures">
      <WindowHead
        kicker={page.kicker}
        title={page.title}
        deck={page.deck}
        count={`${page.works.length} pictures`}
      />
      <div className="grid">
        {page.works.map((work, i) => (
          <article className="card" key={work.id} style={{ "--i": i }}>
            <header className="card__bar">
              <span className="card__index">{work.index}</span>
              <span className="card__rule" />
              <span className="card__year">{work.year}</span>
            </header>
            <Art motif={work.motif} />
            <footer className="card__meta">
              <h3>{work.title}</h3>
              <p>{work.medium}</p>
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}

export function Comics({ page }) {
  return (
    <section className="page">
      <WindowHead kicker={page.kicker} title={page.title} deck={page.deck} />
      <ol className="directory">
        {page.items.map((item, i) => {
          const Row = item.href ? "a" : "div";
          return (
            <li key={item.id} style={{ "--i": i }}>
              <Row className="directory__item" {...(item.href ? { href: item.href } : {})}>
                <span className="directory__index">{item.index}</span>
                <Art motif={item.motif} />
                <div>
                  <h2>{item.title}</h2>
                  <p>{item.detail}</p>
                  <p className="directory__blurb">{item.blurb}</p>
                </div>
                {item.href ? (
                  <span className="directory__go" aria-hidden="true">
                    →
                  </span>
                ) : null}
              </Row>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function Store({ page }) {
  return (
    <section className="page">
      <WindowHead kicker={page.kicker} title={page.title} deck={page.deck} />
      <ul className="manifest">
        {page.items.map((item, i) => (
          <li key={item.id} style={{ "--i": i }}>
            <span className="manifest__name">{item.name}</span>
            <span className="manifest__note">{item.note}</span>
            <span className="manifest__price">{item.price}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Conventions({ page }) {
  return (
    <section className="page">
      <WindowHead kicker={page.kicker} title={page.title} deck={page.deck} />
      <ol className="schedule">
        {page.items.map((item, i) => (
          <li key={item.id} style={{ "--i": i }}>
            <span className="schedule__index">{item.index}</span>
            <div>
              <h2>{item.name}</h2>
              <p>{item.place}</p>
            </div>
            <span className="schedule__dates">{item.dates}</span>
            <span className="schedule__table">{item.table}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function About({ page, commissions }) {
  return (
    <section className="page">
      <WindowHead kicker={page.kicker} title={page.title} />
      <div className="about">
        <div className="panel">
          {page.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        <Sensor />
      </div>
      <h2 className="section-label">Status</h2>
      <CommissionStatus status={commissions.status} updated={commissions.updated} />
    </section>
  );
}

export function Commissions({ page, email }) {
  const open = page.status === "open";
  return (
    <section className="page">
      <WindowHead kicker={page.kicker} title={page.title} deck={page.deck} />
      <div className="contact">
        <ContactForm email={email} open={open} />
        <aside className="contact__side">
          <CommissionStatus status={page.status} updated={page.updated} link={false} />
          <div className="panel">
            <h2 className="panel__title">Email</h2>
            <a className="mail" href={`mailto:${email}`}>
              {email}
            </a>
            <h2 className="panel__title">For a commission, include</h2>
            <ol className="checklist">
              {page.checklist.map((item, i) => (
                <li key={item}>
                  <span>{pad(i + 1)}</span>
                  {item}
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </section>
  );
}
