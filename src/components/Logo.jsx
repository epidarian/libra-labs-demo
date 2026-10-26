export function Logo({ className = "" }) {
  return (
    <svg
      className={`logo ${className}`}
      viewBox="0 0 665 873"
      fill="none"
      aria-hidden="true"
    >
      <g className="logo__steam">
        <path d="M281 26C266 42 244 55 250 78C256 105 306 125 298 152C290 175 276 188 268 196" />
        <path d="M345 26C330 42 308 55 314 78C320 105 370 125 362 152C354 175 340 188 332 196" />
        <path d="M408 26C393 42 371 55 377 78C383 105 433 125 425 152C417 175 403 188 395 196" />
      </g>
      <rect className="logo__lip" x="251" y="224" width="174" height="26" rx="13" />
      <path className="logo__neck" d="M271 250V336M405 250V336" />
      <circle className="logo__bulb" cx="338" cy="583" r="256" />
      <path
        className="logo__flag"
        d="M360 356C358 357 352 361 348 364C344 367 340 369 336 372C332 375 328 377 324 380C320 383 317 387 314 390C311 393 308 397 306 400C304 403 302 407 301 410C300 413 298 417 297 420C296 423 295 426 294 430C293 434 292 440 291 442"
      />
      <circle className="logo__six" cx="338" cy="479" r="52" />
      <path className="logo__post" d="M338 531V773" />
      <path className="logo__beam" d="M129 592V552H547V592" />
      <path className="logo__pan" d="M41 592H218A88.5 50 0 0 1 41 592" />
      <path className="logo__pan" d="M459 592H636A88.5 50 0 0 1 459 592" />
      <ellipse className="logo__core" cx="338" cy="758" rx="34" ry="38" />
      <circle className="logo__spiral" cx="338" cy="763" r="77" />
    </svg>
  );
}
