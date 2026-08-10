export default function Loading() {
  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#f3ecd9", color: "#122519", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "currentColor", animation: "pulse 1.4s ease-in-out infinite both" }} />
        <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "currentColor", animation: "pulse 1.4s ease-in-out infinite both", animationDelay: "0.2s" }} />
        <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "currentColor", animation: "pulse 1.4s ease-in-out infinite both", animationDelay: "0.4s" }} />
      </div>
      <style>{`@keyframes pulse{0%,80%,100%{opacity:0.3;transform:scale(0.8)}40%{opacity:1;transform:scale(1)}}`}</style>
    </div>
  );
}
