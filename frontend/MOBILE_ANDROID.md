# GenSoft Android app (background location)

## Important limit

A **website / PWA cannot read GPS after you fully close it**.  
Phone OS blocks that for security.

What works today:

| Mode | GPS while phone locked / app minimized | Upload without opening map |
|------|----------------------------------------|----------------------------|
| Browser / PWA | Only while GenSoft page is still in memory | Queued points upload when network returns (service worker) |
| **Android APK (Capacitor)** | Yes — background notification tracking | Yes — saves on phone, syncs when online |

## Download for sales reps

The built APK is published with the website as:

`https://gensoft-order-1.onrender.com/gensoft.apk`

A **Download Android app** link is also on the login page.

After install:

1. Location permission → **Allow all the time**
2. Battery → **Unrestricted** for GenSoft
3. Log in as the sales rep — background tracking starts automatically when the distributor has tracking enabled.

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

After a rep logs in, a native foreground service continues tracking when the app
is minimized, the screen is locked, or the app is swiped away. It shows a
persistent Android notification, queues points when offline, resumes after a
phone restart, and stops on logout or when distributor tracking is disabled.

Android **Force stop**, revoked location permission, disabled GPS, uninstalling
the app, or some manufacturer battery killers will stop tracking. Set Battery
usage to **Unrestricted** and allow the app to auto-start on Oppo/Vivo/Xiaomi/
Realme phones.

The `frontend/android/` Capacitor project is already in the repo — do not run `npx cap add android` again unless you remove that folder.
