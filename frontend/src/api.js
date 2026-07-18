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

function uploadExcelFile(url, file, replaceAll = false) {
  const fd = new FormData();
  fd.append("file", file);
  const fullUrl = replaceAll ? `${url}?replace_all=true` : url;
  return api
    .post(fullUrl, fd, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 30 * 60 * 1000,
    })
    .then((r) => r.data);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Enqueue Excel on async sync API and poll until done (keeps site responsive). */
async function uploadExcelAsync(uploadType, file, replaceAll = false) {
  const fd = new FormData();
  fd.append("file", file);
  const params = {
    upload_type: uploadType,
    replace_all: replaceAll ? "true" : "false",
  };
  const accepted = await api
    .post("/sync/upload/excel", fd, {
      params,
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 5 * 60 * 1000,
    })
    .then((r) => r.data);
  const jobId = accepted.job_id;
  if (!jobId) throw new Error("Upload accepted but no job_id returned");

  const deadline = Date.now() + 30 * 60 * 1000;
  while (Date.now() < deadline) {
    const status = await api
      .get(`/sync/jobs/${jobId}`, { timeout: 60 * 1000 })
      .then((r) => r.data);
    if (status.status === "completed") return status;
    if (status.status === "failed") {
      throw new Error(status.error || `Sync job #${jobId} failed`);
    }
    await sleep(2000);
  }
  throw new Error(`Sync job #${jobId} timed out — check later`);
}

function makeUploadApi(basePath, templateFilename, syncType = null) {
  return {
    downloadTemplate: () =>
      api
        .get(`${basePath}/upload/template`, { responseType: "blob" })
        .then((r) => downloadBlob(r, templateFilename)),
    uploadExcel: (file, replaceAll = false) =>
      syncType
        ? uploadExcelAsync(syncType, file, replaceAll)
        : uploadExcelFile(`${basePath}/upload/excel`, file, replaceAll),
    uploadJson: (data) => api.post(`${basePath}/upload`, data).then((r) => r.data),
  };
}
export const admin = {
  listAccounts: (search) =>
    api
      .get("/admin/accounts", { params: search ? { search } : {} })
      .then((r) => r.data),
  getAccount: (id) => api.get(`/admin/accounts/${id}`).then((r) => r.data),
  createAccount: (data) =>
    api.post("/admin/accounts", data).then((r) => r.data),
  updateAccount: (id, data) =>
    api.put(`/admin/accounts/${id}`, data).then((r) => r.data),
  deleteAccount: (id) =>
    api.delete(`/admin/accounts/${id}`).then((r) => r.data),
  updateUser: (id, data) =>
    api.put(`/admin/users/${id}`, data).then((r) => r.data),
  dataSummary: (id) =>
    api.get(`/admin/accounts/${id}/data-summary`).then((r) => r.data),
  listProducts: (id, search) =>
    api
      .get(`/admin/accounts/${id}/products`, {
        params: search ? { search } : {},
      })
      .then((r) => r.data),
  listParties: (id, search) =>
    api
      .get(`/admin/accounts/${id}/parties`, {
        params: search ? { search } : {},
      })
      .then((r) => r.data),
  listOutstanding: (id, search) =>
    api
      .get(`/admin/accounts/${id}/outstanding`, {
        params: search ? { search } : {},
      })
      .then((r) => r.data),
  clearProducts: (id) =>
    api.delete(`/admin/accounts/${id}/products`).then((r) => r.data),
  clearParties: (id) =>
    api.delete(`/admin/accounts/${id}/parties`).then((r) => r.data),
  clearOutstanding: (id) =>
    api.delete(`/admin/accounts/${id}/outstanding`).then((r) => r.data),
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
  ...makeUploadApi("/products", "gensoft_products_stock_template.xlsx", "products"),
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
  ...makeUploadApi("/parties", "gensoft_customers_template.xlsx", "customers"),
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
  ...makeUploadApi("/outstanding", "gensoft_outstanding_template.xlsx", "outstanding"),
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
