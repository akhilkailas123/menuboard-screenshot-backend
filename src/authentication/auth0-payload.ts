/* eslint-disable @typescript-eslint/naming-convention */
export interface OrganizationClaim {
  app_roles: string[]; // Adjust to `any[]` if roles contain objects
  org_id: string;
  org_name: string;
}

export interface Auth0JwtPayload {
  sub: string;
  name?: string;
  email?: string;
  iss?: string;
  aud?: string | string[];
  iat?: number;
  exp?: number;
  scope?: string;
  azp?: string;
  permissions?: string[];
  'https://www.inreality.com/claims/email'?: string;
  organizations?: OrganizationClaim[];
  ir_account_id?: string;
  organization_id?: string;
  ir_role_id?: string;

  [key: string]: unknown; // for any additional claims
}