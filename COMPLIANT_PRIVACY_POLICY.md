# Privacy Policy

**Effective Date:** January 28, 2026
**Last Updated:** April 10, 2026

## Introduction

Foodie Finder is committed to protecting your privacy. This policy explains how we collect, use, and protect your information when you use our mobile application, in compliance with GDPR (EU), UK GDPR, CCPA (California), PIPEDA (Canada), India DPDPA, and CalOPPA.

## Information We Collect

### Information You Provide
- **Default Preferences:** Postal code and search radius for restaurant recommendations
- **Favorites:** Restaurants you mark as favorites (stored only on your device)
- **Personal Notes:** Private notes you add to restaurants (stored only on your device)
- **Community Tips:** Optional public notes you write about a restaurant, which are posted anonymously for other users to read (see "Community Tips" below)
- **Menu Photos:** Optional photos of restaurant menus you upload from your camera or photo library (see "Menu Photo Uploads" below)
- **Display Name:** Optional nickname shown next to community tips you post; stored only on your device and attached to each tip you submit
- **Contact Information:** Only when you voluntarily contact support

### Information Collected Automatically
- **App Usage:** Recently viewed restaurants for quick access (stored on device only)
- **Device Information:** App version, device type, and operating system for compatibility
- **IP Address (Community Tips only):** When you post a community tip, your IP address is temporarily used to enforce a per-hour posting rate limit. It is NOT stored with the tip and is not linked to your device ID or any other identifier.
- **Performance Data:** Crash reports and aggregate performance metrics (no personal identifiers)

### Information NOT Collected
- We do not collect personal identifiers like name, email, or phone unless voluntarily provided
- We do not track your location continuously (only when you explicitly tap the GPS button)
- We do not collect browsing history from outside the app
- We do not use advertising trackers or cookies
- We do not create user accounts — there is no sign-in
- We do not maintain a cross-session user profile on our servers

## Legal Basis for Processing (GDPR)

We process your personal data based on the following legal bases:

1. **Legitimate Interest:** Providing restaurant recommendations and improving app performance
2. **Consent:** When you voluntarily post a community tip, upload a menu photo, or provide preferences
3. **Contractual Necessity:** Essential for app functionality and service delivery
4. **Legal Obligation:** When required by applicable laws

## How We Use Your Information

We use your information to:
- Provide restaurant recommendations relevant to your location
- Save your preferences and favorites locally on your device
- Derive a local-only "taste profile" from your favorites to suggest similar restaurants in other cities you might visit
- Classify restaurant photos into food vs. menu photos (via Google Vision OCR) so menus display in the correct section
- Display community tips other users have shared about a restaurant
- Enforce rate limits on community tip submissions to prevent spam and abuse
- Respond to customer support requests
- Comply with legal obligations

## Data Storage

### Local-Only Storage (Never Leaves Your Device)
The following are stored **exclusively on your device** and never transmitted to our servers:

- Favorites
- Personal notes
- Recently viewed restaurants
- Display name
- Home postal code / search radius preferences
- Derived taste profile (cuisine weights, price preferences, rating averages)
- Device ID (randomly generated on first launch, used only for share-import flows)
- Cached classifier results for menu-photo detection

This data is:
- Stored in encrypted device-level secure storage (AsyncStorage)
- Not transmitted to our servers
- Deleted when you uninstall the app or clear app data

### Server-Side Storage (Cloudflare Infrastructure)

We use Cloudflare's edge infrastructure to host the backend API. The following server-side storage is in use:

- **D1 (Restaurant Cache):** Restaurant metadata from Google Places, Foursquare, HERE, and OpenStreetMap APIs is cached to reduce redundant external API calls and improve performance. This cache contains only restaurant data (names, addresses, ratings, photos, hours, cuisine type) — **no personal data**. Cache entries refresh automatically and do not identify any user.
- **KV (Community Tips):** Public notes you post via the "Community Tips" feature are stored in Cloudflare KV, keyed by restaurant ID. Each tip contains the tip text, optional display name, and a timestamp. No IP address, device ID, or other identifying information is stored with the tip.
- **KV (Rate Limit):** When you post a community tip, your IP address is stored in a short-lived (1-hour sliding window) rate-limit bucket. This is used exclusively to reject excessive posting and is automatically expired.
- **R2 (Menu Photo Uploads):** Menu photos you explicitly upload are stored in Cloudflare R2 object storage, keyed by restaurant ID. These are public (visible to other users viewing the restaurant). Only photos YOU actively upload go here — the app never auto-uploads photos from your device.
- **Vectorize (Semantic Search):** Restaurant metadata is indexed for natural-language search ("cozy Italian place with outdoor seating"). This index contains only restaurant data, no user data.

