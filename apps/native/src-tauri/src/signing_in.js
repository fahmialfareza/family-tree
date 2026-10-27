// Shown by lib.rs (open_deep_link) the moment a sign-in or invite link arrives: the page stays on screen until the
// site answers /auth/.../complete, which has no page of its own, so cover it with the launcher's look instead.
(() => {
  if (document.getElementById("sakdulur-handoff")) return;
  const invite = __INVITE__;
  const id = (document.documentElement.lang || navigator.language || "").toLowerCase().startsWith("id");
  const text = invite ? (id ? "Membuka undangan…" : "Opening the invitation…") : id ? "Sedang masuk…" : "Signing in…";
  const dark = document.documentElement.classList.contains("dark");
  const box = document.createElement("div");
  box.id = "sakdulur-handoff";
  box.setAttribute("role", "status");
  box.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;" +
    `background:${dark ? "#221d18" : "#f9f6ef"};color:${dark ? "#f2ede4" : "#3a3128"};` +
    'font:500 16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
  const spinner = document.createElement("div");
  spinner.style.cssText = `width:32px;height:32px;border-radius:50%;border:3px solid ${dark ? "#3b342c" : "#e4dccd"};border-top-color:${dark ? "#7cc893" : "#3f7a52"}`;
  spinner.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], { duration: 800, iterations: Infinity });
  const label = document.createElement("div");
  label.textContent = text;
  box.append(spinner, label);
  (document.body || document.documentElement).append(box);
})();
