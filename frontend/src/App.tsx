import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Backdrop3D from "@/components/Backdrop3D";
import Header from "@/components/Header";
import { ChakraMark } from "@/components/kit";
import { Toaster } from "@/components/ui/sonner";
import { apiGet } from "@/lib/api";
import type { MeOut } from "@/lib/types";
import Dashboard from "@/pages/Dashboard";
import Goals from "@/pages/Goals";
import Insights from "@/pages/Insights";
import Login from "@/pages/Login";
import Notion from "@/pages/Notion";
import Professor from "@/pages/Professor";
import Pyq from "@/pages/Pyq";
import Revisions from "@/pages/Revisions";
import Sessions from "@/pages/Sessions";
import Settings from "@/pages/Settings";
import Subjects from "@/pages/Subjects";
import Tests from "@/pages/Tests";
import Weakness from "@/pages/Weakness";

function Splash() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-[#FBF9F4]">
      <ChakraMark className="size-16 animate-pulse" />
    </div>
  );
}

// Every tracking page sits behind the PIN vault: a 401 from /auth/me → /login.
function ProtectedLayout() {
  const me = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => apiGet<MeOut>("/auth/me"),
    retry: false,
    staleTime: Infinity,
  });
  if (me.isPending) return <Splash />;
  if (me.isError) return <Navigate to="/login" replace />;
  return (
    <div className="relative min-h-svh bg-[#FBF9F4]">
      <Backdrop3D />
      <div className="relative z-10">
        <Header />
        <main>
          <Outlet />
        </main>
        <footer className="border-t border-[#E8E3D7]/70 py-6 text-center text-xs text-[#8B8F83]">
          Professor 🥼 · private UPSC CSE 2027 tracker · Prelims 24 May 2027
        </footer>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/professor" element={<Professor />} />
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/revisions" element={<Revisions />} />
          <Route path="/pyq" element={<Pyq />} />
          <Route path="/weakness" element={<Weakness />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/tests" element={<Tests />} />
          <Route path="/subjects" element={<Subjects />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/notion" element={<Notion />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster richColors />
    </>
  );
}
