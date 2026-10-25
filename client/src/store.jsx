import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { get, login as apiLogin, signup as apiSignup } from "./api.js";
import { geocodeLocality, reverseGeocode } from "./utils/geo.js";

const Ctx = createContext(null);

const SESSION_KEY = "lc_session";
const readSession = () => {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return null; }
};

const DEFAULT_COORDS = { lat: 29.3500, lng: 79.5500, area: "Bhimtal, Uttarakhand" }; // Local Community Hub

export function StoreProvider({ children }) {
  const [radius, setRadius] = useState(10);
  const [userLocation, setUserLocation] = useState(() => {
    try {
      const saved = localStorage.getItem("lc_coords");
      return saved ? JSON.parse(saved) : DEFAULT_COORDS;
    } catch {
      return DEFAULT_COORDS;
    }
  });
  const [toast, setToast] = useState(null);
  const [session, setSession] = useState(readSession);

  // Sync location with registered user area on mount/login
  useEffect(() => {
    const saved = localStorage.getItem("lc_coords");
    if (!saved && session?.user?.area) {
      geocodeLocality(session.user.area).then((geo) => {
        if (geo) {
          const coords = { lat: geo.lat, lng: geo.lng, area: geo.name || session.user.area, mode: "manual" };
          setUserLocation(coords);
          try { localStorage.setItem("lc_coords", JSON.stringify(coords)); } catch {}
        }
      });
    }
  }, [session?.user?.area]);

  // Auto-sync authenticated user role & profile from MongoDB Atlas
  useEffect(() => {
    if (session?.token) {
      get("auth/me")
        .then((res) => {
          const freshUser = res?.user || res?.data || (res?.id ? res : null);
          if (freshUser && (freshUser.id || freshUser._id)) {
            setSession((prev) => {
              if (!prev) return prev;
              const updated = { ...prev, user: { ...prev.user, ...freshUser } };
              try { localStorage.setItem(SESSION_KEY, JSON.stringify(updated)); } catch {}
              return updated;
            });
          }
        })
        .catch(() => {});
    }
  }, []);

  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnreadCount = useCallback(async () => {
    if (!session?.token) return;
    try {
      const data = await get("requests/unread-count");
      if (typeof data?.unreadCount === "number") {
        setUnreadCount(data.unreadCount);
      }
    } catch {
      // Ignore background poll errors
    }
  }, [session?.token]);

  // Periodic background unread count poller every 4.5s
  useEffect(() => {
    if (!session?.token) {
      setUnreadCount(0);
      return;
    }
    refreshUnreadCount();
    const interval = setInterval(refreshUnreadCount, 4500);
    return () => clearInterval(interval);
  }, [session?.token, refreshUnreadCount]);

  const updateLocation = (coords) => {
    setUserLocation(coords);
    try {
      localStorage.setItem("lc_coords", JSON.stringify(coords));
    } catch {}
  };

  const setManualArea = async (areaText) => {
    if (!areaText || !areaText.trim()) return false;
    const geo = await geocodeLocality(areaText);
    if (geo) {
      const coords = { lat: geo.lat, lng: geo.lng, area: geo.name || areaText };
      setUserLocation(coords);
      try {
        localStorage.setItem("lc_coords", JSON.stringify(coords));
      } catch {}
      notify(`Location centered on: ${geo.name || areaText}`);
      return true;
    } else {
      notify(`Could not find coordinates for "${areaText}". Try typing city or district name.`);
      return false;
    }
  };

  const useDeviceGps = () => {
    if (!navigator.geolocation) {
      notify("Geolocation is not supported by your browser.");
      return;
    }
    notify("Detecting your physical device GPS...");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const areaName = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        const coords = {
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          area: areaName ? `GPS: ${areaName}` : `Device GPS (${pos.coords.latitude.toFixed(2)}, ${pos.coords.longitude.toFixed(2)})`,
          mode: "gps",
        };
        setUserLocation(coords);
        try {
          localStorage.setItem("lc_coords", JSON.stringify(coords));
        } catch {}
        notify(`Centered on device GPS (${coords.area})`);
      },
      () => {
        notify("GPS permission denied or unavailable.");
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const notify = useCallback((message) => {
    setToast(message);
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => setToast(null), 3200);
  }, []);

  const start = async (data, message) => {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(data)); } catch { /* storage blocked */ }
    setSession(data);
    if (data.user?.coordinates?.lat != null && data.user?.coordinates?.lng != null) {
      const coords = { lat: data.user.coordinates.lat, lng: data.user.coordinates.lng, area: data.user.area || "My location", mode: "profile" };
      setUserLocation(coords);
      try { localStorage.setItem("lc_coords", JSON.stringify(coords)); } catch {}
    } else if (data.user?.area) {
      const geo = await geocodeLocality(data.user.area);
      if (geo) {
        const coords = { lat: geo.lat, lng: geo.lng, area: geo.name || data.user.area, mode: "manual" };
        setUserLocation(coords);
        try { localStorage.setItem("lc_coords", JSON.stringify(coords)); } catch {}
      }
    }
    notify(message);
  };
  // Merge fresh profile fields (after editing my profile) into the stored session.
  const updateUser = useCallback((partial) => {
    setSession((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, user: { ...prev.user, ...partial } };
      try { localStorage.setItem(SESSION_KEY, JSON.stringify(updated)); } catch {}
      return updated;
    });
  }, []);
  const first = (u) => u.name.split(" ")[0];
  const login = async (creds) => {
    const data = await apiLogin(creds);
    await start(data, `Welcome back, ${first(data.user)}.`);
  };
  const signup = async (info) => {
    const data = await apiSignup(info);
    await start(data, `Account created. Welcome, ${first(data.user)}.`);
  };
  const logout = () => {
    try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
    setSession(null);
    notify("You're logged out.");
  };

  return (
    <Ctx.Provider
      value={{
        radius,
        setRadius,
        userLocation,
        setUserLocation: updateLocation,
        setManualArea,
        useDeviceGps,
        notify,
        user: session?.user || null,
        updateUser,
        unreadCount,
        refreshUnreadCount,
        login,
        signup,
        logout,
      }}
    >
      {children}
      {toast && <div className="toast" role="status">{toast}</div>}
    </Ctx.Provider>
  );
}

export const useStore = () => useContext(Ctx);

export function useResource(name, extraParams = null) {
  const { userLocation, radius } = useStore();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(() => {
    let live = true;
    const params = {
      lat: userLocation?.lat,
      lng: userLocation?.lng,
      radius,
      ...extraParams,
    };

    get(name, params)
      .then((d) => {
        if (live) {
          setItems(Array.isArray(d) ? d : []);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.warn(`[LocalConnect] Failed to fetch resource '${name}':`, err.message);
        if (live) {
          // Keep what is already on screen (e.g. ratings) instead of blanking it to empty/zero on a failed refresh.
          setItems((prev) => prev);
          setLoading(false);
        }
      });

    return () => {
      live = false;
    };
  }, [name, userLocation?.lat, userLocation?.lng, radius]);

  useEffect(() => {
    return fetchItems();
  }, [fetchItems]);

  return [items, setItems, loading, fetchItems];
}
