import Link from "next/link";
import { Button } from "./ui/button";
import { toast } from "react-toastify";

function PhoneButton({
  value,
  withFlex = true,
}: {
  value?: string;
  withFlex?: boolean;
}) {
  return (
    <>
      {withFlex ? (
        <div className="flex justify-evenly">
          <ButtonGroup value={value!} />
        </div>
      ) : (
        <ButtonGroup value={value!} />
      )}
    </>
  );
}

function ButtonGroup({ value }: { value: string }) {
  return (
    <>
      <Link href={`https://wa.me/62${value}`} target="__blank">
        <Button
          size="sm"
          variant="outline"
          type="button"
          aria-label="Open WhatsApp"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-4 h-4"
            viewBox="0 0 32 32"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M16 3C9.373 3 4 8.373 4 15c0 2.637.86 5.084 2.34 7.09L4 29l7.18-2.31A12.93 12.93 0 0 0 16 27c6.627 0 12-5.373 12-12S22.627 3 16 3zm0 22c-1.98 0-3.89-.52-5.54-1.5l-.39-.23-4.28 1.38 1.4-4.17-.25-.4A9.98 9.98 0 0 1 6 15c0-5.514 4.486-10 10-10s10 4.486 10 10-4.486 10-10 10zm5.07-7.75c-.28-.14-1.65-.81-1.9-.9-.25-.09-.43-.14-.61.14-.18.28-.7.9-.86 1.08-.16.18-.32.2-.6.07-.28-.14-1.18-.44-2.25-1.4-.83-.74-1.39-1.65-1.56-1.93-.16-.28-.02-.43.12-.57.13-.13.28-.32.42-.48.14-.16.18-.28.28-.46.09-.18.05-.34-.02-.48-.07-.14-.61-1.47-.84-2.01-.22-.54-.45-.46-.61-.47-.16-.01-.34-.01-.52-.01-.18 0-.48.07-.73.34-.25.27-.96.94-.96 2.3 0 1.36.99 2.68 1.13 2.87.14.18 1.95 2.98 4.73 4.06.66.28 1.18.45 1.58.58.66.21 1.26.18 1.74.11.53-.08 1.65-.67 1.88-1.32.23-.65.23-1.2.16-1.32-.07-.12-.25-.18-.53-.32z" />
          </svg>
        </Button>
      </Link>
      <Button
        size="sm"
        variant="outline"
        type="button"
        onClick={() => {
          if (value) {
            if (navigator.clipboard) {
              navigator.clipboard.writeText(value);
              toast.success("Phone number copied to clipboard");
            } else {
              const textArea = document.createElement("textarea");
              textArea.value = value;
              document.body.appendChild(textArea);
              textArea.select();
              try {
                document.execCommand("copy");
                toast.success("Phone number copied to clipboard");
              } catch (err) {
                toast.error("Failed to copy phone number");
              }
              document.body.removeChild(textArea);
            }
          }
        }}
        aria-label="Copy phone number"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <rect
            x="9"
            y="9"
            width="13"
            height="13"
            rx="2"
            stroke="currentColor"
            strokeWidth="2"
          />
          <rect
            x="3"
            y="3"
            width="13"
            height="13"
            rx="2"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
      </Button>
    </>
  );
}

export default PhoneButton;
