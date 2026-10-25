import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Plus,
  Trash2,
  CheckCircle2,
  Search,
  Camera,
  Image as ImageIcon,
  AlertCircle,
  Siren,
  Phone,
  Clock,
  MapPin,
  Tag,
  Gift,
  HelpCircle,
  Eye,
  Flag,
} from "lucide-react";
import { Empty, Field, Modal, PageHead, Segmented, ago } from "../components/ui.jsx";
import UserLink from "../components/UserLink.jsx";
import ReportModal from "../components/ReportModal.jsx";
import { useResource, useStore } from "../store.jsx";
import { post, del, uploadMedia } from "../api.js";

const CATEGORIES = [
  "All",
  "Wallet & Cards",
  "Phone & Electronics",
  "Keys",
  "Documents & ID",
  "Pet",
  "Bag & Luggage",
  "Jewellery",
  "Clothing",
  "Other",
];

export default function LostFound() {
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") === "lost" ? "lost" : "found";

  const { radius, setRadius, notify, user, userLocation } = useStore();
  const [items, setItems, loadingItems] = useResource("lostfound");
  const [tab, setTab] = useState(initialTab);
  const [category, setCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [claiming, setClaiming] = useState(null);
  const [claimMessage, setClaimMessage] = useState("");
  const [posting, setPosting] = useState(false);
  const [viewingPhoto, setViewingPhoto] = useState(null);
  const [reportingItem, setReportingItem] = useState(null);

  // Sync tab if URL changes
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "lost" || t === "found") setTab(t);
  }, [searchParams]);

  // Filtering by kind, category, search query, and radius
  const list = items.filter((i) => {
    // 1. Kind matching
    const matchesKind = tab === "lost" ? i.kind === "lost" : (i.kind === "found" || !i.kind);
    if (!matchesKind) return false;

    // 2. Category matching
    if (category !== "All" && i.category && i.category !== category) return false;

    // 3. Search query matching
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchTitle = (i.title || i.itemName || "").toLowerCase().includes(q);
      const matchDesc = (i.description || "").toLowerCase().includes(q);
      const matchLoc = (i.where || i.locality || "").toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchLoc) return false;
    }

    // 4. Radius matching (or All if radius >= 9999)
    if (radius < 9999 && i.km != null && i.km > radius) return false;

    return true;
  });

  const totalThisKind = items.filter((i) => (tab === "lost" ? i.kind === "lost" : (i.kind === "found" || !i.kind)));

  const submitPost = async (formPayload) => {
    try {
      const payload = {
        ...formPayload,
        latitude: formPayload.latitude || userLocation?.lat,
        longitude: formPayload.longitude || userLocation?.lng,
        by: user.name,
      };

      const item = await post("lostfound", payload);
      setItems((prev) => [item, ...prev]);
      setPosting(false);

      if (formPayload.isUrgent) {
        notify("🚨 Urgent alert broadcasted to your locality! Post published.");
      } else {
        notify("Post published successfully to NearNest.");
      }
    } catch (err) {
      notify(err.message || "Failed to post item.");
    }
  };

  const deleteItem = async (id) => {
    if (!window.confirm("Are you sure you want to remove this post?")) return;
    try {
      await del("lostfound", id);
      setItems((l) => l.filter((x) => (x.id || x._id) !== id));
      notify("Post removed.");
    } catch (err) {
      notify(err.message || "Failed to remove post.");
    }
  };

  const handleClaim = async () => {
    if (!claiming) return;
    try {
      const isLost = claiming.kind === "lost";
      await post("requests", {
        listingId: claiming.id || claiming._id,
        message: `[${isLost ? "I Found Your Lost Item" : "Claiming Found Item"} - "${claiming.title}"]: ${claimMessage}`,
      });
      setClaiming(null);
      setClaimMessage("");
      notify(`Inquiry sent to ${claiming.by || claiming.ownerName || "the poster"}! Check Messages tab for replies.`);
    } catch (err) {
      notify(err.message || "Failed to send inquiry.");
    }
  };

  return (
    <>
      <PageHead
        title="Lost & Found Hub"
        sub="Report lost valuables or return found items to your neighbours."
        action={
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              className="btn"
              style={{ background: "#FEF2F2", color: "#DC2626", borderColor: "#FCA5A5", fontWeight: 700 }}
              onClick={() => {
                setTab("lost");
                setPosting(true);
              }}
            >
              <Siren size={16} style={{ marginRight: 4 }} /> Report Lost Item
            </button>
            <button
              className="btn primary"
              onClick={() => {
                setTab("found");
                setPosting(true);
              }}
            >
              <Plus size={16} style={{ marginRight: 4 }} /> Post Found Item
            </button>
          </div>
        }
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", marginBottom: "16px" }}>
        <div style={{ flex: "1 1 300px" }}>
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "lost", label: `Lost Items (${items.filter((i) => i.kind === "lost").length})` },
              { value: "found", label: `Found Items (${items.filter((i) => i.kind === "found" || !i.kind).length})` },
            ]}
          />
        </div>

        {/* Search bar */}
        <div style={{ flex: "1 1 240px", position: "relative" }}>
          <input
            type="text"
            placeholder="Search by item, mark, or area..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px 8px 34px",
              borderRadius: "10px",
              border: "1px solid var(--border)",
              fontSize: "0.85rem",
              background: "var(--paper)",
              color: "var(--fg)",
            }}
          />
          <Search size={16} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--mute)" }} />
        </div>
      </div>

      {/* Category Pills */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "18px" }}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            className="btn"
            style={{
              fontSize: "0.76rem",
              padding: "3px 10px",
              borderRadius: "999px",
              background: category === cat ? "#2563EB" : "var(--paper)",
              color: category === cat ? "#FFFFFF" : "var(--fg)",
              borderColor: category === cat ? "#1D4ED8" : "var(--border)",
              fontWeight: category === cat ? 700 : 500,
            }}
            onClick={() => setCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Empty State with Distance Expansion */}
      {list.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 20px", background: "var(--paper)", borderRadius: "14px", border: "1px solid var(--border)" }}>
          <HelpCircle size={40} style={{ color: "var(--mute)", margin: "0 auto 12px" }} />
          <h3>No {tab} items found in this radius</h3>
          <p className="meta" style={{ maxWidth: 450, margin: "6px auto 16px" }}>
            {totalThisKind.length > 0
              ? `There are ${totalThisKind.length} ${tab} items reported in surrounding areas outside ${radius} km.`
              : `No one has reported any ${tab} items in this category yet.`}
          </p>
          <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
            {totalThisKind.length > 0 && radius < 9999 && (
              <button className="btn primary" onClick={() => setRadius(9999)}>
                Expand to All Distance ({totalThisKind.length} items)
              </button>
            )}
            <button
              className="btn"
              onClick={() => setPosting(true)}
              style={tab === "lost" ? { borderColor: "#FCA5A5", color: "#DC2626" } : {}}
            >
              {tab === "lost" ? "Report Your Lost Item" : "Post What You Found"}
            </button>
          </div>
        </div>
      )}

      {/* Items List */}
      <div className="list">
        {list.map((i) => {
          const itemId = i.id || i._id;
          const isOwner = user && (i.ownerId === user.id || i.by === user.name);
          const photos = i.photos || [];
          const hasPhoto = photos.length > 0;
          const photoUrl = typeof photos[0] === "string" ? photos[0] : photos[0]?.url;

          return (
            <article
              key={itemId}
              className="card"
              style={{
                borderLeft: i.isUrgent
                  ? "4px solid #DC2626"
                  : i.kind === "lost"
                  ? "4px solid #F59E0B"
                  : "4px solid #10B981",
              }}
            >
              <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                {hasPhoto && (
                  <div
                    style={{
                      width: "80px",
                      height: "80px",
                      borderRadius: "8px",
                      overflow: "hidden",
                      background: "#0F172A",
                      flexShrink: 0,
                      cursor: "pointer",
                      position: "relative",
                    }}
                    onClick={() => setViewingPhoto(photoUrl)}
                  >
                    <img src={photoUrl} alt={i.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <span style={{ position: "absolute", bottom: 2, right: 2, background: "rgba(0,0,0,0.6)", borderRadius: 3, padding: "1px 3px", color: "white", fontSize: "9px" }}>
                      <Eye size={10} />
                    </span>
                  </div>
                )}

                <div style={{ flex: 1 }}>
                  <div className="card-top">
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 3 }}>
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            padding: "2px 7px",
                            borderRadius: "5px",
                            background: i.kind === "lost" ? "#FEF2F2" : "#ECFDF5",
                            color: i.kind === "lost" ? "#DC2626" : "#059669",
                            border: `1px solid ${i.kind === "lost" ? "#FCA5A5" : "#A7F3D0"}`,
                          }}
                        >
                          {i.kind === "lost" ? "LOST" : "FOUND"}
                        </span>
                        {i.category && (
                          <span style={{ fontSize: "11px", color: "var(--mute)", background: "var(--border)", padding: "1px 6px", borderRadius: 4 }}>
                            {i.category}
                          </span>
                        )}
                        {i.isUrgent && (
                          <span style={{ fontSize: "11px", fontWeight: 700, color: "#DC2626", display: "flex", alignItems: "center", gap: 3 }}>
                            <Siren size={12} /> Urgent Alert Broadcasted
                          </span>
                        )}
                      </div>
                      <h3 style={{ margin: 0, fontSize: "1.05rem" }}>{i.title || i.itemName}</h3>
                    </div>
                    <span className="meta">{ago(i.minsAgo)}</span>
                  </div>

                  {i.description && (
                    <p style={{ margin: "6px 0", fontSize: "0.88rem", color: "var(--fg)", lineHeight: 1.45 }}>
                      {i.description}
                    </p>
                  )}

                  <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "8px", fontSize: "0.82rem", color: "var(--mute)" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <MapPin size={13} color="#2563EB" />
                      <strong>{i.where || i.locality || "Local Area"}</strong>
                      {i.km != null && <em style={{ fontStyle: "normal" }}>({i.km} km away)</em>}
                    </span>

                    {i.reward && (
                      <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#D97706", fontWeight: 700 }}>
                        <Gift size={13} /> Reward: {i.reward}
                      </span>
                    )}

                    <span>Posted by: <strong><UserLink id={i.ownerId} name={i.by || i.ownerName} /></strong></span>
                  </div>

                  <div className="card-actions" style={{ marginTop: "12px" }}>
                    {isOwner ? (
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <span className="status ok"><CheckCircle2 size={13} style={{ marginRight: 4 }} /> Your post</span>
                        <button className="btn" style={{ borderColor: "#ef4444", color: "#ef4444" }} onClick={() => deleteItem(itemId)}>
                          <Trash2 size={13} style={{ marginRight: 4 }} /> Delete Post
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <button
                          className="btn"
                          style={{ padding: "4px 8px", fontSize: "0.75rem", color: "var(--mute)", borderColor: "var(--line)" }}
                          title="Report suspicious or fake post"
                          onClick={() => setReportingItem(i)}
                        >
                          <Flag size={12} style={{ marginRight: 3 }} /> Report
                        </button>
                        <button
                          className="btn primary"
                          onClick={() => {
                            setClaiming(i);
                            setClaimMessage("");
                          }}
                        >
                          {tab === "lost" ? "🤝 I found this item" : "🙋 This is mine (Claim)"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Claim / Contact Modal */}
      {claiming && (
        <Modal
          title={claiming.kind === "lost" ? `Contact ${claiming.by} about their lost item` : "Prove ownership of this item"}
          onClose={() => setClaiming(null)}
        >
          <p className="meta" style={{ marginBottom: "12px" }}>
            Item: <strong>{claiming.title}</strong> ({claiming.where || claiming.locality})
          </p>
          <Field
            label={
              claiming.kind === "lost"
                ? "Where is it now & how can they collect it?"
                : "Describe a hidden detail only the authentic owner would know (e.g., marks, contents, wallpaper):"
            }
          >
            <textarea
              rows="4"
              value={claimMessage}
              onChange={(e) => setClaimMessage(e.target.value)}
              placeholder={
                claiming.kind === "lost"
                  ? "I found your item near the market stall. I have kept it safely with the manager..."
                  : "It has a black scratch on the back, and inside there is a library card..."
              }
              autoFocus
            />
          </Field>
          <button className="btn primary wide" disabled={!claimMessage.trim()} onClick={handleClaim}>
            Send Message & Connect
          </button>
        </Modal>
      )}

      {/* Photo Lightbox */}
      {viewingPhoto && (
        <Modal title="Item Photo" onClose={() => setViewingPhoto(null)}>
          <img src={viewingPhoto} alt="Item" style={{ width: "100%", maxHeight: "500px", objectFit: "contain", borderRadius: "8px" }} />
        </Modal>
      )}

      {/* Rich Posting Modal */}
      {posting && (
        <PostModal
          defaultKind={tab}
          defaultLocality={userLocation?.area || user?.area}
          onClose={() => setPosting(false)}
          onSave={submitPost}
          notify={notify}
        />
      )}

      {/* Community Abuse & Scam Report Modal */}
      {reportingItem && (
        <ReportModal
          target={reportingItem}
          targetType="listing"
          onClose={() => setReportingItem(null)}
        />
      )}
    </>
  );
}

/**
 * Rich Modal for Reporting Lost Items or Posting Found Items
 */
function PostModal({ defaultKind, defaultLocality, onClose, onSave, notify }) {
  const [kind, setKind] = useState(defaultKind);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Wallet & Cards");
  const [description, setDescription] = useState("");
  const [where, setWhere] = useState(defaultLocality || "");
  const [incidentDate, setIncidentDate] = useState(() => new Date().toISOString().slice(0, 16));
  const [contactPhone, setContactPhone] = useState("");
  const [reward, setReward] = useState("");
  const [isUrgent, setIsUrgent] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);

  const fileInputRef = useRef(null);
  const isLost = kind === "lost";

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    try {
      setUploading(true);
      const uploaded = await uploadMedia(files);
      setPhotos((prev) => [...prev, ...uploaded]);
      notify(`${files.length} photo(s) attached!`);
    } catch (err) {
      notify(err.message || "Failed to upload photo.");
    } finally {
      setUploading(false);
    }
  };

  const handlePublish = () => {
    if (!title.trim() || !where.trim()) {
      notify("Please fill in the item name and location.");
      return;
    }
    onSave({
      kind,
      title: title.trim(),
      category,
      description: description.trim(),
      where: where.trim(),
      incidentDate,
      contactPhone: contactPhone.trim(),
      reward: reward.trim(),
      isUrgent,
      photos,
    });
  };

  return (
    <Modal title={isLost ? "🚨 Report a Lost Item" : "🎁 Post a Found Item"} onClose={onClose}>
      <div style={{ marginBottom: "14px" }}>
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: "lost", label: "I lost something" },
            { value: "found", label: "I found something" },
          ]}
        />
      </div>

      <Field label={isLost ? "What did you lose? *" : "What did you find? *"}>
        <input
          type="text"
          placeholder={isLost ? "e.g. Black leather wallet with Aadhaar & Driving Licence" : "e.g. Set of 3 house keys with red keychain"}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        <Field label="Item Category">
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.filter((c) => c !== "All").map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </Field>

        <Field label={isLost ? "Date & Time Lost" : "Date & Time Found"}>
          <input
            type="datetime-local"
            value={incidentDate}
            onChange={(e) => setIncidentDate(e.target.value)}
          />
        </Field>
      </div>

      <Field label={isLost ? "Where was it lost? (Specific spot or route) *" : "Where did you find it? *"}>
        <input
          type="text"
          placeholder="e.g. Near Bhimtal Lake main market / Road to Bhowali"
          value={where}
          onChange={(e) => setWhere(e.target.value)}
          required
        />
      </Field>

      <Field label="Detailed Description (Color, unique marks, brand, contents)">
        <textarea
          rows="3"
          placeholder={isLost ? "Describe unique identifying features so finder can recognize it..." : "Describe general appearance without revealing secret details..."}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        <Field label="Contact Phone / WhatsApp">
          <input
            type="tel"
            placeholder="+91 98765 43210"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
          />
        </Field>

        {isLost ? (
          <Field label="Reward Offered (Optional)">
            <input
              type="text"
              placeholder="e.g. ₹500 / A treat"
              value={reward}
              onChange={(e) => setReward(e.target.value)}
            />
          </Field>
        ) : (
          <Field label="Storage / Handover Note">
            <input
              type="text"
              placeholder="e.g. Kept at shop counter / with me"
              value={reward}
              onChange={(e) => setReward(e.target.value)}
            />
          </Field>
        )}
      </div>

      {/* Photo Attachment */}
      <div style={{ marginTop: "8px", marginBottom: "14px" }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={handleFileUpload}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Attach Reference Photo</span>
          <button
            type="button"
            className="btn"
            style={{ fontSize: "0.78rem", padding: "3px 8px" }}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Camera size={14} style={{ marginRight: 4 }} />
            {uploading ? "Uploading..." : "Add Photo"}
          </button>
        </div>

        {photos.length > 0 && (
          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            {photos.map((p, idx) => {
              const url = typeof p === "string" ? p : p.url;
              return (
                <div key={idx} style={{ position: "relative", width: "60px", height: "60px", borderRadius: "6px", overflow: "hidden", border: "1px solid var(--border)" }}>
                  <img src={url} alt="Uploaded" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <button
                    type="button"
                    onClick={() => setPhotos((prev) => prev.filter((_, i) => i !== idx))}
                    style={{ position: "absolute", top: 2, right: 2, background: "rgba(0,0,0,0.7)", color: "white", border: "none", borderRadius: "50%", padding: 2, cursor: "pointer" }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Urgent Alert Broadcast Checkbox */}
      {isLost && (
        <div
          style={{
            padding: "12px",
            background: "#FEF2F2",
            border: "1px solid #FCA5A5",
            borderRadius: "10px",
            marginBottom: "16px",
          }}
        >
          <label style={{ display: "flex", gap: "10px", alignItems: "flex-start", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={isUrgent}
              onChange={(e) => setIsUrgent(e.target.checked)}
              style={{ marginTop: "3px", width: "16px", height: "16px" }}
            />
            <div>
              <strong style={{ color: "#DC2626", fontSize: "0.88rem", display: "flex", alignItems: "center", gap: 4 }}>
                <Siren size={15} /> Broadcast Urgent Alert to Locality
              </strong>
              <p style={{ margin: "2px 0 0", fontSize: "0.78rem", color: "#B91C1C", lineHeight: 1.35 }}>
                Immediately flashes an emergency banner on all nearby neighbours' Home screens and notifies the community to look out for your item.
              </p>
            </div>
          </label>
        </div>
      )}

      <button
        type="button"
        className="btn primary wide"
        disabled={!title.trim() || !where.trim() || uploading}
        onClick={handlePublish}
      >
        {isUrgent ? "🚨 Broadcast Urgent Report & Alert" : isLost ? "Publish Lost Item Report" : "Publish Found Item Post"}
      </button>
    </Modal>
  );
}
