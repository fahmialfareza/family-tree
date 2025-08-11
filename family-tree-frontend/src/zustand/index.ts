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

const getInitialToken = (): string | undefined => {
  if (typeof window !== "undefined") {
    return (cookie.getItem("token") as string) || undefined;
  }
  return undefined;
};

const useStore = create<IStore>((set) => ({
  user: null,
  token: getInitialToken(),
  setUser: (user: TUser) => set({ user }),
  setToken: (token: string) => {
    if (typeof window !== "undefined") {
      cookie.setItem("token", token);
    }
    set({ token });
  },
  logout: () => {
    if (typeof window !== "undefined") {
      cookie.setItem("token", "");
    }
    set({ user: null, token: undefined });
  },
}));

export default useStore;
