import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Gender } from "@/lib/api/types";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const ring: Record<Gender, string> = {
  male: "ring-node-male",
  female: "ring-node-female",
  other: "ring-node-other",
  unknown: "ring-border",
};

export function PersonAvatar({
  name,
  photoUrl,
  gender = "unknown",
  deceased,
  className,
}: {
  name: string;
  photoUrl?: string;
  gender?: Gender;
  deceased?: boolean;
  className?: string;
}) {
  return (
    <Avatar className={cn("size-10 ring-2 ring-offset-2 ring-offset-card", ring[gender] ?? ring.unknown, deceased && "grayscale", className)}>
      {photoUrl ? <AvatarImage src={photoUrl} alt="" className="object-cover" /> : null}
      <AvatarFallback className="bg-secondary text-xs font-semibold text-secondary-foreground">{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
