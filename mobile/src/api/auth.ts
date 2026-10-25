import { apiClient, storeToken, removeToken } from "./client";
import { User } from "../types";

export interface AuthResponse {
  success: boolean;
  user: User;
  token: string;
}

export async function loginApi(email: string, password: string): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>("/auth/login", { email, password });
  if (response.data.token) {
    await storeToken(response.data.token);
  }
  return response.data;
}

export async function signupApi(
  name: string,
  email: string,
  password: string,
  area: string
): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>("/auth/signup", {
    name,
    email,
    password,
    area,
  });
  if (response.data.token) {
    await storeToken(response.data.token);
  }
  return response.data;
}

export async function getMeApi(): Promise<User> {
  const response = await apiClient.get<{ success: boolean; user: User }>("/auth/me");
  return response.data.user;
}

export async function logoutApi(): Promise<void> {
  await removeToken();
}
