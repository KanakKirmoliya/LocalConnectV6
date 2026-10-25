import { useState } from "react";

const PALETTE = ["#3a4fd7", "#1f8a70", "#0f8b9c", "#d97706", "#7c3aed", "#be185d", "#2563eb", "#b45309"];
const colorFor = (name = "") => PALETTE[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % PALETTE.length];
export const initialsOf = (name = "") =>
  name.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";

/** Round profile picture. Falls back to coloured initials when there is no photo (or it fails to load). */
export default function Avatar({ src, name = "", size = 40, className = "", style = {}, ...rest }) {
  const [broken, setBroken] = useState(false);
  const showImg = src && !broken;
  return (
    <span
      className={`avatar-pic ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(11, Math.round(size * 0.38)),
        background: showImg ? "var(--paper)" : colorFor(name),
        ...style,
      }}
      aria-hidden={rest["aria-hidden"] ?? true}
      {...rest}
    >
      {showImg ? <img src={src} alt="" onError={() => setBroken(true)} /> : initialsOf(name)}
    </span>
  );
}
