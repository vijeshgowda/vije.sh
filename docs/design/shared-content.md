# Shared sample content

The canonical text used by the ledger prototype and all ten variations. Variations sometimes shorten a paragraph, change capitalisation (V08 uses Title Case headlines; V03 uses lowercase categories and ISO dates; V09 uses `dd/mm/yy`) or rename sections (V08: Front Page, Careers, Works, Science, Opinion, Letters; V07: island names). Items marked *(sample)* are placeholders to replace before launch.

## Identity
- Name: **Vijesh**. Wordmark: `vije.sh` (V00 also shows `Vijesh` with a `dev` superscript).
- Tagline: **Backend systems, quiet interfaces.**
- Bio: Software engineer focused on distributed backend systems, security and developer tooling on GCP, with a growing interest in small, efficient AI models. This is where I keep what I'm building and thinking about.
- Stats row: `8 yrs` · `MSc ML & AI` · `Node.js` · `React` · `GCP` · `Istio` · `Godot`.
- Calls to action: "See the work", "Open the lab" (V00); "See the work", "Read the journal" (most variations).

## Outside work
| Title | Text |
|---|---|
| Game design | Saltbound, a 2D top-down pirate action RPG I'm building in Godot. |
| Hardware | A local wake-word detector on an ESP32-C3 that triggers an Echo Dot. |
| Local AI | Running small, heavily compressed models on my own machine and measuring what they can do. |
| PC gaming | Tuning a gaming rig and weighing the next GPU upgrade. |

## Career
KPIs:
| Number | Caption |
|---|---|
| 8 | years building production systems |
| MSc | advanced computer science, ML and AI |
| 38% | lower p95 latency on the core API *(sample)* |
| 40+ | services moved to one access model *(sample)* |

Roles (newest first):
1. **2023 to now · Senior Software Engineer · Meridian Systems** *(sample)*. Own the service platform and API gateway layer used by every product team. Led the move to two-layer access control, coarse rules at the gateway and fine rules in each service. Mentor four engineers and run the architecture review for new services. Tags: GKE, Istio, Apigee, Node.js.
2. **2020 to 2023 · Software Engineer · Harbor Labs** *(sample)*. Built event-driven pipelines on Pub/Sub that process large file batches. Shipped shared developer tooling adopted across the company. Tags: Pub/Sub, GCS, TypeScript.
3. **2018 to 2020 · Software Engineer · Kite Analytics** *(sample)*. Full-stack React and Node.js features, including ML-powered recommendations. Introduced code review and CI practices for a team of six. Tags: React, Node.js, Python.
4. **2017 to 2018 · MSc, Advanced Computer Science · University name here**. Specialised in machine learning and AI. Thesis topic here, for example efficient inference for small language models *(sample)*.

V00 only (Career tab): **Case study** *(sample)*: Context: dozens of services each re-implemented their own permission checks. Options: check only at the gateway, only in services, or in both places. Decision: both, coarse rules at the gateway, fine-grained rules inside each service. Outcome: fewer bypass paths and one place to audit. **Strengths**: Systems (service meshes, messaging, data stores, failure modes); Security (identity, access control, defence in layers); Machine learning (small and low-bit models, evaluation, fine-tuning); Leadership (design reviews, mentoring, writing decisions down). **Writing and talks** *(sample titles)*: 01 essay "Enforcing access in two places"; 02 essay "Quality per GB"; 03 talk "Notes from running a service mesh".

## Work
Principles ("How I work"):
- **Design before code**: Write down the problem, the options and the trade-offs. Decisions outlive the people who made them.
- **Clear boundaries**: Explicit service, data and ownership lines. Simple parts that fail in predictable ways.
- **Security by design**: Identity and access enforced in layers, never bolted on at the end.
- **Raise the floor**: Internal tooling, docs and reviews that make the whole team faster.

Selected work (stamp code / label / title / text):
| Code | Label | Title | Text |
|---|---|---|---|
| GKE | platform | Microservice platform on GCP | Many services needing consistent traffic, security and messaging. Istio/Envoy mesh, Pub/Sub for async work, Spanner and GCS for data, Apigee as the gateway layer. |
| SSO | identity | Sign-in and role-based access | Microsoft Entra ID with MSAL.js and PKCE, with access rules enforced twice: at the gateway and inside the Node.js services. |
| ETL | batch | File-processing pipeline | A Node.js batch pipeline on GKE that picks up TIF and log files from GCS via Pub/Sub and processes them. |
| DEV | tooling | Developer tooling package | An npm package built on GitHub Copilot Enterprise APIs to give teams shared developer tooling. |
| P2P | open src | Omni | An open-source peer-to-peer app for encrypted file sharing and chat. |

