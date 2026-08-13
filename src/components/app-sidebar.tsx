import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Blocks,
  Database,
  FileText,
  LogIn,
  LogOut,
  MoveHorizontal,
  Rows3,
  Search,
  Settings,
  Tent,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";

const tools = [
  { title: "Canvas", url: "/", icon: Tent },
  { title: "Canvas Extension", url: "/extension", icon: MoveHorizontal },
  { title: "Schach", url: "/schach", icon: Rows3 },
  { title: "Modular", url: "/modular", icon: Blocks },
  { title: "Item Lookup", url: "/lookup", icon: Search },
];

const records = [
  { title: "Saved Quotes", url: "/quotes", icon: FileText },
  { title: "Data", url: "/data", icon: Database },
];

interface MenuItem {
  title: string;
  url: string;
  icon: typeof tools[number]["icon"];
  onClick?: () => void;
}

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const isActive = (url: string) => (url === "/" ? pathname === "/" : pathname.startsWith(url));

  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  const renderItems = (items: MenuItem[]) => (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
            {item.onClick ? (
              <button
                type="button"
                onClick={() => {
                  item.onClick?.();
                  closeOnMobile();
                }}
                className="flex w-full items-center gap-2.5"
              >
                <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                {!collapsed && <span className="truncate">{item.title}</span>}
              </button>
            ) : (
              <Link to={item.url} className="flex items-center gap-2.5" onClick={closeOnMobile}>
                <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                {!collapsed && <span className="truncate">{item.title}</span>}
              </Link>
            )}
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );

  const adminItems: MenuItem[] = user ? [{ title: "Price Admin", url: "/admin/prices", icon: Settings }] : [];
  const signItems: MenuItem[] = user
    ? [{ title: "Sign out", url: "/auth", icon: LogOut, onClick: () => supabase.auth.signOut() }]
    : [{ title: "Boss sign in", url: "/auth", icon: LogIn }];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-3 py-4">
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded bg-sidebar-primary font-display text-sm font-bold text-sidebar-primary-foreground">
            SO
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-semibold text-sidebar-foreground">
                Sukkah Outlet
              </p>
              <p className="truncate text-xs text-sidebar-foreground/60">Staff Tools</p>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Tools</SidebarGroupLabel>
          <SidebarGroupContent>{renderItems(tools)}</SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Records</SidebarGroupLabel>
          <SidebarGroupContent>{renderItems(records)}</SidebarGroupContent>
        </SidebarGroup>
        {adminItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Boss</SidebarGroupLabel>
            <SidebarGroupContent>{renderItems(adminItems)}</SidebarGroupContent>
          </SidebarGroup>
        )}
        <SidebarGroup>
          <SidebarGroupLabel>Account</SidebarGroupLabel>
          <SidebarGroupContent>{renderItems(signItems)}</SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
