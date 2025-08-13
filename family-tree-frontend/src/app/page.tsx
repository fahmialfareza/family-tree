import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Home | Family Tree",
  description: "Welcome to the Family Tree app",
};

export default function Home() {
  return (
    <div className="font-sans grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20">
      <main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start">
        <div className="flex gap-4 items-center flex-col sm:flex-row">
          <Link
            className="rounded-full border border-solid border-transparent transition-colors flex items-center justify-center bg-blue-500 text-background gap-2 hover:bg-blue-700 dark:hover:bg-blue-700 font-medium text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 sm:w-auto"
            href="/family"
          >
            <span className="text-xl" role="img" aria-label="tree">
              🌳
            </span>
            Go To App
          </Link>
          <Link
            className="rounded-full border border-solid border-black-500 transition-colors flex items-center justify-center bg-white-500 text-blue-500 gap-2  hover:bg-blue-700 hover:text-background dark:hover:bg-blue-700 dark:hover:text-background font-medium text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 sm:w-auto"
            href="https://youtu.be/BcjajE33rhU"
            target="__blank"
          >
            How to Use
          </Link>
        </div>
      </main>
    </div>
  );
}
