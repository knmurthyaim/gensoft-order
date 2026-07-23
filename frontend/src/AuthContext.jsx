import { createContext, useContext, useEffect, useState } from "react";
import { auth, setUnauthorizedHandler, tokenStore } from "./api";
import { stopPersistentRepTracking } from "./persistentRepTracking";

const AuthContext = createContext(null);
const SESSION_CACHE_KEY = "gensoft_session_cache";

function clearSessionCache() {
  try {
    localStorage.removeItem(SESSION_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

function readSessionCache() {
  try {
    const raw = localStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data?.user ? data : null;
  } catch {
    return null;
  }
}

function writeSessionCache(data) {
  try {
    localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [account, setAccount] = useState(null);
  const [salesRep, setSalesRep] = useState(null);
  const [loading, setLoading] = useState(true);

  const applySession = (data) => {
    setUser(data.user);
    setAccount(data.account);
    setSalesRep(data.sales_rep || null);
  };

  const clearSession = () => {
    setUser(null);
    setAccount(null);
    setSalesRep(null);
    tokenStore.clear();
    clearSessionCache();
  };

  const loadMe = async () => {
    try {
      const data = await auth.me();
      applySession(data);
      writeSessionCache(data);
    } catch (err) {
      // Only a real auth failure ends the session. Network / cold-start /
      // 5xx must NOT force the rep back to the login screen.
      if (err?.response?.status === 401) {
        clearSession();
      } else {
        const cached = readSessionCache();
        if (cached) applySession(cached);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setUnauthorizedHandler((error) => {
      // Ignore 401 from background location sync — native service uses its
      // own long-lived tracking token; don't kick the rep out of the app.
      const url = String(error?.config?.url || "");
      if (
        url.includes("/auth/login") ||
        url.includes("/rep/location") ||
        url.includes("/rep/tracking-token") ||
        url.includes("/rep/location-config")
      ) {
        return;
      }
      clearSession();
      try {
        localStorage.setItem("gensoft_rep_track_enabled", "0");
      } catch {
        /* ignore */
      }
      // Do not stop persistent Android tracking here — only explicit Logout
      // should. A transient API 401 must not kill GPS sharing.
    });
    if (tokenStore.get()) {
      // Show last-known session immediately while /auth/me loads (offline-safe).
      const cached = readSessionCache();
      if (cached) {
        applySession(cached);
        setLoading(false);
      }
      loadMe();
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (username, password) => {
    const { access_token } = await auth.login(username, password);
    tokenStore.set(access_token);
    setLoading(true);
    await loadMe();
  };

  const logout = () => {
    // Clear session first so UI always returns to login even if native
    // tracking stop is slow or hangs.
    clearSession();
    try {
      localStorage.setItem("gensoft_rep_track_enabled", "0");
    } catch {
      /* ignore */
    }
    stopPersistentRepTracking();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        account,
        salesRep,
        loading,
        login,
        logout,
        refresh: loadMe,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
