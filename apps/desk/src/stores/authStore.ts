import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { User } from "../api/client";

type AuthState = {
  token: string | null;
  user: User | null;
  setSession: (input: { token: string; user: User }) => void;
  clear: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSession: ({ token, user }) => {
        set({ token, user });
      },
      clear: () => {
        set({ token: null, user: null });
      }
    }),
    { name: "desk_auth_v1" }
  )
);
