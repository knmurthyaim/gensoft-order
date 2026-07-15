# GenSoft Android app (background location)

## Important limit

A **website / PWA cannot read GPS after you fully close it**.  
Phone OS blocks that for security.

What works today:

| Mode | GPS while phone locked / app minimized | Upload without opening map |
|------|----------------------------------------|----------------------------|
| Browser / PWA | Only while GenSoft page is still in memory | Queued points upload when network returns (service worker) |
| **Android APK (Capacitor)** | Yes — background notification tracking | Yes — saves on phone, syncs when online |

## Build APK (developer)

```bash
cd frontend
npm install
npx cap add android
npm run cap:android
```

In Android Studio generate a signed APK, install on the rep phone, and set:

- Location permission → **Allow all the time**
- Battery → **Unrestricted** for GenSoft

Background tracking then continues without opening the app; points sync to cloud when the phone has internet.
