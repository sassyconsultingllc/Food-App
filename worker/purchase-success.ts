/**
 * Purchase-success page — served same-origin by the Foodie Finder worker.
 * © 2025 Sassy Consulting - A Veteran Owned Company
 *
 * Lemon Squeezy redirects the buyer here after checkout with
 * ?session_id=<ref>. The page polls GET /api/license/claim on its OWN
 * origin (no CORS/CSP cross-origin friction) until the webhook has minted
 * the key, then shows it with copy + activation instructions.
 *
 * The ref is the only thing tying a browser to its key, so we tell the
 * buyer to save it. Recovery if they lose the tab: admin lookup by email.
 */

import type { Hono } from "hono";
import type { Env } from "./context";

const PAGE = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Your Foodie Finder Pro license</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0}
  :root{
    --bg:#fbf7f2;--card:#ffffff;--ink:#26201b;--dim:#7a6f66;--mut:#a9a097;
    --line:#ece3d8;--copper:#c2704a;--copper-dk:#a85c39;--good:#2e9e6b;
    --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    --mono:ui-monospace,"SF Mono","JetBrains Mono",Menlo,Consolas,monospace;
  }
  body{background:var(--bg);color:var(--ink);font-family:var(--sans);line-height:1.6;
    min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1.5rem;
    -webkit-font-smoothing:antialiased}
  .card{background:var(--card);border:1px solid var(--line);border-radius:20px;
    max-width:460px;width:100%;padding:2.4rem 2.1rem;
    box-shadow:0 24px 60px -30px #26201b40}
  .mark{width:52px;height:52px;border-radius:14px;display:grid;place-items:center;
    background:linear-gradient(150deg,#e08a5f,var(--copper));margin-bottom:1.4rem;
    box-shadow:0 8px 22px -8px var(--copper)}
  h1{font-size:1.5rem;letter-spacing:-0.02em;line-height:1.2;margin-bottom:.5rem;text-wrap:balance}
  .sub{color:var(--dim);font-size:.95rem;margin-bottom:1.6rem}
  .state{display:flex;align-items:center;gap:.7rem;padding:1rem 1.1rem;border-radius:12px;
    background:#faf4ee;border:1px solid var(--line);color:var(--dim);font-size:.9rem}
  .spinner{width:18px;height:18px;border:2px solid var(--line);border-top-color:var(--copper);
    border-radius:50%;animation:spin .8s linear infinite;flex:none}
  @keyframes spin{to{transform:rotate(360deg)}}
  @media(prefers-reduced-motion:reduce){.spinner{animation:none}}
  .keybox{display:none;margin-top:.4rem}
  .keybox.show{display:block}
  .lab{font-size:.72rem;text-transform:uppercase;letter-spacing:.09em;color:var(--mut);
    font-weight:700;margin-bottom:.5rem}
  .keyrow{display:flex;gap:.5rem;align-items:stretch}
  .key{flex:1;font-family:var(--mono);font-size:1.05rem;font-weight:600;letter-spacing:.02em;
    background:#faf4ee;border:1.5px dashed var(--copper);border-radius:11px;
    padding:.85rem .9rem;color:var(--ink);overflow-x:auto;white-space:nowrap}
  .copy{flex:none;border:none;background:var(--copper);color:#fff;border-radius:11px;
    padding:0 1.05rem;font-weight:650;font-size:.85rem;cursor:pointer;transition:background .15s}
  .copy:hover{background:var(--copper-dk)}
  .copy.ok{background:var(--good)}
  .copy:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
  .tier{margin-top:.8rem;font-size:.85rem;color:var(--dim)}
  .tier b{color:var(--ink)}
  .steps{margin-top:1.6rem;border-top:1px solid var(--line);padding-top:1.4rem}
  .steps h2{font-size:.95rem;margin-bottom:.8rem;letter-spacing:-0.01em}
  .steps ol{list-style:none;counter-reset:s;display:flex;flex-direction:column;gap:.7rem}
  .steps li{counter-increment:s;display:flex;gap:.75rem;font-size:.9rem;color:var(--dim)}
  .steps li::before{content:counter(s);flex:none;width:22px;height:22px;border-radius:7px;
    background:#faf4ee;border:1px solid var(--line);color:var(--copper);font-weight:700;
    font-size:.78rem;display:grid;place-items:center;font-variant-numeric:tabular-nums}
  .steps b{color:var(--ink);font-weight:650}
  .save{margin-top:1.3rem;font-size:.82rem;color:var(--dim);background:#fdf6ea;
    border:1px solid #f0e2c8;border-radius:11px;padding:.8rem .95rem}
  .err{display:none;margin-top:.4rem;font-size:.9rem;color:#b4482f;background:#fbeee9;
    border:1px solid #f0d5cb;border-radius:12px;padding:1rem 1.1rem}
  .err.show{display:block}
  a{color:var(--copper-dk)}
  footer{margin-top:1.6rem;text-align:center;font-size:.75rem;color:var(--mut)}
</style>
</head>
<body>
  <main class="card">
    <div class="mark" aria-hidden="true">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
    </div>
    <h1 id="title">Finishing your purchase&hellip;</h1>
    <p class="sub" id="sub">Hang tight — we're confirming payment and generating your license key. This usually takes a few seconds.</p>

    <div class="state" id="state">
      <span class="spinner" id="spin"></span>
      <span id="statetext">Waiting for payment confirmation&hellip;</span>
    </div>

    <div class="keybox" id="keybox">
      <div class="lab">Your license key</div>
      <div class="keyrow">
        <div class="key" id="key" tabindex="0"></div>
        <button class="copy" id="copy" type="button">Copy</button>
      </div>
      <p class="tier" id="tier"></p>

      <div class="steps">
        <h2>Activate it in the app</h2>
        <ol>
          <li>Open <b>Foodie Finder</b> and go to <b>Settings &rsaquo; Foodie Finder Pro</b>.</li>
          <li>Tap <b>Activate License</b>.</li>
          <li>Paste the key above and enter the <b>same email</b> you used at checkout.</li>
        </ol>
      </div>

      <div class="save">Save this key somewhere safe — it unlocks Pro on up to 3 devices. Lost it? Reply to your Lemon Squeezy receipt or contact <a href="mailto:support@sassyconsultingllc.com">support</a>.</div>
    </div>

    <div class="err" id="err"></div>
    <footer>&copy; 2026 Sassy Consulting LLC &bull; Veteran-Owned</footer>
  </main>

<script>
(function(){
  "use strict";
  var qs = new URLSearchParams(location.search);
  var ref = qs.get("session_id") || "";
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var stateEl=document.getElementById("state"),
      statetext=document.getElementById("statetext"),
      spin=document.getElementById("spin"),
      title=document.getElementById("title"),
      sub=document.getElementById("sub"),
      keybox=document.getElementById("keybox"),
      keyEl=document.getElementById("key"),
      tierEl=document.getElementById("tier"),
      copyBtn=document.getElementById("copy"),
      errEl=document.getElementById("err");

  function fail(msg){
    stateEl.style.display="none";
    title.textContent="Almost there";
    sub.textContent="Your payment went through — the key just isn't ready on this page yet.";
    errEl.textContent=msg;
    errEl.classList.add("show");
  }

  if(!UUID.test(ref)){
    title.textContent="Purchase complete";
    sub.textContent="";
    fail("We couldn't read your order reference from the link. Check your Lemon Squeezy receipt email for your license key, or contact support@sassyconsultingllc.com.");
    return;
  }

  function show(data){
    stateEl.style.display="none";
    title.textContent="You're in. Welcome to Pro.";
    sub.textContent="Your license is ready. Here's your key:";
    keyEl.textContent=data.key;
    if(data.tier){
      var label=data.tier==="lifetime"?"Lifetime":"Pro";
      tierEl.innerHTML="Plan: <b>"+label+"</b>"+(data.expiresAt?(" &middot; renews "+new Date(data.expiresAt).toLocaleDateString()):" &middot; never expires");
    }
    keybox.classList.add("show");
  }

  copyBtn.addEventListener("click",function(){
    navigator.clipboard.writeText(keyEl.textContent).then(function(){
      copyBtn.classList.add("ok");copyBtn.textContent="Copied";
      setTimeout(function(){copyBtn.classList.remove("ok");copyBtn.textContent="Copy";},1500);
    });
  });

  var attempts=0, MAX=25; // ~50s at 2s spacing
  function poll(){
    attempts++;
    fetch("/api/license/claim?session_id="+encodeURIComponent(ref),{headers:{Accept:"application/json"}})
      .then(function(res){return res.json().then(function(d){return {status:res.status,data:d};});})
      .then(function(r){
        if(r.status===200 && r.data && r.data.key){ show(r.data); return; }
        if(r.status===202){
          if(attempts>=MAX){ fail("Still processing. Leave this page open and refresh in a minute, or check your receipt email. If it persists, contact support@sassyconsultingllc.com with your order number."); return; }
          statetext.textContent="Generating your license"+Array(1+(attempts%4)).join(".");
          setTimeout(poll,2000); return;
        }
        fail((r.data && r.data.error) || "Something went wrong confirming your order. Contact support@sassyconsultingllc.com.");
      })
      .catch(function(){
        if(attempts>=MAX){ fail("We couldn't reach the license service. Check your connection and refresh, or contact support@sassyconsultingllc.com."); return; }
        setTimeout(poll,2500);
      });
  }
  poll();
})();
</script>
</body>
</html>`;

export function registerPurchaseSuccess(app: Hono<{ Bindings: Env }>): void {
  app.get("/purchase-success", (c) =>
    c.html(PAGE, 200, {
      // Same-origin page; allow it to fetch the claim endpoint on this origin
      // and inline its own styles/script. No third-party origins needed.
      "Content-Security-Policy":
        "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
        "connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    })
  );
}
