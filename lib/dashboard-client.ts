const TOKEN_KEY = "trackit-support-token";

export function getApiBase(): string {
  return (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/$/, "");
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = getApiBase();
  const token = getStoredToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  return fetch(`${base}${path}`, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
  });
}

export async function checkDashboardSession(): Promise<boolean> {
  try {
    const res = await apiFetch("/api/auth/dashboard/session");
    if (!res.ok) return false;
    const body = await res.json();
    if (body.token) setStoredToken(body.token);
    return Boolean(body.authenticated);
  } catch {
    return false;
  }
}

export async function loginDashboard(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const base = getApiBase();
  try {
    const res = await fetch(`${base}/api/auth/dashboard/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: body.error ?? "Invalid email or password" };
    }
    if (body.token) setStoredToken(body.token);
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not reach the server" };
  }
}

export async function logoutDashboard(): Promise<void> {
  clearStoredToken();
  try {
    await apiFetch("/api/auth/dashboard/logout", { method: "POST" });
  } catch {
    /* ignore */
  }
}

export function handleUnauthorized(onLogout: () => void, res: Response): boolean {
  if (res.status === 401) {
    clearStoredToken();
    onLogout();
    return true;
  }
  return false;
}