**Important:** No favorites, notes, preferences, taste profiles, search history, location data, or any other user-identifying information is stored on our servers. The only user-generated content that leaves your device is (1) community tips you choose to post publicly and (2) menu photos you choose to upload publicly.

### International Data Transfers (GDPR)
Your data may be transferred to and processed in the United States and other countries where Cloudflare operates edge data centers. We ensure appropriate safeguards including Cloudflare's Standard Contractual Clauses and adequate protection measures in accordance with GDPR requirements.

### Data Retention
- **Restaurant cache data:** Automatically refreshed every 30 days
- **Community tips:** Retained in KV storage up to 200 tips per restaurant; older tips are automatically rotated out
- **Menu photo uploads:** Retained until you or we remove them; contact support to request removal of a specific photo
- **Rate-limit data:** Automatically expires after 1 hour
- **Local user data:** Remains on your device until you delete it
- **Support communications:** Retained for 2 years for service quality purposes

You can clear all local data through Settings → Data Management → Clear History, or by uninstalling the app.

## Community Tips (Public Notes)

The "Community Tips" feature lets you post short public notes about a restaurant for other users to read. When you post a tip:

- **It is public.** Any user viewing that restaurant can see your tip.
- **It is anonymous unless you opt in.** You may optionally provide a display name; otherwise the tip shows as "Anonymous."
- **It is screened before posting.** Both the app (client-side) and our servers (worker-side) run content moderation. Tips containing profanity, slurs, threats of violence, drug promotion, or targeted harassment of staff are automatically rejected.
- **PII is automatically scrubbed.** If you accidentally include a phone number, email address, Social Security number, or credit card number in your tip, it will be replaced with a placeholder (e.g., `[phone removed]`) before the tip is stored.
- **Rate-limited.** You can post up to 10 tips per hour per IP address to prevent spam.
- **Not tied to your identity.** Tips are not linked to your device ID, favorites, or any other data. If you delete the app, tips you've already posted remain visible.

To request removal of a specific tip, contact us at info@sassyconsultingllc.com with the restaurant name and approximate time of posting.

## Menu Photo Uploads

The "Menu" section of each restaurant lets you optionally upload photos of physical menus:

- **Uploads are voluntary.** The app never uploads a photo without your explicit tap on "Add Photo" or "Take Photo."
- **Menu photos are public.** Once uploaded, they are visible to other users viewing that restaurant.
- **Photos are classified for menu text.** The app uses Google Vision OCR to verify that the photo contains menu text before uploading. Non-menu photos are rejected client-side.
- **EXIF metadata is stripped.** GPS coordinates and device information embedded in the photo are not included in the uploaded image.
- **Stored in Cloudflare R2.** Keyed by restaurant ID; no uploader identity is stored with the photo.

To request removal of a menu photo, contact us at info@sassyconsultingllc.com.

## Google Vision OCR (Menu Classification)

To identify which Google Places photos are menu pages vs. food/ambiance shots, the app sends photo URLs to the Google Cloud Vision API for text detection. No user data is sent — only the public Google Places photo URL. Classification results are cached locally on your device so subsequent views are instant and do not re-call the API.

## Your Rights and Choices

### GDPR Rights (EU Residents)
You have the following rights under GDPR:

1. **Right to Access:** Request copies of your personal data
2. **Right to Rectification:** Correct inaccurate or incomplete personal data
3. **Right to Erasure:** Request deletion of your personal data
4. **Right to Portability:** Request your data in a structured, machine-readable format
5. **Right to Object:** Object to processing of your personal data
6. **Right to Restrict:** Limit how we process your personal data

To exercise these rights, contact us at info@sassyconsultingllc.com. We will respond within 30 days. Because we do not maintain server-side user accounts, most rights (access, rectification, erasure, portability) are exercised directly on your device by clearing app data or uninstalling the app.

### CCPA Rights (California Residents)
As a California consumer, you have the right to:

