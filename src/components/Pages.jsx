import { useEffect, useState } from "react";
import { usePatreon } from "../context/Patreon.jsx";
import { useSiteContent } from "../context/SiteContent.jsx";
import { meetsTier, tierName } from "../tiers.js";
import { Art } from "./Art.jsx";
import { CommissionStatus } from "./CommissionStatus.jsx";
import { ContactForm } from "./ContactForm.jsx";
import { PatreonMark } from "./PatreonMark.jsx";
import { Sensor } from "./Sensor.jsx";

const pad = (n) => String(n).padStart(2, "0");
const EARLY_ACCESS_DAYS = 4;

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

function mediaUrl(work, file) {
  if (file.slot === "thumb") return `/media/gallery/${work.slug}/thumb`;
  if (file.slot === "full") return `/media/gallery/${work.slug}/full`;
  return `/media/gallery/${work.slug}/files/${file.id}`;
}

function blocked(work, file, profile) {
  if (!meetsTier(profile, work)) return true;
  return Boolean(file?.patronsOnly) && profile?.patronStatus !== "active_patron";
}

function lockCopy(work, tiers) {
  if (work.minCents != null) {
    const name = work.tierTitle || tierName(tiers, work.minCents);
    const article = /^[aeiou]/i.test(name) ? "an" : "a";
    return `Please subscribe to patreon as at least ${article} ${name} to view this section of the gallery`;
  }
  if (work.patronsOnly) return "Please subscribe to patreon to view this section of the gallery";
  return "";
}

function accessLabel(item, tiers) {
  if (item?.tierTitle) return item.tierTitle;
  if (item?.minCents != null) return tierName(tiers, item.minCents) || "Patrons";
  if (item?.patronsOnly) return "Patrons";
  return "";
}

function thumbHidden(work, profile) {
  if (!work.thumb) return Boolean(work.slug);
  if (!work.thumb.viewable) return true;
  return Boolean(work.thumb.patronsOnly) && profile?.patronStatus !== "active_patron";
}

function Picture({ work, locked, hideThumb, lockLabel }) {
  const [photo, setPhoto] = useState(false);
  const src = hideThumb ? null : work.slug ? `/media/gallery/${work.slug}/thumb` : `/media/gallery/${work.id}`;
  return (
    <>
      {photo && src ? (
        <img className="art art--photo" src={src} alt={work.title} />
      ) : (
        <Art motif={work.motif} />
      )}
      {src && !photo ? (
        <img className="art-probe" src={src} alt="" onLoad={() => setPhoto(true)} onError={() => {}} />
      ) : null}
      {locked ? (
        <div className="lock">
          <span className="lock__icon" aria-hidden="true">🔒</span>
          <p className="lock__note">
            <PatreonMark />
            {lockLabel || "Patrons"}
          </p>
        </div>
      ) : null}
    </>
  );
}

function isImage(file) {
  if (!file) return false;
  if (file.slot === "thumb" || file.slot === "full") return true;
  return String(file.contentType || "").startsWith("image/");
}

function assetsOf(work) {
  const seen = new Set();
  return [work.full, ...(work.files || []), work.thumb].filter((file) => {
    if (!file || seen.has(file.id)) return false;
    seen.add(file.id);
    return true;
  });
}

function tileSrc(work, file, profile) {
  if (!work.slug) return null;
  if (file.slot === "thumb" && !thumbHidden(work, profile)) return `/media/gallery/${work.slug}/thumb`;
  if (file.slot === "full" && !thumbHidden(work, profile) && (blocked(work, file, profile) || !file.viewable)) {
    return `/media/gallery/${work.slug}/thumb`;
  }
  if (!isImage(file) || blocked(work, file, profile) || !file.viewable) return null;
  return mediaUrl(work, file);
}

