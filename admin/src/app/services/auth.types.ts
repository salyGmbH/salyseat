export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthUser {
  email: string;
  roles: string[];
  tenantId: string | null;
}

export interface LoginResponse {
  token: string;
  expiresIn: number;
  user: AuthUser;
}