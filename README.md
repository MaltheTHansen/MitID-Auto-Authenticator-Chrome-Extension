# MitID Auto Authenticator (browser extension)

Approves MitID pre-production Login requests for your test Identities, so testing MitID login flows doesn't need a phone or the MitID test tool. It's the browser version of [MitIdAutoAuthenticator](https://github.com/ChristianMorup/MitIdAutoAuthenticator). See [GLOSSARY.md](GLOSSARY.md) for the terms used.

Works in Chrome, Edge and Brave (Manifest V3).

## Install

```sh
npm install
npm run build
```

Then load the `dist` folder as an unpacked extension:

| Browser | Extensions page | Shortcuts page |
| ------- | --------------- | -------------- |
| Chrome  | `chrome://extensions` | `chrome://extensions/shortcuts` |
| Edge    | `edge://extensions`   | `edge://extensions/shortcuts`   |
| Brave   | `brave://extensions`  | `brave://extensions/shortcuts`  |

Turn on **Developer mode**, click **Load unpacked** and pick `dist`. Pin the extension to the toolbar. After pulling changes, run `npm run build` again and click the reload icon on the extension.

## Add the MitID admin credential yourself

This repo does not contain the credential for the MitID pre-production admin API, and you need it to add Identities. Approving logins for Identities already in your list works without it.

1. Get a client ID and client secret for the MitID pre-production admin API yourself. They're not provided here.
2. Open the options page with ⚙ in the popup.
3. Enter both values under **MitID admin credential** and click **Save**.

The credential is stored in your browser profile only. Never commit it to this repo.

## Use

1. Click the toolbar icon to open the popup. Approving keeps running in the background if the popup closes, and reopening it shows the latest result.
2. Type a MitID user ID (e.g. `Theo404`) and press Enter to add an Identity:
   - If it exists in MitID pre-production and has a Simulator, it's just added to your list.
   - If it exists without a Simulator, a Simulator is created for it.
   - If it doesn't exist, a new Identity is created with mock data. Check the spelling: a typo creates a new Identity.
3. Start a MitID login on the site you're testing, enter the user ID, and click **Approve** next to the Identity. The extension checks for a pending Login request every 2 seconds for about 15 seconds. The status line shows which service you approved a login for.

**Alt+Shift+M** approves the first Identity in the list without opening anything. The toolbar badge shows `…` while it waits, then `✓` or `✗`. Use ↑ / ↓ to choose which Identity is first, and change the key on the browser's shortcuts page. ✕ removes an Identity from your list only; it stays in MitID.

**CPR** copies the Identity's CPR number to the clipboard.

Click an Identity's name to expand its details:
- name, CPR number, date of birth with age, address, email and assurance level, each with a copy button;
- its status, plus a ⚠ on the row when the Identity or its CPR registration isn't active, or its name or address is protected.

The details are looked up in MitID the first time, which needs the admin credential, and then saved with the Identity. ↻ looks them up again. Identities created by the extension already have their CPR number.

## Options

Open the options page with ⚙ in the popup.

- **MitID admin credential.** The client ID and secret used to add Identities. See [Add the MitID admin credential yourself](#add-the-mitid-admin-credential-yourself).
- **Import / export.** Paste the lines of the console or Windows app's `mitid_users.txt` (`userId,identityId,authenticatorId`) and click Import to bring your existing Identities over. Export puts your list in the same format.

## How it works

Each Identity has a Simulator: a simulated MitID code app created through the MitID test API. Approving a Login request calls the Simulator's endpoints on `pp.mitid.dk` in the same order the phone app would: `auth-key` → `pull` → `perform-auth` (PIN `112233`) → `confirm`. Those calls need no credential; only adding Identities uses the admin credential.

The extension only polls when you ask it to approve. The original console app polled constantly, and running it for long periods risks getting your IP temporarily banned from the MitID test tool.

## Develop

```sh
npm test         # Vitest: mitid_users.txt parsing and the approve flow against a faked MitID
npm run build    # tsc → dist, plus the static files
npm run package  # build, then zip dist to release/mitid-auto-authenticator-<version>.zip
```

To release, bump `version` in `static/manifest.json`, run `npm run package` and share the zip. Users unzip it and use Load unpacked, so they don't need Node or the code. The zip has no credential either; everyone adds it in Options.

- `src/background.ts` is the service worker. It handles the shortcut, toolbar button and commands from the popup.
- `src/mitid/` holds the MitID API calls.
- Pages and the manifest live in `static/`.
