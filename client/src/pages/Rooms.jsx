import { useState, useEffect, useRef } from "react";
import {
  BadgeCheck,
  Plus,
  Trash2,
  CheckCircle2,
  Camera,
  Video,
  Image as ImageIcon,
  Film,
  Star,
  ChevronLeft,
  ChevronRight,
  LocateFixed,
  Eye,
  X,
  MessageCircle,
  Phone,
  Mail,
  Send,
  ExternalLink,
  Clock,
  Check,
  Pencil,
  Flag,
  CalendarDays,
} from "lucide-react";
import MapView from "../components/MapView.jsx";
import ReportModal from "../components/ReportModal.jsx";
import ReviewsModal from "../components/ReviewsModal.jsx";
import RoomLocationPicker from "../components/RoomLocationPicker.jsx";
import { BookRoomModal, BookingsModal } from "../components/RoomBookings.jsx";
import { Empty, Field, Modal, PageHead, Segmented } from "../components/ui.jsx";
import UserLink from "../components/UserLink.jsx";
import { useRatingsChanged } from "../components/StarRating.jsx";
import { useResource, useStore } from "../store.jsx";
import { post, get, patch, del, uploadMedia, getRequestMessages, sendRequestMessage } from "../api.js";

export default function Rooms() {
  const { radius, notify, user, userLocation } = useStore();
  const [rooms, setRooms, loadingRooms, refetchRooms] = useResource("rooms");
  // A rating was saved anywhere: reload so every card shows the same, fresh numbers.
  useRatingsChanged(() => { refetchRooms?.(); });
  const [mode, setMode] = useState("find"); // 'find' | 'sent' | 'owner'
  const [sel, setSel] = useState(null);
  const [adding, setAdding] = useState(false);
  const [inbox, setInbox] = useState([]);
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [sentRequests, setSentRequests] = useState([]);
  const [loadingSent, setLoadingSent] = useState(false);
  const [viewingMedia, setViewingMedia] = useState(null);
  const [activeChat, setActiveChat] = useState(null);
  const [editingRoom, setEditingRoom] = useState(null);
  const [reportingRoom, setReportingRoom] = useState(null);
  const [reviewingRoom, setReviewingRoom] = useState(null);
  const [bookingRoom, setBookingRoom] = useState(null);
  const [showBookings, setShowBookings] = useState(false);
  const [filters, setFilters] = useState({
    minRent: "",
    maxRent: "",
    roomType: "",
    amenity: "",
    availableBy: "",
  });

  const handleReviewUpdated = (roomId, stats) => {
    setRooms((prev) =>
      prev.map((item) =>
        (item.id === roomId || item._id === roomId)
          ? { ...item, averageRating: stats.averageRating, reviewsCount: stats.totalReviews }
          : item
      )
    );
  };

  const confirmRoomAvailability = async (roomId) => {
    try {
      const result = await patch("v1/listings", `${roomId}/availability`, {});
      const confirmedAt = result.availabilityConfirmedAt;
      setRooms((prev) => prev.map((room) => {
        if ((room.id || room._id) !== roomId) return room;
        return {
          ...room,
          availabilityConfirmedAt: confirmedAt,
          roomDetails: { ...room.roomDetails, availabilityConfirmedAt: confirmedAt },
        };
      }));
      notify("Availability confirmed for the next 7 days.");
    } catch (err) {
      notify(err.message || "Could not confirm availability.");
    }
  };

  // Fetch real seller inbox from MongoDB Atlas
  const fetchInbox = async () => {
    try {
      setLoadingInbox(true);
      const data = await get("requests/inbox");
      setInbox(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching inbox:", err);
    } finally {
      setLoadingInbox(false);
    }
  };

  // Fetch buyer sent requests from MongoDB Atlas
  const fetchSentRequests = async () => {
    try {
      setLoadingSent(true);
      const data = await get("requests/sent");
      setSentRequests(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching sent requests:", err);
    } finally {
      setLoadingSent(false);
    }
  };

  useEffect(() => {
    fetchSentRequests();
  }, []);

  useEffect(() => {
    if (mode === "owner") {
      fetchInbox();
    } else if (mode === "sent") {
      fetchSentRequests();
    }
  }, [mode]);

  const list = rooms.filter((r) => {
    const inRadius = radius >= 9999 || r.km == null || r.km <= radius;
    const rent = Number(r.rent || 0);
    const matchesMin = !filters.minRent || rent >= Number(filters.minRent);
    const matchesMax = !filters.maxRent || rent <= Number(filters.maxRent);
    const matchesType = !filters.roomType || r.roomType === filters.roomType;
    const matchesAmenity = !filters.amenity || (r.amenities || []).includes(filters.amenity);
    const availableFrom = r.availableFrom ? new Date(r.availableFrom) : null;
    const matchesDate = !filters.availableBy || !availableFrom || availableFrom <= new Date(`${filters.availableBy}T23:59:59`);
    return inRadius && matchesMin && matchesMax && matchesType && matchesAmenity && matchesDate;
  });
  const displayRooms = list;
  const pins = displayRooms.map((r) => ({
    ...r,
    kind: "rooms",
    label: r.title,
    latitude: r.latitude,
    longitude: r.longitude,
  }));

  // Map of listingId -> request object for current user
  const sentMap = {};
  sentRequests.forEach((req) => {
    const lId = req.listingId?.toString?.() || req.listingId;
    if (lId) sentMap[lId] = req;
  });

  // Send real inquiry to listing owner
  const request = async (r) => {
    const listingId = r.id || r._id;
    try {
      const created = await post("requests", {
        listingId,
        message: "Hi, I am interested in this room. Is it still available?",
      });
      setSentRequests((prev) => [created, ...prev]);
      notify(`Contact request sent to ${r.owner}. You'll see their details once accepted.`);
    } catch (err) {
      notify(err.message || "Failed to send request.");
    }
  };

  // Listing owner accepts or declines inquiry
  const decide = async (id, state) => {
    try {
      const updated = await patch("requests", id, { status: state });
      setInbox((i) =>
        i.map((x) =>
          (x._id === id || x.id === id)
            ? { ...x, status: state, sellerPhone: updated.data?.sellerPhone || x.sellerPhone, sellerEmail: updated.data?.sellerEmail || x.sellerEmail }
            : x
        )
      );
      notify(
        state === "accepted"
          ? "Accepted! Your contact details (Gmail & Phone) are now shared with the buyer."
          : "Declined request."
      );
    } catch (err) {
      notify(err.message || "Failed to update request.");
    }
  };

  // Create persistent listing in MongoDB Atlas
  const addRoom = async (form) => {
    if (form.latitude === "" || form.latitude == null || form.longitude === "" || form.longitude == null) {
      notify("Set the room's location first: use Detect GPS or pin it on the map.");
      return;
    }
    try {
      const item = await post("rooms", {
        title: form.title,
        rent: Number(form.rent),
        deposit: Number(form.deposit) || 0,
        maintenance: Number(form.maintenance) || 0,
        roomType: form.roomType || "Single",
        availableFrom: form.availableFrom || null,
        locality: form.locality || userLocation?.area || user?.area || "Local Area",
        addressLine1: form.addressLine1,
        addressLine2: form.addressLine2,
        city: form.city,
        state: form.state,
        pincode: form.pincode,
        unitNumber: form.unitNumber,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        locationSource: form.locationSource === "gps" ? "gps" : "manual",
        ...(form.locationSource === "gps" && form.locationAccuracyM != null ? { locationAccuracyM: form.locationAccuracyM } : {}),
        amenities: form.amenities ? (Array.isArray(form.amenities) ? form.amenities : form.amenities.split(",").map((s) => s.trim())) : ["Attached Bath", "WiFi"],
        photos: form.photos || [],
        videos: form.videos || [],
        verified: false,
      });
      setRooms((r) => [item, ...r]);
      setAdding(false);
      notify("Room successfully saved to database with persistent media. Visible to all nearby users.");
    } catch (err) {
      notify(err.message || "Failed to publish room.");
    }
  };

  // Delete persistent listing from MongoDB Atlas
  const deleteRoom = async (id) => {
    if (!window.confirm("Are you sure you want to delete this room listing?")) return;
    try {
      await del("rooms", id);
      setRooms((r) => r.filter((item) => (item.id || item._id) !== id));
      notify("Room listing and attached media removed from database.");
    } catch (err) {
      notify(err.message || "Failed to delete room listing.");
    }
  };

  // Update persistent listing in MongoDB Atlas
  const updateRoom = async (id, form) => {
    try {
      const updated = await patch("rooms", id, {
        title: form.title,
        rent: Number(form.rent),
        deposit: Number(form.deposit) || 0,
        maintenance: Number(form.maintenance) || 0,
        roomType: form.roomType || "Single",
        availableFrom: form.availableFrom || null,
        locality: form.locality,
        // Only sent when the owner actually changed the pin; the server validates it and keeps one room per spot.
        ...(form.coordinatesEdited && form.latitude !== "" && form.longitude !== ""
          ? {
              latitude: Number(form.latitude),
              longitude: Number(form.longitude),
              locationSource: form.locationSource === "gps" ? "gps" : "manual",
              ...(form.locationSource === "gps" && form.locationAccuracyM != null ? { locationAccuracyM: form.locationAccuracyM } : {}),
            }
          : {}),
        amenities: typeof form.amenities === "string" ? form.amenities.split(",").map((s) => s.trim()).filter(Boolean) : form.amenities,
        photos: form.photos || [],
        videos: form.videos || [],
        description: form.description || "",
      });
      const resolved = updated.data || updated;
      setRooms((prev) =>
        prev.map((item) => ((item.id || item._id) === id ? { ...item, ...resolved } : item))
      );
      setEditingRoom(null);
      notify("Room listing updated successfully in MongoDB Atlas!");
    } catch (err) {
      notify(err.message || "Failed to update room listing.");
    }
  };

  return (
    <>
      <PageHead
        title="Rooms"
        sub="Direct from verified owners with genuine photos, video tours, live map locations, and direct in-app chat."
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" onClick={() => setShowBookings(true)}><CalendarDays size={16} /> My bookings</button>
            <button className="btn primary" onClick={() => setAdding(true)}><Plus size={16} /> List a room</button>
          </div>
        }
      />

      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: "find", label: "Find a room" },
          { value: "sent", label: `My Inquiries & Chats ${sentRequests.length ? `(${sentRequests.length})` : ""}` },
          { value: "owner", label: `Owner Inbox & Chats ${inbox.length ? `(${inbox.length})` : ""}` },
        ]}
      />

      {/* Mode 1: Browse Rooms */}
      {mode === "find" && (
        <>
        <div className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end", marginBottom: 14 }}>
          <Field label="Min rent">
            <input type="number" min="0" value={filters.minRent} onChange={(e) => setFilters({ ...filters, minRent: e.target.value })} placeholder="₹0" />
          </Field>
          <Field label="Max rent">
            <input type="number" min="0" value={filters.maxRent} onChange={(e) => setFilters({ ...filters, maxRent: e.target.value })} placeholder="No limit" />
          </Field>
          <Field label="Room type">
            <select value={filters.roomType} onChange={(e) => setFilters({ ...filters, roomType: e.target.value })}>
              <option value="">All types</option>
              {["Single", "1RK", "1BHK", "2BHK", "Shared", "PG", "Other"].map((type) => <option key={type}>{type}</option>)}
            </select>
          </Field>
          <Field label="Amenity">
            <select value={filters.amenity} onChange={(e) => setFilters({ ...filters, amenity: e.target.value })}>
              <option value="">Any amenity</option>
              {["WiFi", "Attached Washroom", "RO Water", "AC", "Geyser", "Power Backup", "Parking", "Balcony"].map((amenity) => <option key={amenity}>{amenity}</option>)}
            </select>
          </Field>
          <Field label="Available by">
            <input type="date" value={filters.availableBy} onChange={(e) => setFilters({ ...filters, availableBy: e.target.value })} />
          </Field>
          <button className="btn" type="button" onClick={() => setFilters({ minRent: "", maxRent: "", roomType: "", amenity: "", availableBy: "" })}>Clear filters</button>
        </div>
        <div className="split">
          <div className="list">
            {list.length === 0 && <Empty text="No rooms found in this radius. Widen it from the sidebar or list the first one!" />}
            {list.map((r) => {
              const roomId = r.id || r._id;
              const isOwner = user && (r.ownerId === user.id || r.owner === user.name);
              const photos = r.photos || [];
              const videos = r.videos || [];
              const coverPhoto = photos.find((p) => p.isCover) || photos[0];
              const coverUrl = typeof coverPhoto === "string" ? coverPhoto : coverPhoto?.url;
              const userReq = sentMap[roomId];
              const isAccepted = userReq?.status === "accepted";
              const isPending = userReq?.status === "pending";

              return (
                <article key={roomId} className={`card ${sel === roomId ? "sel" : ""}`} onClick={() => setSel(roomId)}>
                  {coverUrl && (
                    <div
                      style={{
                        position: "relative",
                        width: "100%",
                        height: "170px",
                        marginBottom: "12px",
                        borderRadius: "10px",
                        overflow: "hidden",
                        background: "#0F172A",
                        cursor: "pointer",
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewingMedia(r);
                      }}
                    >
                      <img
                        src={coverUrl}
                        alt={r.title}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 24 24' fill='none' stroke='%2364748B' stroke-width='1.5'><rect width='18' height='18' x='3' y='3' rx='2'/><path d='m3 9 18 0'/><path d='m9 21 0-12'/></svg>";
                        }}
                      />
                      <div
                        style={{
                          position: "absolute",
                          bottom: "8px",
                          right: "8px",
                          background: "rgba(0,0,0,0.75)",
                          color: "#FFFFFF",
                          padding: "3px 8px",
                          borderRadius: "6px",
                          fontSize: "11px",
                          fontWeight: 600,
                          display: "flex",
                          gap: "6px",
                          alignItems: "center",
                        }}
                      >
                        <Eye size={12} />
                        <span>{photos.length} photos</span>
                        {videos.length > 0 && <span>· 🎥 {videos.length}</span>}
                      </div>
                    </div>
                  )}

                  <div className="card-top">
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: "6px",
                            background: "#EFF6FF",
                            color: "#1D4ED8",
                            border: "1px solid #BFDBFE",
                          }}
                        >
                          {r.roomType || "Room"}
                        </span>
                        {(() => {
                          const lastConfirmed = r.availabilityConfirmedAt || r.createdAt;
                          const daysAgo = Math.round((Date.now() - new Date(lastConfirmed).getTime()) / (1000 * 60 * 60 * 24));
                          const isFresh = daysAgo <= 7;
                          return (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                fontSize: "11px",
                                fontWeight: 700,
                                padding: "2px 8px",
                                borderRadius: 999,
                                background: isFresh ? "#DCFCE7" : "#FEF3C7",
                                color: isFresh ? "#166534" : "#92400E",
                              }}
                              title={`Availability verified ${daysAgo === 0 ? "today" : `${daysAgo}d ago`}`}
                            >
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: isFresh ? "#10B981" : "#F59E0B" }} />
                              {isFresh ? "Available Now" : "Awaiting Update"}
                            </span>
                          );
                        })()}
                      </div>
                      <h3 style={{ margin: 0 }}>{r.title}</h3>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <strong className="price">₹{Number(r.rent || 0).toLocaleString("en-IN")}<small>/mo</small></strong>
                      {r.deposit ? (
                        <div style={{ fontSize: "11px", color: "var(--mute)", marginTop: 2 }}>
                          Deposit: ₹{Number(r.deposit).toLocaleString("en-IN")}
                        </div>
                      ) : null}
                      {r.maintenance ? (
                        <div style={{ fontSize: "11px", color: "var(--mute)", marginTop: 2 }}>
                          Maintenance: ₹{Number(r.maintenance).toLocaleString("en-IN")}/mo
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <p className="meta" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span><UserLink id={r.ownerId} name={r.owner} /> · {r.locality || "Local Area"} {r.km != null ? `· ${r.km} km away` : ""}</span>
                    <span>·</span>
                    <button
                      type="button"
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 3,
                        fontWeight: 700,
                        color: "#D97706",
                        fontSize: "0.85rem",
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setReviewingRoom(r);
                      }}
                      title="View room ratings and reviews"
                    >
                      <Star size={13} className="star" /> {r.averageRating > 0 ? Number(r.averageRating).toFixed(1) : "New"}
                      <span style={{ fontWeight: 400, color: "var(--mute)", marginLeft: 2 }}>
                        ({r.reviewsCount || 0} {r.reviewsCount === 1 ? "review" : "reviews"})
                      </span>
                    </button>
                    {r.verified && (
                      <span className="ok" title="Phone & Profile details verified by platform">
                        <BadgeCheck size={14} /> Phone Verified
                      </span>
                    )}
                  </p>
                  <div className="chips">
                    {(r.amenities || []).map((a) => <span key={a} className="chip">{a}</span>)}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "#64748B", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                    <span>⚠️ Physical inspection not conducted by platform. Never pay advance/token online before viewing.</span>
                  </div>

                  {/* Accepted Contact Banner if Owner accepted request */}
                  {isAccepted && (
                    <div
                      style={{
                        background: "#ECFDF5",
                        border: "1px solid #A7F3D0",
                        borderRadius: "8px",
                        padding: "10px 12px",
                        marginTop: "12px",
                        fontSize: "0.85rem",
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#065F46", fontWeight: 700, marginBottom: 4 }}>
                        <CheckCircle2 size={16} color="#059669" />
                        <span>Owner Accepted! Contact Details Unlocked:</span>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: 6, color: "#047857" }}>
                        {userReq.sellerEmail && (
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <Mail size={14} />
                            <strong>Gmail:</strong>
                            <a href={`mailto:${userReq.sellerEmail}`} style={{ color: "#059669", textDecoration: "underline" }}>
                              {userReq.sellerEmail}
                            </a>
                          </div>
                        )}
                        {userReq.sellerPhone && (
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <Phone size={14} />
                            <strong>Mobile:</strong>
                            <a href={`tel:${userReq.sellerPhone}`} style={{ color: "#059669", textDecoration: "underline" }}>
                              {userReq.sellerPhone}
                            </a>
                            <a
                              href={`https://wa.me/${userReq.sellerPhone.replace(/\D/g, "")}`}
                              target="_blank"
                              rel="noreferrer"
                              style={{ marginLeft: 6, fontSize: "0.75rem", background: "#10B981", color: "white", padding: "1px 6px", borderRadius: 4, textDecoration: "none" }}
                            >
                              WhatsApp
                            </a>
                          </div>
                        )}
                      </div>
                      <button
                        className="btn primary"
                        style={{ marginTop: 8, padding: "4px 10px", fontSize: "0.8rem", display: "flex", alignItems: "center", gap: 4 }}
                        onClick={() => setActiveChat(userReq)}
                      >
                        <MessageCircle size={14} />
                        Chat with Owner in App
                      </button>
                    </div>
                  )}

                  <div className="card-actions" style={{ marginTop: 12 }}>
                    {photos.length > 0 && (
                      <button
                        className="btn"
                        style={{ padding: "4px 8px", fontSize: "0.8rem" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewingMedia(r);
                        }}
                      >
                        <Eye size={13} style={{ marginRight: 4 }} /> View Media ({photos.length + videos.length})
                      </button>
                    )}

                    <button
                      className="btn"
                      style={{ padding: "4px 8px", fontSize: "0.75rem", borderColor: "#FDE68A", background: "#FFFBEB", color: "#92400E" }}
                      title="View ratings breakdown and write a review"
                      onClick={(e) => {
                        e.stopPropagation();
                        setReviewingRoom(r);
                      }}
                    >
                      <Star size={12} style={{ marginRight: 3, fill: "#F59E0B", color: "#F59E0B" }} />
                      Reviews ({r.reviewsCount || 0})
                    </button>

                    {!isOwner && (
                      <button
                        className="btn"
                        style={{ padding: "4px 8px", fontSize: "0.75rem", color: "var(--mute)", borderColor: "var(--line)" }}
                        title="Report this listing to NearNest moderators"
                        onClick={(e) => {
                          e.stopPropagation();
                          setReportingRoom(r);
                        }}
                      >
                        <Flag size={12} style={{ marginRight: 3 }} /> Report
                      </button>
                    )}

                    {!isOwner && (
                      <button
                        className="btn"
                        style={{ marginLeft: "auto" }}
                        title="Reserve this room for a specific period"
                        onClick={(e) => { e.stopPropagation(); setBookingRoom(r); }}
                      >
                        <CalendarDays size={13} style={{ marginRight: 4 }} /> Book for a period
                      </button>
                    )}

                    {isOwner ? (
                      <div style={{ display: "flex", gap: "8px", alignItems: "center", marginLeft: "auto" }}>
                        <span className="status ok"><CheckCircle2 size={13} style={{ marginRight: 4 }} /> Your room</span>
                        <button
                          className="btn"
                          style={{ borderColor: "#2563EB", color: "#2563EB" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingRoom(r);
                          }}
                        >
                          <Pencil size={13} style={{ marginRight: 4 }} /> Edit
                        </button>
                        <button className="btn" onClick={(e) => { e.stopPropagation(); confirmRoomAvailability(roomId); }}>
                          <CheckCircle2 size={13} style={{ marginRight: 4 }} /> Confirm available
                        </button>
                        <button className="btn" style={{ borderColor: "#ef4444", color: "#ef4444" }} onClick={(e) => { e.stopPropagation(); deleteRoom(roomId); }}>
                          <Trash2 size={13} style={{ marginRight: 4 }} /> Delete
                        </button>
                      </div>
                    ) : isAccepted ? (
                      <button
                        className="btn primary"
                        style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveChat(userReq);
                        }}
                      >
                        <MessageCircle size={14} />
                        Chat with Owner
                      </button>
                    ) : isPending ? (
                      <span className="status wait" style={{ marginLeft: "auto" }}>Inquiry Sent · Waiting for Owner</span>
                    ) : (
                      <button className="btn primary" style={{ marginLeft: "auto" }} onClick={(e) => { e.stopPropagation(); request(r); }}>
                        Request to contact
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          <MapView
            pins={pins}
            radius={radius}
            selected={sel && `rooms-${sel}`}
            onSelect={(p) => setSel(p.id)}
            height={520}
          />
        </div>
        </>
      )}

      {/* Mode 2: My Sent Inquiries & Chats (Buyer View) */}
      {mode === "sent" && (
        <div className="list narrow">
          {loadingSent && <p className="meta" style={{ textAlign: "center", padding: 24 }}>Loading your inquiries...</p>}
          {!loadingSent && sentRequests.length === 0 && (
            <Empty text="You haven't sent any inquiries yet. Browse rooms and click 'Request to contact' to start." />
          )}
          {sentRequests.map((req) => {
            const reqId = req._id || req.id;
            const isAccepted = req.status === "accepted";
            const isPending = req.status === "pending";

            return (
              <article key={reqId} className="card" style={{ borderLeft: isAccepted ? "4px solid #10B981" : "4px solid #F59E0B" }}>
                <div className="card-top">
                  <h3>{req.listingTitle || "Room Listing"}</h3>
                  <span className={`status ${isAccepted ? "ok" : isPending ? "wait" : "bad"}`}>
                    {isAccepted ? "Accepted" : isPending ? "Pending" : "Declined"}
                  </span>
                </div>

                <p className="meta" style={{ marginTop: 4 }}>
                  Initial Message: "{req.message}"
                </p>

                {isAccepted ? (
                  <div
                    style={{
                      background: "#F0FDF4",
                      border: "1px solid #BBF7D0",
                      borderRadius: "8px",
                      padding: "12px",
                      marginTop: "10px",
                    }}
                  >
                    <div style={{ fontWeight: 700, color: "#166534", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                      <CheckCircle2 size={16} color="#16A34A" />
                      <span>Owner has accepted your request! Here are their contact details:</span>
                    </div>

                    <div style={{ display: "grid", gap: 6, fontSize: "0.9rem", color: "#15803D" }}>
                      {req.sellerEmail && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <Mail size={15} />
                          <strong>Owner Gmail:</strong>
                          <a href={`mailto:${req.sellerEmail}`} style={{ color: "#15803D", textDecoration: "underline" }}>
                            {req.sellerEmail}
                          </a>
                        </div>
                      )}

                      {req.sellerPhone ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <Phone size={15} />
                          <strong>Mobile Number:</strong>
                          <a href={`tel:${req.sellerPhone}`} style={{ color: "#15803D", textDecoration: "underline" }}>
                            {req.sellerPhone}
                          </a>
                          <a
                            href={`https://wa.me/${req.sellerPhone.replace(/\D/g, "")}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              marginLeft: 8,
                              fontSize: "0.75rem",
                              background: "#16A34A",
                              color: "white",
                              padding: "2px 8px",
                              borderRadius: 4,
                              textDecoration: "none",
                              fontWeight: 600,
                            }}
                          >
                            WhatsApp
                          </a>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#64748B", fontSize: "0.85rem" }}>
                          <Phone size={14} />
                          <span>Mobile number not specified by owner (Use in-app chat)</span>
                        </div>
                      )}
                    </div>

                    <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                      <button
                        className="btn primary"
                        style={{ display: "flex", alignItems: "center", gap: 6 }}
                        onClick={() => setActiveChat(req)}
                      >
                        <MessageCircle size={16} />
                        Open Live Chat with Owner
                      </button>
                    </div>
                  </div>
                ) : isPending ? (
                  <p style={{ fontSize: "0.85rem", color: "#B45309", marginTop: 8 }}>
                    Waiting for the owner to accept. Once accepted, their Gmail and Mobile number will be revealed here and in-app chat will unlock.
                  </p>
                ) : (
                  <p style={{ fontSize: "0.85rem", color: "#DC2626", marginTop: 8 }}>
                    The owner was unable to accommodate this request.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Mode 3: Owner Inbox & Chats (Seller View) */}
      {mode === "owner" && (
        <div className="list narrow">
          {loadingInbox && <p className="meta" style={{ textAlign: "center", padding: 24 }}>Loading inquiries from database...</p>}
          {!loadingInbox && inbox.length === 0 && (
            <Empty text="No inquiries yet. When people request to contact you about your rooms, their messages will appear here." />
          )}
          {inbox.map((m) => {
            const reqId = m._id || m.id;
            const reqStatus = m.status || m.state || "pending";
            const isAccepted = reqStatus === "accepted";

            return (
              <article key={reqId} className="card" style={{ borderLeft: isAccepted ? "4px solid #10B981" : undefined }}>
                <div className="card-top">
                  <h3>{m.buyerName || m.from || "Interested Buyer"}</h3>
                  <span className={`status ${isAccepted ? "ok" : reqStatus === "pending" ? "wait" : "bad"}`}>
                    {isAccepted ? "Accepted" : reqStatus === "pending" ? "Pending" : "Declined"}
                  </span>
                </div>

                {m.listingTitle && (
                  <p style={{ margin: "4px 0", fontSize: "0.85rem", color: "#2563eb", fontWeight: "600" }}>
                    Listing: {m.listingTitle}
                  </p>
                )}

                <p className="meta">{m.message || m.msg}</p>

                {reqStatus === "pending" ? (
                  <div className="card-actions" style={{ marginTop: 10 }}>
                    <button className="btn primary" onClick={() => decide(reqId, "accepted")}>
                      Accept & Share Contact
                    </button>
                    <button className="btn" onClick={() => decide(reqId, "declined")}>
                      Decline
                    </button>
                  </div>
                ) : isAccepted ? (
                  <div
                    style={{
                      background: "#F8FAFC",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      padding: "10px",
                      marginTop: "10px",
                    }}
                  >
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", fontSize: "0.85rem", color: "#334155" }}>
                      {m.buyerEmail && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <Mail size={14} color="#64748B" />
                          <span>Buyer Email: <strong>{m.buyerEmail}</strong></span>
                        </div>
                      )}
                      {m.buyerPhone && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <Phone size={14} color="#64748B" />
                          <span>Buyer Mobile: <strong>{m.buyerPhone}</strong></span>
                        </div>
                      )}
                    </div>

                    <button
                      className="btn primary"
                      style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}
                      onClick={() => setActiveChat(m)}
                    >
                      <MessageCircle size={15} />
                      Chat with Buyer
                    </button>
                  </div>
                ) : (
                  <span className="status bad" style={{ marginTop: 8, display: "inline-block" }}>
                    Declined
                  </span>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Add Room Modal */}
      {adding && (
        <AddRoomModal
          onClose={() => setAdding(false)}
          onSave={addRoom}
          defaultLocality={user?.area}
          userLocation={userLocation}
          notify={notify}
        />
      )}

      {/* Edit Room Modal */}
      {editingRoom && (
        <EditRoomModal
          room={editingRoom}
          onClose={() => setEditingRoom(null)}
          onSave={(form) => updateRoom(editingRoom.id || editingRoom._id, form)}
          userLocation={userLocation}
          notify={notify}
        />
      )}

      {/* Media Viewer Modal */}
      {viewingMedia && (
        <MediaViewerModal
          listing={viewingMedia}
          onClose={() => setViewingMedia(null)}
        />
      )}

      {/* In-App Live Chat Modal */}
      {activeChat && (
        <ChatModal
          request={activeChat}
          currentUser={user}
          onClose={() => {
            setActiveChat(null);
            if (mode === "sent") fetchSentRequests();
            if (mode === "owner") fetchInbox();
          }}
        />
      )}

      {/* Community Abuse & Scam Report Modal */}
      {reportingRoom && (
        <ReportModal
          target={reportingRoom}
          targetType="listing"
          onClose={() => setReportingRoom(null)}
        />
      )}

      {/* Ratings & Reviews Modal */}
      {reviewingRoom && (
        <ReviewsModal
          listing={reviewingRoom}
          onClose={() => setReviewingRoom(null)}
          onReviewUpdated={(stats) => handleReviewUpdated(reviewingRoom.id || reviewingRoom._id, stats)}
        />
      )}

      {/* Book a room for a specific period (locks the room once the owner accepts) */}
      {bookingRoom && (
        <BookRoomModal
          room={bookingRoom}
          onClose={() => setBookingRoom(null)}
          onDone={() => setShowBookings(true)}
        />
      )}

      {/* Bookings: accept/decline + mutual early release */}
      {showBookings && (
        <BookingsModal onClose={() => setShowBookings(false)} onChanged={() => refetchRooms?.()} />
      )}
    </>
  );
}

/**
 * Modal to list a new room with Camera, Gallery Media Upload, Cover Photo, and Map Pin
 */
function AddRoomModal({ onClose, onSave, defaultLocality, userLocation, notify }) {
  const [form, setForm] = useState({
    title: "",
    rent: "",
    deposit: "",
    maintenance: "",
    roomType: "Single",
    availableFrom: "",
    locality: defaultLocality || "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    pincode: "",
    unitNumber: "",
    amenities: "Attached Bath, WiFi, Balcony",
    latitude: "",
    longitude: "",
    locationSource: null,
    locationAccuracyM: null,
  });
  const addressComplete =
    form.addressLine1.trim().length >= 3 &&
    form.locality.trim().length >= 2 &&
    form.city.trim().length >= 2 &&
    form.state.trim().length >= 2 &&
    /^[1-9][0-9]{5}$/.test(form.pincode.trim());

  const [photos, setPhotos] = useState([]); // [{ url, name, size, isCover }]
  const [videos, setVideos] = useState([]); // [{ url, name, size }]
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");

  const camPhotoRef = useRef(null);
  const camVideoRef = useRef(null);
  const galPhotoRef = useRef(null);
  const galVideoRef = useRef(null);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  // Handle media file selection & upload to persistent server
  const handleFiles = async (e, type) => {
    const fileList = Array.from(e.target.files || []);
    if (fileList.length === 0) return;

    if (type === "photo" && photos.length + fileList.length > 10) {
      notify("Maximum 10 photos allowed per listing.");
      return;
    }
    if (type === "video" && videos.length + fileList.length > 2) {
      notify("Maximum 2 videos allowed per listing.");
      return;
    }

    try {
      setUploading(true);
      setUploadProgress(`Uploading ${fileList.length} file(s)...`);

      const uploaded = await uploadMedia(fileList);

      const newPhotos = [];
      const newVideos = [];

      for (const f of uploaded) {
        if (f.type === "video") {
          newVideos.push(f);
        } else {
          newPhotos.push({
            ...f,
            isCover: photos.length === 0 && newPhotos.length === 0,
          });
        }
      }

      setPhotos((prev) => [...prev, ...newPhotos]);
      setVideos((prev) => [...prev, ...newVideos]);
      notify(`Uploaded ${uploaded.length} file(s) successfully.`);
    } catch (err) {
      notify(err.message || "Upload failed.");
    } finally {
      setUploading(false);
      setUploadProgress("");
      if (e.target) e.target.value = "";
    }
  };

  const removePhoto = (idx) => {
    setPhotos((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length > 0 && !next.some((p) => p.isCover)) {
        next[0].isCover = true;
      }
      return next;
    });
  };

  const removeVideo = (idx) => {
    setVideos((prev) => prev.filter((_, i) => i !== idx));
  };

  const setCover = (idx) => {
    setPhotos((prev) =>
      prev.map((p, i) => ({
        ...p,
        isCover: i === idx,
      }))
    );
  };

  const movePhoto = (idx, dir) => {
    setPhotos((prev) => {
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const temp = copy[idx];
      copy[idx] = copy[target];
      copy[target] = temp;
      return copy;
    });
  };

  return (
    <Modal title="List a Room for Rent" onClose={onClose}>
      <Field label="Listing Title *">
        <input
          value={form.title}
          onChange={set("title")}
          placeholder="e.g. 2 floor house (4 rooms + 2 bathroom)"
          required
        />
      </Field>

      <Field label="Monthly Rent (Rs) *">
        <input
          type="number"
          value={form.rent}
          onChange={set("rent")}
          placeholder="e.g. 50000"
          required
        />
      </Field>

      <Field label="Security Deposit (Rs)">
        <input type="number" min="0" value={form.deposit} onChange={set("deposit")} placeholder="0" />
      </Field>

      <Field label="Monthly Maintenance (Rs)">
        <input type="number" min="0" value={form.maintenance} onChange={set("maintenance")} placeholder="0" />
      </Field>

      <Field label="Room Type">
        <select value={form.roomType} onChange={set("roomType")}>
          {["Single", "1RK", "1BHK", "2BHK", "Shared", "PG", "Other"].map((type) => <option key={type}>{type}</option>)}
        </select>
      </Field>

      <Field label="Available from">
        <input type="date" value={form.availableFrom} onChange={set("availableFrom")} />
      </Field>

      <Field label="Locality / Area Name *">
        <input
          value={form.locality}
          onChange={set("locality")}
          placeholder="e.g. Bhimtal, Connaught Place, etc."
          required
        />
      </Field>

      <Field label="House / Flat No. & Street *">
        <input value={form.addressLine1} onChange={set("addressLine1")} placeholder="e.g. 12/B, Shastri Nagar Main Road" required />
      </Field>
      <Field label="Building / Colony (optional)">
        <input value={form.addressLine2} onChange={set("addressLine2")} placeholder="e.g. Sunrise Apartments, Block C" />
      </Field>
      <Field label="City *">
        <input value={form.city} onChange={set("city")} placeholder="e.g. Meerut" required />
      </Field>
      <Field label="State *">
        <input value={form.state} onChange={set("state")} placeholder="e.g. Uttar Pradesh" required />
      </Field>
      <Field label="PIN Code *">
        <input value={form.pincode} onChange={set("pincode")} inputMode="numeric" maxLength={6} placeholder="6-digit PIN code" required />
      </Field>
      <Field label="Room / Flat No. inside the property (optional)">
        <input value={form.unitNumber} onChange={set("unitNumber")} placeholder="e.g. Room 2, Flat 302" />
      </Field>
      <p className="meta" style={{ margin: "0 0 8px" }}>
        The full address stays private. A unique ID is generated from it automatically and is visible to administrators only.
        The same address cannot be listed twice by different people.
      </p>

      <Field label="Amenities (comma separated)">
        <input
          value={form.amenities}
          onChange={set("amenities")}
          placeholder="Attached Bath, WiFi, Balcony, CCTV"
        />
      </Field>

      {/* Room location: real GPS fix or a manual map pin (the room's permanent identity) */}
      <RoomLocationPicker
        value={{ latitude: form.latitude, longitude: form.longitude, source: form.locationSource, accuracyM: form.locationAccuracyM }}
        onChange={(v) => setForm((f) => ({ ...f, latitude: v.latitude, longitude: v.longitude, locationSource: v.source, locationAccuracyM: v.accuracyM }))}
        fallbackCentre={userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : null}
        notify={notify}
      />

      {/* Media Upload Section */}
      <div style={{ marginTop: "16px", border: "1px solid var(--border)", borderRadius: "10px", padding: "12px", background: "var(--paper)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px" }}>
          <div>
            <strong style={{ fontSize: "0.9rem" }}>Room Photos & Videos</strong>
            <p className="meta" style={{ margin: 0 }}>Max 10 photos (10MB each), max 2 videos (50MB each)</p>
          </div>
          {uploading && <span style={{ fontSize: "0.8rem", color: "#2563EB", fontWeight: 600 }}>{uploadProgress}</span>}
        </div>

        {/* Hidden File Inputs */}
        <input ref={camPhotoRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => handleFiles(e, "photo")} />
        <input ref={camVideoRef} type="file" accept="video/mp4,video/webm,video/quicktime" capture="environment" style={{ display: "none" }} onChange={(e) => handleFiles(e, "video")} />
        <input ref={galPhotoRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple style={{ display: "none" }} onChange={(e) => handleFiles(e, "photo")} />
        <input ref={galVideoRef} type="file" accept="video/mp4,video/webm,video/quicktime" multiple style={{ display: "none" }} onChange={(e) => handleFiles(e, "video")} />

        {/* Media Trigger Buttons */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "8px" }}>
          <button type="button" className="btn" onClick={() => camPhotoRef.current?.click()} disabled={uploading}>
            <Camera size={15} style={{ marginRight: 4 }} /> Camera Photo
          </button>
          <button type="button" className="btn" onClick={() => camVideoRef.current?.click()} disabled={uploading}>
            <Video size={15} style={{ marginRight: 4 }} /> Camera Video
          </button>
          <button type="button" className="btn" onClick={() => galPhotoRef.current?.click()} disabled={uploading}>
            <ImageIcon size={15} style={{ marginRight: 4 }} /> Choose Photos
          </button>
          <button type="button" className="btn" onClick={() => galVideoRef.current?.click()} disabled={uploading}>
            <Film size={15} style={{ marginRight: 4 }} /> Choose Videos
          </button>
        </div>

        {/* Photo Previews */}
        {photos.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(85px, 1fr))", gap: "8px", marginTop: "12px" }}>
            {photos.map((p, idx) => (
              <div key={idx} style={{ position: "relative", height: "85px", borderRadius: "8px", overflow: "hidden", border: p.isCover ? "2px solid #2563EB" : "1px solid var(--border)" }}>
                <img src={p.url} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                {p.isCover && (
                  <span style={{ position: "absolute", top: 3, left: 3, background: "#2563EB", color: "white", fontSize: "9px", padding: "1px 4px", borderRadius: 4, fontWeight: 700 }}>
                    Cover
                  </span>
                )}
                <div style={{ position: "absolute", bottom: 2, left: 2, right: 2, display: "flex", justifyContent: "space-between", background: "rgba(0,0,0,0.6)", borderRadius: 4, padding: "1px 2px" }}>
                  <button type="button" onClick={() => movePhoto(idx, -1)} disabled={idx === 0} style={{ background: "none", border: "none", color: "white", cursor: "pointer", padding: 0 }}>
                    <ChevronLeft size={13} />
                  </button>
                  {!p.isCover && (
                    <button type="button" onClick={() => setCover(idx)} title="Make Cover Photo" style={{ background: "none", border: "none", color: "#FBBF24", cursor: "pointer", padding: 0 }}>
                      <Star size={12} />
                    </button>
                  )}
                  <button type="button" onClick={() => movePhoto(idx, 1)} disabled={idx === photos.length - 1} style={{ background: "none", border: "none", color: "white", cursor: "pointer", padding: 0 }}>
                    <ChevronRight size={13} />
                  </button>
                  <button type="button" onClick={() => removePhoto(idx)} style={{ background: "none", border: "none", color: "#EF4444", cursor: "pointer", padding: 0 }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Video Previews */}
        {videos.length > 0 && (
          <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
            {videos.map((v, idx) => (
              <div key={idx} style={{ position: "relative", width: "140px", borderRadius: "8px", overflow: "hidden", border: "1px solid var(--border)", background: "#000" }}>
                <video src={v.url} controls style={{ width: "100%", height: "80px", objectFit: "cover" }} />
                <button
                  type="button"
                  onClick={() => removeVideo(idx)}
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    background: "rgba(0,0,0,0.7)",
                    color: "#EF4444",
                    border: "none",
                    borderRadius: "50%",
                    padding: 3,
                    cursor: "pointer",
                  }}
                  title="Remove video"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        className="btn primary wide"
        disabled={!form.title || !form.rent || !addressComplete || uploading}
        title={!addressComplete ? "Enter the complete address (house/street, locality, city, state, 6-digit PIN code)" : undefined}
        onClick={() => onSave({ ...form, photos, videos })}
        style={{ marginTop: 16 }}
      >
        {uploading ? "Uploading media..." : "Publish Room to Database"}
      </button>
    </Modal>
  );
}

/**
 * Modal for sellers to edit existing room details, photos, videos, rent, and location
 */
function EditRoomModal({ room, onClose, onSave, userLocation, notify }) {
  const [form, setForm] = useState({
    title: room.title || room.name || "",
    rent: room.rent != null ? room.rent : "",
    deposit: room.deposit != null ? room.deposit : "",
    maintenance: room.maintenance != null ? room.maintenance : "",
    roomType: room.roomType || "Single",
    availableFrom: room.availableFrom ? new Date(room.availableFrom).toISOString().slice(0, 10) : "",
    locality: room.locality || room.where || "",
    amenities: Array.isArray(room.amenities) ? room.amenities.join(", ") : (room.amenities || ""),
    latitude: room.latitude ?? "",
    longitude: room.longitude ?? "",
    description: room.description || "",
  });
  const [coordinatesEdited, setCoordinatesEdited] = useState(false);

  const [photos, setPhotos] = useState(room.photos || []);
  const [videos, setVideos] = useState(room.videos || []);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");

  const camPhotoRef = useRef(null);
  const camVideoRef = useRef(null);
  const galPhotoRef = useRef(null);
  const galVideoRef = useRef(null);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const handleFiles = async (e, type) => {
    const fileList = Array.from(e.target.files || []);
    if (fileList.length === 0) return;

    if (type === "photo" && photos.length + fileList.length > 10) {
      notify("Maximum 10 photos allowed per listing.");
      return;
    }
    if (type === "video" && videos.length + fileList.length > 2) {
      notify("Maximum 2 videos allowed per listing.");
      return;
    }

    try {
      setUploading(true);
      setUploadProgress(`Uploading ${fileList.length} file(s)...`);
      const uploaded = await uploadMedia(fileList);

      const newPhotos = [];
      const newVideos = [];

      for (const f of uploaded) {
        if (f.type === "video") {
          newVideos.push(f);
        } else {
          newPhotos.push({
            ...f,
            isCover: photos.length === 0 && newPhotos.length === 0,
          });
        }
      }

      setPhotos((prev) => [...prev, ...newPhotos]);
      setVideos((prev) => [...prev, ...newVideos]);
      notify(`Added ${uploaded.length} new media file(s).`);
    } catch (err) {
      notify(err.message || "Upload failed.");
    } finally {
      setUploading(false);
      setUploadProgress("");
      if (e.target) e.target.value = "";
    }
  };

  const removePhoto = (idx) => {
    setPhotos((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length > 0 && !next.some((p) => p.isCover)) {
        if (typeof next[0] === "object") next[0].isCover = true;
      }
      return next;
    });
  };

  const removeVideo = (idx) => {
    setVideos((prev) => prev.filter((_, i) => i !== idx));
  };

  const setCover = (idx) => {
    setPhotos((prev) =>
      prev.map((p, i) => {
        if (typeof p === "string") return { url: p, isCover: i === idx };
        return { ...p, isCover: i === idx };
      })
    );
  };

  return (
    <Modal title={`Edit Room — ${room.title}`} onClose={onClose}>
      <Field label="Listing Title *">
        <input
          value={form.title}
          onChange={set("title")}
          placeholder="e.g. 2 floor house (4 rooms + 2 bathroom)"
          required
        />
      </Field>

      <Field label="Monthly Rent (₹) *">
        <input
          type="number"
          value={form.rent}
          onChange={set("rent")}
          placeholder="e.g. 50000"
          required
        />
      </Field>

      <Field label="Security Deposit (₹)">
        <input type="number" min="0" value={form.deposit} onChange={set("deposit")} placeholder="0" />
      </Field>

      <Field label="Monthly Maintenance (₹)">
        <input type="number" min="0" value={form.maintenance} onChange={set("maintenance")} placeholder="0" />
      </Field>

      <Field label="Room Type">
        <select value={form.roomType} onChange={set("roomType")}>
          {["Single", "1RK", "1BHK", "2BHK", "Shared", "PG", "Other"].map((type) => <option key={type}>{type}</option>)}
        </select>
      </Field>

      <Field label="Available from">
        <input type="date" value={form.availableFrom} onChange={set("availableFrom")} />
      </Field>

      <Field label="Locality / Area Name *">
        <input
          value={form.locality}
          onChange={set("locality")}
          placeholder="e.g. Bhimtal, Nainital, etc."
          required
        />
      </Field>

      <Field label="Amenities (comma separated)">
        <input
          value={form.amenities}
          onChange={set("amenities")}
          placeholder="Attached Bath, WiFi, Balcony, CCTV"
        />
      </Field>

      {/* Room location: exact stored point; any change is validated by the server (one room per spot) */}
      <RoomLocationPicker
        value={{ latitude: form.latitude, longitude: form.longitude, source: form.locationSource ?? room.locationSource ?? "manual", accuracyM: form.locationAccuracyM ?? room.locationAccuracyM ?? null }}
        onChange={(v) => {
          setForm((f) => ({ ...f, latitude: v.latitude, longitude: v.longitude, locationSource: v.source, locationAccuracyM: v.accuracyM }));
          setCoordinatesEdited(true);
        }}
        fallbackCentre={userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : null}
        notify={notify}
      />

      {/* Media Management */}
      <div style={{ marginTop: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <strong style={{ fontSize: "0.9rem" }}>📸 Manage Photos ({photos.length}/10)</strong>
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              type="button"
              className="btn"
              style={{ fontSize: "0.75rem", padding: "4px 8px" }}
              onClick={() => camPhotoRef.current?.click()}
              disabled={photos.length >= 10 || uploading}
            >
              <Camera size={13} style={{ marginRight: 4 }} /> Camera
            </button>
            <button
              type="button"
              className="btn"
              style={{ fontSize: "0.75rem", padding: "4px 8px" }}
              onClick={() => galPhotoRef.current?.click()}
              disabled={photos.length >= 10 || uploading}
            >
              <ImageIcon size={13} style={{ marginRight: 4 }} /> Add Photos
            </button>
          </div>
        </div>

        <input ref={camPhotoRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => handleFiles(e, "photo")} />
        <input ref={galPhotoRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => handleFiles(e, "photo")} />

        {photos.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(85px, 1fr))", gap: "8px", marginTop: "8px" }}>
            {photos.map((p, idx) => {
              const url = typeof p === "string" ? p : p.url;
              const isCover = typeof p === "object" ? p.isCover : idx === 0;
              return (
                <div
                  key={idx}
                  style={{
                    position: "relative",
                    borderRadius: "8px",
                    overflow: "hidden",
                    border: isCover ? "2px solid #2563EB" : "1px solid var(--border)",
                    height: "75px",
                    background: "#000",
                  }}
                >
                  <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <button
                    type="button"
                    onClick={() => removePhoto(idx)}
                    style={{
                      position: "absolute",
                      top: 2,
                      right: 2,
                      background: "rgba(0,0,0,0.7)",
                      color: "white",
                      border: "none",
                      borderRadius: "50%",
                      width: "20px",
                      height: "20px",
                      cursor: "pointer",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <X size={12} />
                  </button>
                  {isCover ? (
                    <span style={{ position: "absolute", bottom: 2, left: 2, background: "#2563EB", color: "white", fontSize: "0.6rem", padding: "1px 4px", borderRadius: 3, fontWeight: 700 }}>
                      Cover
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCover(idx)}
                      style={{ position: "absolute", bottom: 2, left: 2, background: "rgba(0,0,0,0.6)", color: "white", fontSize: "0.6rem", padding: "1px 4px", borderRadius: 3, border: "none", cursor: "pointer" }}
                    >
                      Make Cover
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Videos Management */}
      <div style={{ marginTop: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <strong style={{ fontSize: "0.9rem" }}>🎥 Manage Video Tours ({videos.length}/2)</strong>
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              type="button"
              className="btn"
              style={{ fontSize: "0.75rem", padding: "4px 8px" }}
              onClick={() => camVideoRef.current?.click()}
              disabled={videos.length >= 2 || uploading}
            >
              <Video size={13} style={{ marginRight: 4 }} /> Record
            </button>
            <button
              type="button"
              className="btn"
              style={{ fontSize: "0.75rem", padding: "4px 8px" }}
              onClick={() => galVideoRef.current?.click()}
              disabled={videos.length >= 2 || uploading}
            >
              <Film size={13} style={{ marginRight: 4 }} /> Add Video
            </button>
          </div>
        </div>

        <input ref={camVideoRef} type="file" accept="video/*" capture="environment" style={{ display: "none" }} onChange={(e) => handleFiles(e, "video")} />
        <input ref={galVideoRef} type="file" accept="video/*" style={{ display: "none" }} onChange={(e) => handleFiles(e, "video")} />

        {videos.length > 0 && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
            {videos.map((v, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "var(--paper)",
                  padding: "6px 10px",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  fontSize: "0.8rem",
                }}
              >
                <Film size={14} color="#2563EB" />
                <span style={{ maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {v.name || `Video Tour ${idx + 1}`}
                </span>
                <button
                  type="button"
                  onClick={() => removeVideo(idx)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#EF4444", padding: 0 }}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        className="btn primary wide"
        disabled={!form.title || !form.rent || uploading}
        onClick={() => onSave({ ...form, coordinatesEdited, photos, videos })}
        style={{ marginTop: 20 }}
      >
        {uploading ? uploadProgress || "Saving..." : "Save Listing Changes"}
      </button>
    </Modal>
  );
}

/**
 * High-Res Media Viewer Modal for published listing photos and videos
 */
function MediaViewerModal({ listing, onClose }) {
  const photos = listing.photos || [];
  const videos = listing.videos || [];
  const [tab, setTab] = useState(photos.length > 0 ? "photos" : "videos");
  const [photoIndex, setPhotoIndex] = useState(0);

  const currentPhoto = photos[photoIndex];
  const photoUrl = typeof currentPhoto === "string" ? currentPhoto : currentPhoto?.url;

  return (
    <Modal title={`${listing.title} — Media Gallery`} onClose={onClose}>
      <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
        {photos.length > 0 && (
          <button
            className={`btn ${tab === "photos" ? "primary" : ""}`}
            onClick={() => setTab("photos")}
            style={{ fontSize: "0.85rem", padding: "4px 12px" }}
          >
            Photos ({photos.length})
          </button>
        )}
        {videos.length > 0 && (
          <button
            className={`btn ${tab === "videos" ? "primary" : ""}`}
            onClick={() => setTab("videos")}
            style={{ fontSize: "0.85rem", padding: "4px 12px" }}
          >
            Video Tours ({videos.length})
          </button>
        )}
      </div>

      {tab === "photos" && photos.length > 0 && (
        <div>
          <div
            style={{
              position: "relative",
              width: "100%",
              height: "280px",
              background: "#0F172A",
              borderRadius: "10px",
              overflow: "hidden",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <img
              src={photoUrl}
              alt="Room view"
              style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
            />
            {photos.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => setPhotoIndex((i) => (i > 0 ? i - 1 : photos.length - 1))}
                  style={{
                    position: "absolute",
                    left: 8,
                    background: "rgba(0,0,0,0.6)",
                    color: "white",
                    border: "none",
                    borderRadius: "50%",
                    width: 32,
                    height: 32,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  type="button"
                  onClick={() => setPhotoIndex((i) => (i < photos.length - 1 ? i + 1 : 0))}
                  style={{
                    position: "absolute",
                    right: 8,
                    background: "rgba(0,0,0,0.6)",
                    color: "white",
                    border: "none",
                    borderRadius: "50%",
                    width: 32,
                    height: 32,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  <ChevronRight size={20} />
                </button>
              </>
            )}
          </div>

          {/* Thumbnail row */}
          {photos.length > 1 && (
            <div style={{ display: "flex", gap: "6px", marginTop: "10px", overflowX: "auto", paddingBottom: "4px" }}>
              {photos.map((p, idx) => {
                const u = typeof p === "string" ? p : p?.url;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setPhotoIndex(idx)}
                    style={{
                      width: 50,
                      height: 50,
                      borderRadius: 6,
                      overflow: "hidden",
                      border: idx === photoIndex ? "2px solid #2563EB" : "1px solid var(--border)",
                      padding: 0,
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    <img src={u} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "videos" && videos.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {videos.map((v, idx) => (
            <div key={idx} style={{ borderRadius: "10px", overflow: "hidden", background: "#000" }}>
              <video
                src={v.url}
                controls
                style={{ width: "100%", maxHeight: "280px" }}
              />
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

/**
 * Interactive In-App Live Chat Modal between Buyer and Seller
 */
function ChatModal({ request, currentUser, onClose }) {
  const reqId = request._id || request.id;
  const isBuyer = currentUser?.id === (request.buyerId?._id || request.buyerId);
  const otherPartyName = isBuyer ? (request.sellerName || "Room Owner") : (request.buyerName || "Interested Buyer");

  const [messages, setMessages] = useState(request.messages || []);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadMessages = async () => {
    try {
      const list = await getRequestMessages(reqId);
      setMessages(list);
    } catch (err) {
      console.warn("Error refreshing chat:", err);
    }
  };

  // Poll for new messages every 3.5 seconds
  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 3500);
    return () => clearInterval(interval);
  }, [reqId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!inputText.trim() || sending) return;

    const textToSend = inputText.trim();
    setInputText("");
    setSending(true);

    try {
      const updatedMessages = await sendRequestMessage(reqId, textToSend);
      setMessages(updatedMessages);
    } catch (err) {
      alert(err.message || "Failed to send message.");
      setInputText(textToSend);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal title={`Chat with ${otherPartyName}`} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", height: "420px" }}>
        {/* Listing Title Header */}
        <div style={{ paddingBottom: 8, borderBottom: "1px solid var(--border)", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "0.85rem", color: "#2563EB", fontWeight: 700 }}>
            {request.listingTitle || "Room Inquiry"}
          </span>
          <span style={{ fontSize: "0.75rem", background: "#ECFDF5", color: "#059669", padding: "2px 6px", borderRadius: 4, fontWeight: 600 }}>
            Active Conversation
          </span>
        </div>

        {/* Messages Scroll Area */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 4px", display: "flex", flexDirection: "column", gap: 10 }}>
          {messages.length === 0 && (
            <p style={{ textAlign: "center", color: "var(--muted)", margin: "auto", fontSize: "0.85rem" }}>
              No messages yet. Send a greeting to begin chatting!
            </p>
          )}

          {messages.map((m, idx) => {
            const isMe = m.senderId === currentUser?.id || m.senderName === currentUser?.name;
            const timeStr = m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

            return (
              <div
                key={idx}
                style={{
                  alignSelf: isMe ? "flex-end" : "flex-start",
                  maxWidth: "80%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: isMe ? "flex-end" : "flex-start",
                }}
              >
                <div
                  style={{
                    background: isMe ? "#2563EB" : "#F1F5F9",
                    color: isMe ? "#FFFFFF" : "#0F172A",
                    padding: "8px 12px",
                    borderRadius: isMe ? "14px 14px 2px 14px" : "14px 14px 14px 2px",
                    fontSize: "0.9rem",
                    lineHeight: 1.4,
                    wordBreak: "break-word",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                  }}
                >
                  {!isMe && (
                    <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#64748B", marginBottom: 2 }}>
                      {m.senderName}
                    </div>
                  )}
                  {m.text}
                </div>
                {timeStr && (
                  <span style={{ fontSize: "0.68rem", color: "#94A3B8", marginTop: 2, padding: "0 4px" }}>
                    {timeStr}
                  </span>
                )}
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input Box */}
        <form onSubmit={handleSend} style={{ display: "flex", gap: 8, marginTop: 12, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type your message..."
            style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: "0.9rem" }}
            autoFocus
          />
          <button
            type="submit"
            className="btn primary"
            disabled={!inputText.trim() || sending}
            style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 16px" }}
          >
            <Send size={15} />
            <span>Send</span>
          </button>
        </form>
      </div>
    </Modal>
  );
}
