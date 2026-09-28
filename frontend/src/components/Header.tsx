import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import {
  BookOpen,
  Clock,
  Database,
  GraduationCap,
  LayoutDashboard,
  LineChart,
  Lock,
  Menu,
  Plus,
  RotateCcw,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import SessionDialog from "@/components/SessionDialog";
import { ChakraMark } from "@/components/kit";
import { endSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const NAV = [
  { name: "Dashboard", path: "/", icon: LayoutDashboard, testId: "nav-dashboard" },
  { name: "Study Log", path: "/sessions", icon: Clock, testId: "nav-sessions" },
  { name: "Revision Queue", path: "/revisions", icon: RotateCcw, testId: "nav-revisions" },
  { name: "Goals", path: "/goals", icon: Target, testId: "nav-goals" },
  { name: "Mock Tests", path: "/tests", icon: GraduationCap, testId: "nav-tests" },
  { name: "Syllabus Matrix", path: "/subjects", icon: BookOpen, testId: "nav-subjects" },
  { name: "Insights", path: "/insights", icon: LineChart, testId: "nav-insights" },
  { name: "Notion Sync", path: "/settings", icon: Database, testId: "nav-settings" },
];

export default function Header() {
  const [logOpen, setLogOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-[#E8E3D7]/90 bg-[#FBF9F4]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-3" data-testid="brand-link">
          <ChakraMark className="size-9" />
          <span className="flex flex-col leading-tight">
            <span className="font-serif text-lg font-semibold tracking-tight text-[#1C1D18]">
              Ashoka Academy
            </span>
            <span className="hidden font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[#8C6212] sm:block">
              UPSC CSE Personal Tracker
            </span>
          </span>
        </Link>

        <nav className="hidden flex-1 items-center justify-center gap-1 lg:flex">
          {NAV.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              data-testid={item.testId}
              className={({ isActive }) =>
                cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-[#FEF3E2] text-[#8A3D04]"
                    : "text-[#5E6258] hover:bg-[#F6F2E9] hover:text-[#1C1D18]",
                )
              }
            >
              {item.name}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <Button
            size="sm"
            data-testid="quick-log-session-btn"
            onClick={() => setLogOpen(true)}
            className="bg-[#C8640E] text-white hover:bg-[#A85309]"
          >
            <Plus className="size-4" />
            <span className="hidden sm:inline">Log Session</span>
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
                  className="lg:hidden"
                >
                  <Menu className="size-4" />
                </Button>
              }
            />
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle className="font-serif">Navigation</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 px-3 pb-6">
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
                        isActive
                          ? "bg-[#FEF3E2] text-[#8A3D04]"
                          : "text-[#5E6258] hover:bg-[#F6F2E9] hover:text-[#1C1D18]",
                      )
                    }
                  >
                    <item.icon className="size-4" />
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
