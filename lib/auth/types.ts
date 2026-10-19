export type Role = "member" | "admin";

/** What the UI knows about the signed-in user. Safe to pass to client components. */
export interface Profile {
  userId: string;
  email: string | null;
  name: string;
  workshopId: string | null;
  workshopName: string | null;
  workshopCity: string | null;
  role: Role;
}
