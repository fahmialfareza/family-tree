"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/family", label: "Family" },
  { href: "/person", label: "Person" },
];

function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="bg-gradient-to-r from-blue-600 to-indigo-700 shadow-lg">
      <div className="max-w-screen-xl flex flex-wrap items-center justify-between mx-auto p-4">
        <Link href="/" className="flex items-center space-x-3">
          <span className="self-center text-3xl font-bold text-white tracking-wide">
            Family Tree
          </span>
        </Link>
        <div className="w-full md:block md:w-auto">
          <ul className="flex flex-col md:flex-row md:space-x-8 mt-4 md:mt-0">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={`block py-2 px-4 rounded transition-all duration-200 ${
                      isActive
                        ? "bg-white text-blue-700 shadow font-semibold"
                        : "text-white hover:bg-blue-500 hover:text-white"
                    }`}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