1. **Right to Know:** What personal information we collect, use, and disclose
2. **Right to Delete:** Delete personal information we collect and maintain
3. **Right to Opt-Out:** Sale of personal information (we do not sell personal information)
4. **Right to Non-Discrimination:** We will not discriminate against you for exercising your privacy rights

**Do Not Sell My Personal Information:** We do not sell personal information. Contact us at info@sassyconsultingllc.com with questions.

### PIPEDA Rights (Canada)
Under PIPEDA, you have the right to:
- Know why we collect, use, and disclose your personal information
- Request access to your personal information
- Challenge the accuracy of your personal information
- Request correction of inaccurate information
- Withdraw consent where appropriate

### UK GDPR Rights (United Kingdom Residents)
Under the UK General Data Protection Regulation and the Data Protection Act 2018, UK residents have the following rights:

1. **Right to Access:** Request copies of your personal data held by us
2. **Right to Rectification:** Correct inaccurate or incomplete personal data
3. **Right to Erasure:** Request deletion of your personal data where there is no compelling reason for continued processing
4. **Right to Data Portability:** Receive your data in a structured, commonly used, and machine-readable format
5. **Right to Object:** Object to processing based on legitimate interests or direct marketing
6. **Right to Restrict Processing:** Limit how we process your personal data in certain circumstances
7. **Right Not to be Subject to Automated Decision-Making:** Right not to be subject to decisions based solely on automated processing that produce legal or significant effects

**UK Representative:** For UK-specific inquiries, contact us at info@sassyconsultingllc.com. We will respond within one calendar month.

**UK Supervisory Authority:** You have the right to lodge a complaint with the Information Commissioner's Office (ICO) at https://ico.org.uk if you believe your data protection rights have been violated.

**International Transfers from UK:** Where we transfer personal data from the UK to countries outside the UK that have not been deemed to provide an adequate level of data protection, we use Standard Contractual Clauses approved by the UK Secretary of State or other lawful transfer mechanisms.

### India DPDPA Rights (India Residents)
Under the Digital Personal Data Protection Act, 2023, Indian residents (Data Principals) have the following rights:

1. **Right to Access:** Request a summary of your personal data being processed and the processing activities
2. **Right to Correction and Erasure:** Request correction of inaccurate or misleading personal data, and request erasure of data no longer necessary for the purpose it was collected
3. **Right to Grievance Redressal:** Submit grievances regarding our processing of your personal data
4. **Right to Nominate:** Nominate another individual to exercise your rights in the event of your death or incapacity

**Consent:** We obtain your consent before processing personal data where required under DPDPA. You may withdraw consent at any time by contacting us at info@sassyconsultingllc.com. Withdrawal of consent does not affect the lawfulness of processing carried out prior to withdrawal.

**Data Fiduciary Obligations:** As a Data Fiduciary under DPDPA, we maintain reasonable security safeguards to protect personal data, notify affected individuals and the Data Protection Board of India in the event of a personal data breach, and retain personal data only as long as necessary for the purpose for which it was collected.

**Grievance Officer:** For India-specific privacy concerns, contact our Grievance Officer at info@sassyconsultingllc.com. We will acknowledge your grievance within 48 hours and resolve it within 30 days.

### Location Access
- The app requests location access only when you use GPS features
- You can deny location access and manually enter postal codes
- Location data is not stored or transmitted to our servers
- You can revoke location access at any time in device settings

### Data Deletion
- Clear your history: Settings → Data Management → Clear History
- Remove favorites: Tap the fork & knife icon on any restaurant in your favorites list
- Delete all data: Uninstall the app or clear app data in device settings
- Request removal of a community tip or menu photo: Contact us at info@sassyconsultingllc.com

### Opt-Out Choices
- Disable location access in device settings
- Use manual postal code entry instead of GPS
- Clear local data regularly through app settings
- Do Not Post Community Tips: The feature is opt-in — simply don't tap "Share a tip"
- Do Not Track: We respect Do Not Track signals and do not use tracking technologies

## Data Sharing

We do not sell, trade, or rent your personal information to third parties. We may share information only in the following circumstances:

- **Legal Requirements:** If required by law, court order, or governmental authority
- **Protection of Rights:** To protect our rights, privacy, safety, or property
- **Business Transfers:** In connection with a merger, acquisition, or sale of assets (you will be notified)
- **Service Providers:** With trusted third-party service providers who process data on our behalf (Cloudflare, Google)

