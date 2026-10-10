/**
 * Profile content shown across pages (docs/design.md). Items marked sample are
 * placeholders to replace before launch.
 */
export const identity = {
  name: "Vijesh",
  tagline: "Backend systems, quiet interfaces.",
  bio: "Software engineer focused on distributed backend systems, security and developer tooling on GCP, with a growing interest in small, efficient AI models. This is where I keep what I'm building and thinking about.",
  stats: ["8 yrs", "MSc ML & AI", "Node.js", "React", "GCP", "Istio", "Godot"],
} as const;

export const outside = [
  {
    title: "Game design",
    text: "Saltbound, a 2D top-down pirate action RPG I'm building in Godot.",
  },
  {
    title: "Hardware",
    text: "A local wake-word detector on an ESP32-C3 that triggers an Echo Dot.",
  },
  {
    title: "Local AI",
    text: "Running small, heavily compressed models on my own machine and measuring what they can do.",
  },
  { title: "PC gaming", text: "Tuning a gaming rig and weighing the next GPU upgrade." },
] as const;

export const work = [
  {
    code: "GKE",
    label: "platform",
    title: "Microservice platform on GCP",
    text: "Many services needing consistent traffic, security and messaging. Istio/Envoy mesh, Pub/Sub for async work, Spanner and GCS for data, Apigee as the gateway layer.",
  },
  {
    code: "SSO",
    label: "identity",
    title: "Sign-in and role-based access",
    text: "Microsoft Entra ID with MSAL.js and PKCE, with access rules enforced twice: at the gateway and inside the Node.js services.",
  },
  {
    code: "ETL",
    label: "batch",
    title: "File-processing pipeline",
    text: "A Node.js batch pipeline on GKE that picks up TIF and log files from GCS via Pub/Sub and processes them.",
  },
  {
    code: "DEV",
    label: "tooling",
    title: "Developer tooling package",
    text: "An npm package built on GitHub Copilot Enterprise APIs to give teams shared developer tooling.",
  },
  {
    code: "P2P",
    label: "open src",
    title: "Omni",
    text: "An open-source peer-to-peer app for encrypted file sharing and chat.",
  },
] as const;

/** Sample employers: replace before launch */
export const career = [
  {
    from: "2023",
    to: "now",
    role: "Senior Software Engineer",
    org: "Meridian Systems",
    note: "Own the service platform and API gateway layer used by every product team. Led the move to two-layer access control.",
    sample: true,
  },
  {
    from: "2020",
    to: "2023",
    role: "Software Engineer",
    org: "Harbor Labs",
    note: "Built event-driven pipelines on Pub/Sub that process large file batches. Shipped shared developer tooling.",
    sample: true,
  },
  {
    from: "2018",
    to: "2020",
    role: "Software Engineer",
    org: "Kite Analytics",
    note: "Full-stack React and Node.js features, including ML-powered recommendations.",
    sample: true,
  },
  {
    from: "2017",
    to: "2018",
    role: "MSc, Advanced Computer Science",
    org: "University",
    note: "Specialised in machine learning and AI.",
    sample: true,
  },
] as const;

/** Career KPIs (docs/design.md); sample figures: replace before launch */
export const kpis = [
  { value: "8", caption: "years building production systems", sample: false },
  { value: "MSc", caption: "advanced computer science, ML and AI", sample: false },
  { value: "38%", caption: "lower p95 latency on the core API", sample: true },
  { value: "40+", caption: "services moved to one access model", sample: true },
] as const;
