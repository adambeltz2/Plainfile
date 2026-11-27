# Google Drive: not built yet, and why

Back to the [README](../README.md).

OneDrive is built (see [ONEDRIVE.md](ONEDRIVE.md)). Google Drive is not, because Google's rules for a page like tendfile (a static page, no server, no secret in the code, only version-pinned scripts) leave one narrow route, and it has costs that need your decision. Here is what Google's own documentation says.

## What Google allows for a page with no server

- **A client secret is needed for the usual sign-in.** A "Web application" client uses a client secret to exchange the sign-in code. A secret cannot live in a public page, and the project rule is that a secret never goes in the code.
- **The "Desktop app" client type can use PKCE without a secret, but it sends you back to a loopback address (`http://127.0.0.1:port`) or a custom scheme**, which a hosted page cannot receive.
- **That leaves Google's own sign-in script** (Google Identity Services, from `accounts.google.com/gsi/client`). It gives an access token with no secret, but:
  - there is **no refresh token**: the token lasts about an hour, and a new one needs a button press (a pop-up) from the person;
  - the script is **Google's, loaded live**: it cannot be version-pinned or integrity-hashed, which the dependency rule in `CLAUDE.md` requires of every outside script, so this would be a deliberate exception.

## What Drive itself is like

- **Files are found by ID, not by path.** Two files may share a name in one folder. tendfile would have to resolve every path, and decide what to do with duplicates.
- **No documented "only if unchanged" write.** Drive v3 has a `version` number and a `modifiedTime`, but no documented `If-Match`. tendfile would check the version just before writing, which leaves a gap of a fraction of a second in which another device's edit could be overwritten. Dropbox and OneDrive close that gap.
- **Which files the app can see:**
  - `drive.file` (no Google review needed) sees only files the app created, or files you pick with Google's file picker. Your existing folder of notes would not show up unless picked file by file, and the picker is another Google script plus an API key.
  - `drive` (see everything) is a *restricted* scope. For a public app Google requires a verification and a paid yearly security assessment. For your own use it works without that: the app stays in "Testing" mode with you as a test user, and Google shows an "unverified app" warning each time.

## Options

1. **Skip Google Drive.** Dropbox and OneDrive already cover iPhone, Safari and Firefox. This is what I would do unless you personally need Drive.
2. **Personal-use Google Drive.** Built on Google's sign-in script, with the `drive` scope in Testing mode, for you and a few test users (up to 100). It would carry the hourly sign-in and the small write gap, and `CLAUDE.md` would need an exception for Google's script. I would label it clearly in the app.
3. **A small token service** (a serverless function holding the client secret). That breaks "no backend, no accounts", so I would not.

## If you choose option 2: what I need from you

1. Open the [Google Cloud console](https://console.cloud.google.com/) and create a project (for example `tendfile`).
2. **APIs and Services**, **Library**: enable the **Google Drive API**.
3. **APIs and Services**, **OAuth consent screen**: choose **External**, name it `tendfile`, add your email as support and developer contact, add the scope `.../auth/drive`, and under **Test users** add your Google account. Leave the publishing status on **Testing**.
4. **Credentials**, **Create credentials**, **OAuth client ID**: type **Web application**. Under **Authorized JavaScript origins** add the origin of the site, for example `https://adambeltz2.github.io` (an origin has no path and no trailing slash).
5. Copy the **Client ID** (it ends in `.apps.googleusercontent.com`). Send me only that. It is public. Do not create or send a client secret, and do not send the downloaded JSON file.

Tell me which option you want, and I will build it.
