/** Zawartość podpisanego JWT (access token). Odświeżany token niesie wyłącznie `sub`+`jti`+`type`. */
export interface JwtAccessPayload {
  sub: string; // User.id
  email: string;
  companyId: string;
  shopId: string | null;
  roles: string[];
  permissions: string[];
  type: 'access';
}

export interface JwtRefreshPayload {
  sub: string;
  /** Unikalny identyfikator WYDANIA tokenu (nie samego tokenu) — porównywany z Redis allowlist (`RefreshTokenStoreService`), umożliwia rotację/rewokację. */
  jti: string;
  type: 'refresh';
}

/** Zwracane przez `JwtRefreshStrategy.validate()` po weryfikacji podpisu, typu i allowlisty — `request.user` na trasach za `RefreshTokenGuard`. */
export interface RefreshTokenContext {
  userId: string;
  jti: string;
}
