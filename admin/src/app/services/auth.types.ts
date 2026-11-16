export interface LoginRequest {
  email: string;
  password: string;
}

export type Plan = 'tisch' | 'menu' | 'maitre';

export interface AuthUser {
  email: string;
  roles: string[];
  tenantId: string | null;
  plan: Plan;
  addons: string[];
}

export interface LoginResponse {
  token: string;
  expiresIn: number;
  user: AuthUser;
}
