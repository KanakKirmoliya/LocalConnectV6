import { useEffect, useState } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { Empty } from "./ui.jsx";
import { Stars } from "./StarRating.jsx";
import { get, del } from "../api.js";
import { useStore } from "../store.jsx";

/** Admin tab: every person-to-person rating, with the ability to remove fake or abusive ones. */
export default function AdminRatings() {
  const { notify } = useStore();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lowOnly, setLowOnly] = useState(false);
  const [q, setQ] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      setRows(await get("admin/ratings", lowOnly ? { max: 2 } : null));
    } catch (e) {
      notify(e.message || "Could not load ratings.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [lowOnly]);

  const remove = async (r) => {
    if (!window.confirm(`Remove ${r.raterName}'s ${r.rating}-star rating for ${r.ratedName}?`)) return;
    try {
      await del("admin/ratings", r.id);
      setRows((prev) => prev.filter((x) => x.id !== r.id));
      notify("Rating removed.");
    } catch (e) {
      notify(e.message || "Could not remove rating.");
    }
  };

  const shown = rows.filter((r) => !q.trim() || [r.raterName, r.ratedName, r.comment, r.listingTitle].some((v) => String(v || "").toLowerCase().includes(q.trim().toLowerCase())));

  return (
    <div>
      <div className="toolbar">
        <input className="search" style={{ margin: 0, flex: 1, minWidth: 200 }} placeholder="Search by person, listing or comment…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className={lowOnly ? "chip on" : "chip"} onClick={() => setLowOnly(!lowOnly)}>1–2 stars only</button>
        <button className="btn" onClick={load}><RefreshCw size={14} /> Refresh</button>
      </div>
      {loading ? <p className="meta">Loading ratings…</p> : shown.length === 0 ? <Empty text="No ratings found." /> : (
        <div className="list">
          {shown.map((r) => (
            <article key={r.id} className="card">
              <div className="card-top">
                <div>
                  <Stars value={r.rating} showNumber={false} />
                  <h3 style={{ fontSize: "1rem" }}>{r.raterName} → {r.ratedName}</h3>
                </div>
                <button className="btn ghost danger" onClick={() => remove(r)}><Trash2 size={14} /> Remove</button>
              </div>
              <p className="meta">{r.direction === "customer_to_provider" ? "Customer rated provider" : "Provider rated customer"}{r.listingTitle ? ` · ${r.listingTitle}` : ""} · {new Date(r.createdAt).toLocaleString()}</p>
              {r.comment && <p>{r.comment}</p>}
              {r.tags?.length > 0 && <div className="rating-tags">{r.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
