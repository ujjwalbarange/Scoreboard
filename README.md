# Esports Broadcast Controller & Live Overlay System

Production-oriented dual-window **Electron.js + React + Vite** desktop application for live **BGMI (Battlegrounds Mobile India)** and **Free Fire** esports tournaments.

## Architecture Overview

1. **Operator Control Deck (`index.html` → `src/control-deck/main.jsx`)**:
   - Interactive tournament operator console (`1440×900`) featuring A–Z keyboard team selection, `+1`/`-1` kill-point hotkeys (`=`/`+` and `-`/`_`), direct placement entry (`0`–`26` + `Enter`) with deterministic placement collision cascading, global Undo (`Ctrl+Z`), inline roster editing, and atomic 10-column CSV persistence.
2. **Broadcast Overlay Viewport (`overlay.html` → `src/overlay-viewport/main.jsx`)**:
   - Independent frameless, transparent (`#00000000`), always-on-top Electron window (`460×680`) designed for **OBS Studio Window Capture** with real-time IPC synchronization.
3. **Authoritative Main-Process Match Engine (`electron/match/*` & `electron/ipc/handlers.js`)**:
   - Single source of truth for BGMI and Free Fire scoring rules, placement collision resolution, undo history, and debounced external CSV file watching.
   - Separates immutable bundled templates (`resources/templates/template_bgmi.csv`, `resources/templates/template_ff.csv`, `resources/tournament_config.json`) from writable user tournament files stored in Electron's `app.getPath('userData')` (`%APPDATA%\Esports Broadcast Controller\matches` on Windows).

---

## Local Development & Packaging Commands

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the Express + Vite preview server on `http://localhost:3000` |
| `npm run electron:dev` | Launches the dual-window Electron app connected to `http://localhost:3000` |
| `npm run build` | Builds both React entry points (`dist/index.html` and `dist/overlay.html`) |
| `npm run lint` | Runs TypeScript typechecking (`tsc --noEmit`) |
| `npm test` | Runs Phase 1, Phase 2, and packaging unit tests via `tsx --test` |
| `npm run pack:check` | Validates lockfiles, `electron-builder.json`, templates, and `dist/` outputs |
| `npm run dist:win` | Builds the frontend, runs pre-pack validation, and packages Windows x64 NSIS + Portable `.exe` into `dist-release/` |
| `npm run dist:win:nsis` | Builds only the Windows x64 NSIS Setup installer `.exe` |
| `npm run dist:win:portable` | Builds only the Windows x64 Portable `.exe` |

---

## Building Windows EXE with GitHub Actions

This repository includes an automated GitHub Actions CI/CD workflow at `.github/workflows/build-windows.yml` (**`Build Windows EXE & Release`**) that compiles the React/Vite dual-window frontend and packages Windows x64 `.exe` executables on a `windows-latest` runner—without requiring a local Windows build environment.

### 1. How to Push the Project to GitHub

From your project root directory, initialize Git (if not already initialized), commit all files, and push to your GitHub repository's `main` branch:

```bash
git init
git branch -M main
git add .
git commit -m "Configure Phase 2 Match Engine and Windows EXE GitHub Actions CI/CD"
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/<YOUR_REPO_NAME>.git
git push -u origin main
```

### 2. How to Open the Actions Tab

1. Open your repository on GitHub (`https://github.com/<YOUR_GITHUB_USERNAME>/<YOUR_REPO_NAME>`).
2. Click the **Actions** tab in the top navigation bar.
3. In the left sidebar under **Workflows**, select **`Build Windows EXE & Release`**.
   - Every push or pull request targeting `main` (or `master`) automatically triggers a build.

### 3. How to Run the Workflow Manually

You can trigger a fresh Windows `.exe` build at any time without pushing a new commit:

1. Go to the **Actions** tab in your GitHub repository.
2. Click **`Build Windows EXE & Release`** in the left sidebar.
3. Click the **Run workflow** dropdown button on the right side of the banner.
4. Select your branch (`main`), optionally enter a note in *Optional note for this manual Windows EXE build*, and click the green **Run workflow** button.

### 4. How to Inspect a Failed Build

If a workflow run shows a red `X`:

