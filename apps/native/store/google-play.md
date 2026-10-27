# Google Play: what fastlane fills, and the answers for the rest

`fastlane play` (see `fastlane/Fastfile`) uploads the store listing in Indonesian and English: name, short and full
description, icon, feature graphic, phone and tablet screenshots, and the contact email and website.

Google's API doesn't cover **App content** or the **category**, so those are set once in Play Console with the
answers below. They follow the privacy policy (`apps/frontend/src/lib/legal-content.ts`); update both together.

## App content (Policy and programs > App content)

**Privacy policy:** `https://sakdulur.com/en/privacy` (the Indonesian page is `/id/privacy`).

**App access (sign-in details):** "All or some functionality is restricted". Add one set of instructions:
- Name: `Demo account`
- Username / password: from `sakdulur-demo-account.txt` (iCloud `Reza/Projects/Sakdulur/Credentials`)
- Instructions: "Tap 'I already have an account' and sign in with email. The account has a sample tree, Keluarga
  Wiryo, with four generations of fictional people."

**Ads:** No, the app doesn't contain ads.

**Content rating** (IARC questionnaire): category **All other app types**.
- Violence, fear, sexuality, language, controlled substances, gambling: No to all.
- Users can interact or exchange content: **Yes**. Members of a private tree share names, photos and notes
  with the family members the owner invites; there is no public posting, chat between strangers, or discovery.
- Shares the user's current location: No. Digital purchases: No.

**Target audience:** ages **13–15, 16–17 and 18+** (the Terms require 13+). The store listing is not designed to
appeal to children.

**Data safety:**
- Collects or shares any required user data types: **Yes**.
- All user data encrypted in transit: **Yes**.
- Account creation methods: username and password, plus OAuth (Sign in with Google, Sign in with Apple).
- Delete account URL: `https://sakdulur.com/en/privacy` (section 6 explains deleting the account in the app or by
  email). Users can also ask to delete some data without deleting the account: **Yes**.
- Data shared with third parties: **None** (hosting, email, photo storage and AI are service providers acting for
  us, which Play doesn't count as sharing).

| Data type | Collected | Required? | Purposes |
| --- | --- | --- | --- |
| Personal info > Name | Yes | Required | App functionality, Account management |
| Personal info > Email address | Yes | Required | App functionality, Account management |
| Personal info > User IDs | Yes | Required | App functionality, Account management |
| Personal info > Address | Yes | Optional (entered for relatives) | App functionality |
| Personal info > Phone number | Yes | Optional (entered for relatives) | App functionality |
| Personal info > Other info (birth/death dates and places, religion) | Yes | Optional | App functionality |
| Photos and videos > Photos | Yes | Optional | App functionality |
| App activity > Other user-generated content (tree details, notes) | Yes | Optional | App functionality |
| App activity > App interactions | Yes | Required | Analytics (anonymous, cookieless visit statistics) |
| App info and performance > Crash logs, Diagnostics | Yes | Required | App functionality (server monitoring) |

Not collected: location, financial info, health, messages, audio, files and docs beyond exported trees, calendar,
contacts, web browsing, device or other IDs.

Data safety can also be imported: in Play Console use Data safety > **Export to CSV**, then hand the CSV over and it
can be filled from this table and imported back.

**Government apps:** No. **Financial features:** none. **Health:** none (not a health app).

## Store settings

**App category:** App, **Lifestyle**. Tags: Family, Genealogy (or the closest Play offers).
**Contact details:** email `fahmialfareza97@gmail.com` and website `https://sakdulur.com` (set by `fastlane play`);
phone optional.
