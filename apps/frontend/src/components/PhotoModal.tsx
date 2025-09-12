import Image from "next/image";
import { CircleXIcon } from "lucide-react";

interface PhotoModalProps {
  image: string;
  name: string;
  setOpen: (open: boolean) => void;
}

function PhotoModal({ image, name, setOpen }: PhotoModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-background rounded-lg p-4 shadow-lg relative w-full max-w-xs sm:max-w-sm md:max-w-md">
        <button
          className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
          onClick={() => setOpen(false)}
          aria-label="Close"
          type="button"
        >
          <CircleXIcon size={20} />
        </button>
        <div className="flex justify-center">
          <Image
            src={image}
            alt={name}
            width={320}
            height={320}
            className="w-full max-w-[320px] h-auto object-cover rounded-md"
            style={{ aspectRatio: "1 / 1" }}
          />
        </div>
      </div>
    </div>
  );
}

export default PhotoModal;
