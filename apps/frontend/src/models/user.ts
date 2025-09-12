export type TUser = {
  _id: string;
  name: string;
  username: string;
  password?: string;
  role: "admin" | "user";
};
