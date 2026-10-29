# OAIA Studio

OAIA Studio is a local Mac app for generating and editing images through the OpenAI Images API. Describe an image, add references, choose a model and dimensions, and download the original PNG. Images, prompts, references, and settings are saved on the Mac running the app.

Use it in a browser, or install its skill for **Codex and Claude Code**. This is an independent, MIT-licensed project by Cory Dorning. It uses your own OpenAI API key and API credits; it is not an OpenAI product or a separate “Codex API.”

[Download the latest release](https://github.com/corydorning/oaia-studio/releases/latest/download/oaia-studio.zip) · [Source on GitHub](https://github.com/corydorning/oaia-studio) · [Install the skill](#install-the-skill)

Use **Default** for your existing history, or create named studios for separate projects. Every studio has its own address, saved images, and one-image-at-a-time queue. They all use the same API key and OpenAI credit balance.

## Quick start

1. Download and extract the release ZIP. Keep its **oaia-studio** folder together in a writable location on your Mac. Install the runtimes listed under **On another Mac** if needed.
2. If you have not configured a key on this Mac, [create an API key](https://platform.openai.com/api-keys), then double-click **Configure OAIA API Key.command**. Paste an OpenAI project API key into its hidden Terminal prompt. The key goes into macOS Keychain; do not put it in a file or paste it into chat.
3. Double-click **Open OAIA Studio.command** to start or reopen Default. The launcher prints the actual address and opens Brave if installed, otherwise your default browser.
4. The page checks model access without generating an image. When connected, enter a prompt and choose **Generate image** once.

Once the runtimes are available, there is no dependency installation or build step. Closing the browser or the launcher window does not stop a studio. Double-click **Stop OAIA Studio.command** to stop Default, or use the management menu for another studio. Stop and Restart refuse while an image is starting, generating, or being saved.

### On another Mac

You need **macOS**, **Node.js 22.2 or newer**, and **Python 3.8 or newer**. Download Node from [nodejs.org](https://nodejs.org/) and Python from [python.org](https://www.python.org/downloads/macos/), or use your existing Homebrew installations. The app does not install anything automatically.

Launchers search the current environment, standard Homebrew locations, and the current user's bundled Codex runtime. Python prefers an existing bundled Codex runtime to preserve access to keys already authorized for that interpreter, then falls back to the current environment and standard paths. Explicit runtime overrides take priority. Launchers show a clear error if a suitable runtime is unavailable. For a nonstandard installation, `LOCAL_IMAGE_STUDIO_NODE` and `LOCAL_IMAGE_STUDIO_PYTHON` can point to the full executable paths. Finder does not necessarily inherit variables from an interactive Terminal, so use the standard locations or launch from that Terminal when using overrides.

Copy the source folder or extract the release ZIP, then configure the key locally. The ZIP does **not** include the key, local account information, studio registry, or image history. An API account with access to the configured image models and available credits is required; a ChatGPT subscription alone does not guarantee API access or credits.

## Several studios at once

Double-click **Manage OAIA Studios.command**. Its Terminal menu lists studios and lets you open, create, stop, or restart one by name. Closing the menu leaves running studios available.

For example, create **Product Photos** and **Course Ideas**. Their histories stay separate and each can generate one image at a time. Opening **Product Photos** again reuses its existing server. Names allow letters, numbers, spaces, and hyphens, up to 48 characters. Case and spacing are normalized: `Product Photos` and `product-photos` identify the same studio.

| Studio | Images and generation records |
|---|---|
| Default | `~/Pictures/Local Image Studio/` |
| Product Photos | `~/Pictures/Local Image Studio/Studios/product-photos/` |
| Course Ideas | `~/Pictures/Local Image Studio/Studios/course-ideas/` |

The existing `Local Image Studio` storage folder and Keychain identifiers are intentionally retained so renaming the app does not move your images or require a new key. Separate studios are organizational spaces, not separate accounts or access controls. Simultaneous generations share API credits and account rate limits. There is no shared spending cap in this app. Within each studio, a second different image request is refused until the first finishes; requests are not silently queued or retried.

### Addresses and occupied ports

Default first tries **http://127.0.0.1:8787**. Each studio remembers its last successful port. If that port is occupied, it tries another and prints the address it actually claimed. The server binds the real network socket before the browser opens, so a port taken by another service—or another studio starting at the same time—is skipped. An unrelated service is never adopted or stopped.

Do not assume a named studio is always on 8788 or another particular number. Reopen it through the launcher or check the management list for its current address. The name also appears in the browser tab and page heading.

The launcher prints addresses for this Mac's connected private local networks. From another device on the same subnet, use one of those addresses with the printed port. Saved images remain on the hosting Mac; **Download PNG** also saves a copy on the device using the browser. A changing Mac LAN address or a newly occupied port can make an old bookmark stale.

**LAN access has no password.** Anyone on an allowed connected private subnet can view images and submit requests using this Mac's saved key. Traffic is ordinary HTTP. The app retains local-address, client-subnet, and same-origin request checks; it does not create a public tunnel, change the router, or change firewall settings. A macOS firewall prompt or an existing firewall rule may affect access from another device.

## Generate, inspect, and download

1. Describe the image. Optionally add up to **16 PNG, JPEG, or WebP references**, under **15 MB each** and **50 MB combined**. Add or remove individual images as needed. Their numbered previews show the order sent to OpenAI; explain each image's role in your prompt.
2. Choose **Sunburst** or **Flare**, dimensions, and quality. Sunburst is the default and Flare is the faster alternative in the documented model setup. Medium quality is the initial selection; higher quality can cost more.
3. Click **Generate image** once. Wait for the result, then choose **Download PNG**. The app saves the original output without upscaling or resizing.
4. **Settings** and **Prompt** download the records alongside the image. Previous results appear in **Saved images**.

Each generation has its own ID folder containing `image.png`, `prompt.txt`, and `settings.json`. References are saved as numbered files; their original names, order, and hashes are recorded in settings. Selecting files in the browser does not send them to OpenAI. Generation sends the prompt and selected references to OpenAI. No external scripts, fonts, or analytics load in the app.

Existing project history can also contain a prepared, named selection. In that case its preview and download use the selected PNG and show its own dimensions, title, and review status. The original generation remains alongside it. This selection feature is currently available through the local application API; there is no selection editor in the browser.

### Dimensions and cost

- Presets include standard, 1440p, and native **3840 × 2160 / 2160 × 3840**. Resolutions above 3,686,400 pixels are marked experimental according to the documentation checked for this version.
- **Custom** exposes width and height. Both must be multiples of 16, neither edge may exceed 3840, aspect ratio must be between 1:3 and 3:1, and total pixels must be 655,360–8,294,400. Invalid sizes are rejected locally rather than silently rounded. Initial custom values are 1328 × 2880, retained from the original project setup.
- Model availability, supported settings, and prices can change. The app's pricing information is dated, and cost estimates use returned usage when available. OpenAI Billing is authoritative. The app has no live credit-balance access.
- One submission requests one image. There are no automatic paid retries, fallback generations, or upscaling. If a request's outcome is uncertain, check OpenAI Usage before choosing to start a separately billed request.

## Key, credits, and privacy

The shared key is stored in **macOS Keychain**, service **Local Image Studio OpenAI API**, account **personal-api-key**. Only the backend reads it. The key is not sent to the browser, stored in this project, or written to application logs. Use **Configure OAIA API Key.command** to replace an expired or revoked key, then choose **Check connection**. Updating the key affects all studios.

For the usual **one-day-key workflow**:

1. Before the key expires, open [OpenAI API keys](https://platform.openai.com/api-keys) and create a replacement for the same API project, using the short lifetime you want where offered.
2. Open **Configure OAIA API Key.command**. Paste the replacement into its hidden local prompt. It replaces the shared Keychain entry; no key goes into this README or the project.
3. Choose **Check connection** in OAIA Studio. The backend retrieves the saved key for each connection check and each new generation, so a restart is unnecessary. An image request already in progress continues using the key with which it started.

Short-lived keys expire; the app does not renew them automatically. Check connection tests the replacement against the free models-list endpoint, without generating an image. If the key has expired or lacks access, resolve that before starting a new paid request.

The app uses whatever credits and billing arrangements apply to that API project. It cannot buy credits, enable recharge, or restrict a request to a particular grant. Review current balances and model permissions in your OpenAI account.

The existing Default setup may show a dated account snapshot under **Credits & setup**. That optional local record lives in `.runtime/account.json` and applies only to that original setup. It is not a live balance, a promise of credits, or part of the reusable release. Named studios show generic credit guidance. Historical account-specific setup evidence is retained locally in `.runtime/setup-history.md` and is excluded from the package. Dated generic API references are in `docs/sources.md`.

## Restart, backup, and recovery

- **Open OAIA Studio.command** starts or reopens Default. **Restart OAIA Studio.command** and **Stop OAIA Studio.command** also apply only to Default. Use **Manage OAIA Studios.command** for other studios.
- After restarting the Mac, open whichever studios you need. This app is not an automatic login service.
- Stop studios before moving or updating the app folder. A second app copy refuses to open an image folder already owned by a running studio. Open them again afterward to load the new version. Merely refreshing the browser does not reload backend code.
- Back up **`~/Pictures/Local Image Studio/`** for all saved work, including named studios. Back up **`.runtime/`** privately if you want to preserve studio names and port preferences; it also contains local control tokens and any optional account snapshot. Do not share this folder or commit it to Git.
- On another Mac, restore the image folder, create the same named studios, and configure its Keychain key locally. Do not copy live PID, lock, or `running.json` files from another machine. Names reconstruct the same image-folder paths.
- If a process is interrupted during generation, the next start marks its unfinished record **uncertain**. It never resubmits it. Check OpenAI Usage before generating again.
- Logs and per-studio state are under `.runtime/studios/<studio-name>/`. An unresponsive or mismatched server is reported instead of forcibly killed. Do not delete locks or process records while that studio is running.

When upgrading from the original single-server version, the manager detects a still-running legacy Default process and refuses to duplicate or stop it. Finish its current image, close that old backend deliberately, then open Default with the new launcher. Its existing image folder and Keychain entry are reused. This in-place detection uses the old app’s saved PID. A newly extracted copy does not have that record, and old versions did not hold the new shared image-folder lock. **Stop the original legacy app before opening a newly extracted copy.**

## Install the skill

Download and extract the **complete release**, then double-click **Install OAIA Skill.command**. It installs the skill for both clients by linking this complete app folder into:

- Codex: `~/.codex/skills/oaia-studio` (or `$CODEX_HOME/skills/oaia-studio` when configured).
- Claude Code: `~/.claude/skills/oaia-studio`.

Both clients share one app, the same named studios, and the same saved key. Keep the app folder in place. Running the installer again is safe; it refuses to replace an unrelated existing skill. No image is generated and no key is read during installation. Start a new agent turn or session if the skill has not appeared yet.

Use **`$oaia-studio`** in Codex or **`/oaia-studio`** in Claude Code. The root `SKILL.md` is the installable entrypoint. Do not install only the inner `skills/oaia-studio` folder: its helper needs the rest of the package.

Alternatively, clone and install from Terminal:

```sh
git clone https://github.com/corydorning/oaia-studio.git
cd oaia-studio
node scripts/install-skill.mjs
```

Codex's bundled GitHub skill installer can also install the complete repository for Codex alone:

```sh
python3 "${CODEX_HOME:-$HOME/.codex}/skills/.system/skill-installer/scripts/install-skill-from-github.py" \
  --repo corydorning/oaia-studio --path . --name oaia-studio --method download
```

With `--path .`, the explicit `--name oaia-studio` is required. To add Claude Code afterward, run **Install OAIA Skill.command** from that installed package; it keeps the existing Codex installation and links Claude Code to it.

Ask: **“Use OAIA Studio to generate one high-quality portrait in the Product Photos studio using these two reference images. Save the original PNG and its prompt/settings in this folder.”** Include any project-specific artwork rules and approval requirements in the request.

The skill validates and records each request before submitting it once. It can resume status checks after interruption without repeating a paid call. It verifies the original PNG's actual dimensions and hash, preserves prompt/settings, and respects requested approval gates. Skills use the same API key and credits as the browser. Installing or testing the skill offline does not generate images.

## Terminal commands and source package

From this folder, with Node available:

```sh
npm start
npm run manage
node scripts/launch.mjs open "Product Photos"
node scripts/launch.mjs open "Course Ideas" --no-open
node scripts/launch.mjs list
node scripts/launch.mjs stop "Course Ideas"
node scripts/launch.mjs restart "Product Photos"
npm test
npm run package
```

`npm run package` writes **`dist/oaia-studio.zip`**. The package uses an explicit allowlist: application source, browser files, scripts, tests, documentation, packaged skills, Finder launchers, README, package metadata, and Git ignore rules. It excludes `.runtime`, image outputs, environment files, dependencies, and existing release archives. It rejects symlinks, unexpected file types, and likely credentials in included files without printing secret values. This is an extra check, not a substitute for reviewing new files before sharing.

ZIP entry order, timestamps, permissions, and compression settings are fixed so unchanged inputs reproduce the same bytes with the same Python/zlib runtime. The ZIP is a source package; it includes no Node or Python runtime. It also excludes original task specifications and planning history. No GitHub account or upload is required to run the downloaded app.

## Verification and limitations

The offline tests use temporary image folders, fake credentials, and local test servers. They cover generation safeguards, reference handling, selected downloads, LAN restrictions, independent histories, simultaneous startup, unrelated port listeners, instance identity, safe stop/restart, runtime discovery, and release exclusions. They do not make paid API calls.

The original live setup verified native landscape output and a matching browser download. Subsequent project work verified reference edits at 1328 × 2880. These are historical checks of that account, not guarantees for a new account or a future API version.

Known limits: macOS only; IPv4 LAN only; no login screen; no live balance or spending cap; no automatic launch at login; no studio rename/delete UI; no browser editor for prepared selections. PNG inputs receive integrity validation, while JPEG/WebP validation checks signatures rather than fully decoding them. Damaged JPEG/WebP inputs may be rejected by OpenAI rather than locally. Runtime portability is tested with controlled paths; this release has not been tested on a separate physical Mac.
