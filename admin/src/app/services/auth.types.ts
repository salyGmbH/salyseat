export interface LoginRequest {
  email: string;
  password: string;
}

export type TenantPlan = 'trial' | 'starter' | 'professional' | 'enterprise';

export interface AuthUser {
  email: string;
  roles: string[];
  tenantId: string | null;
  plan: TenantPlan;
}

export interface LoginResponse {
  token: string;
  expiresIn: number;
  user: AuthUser;
}
