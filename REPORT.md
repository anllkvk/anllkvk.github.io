# Redesign Report — anllkvk.github.io

**Date:** 2026-07-12
**Goal:** Reposition the site from a generic student portfolio into an executive-grade professional profile that maximizes interview probability for **Business Analyst, AI Business Analyst, Business Intelligence, Sales Operations, Revenue Operations, Commercial Excellence, and AI Business Operations** roles at international companies.

---

## 0. Summary of what changed

Two pages (`index.html`, `cv.html`) were rewritten; five new files were added; one file was removed. The visual identity (premium dark aesthetic) was kept but significantly refined — clarity, typography, spacing, and message now lead; decorative effects were removed.

| Area | Before | After |
|------|--------|-------|
| Positioning | "MIS student, AI researcher & marketing professional" (three identities) | One clear line: **Business Analysis · AI & Automation · Data · Commercial Operations** |
| Primary CTAs | Contact + View CV | **Résumé · LinkedIn · GitHub** (GitHub was entirely missing before) |
| Projects | Technical feature lists | **Business case studies**: Problem → Solution → Impact → Lessons |
| Hero stats | "383 LinkedIn connections", "3 yrs experience" | Defensible proof: 100% scholarship, live AI product, 2× above target, 6 roles |
| Privacy | Full home address published in CV + `plan.md` public | Address removed; `plan.md` removed from the site |
| SEO | No description, no social preview | Full meta, Open Graph/Twitter card + 1200×630 image, JSON-LD, sitemap, robots |
| Motion | 5 always-on animation systems (particles, tilt, typewriter, orbs, counters) | Removed; one subtle scroll-reveal that respects `prefers-reduced-motion` |
| Mobile nav | Vanished below 860px | Accessible hamburger menu |

---

## 1. Privacy & trust (critical)

- **Removed the full home street address** (street, floor, apartment) from `cv.html`. City/country (İstanbul, Türkiye) is retained — that is what recruiters need.
- **Removed `plan.md` from the repository** so it is no longer served at `anllkvk.github.io/plan.md`. It contained the same address plus internal LinkedIn strategy notes. A local backup was kept outside the repo.
  - *Note:* git history was intentionally **not** rewritten (per your instruction). The file is gone from the live site going forward; it still exists in old commits. If you ever want it purged from history too, that's a separate force-push operation.
- Added `_config.yml` so internal docs (`REPORT.md`, `CAREER_POSITIONING.md`) are excluded from the published Jekyll build.

## 2. Positioning & recruiter branding

- **Single, role-aligned headline** replacing the scattered identity. The four keywords map directly to the target job families (Business Analysis, AI/Automation, Data, Commercial Operations).
- **GitHub added as a primary CTA** alongside Résumé and LinkedIn, plus a dedicated GitHub contact card and a CV contact line — essential for any technical-adjacent role.
- **"AgentFlow Founder" softened to "Founder & Author"** of a Medium publication — matches the honest CV framing and survives scrutiny.
- Basketball demoted from an equal-weight hero badge (personality signal, not a credential).
- Removed clichés: "Building the future with AI", "Built with precision & passion", "response_time: <24h", "at the crossroads of".

## 3. Copywriting (executive, impact-first)

- Experience bullets rewritten from weak verbs ("Supported", "Helped", "Assisted", "Provided") to **action + outcome** ("Capture and qualify B2B leads…", "Exceeded personal sales targets two consecutive months…").
- Removed the unverifiable CV claim "consistently delivering above target in every position."
- "Bilişsel Çalışma Asistanı" now carries an English name ("Cognitive Study Assistant") on the English site.
- "CK Klein Jeans" corrected to "Calvin Klein Jeans".

## 4. Projects → business case studies

Both projects are reframed with a consistent **Problem / Solution / Impact / Lessons** structure — the exact mental model expected of a business analyst — instead of technical feature dumps. Technical stack is retained as secondary chips.

## 5. UX

- Removed distracting effects (particle canvas, 3D card tilt, typewriter, floating orbs, animated counters). The remaining motion is a single, subtle scroll-reveal.
- Consistent max-width container (1080px) and a clear vertical rhythm improve scanability.
- CTA button semantics fixed (no more external-arrow on an in-page scroll link).
- Clear, descriptive section names in the nav (Profile, Experience, Case Studies, Skills, Education, Contact).

## 6. Mobile responsiveness

- **Hamburger menu** for the main nav below 860px (previously the nav simply disappeared).
- Card grids use `minmax(min(100%, …), 1fr)` so nothing overflows on narrow phones.
- Hero actions stack full-width below 480px.
- **The CV is now readable on mobile** — the fixed A4 two-column page collapses to a single readable column below 900px (previously required pinch-zoom).
- Verified at a true 390px viewport: no horizontal overflow on either page.

## 7. Accessibility

- **Contrast fixed:** muted text raised to `#a3abc2` (≈7:1 on the dark background); the old `rgba(240,240,248,0.45)` failed WCAG AA.
- **Skip-to-content link** and visible `:focus-visible` outlines throughout.
- Semantic landmarks (`<header>`, `<main>`, `<nav aria-label>`, `<footer>`), real heading hierarchy (`h1 → h2 → h3`), and `role="list"` on custom lists.
- Decorative elements marked `aria-hidden`; icon-only links given `aria-label`s.
- **`prefers-reduced-motion` respected** for every remaining animation.
- **No-JS safe:** content is fully visible without JavaScript (the old build hid every section at `opacity:0` until JS ran).
- Minimum font sizes raised (no more sub-10px body-adjacent text).

## 8. SEO & discoverability

- Meta description on both pages; canonical URLs.
- **Open Graph + Twitter Card** tags with a purpose-built **1200×630 `og-image.png`** — sharing the link on LinkedIn now shows a branded preview instead of a blank card.
- **JSON-LD `Person` schema** (job title, `alumniOf`, `sameAs` → LinkedIn/GitHub/Medium) for rich, entity-aware indexing.
- `sitemap.xml`, `robots.txt`, SVG `favicon`, and a branded `404.html`.
- Removed the deprecated `http-equiv="Content-Language"`; kept `lang="en"`.
- Keyword-rich, role-aligned `<title>` tags.

## 9. Performance

- **Removed the always-on particle canvas** (an O(n²) per-frame loop that drained battery and rendered blurry on retina) and the mousemove tilt handlers.
- **Font payload cut sharply:** the portfolio now loads 5 weights of one family + 2 mono weights (was 8 + 3); dropped an italic axis and unused weights. The CV request was trimmed similarly.
- `backdrop-filter` retained only on the slim fixed header.
- Result: near-instant first paint, negligible JS, no layout thrash.

## 10. Deliverables added

- `og-image.png` — social share image (1200×630).
- `Anil_Kavak_CV.pdf` — regenerated from the updated CV, linked as a **Download PDF** button.
- `favicon.svg`, `robots.txt`, `sitemap.xml`, `404.html`, `_config.yml`.
- `REPORT.md` (this file) and `CAREER_POSITIONING.md`.

---

## Recommended next steps (not yet done)

1. **Add a professional headshot** to the hero and CV top-left — it measurably increases recruiter engagement.
2. **Quantify more outcomes** where you have numbers (leads captured, event count, % lead-qualification improvement, article read counts).
3. Point GitHub to **2–3 well-documented repositories** (README, screenshots) — recruiters will click through now that it's a primary CTA.
4. Consider a **custom domain** (e.g. `anilkavak.com`) for a more executive URL.
5. Add a short **English case-study write-up** for the Cognitive Study Assistant as a GitHub README or blog post.
