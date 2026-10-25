function authHeaders() {
  try {
    const s = JSON.parse(localStorage.getItem("lc_session") || "null");
    return s?.token ? { Authorization: `Bearer ${s.token}` } : {};
  } catch {
    return {};
  }
}

// Real GET: Reads directly from MongoDB Atlas backend API with optional geospatial query params
export async function get(resource, params = null) {
  let url = `/api/${resource}`;
  if (params && typeof params === "object") {
    const cleanParams = {};
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== "") cleanParams[k] = v;
    }
    const qs = new URLSearchParams(cleanParams).toString();
    if (qs) url += `?${qs}`;
  }

  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Could not fetch ${resource} from server.`);
  }
  const data = await res.json();
  // If response is wrapped in { success, data }
  return Array.isArray(data) ? data : data.data !== undefined ? data.data : data;
}

// Like get(), but returns the whole JSON body ({ data, stats, ... }) so sibling fields such as `stats` are kept.
export async function getFull(resource, params = null) {
  let url = `/api/${resource}`;
  const clean = {};
  for (const [k, v] of Object.entries(params || {})) if (v != null && v !== "") clean[k] = v;
  const qs = new URLSearchParams(clean).toString();
  if (qs) url += `?${qs}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Could not fetch ${resource} from server.`);
  }
  return res.json();
}

// Real Media Upload: Multipart form-data uploaded to persistent backend storage
export async function uploadMedia(files) {
  const fd = new FormData();
  for (const f of files) {
    fd.append("files", f);
  }

  const res = await fetch("/api/upload/media", {
    method: "POST",
    headers: { ...authHeaders() },
    body: fd,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Media upload failed. Photos: max 10MB, Videos: max 50MB.");
  }
  const data = await res.json();
  return data.files || [];
}

// Real POST: Writes directly to MongoDB Atlas backend API
export async function post(resource, body) {
  const res = await fetch(`/api/${resource}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to save ${resource}. Ensure you are logged in.`);
  }
  const data = await res.json();
  return data.data || data;
}

// Real PATCH: Updates existing document in MongoDB Atlas
export async function patch(resource, id, body) {
  const res = await fetch(`/api/${resource}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to update item on server.");
  }
  return await res.json();
}

// Real DELETE: Deletes document from MongoDB Atlas
export async function del(resource, id) {
  const res = await fetch(`/api/${resource}/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to delete item.");
  }
  return await res.json();
}

// Real Authentication: Authenticates against MongoDB Atlas User collection
export async function signup(body) {
  const res = await fetch("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Signup failed. Make sure server is running on http://localhost:5000.");
  }
  return data;
}

export async function login(body) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Login failed. Check your email and password.");
  }
  return data;
}

// Star ratings between people (customer <-> service provider)
export async function getMyRatings() {
  const res = await fetch("/api/user-ratings/me", { headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not load your ratings.");
  return data.data;
}

export async function rateUser({ requestId, rating, comment, tags, wouldRecommend }) {
  const res = await fetch("/api/user-ratings", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ requestId, rating, comment, tags, wouldRecommend }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not save your rating.");
  return data;
}

// In-app chat messages for inquiries
export async function getRequestMessages(requestId) {
  const res = await fetch(`/api/requests/${requestId}/messages`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to load chat messages.");
  }
  const data = await res.json();
  return data.data || [];
}

export async function sendRequestMessage(requestId, text) {
  const res = await fetch(`/api/requests/${requestId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to send message.");
  }
  const data = await res.json();
  return data.data || [];
}

// DPDP Act 2023: Right to Erasure / Self-service account deletion
export async function deleteAccount(password) {
  const res = await fetch("/api/auth/me", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to delete account.");
  }
  return await res.json();
}

// DPDP Act 2023: Right to Access / Data Portability Export
export async function exportData() {
  const res = await fetch("/api/auth/me/export", {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to export data.");
  }
  return await res.json();
}


// Profile: edit my own profile (name, phone, bio, area, photo, saved GPS centre)
export async function updateProfile(body) {
  const res = await fetch("/api/auth/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not save your profile.");
  return data.user;
}

// Profile: upload a profile photo and return its URL
export async function uploadAvatar(file) {
  if (!file.type?.startsWith("image/")) throw new Error("Please choose an image file.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Profile photo must be 5 MB or smaller.");
  const [uploaded] = await uploadMedia([file]);
  if (!uploaded?.url) throw new Error("Photo upload failed.");
  return uploaded.url;
}

// Public profile of another member (404 for unknown, suspended or administrator accounts)
export async function getUserProfile(id) {
  const res = await fetch(`/api/users/${id}/profile`, { headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "This profile is not available.");
  return data.data;
}

// Admin: everything held about one account
export async function adminGetUserFull(id) {
  const res = await fetch(`/api/admin/users/${id}/full`, { headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not load user data.");
  return data.data;
}
