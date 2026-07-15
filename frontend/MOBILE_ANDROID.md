# GenSoft Android app (background location)

## Important limit

A **website / PWA cannot read GPS after you fully close it**.  
Phone OS blocks that for security.

What works today:

| Mode | GPS while phone locked / app minimized | Upload without opening map |
|------|----------------------------------------|----------------------------|
| Browser / PWA | Only while GenSoft page is still in memory | Queued points upload when network returns (service worker) |
| **Android APK (Capacitor)** | Yes — background notification tracking | Yes — saves on phone, syncs when online |

## Build / open project (developer PC)

Requires **Android Studio** (includes JDK) on this machine.

```bash
cd frontend
npm install
npm run cap:android
```

That builds the web UI into the Cap project and opens Android Studio.

Then in Android Studio:

1. **Build → Generate Signed Bundle / APK** (or Run on a connected phone)
2. Install on the sales-rep phone
3. Location permission → **Allow all the time**
4. Battery → **Unrestricted** for GenSoft

Background tracking then continues without opening the app; points sync to cloud when the phone has internet.

The `frontend/android/` Capacitor project is already in the repo — do not run `npx cap add android` again unless you remove that folder.
