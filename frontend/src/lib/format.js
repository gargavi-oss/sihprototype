export const DEPTS = {
  tms: {
    key: "tms",
    name: "Engineering",
    system: "TMS",
    full: "Track Management System",
    color: "var(--color-eng)",
    tag: "bg-eng-soft text-eng",
  },
  smms: {
    key: "smms",
    name: "Signal & Telecom",
    system: "SMMS",
    full: "Signalling Maintenance & Management System",
    color: "var(--color-snt)",
    tag: "bg-snt-soft text-snt",
  },
  tdms: {
    key: "tdms",
    name: "Traction Distribution",
    system: "TDMS",
    full: "Traction Distribution Management System",
    color: "var(--color-trd)",
    tag: "bg-trd-soft text-trd",
  },
  coa: {
    key: "coa",
    name: "Control Office",
    system: "COA",
    full: "Control Office Application",
    color: "var(--color-coa)",
    tag: "bg-coa-soft text-coa",
  },
};

export const ROLE_LABEL = {
  tms: "Engineering · TMS",
  smms: "Signal & Telecom · SMMS",
  tdms: "Traction · TDMS",
  coa: "Control Office",
  planner: "Block Planning Cell",
};

export const ENGINE = { D: "Diesel", E: "Electric", H: "Hybrid" };

export function homeFor(role) {
  if (role === "planner") return "/planner";
  if (role === "coa") return "/control-office";
  return `/requests/${role}`;
}

const pad = (n) => String(n).padStart(2, "0");

export function isoDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISODate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function fmtDate(s, opts = { day: "numeric", month: "short", year: "numeric" }) {
  if (!s) return "—";
  const d = typeof s === "string" && s.length === 10 ? parseISODate(s) : new Date(s);
  return d.toLocaleDateString("en-IN", opts);
}

export function fmtDateTime(s) {
  if (!s) return "—";
  return new Date(s).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function startOfWeek(d) {
  // Weeks start on Monday
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (x.getDay() + 6) % 7;
  return addDays(x, -day);
}

export const loc = (track, section) => `${track} · ${section}`;
