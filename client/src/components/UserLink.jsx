import { useState } from "react";
import ProfileModal from "./ProfileModal.jsx";

/**
 * A member's name that opens their public profile when clicked.
 * Pass `id` (the member's user id). Without an id it simply renders the name.
 */
export default function UserLink({ id, name, children, className = "" }) {
  const [open, setOpen] = useState(false);
  if (!id) return <>{children ?? name}</>;
  return (
    <>
      <button
        type="button"
        className={`user-link ${className}`}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        title={`View ${name || "profile"}`}
      >
        {children ?? name}
      </button>
      {open && <ProfileModal userId={id} fallbackName={name} onClose={() => setOpen(false)} />}
    </>
  );
}
