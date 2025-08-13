"use client";

import { getProfile } from "@/service/auth";
import useStore from "@/zustand";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/family", label: "Family", token: true },
  { href: "/person", label: "Person", token: true },
  { href: "/auth/login", label: "Login", notShowInTokenExists: true },
];

function Navbar() {
  const pathname = usePathname();
  const router = useRouter();

  const { token, user, setUser, logout } = useStore();

  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (token) {
      const fetchProfile = async () => {
        const { data, message } = await getProfile(token, logout);
        if (!data) {
          toast.error(message);
          return;
        }

        setUser(data.user);
      };
      fetchProfile();
    }
  }, [token, setUser]);

  return (
    <nav className="bg-gradient-to-r from-blue-600 to-indigo-700 shadow-lg sticky top-0 z-50">
      <div className="max-w-screen-xl flex flex-wrap items-center justify-between mx-auto p-4">
        <Link href="/" className="flex items-center space-x-3">
          <span role="img" aria-label="tree">
            🌳
          </span>
          <span className="self-center text-3xl font-bold text-white tracking-wide">
            Family Tree
          </span>
        </Link>
        {/* Mobile menu button */}
        <button
          type="button"
          className="inline-flex items-center p-2 ml-3 text-sm text-white rounded-lg md:hidden hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-white"
          aria-controls="navbar-menu"
          aria-expanded={open ? "true" : "false"}
          onClick={() => setOpen((prev) => !prev)}
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d={open ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"}
            />
          </svg>
        </button>
        <div
          className={`w-full md:block md:w-auto ${
            open ? "block" : "hidden"
          } transition-all duration-200`}
          id="navbar-menu"
        >
          <ul className="flex flex-col md:flex-row md:space-x-8 mt-4 md:mt-0">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              const showLink = link.token ? !!token : true;
              if (!showLink || (!!token && link.notShowInTokenExists))
                return null;

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

            {user && (
              <li className="relative">
                <div className="hidden md:block">
                  <button
                    className="flex items-center gap-2 py-2 px-4 rounded transition-all duration-200 text-white hover:bg-blue-500 hover:text-white font-semibold focus:outline-none"
                    onClick={() => setOpen((prev) => !prev)}
                    aria-haspopup="true"
                    aria-expanded={open ? "true" : "false"}
                  >
                    {user.role === "admin" ? "Admin" : user.name}
                    <svg
                      className="w-4 h-4 ml-1"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>
                  {open && (
                    <ul
                      className="absolute right-0 mt-2 w-40 bg-white rounded shadow-lg z-20"
                      tabIndex={-1}
                    >
                      <li>
                        <button
                          onClick={() => {
                            logout();
                            router.push("/auth/login");
                            setOpen(false);
                          }}
                          className="w-full text-left block px-4 py-2 text-gray-800 hover:bg-blue-100"
                        >
                          Logout
                        </button>
                      </li>
                    </ul>
                  )}
                </div>
                <div className="block md:hidden">
                  <button
                    onClick={() => {
                      logout();
                      router.push("/auth/login");
                      setOpen(false);
                    }}
                    className="w-full text-left block px-4 py-2 text-white hover:bg-blue-500 font-semibold"
                  >
                    Logout
                  </button>
                </div>
              </li>
            )}
          </ul>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