## Third-Party Services

The app uses information from third-party sources including:
- **Google Places API** — restaurant data (paid service)
- **Google Cloud Vision API** — menu photo classification via OCR
- **Foursquare Places API** — restaurant metadata (secondary source)
- **HERE Maps API** — restaurant metadata (secondary source)
- **OpenStreetMap / Overpass API** — restaurant metadata (fallback source)
- **Culver's public API** — Flavor of the Day information

These services have their own privacy policies. Foodie Finder only sends each service the minimum data needed to answer your query (typically coordinates or a postal code). We encourage you to review each provider's policy.

## Cloudflare Infrastructure
We use Cloudflare's global infrastructure to:
- Cache restaurant data for faster access and lower API costs
- Host the tRPC API worker
- Store community tips and rate-limit buckets (KV)
- Store menu photo uploads (R2)
- Power semantic search (Vectorize + Workers AI)

Cloudflare processes data according to their privacy policy: https://www.cloudflare.com/privacypolicy/

## Cookies and Tracking

We do not use cookies or similar tracking technologies in our mobile app. We do not embed advertising SDKs or analytics trackers that identify individual users. We respect Do Not Track signals.

## Data Security

We implement appropriate security measures to protect your information:
- Local data is stored in device-level secure storage
- All API traffic is encrypted in transit via HTTPS/TLS
- Cloudflare provides enterprise-grade security for cached data
- Community tip submissions are rate-limited and content-moderated on both client and server
- PII in community tips is automatically detected and scrubbed before persistence
- API keys are stored as environment secrets, never committed to source control
- Regular security updates and dependency audits

## Data Breach Notification

In the event of a data breach that poses a risk to your rights and freedoms, we will:
- Notify affected individuals without undue delay and where feasible within 72 hours
- Notify relevant regulatory authorities as required by law
- Provide information about the breach and measures taken

## Children's Privacy

Our app is not directed to children under 13. We do not knowingly collect personal information from children under 13. If we become aware that we have collected personal information from a child under 13, we will delete it immediately.

## Changes to This Privacy Policy

We may update this privacy policy from time to time. We will notify you of any changes by:
- Posting the new policy in the app
- Updating the effective date above
- Sending in-app notifications for significant changes
- Email notification for users who have contacted support

## Review Process

We review this privacy policy annually and whenever material product changes introduce new data flows. The last such review accompanied the launch of Community Tips, Menu Photo Uploads, and cross-locale taste matching on April 10, 2026.

## Complaint Procedures

If you have concerns about our privacy practices, you may:
1. Contact us directly at info@sassyconsultingllc.com
2. File a complaint with the relevant privacy authority:
   - EU: Your local data protection authority
   - California: California Attorney General
   - Canada: Privacy Commissioner of Canada
   - United Kingdom: Information Commissioner's Office (ICO) at https://ico.org.uk
   - India: Data Protection Board of India

We will investigate and respond to all complaints promptly.

## Financial Incentives (CCPA)

We do not offer financial incentives for the disclosure of personal information. If we ever offer such a program, we will provide clear notice and obtain your consent.

## Authorized Agents (CCPA)

You may designate an authorized agent to exercise your CCPA rights on your behalf. We will verify the agent's authority before processing requests.

## Non-Discrimination (CCPA)

We will not discriminate against you for exercising your privacy rights, including by:
- Denying goods or services
- Charging different prices or rates
- Providing different levels of service
- Suggesting you may receive a different price or rate

## Contact Us

If you have questions about this privacy policy or want to exercise your rights, please contact us:

**Email:** info@sassyconsultingllc.com
**Website:** https://privacy.sassyconsultingllc.com/foodie-finder
**Privacy Officer:** Available at the above email for GDPR-related inquiries

## California Residents

If you are a California resident, you have additional rights under the California Consumer Privacy Act (CCPA) and California Online Privacy Protection Act (CalOPPA). This policy is designed to comply with these laws.

## International Users

Your data may be processed and stored on servers located outside your country. We take appropriate measures to ensure your data is protected according to this privacy policy regardless of where it is processed, including Standard Contractual Clauses for international transfers.

---

© 2025 Sassy Consulting — A Veteran Owned Company

**Last Reviewed:** April 10, 2026
**Next Review Date:** April 10, 2027
