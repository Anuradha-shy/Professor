// Ambient 3D backdrop: a slowly orbiting "focus rings" sculpture (an Ashoka-chakra
// nod) floating on a fully transparent canvas. Pure CSS 3D — no WebGL, no payload —
// pointer-events-none and aria-hidden so it never steals focus or clicks.

export default function Backdrop3D() {
  return (
    <div
      aria-hidden
      data-testid="backdrop-3d"
      className="pointer-events-none fixed inset-0 z-0 select-none overflow-hidden"
    >
      {/* warm light washes */}
      <div className="absolute -top-48 right-[-12%] h-[46rem] w-[46rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(200,100,14,0.10),transparent_62%)]" />
      <div className="absolute bottom-[-18rem] left-[-10%] h-[40rem] w-[40rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(29,58,44,0.09),transparent_62%)]" />

      {/* 3D ring sculpture — orbits slowly on a tilted plane */}
      <div
        className="absolute right-[-9rem] top-20 hidden h-[34rem] w-[34rem] md:block"
        style={{ perspective: "1100px" }}
      >
        <div className="chakra-orbit absolute inset-0">
          <div className="orbit-ring r1" />
          <div className="orbit-ring r2" />
          <div className="orbit-ring r3" />
          <div className="orbit-ring r4" />
        </div>
      </div>
    </div>
  );
}
