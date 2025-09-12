import { TUser } from "@/models/user";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface IStore {
  user: TUser | null;
  token?: string;
  setUser: (user: TUser) => void;
  setToken: (token: string) => void;
  logout: () => void;
}

const useStore = create<IStore>()(
  persist(
    (set) => ({
      user: null,
      token: undefined,
      setUser: (user: TUser) => set({ user }),
      setToken: (token: string) => {
        if (!token) {
          set({ user: null, token: undefined });
          return;
        }

        set({ token });
      },
      logout: () => set({ user: null, token: undefined }),
    }),
    {
      name: "family-tree-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ user: state.user, token: state.token }),
    }
  )
);

export default useStore;
