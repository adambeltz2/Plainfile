# Connecting OneDrive

Back to the [README](../README.md).

OneDrive works in any browser, including iPhone and Safari, with a personal Microsoft account or a work or school account. tendfile reaches your files over Microsoft's web API (Microsoft Graph). Nothing goes through a server of ours, and sign-in tokens stay in your browser.

The **OneDrive** card on the first screen appears once the site has a registered app. Until then, nothing shows. To get there, someone (you) has to register that app once. It takes about ten minutes and costs nothing.

## What you do (one time)

1. Sign in to the [Microsoft Entra admin center](https://entra.microsoft.com/) (or the [Azure portal](https://portal.azure.com/)) with your Microsoft account. A personal account works: it gets a free default directory. You do not need a paid subscription.
2. Go to **Identity**, then **Applications**, then **App registrations**, and choose **New registration**.
3. Fill in the form:
   - **Name:** `tendfile`
   - **Supported account types:** *Accounts in any organizational directory and personal Microsoft accounts*. (This is the choice that lets everyone sign in. Pick a narrower one only if you want a private copy.)
   - **Redirect URI:** set the platform to **Single-page application (SPA)**, not *Web*, and enter the address that serves tendfile, for example `https://adambeltz2.github.io/Plainfile/`. It must match exactly, with the trailing slash.
4. Choose **Register**. On the **Overview** page, copy the **Application (client) ID**. It looks like `0a1b2c3d-1234-5678-9abc-def012345678`.
5. Open **API permissions**, choose **Add a permission**, then **Microsoft Graph**, then **Delegated permissions**, and tick `Files.ReadWrite` and `offline_access`. (`User.Read` is already there; leave it.) You do not need admin consent for these.
6. Leave **Authentication** as it is. Do not tick the implicit-grant boxes. Do not create a client secret.

## What to send me

Only the **Application (client) ID**. It is public by design: sign-in uses PKCE, so there is no secret, and the ID appears in every sign-in address. Never send me, or paste anywhere, a *client secret* if you happen to create one.

Either:

- tell me the ID and I will put it in `web/cloud-onedrive.ts`, or
- set it yourself as a repository variable: **Settings**, **Secrets and variables**, **Actions**, **Variables**, then **New repository variable** named `ONEDRIVE_CLIENT_ID`, and the next deploy builds it in.

## The address matters

Microsoft sends you back to the exact page you signed in from, so that address must be listed under **Authentication**, **Single-page application**, **Redirect URIs**. If the site's address changes (a custom domain, or a repository rename), add the new one there or sign-in will fail. You can keep the old one listed too.

## Things to know

- **You sign in again about once a day.** Microsoft ends a browser app's sign-in after 24 hours. tendfile says so and offers **Connect OneDrive**; usually it is one click and no password.
- **A folder, or the whole OneDrive.** Type a folder such as `Documents/Notes` when you connect, or leave it empty to use the whole OneDrive. Only that folder is read.
- **Edits made elsewhere are never overwritten.** A save is sent with the file's OneDrive revision (its `eTag`); if the file changed in the meantime OneDrive refuses it and tendfile tells you.
- **Deleting goes to the OneDrive recycle bin** as well as tendfile's own trash.
- **Large files** (images) are sent in pieces, as Microsoft requires.

## Your own app instead

To use your own registration (a private copy, or a work or school tenant), do the steps above and paste the Application (client) ID under **Use my own OneDrive app** on the connect form, or build it in with `ONEDRIVE_CLIENT_ID`.

## What has not been tried against the real service

The adapter is tested against a fake OneDrive that follows Microsoft's documentation. These points need a real sign-in to confirm, and the first person to connect should check them:

- the sign-in round trip and the daily sign-in again;
- reading a file (the content address redirects to a download address);
- writing a new file in a folder that does not exist yet, and replacing a file;
- a refused write when the file changed elsewhere;
- uploading an image larger than a few megabytes.
