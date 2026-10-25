import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ShieldAlert,
  Users,
  Layers,
  MessageSquare,
  Trash2,
  CheckCircle2,
  XCircle,
  Search,
  RefreshCw,
  Phone,
  Mail,
  MapPin,
  Camera,
  Film,
  Calendar,
  Shield,
  ShieldCheck,
  AlertTriangle,
  Star,
  Clock,
  Flag,
} from "lucide-react";
import { PageHead, Segmented, Empty } from "../components/ui.jsx";
import { useStore } from "../store.jsx";
import { get, del, patch, post } from "../api.js";
import Avatar from "../components/Avatar.jsx";
import AdminUserData from "../components/AdminUserData.jsx";
import AdminRatings from "../components/AdminRatings.jsx";

export default function Admin() {
  const { notify, user } = useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const paramTab = searchParams.get("tab");
  const validTabs = ["overview", "listings", "requests", "users", "ratings", "reports"];
  const [tab, setTab] = useState(validTabs.includes(paramTab) ? paramTab : "overview");

  useEffect(() => {
    const qTab = searchParams.get("tab");
    if (qTab && validTabs.includes(qTab)) {
      setTab(qTab);
    }
  }, [searchParams]);

  const selectTab = (t) => {
    setTab(t);
    setSearchParams(t === "overview" ? {} : { tab: t });
  };

  // State
  const [metrics, setMetrics] = useState(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  const [listings, setListings] = useState([]);
  const [loadingListings, setLoadingListings] = useState(false);
  const [listingSearch, setListingSearch] = useState("");
  const [listingTypeFilter, setListingTypeFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState(null); // { id, name }

  const [requests, setRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requestSearch, setRequestSearch] = useState("");

  const [viewingUserData, setViewingUserData] = useState(null); // user id whose full data is open
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [broadcast, setBroadcast] = useState({ title: "", description: "", locality: "" });
  const [sendingBroadcast, setSendingBroadcast] = useState(false);

  // Load Overview Metrics
  const fetchMetrics = async () => {
    try {
      setLoadingMetrics(true);
      const res = await get("admin/overview");
      setMetrics(res.metrics || res.data || res);
    } catch (err) {
      console.error("Failed to load admin metrics:", err);
      notify("Failed to load platform metrics.");
    } finally {
      setLoadingMetrics(false);
    }
  };

  // Load All Listings
  const fetchListings = async () => {
    try {
      setLoadingListings(true);
      const res = await get("admin/listings", {
        type: listingTypeFilter !== "all" ? listingTypeFilter : undefined,
        search: listingSearch.trim() || undefined,
        ownerId: ownerFilter?.id || undefined,
      });
      setListings(Array.isArray(res) ? res : res.data || []);
    } catch (err) {
      console.error("Failed to load listings:", err);
      notify("Failed to load listings.");
    } finally {
      setLoadingListings(false);
    }
  };

  // Load All Requests
  const fetchRequests = async () => {
    try {
      setLoadingRequests(true);
      const res = await get("admin/requests");
      setRequests(Array.isArray(res) ? res : res.data || []);
    } catch (err) {
      console.error("Failed to load requests:", err);
      notify("Failed to load inquiries.");
    } finally {
      setLoadingRequests(false);
    }
  };

  // Load All Users
  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);
      const res = await get("admin/users");
      setUsers(Array.isArray(res) ? res : res.data || []);
    } catch (err) {
      console.error("Failed to load users:", err);
      notify("Failed to load user accounts.");
    } finally {
      setLoadingUsers(false);
    }
  };

  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [reportStatusFilter, setReportStatusFilter] = useState("all");

  // Load All Community Reports
  const fetchReports = async () => {
    try {
      setLoadingReports(true);
      const res = await get("reports/admin", {
        status: reportStatusFilter !== "all" ? reportStatusFilter : undefined,
      });
      setReports(Array.isArray(res) ? res : res.data || []);
    } catch (err) {
      console.error("Failed to load reports:", err);
      notify("Failed to load abuse reports.");
    } finally {
      setLoadingReports(false);
    }
  };

  const handleModerateReport = async (report, action) => {
    const promptMsg =
      action === "dismiss"
        ? "Dismiss this report as unfounded?"
        : action === "hide_listing"
        ? `Hide listing "${report.targetTitle}" from search results?`
        : action === "restore_listing"
        ? `Restore listing "${report.targetTitle}" to active status?`
        : action === "delete_listing"
        ? `Permanently delete listing "${report.targetTitle}" and purge files?`
        : action === "user_suspended_temp"
        ? `Temporarily suspend this user for 48 hours?`
        : action === "suspension_lifted"
        ? `Lift suspension and restore account?`
        : `Permanently ban the owner of "${report.targetTitle}" from platform?`;

    if (!window.confirm(`MODERATION ACTION: ${promptMsg}`)) return;

    try {
      const res = await patch("reports/admin", report.id || report._id, { action });
      notify(res.message || "Moderation action recorded.");
      fetchReports();
      fetchListings();
      fetchMetrics();
      fetchUsers();
    } catch (err) {
      notify(err.message || "Moderation action failed.");
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  useEffect(() => {
    if (tab === "overview") fetchMetrics();
    else if (tab === "listings") fetchListings();
    else if (tab === "requests") fetchRequests();
    else if (tab === "users") fetchUsers();
    else if (tab === "reports") fetchReports();
  }, [tab, listingTypeFilter, ownerFilter, reportStatusFilter]);

  // Admin toggle verify listing
  const handleToggleVerifyListing = async (listing) => {
    try {
      const res = await patch("admin/listings", `${listing.id || listing._id}/verify`, {});
      const newVerified = res.isVerified;
      setListings((prev) =>
        prev.map((l) => ((l.id || l._id) === (listing.id || listing._id) ? { ...l, isVerified: newVerified } : l))
      );
      notify(newVerified ? `Listing "${listing.title}" verified by Admin.` : `Listing verification removed.`);
      fetchMetrics();
    } catch (err) {
      notify(err.message || "Failed to toggle verification.");
    }
  };

  // Admin delete listing action
  const handleDeleteListing = async (listing) => {
    if (!window.confirm(`ADMIN ACTION: Permanently delete listing "${listing.title}" by ${listing.owner}? This will also delete any uploaded media files.`)) {
      return;
    }
    try {
      await del("admin/listings", listing.id || listing._id);
      setListings((prev) => prev.filter((x) => (x.id || x._id) !== (listing.id || listing._id)));
      notify(`Admin deleted listing: "${listing.title}".`);
      fetchMetrics();
    } catch (err) {
      notify(err.message || "Failed to delete listing.");
    }
  };

  // Admin delete request action
  const handleDeleteRequest = async (request) => {
    if (!window.confirm("ADMIN ACTION: Delete this inquiry request from database?")) {
      return;
    }
    try {
      await del("admin/requests", request.id || request._id);
      setRequests((prev) => prev.filter((x) => (x.id || x._id) !== (request.id || request._id)));
      notify("Request deleted by admin.");
      fetchMetrics();
    } catch (err) {
      notify(err.message || "Failed to delete request.");
    }
  };

  // Admin toggle user role
  const handleToggleRole = async (targetUser) => {
    const newRole = targetUser.role === "admin" ? "user" : "admin";
    if (!window.confirm(`Change ${targetUser.name}'s role to "${newRole}"?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/users/${targetUser.id || targetUser._id}/role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${JSON.parse(localStorage.getItem("lc_session") || "{}").token}`,
        },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error("Role update failed.");
      setUsers((prev) =>
        prev.map((u) => ((u.id || u._id) === (targetUser.id || targetUser._id) ? { ...u, role: newRole } : u))
      );
      notify(`Updated role for ${targetUser.name} to ${newRole}.`);
    } catch (err) {
      notify(err.message || "Failed to update role.");
    }
  };

  // Admin toggle user ban / suspension
  const handleToggleBanUser = async (targetUser, banMode = "toggle") => {
    let willBan = !targetUser.isBanned;
    let status = "permanent";
    let durationHours = 48;
    let reason = "";

    if (banMode === "temp") {
      willBan = true;
      status = "temporary";
      reason = window.prompt(`ADMIN SECURITY: Temporarily suspend account for ${targetUser.name} (48h)?\nEnter reason:`, "Temporary hold: community fraud/misuse reports under review");
      if (reason === null) return;
    } else if (banMode === "perm") {
      willBan = true;
      status = "permanent";
      reason = window.prompt(`ADMIN SECURITY: Permanently ban account for ${targetUser.name}?\nEnter reason:`, "Account permanently banned for fraud or policy violations");
      if (reason === null) return;
    } else if (banMode === "lift") {
      willBan = false;
      if (!window.confirm(`Lift suspension and restore account for ${targetUser.name}?`)) return;
    } else {
      if (willBan) {
        reason = window.prompt(`ADMIN SECURITY: Suspend account for ${targetUser.name}?\nEnter reason for suspension:`, "Violation of platform terms");
        if (reason === null) return;
      } else {
        if (!window.confirm(`Reactivate account for ${targetUser.name}?`)) return;
      }
    }

    try {
      const res = await fetch(`/api/admin/users/${targetUser.id || targetUser._id}/ban`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${JSON.parse(localStorage.getItem("lc_session") || "{}").token}`,
        },
        body: JSON.stringify({ ban: willBan, status, durationHours, reason }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to update ban status.");
      }
      const data = await res.json();
      setUsers((prev) =>
        prev.map((u) => ((u.id || u._id) === (targetUser.id || targetUser._id) ? { ...u, ...data.user } : u))
      );
      notify(data.message || (willBan ? `User "${targetUser.name}" has been suspended.` : `User "${targetUser.name}" has been reactivated.`));
      fetchMetrics();
    } catch (err) {
      notify(err.message || "Failed to update ban status.");
    }
  };

  // Admin permanently delete user account
  const handleDeleteUser = async (targetUser) => {
    if (!window.confirm(`⚠️ PERMANENT DELETE WARNING: Are you sure you want to permanently delete user "${targetUser.name}" (${targetUser.email})?\n\nThis will also delete ALL listings and media uploaded by this user from MongoDB Atlas.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/users/${targetUser.id || targetUser._id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${JSON.parse(localStorage.getItem("lc_session") || "{}").token}`,
        },
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to delete user.");
      }
      setUsers((prev) => prev.filter((u) => (u.id || u._id) !== (targetUser.id || targetUser._id)));
      notify(`User "${targetUser.name}" and all their listings were permanently deleted.`);
      fetchMetrics();
      fetchListings();
    } catch (err) {
      notify(err.message || "Failed to delete user.");
    }
  };

  const handleBroadcast = async (event) => {
    event.preventDefault();
    if (sendingBroadcast) return;
    try {
      setSendingBroadcast(true);
      await post("admin/broadcasts", broadcast);
      setBroadcast({ title: "", description: "", locality: "" });
      notify("Safety broadcast published to the local alerts feed.");
      fetchMetrics();
    } catch (err) {
      notify(err.message || "Could not publish the safety broadcast.");
    } finally {
      setSendingBroadcast(false);
    }
  };

  // View user's listings
  const handleViewUserListings = (targetUser) => {
    setOwnerFilter({ id: targetUser.id || targetUser._id, name: targetUser.name });
    setListingTypeFilter("all");
    setListingSearch("");
    setTab("listings");
  };

  // Filter listings
  const filteredListings = listings.filter((l) => {
    const matchesSearch =
      !listingSearch ||
      l.title?.toLowerCase().includes(listingSearch.toLowerCase()) ||
      l.locality?.toLowerCase().includes(listingSearch.toLowerCase()) ||
      l.owner?.toLowerCase().includes(listingSearch.toLowerCase());
    const matchesType = listingTypeFilter === "all" || l.type === listingTypeFilter;
    const matchesOwner = !ownerFilter || l.ownerId === ownerFilter.id || l.owner === ownerFilter.name;
    return matchesSearch && matchesType && matchesOwner;
  });

  // Filter requests
  const filteredRequests = requests.filter((r) => {
    if (!requestSearch) return true;
    const q = requestSearch.toLowerCase();
    return (
      r.listingTitle?.toLowerCase().includes(q) ||
      r.buyerName?.toLowerCase().includes(q) ||
      r.sellerName?.toLowerCase().includes(q) ||
      r.message?.toLowerCase().includes(q)
    );
  });

  // Filter users
  const filteredUsers = users.filter((u) => {
    if (!userSearch) return true;
    const q = userSearch.toLowerCase();
    return (
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.phone?.toLowerCase().includes(q) ||
      u.area?.toLowerCase().includes(q)
    );
  });

  const categoryColor = (type) => {
    switch (type) {
      case "room": return { bg: "#EFF6FF", border: "#3B82F6", text: "#1D4ED8", label: "Room Rent" };
      case "vehicle": return { bg: "#FEF3C7", border: "#F59E0B", text: "#B45309", label: "Vehicle" };
      case "service": return { bg: "#ECFDF5", border: "#10B981", text: "#047857", label: "Service" };
      case "lost_found": return { bg: "#F3E8FF", border: "#A855F7", text: "#7E22CE", label: "Lost & Found" };
      case "alert": return { bg: "#FEE2E2", border: "#EF4444", text: "#B91C1C", label: "Safety Alert" };
      default: return { bg: "#F1F5F9", border: "#94A3B8", text: "#334155", label: type };
    }
  };

  return (
    <>
      <PageHead
        title="Admin Control Center"
        sub={`Master administrator console for ${user?.name || "Administrator"}. Manage all platform listings, moderate inquiries, and manage registered users.`}
      />

      <Segmented
        value={tab}
        onChange={selectTab}
        options={[
          { value: "overview", label: "Platform Overview" },
          { value: "listings", label: `All Listings ${listings.length ? `(${listings.length})` : ""}` },
          { value: "requests", label: `Inquiries & Chats ${requests.length ? `(${requests.length})` : ""}` },
          { value: "users", label: `User Accounts ${users.length ? `(${users.length})` : ""}` },
          { value: "ratings", label: "Ratings" },
          { value: "reports", label: `Abuse & Reports ${reports.length ? `(${reports.length})` : ""}` },
        ]}
      />

      {/* 1. OVERVIEW TAB */}
      {tab === "overview" && (
        <div>
          {loadingMetrics && !metrics ? (
            <p style={{ color: "var(--mute)" }}>Loading platform metrics from MongoDB Atlas...</p>
          ) : (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "14px",
                  marginBottom: "24px",
                }}
              >
                {/* Card 1: Total Users */}
                <div
                  className="card admin-stat-card"
                  style={{ borderLeft: "4px solid #3B82F6" }}
                  onClick={() => setTab("users")}
                  title="Click to view and moderate user accounts"
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "0.85rem", color: "var(--mute)", fontWeight: "600" }}>Total Users</span>
                    <Users size={18} color="#3B82F6" />
                  </div>
                  <strong style={{ fontSize: "1.8rem", marginTop: 4 }}>{metrics?.totalUsers ?? 0}</strong>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                    <span style={{ fontSize: "0.8rem", color: "var(--mute)" }}>
                      {metrics?.bannedUsersCount ? `${metrics.bannedUsersCount} suspended` : "Registered accounts in Atlas"}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "#3B82F6", fontWeight: 700 }}>Manage users →</span>
                  </div>
                </div>

                {/* Card 2: Total Listings */}
                <div
                  className="card admin-stat-card"
                  style={{ borderLeft: "4px solid #10B981" }}
                  onClick={() => {
                    setTab("listings");
                    setListingTypeFilter("all");
                    setOwnerFilter(null);
                  }}
                  title="Click to view and moderate all listings"
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "0.85rem", color: "var(--mute)", fontWeight: "600" }}>Total Listings</span>
                    <Layers size={18} color="#10B981" />
                  </div>
                  <strong style={{ fontSize: "1.8rem", marginTop: 4 }}>{metrics?.totalListings ?? 0}</strong>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                    <span style={{ fontSize: "0.8rem", color: "var(--mute)" }}>
                      {metrics?.verifiedListingsCount ? `${metrics.verifiedListingsCount} verified` : "Active across all categories"}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "#10B981", fontWeight: 700 }}>Manage listings →</span>
                  </div>
                </div>

                {/* Card 3: Inquiries & Requests */}
                <div
                  className="card admin-stat-card"
                  style={{ borderLeft: "4px solid #F59E0B" }}
                  onClick={() => setTab("requests")}
                  title="Click to inspect buyer-seller inquiries"
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "0.85rem", color: "var(--mute)", fontWeight: "600" }}>Inquiries & Requests</span>
                    <MessageSquare size={18} color="#F59E0B" />
                  </div>
                  <strong style={{ fontSize: "1.8rem", marginTop: 4 }}>{metrics?.totalRequests ?? 0}</strong>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                    <span style={{ fontSize: "0.8rem", color: "var(--mute)" }}>Buyer-seller inquiries</span>
                    <span style={{ fontSize: "0.75rem", color: "#F59E0B", fontWeight: 700 }}>Inspect inquiries →</span>
                  </div>
                </div>

                {/* Card 4: Chat Messages */}
                <div
                  className="card admin-stat-card"
                  style={{ borderLeft: "4px solid #8B5CF6" }}
                  onClick={() => setTab("requests")}
                  title="Click to review community chat conversations"
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "0.85rem", color: "var(--mute)", fontWeight: "600" }}>Chat Messages</span>
                    <MessageSquare size={18} color="#8B5CF6" />
                  </div>
                  <strong style={{ fontSize: "1.8rem", marginTop: 4 }}>{metrics?.totalMessages ?? 0}</strong>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                    <span style={{ fontSize: "0.8rem", color: "var(--mute)" }}>Messages sent in real-time chat</span>
                    <span style={{ fontSize: "0.75rem", color: "#8B5CF6", fontWeight: 700 }}>Review chats →</span>
                  </div>
                </div>

                {/* Card 5: Abuse & Fraud Reports */}
                <div
                  className="card admin-stat-card"
                  style={{ borderLeft: "4px solid #DC2626" }}
                  onClick={() => setTab("reports")}
                  title="Click to review community abuse & fraud reports"
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "0.85rem", color: "var(--mute)", fontWeight: "600" }}>Abuse Reports</span>
                    <Flag size={18} color="#DC2626" />
                  </div>
                  <strong style={{ fontSize: "1.8rem", marginTop: 4, color: "#DC2626" }}>
                    {metrics?.abuseReportsCount ?? 0}
                  </strong>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                    <span style={{ fontSize: "0.8rem", color: metrics?.pendingReportsCount ? "#DC2626" : "var(--mute)", fontWeight: metrics?.pendingReportsCount ? 700 : 400 }}>
                      {metrics?.pendingReportsCount ? `${metrics.pendingReportsCount} pending review` : "All reports reviewed"}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "#DC2626", fontWeight: 700 }}>Moderate reports →</span>
                  </div>
                </div>

                {/* Card 6: Community Reviews */}
                <div
                  className="card admin-stat-card"
                  style={{ borderLeft: "4px solid #F59E0B" }}
                  title="Total ratings and reviews submitted across Rooms, Vehicles, and Services"
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "0.85rem", color: "var(--mute)", fontWeight: "600" }}>Total Reviews</span>
                    <Star size={18} color="#F59E0B" fill="#F59E0B" />
                  </div>
                  <strong style={{ fontSize: "1.8rem", marginTop: 4, color: "#D97706" }}>
                    {metrics?.totalReviewsCount ?? 0}
                  </strong>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                    <span style={{ fontSize: "0.8rem", color: "var(--mute)" }}>
                      Across Rooms, Vehicles & Services
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "#D97706", fontWeight: 700 }}>Verified ratings ⭐</span>
                  </div>
                </div>
              </div>

              {/* Category Breakdown */}
              <div className="card" style={{ padding: "20px", marginBottom: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                  <h3 style={{ fontSize: "1.1rem", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    <Layers size={18} /> Category Breakdown
                  </h3>
                  <small style={{ color: "var(--mute)" }}>Click any category to filter listings</small>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                  <div
                    className="admin-category-card"
                    style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: "10px", padding: "10px 16px" }}
                    onClick={() => {
                      setTab("listings");
                      setListingTypeFilter("room");
                      setOwnerFilter(null);
                    }}
                    title="Filter Room listings"
                  >
                    <strong style={{ display: "block", fontSize: "1.2rem", color: "#1D4ED8" }}>{metrics?.roomCount ?? 0}</strong>
                    <span style={{ fontSize: "0.85rem", color: "#1E40AF" }}>Room Listings →</span>
                  </div>
                  <div
                    className="admin-category-card"
                    style={{ background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: "10px", padding: "10px 16px" }}
                    onClick={() => {
                      setTab("listings");
                      setListingTypeFilter("vehicle");
                      setOwnerFilter(null);
                    }}
                    title="Filter Vehicle listings"
                  >
                    <strong style={{ display: "block", fontSize: "1.2rem", color: "#B45309" }}>{metrics?.vehicleCount ?? 0}</strong>
                    <span style={{ fontSize: "0.85rem", color: "#92400E" }}>Vehicles for Rent →</span>
                  </div>
                  <div
                    className="admin-category-card"
                    style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: "10px", padding: "10px 16px" }}
                    onClick={() => {
                      setTab("listings");
                      setListingTypeFilter("service");
                      setOwnerFilter(null);
                    }}
                    title="Filter Local Services"
                  >
                    <strong style={{ display: "block", fontSize: "1.2rem", color: "#047857" }}>{metrics?.serviceCount ?? 0}</strong>
                    <span style={{ fontSize: "0.85rem", color: "#065F46" }}>Local Services →</span>
                  </div>
                  <div
                    className="admin-category-card"
                    style={{ background: "#F3E8FF", border: "1px solid #E9D5FF", borderRadius: "10px", padding: "10px 16px" }}
                    onClick={() => {
                      setTab("listings");
                      setListingTypeFilter("lost_found");
                      setOwnerFilter(null);
                    }}
                    title="Filter Lost & Found Items"
                  >
                    <strong style={{ display: "block", fontSize: "1.2rem", color: "#7E22CE" }}>{metrics?.lostFoundCount ?? 0}</strong>
                    <span style={{ fontSize: "0.85rem", color: "#6B21A8" }}>Lost & Found Items →</span>
                  </div>
                  <div
                    className="admin-category-card"
                    style={{ background: "#FEE2E2", border: "1px solid #FECACA", borderRadius: "10px", padding: "10px 16px" }}
                    onClick={() => {
                      setTab("listings");
                      setListingTypeFilter("alert");
                      setOwnerFilter(null);
                    }}
                    title="Filter Safety Alerts"
                  >
                    <strong style={{ display: "block", fontSize: "1.2rem", color: "#B91C1C" }}>{metrics?.alertCount ?? 0}</strong>
                    <span style={{ fontSize: "0.85rem", color: "#991B1B" }}>Safety Alerts →</span>
                  </div>
                </div>
              </div>

              <form onSubmit={handleBroadcast} className="card" style={{ marginBottom: 18 }}>
                <h3 style={{ marginTop: 0 }}>Emergency safety broadcast</h3>
                <p className="meta">Publishes a safety alert in the locality’s alerts feed. It does not send push notifications.</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                  <input
                    value={broadcast.title}
                    onChange={(event) => setBroadcast({ ...broadcast, title: event.target.value })}
                    placeholder="Notice title"
                    maxLength={120}
                    required
                  />
                  <input
                    value={broadcast.locality}
                    onChange={(event) => setBroadcast({ ...broadcast, locality: event.target.value })}
                    placeholder="Locality / area"
                    maxLength={120}
                    required
                  />
                </div>
                <textarea
                  value={broadcast.description}
                  onChange={(event) => setBroadcast({ ...broadcast, description: event.target.value })}
                  placeholder="Safety notice details"
                  maxLength={2000}
                  rows={3}
                  style={{ width: "100%", marginTop: 10 }}
                />
                <button className="btn alert" type="submit" disabled={sendingBroadcast || !broadcast.title.trim() || !broadcast.locality.trim()}>
                  {sendingBroadcast ? "Publishing..." : "Publish safety broadcast"}
                </button>
              </form>

              {/* Master Admin Info Box */}
              <div
                style={{
                  background: "#F8FAFC",
                  border: "1.5px solid #E2E8F0",
                  borderRadius: "14px",
                  padding: "18px",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "14px",
                }}
              >
                <ShieldCheck size={28} color="#2563EB" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <h4 style={{ margin: "0 0 4px", fontSize: "1rem" }}>Master Administrator Account</h4>
                  <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--mute)" }}>
                    You have unrestricted administrative privileges across the entire platform. You can moderate, update, or permanently delete any listing, inspect contact inquiries, and manage user role permissions.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* 2. ALL LISTINGS MANAGER */}
      {tab === "listings" && (
        <div>
          {ownerFilter && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "#EFF6FF",
                border: "1.5px solid #93C5FD",
                borderRadius: "10px",
                padding: "10px 16px",
                marginBottom: "14px",
              }}
            >
              <span style={{ fontSize: "0.88rem", color: "#1E40AF" }}>
                Filtered to listings posted by: <strong>{ownerFilter.name}</strong>
              </span>
              <button
                type="button"
                className="chip on"
                style={{ fontSize: "0.75rem", padding: "3px 10px" }}
                onClick={() => setOwnerFilter(null)}
              >
                Clear Filter ✕
              </button>
            </div>
          )}

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "14px" }}>
            <div style={{ flex: 1, minWidth: "220px", position: "relative" }}>
              <input
                className="search"
                style={{ margin: 0 }}
                placeholder="Search listings by title, locality, or owner name..."
                value={listingSearch}
                onChange={(e) => setListingSearch(e.target.value)}
              />
            </div>
            <button className="btn" onClick={fetchListings} title="Refresh listings" style={{ whiteSpace: "nowrap" }}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>

          {/* Category Filter Chips */}
          <div className="chips" style={{ marginBottom: "16px" }}>
            {[
              { val: "all", label: "All Types" },
              { val: "room", label: "Rooms" },
              { val: "vehicle", label: "Vehicles" },
              { val: "service", label: "Services" },
              { val: "lost_found", label: "Lost & Found" },
              { val: "alert", label: "Alerts" },
            ].map((f) => (
              <button
                key={f.val}
                type="button"
                className={`chip ${listingTypeFilter === f.val ? "on" : ""}`}
                onClick={() => setListingTypeFilter(f.val)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {loadingListings ? (
            <p style={{ color: "var(--mute)" }}>Loading listings from MongoDB Atlas...</p>
          ) : filteredListings.length === 0 ? (
            <Empty text="No listings match your search or filter." />
          ) : (
            <div className="list">
              {filteredListings.map((l) => {
                const conf = categoryColor(l.type);
                const hasMedia = (l.photosCount || 0) > 0 || (l.videosCount || 0) > 0;
                return (
                  <article key={l.id || l._id} className="card" style={{ borderLeft: `5px solid ${conf.border}` }}>
                    <div className="card-top">
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span
                            style={{
                              background: conf.bg,
                              border: `1px solid ${conf.border}`,
                              color: conf.text,
                              padding: "2px 8px",
                              borderRadius: "6px",
                              fontSize: "0.75rem",
                              fontWeight: "700",
                            }}
                          >
                            {conf.label}
                          </span>
                          {l.isVerified && (
                            <span className="badge-verified" title="Official verification badge by Admin">
                              <ShieldCheck size={12} /> Verified
                            </span>
                          )}
                          <span style={{ fontSize: "0.75rem", color: "var(--mute)" }}>
                            ID: {l.id || l._id}
                          </span>
                        </div>
                        <h3 style={{ fontSize: "1.1rem" }}>{l.title}</h3>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        {l.rent != null && <strong className="price">₹{Number(l.rent).toLocaleString("en-IN")}<small>/mo</small></strong>}
                        {l.rate != null && <strong className="price">₹{Number(l.rate).toLocaleString("en-IN")}<small>/hr</small></strong>}
                        {l.trade != null && <span style={{ fontWeight: "600", color: conf.text }}>{l.trade}</span>}
                      </div>
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", fontSize: "0.85rem", color: "var(--mute)" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <MapPin size={13} /> {l.locality} ({l.latitude?.toFixed(4)}, {l.longitude?.toFixed(4)})
                      </span>
                      <span>Owner: <strong>{l.owner}</strong> {l.ownerPhone ? `(${l.ownerPhone})` : ""}</span>
                      {(l.roomCode || l.propertyCode) && (
                        <span title="Generated automatically from the property address. Visible to administrators only.">
                          Room ID: <strong>{l.roomCode || "-"}</strong> · Property ID: <strong>{l.propertyCode || "-"}</strong>
                        </span>
                      )}
                      {l.privateAddress && <span>Address: <strong>{l.privateAddress}</strong>{l.unitNumber ? ` · Unit ${l.unitNumber}` : ""}</span>}
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <Camera size={13} /> {l.photosCount || 0} photos
                      </span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <Film size={13} /> {l.videosCount || 0} videos
                      </span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <Calendar size={13} /> {new Date(l.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    {l.photos && l.photos.length > 0 && (
                      <div style={{ display: "flex", gap: "8px", overflowX: "auto", padding: "6px 0" }}>
                        {l.photos.slice(0, 4).map((p, idx) => {
                          const url = typeof p === "string" ? p : p.url;
                          return (
                            <img
                              key={idx}
                              src={url}
                              alt=""
                              style={{ width: "60px", height: "45px", objectFit: "cover", borderRadius: "6px", border: "1px solid var(--line)" }}
                              onError={(e) => { e.currentTarget.style.display = "none"; }}
                            />
                          );
                        })}
                      </div>
                    )}

                    <div className="card-actions" style={{ justifyContent: "flex-end", marginTop: 8 }}>
                      <button
                        className="btn"
                        style={{
                          borderColor: l.isVerified ? "#10B981" : "#3B82F6",
                          color: l.isVerified ? "#047857" : "#1D4ED8",
                          fontSize: "0.85rem",
                          padding: "6px 12px",
                        }}
                        onClick={() => handleToggleVerifyListing(l)}
                        title={l.isVerified ? "Remove verified badge" : "Grant official verified shield badge to this listing"}
                      >
                        {l.isVerified ? (
                          <>
                            <ShieldCheck size={14} style={{ marginRight: 4 }} /> Verified ✓
                          </>
                        ) : (
                          <>
                            <Shield size={14} style={{ marginRight: 4 }} /> Verify Listing
                          </>
                        )}
                      </button>
                      <button
                        className="btn"
                        style={{ borderColor: "#EF4444", color: "#EF4444", fontSize: "0.85rem", padding: "6px 12px" }}
                        onClick={() => handleDeleteListing(l)}
                      >
                        <Trash2 size={14} style={{ marginRight: 4 }} /> Delete Listing
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 3. INQUIRIES & LIVE CHATS MANAGER */}
      {tab === "requests" && (
        <div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "14px" }}>
            <div style={{ flex: 1, minWidth: "220px" }}>
              <input
                className="search"
                style={{ margin: 0 }}
                placeholder="Search requests by buyer, seller, or listing..."
                value={requestSearch}
                onChange={(e) => setRequestSearch(e.target.value)}
              />
            </div>
            <button className="btn" onClick={fetchRequests} title="Refresh requests" style={{ whiteSpace: "nowrap" }}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>

          {loadingRequests ? (
            <p style={{ color: "var(--mute)" }}>Loading inquiries from MongoDB Atlas...</p>
          ) : filteredRequests.length === 0 ? (
            <Empty text="No inquiries found." />
          ) : (
            <div className="list">
              {filteredRequests.map((r) => {
                const isAccepted = r.status === "accepted";
                const isDeclined = r.status === "declined";
                return (
                  <article key={r.id || r._id} className="card" style={{ borderLeft: `5px solid ${isAccepted ? "#10B981" : isDeclined ? "#EF4444" : "#F59E0B"}` }}>
                    <div className="card-top">
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span
                            className={`status ${isAccepted ? "good" : isDeclined ? "bad" : "wait"}`}
                            style={{ textTransform: "capitalize", fontSize: "0.75rem", padding: "2px 8px" }}
                          >
                            {r.status}
                          </span>
                          <span style={{ fontSize: "0.75rem", color: "var(--mute)" }}>
                            {new Date(r.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <h3 style={{ fontSize: "1.05rem" }}>{r.listingTitle}</h3>
                      </div>
                      <div style={{ fontSize: "0.85rem", color: "var(--mute)" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <MessageSquare size={13} /> {r.messageCount || 0} messages
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                        gap: "10px",
                        background: "#F8FAFC",
                        padding: "10px 12px",
                        borderRadius: "8px",
                        fontSize: "0.85rem",
                      }}
                    >
                      <div>
                        <strong style={{ display: "block", color: "var(--ink)", marginBottom: 2 }}>Buyer</strong>
                        <div>{r.buyerName}</div>
                        {r.buyerEmail && <div style={{ color: "var(--mute)" }}>{r.buyerEmail}</div>}
                        {r.buyerPhone && <div style={{ color: "var(--mute)" }}>{r.buyerPhone}</div>}
                      </div>

                      <div>
                        <strong style={{ display: "block", color: "var(--ink)", marginBottom: 2 }}>Seller</strong>
                        <div>{r.sellerName}</div>
                        {r.sellerEmail && <div style={{ color: "var(--mute)" }}>{r.sellerEmail}</div>}
                        {r.sellerPhone && <div style={{ color: "var(--mute)" }}>{r.sellerPhone}</div>}
                      </div>
                    </div>

                    {r.message && (
                      <p style={{ margin: "6px 0 0", fontSize: "0.85rem", fontStyle: "italic", color: "var(--ink)" }}>
                        "{r.message}"
                      </p>
                    )}

                    <div className="card-actions" style={{ justifyContent: "flex-end", marginTop: 8 }}>
                      <button
                        className="btn"
                        style={{ borderColor: "#EF4444", color: "#EF4444", fontSize: "0.85rem", padding: "6px 12px" }}
                        onClick={() => handleDeleteRequest(r)}
                      >
                        <Trash2 size={14} style={{ marginRight: 4 }} /> Delete Request
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 4. USER ACCOUNTS MANAGER */}
      {tab === "users" && (
        <div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "14px" }}>
            <div style={{ flex: 1, minWidth: "220px" }}>
              <input
                className="search"
                style={{ margin: 0 }}
                placeholder="Search users by name, email, phone, or locality..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />
            </div>
            <button className="btn" onClick={fetchUsers} title="Refresh users" style={{ whiteSpace: "nowrap" }}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>

          {loadingUsers ? (
            <p style={{ color: "var(--mute)" }}>Loading users from MongoDB Atlas...</p>
          ) : filteredUsers.length === 0 ? (
            <Empty text="No user accounts match your search." />
          ) : (
            <div className="list">
              {filteredUsers.map((u) => {
                const isAdmin = u.role === "admin";
                const isSelf = u.id === user.id || u._id === user.id;
                return (
                  <article key={u.id || u._id} className="card" style={{ borderLeft: `5px solid ${isAdmin ? "#2563EB" : "#94A3B8"}` }}>
                    <div className="card-top">
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                          <span
                            style={{
                              background: isAdmin ? "#EFF6FF" : "#F1F5F9",
                              border: `1px solid ${isAdmin ? "#3B82F6" : "#CBD5E1"}`,
                              color: isAdmin ? "#1D4ED8" : "#475569",
                              padding: "2px 8px",
                              borderRadius: "6px",
                              fontSize: "0.75rem",
                              fontWeight: "700",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            {isAdmin ? <ShieldCheck size={12} /> : <Users size={12} />}
                            {isAdmin ? "Admin" : "Standard User"}
                          </span>

                          {u.isBanned ? (
                            u.suspensionStatus === "temporary" ? (
                              <span
                                style={{
                                  fontSize: "0.75rem",
                                  color: "#92400E",
                                  background: "#FEF3C7",
                                  border: "1px solid #FDE68A",
                                  padding: "2px 8px",
                                  borderRadius: "6px",
                                  fontWeight: "700",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                }}
                                title={u.suspendedUntil ? `Suspended until ${new Date(u.suspendedUntil).toLocaleString()}` : "48h hold"}
                              >
                                <Clock size={12} /> Temporarily Suspended
                              </span>
                            ) : (
                              <span className="badge-banned" title={`Banned: ${u.banReason || "Policy violation"}`}>
                                <XCircle size={12} /> Permanently Banned
                              </span>
                            )
                          ) : (
                            <span style={{ fontSize: "0.75rem", color: "#166534", background: "#DCFCE7", padding: "2px 8px", borderRadius: "6px", fontWeight: "700" }}>
                              Active
                            </span>
                          )}

                          {u.reportCount > 0 && (
                            <span
                              style={{
                                fontSize: "0.75rem",
                                background: "#FEE2E2",
                                color: "#991B1B",
                                border: "1px solid #FCA5A5",
                                padding: "2px 8px",
                                borderRadius: "6px",
                                fontWeight: "700",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 3,
                              }}
                              title={`${u.reportCount} abuse/misuse reports filed against this user`}
                            >
                              <Flag size={11} /> {u.reportCount} {u.reportCount === 1 ? "report" : "reports"}
                            </span>
                          )}

                          {isSelf && (
                            <span style={{ fontSize: "0.75rem", color: "#10B981", fontWeight: "600" }}>
                              (You)
                            </span>
                          )}
                        </div>
                        <h3 style={{ fontSize: "1.1rem", display: "flex", alignItems: "center", gap: 10 }}>
                          <Avatar src={u.avatar} name={u.name} size={34} /> {u.name}
                        </h3>
                      </div>
                      <div>
                        <span className="tag">{u.listingsCount || 0} listings</span>
                      </div>
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", fontSize: "0.85rem", color: "var(--mute)", marginTop: 4 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <Mail size={13} /> {u.email}
                      </span>
                      {u.phone && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <Phone size={13} /> {u.phone}
                        </span>
                      )}
                      {u.area && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <MapPin size={13} /> {u.area}
                        </span>
                      )}
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <Calendar size={13} /> Joined {new Date(u.createdAt).toLocaleDateString()}
                      </span>
                      {u.isBanned && u.banReason && (
                        <span style={{ color: "#DC2626", fontWeight: "600" }}>
                          Reason: {u.banReason}
                        </span>
                      )}
                    </div>

                    <div className="card-actions" style={{ justifyContent: "flex-end", marginTop: 8, flexWrap: "wrap", gap: "8px" }}>
                      <button
                        className="btn"
                        style={{ fontSize: "0.85rem", padding: "6px 12px" }}
                        onClick={() => setViewingUserData(u.id || u._id)}
                        title="Open every record held about this account"
                      >
                        <Users size={14} style={{ marginRight: 4 }} /> All data
                      </button>
                      <button
                        className="btn"
                        style={{ fontSize: "0.85rem", padding: "6px 12px" }}
                        onClick={() => handleViewUserListings(u)}
                        title="View all listings posted by this user"
                      >
                        <Layers size={14} style={{ marginRight: 4 }} /> View Listings ({u.listingsCount || 0})
                      </button>

                      {!isSelf && (
                        <>
                          {u.isBanned ? (
                            <button
                              className="btn"
                              style={{
                                borderColor: "#10B981",
                                color: "#047857",
                                fontSize: "0.85rem",
                                padding: "6px 12px",
                              }}
                              onClick={() => handleToggleBanUser(u, "lift")}
                              title="Lift suspension and restore account"
                            >
                              <CheckCircle2 size={14} style={{ marginRight: 4 }} /> Lift Suspension
                            </button>
                          ) : (
                            <>
                              <button
                                className="btn"
                                style={{
                                  borderColor: "#F59E0B",
                                  color: "#B45309",
                                  fontSize: "0.85rem",
                                  padding: "6px 12px",
                                }}
                                onClick={() => handleToggleBanUser(u, "temp")}
                                title="Temporarily suspend account for 48 hours"
                              >
                                <Clock size={14} style={{ marginRight: 4 }} /> Suspend (48h)
                              </button>
                              <button
                                className="btn"
                                style={{
                                  borderColor: "#DC2626",
                                  color: "#DC2626",
                                  fontSize: "0.85rem",
                                  padding: "6px 12px",
                                }}
                                onClick={() => handleToggleBanUser(u, "perm")}
                                title="Permanently ban user account"
                              >
                                <XCircle size={14} style={{ marginRight: 4 }} /> Permanent Ban
                              </button>
                            </>
                          )}

                          <button
                            className="btn"
                            style={{
                              borderColor: isAdmin ? "#F59E0B" : "#2563EB",
                              color: isAdmin ? "#B45309" : "#1D4ED8",
                              fontSize: "0.85rem",
                              padding: "6px 12px",
                            }}
                            onClick={() => handleToggleRole(u)}
                          >
                            {isAdmin ? (
                              <>
                                <Shield size={14} style={{ marginRight: 4 }} /> Demote to User
                              </>
                            ) : (
                              <>
                                <ShieldCheck size={14} style={{ marginRight: 4 }} /> Promote to Admin
                              </>
                            )}
                          </button>

                          <button
                            className="btn"
                            style={{
                              borderColor: "#EF4444",
                              color: "#EF4444",
                              fontSize: "0.85rem",
                              padding: "6px 12px",
                            }}
                            onClick={() => handleDeleteUser(u)}
                            title="Permanently delete user and their listings"
                          >
                            <Trash2 size={14} style={{ marginRight: 4 }} /> Delete User
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* RATINGS MODERATION TAB */}
      {tab === "ratings" && <AdminRatings />}

      {viewingUserData && <AdminUserData userId={viewingUserData} onClose={() => setViewingUserData(null)} />}

      {/* 5. ABUSE & COMMUNITY REPORTS TAB */}
      {tab === "reports" && (
        <div>
          {/* Status Filter Chips */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--mute)" }}>Status:</span>
            {["all", "pending", "action_taken", "dismissed"].map((st) => (
              <button
                key={st}
                className={`btn ${reportStatusFilter === st ? "primary" : ""}`}
                style={{ fontSize: "0.8rem", padding: "4px 12px", textTransform: "capitalize" }}
                onClick={() => setReportStatusFilter(st)}
              >
                {st.replace("_", " ")}
              </button>
            ))}
            <button
              className="btn"
              style={{ marginLeft: "auto", fontSize: "0.8rem", padding: "4px 10px", display: "flex", alignItems: "center", gap: 4 }}
              onClick={fetchReports}
            >
              <RefreshCw size={13} /> Refresh
            </button>
          </div>

          {loadingReports && <p style={{ color: "var(--mute)" }}>Loading community reports from database...</p>}

          {!loadingReports && reports.length === 0 && (
            <Empty text="No reports found matching the selected filter. Community is healthy." />
          )}

          {!loadingReports && reports.length > 0 && (
            <div style={{ display: "grid", gap: "14px" }}>
              {reports.map((r) => {
                const isPending = r.status === "pending";
                const isActionTaken = r.status === "action_taken";

                return (
                  <article
                    key={r._id || r.id}
                    className="card"
                    style={{
                      borderLeft: isPending ? "4px solid #F59E0B" : isActionTaken ? "4px solid #EF4444" : "4px solid #10B981",
                      padding: "16px 18px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: 700,
                              padding: "2px 8px",
                              borderRadius: 4,
                              background: "#FEF2F2",
                              color: "#DC2626",
                              textTransform: "uppercase",
                            }}
                          >
                            🚩 {r.reason}
                          </span>
                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: 700,
                              padding: "2px 8px",
                              borderRadius: 4,
                              background: isPending ? "#FEF3C7" : isActionTaken ? "#FEE2E2" : "#DCFCE7",
                              color: isPending ? "#92400E" : isActionTaken ? "#991B1B" : "#166534",
                              textTransform: "capitalize",
                            }}
                          >
                            {r.status.replace("_", " ")}
                          </span>

                          {r.autoSuspensionTriggered === "temporary" && (
                            <span
                              style={{
                                fontSize: "11px",
                                fontWeight: 700,
                                padding: "2px 8px",
                                borderRadius: 4,
                                background: "#FEF3C7",
                                color: "#92400E",
                                border: "1px solid #FDE68A",
                              }}
                            >
                              ⚠️ Auto-Suspended (48h Temp)
                            </span>
                          )}
                          {r.autoSuspensionTriggered === "permanent" && (
                            <span
                              style={{
                                fontSize: "11px",
                                fontWeight: 700,
                                padding: "2px 8px",
                                borderRadius: 4,
                                background: "#FEE2E2",
                                color: "#991B1B",
                                border: "1px solid #FCA5A5",
                              }}
                            >
                              🛑 Auto-Suspended (Permanent)
                            </span>
                          )}
                        </div>
                        <strong style={{ fontSize: "1.05rem" }}>
                          Target: {r.targetTitle || `ID: ${r.targetId}`} ({r.targetType})
                        </strong>
                        <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--mute)" }}>
                          Reported by: <strong>{r.reporterName || "Neighbor"}</strong> · {new Date(r.createdAt).toLocaleString()}
                          {r.reportedUserId && (
                            <span> · Reported Account: <strong>{r.reportedUserId.name || r.reportedUserId}</strong></span>
                          )}
                        </p>
                      </div>

                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {isPending && (
                          <>
                            <button
                              className="btn"
                              style={{ fontSize: "0.78rem", padding: "4px 10px" }}
                              onClick={() => handleModerateReport(r, "dismiss")}
                            >
                              Dismiss (False)
                            </button>
                            {r.targetType === "listing" && (
                              <>
                                <button
                                  className="btn"
                                  style={{ fontSize: "0.78rem", padding: "4px 10px", borderColor: "#F59E0B", color: "#D97706" }}
                                  onClick={() => handleModerateReport(r, "hide_listing")}
                                >
                                  Hide Listing
                                </button>
                                <button
                                  className="btn alert"
                                  style={{ fontSize: "0.78rem", padding: "4px 10px" }}
                                  onClick={() => handleModerateReport(r, "delete_listing")}
                                >
                                  Delete Listing
                                </button>
                              </>
                            )}
                            <button
                              className="btn"
                              style={{ fontSize: "0.78rem", padding: "4px 10px", borderColor: "#F59E0B", color: "#D97706" }}
                              onClick={() => handleModerateReport(r, "user_suspended_temp")}
                            >
                              Suspend 48h
                            </button>
                            <button
                              className="btn"
                              style={{ fontSize: "0.78rem", padding: "4px 10px", borderColor: "#DC2626", color: "#DC2626" }}
                              onClick={() => handleModerateReport(r, "ban_user")}
                            >
                              Ban User
                            </button>
                            <button
                              className="btn"
                              style={{ fontSize: "0.78rem", padding: "4px 10px", borderColor: "#10B981", color: "#047857" }}
                              onClick={() => handleModerateReport(r, "suspension_lifted")}
                            >
                              Lift Suspension
                            </button>
                          </>
                        )}
                        {isActionTaken && r.moderationAction === "listing_hidden" && (
                          <button
                            className="btn primary"
                            style={{ fontSize: "0.78rem", padding: "4px 10px" }}
                            onClick={() => handleModerateReport(r, "restore_listing")}
                          >
                            Restore Listing
                          </button>
                        )}
                      </div>
                    </div>

                    {r.details && (
                      <div style={{ marginTop: 10, background: "var(--paper)", padding: "8px 12px", borderRadius: 6, fontSize: "0.85rem" }}>
                        <strong>Reporter Details:</strong> "{r.details}"
                      </div>
                    )}

                    {r.moderationNotes && (
                      <div style={{ marginTop: 6, fontSize: "0.8rem", color: "#166534" }}>
                        🛡️ <strong>Outcome:</strong> {r.moderationNotes} {r.moderatorName && `(by ${r.moderatorName})`}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
}
