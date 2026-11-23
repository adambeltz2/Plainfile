# Connecting Dropbox

Back to the [README](../README.md).

Choose **Connect Dropbox** on the first screen, optionally type a folder such as `/Notes`, and sign in.
Plainfile uses its own Dropbox app by default. The app key in `web/cloud.ts` is public by design: sign-in
uses PKCE, so there is no secret.

**The address matters.** Dropbox sends you back to the exact page you signed in from, so that address (for example `https://adambeltz2.github.io/Plainfile/`) must be listed under **Redirect URIs** in the Dropbox app. If the site's address ever changes (a repository rename changes it), add the new one there or sign-in will fail.

To use your own Dropbox app instead (for a private copy, or if the shared app reaches its user limit):

1. At [dropbox.com/developers/apps](https://www.dropbox.com/developers/apps) create an app: **Scoped access**,
   then **App folder** (safest) or **Full Dropbox**.
2. On the **Permissions** tab tick `files.metadata.read`, `files.metadata.write`, `files.content.read`
   and `files.content.write`, and submit.
3. On **Settings**, add the address of the page that serves Plainfile under **Redirect URIs**.
4. Paste the app key under **Use my own Dropbox app**, or set the `DROPBOX_APP_KEY` repository variable
   to build it in.
