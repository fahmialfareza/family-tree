# App Store Connect: what fastlane fills, and the answers for the rest

`fastlane apple` (see `fastlane/Fastfile`) fills the iPhone/iPad and Mac versions in Indonesian and English:
name, subtitle, description, keywords, promotional text, support/marketing/privacy URLs, copyright, categories
(Lifestyle, Reference), age rating (`fastlane/app-rating.json`, 13+ as in the Terms), App Review information with
the demo account (`SAKDULUR_DEMO_ACCOUNT`) and notes (`fastlane/review-notes.txt`), and screenshots.
`fastlane apple_pricing` made the app free in every country.

**App Privacy** and **App Accessibility** need an Apple ID session rather than the API key, so they are set by hand.

## App Privacy (App Store > Trust & Safety > App Privacy)

Privacy policy URL: `https://sakdulur.com/en/privacy`. "Do you or your third-party partners collect data from this
app?" **Yes**. Tracking: **No** for every type (no data is linked with other companies' data or used for ads).

| Data type | Linked to the user | Purpose |
| --- | --- | --- |
| Contact Info > Name | Yes | App Functionality |
| Contact Info > Email Address | Yes | App Functionality |
| Contact Info > Phone Number (entered for relatives) | Yes | App Functionality |
| Contact Info > Physical Address (entered for relatives) | Yes | App Functionality |
| User Content > Photos or Videos | Yes | App Functionality |
| User Content > Other User Content (tree details, notes) | Yes | App Functionality |
| Identifiers > User ID | Yes | App Functionality |
| Diagnostics > Crash Data, Performance Data | Yes | App Functionality |
| Usage Data > Product Interaction | **No** | Analytics (Cloudflare's cookieless visit statistics) |

## App Accessibility (App Store > Trust & Safety > App Accessibility)

Optional. Claim only what has been checked on the device; so far: **Dark Interface** (follows the system setting)
and **Sufficient Contrast** (the site scores 100 for accessibility in Lighthouse). Leave VoiceOver, Voice Control,
Larger Text, Reduced Motion and the rest unclaimed until they are tested in the app.
