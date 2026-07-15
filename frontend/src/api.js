import axios from "axios";

export function getApiBase() {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  // Native Cap App has no Vite proxy — use live API
  try {
    if (window.Capacitor?.isNativePlatform?.()) {
      return "https://gensoft-order.onrender.com/api";
    }
  } catch {
    /* ignore */
  }
  const { hostname, protocol } = window.location;
  // Render static site gensoft-order-1 → API service gensoft-order
  if (hostname.endsWith(".onrender.com") && hostname.includes("-1.")) {
    const apiHost = hostname.replace("-1.", ".");
    return `${protocol}//${apiHost}/api`;
  }
  return "/api";
}

const api = axios.create({
  baseURL: getApiBase(),
  headers: { "Content-Type": "application/json" },
});

const TOKEN_KEY = "gensoft_token";

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

api.interceptors.request.use((config) => {
  const t = tokenStore.get();
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

let onUnauthorized = null;
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && onUnauthorized) onUnauthorized();
    return Promise.reject(err);
  }
);

function crud(resource) {
  return {
    list: (params) => api.get(`/${resource}`, { params }).then((r) => r.data),
    get: (id) => api.get(`/${resource}/${id}`).then((r) => r.data),
    create: (data) => api.post(`/${resource}`, data).then((r) => r.data),
    update: (id, data) =>
      api.put(`/${resource}/${id}`, data).then((r) => r.data),
    remove: (id) => api.delete(`/${resource}/${id}`),
  };
}

// Auth
export const auth = {
  login: (username, password) =>
    api.post("/auth/login", { username, password }).then((r) => r.data),
  me: () => api.get("/auth/me").then((r) => r.data),
  changePassword: (current_password, new_password) =>
    api
      .post("/auth/change-password", { current_password, new_password })
      .then((r) => r.data),
};

function downloadBlob(r, filename) {
  const url = window.URL.createObjectURL(new Blob([r.data]));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

function uploadExcelFile(url, file) {
  const fd = new FormData();
  fd.append("file", file);
  return api
    .post(url, fd, { headers: { "Content-Type": "multipart/form-data" } })
    .then((r) => r.data);
}

function makeUploadApi(basePath, templateFilename) {
  return {
    downloadTemplate: () =>
      api
        .get(`${basePath}/upload/template`, { responseType: "blob" })
        .then((r) => downloadBlob(r, templateFilename)),
    uploadExcel: (file) => uploadExcelFile(`${basePath}/upload/excel`, file),
    uploadJson: (data) => api.post(`${basePath}/upload`, data).then((r) => r.data),
  };
}
export const admin = {
  listAccounts: () => api.get("/admin/accounts").then((r) => r.data),
  getAccount: (id) => api.get(`/admin/accounts/${id}`).then((r) => r.data),
  createAccount: (data) =>
    api.post("/admin/accounts", data).then((r) => r.data),
  updateAccount: (id, data) =>
    api.put(`/admin/accounts/${id}`, data).then((r) => r.data),
  updateUser: (id, data) =>
    api.put(`/admin/users/${id}`, data).then((r) => r.data),
  downloadTemplate: () =>
    api
      .get("/admin/accounts/upload/template", { responseType: "blob" })
      .then((r) => downloadBlob(r, "gensoft_users_template.xlsx")),
  uploadExcel: (file) => uploadExcelFile("/admin/accounts/upload", file),
};

// Account / directory / dashboard
export const account = {
  get: () => api.get("/account").then((r) => r.data),
  update: (data) => api.put("/account", data).then((r) => r.data),
};
export const getDirectory = (params) =>
  api.get("/directory", { params }).then((r) => r.data);
export const getDashboard = () => api.get("/dashboard").then((r) => r.data);

// Scoped resources
export const products = {
  ...crud("products"),
  ...makeUploadApi("/products", "gensoft_products_stock_template.xlsx"),
};
export const salesReps = {
  ...crud("sales-reps"),
  locationsLatest: () =>
    api.get("/sales-reps/locations/latest").then((r) => r.data),
  locationTrail: (repId, params = {}) =>
    api
      .get(`/sales-reps/${repId}/locations`, { params })
      .then((r) => r.data),
};
export const batches = crud("batches");

export const parties = {
  ...crud("parties"),
  link: (id, linkedAccountId) =>
    api
      .patch(`/parties/${id}/link`, { linked_account_id: linkedAccountId })
      .then((r) => r.data),
  clearLocation: (id) =>
    api.delete(`/parties/${id}/location`).then((r) => r.data),
  ...makeUploadApi("/parties", "gensoft_customers_template.xlsx"),
};

export const connections = {
  outgoing: () => api.get("/connections/outgoing").then((r) => r.data),
  incoming: () => api.get("/connections/incoming").then((r) => r.data),
  request: (supplierAccountId) =>
    api
      .post("/connections", { supplier_account_id: supplierAccountId })
      .then((r) => r.data),
  respond: (id, status) =>
    api
      .patch(`/connections/${id}/respond`, { status })
      .then((r) => r.data),
};

export const marketplace = {
  /** Search one supplier catalog — does not load full product list. */
  catalog: (supplierAccountId, params = {}) =>
    api
      .get(`/marketplace/suppliers/${supplierAccountId}/catalog`, { params })
      .then((r) => r.data),
  /** Search product across all connected distributors. */
  searchProducts: (params = {}) =>
    api.get(`/marketplace/products/search`, { params }).then((r) => r.data),
};

export const repApi = {
  customers: (params) =>
    api.get("/rep/customers", { params }).then((r) => r.data),
  customer: (partyId) =>
    api.get(`/rep/customers/${partyId}`).then((r) => r.data),
  tagCustomerLocation: (partyId, data) =>
    api.post(`/rep/customers/${partyId}/location`, data).then((r) => r.data),
  catalog: (params) =>
    api.get("/rep/catalog", { params }).then((r) => r.data),
  stock: (params) =>
    api.get("/rep/stock", { params }).then((r) => r.data),
  outstanding: (params) =>
    api.get("/rep/outstanding", { params }).then((r) => r.data),
  locationConfig: () =>
    api.get("/rep/location-config").then((r) => r.data),
  postLocation: (data) =>
    api.post("/rep/location", data).then((r) => r.data),
  postLocationBatch: (data) =>
    api.post("/rep/location/batch", data).then((r) => r.data),
  createOrder: (data) =>
    api.post("/rep/orders", data).then((r) => r.data),
  orders: () => api.get("/rep/orders").then((r) => r.data),
};

export const settings = {
  get: () => api.get("/settings").then((r) => r.data),
  update: (data) => api.put("/settings", data).then((r) => r.data),
};

export const outstanding = {
  list: (params) => api.get("/outstanding", { params }).then((r) => r.data),
  ...makeUploadApi("/outstanding", "gensoft_outstanding_template.xlsx"),
};

export const orders = {
  ...crud("orders"),
  list: (params) => api.get("/orders", { params }).then((r) => r.data),
  summary: (params) =>
    api.get("/orders/summary", { params }).then((r) => r.data),
  updateStatus: (id, status, remarks) =>
    api
      .patch(`/orders/${id}/status`, { status, remarks: remarks || null })
      .then((r) => r.data),
};

export default api;
