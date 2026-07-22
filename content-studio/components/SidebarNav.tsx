"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

const NAV = [
  { href: "", label: "Create", icon: "✨" },
  { href: "/knowledge", label: "Knowledge base", icon: "📚" },
  { href: "/identity", label: "Identity", icon: "🪪" },
  { href: "/style", label: "Writing style", icon: "🖋️" },
  { href: "/drafts", label: "Drafts", icon: "📝" },
];

function Nav({
  clientId,
  conversations,
}: {
  clientId: string;
  conversations: { id: string; title: string }[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeChat = searchParams.get("chat");
  const base = `/c/${clientId}`;

  return (
    <nav className="flex-1 overflow-y-auto p-3">
      <ul className="space-y-1">
        {NAV.map((item) => {
          const href = `${base}${item.href}`;
          const active =
            item.href === ""
              ? pathname === base
              : pathname.startsWith(href);
          return (
            <li key={item.href}>
              <Link
                href={href}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${
                  active
                    ? "bg-white font-medium text-neutral-900 shadow-sm ring-1 ring-neutral-200"
                    : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                <span className="text-base leading-none">{item.icon}</span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>

      {conversations.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wide text-neutral-400">
            Recent chats
          </p>
          <ul className="space-y-0.5">
            {conversations.map((c) => (
              <li key={c.id}>
                <Link
                  href={`${base}?chat=${c.id}`}
                  className={`block truncate rounded-lg px-3 py-1.5 text-sm ${
                    activeChat === c.id
                      ? "bg-white text-neutral-900 ring-1 ring-neutral-200"
                      : "text-neutral-500 hover:bg-neutral-100"
                  }`}
                >
                  {c.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  );
}

export default function SidebarNav(props: {
  clientId: string;
  conversations: { id: string; title: string }[];
}) {
  return (
    <Suspense>
      <Nav {...props} />
    </Suspense>
  );
}
