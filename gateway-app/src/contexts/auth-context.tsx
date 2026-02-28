"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

// User type from gateway
export interface User {
  id: string;
  email: string;
  name: string | null;
  tenantId: string | null;
  roles: string[];
}

// Auth state
export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// Auth context type
export interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  refreshToken: () => Promise<boolean>;
}

// Create context
const AuthContext = createContext<AuthContextType | null>(null);

// Storage keys
const TOKEN_KEY = "gateway_token";
const USER_KEY = "gateway_user";

// Local auth API (login/refresh are handled by gateway-app, not proxied)
const LOCAL_AUTH_BASE = "/api/auth";
// Gateway proxy for credential storage and other proxied calls
const GATEWAY_PROXY_BASE = "/api/gateway";

/**
 * Auth Provider Component
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: true,
  });

  // Load auth state from localStorage on mount
  useEffect(() => {
    const loadAuthState = () => {
      try {
        const token = localStorage.getItem(TOKEN_KEY);
        const userJson = localStorage.getItem(USER_KEY);

        if (token && userJson) {
          const user = JSON.parse(userJson) as User;
          setState({
            user,
            token,
            isAuthenticated: true,
            isLoading: false,
          });
        } else {
          setState((prev) => ({ ...prev, isLoading: false }));
        }
      } catch (error) {
        console.error("Failed to load auth state:", error);
        // Clear potentially corrupted data
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        setState((prev) => ({ ...prev, isLoading: false }));
      }
    };

    loadAuthState();
  }, []);

  // Store JWT as a credential in the gateway credential vault
  const storeTokenAsCredential = useCallback(async (token: string) => {
    try {
      await fetch(`${GATEWAY_PROXY_BASE}/credentials/jwt`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          serviceType: "gateway_api",
          token: token,
        }),
      });
    } catch (error) {
      // Non-critical: credential storage failure shouldn't block login
      console.warn("Failed to store token as credential:", error);
    }
  }, []);

  // Login function
  const login = useCallback(
    async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const response = await fetch(`${LOCAL_AUTH_BASE}/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        if (!response.ok) {
          return {
            success: false,
            error: data.error || "Login failed",
          };
        }

        const { token, user } = data;

        // Save to localStorage
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(user));

        // Update state
        setState({
          user,
          token,
          isAuthenticated: true,
          isLoading: false,
        });

        // Store JWT as a gateway_api credential in the vault (async, non-blocking)
        storeTokenAsCredential(token);

        return { success: true };
      } catch (error) {
        console.error("Login error:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Login failed",
        };
      }
    },
    [storeTokenAsCredential]
  );

  // Logout function
  const logout = useCallback(() => {
    // Clear localStorage
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);

    // Update state
    setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });
  }, []);

  // Refresh token function
  const refreshToken = useCallback(async (): Promise<boolean> => {
    const currentToken = localStorage.getItem(TOKEN_KEY);
    if (!currentToken) {
      return false;
    }

    try {
      const response = await fetch(`${LOCAL_AUTH_BASE}/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentToken}`,
        },
      });

      if (!response.ok) {
        // Token refresh failed, logout
        logout();
        return false;
      }

      const data = await response.json();
      const { token, user } = data;

      // Save new token
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));

      // Update state
      setState({
        user,
        token,
        isAuthenticated: true,
        isLoading: false,
      });

      return true;
    } catch (error) {
      console.error("Token refresh error:", error);
      logout();
      return false;
    }
  }, [logout]);

  const value: AuthContextType = {
    ...state,
    login,
    logout,
    refreshToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to use auth context
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

/**
 * Get token from localStorage (for API calls)
 */
export function getStoredToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return localStorage.getItem(TOKEN_KEY);
}
