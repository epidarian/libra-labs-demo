import { Logo } from "./Logo.jsx";

export function Sensor({ readout }) {
  return (
    <div className="sensor" aria-hidden="true">
      <div className="sensor__dial">
        <div className="sensor__ring" />
        <div className="sensor__ring sensor__ring--inner" />
        <div className="sensor__ticks" />
        <Logo className="sensor__logo" />
      </div>
      {readout ? <p className="sensor__readout">{readout}</p> : null}
    </div>
  );
}
