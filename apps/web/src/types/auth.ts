/** Lustro `AuthenticatedUser`/`AuthTokensEntity` z `apps/api` (JWT payload dekodowany po stronie klienta jest NIEZAUFANY do autoryzacji UI — tylko do renderowania; twarde egzekwowanie zawsze po stronie API, RBAC.md §4). */
export interface AuthenticatedUser {
  userId: string;
  companyId: string;
  shopId: string | null;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  permissions: string[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
