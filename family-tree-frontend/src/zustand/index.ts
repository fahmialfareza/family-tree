import { TUser } from "@/models/user";
import { create } from "zustand";
import cookie from "./cookie";

interface IStore {
  user: TUser | null;
  token?: string;
  setUser: (user: TUser) => void;
  setToken: (token: string) => void;
  logout: () => void;
}

const useStore = create<IStore>((set) => ({
  user: null,
  token: (cookie.getItem("token") as string) || undefined,
  setUser: (user: TUser) => set({ user }),
  setToken: (token: string) => {
    cookie.setItem("token", token);
    set({ token });
  },
  logout: () => {
    cookie.removeItem("token");
    set({ user: null, token: undefined });
  },
}));

export default useStore;
