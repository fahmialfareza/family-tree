import * as React from "react";
import * as NavigationMenu from "@radix-ui/react-navigation-menu";
import { FaUsers, FaUser } from "react-icons/fa";

const menuItems = [
  {
    label: "Family",
    icon: <FaUsers />,
    href: "/admin/family",
  },
  {
    label: "Person",
    icon: <FaUser />,
    href: "/admin/person",
  },
];

const AdminSideBar: React.FC = () => {
  return (
    <aside
      style={{
        width: 240,
        height: "100vh",
        background: "#f8fafc",
        borderRight: "1px solid #e5e7eb",
        padding: "2rem 1rem",
        boxSizing: "border-box",
      }}
    >
      <NavigationMenu.Root orientation="vertical">
        <NavigationMenu.List
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
            listStyle: "none",
            padding: 0,
            margin: 0,
          }}
        >
          {menuItems.map((item) => (
            <NavigationMenu.Item key={item.label}>
              <NavigationMenu.Link
                href={item.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  padding: "0.75rem 1rem",
                  borderRadius: 8,
                  color: "#1e293b",
                  textDecoration: "none",
                  fontWeight: 500,
                  fontSize: 16,
                  transition: "background 0.2s",
                }}
                active={true}
              >
                {item.icon}
                {item.label}
              </NavigationMenu.Link>
            </NavigationMenu.Item>
          ))}
        </NavigationMenu.List>
      </NavigationMenu.Root>
    </aside>
  );
};

export default AdminSideBar;