## Lab
- Intro: I can't train a 27B model from scratch, so I work on the parts around it: running, compressing, fine-tuning and measuring models small enough for a laptop or phone.
- Calculator: see the shared conventions in `README.md`.
- What I can build: **Quantise** (convert open models to lower bit widths and measure how much quality is lost); **Fine-tune** (train small LoRA adapters on a narrow task and compare against the base model); **Evaluate** (a small benchmark harness that reports quality per GB, so models of different sizes compare fairly); **Deploy** (run the result on a laptop, a phone or in the browser with WebGPU).
- Experiment ideas: 01 **Same model, three bit widths** (compare 4-bit, 2-bit and ternary builds on my own task set, reporting quality per GB); 02 **A small adapter for one job** (fine-tune a 1B to 4B model for a single narrow task and test whether it beats a larger general model).

## Blog posts (samples)
Fields: title · category · date · read time · excerpt, then the body as blocks (`p` paragraph, `h` heading, `q` pull quote).

**1. Planning this site** · Notes · 5 Oct 2026 · 4 min · "Choosing a stack that stays free, stays online and grows into a forum."
- p: I want a personal site that stays free, stays online and can grow into a forum. That rules out most of the usual hosting choices.
- h: What I looked at
- p: Free tiers have shrunk. Several platforms now put idle apps to sleep, expire after a few months or have no free plan at all. Static hosting with a serverless backend is the option that survives.
- h: What I picked
- p: A cream and ink design, Cloudflare for hosting, Supabase for accounts and data, and a forum I build myself so it matches the rest of the site.
- q: Free is only free until the terms change, so keep everything portable.
- p: Next up is writing here, one post at a time.

**2. Enforcing access in two places** · Engineering · 28 Sep 2026 · 5 min · "Why gateway rules alone are not enough, and what each layer should check."
- p: A gateway can check who is calling and which route they may use. It cannot know whether this user may edit that record.
- h: Coarse at the edge
- p: Put route-level rules at the gateway: signed in or not, which role, which API product. These checks are cheap, uniform and easy to audit.
- h: Fine inside the service
- p: Each service checks the record-level rule, because only it has the data. Never assume the gateway already did.
- q: Two checks cost a few milliseconds. One missing check costs an incident.
- p: The trade-off is duplication. Keep the rules in a shared library and test them once.

**3. Quality per GB** · Local AI · 20 Sep 2026 · 6 min · "Comparing low-bit models fairly across sizes."
- p: Bigger models score higher, but they also need more memory. Comparing a 27B model with a 4B model on accuracy alone ignores that cost.
- h: A simple measure
- p: Divide a quality score by the size of the model in GB. One published approach takes the negative log of the error rate and divides that by model size, so a small model that keeps most of its quality wins.
- h: How I will test it
- p: Fix a task set, build the same model at several bit widths and plot the result. The memory calculator on the Lab page covers the size side.
- q: Fix the task set first, then vary one thing.

**4. Saltbound dev log: getting combat to feel right** · Games · 12 Sep 2026 · 3 min · "Three small changes that made hits feel heavy."
- p: Combat in a top-down game lives or dies on feedback. This week I worked on three small things.
- h: Three changes
- p: A brief hit pause when a strike lands, a short screen shake scaled to the damage, and a slightly tighter dodge window so a good dodge feels earned.
- p: Each change is tiny on its own. Together they make hits feel heavy.
- q: If the player cannot read the attack, the fight is not fair.
- p: Next: enemy telegraphs, so players can read an attack before it lands.

## Forum (samples)
Categories: All, Announcements, Engineering, Local AI, Games, Off-topic. Users: vije (admin), tomas (moderator), nora, ravi, mei (members). Posts are `[user, role, time, text]`; the first post opens the thread.

1. **Welcome, read this first** · Announcements · pinned
   - vije · admin · 3d ago: Welcome. This is a place to talk about systems, small models and games. Be kind, be specific, and say what you tried.
   - nora · member · 2d ago: Glad this exists. Will there be a category for hardware projects?
   - vije · admin · 2d ago: Good idea. I will add one this week.
2. **How are you comparing 4-bit and ternary builds?** · Local AI
   - ravi · member · 1d ago: I want a fair way to compare builds of different sizes. Raw accuracy hides the memory cost.
   - mei · member · 1d ago: Quality per GB is a decent start. Fix the task set first, then vary only the bit width.
   - vije · admin · 20h ago: Agreed. I will post my harness once it runs end to end.
3. **Service mesh sidecars or ambient mode for a small cluster?** · Engineering
   - mei · member · 2d ago: Three services, one team. Is the extra moving part worth it yet?
   - tomas · moderator · 1d ago: For three services I would start without a mesh and add mutual TLS at the edge first.
4. **Saltbound dev log: getting combat to feel right** · Games
   - vije · admin · 4d ago: This week: hit pause, a short screen shake and a tighter dodge window. Feedback welcome.
5. **What are you reading this month?** · Off-topic
   - nora · member · 5d ago: Looking for something about distributed systems that is not a textbook.

Reply count shown on a thread = number of posts − 1. Pinned threads sort first (V00).
