export interface CreateUserDto {
  username: string;
  password: string;
  name: string;
  role: "admin" | "user";
}
