// All calls go through the Next.js rewrite (/api/* → Flask on :5050),
// so the session cookie stays on the same origin.
const BASE = "/api";

async function request(path, { method = "GET", body, form } = {}) {
  const opts = { method, credentials: "same-origin", headers: {} };
  if (form) {
    opts.body = form;
  } else if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`${BASE}${path}`, opts);
  } catch {
    throw new ApiError("Cannot reach the server. Is the backend running on port 5050?", 0);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }
  if (!res.ok) {
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status);
  }
  return data;
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export const api = {
  get: (p) => request(p),
  post: (p, body) => request(p, { method: "POST", body: body ?? {} }),
  patch: (p, body) => request(p, { method: "PATCH", body }),
  del: (p) => request(p, { method: "DELETE" }),
  upload: (p, file, extra = {}) => {
    const form = new FormData();
    form.append("file", file);
    Object.entries(extra).forEach(([k, v]) => v != null && form.append(k, v));
    return request(p, { method: "POST", form });
  },
};

export const templateUrl = (name) => `${BASE}/templates/${name}.csv`;