function Viewer({ work, profile, tiers, onClose }) {
  const assets = assetsOf(work);
  const start = assets.findIndex((file) => file.slot === "full");
  const [index, setIndex] = useState(start < 0 ? 0 : start);
  const file = assets[index] || null;
  const fileBlocked = file ? blocked(work, file, profile) : !meetsTier(profile, work);
  const label = accessLabel(file?.patronsOnly ? { patronsOnly: true } : work, tiers);
  const showImage = file && isImage(file) && file.viewable && !fileBlocked;
  const picture = file && (file.slot === "full" || file.slot === "thumb");
  const showTeaser = !showImage && picture && work.slug && !thumbHidden(work, profile);
  const stageSrc = showImage ? mediaUrl(work, file) : showTeaser ? `/media/gallery/${work.slug}/thumb` : null;

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
      if (!assets.length) return;
      if (event.key === "ArrowRight") setIndex((n) => (n + 1) % assets.length);
      if (event.key === "ArrowLeft") setIndex((n) => (n - 1 + assets.length) % assets.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [assets.length, onClose]);

  return (
    <div className="viewer" onClick={onClose}>
      <div
        className="viewer__dialog"
        role="dialog"
        aria-modal="true"
        aria-label={work.title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="viewer__bar">
          <div>
            <h2>{work.title}</h2>
            <p>{[work.year, work.slug ? work.description : work.medium].filter(Boolean).join(" · ")}</p>
          </div>
          <button type="button" className="btn btn--quiet" onClick={onClose}>
            Close
          </button>
        </header>
        {!meetsTier(profile, work) && lockCopy(work, tiers) ? (
          <p className="viewer__pitch">{lockCopy(work, tiers)}</p>
        ) : null}
        <div className="viewer__stage">
          {stageSrc ? (
            <img className={showImage ? "" : "is-locked"} src={stageSrc} alt={file?.name || work.title} />
          ) : file ? (
            <p className="viewer__file">{file.name}</p>
          ) : (
            <Art motif={work.motif} />
          )}
          {fileBlocked && label ? (
            <div className="lock">
              <span className="lock__icon" aria-hidden="true">🔒</span>
              <p className="lock__note">
                <PatreonMark />
                {label}
              </p>
            </div>
          ) : null}
        </div>
        {assets.length ? (
          <div className="viewer__rail" role="tablist" aria-label="Files">
            {assets.map((item, i) => {
              const src = work.slug ? tileSrc(work, item, profile) : null;
              return (
                <button
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  className={i === index ? "viewer__tile is-current" : "viewer__tile"}
                  key={item.id}
                  onClick={() => setIndex(i)}
                >
                  {src ? <img src={src} alt="" /> : <span className="viewer__ext">{item.name.split(".").pop()}</span>}
                  <small>{item.name}</small>
                </button>
              );
            })}
          </div>
        ) : null}
        <div className="viewer__actions">
          {assets.length > 1 ? (
            <>
              <button type="button" className="btn btn--quiet" onClick={() => setIndex((n) => (n - 1 + assets.length) % assets.length)}>
                Previous
              </button>
              <button type="button" className="btn btn--quiet" onClick={() => setIndex((n) => (n + 1) % assets.length)}>
                Next
              </button>
            </>
          ) : null}
          {file && file.downloadable && !fileBlocked ? (
            <a className="btn" href={`${mediaUrl(work, file)}?download=1`}>
              Download
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function Gallery({ page }) {
  const { profile } = usePatreon();
  const tiers = useSiteContent()?.tiers || [];
  const [openId, setOpenId] = useState(null);
  const open = page.works.find((work) => work.id === openId);
  return (
    <section className="page" aria-label="Pictures">
      <WindowHead
        kicker={page.kicker}
        title={page.title}
        deck={page.deck}
        count={`${page.works.length} pictures`}
      />
      {page.works.length === 0 ? <p className="deck">No pictures yet.</p> : null}
      <div className="grid">
        {page.works.map((work, i) => {
          const locked = !meetsTier(profile, work);
          const label = accessLabel(work, tiers);
          return (
            <article
              className={locked ? "card is-locked" : "card"}
              key={work.id}
              style={{ "--i": i }}
              onClick={() => setOpenId(work.id)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                setOpenId(work.id);
              }}
              role="button"
              tabIndex={0}
            >
              <header className="card__bar">
                <span className="card__index">{work.index}</span>
                <span className="card__rule" />
                <span className="card__year">{work.year}</span>
              </header>
              <div className="card__art">
                <Picture
                  work={work}
                  locked={locked}
                  lockLabel={label}
                  hideThumb={thumbHidden(work, profile)}
                />
                {!work.slug && i === 0 ? (
                  <div className="lock">
                    <span className="lock__icon" aria-hidden="true">🔒</span>
                    <p className="lock__note">
                      <PatreonMark />
                      Releases in {EARLY_ACCESS_DAYS} Days
                    </p>
                  </div>
                ) : null}
              </div>
              <footer className="card__meta">
                <h3>{work.title}</h3>
                <p>{[work.slug ? work.description : work.medium, label].filter(Boolean).join(" · ")}</p>
              </footer>
            </article>
          );
        })}
      </div>
      {open ? <Viewer work={open} profile={profile} tiers={tiers} onClose={() => setOpenId(null)} /> : null}
    </section>
  );
}

export function Comics({ page }) {
  const { profile } = usePatreon();
  const tiers = useSiteContent()?.tiers || [];
  return (
    <section className="page">
      <WindowHead kicker={page.kicker} title={page.title} deck={page.deck} />
      <ol className="directory">
        {page.items.map((item, i) => {
          const locked = !meetsTier(profile, item);
          const label = accessLabel(item, tiers);
          const Row = item.href && !locked ? "a" : "div";
          return (
            <li key={item.id} style={{ "--i": i }}>
              <Row className="directory__item" {...(item.href && !locked ? { href: item.href } : {})}>
                <span className="directory__index">{item.index}</span>
                <Art motif={item.motif} />
                <div>
                  <h2>{item.title}</h2>
                  <p>
                    {item.detail}
                    {label ? ` · ${label}` : ""}
                  </p>
                  <p className="directory__blurb">{item.blurb}</p>
                </div>
                {item.href && !locked ? (
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
  const { profile } = usePatreon();
  const tiers = useSiteContent()?.tiers || [];
  return (
    <section className="page">
      <WindowHead kicker={page.kicker} title={page.title} deck={page.deck} />
      <ul className="manifest">
        {page.items.map((item, i) => {
          const label = meetsTier(profile, item) ? "" : accessLabel(item, tiers);
          return (
            <li key={item.id} style={{ "--i": i }}>
              <span className="manifest__name">{item.name}</span>
              <span className="manifest__note">{label ? `${item.note} · ${label}` : item.note}</span>
              <span className="manifest__price">{item.price}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function Conventions({ page }) {
  return (
    <section className="page">
      <WindowHead kicker={page.kicker} title={page.title} deck={page.deck} />
      {page.items.length === 0 ? (
        <div className="panel">
          <p>No conventions are scheduled.</p>
        </div>
      ) : null}
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

export function Commissions({ page, email, zone }) {
  const open = page.status === "open";
  return (
    <section className="page">
      <WindowHead kicker={page.kicker} title={page.title} deck={page.deck} />
      <div className="contact">
        <ContactForm email={email} open={open} zone={zone} />
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
