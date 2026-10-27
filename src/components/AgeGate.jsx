import { useEffect, useRef, useState } from "react";
import { useSiteMode } from "../context/SiteMode.jsx";

export function AgeGate() {
  const { gateOpen, confirmAdult, declineAdult } = useSiteMode();
  const [checked, setChecked] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!gateOpen) return undefined;
    setChecked(false);
    boxRef.current?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") declineAdult();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [gateOpen, declineAdult]);

  if (!gateOpen) return null;

  return (
    <div className="gate">
      <div
        className="gate__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gate-title"
        aria-describedby="gate-body"
      >
        <p className="gate__kicker">Age confirmation</p>
        <h2 id="gate-title" className="gate__title">
          This site contains adult material
        </h2>
        <p id="gate-body" className="gate__body">
          Part of this site shows artwork intended for adults. You must be 18 or
          older, or the age of majority where you live, to view it.
        </p>

        <label className="gate__check">
          <input
            ref={boxRef}
            type="checkbox"
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
          />
          <span>I am 18 or older and agree to view adult material.</span>
        </label>

        <p className="gate__notice">
          This site stores your age confirmation, display settings, and
          sign-in in your browser's local storage. It does not use tracking or
          advertising cookies. Patreon sets its own cookies when you sign in
          with Patreon.
        </p>

        <div className="gate__actions">
          <button
            type="button"
            className="btn"
            disabled={!checked}
            onClick={confirmAdult}
          >
            Enter
          </button>
          <button type="button" className="btn btn--quiet" onClick={declineAdult}>
            Continue to SFW site
          </button>
        </div>
      </div>
    </div>
  );
}
