import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import {
  BookOpen,
  Clock,
  Database,
  GraduationCap,
  LayoutDashboard,
  Library,
  LineChart,
  Lock,
  Menu,
  Plus,
  Radar,
  RotateCcw,
  Settings as SettingsIcon,
  Sparkles,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import SessionDialog from "@/components/SessionDialog";
import { ChakraMark } from "@/components/kit";
import { endSession } from "@/lib/session";
import { cn } from "@/lib/utils";

// Colour-coded navigation — each section owns a hue so the eye finds it instantly.
const NAV = [
  { name: "Dashboard", path: "/", icon: LayoutDashboard, testId: "nav-dashboard", tint: "#C8640E" },
  { name: "Professor AI", path: "/professor", icon: Sparkles, testId: "nav-professor", tint: "#6247AA" },
  { name: "Study Log", path: "/sessions", icon: Clock, testId: "nav-sessions", tint: "#0F5B78" },
  { name: "Revisions", path: "/revisions", icon: RotateCcw, testId: "nav-revisions", tint: "#B8860B" },
  { name: "PYQ Bank", path: "/pyq", icon: Library, testId: "nav-pyq", tint: "#1D3A2C" },
  { name: "Weakness", path: "/weakness", icon: Radar, testId: "nav-weakness", tint: "#B91C1C" },
  { name: "Goals", path: "/goals", icon: Target, testId: "nav-goals", tint: "#843B62" },
  { name: "Mock Tests", path: "/tests", icon: GraduationCap, testId: "nav-tests", tint: "#0F5B78" },
  { name: "Syllabus", path: "/subjects", icon: BookOpen, testId: "nav-subjects", tint: "#C8640E" },
  { name: "Insights", path: "/insights", icon: LineChart, testId: "nav-insights", tint: "#1D3A2C" },
  { name: "Notion", path: "/notion", icon: Database, testId: "nav-notion", tint: "#6247AA" },
  { name: "Settings", path: "/settings", icon: SettingsIcon, testId: "nav-settings", tint: "#5E6258" },
];

export default function Header() {
  const [logOpen, setLogOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-[#E8E3D7]/90 bg-[#FBF9F4]/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex shrink-0 items-center gap-3" data-testid="brand-link">
          <ChakraMark className="size-9" />
          <span className="flex flex-col leading-tight">
            <span className="font-serif text-lg font-semibold tracking-tight text-[#1C1D18]">
              Professor 🥼
            </span>
            <span className="hidden font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[#8C6212] sm:block">
              UPSC CSE 2027 · private tracker
            </span>
          </span>
        </Link>

        <nav className="hidden flex-1 items-center justify-center gap-0.5 xl:flex">
          {NAV.slice(0, 9).map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              data-testid={item.testId}
              className={({ isActive }) =>
                cn(
                  "rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all duration-200",
                  isActive
                    ? "bg-white shadow-[0_1px_2px_rgba(28,29,24,0.06)]"
                    : "text-[#5E6258] hover:bg-white/70 hover:text-[#1C1D18]",
                )
              }
              style={({ isActive }) => (isActive ? { color: item.tint } : undefined)}
            >
              {item.name}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            data-testid="quick-log-session-btn"
            onClick={() => setLogOpen(true)}
            className="bg-[#C8640E] text-white hover:bg-[#A85309]"
          >
            <Plus className="size-4" />
            <span className="hidden sm:inline">Log</span>
          </Button>
          <Button
            variant="outline"
            size="icon"
            data-testid="lock-button"
            onClick={() => void endSession()}
            aria-label="Lock the vault"
            title="Lock the vault"
          >
            <Lock className="size-4" />
          </Button>
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  data-testid="mobile-menu-button"
                  aria-label="Open menu"
                  className="xl:hidden"
                >
                  <Menu className="size-4" />
                </Button>
              }
            />
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle className="font-serif">Navigation</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 overflow-y-auto px-3 pb-6">
                {NAV.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === "/"}
                    data-testid={`mobile-${item.testId}`}
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                        isActive ? "bg-white shadow-sm" : "text-[#5E6258] hover:bg-[#F6F2E9]",
                      )
                    }
                    style={({ isActive }) => (isActive ? { color: item.tint } : undefined)}
                  >
                    <item.icon className="size-4" style={{ color: item.tint }} />
                    {item.name}
                  </NavLink>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
      <SessionDialog open={logOpen} onOpenChange={setLogOpen} />
    </header>
  );
}
