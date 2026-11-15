// Identity settings shared by the server and the screens (api/src/lib/identity.ts).

/** Who must use a second step (an authenticator app or a passkey) after the emailed link. */
export const SECOND_STEP_POLICIES = ['off', 'admins', 'everyone'] as const;
export type SecondStepPolicy = (typeof SECOND_STEP_POLICIES)[number];

export type SecondStepMethod = 'totp' | 'passkey' | 'recovery';

/** The signed-in person's own sign-in security (GET /me/security). */
export interface MySecurity {
  totp: boolean;
  passkeys: { id: string; name: string; createdAt: string; lastUsedAt: string | null }[];
  recoveryLeft: number;
  /** The company requires a second step of this person. */
  required: boolean;
  policy: SecondStepPolicy;
}

/** One person's sign-in security, for administrators (GET /admin/security). */
export interface PersonSecurity {
  id: string;
  name: string;
  email: string;
  totp: boolean;
  passkeys: number;
  admin: boolean;
}

/** The answer of a sign-in step when a second step is needed. */
export interface SecondStepNeeded {
  status: 'second_step';
  token: string;
  methods: SecondStepMethod[];
  /** No second step yet, and the company requires one: set one up now. */
  enroll: boolean;
}
