const MANAGE_URL = "/api/manage";

export interface AuthState {
  user_id: string;
  password: string;
  is_admin: boolean;
}

const AUTH_KEY = "xsearchs_auth";

export function getAuth(): AuthState | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setAuth(auth: AuthState): void {
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
}

export function clearAuth(): void {
  localStorage.removeItem(AUTH_KEY);
}

export function getAuthHeader(): string {
  const auth = getAuth();
  if (!auth) return "";
  return "Basic " + btoa(`${auth.user_id}:${auth.password}`);
}

interface LoginResult {
  user_id: string;
  is_admin?: boolean;
  need_set_password?: boolean;
}

export async function login(
  id: string,
  password: string
): Promise<LoginResult> {
  const resp = await fetch(`${MANAGE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, password }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.detail || err.error || "Login failed");
  }
  return resp.json();
}

export async function setPassword(newPassword: string): Promise<void> {
  const resp = await fetch(`${MANAGE_URL}/auth/set-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getAuthHeader(),
    },
    body: JSON.stringify({ new_password: newPassword }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.detail || err.error || "Failed to set password");
  }
}

export async function changePassword(
  oldPassword: string,
  newPassword: string
): Promise<void> {
  const resp = await fetch(`${MANAGE_URL}/auth/change-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getAuthHeader(),
    },
    body: JSON.stringify({
      old_password: oldPassword,
      new_password: newPassword,
    }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.detail || err.error || "Failed to change password");
  }
}

export async function verifyAuth(): Promise<{
  valid: boolean;
  user_id: string;
  is_admin: boolean;
} | null> {
  try {
    const resp = await fetch(`${MANAGE_URL}/auth/verify`, {
      headers: { Authorization: getAuthHeader() },
    });
    if (!resp.ok) return null;
    return resp.json();
  } catch {
    return null;
  }
}

export { MANAGE_URL };
