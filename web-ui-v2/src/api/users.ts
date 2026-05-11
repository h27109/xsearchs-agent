import { MANAGE_URL } from "./auth";

export interface UserInfo {
  id: string;
  is_admin: boolean;
  is_active: boolean;
}

export async function listUsers(token: string): Promise<UserInfo[]> {
  const resp = await fetch(`${MANAGE_URL}/users`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error("Failed to fetch users");
  const data = await resp.json();
  return data.users || [];
}

export async function createUser(token: string, id: string): Promise<void> {
  const resp = await fetch(`${MANAGE_URL}/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ id }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || "Failed to create user");
  }
}

export async function updateUser(
  token: string,
  userId: string,
  fields: { is_admin?: boolean; is_active?: boolean }
): Promise<void> {
  const resp = await fetch(`${MANAGE_URL}/users/${userId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(fields),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || "Failed to update user");
  }
}

export async function resetUserPassword(
  token: string,
  userId: string
): Promise<void> {
  const resp = await fetch(`${MANAGE_URL}/users/${userId}/reset-password`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error("Failed to reset password");
}
