import { useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import {
  Home as HomeIcon,
  KeyRound,
  SearchCheck,
  Bike,
  Wrench,
  Siren,
  ShieldAlert,
  MapPinned,
  LogOut,
  MessageSquare,
  Users,
  Layers,
  ShieldCheck,
  LocateFixed,
  MapPin,
  AlertTriangle,
  Download,
  Trash2,
  Settings,
  Star,
  UserRound,
} from "lucide-react";
import { useStore } from "./store.jsx";
import { Modal, Field, Segmented } from "./components/ui.jsx";
import Avatar from "./components/Avatar.jsx";
import ProfileEditor from "./components/ProfileEditor.jsx";
import { deleteAccount, exportData } from "./api.js";
import MyRatings from "./components/MyRatings.jsx";
import Home from "./pages/Home.jsx";
import Rooms from "./pages/Rooms.jsx";
import Messages from "./pages/Messages.jsx";
import LostFound from "./pages/LostFound.jsx";
import Rentals from "./pages/Rentals.jsx";
import Services from "./pages/Services.jsx";
import Alerts from "./pages/Alerts.jsx";
import Admin from "./pages/Admin.jsx";
import Auth from "./pages/Auth.jsx";
import PrivacyPolicy from "./pages/PrivacyPolicy.jsx";

const USER_NAV = [
  { to: "/", label: "Nearby", icon: HomeIcon, end: true },
  { to: "/messages", label: "Messages", icon: MessageSquare, isMessages: true },
  { to: "/rooms", label: "Rooms", icon: KeyRound },
  { to: "/lost-found", label: "Lost & found", icon: SearchCheck },
  { to: "/rentals", label: "Rentals", icon: Bike },
  { to: "/services", label: "Services", icon: Wrench },
  { to: "/alerts", label: "Alerts", icon: Siren },
];

const ADMIN_NAV = [
  { to: "/admin", label: "Master Overview", icon: ShieldAlert, end: true },
  { to: "/admin?tab=users", label: "Users & Safety", icon: Users },
  { to: "/admin?tab=listings", label: "Listings Quality", icon: Layers },
  { to: "/admin?tab=requests", label: "Inquiries Audit", icon: MessageSquare },
  { to: "/admin?tab=ratings", label: "Ratings", icon: Star },
  { to: "/admin?tab=reports", label: "Abuse & Reports", icon: AlertTriangle },
  { to: "/alerts", label: "Emergency Alerts", icon: Siren },
];

export default function App() {
  const { radius, setRadius, user, logout, unreadCount, userLocation, setUserLocation, setManualArea, useDeviceGps, notify } = useStore();
  const [showLocModal, setShowLocModal] = useState(false);
  const [locInput, setLocInput] = useState("");
  const [locBusy, setLocBusy] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [profileTab, setProfileTab] = useState("profile");
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [deletePass, setDeletePass] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteErr, setDeleteErr] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const location = useLocation();
  const { pathname, search } = location;
  const section = pathname.split("/")[1] || "home";

  if (!user) {
    return (
      <Routes>
        <Route path="/signup" element={<Auth mode="signup" />} />
        <Route path="*" element={<Auth mode="login" />} />
      </Routes>
    );
  }

  const isAdmin = user.role === "admin";
  const navItems = isAdmin ? ADMIN_NAV : USER_NAV;

  const handleExportData = async () => {
    try {
      setExportBusy(true);
      const res = await exportData();
      const blob = new Blob([JSON.stringify(res.data || res, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nearnest_my_data_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      notify("Personal data exported successfully in compliance with DPDP Act 2023.");
    } catch (err) {
      notify(err.message || "Failed to export data.");
    } finally {
      setExportBusy(false);
    }
  };

  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    if (!deletePass) {
      setDeleteErr("Please enter your current password.");
      return;
    }
    if (!window.confirm("FINAL CONFIRMATION: Are you sure you want to permanently delete your account? All your listings, uploaded photos, and chat inquiries will be irreversibly erased.")) {
      return;
    }

    try {
      setDeleteBusy(true);
      setDeleteErr("");
      await deleteAccount(deletePass);
      notify("Your account and all associated personal data have been permanently erased.");
      logout();
    } catch (err) {
      setDeleteErr(err.message || "Failed to delete account.");
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleApplyLocation = async (e) => {
    e?.preventDefault();
    if (!locInput.trim()) return;
    setLocBusy(true);
    const ok = await setManualArea(locInput.trim());
    setLocBusy(false);
    if (ok) setShowLocModal(false);
  };

  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">
          <span
            className="brand-mark"
            style={isAdmin ? { background: "#FEF3C7", color: "#D97706", borderColor: "#FDE68A" } : {}}
          >
            {isAdmin ? <ShieldAlert size={22} color="#D97706" /> : <MapPinned size={22} />}
          </span>
          <div>
            <strong>{isAdmin ? "NearNest Master" : "NearNest"}</strong>
            <small style={isAdmin ? { color: "#F59E0B", fontWeight: 700 } : {}}>
              {isAdmin ? "Control & Protection" : "Hyperlocal Community"}
            </small>
          </div>
        </div>

        <nav>
          {navItems.map(({ to, label, icon: Icon, end, isMessages }) => {
            const isMatch = (() => {
              if (isAdmin) {
                if (to === "/admin" && (!search || search === "?tab=overview")) {
                  return pathname === "/admin";
                }
                if (to.includes("?tab=")) {
                  const targetTab = to.split("?tab=")[1];
                  return pathname === "/admin" && search.includes(`tab=${targetTab}`);
                }
                return pathname === to;
              }
              return end ? pathname === to : pathname.startsWith(to);
            })();

            return (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={isMatch ? "navlink on" : "navlink"}
              >
                <Icon size={19} />
                <span>{label}</span>
                {isMessages && unreadCount > 0 && (
                  <span className="nav-badge" title={`${unreadCount} unread message(s)`}>
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="me" style={isAdmin ? { borderLeft: "3px solid #F59E0B" } : {}}>
          <button
            type="button"
            className="avatar-btn"
            onClick={() => { setProfileTab("profile"); setShowSettingsModal(true); }}
            aria-label="Open my profile"
            title="My profile"
          >
            <Avatar src={user.avatar} name={user.name} size={38} style={isAdmin && !user.avatar ? { background: "#F59E0B", color: "#fff" } : {}} />
          </button>
          <div className="me-text">
            <strong style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {user.name}
              {isAdmin && (
                <em className="role" style={{ background: "#FEF3C7", color: "#92400E", borderColor: "#FDE68A" }}>
                  Master
                </em>
              )}
            </strong>
            <small style={isAdmin ? { color: "#D97706", fontWeight: 600 } : {}}>
              {isAdmin ? "Platform Guardian" : (user.area || user.email)}
            </small>
          </div>
          <div style={{ display: "flex", gap: 2 }}>
            <button
              className="icon-btn"
              onClick={() => { setProfileTab("profile"); setShowSettingsModal(true); }}
              aria-label="My profile & privacy"
              title="My profile, ratings & privacy"
            >
              <UserRound size={18} />
            </button>
            <button className="icon-btn" onClick={logout} aria-label="Log out" title="Log out">
              <LogOut size={18} />
            </button>
          </div>
        </div>

        {isAdmin ? (
          <div
            style={{
              marginTop: "auto",
              padding: "14px 16px",
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#10B981",
                  boxShadow: "0 0 8px #10B981",
                }}
              />
              <strong style={{ fontSize: "0.82rem", color: "#FFFFFF" }}>Master Control Active</strong>
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--mute)", lineHeight: 1.4 }}>
              Platform operations mode: <strong>Platform Guardian</strong>.<br />
              Marketplace buying/selling disabled for impartial oversight.
            </div>
          </div>
        ) : (
          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "10px" }}>
            {/* User Locality Center Box */}
            <div
              style={{
                padding: "10px 12px",
                background: "rgba(255, 255, 255, 0.06)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                borderRadius: "10px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <span style={{ fontSize: "0.72rem", color: "var(--mute)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.5px" }}>
                  Active Center
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setLocInput(userLocation?.area || user.area || "");
                    setShowLocModal(true);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#60A5FA",
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  Change 📍
                </button>
              </div>
              <div
                style={{
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  color: "#FFFFFF",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={userLocation?.area || user.area || "Bhimtal, Uttarakhand"}
              >
                📍 {userLocation?.area || user.area || "Bhimtal, Uttarakhand"}
              </div>
            </div>

            {/* Distance Radius Filter */}
            <div className="radius" style={{ marginTop: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <label htmlFor="radius" style={{ fontSize: "0.85rem", fontWeight: "600" }}>Distance radius</label>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: "700", color: "#60A5FA" }}>
                    {radius >= 9999 ? "All Distance" : `${radius} km`}
                  </span>
                </div>
              </div>
              <input
                id="radius"
                type="range"
                min="1"
                max="250"
                step="1"
                value={radius >= 9999 ? 250 : radius}
                onChange={(e) => setRadius(parseFloat(e.target.value))}
                style={{ width: "100%", cursor: "pointer" }}
              />
              <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginTop: "10px" }}>
                {[1, 2, 5, 10, 25, 50, 100, 250, 9999].map((preset) => {
                  const isActive = radius === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      style={{
                        fontSize: "0.72rem",
                        fontWeight: "700",
                        padding: "2px 7px",
                        borderRadius: "999px",
                        cursor: "pointer",
                        background: isActive ? "#2563EB" : "rgba(255, 255, 255, 0.12)",
                        color: "#FFFFFF",
                        border: isActive ? "1px solid #3B82F6" : "1px solid rgba(255, 255, 255, 0.2)",
                        transition: "all 0.15s ease",
                      }}
                      onClick={() => setRadius(preset)}
                    >
                      {preset >= 9999 ? "All" : `${preset}km`}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Manual Location Switcher Modal */}
      {showLocModal && (
        <Modal title="Choose Your Location" onClose={() => setShowLocModal(false)}>
          <form onSubmit={handleApplyLocation}>
            <p className="meta" style={{ marginBottom: "14px", fontSize: "0.85rem" }}>
              NearNest discovers rooms, lost & found items, and local services around this location.
            </p>

            <Field label="Type City, Town or Locality">
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  placeholder="e.g. Bhimtal, Khatima, Nainital, Haldwani"
                  value={locInput}
                  onChange={(e) => setLocInput(e.target.value)}
                  style={{ flex: 1 }}
                  autoFocus
                />
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    useDeviceGps();
                    setShowLocModal(false);
                  }}
                  title="Detect Device GPS"
                >
                  <LocateFixed size={16} /> GPS
                </button>
              </div>
            </Field>

            <div style={{ marginTop: "12px", marginBottom: "16px" }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>
                Quick Locations
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
                {["Bhimtal", "Khatima", "Nainital", "Haldwani", "Dehradun", "Delhi"].map((town) => (
                  <button
                    key={town}
                    type="button"
                    className="btn"
                    style={{ fontSize: "0.78rem", padding: "3px 9px", borderRadius: "8px" }}
                    onClick={() => {
                      setLocInput(town);
                      setManualArea(town);
                      setShowLocModal(false);
                    }}
                  >
                    📍 {town}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="btn primary wide"
              disabled={!locInput.trim() || locBusy}
            >
              {locBusy ? "Finding Coordinates..." : "Set Location & Update Feed"}
            </button>
          </form>
        </Modal>
      )}

      <main className="main" data-section={section}>
        {/* Suspended Account Warning Banner */}
        {user?.isBanned && (
          <div
            style={{
              background: user.suspensionStatus === "temporary" ? "#FEF3C7" : "#FEE2E2",
              border: `1.5px solid ${user.suspensionStatus === "temporary" ? "#F59E0B" : "#DC2626"}`,
              borderRadius: "12px",
              padding: "14px 18px",
              marginBottom: "18px",
              display: "flex",
              alignItems: "flex-start",
              gap: "12px",
            }}
          >
            <AlertTriangle
              size={22}
              color={user.suspensionStatus === "temporary" ? "#D97706" : "#DC2626"}
              style={{ flexShrink: 0, marginTop: 2 }}
            />
            <div>
              <strong style={{ color: user.suspensionStatus === "temporary" ? "#92400E" : "#991B1B", fontSize: "0.95rem" }}>
                {user.suspensionStatus === "temporary"
                  ? "Account Temporarily Suspended"
                  : "Account Permanently Suspended"}
              </strong>
              <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: user.suspensionStatus === "temporary" ? "#78350F" : "#7F1D1D", lineHeight: 1.45 }}>
                {user.banReason || "Your account has been restricted following community safety reports regarding fraud or non-intended usage."}
                {user.suspensionStatus === "temporary" && user.suspendedUntil && (
                  <span style={{ display: "block", marginTop: 4, fontWeight: 700 }}>
                    Hold lifts automatically on: {new Date(user.suspendedUntil).toLocaleString()}
                  </span>
                )}
              </p>
            </div>
          </div>
        )}

        {isAdmin ? (
          <Routes>
            <Route path="/admin" element={<Admin />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/privacy" element={<PrivacyPolicy onBack={() => window.history.back()} />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        ) : (
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/rooms" element={<Rooms />} />
            <Route path="/lost-found" element={<LostFound />} />
            <Route path="/rentals" element={<Rentals />} />
            <Route path="/services" element={<Services />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/privacy" element={<PrivacyPolicy onBack={() => window.history.back()} />} />
            <Route path="/admin" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </main>

      {/* My profile: edit profile, my ratings, privacy & data rights */}
      {showSettingsModal && (
        <Modal title="My profile" onClose={() => setShowSettingsModal(false)}>
          <div className="profile-modal">
            <div className="profile-summary">
              <Avatar src={user.avatar} name={user.name} size={56} />
              <div>
                <strong>{user.name}</strong>
                <div className="meta">{user.email}{user.userCode ? ` · ${user.userCode}` : ""}</div>
                {isAdmin && <span className="tag">Master Administrator · hidden from members</span>}
              </div>
            </div>

            <Segmented
              value={profileTab}
              onChange={setProfileTab}
              options={[
                { value: "profile", label: "Profile" },
                ...(!isAdmin ? [{ value: "ratings", label: "Ratings" }] : []),
                { value: "privacy", label: "Privacy & data" },
              ]}
            />

            {profileTab === "profile" && <ProfileEditor />}

            {profileTab === "ratings" && !isAdmin && <MyRatings notify={notify} />}

            {profileTab === "privacy" && (
              <div style={{ display: "grid", gap: 14 }}>
                <div className="info-box">
                  <div><strong>Email:</strong> {user.email}</div>
                  <div><strong>Phone:</strong> {user.phone || "Not specified (kept private)"}</div>
                  <div><strong>Locality:</strong> {user.area || "Not specified"}</div>
                  <div><strong>Role:</strong> {isAdmin ? "Master Administrator" : "Community Member"}</div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn grow" onClick={handleExportData} disabled={exportBusy}>
                    <Download size={15} /> {exportBusy ? "Exporting..." : "Export My Data (JSON)"}
                  </button>
                  <button
                    className="btn grow"
                    onClick={() => {
                      setShowSettingsModal(false);
                      setShowPrivacyModal(true);
                    }}
                  >
                    <ShieldCheck size={15} /> Privacy Notice (DPDP)
                  </button>
                </div>

                {!isAdmin && (
                  <div className="danger-zone">
                    <strong><Trash2 size={16} /> Danger Zone: Permanent Account Deletion</strong>
                    <p>
                      Under DPDP Act 2023, you can permanently delete your account. This permanently wipes your user profile,
                      all active room/vehicle listings, uploaded photos, and chat inquiries.
                    </p>
                    <form onSubmit={handleDeleteAccount}>
                      <Field label="Enter password to confirm">
                        <input
                          type="password"
                          placeholder="Your current password"
                          value={deletePass}
                          onChange={(e) => setDeletePass(e.target.value)}
                          style={{ fontSize: "0.85rem" }}
                        />
                      </Field>
                      {deleteErr && <p className="form-error" role="alert">{deleteErr}</p>}
                      <button
                        type="submit"
                        className="btn alert wide"
                        style={{ fontSize: "0.85rem", marginTop: 8 }}
                        disabled={deleteBusy || !deletePass}
                      >
                        {deleteBusy ? "Erasing Data..." : "Permanently Delete My Account & Erase All Data"}
                      </button>
                    </form>
                  </div>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Privacy Notice Modal */}
      {showPrivacyModal && (
        <Modal title="NearNest Privacy Notice" onClose={() => setShowPrivacyModal(false)}>
          <PrivacyPolicy onBack={() => setShowPrivacyModal(false)} />
        </Modal>
      )}
    </div>
  );
}
