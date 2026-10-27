import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useProfileStore } from '@/stores/profile-store';

import * as service from './auth-service';
import type { Account, AuthStatus } from './auth-service';

type AuthState = (AuthStatus | { status: 'loading' }) & {
  register: (input: { name: string; email: string; password: string }) => Promise<Account>;
  login: (input: { email: string; password: string }) => Promise<Account>;
  requestPasswordReset: (email: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthStatus | { status: 'loading' }>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    service
      .restore()
      .catch((): AuthStatus => ({ status: 'signed-out' }))
      .then((restored) => {
        if (active) setState(restored);
      });
    return () => {
      active = false;
    };
  }, []);

  const register = useCallback(async (input: { name: string; email: string; password: string }) => {
    const account = await service.register(input);
    setState({ status: 'account', account });
    return account;
  }, []);

  const login = useCallback(async (input: { email: string; password: string }) => {
    const account = await service.login(input);
    setState({ status: 'account', account });
    return account;
  }, []);

  const logout = useCallback(async () => {
    await service.logout();
    useProfileStore.getState().setProfileUuid(null);
    setState({ status: 'signed-out' });
  }, []);

  const value = useMemo<AuthState>(
    () => ({ ...state, register, login, requestPasswordReset: service.requestPasswordReset, logout }),
    [state, register, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