1. Click on the failed workflow run title in the **Actions** list.
2. Click the **`Build & Verify Windows x64 Installer (.exe)`** job card.
3. Expand the failed step to read the detailed diagnostic output:
   - **`Run TypeScript typecheck (lint)`**: Reports any TypeScript syntax or type mismatches.
   - **`Run automated unit & packaging tests`**: Shows exact assertion failures from `ipcValidator.test.ts`, `phase2Engine.test.ts`, or `packagingConfig.test.ts`.
   - **`Validate packaging configuration and frontend build artifacts`**: Runs `scripts/validate-packaging.js` and lists any missing entry points, missing templates, or invalid `electron-builder.json` fields.
   - **`Verify generated .exe installers and write build-info metadata`**: Fails with a clear diagnostic if `dist-release/` is missing or no `.exe` was produced.

### 5. How to Download the `.exe` from Workflow Artifacts

Once the **`Build & Verify Windows x64 Installer (.exe)`** job finishes with a green checkmark:

1. Click on the completed workflow run in the **Actions** tab.
2. Scroll down to the **Artifacts** section at the bottom of the run summary page.
3. Click **`esports-broadcast-controller-windows-x64`** to download the `.zip` archive (retained for 14 days).
4. Extract the downloaded `.zip` archive on your Windows PC. Inside you will find:
   - **`Esports-Broadcast-Controller-Setup-1.0.0-x64.exe`**: Full Windows NSIS Setup installer.
   - **`Esports-Broadcast-Controller-Portable-1.0.0-x64.exe`**: Standalone portable executable (runs directly without installation).
   - **`BUILD_INFO.txt` & `build-info.json`**: Build metadata including package version, Git commit SHA, timestamp, and file sizes.

### 6. How to Install and Launch the Application

1. Double-click **`Esports-Broadcast-Controller-Setup-1.0.0-x64.exe`** (or launch the `Portable` `.exe` directly).
2. In the NSIS Setup wizard:
   - Choose your preferred installation directory (defaults to `%LOCALAPPDATA%\Programs\Esports Broadcast Controller`—no administrator privileges required).
   - Click **Install** to create the Start Menu and Desktop shortcuts (**`Esports Broadcast Controller`**).
3. Launch **Esports Broadcast Controller** from your Desktop or Start Menu:
   - Both the **Operator Control Deck** (`1440×900`) and the **Broadcast Overlay Viewport** (`460×680` frameless, transparent, always-on-top window) will open automatically from the bundled local files without needing a Vite server.
   - Writable tournament match CSV files (`Match_01_BGMI.csv`, `Match_01_FF.csv`, etc.) and `.match_meta.json` are stored safely in:
     ```text
     C:\Users\<YourUsername>\AppData\Roaming\Esports Broadcast Controller\matches\
     ```
   - Installing a newer version or reinstalling the app **will not delete** your saved match CSV files.

### 7. How to Create a Version Tag to Publish a GitHub Release

The workflow includes an automated **`Publish GitHub Release (Version Tags v*.*.*)`** job that creates a permanent GitHub Release and attaches the `.exe` installers whenever you push a semantic version tag starting with `v`:

```bash
git tag v1.0.0
git push origin v1.0.0
```

When the workflow completes, open the **Releases** section on the right sidebar of your GitHub repository to download `Esports-Broadcast-Controller-Setup-1.0.0-x64.exe` and `Esports-Broadcast-Controller-Portable-1.0.0-x64.exe` directly from the published release page.

### 8. Why an Unsigned Installer May Display a Windows Security Warning

By default, the GitHub Actions workflow builds the `.exe` with `CSC_IDENTITY_AUTO_DISCOVERY=false` (unsigned) so that builds succeed out-of-the-box without requiring a paid Windows Code Signing Certificate.

Because the binary is not digitally signed with an Authenticode certificate:
- **Windows Defender SmartScreen** may show a blue prompt stating **"Windows protected your PC — Microsoft Defender SmartScreen prevented an unrecognized app from starting."**
- To run the installer: click **More info** and then click **Run anyway**.

#### Optional: Adding a Custom Windows Icon or Code Signing Later
- **Custom Application Icon**: No custom `.ico` file is required by default. To add one later, place a valid `256×256` Windows icon at `assets/icon.ico` and add `"icon": "assets/icon.ico"` under the `"win"` section in `electron-builder.json`.
- **Code Signing**: If you acquire a Windows `.pfx` certificate later, store the base64-encoded certificate in GitHub Actions Secrets (`CSC_LINK` and `CSC_KEY_PASSWORD`)—never commit certificates or private keys to the repository.
