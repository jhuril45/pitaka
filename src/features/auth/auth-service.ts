import { Parse } from '@/parse/init';
import { clearSyncState } from '@/sync/session';

/**
 * Accounts are Back4App (Parse) users. The email doubles as the username and
 * Back4App stores the password hash; the Parse SDK keeps the session locally,
 * so a signed-in user can open the app offline.
 */

export const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface Account {
  id: string;
  name: string;
  email: string;
}

export type AuthStatus = { status: 'signed-out' } | { status: 'account'; account: Account };

export class AuthError extends Error {}

function toAccount(user: Parse.User): Account {
  return {
    id: user.id ?? '',
    name: (user.get('name') as string | undefined) ?? '',
    email: user.getEmail() ?? user.getUsername() ?? '',
  };
}

/** Turns Parse errors into messages the forms can show. */
function friendly(error: unknown, fallback: string): Error {
  if (!(error instanceof Parse.Error)) return error instanceof Error ? error : new AuthError(fallback);
  switch (error.code) {
    case Parse.Error.OBJECT_NOT_FOUND:
      // Same message for unknown email and wrong password, so the form doesn't
      // reveal which emails have accounts.
      return new AuthError('Incorrect email or password.');
    case Parse.Error.USERNAME_TAKEN:
    case Parse.Error.EMAIL_TAKEN:
      return new AuthError('An account with this email already exists.');
    case Parse.Error.INVALID_EMAIL_ADDRESS:
      return new AuthError('Please enter a valid email.');
    case Parse.Error.CONNECTION_FAILED:
      return new AuthError('No internet connection. Please try again when you’re online.');
    default:
      return new AuthError(error.message || fallback);
  }
}

function cleanEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Restore the previous session on launch. Works offline: nothing here needs the server. */
export async function restore(): Promise<AuthStatus> {
  const current = await Parse.User.currentAsync();
  if (!current) return { status: 'signed-out' };
  if (Parse.AnonymousUtils.isLinked(current)) {
    // Left over from the earlier guest mode; accounts are required now.
    await Parse.User.logOut().catch(() => undefined);
    return { status: 'signed-out' };
  }
  return { status: 'account', account: toAccount(current) };
}

export async function register(input: { name: string; email: string; password: string }): Promise<Account> {
  const name = input.name.trim();
  const email = cleanEmail(input.email);
  if (!name) throw new AuthError('Please enter your name.');
  if (!EMAIL_PATTERN.test(email)) throw new AuthError('Please enter a valid email.');
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new AuthError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  try {
    const user = new Parse.User();
    user.setUsername(email);
    user.setEmail(email);
    user.setPassword(input.password);
    user.set('name', name);
    await user.signUp();
    return toAccount(user);
  } catch (error) {
    throw friendly(error, 'Could not create your account.');
  }
}

export async function login(input: { email: string; password: string }): Promise<Account> {
  try {
    const user = await Parse.User.logIn(cleanEmail(input.email), input.password);
    return toAccount(user);
  } catch (error) {
    throw friendly(error, 'Could not sign in.');
  }
}

export async function requestPasswordReset(email: string): Promise<void> {
  const clean = cleanEmail(email);
  if (!EMAIL_PATTERN.test(clean)) throw new AuthError('Please enter a valid email.');
  try {
    await Parse.User.requestPasswordReset(clean);
  } catch (error) {
    // Parse reports when no account uses the email. Treat it as sent, so the
    // form doesn't reveal which emails have accounts.
    if (error instanceof Parse.Error && error.code === Parse.Error.EMAIL_NOT_FOUND) return;
    throw friendly(error, 'Could not send the reset email.');
  }
}

/** Sign out locally even if the server can't be reached; clears this device's cached data. */
export async function logout(): Promise<void> {
  await Parse.User.logOut().catch(() => undefined);
  await Parse.LocalDatastore._clear();
  await clearSyncState();
}
