import { createContext, useContext, useEffect, useState } from "react";
import { auth, setUnauthorizedHandler, tokenStore } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [account, setAccount] = useState(null);
  const [salesRep, setSalesRep] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadMe = async () => {
    try {
      const data = await auth.me();
      setUser(data.user);
      setAccount(data.account);
      setSalesRep(data.sales_rep || null);
    } catch {
      setUser(null);
      setAccount(null);
      setSalesRep(null);
      tokenStore.clear();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setUnauthorizedHandler(() => {
      tokenStore.clear();
      setUser(null);
      setAccount(null);
      setSalesRep(null);
    });
    if (tokenStore.get()) {
      loadMe();
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (username, password) => {
    const { access_token } = await auth.login(username, password);
    tokenStore.set(access_token);
    await loadMe();
  };

  const logout = () => {
    tokenStore.clear();
    setUser(null);
    setAccount(null);
    setSalesRep(null);
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
