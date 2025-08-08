export type TPerson = {
  _id: string;
  name: string;
  gender: "male" | "female";
  birthDate: Date;
  photoUrl?: string;
};
