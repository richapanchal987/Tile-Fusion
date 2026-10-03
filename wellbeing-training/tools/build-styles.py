#!/usr/bin/env python3
"""Builds apps-script/Styles.html.

Every colour is a CSS variable with a light and a dark value, defined once here and written into both the
automatic (prefers-color-scheme) and the manual ([data-theme]) dark blocks so they cannot drift apart.
Run from the wellbeing-training folder:  python3 tools/build-styles.py
"""
import pathlib
root = pathlib.Path(__file__).resolve().parent.parent

LIGHT = """
  --bg:#F3F6FB;--surface:#FFFFFF;--sunk:#E8EEF6;--ink:#14233A;--muted:#4F6178;--line:#D5DEEA;
  --blue:#0050A0;--blue-soft:#DDE9F7;--red:#B02020;--red-soft:#F9E2E2;--yellow:#F2C21A;--gold:#7A5900;--gold-soft:#FCF0C2;
  --good:var(--blue);--good-soft:var(--blue-soft);
  --p1:#0050A0;--p1i:#0050A0;--p1n:#FFFFFF;--p2:#B02020;--p2i:#B02020;--p2n:#FFFFFF;--p3:#F2C21A;--p3i:#7A5900;--p3n:#2E2200;--p4:#6F3D78;--p4i:#6F3D78;--p4n:#FFFFFF;
  --hero-a:#0050A0;--hero-b:#B02020;
  --leaf1:#0A62BA;--leaf2:#4C8FD6;--stem:#003E7E;--soil:#B9A58A;--pot:#B02020;--bloom:#B02020;--bloom2:#F2C21A;
  --shadow:0 1px 2px rgba(10,35,80,.07),0 8px 24px rgba(10,35,80,.08);--shadow-up:0 2px 4px rgba(10,35,80,.1),0 14px 30px rgba(10,35,80,.16);
  --glow-a:rgba(0,80,160,.12);--glow-b:rgba(176,32,32,.07);
"""
DARK = """
  --bg:#0C1220;--surface:#141D2E;--sunk:#0A101C;--ink:#E9EFF9;--muted:#9DB0C8;--line:#25344B;
  --blue:#78B0FF;--blue-soft:#12294B;--red:#FF8D95;--red-soft:#3A161D;--yellow:#F5C928;--gold:#F5C928;--gold-soft:#352A0B;
  --good:var(--blue);--good-soft:var(--blue-soft);
  --p1:#78B0FF;--p1i:#78B0FF;--p1n:#08213F;--p2:#FF8D95;--p2i:#FF8D95;--p2n:#3A0A10;--p3:#F5C928;--p3i:#F5C928;--p3n:#2E2200;--p4:#D08ADB;--p4i:#D08ADB;--p4n:#2B0B33;
  --hero-a:#0A3F85;--hero-b:#8A1A26;
  --leaf1:#78B0FF;--leaf2:#4C8FD6;--stem:#5C9CF0;--soil:#5A4C3A;--pot:#C4414D;--bloom:#FF8D95;--bloom2:#F5C928;
  --shadow:0 1px 2px rgba(0,0,0,.4),0 8px 24px rgba(0,0,0,.35);--shadow-up:0 2px 4px rgba(0,0,0,.5),0 14px 30px rgba(0,0,0,.5);
  --glow-a:rgba(120,176,255,.10);--glow-b:rgba(255,141,149,.06);
  color-scheme:dark;
"""

CSS = """
*,*::before,*::after{box-sizing:inherit}
html{scroll-behavior:smooth}
body{margin:0;color:var(--ink);font:15px/1.55 'Public Sans',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
  background:radial-gradient(900px 420px at 92% -8%,var(--glow-a),transparent 70%),radial-gradient(760px 360px at -6% 2%,var(--glow-b),transparent 70%),var(--bg);background-attachment:fixed}
h1,h2,h3{font-family:'Montserrat','Public Sans',system-ui,sans-serif;font-weight:600;margin:0;line-height:1.2}
h1,h2,h3{font-weight:700;letter-spacing:-.01em}
h1{font-size:clamp(26px,4vw,36px);font-weight:800} h2{font-size:20px} h3{font-size:16.5px}
h4{margin:0;font-size:13px;font-weight:600;color:var(--muted)}
p{margin:0}
a{color:var(--blue)}
button,input,select,textarea{font:inherit;color:inherit}
select{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:5px 8px}
input[type=checkbox]{accent-color:var(--blue)}
:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
.muted{color:var(--muted)} .hint{font-size:12.5px;color:var(--muted)}
.ic{flex:0 0 auto;vertical-align:-3px}

/* ---- header ---- */
.top{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--surface) 88%,transparent);backdrop-filter:saturate(1.4) blur(10px);-webkit-backdrop-filter:saturate(1.4) blur(10px);border-bottom:1px solid var(--line)}
.top::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;background:linear-gradient(90deg,var(--hero-a),var(--hero-b) 72%,var(--yellow));opacity:.95}
.top-in{max-width:1180px;margin:0 auto;padding:10px 20px;display:flex;gap:12px 20px;align-items:center;flex-wrap:wrap}
.brand{margin-right:auto;display:flex;align-items:center;gap:11px;font-family:'Montserrat','Public Sans',system-ui,sans-serif;font-weight:800;font-size:16.5px;line-height:1.25;color:var(--red)}
.brand small{display:block;font-family:'Public Sans',system-ui,sans-serif;font-weight:400;font-size:12.5px;color:var(--muted)}
.logo{width:36px;height:36px;border-radius:11px;background:linear-gradient(180deg,var(--hero-a),var(--hero-b));display:grid;place-items:center;color:#fff;box-shadow:var(--shadow);position:relative}
.logo::after{content:"";position:absolute;right:-3px;bottom:-3px;width:11px;height:11px;border-radius:50%;background:var(--yellow);border:2px solid var(--surface)}
.tabs{display:flex;gap:2px;flex-wrap:wrap}
.tab{border:0;background:none;padding:8px 13px;border-radius:999px;font-weight:500;color:var(--muted);cursor:pointer;transition:background .2s,color .2s}
.tab:hover{color:var(--ink);background:var(--sunk)}
.tab[aria-current="page"]{background:var(--blue-soft);color:var(--blue)}
.tab .count{display:inline-block;min-width:20px;padding:0 6px;margin-left:4px;border-radius:10px;background:var(--gold-soft);color:var(--gold);font-size:12px;text-align:center}
.who-chip{font-size:13px;color:var(--muted)}
.proto{max-width:1180px;margin:0 auto;padding:12px 20px 0;display:flex;gap:8px 16px;flex-wrap:wrap;align-items:center;font-size:13px;color:var(--muted)}
.proto select{padding:5px 10px;border:1px solid var(--line);border-radius:8px;background:var(--surface)}
.linkbtn{border:0;background:none;padding:0;color:var(--blue);text-decoration:underline;cursor:pointer;font-size:inherit}
main{max-width:1180px;margin:0 auto;padding:8px 20px 64px}

/* ---- the banner: blue at the top fading to red, like the numerals on the FSK poster ---- */
.hero2,.banner{position:relative;overflow:hidden;margin-top:18px;border-radius:22px;color:#fff;box-shadow:var(--shadow-up);
  background:linear-gradient(180deg,var(--hero-a) 0%,var(--hero-b) 100%)}
.hero2{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(250px,1fr) minmax(230px,.9fr);gap:20px 24px;align-items:center;padding:30px 28px 30px 56px}
.banner{padding:22px 28px 22px 56px;min-height:104px;display:flex;flex-direction:column;justify-content:center}
.banner h1{font-size:clamp(22px,3.2vw,30px)}
.hero-bg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.hero-bg .doodles{animation:doodle 70s linear infinite}
.hero-bg .fl{fill:var(--yellow);animation:floaty 6s ease-in-out infinite}
.hero-bg .fl.f2{animation-duration:8s;animation-delay:-3s} .hero-bg .fl.f3{animation-duration:7s;animation-delay:-5s}
.hero-bg .ring{fill:none;stroke:#fff;stroke-width:2;opacity:.35;animation:breathe 6s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
.accent-bar{position:absolute;left:21px;top:0;width:6px;height:58px;background:var(--yellow);border-radius:0 0 3px 3px}
.accent-dot{position:absolute;left:11px;top:52px;width:26px;height:26px;border-radius:50%;background:var(--yellow);box-shadow:0 0 0 4px rgba(255,255,255,.18)}
.hero2>*:not(.hero-bg):not(.accent-bar):not(.accent-dot),.banner>*:not(.hero-bg):not(.accent-bar):not(.accent-dot){position:relative}
.hero2 h1,.banner h1{color:#fff}
.hero2 h1::after,.banner h1::after{content:"";display:block;width:88px;height:5px;border-radius:3px;background:var(--yellow);margin-top:10px}
.eyebrow{font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#fff;opacity:.92;margin-bottom:6px}
.hero-sub{margin-top:12px;color:#fff;opacity:.95;max-width:44ch}
.banner .hero-sub{margin-top:8px}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.chip{font-size:13px;padding:3px 11px;border-radius:999px;background:var(--sunk);color:var(--muted);border:1px solid var(--line)}
.hero2 .chip{background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.42);color:#fff}
.hero2 .chip.good{background:#fff;border-color:#fff;color:#0050A0}
.hero2 .chip.warn{background:var(--yellow);border-color:var(--yellow);color:#2E2200}
.hero2 .chip.bad{background:#fff;border-color:#fff;color:#B02020}
.chip.good{background:var(--blue-soft);color:var(--blue);border-color:transparent} .chip.warn{background:var(--gold-soft);color:var(--gold);border-color:transparent} .chip.bad{background:var(--red-soft);color:var(--red);border-color:transparent}
.hero2 .btn.ghost{color:#fff;border-color:#fff}
.hero2 .btn.ghost:hover{background:rgba(255,255,255,.16)}
.board{background:var(--surface);color:var(--ink);border-radius:20px;padding:18px 20px 14px;box-shadow:var(--shadow-up)}
.board .stats{margin-bottom:8px}
.board .hint{margin-top:4px}
.ready{border-radius:16px;padding:16px 18px;border:1px solid transparent;display:grid;gap:8px;box-shadow:var(--shadow-up)}
.ready h2{font-size:18px;display:flex;gap:8px;align-items:center}
.ready p{font-size:14px;color:var(--ink);opacity:.92}
.ready.notcleared{background:var(--red-soft);color:var(--red)}
.ready.supervised{background:var(--gold-soft);color:var(--gold)}
.ready.independent{background:var(--blue-soft);color:var(--blue)}
.ready input[type=text]{background:var(--surface)}
.hero-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}

/* ---- big numbers: blue fading to red with a yellow underline, as on the poster ---- */
.stats{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:12px}
.gnum{font-family:'Montserrat','Public Sans',system-ui,sans-serif;font-weight:800;font-size:46px;line-height:1;letter-spacing:-.02em;font-variant-numeric:tabular-nums;
  background:linear-gradient(180deg,var(--blue) 18%,var(--red) 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:var(--blue)}
.gnum small{font-size:18px;font-weight:800;letter-spacing:0}
.stat .uline{height:3px;border-radius:2px;background:var(--yellow);margin:8px 0 9px}
.stat .slab{display:flex;gap:8px;align-items:center;font-weight:800;font-size:12.5px;letter-spacing:.03em;text-transform:uppercase;color:var(--blue);line-height:1.15}
.stat .slab .ic{width:22px;height:22px}

/* ---- milestone medals ---- */
.badges{margin:22px 0 4px}
.badges h3{display:flex;gap:8px;align-items:center;margin-bottom:12px}
.medals{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:12px}
.medalitem{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:12px 8px 10px;text-align:center;display:grid;gap:2px;justify-items:center;box-shadow:var(--shadow);position:relative}
.medalitem .mt{font-weight:700;font-size:13px;line-height:1.25}
.medalitem small{font-size:12px;color:var(--muted)}
.medalitem.off{box-shadow:none;background:transparent;border-style:dashed}
.medalitem.off .mt{color:var(--muted);font-weight:600}
.medalitem.new::after{content:"New";position:absolute;top:8px;right:8px;background:var(--yellow);color:#2E2200;font-size:11px;font-weight:800;padding:1px 8px;border-radius:999px}
.medal .ribbon{fill:var(--yellow)} .medal .ribbon.r2{fill:var(--yellow);opacity:.8}
.medal .disc{fill:url(#medalGrad)} .medal .rim{fill:none;stroke:var(--yellow);stroke-width:2.5}
.medal .glyph{color:#fff}
.medal.off .ribbon,.medal.off .ribbon.r2{fill:var(--line);opacity:1}
.medal.off .disc{fill:var(--sunk);stroke:var(--line);stroke-width:2}
.medal.off .rim{stroke:var(--line);stroke-dasharray:3 4}
.medal.off .glyph{color:var(--muted);opacity:.7}
.medalitem.on:hover .medal{animation:wiggle .6s ease}
@keyframes wiggle{0%,100%{transform:rotate(0)}25%{transform:rotate(-6deg)}75%{transform:rotate(6deg)}}

/* ---- cycle path ---- */
.pathwrap{overflow-x:auto;margin:22px 0 28px;padding:6px 4px 8px}
.path{display:flex;align-items:flex-start;min-width:860px}
.node{--pc:var(--p1);flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;border:0;background:none;cursor:pointer;padding:0;position:relative}
.node::before{content:"";position:absolute;top:22px;left:-50%;width:100%;height:4px;border-radius:2px;background:var(--line);z-index:0}
.node.first::before{display:none}
.node.done::before{background:var(--pc)}
.dot{width:46px;height:46px;border-radius:50%;display:grid;place-items:center;position:relative;z-index:1;background:conic-gradient(var(--pc) var(--f),var(--line) 0);transition:transform .2s}
.node:hover .dot{transform:scale(1.07)}
.dot span{width:36px;height:36px;border-radius:50%;background:var(--surface);display:grid;place-items:center;font-weight:600;font-size:14px}
.node.full .dot span{background:var(--pc);color:var(--pcn,var(--surface))}
.node.sel .dot{box-shadow:0 0 0 3px var(--bg),0 0 0 5px var(--ink)}
.node.here .dot::after{content:"";position:absolute;inset:-5px;border-radius:50%;border:2px solid var(--pc);animation:ping 2.4s ease-out infinite}
.node .cl{font-size:12px;font-weight:700;color:var(--pci,var(--pc));min-height:16px;white-space:nowrap}
.node .cd{font-size:11.5px;color:var(--muted);white-space:nowrap}
.node .now{font-size:11px;font-weight:600;color:var(--blue);background:var(--blue-soft);border-radius:999px;padding:0 8px}
.gatemark{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:6px;padding:0 6px;position:relative;z-index:1}
.gatemark .bar{width:16px;height:46px;border-radius:5px;background:var(--gold-soft);border:2px solid var(--gold);display:grid;place-items:center;color:var(--gold)}
.gatemark.open .bar{background:var(--good-soft);border-color:var(--good);color:var(--good);animation:glow 3s ease-in-out infinite}
.gatemark span{font-size:11.5px;line-height:1.25;color:var(--gold);text-align:center;max-width:84px}
.gatemark.open span{color:var(--good)}

/* ---- layout and cards ---- */
.cols{display:grid;grid-template-columns:1fr 340px;gap:28px;align-items:start}
.sechead{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.task{--pc:var(--p1);background:var(--surface);border:1px solid var(--line);border-left:4px solid var(--pc);border-radius:14px;margin-bottom:10px;box-shadow:var(--shadow);transition:transform .2s,box-shadow .2s}
.task:hover{box-shadow:var(--shadow-up);transform:translateY(-1px)}
.task[open]{box-shadow:var(--shadow-up)}
.task>summary{list-style:none;cursor:pointer;padding:14px 16px;display:grid;grid-template-columns:48px 1fr auto;gap:4px 12px;align-items:center}
.task>summary::-webkit-details-marker{display:none}
.tid{font-weight:600;color:var(--muted);font-variant-numeric:tabular-nums}
.tname{font-weight:600}
.ttopic{grid-column:2;font-size:13px;color:var(--muted);display:flex;gap:6px;align-items:center}
.ttopic .ic{color:var(--pci,var(--pc))}
.pills{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.pill{font-size:12.5px;padding:2px 10px;border-radius:999px;background:var(--sunk);color:var(--muted);white-space:nowrap;display:inline-flex;gap:5px;align-items:center}
.pill .ic{width:13px;height:13px}
.pill.gate{background:var(--gold-soft);color:var(--gold)}
.pill.s-progress{background:var(--blue-soft);color:var(--blue)}
.pill.s-submitted{background:var(--gold-soft);color:var(--gold)}
.pill.s-complete,.pill.s-exempt{background:var(--blue);color:var(--surface)}
.pill.s-partial{background:var(--gold-soft);color:var(--gold)}
.pill.s-rework{background:var(--red-soft);color:var(--red)}
.tbody{padding:2px 16px 16px 76px;display:grid;gap:14px}
.kv p{white-space:pre-line}
.res{margin:0;padding:0;list-style:none;display:grid;gap:4px}
.res li{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
.res .nolink{color:var(--muted);font-size:13px}
.field{display:grid;gap:4px}
.field label,.lbl{font-size:13px;font-weight:600;color:var(--muted)}
input[type=text],input[type=url],input[type=number],input[type=date],textarea,select.big{width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:10px;background:var(--bg)}
textarea{min-height:76px;resize:vertical}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.btn{border:1px solid var(--blue);background:var(--blue);color:var(--surface);padding:8px 15px;border-radius:10px;font-weight:600;cursor:pointer;transition:transform .12s,box-shadow .2s,opacity .2s}
.btn:hover{box-shadow:var(--shadow)} .btn:active{transform:translateY(1px)}
.btn.ghost{background:transparent;color:var(--blue)}
.btn.danger{border-color:var(--red);color:var(--red);background:transparent}
.btn.small{padding:5px 11px;font-size:13px}
.note{border-left:3px solid var(--line);padding:7px 12px;background:var(--sunk);border-radius:0 10px 10px 0;font-size:14px;white-space:pre-line}
.note.red{border-color:var(--red)} .note.green{border-color:var(--good)} .note.amber{border-color:var(--gold)}
.files{list-style:none;margin:0;padding:0;display:grid;gap:4px;font-size:14px}
.files li{display:grid;gap:8px}
.filerow{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.viewer{border:1px solid var(--line);border-radius:12px;background:var(--bg);padding:10px;overflow:auto;max-height:640px}
.viewer[hidden]{display:none}
.vimg{max-width:100%;height:auto;display:block;margin:0 auto;border-radius:6px}
.vtext{margin:0;white-space:pre-wrap;word-break:break-word;font:13.5px/1.5 ui-monospace,Menlo,Consolas,monospace}
.vdoc{width:100%;height:340px;border:0;border-radius:6px;background:#fff}
.pdfpages{display:grid;gap:10px;justify-items:center}
.pdfpages canvas{width:100%;max-width:900px;height:auto;background:#fff;border:1px solid var(--line);border-radius:4px}
.filepick{display:inline-block}
.filepick input{position:absolute;opacity:0;width:1px;height:1px}
.filepick label{display:inline-block;cursor:pointer}
.filepick input:focus-visible+label{outline:2px solid var(--blue);outline-offset:2px}

aside .card,.card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:16px;margin-bottom:14px;box-shadow:var(--shadow)}
.card h3{display:flex;gap:8px;align-items:center;margin-bottom:10px}
.meter{margin-bottom:14px}
.meter .lab{display:flex;justify-content:space-between;font-size:14px;margin-bottom:6px}
.meter .lab b{font-variant-numeric:tabular-nums}
.track{height:10px;border-radius:5px;background:var(--sunk);overflow:hidden}
.track i{display:block;height:100%;border-radius:5px;background:linear-gradient(90deg,var(--blue),var(--red));transform-origin:left}
.gl{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:7px;font-size:14px}
.gl li{display:grid;grid-template-columns:18px 1fr;gap:8px;align-items:start}
.gl .ic2{width:14px;height:14px;border-radius:50%;margin-top:4px;border:2px solid var(--line)}
.gl .pass .ic2{background:var(--blue);border-color:var(--blue)}
.gl .attention .ic2{background:var(--red);border-color:var(--red)}
.gl .open .ic2{border-color:var(--gold)}
.gl small{display:block;color:var(--muted);font-size:12.5px}
aside details>summary{cursor:pointer;font-weight:600;font-family:'Montserrat','Public Sans',system-ui,sans-serif;font-size:17px}
.nextup{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.nextup button{width:100%;text-align:left;border:1px solid var(--line);background:var(--bg);border-radius:12px;padding:9px 12px;cursor:pointer;display:grid;grid-template-columns:auto 1fr;gap:2px 10px;align-items:center;transition:border-color .2s,transform .15s}
.nextup button:hover{border-color:var(--blue);transform:translateX(2px)}
.nextup .ic{color:var(--pci,var(--blue))}
.nextup b{font-weight:600} .nextup small{grid-column:2;color:var(--muted);font-size:12.5px}

/* ---- since you last visited ---- */
.changes{margin:18px 0 0;border-radius:18px;border:1px solid var(--line);background:var(--surface);box-shadow:var(--shadow);padding:14px 18px;display:grid;gap:8px}
.changes .hd{display:flex;justify-content:space-between;align-items:center;gap:12px}
.changes ul{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.changes li{display:flex;gap:10px;align-items:flex-start;font-size:14.5px}
.changes .badge{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;flex:0 0 auto}
.changes .good .badge{background:var(--good-soft);color:var(--good)}
.changes .warn .badge{background:var(--gold-soft);color:var(--gold)}
.changes .bad .badge{background:var(--red-soft);color:var(--red)}
.changes .star .badge{background:var(--yellow);color:#2E2200}

/* ---- reviews, team, tiles ---- */
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin:18px 0 8px}
.tile{display:flex;gap:14px;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:14px 16px;box-shadow:var(--shadow)}
.tile .ti{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;background:var(--blue-soft);color:var(--blue);flex:0 0 auto}
.tile.amber .ti{background:var(--gold-soft);color:var(--gold)} .tile.green .ti{background:var(--blue-soft);color:var(--blue)} .tile.red .ti{background:var(--red-soft);color:var(--red)}
.tile .tn{font-family:'Montserrat','Public Sans',system-ui,sans-serif;font-size:30px;font-weight:800;line-height:1.05;font-variant-numeric:tabular-nums;background:linear-gradient(180deg,var(--blue) 20%,var(--red) 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:var(--blue)}
.tile .tl{font-size:13px;color:var(--muted)}
.rv{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:18px;margin-bottom:14px;display:grid;gap:12px;box-shadow:var(--shadow)}
.rvhead{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start}
.rvwho{display:flex;gap:12px;align-items:center}
.avatar{width:42px;height:42px;border-radius:50%;background:linear-gradient(180deg,var(--blue-soft),var(--red-soft));color:var(--blue);display:grid;place-items:center;font-weight:600;font-size:14px;flex:0 0 auto}
.who{font-family:'Montserrat','Public Sans',system-ui,sans-serif;font-weight:600;font-size:18px;line-height:1.2}
.rvchips{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 16px}
.chipbtn{border:1px solid var(--line);background:var(--surface);color:var(--ink);padding:6px 12px;border-radius:999px;cursor:pointer;font-size:14px;transition:border-color .2s}
.chipbtn:hover{border-color:var(--blue)}
.chipbtn b{margin-left:4px;color:var(--gold)}
.chipbtn.on{border-color:var(--blue);background:var(--blue-soft);color:var(--blue)}
.chipbtn.on b{color:var(--blue)}
.assessform{display:grid;gap:12px;border-top:1px solid var(--line);padding-top:14px}
fieldset{border:0;padding:0;margin:0;min-width:0}
legend{padding:0;margin-bottom:6px}
.scale{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.seg{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:6px}
.scale input,.seg input{position:absolute;opacity:0;pointer-events:none}
.scale label,.seg label{border:1px solid var(--line);border-radius:10px;padding:8px;cursor:pointer;font-size:13px;text-align:center;background:var(--bg);display:block;transition:border-color .15s,background .15s}
.scale label:hover,.seg label:hover{border-color:var(--blue)}
.scale label b{display:block;font-size:17px}
.scale input:checked+label,.seg input:checked+label{border-color:var(--blue);background:var(--blue-soft);color:var(--blue)}
.scale input:focus-visible+label,.seg input:focus-visible+label{outline:2px solid var(--blue);outline-offset:2px}
.empty{padding:34px 20px;text-align:center;border:1px dashed var(--line);border-radius:18px;color:var(--muted);display:grid;gap:10px;justify-items:center;background:color-mix(in srgb,var(--surface) 55%,transparent)}
.empty .ea{width:132px;height:auto}
.empty h3{color:var(--ink)}
.lede{max-width:68ch;margin:16px 0 8px;color:var(--muted)}
.tablewrap{overflow-x:auto;background:var(--surface);border:1px solid var(--line);border-radius:16px;margin-bottom:18px;box-shadow:var(--shadow)}
table{border-collapse:collapse;width:100%;min-width:820px;font-size:14px}
table.team{min-width:1000px}
table.team td,table.team th{white-space:nowrap;padding:12px 11px}
th,td{text-align:left;padding:12px 14px;border-bottom:1px solid var(--line);vertical-align:middle}
th{font-weight:600;color:var(--muted);font-size:13px}
tr:last-child td{border-bottom:0}
td.num{font-variant-numeric:tabular-nums}
.mini{display:flex;gap:8px;align-items:center;min-width:110px}
.mini .t{flex:1;height:7px;border-radius:4px;background:var(--sunk);overflow:hidden}
.mini .t i{display:block;height:100%;border-radius:4px;background:linear-gradient(90deg,var(--blue),var(--red))}
.mini b{font-weight:600;font-size:13px;width:38px;text-align:right}
.rbadge{font-size:12.5px;padding:3px 10px;border-radius:999px;white-space:nowrap}
.rbadge.notcleared{background:var(--red-soft);color:var(--red)}
.rbadge.supervised{background:var(--gold-soft);color:var(--gold)}
.rbadge.independent{background:var(--good-soft);color:var(--good)}
.panel{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:16px;margin-bottom:18px;display:grid;gap:12px;box-shadow:var(--shadow)}
.formgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;align-items:end}
.checks{display:flex;gap:6px 16px;flex-wrap:wrap}
.checks label{display:flex;gap:6px;align-items:center;font-size:14px;font-weight:400;color:var(--ink)}
.topic{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:18px;margin-bottom:14px;display:grid;gap:12px;box-shadow:var(--shadow)}
.topic .th{display:flex;justify-content:space-between;gap:12px;align-items:baseline;flex-wrap:wrap}
.resrow{display:grid;grid-template-columns:1fr 1.3fr 1fr auto;gap:8px;margin-bottom:8px}
.tasklist{margin:0;padding:12px 0 0;border-top:1px solid var(--line);list-style:none;display:grid;gap:8px;font-size:14px}
.tasklist li{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
.tasklist li.off{opacity:.55}
.tasklist .grow{flex:1;min-width:160px}
.taskform{border:1px solid var(--line);border-radius:12px;padding:14px;background:var(--bg);display:grid;gap:10px;margin:4px 0 8px}
.guide{display:grid;gap:14px;max-width:760px}
.guide dl{margin:0;display:grid;grid-template-columns:max-content 1fr;gap:6px 16px}
.guide dt{font-weight:600}
.guide dd{margin:0}
.center{max-width:520px;margin:70px auto;text-align:center;display:grid;gap:12px;padding:0 20px;justify-items:center}
.center .ea{width:150px;height:auto}
.toast{position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:var(--ink);color:var(--surface);padding:10px 16px;border-radius:12px;font-size:14px;z-index:20;max-width:90vw;display:none;box-shadow:var(--shadow-up)}
.toast.err{background:var(--red);color:#fff}
.toast.show{display:block}
body.busy .btn{opacity:.6;pointer-events:none}
.confetti{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:30}

/* ---- empty-state art ---- */
.ea .blob{fill:var(--blue-soft)} .ea .line{stroke:var(--blue);fill:none;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
.ea .acc{fill:var(--yellow);stroke:none} .ea .floaty{animation:floaty 4.5s ease-in-out infinite}
.ea .draw{stroke-dasharray:120;stroke-dashoffset:120;animation:draw 1.1s .3s ease-out forwards}

/* ---- motion (all of it switched off for people who ask for less) ---- */
@keyframes sway{0%,100%{transform:rotate(-1.8deg)}50%{transform:rotate(1.8deg)}}
@keyframes pop{from{opacity:0;transform:scale(.2)}to{opacity:1;transform:scale(1)}}
@keyframes doodle{from{transform:translateX(0)}to{transform:translateX(-240px)}}
@keyframes breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
@keyframes ping{0%{transform:scale(.9);opacity:.9}80%,100%{transform:scale(1.35);opacity:0}}
@keyframes glow{0%,100%{box-shadow:0 0 0 0 transparent}50%{box-shadow:0 0 0 5px color-mix(in srgb,var(--good) 22%,transparent)}}
@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes floaty{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes draw{to{stroke-dashoffset:0}}
body.intro .medal.on{animation:pop .6s cubic-bezier(.2,1.4,.4,1) both}
body.intro .track i{animation:grow .9s cubic-bezier(.2,.8,.2,1) both}
body.intro .task,body.intro .tile,body.intro .rv,body.intro .card,body.intro .changes{animation:fadeUp .5s ease both}
body.intro .task:nth-child(2),body.intro .tile:nth-child(2){animation-delay:.05s} body.intro .task:nth-child(3),body.intro .tile:nth-child(3){animation-delay:.1s}
body.intro .task:nth-child(4),body.intro .tile:nth-child(4){animation-delay:.15s} body.intro .task:nth-child(n+5){animation-delay:.2s}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}

@media (max-width:900px){
  .hero2{grid-template-columns:1fr;padding:22px 20px}
  .hero2{padding-left:44px}
  .stats .gnum{font-size:40px}
  .cols{grid-template-columns:1fr}
  .tbody{padding-left:16px}
  .task>summary{grid-template-columns:40px 1fr}
  .pills{grid-column:1/-1;justify-content:flex-start}
  .resrow{grid-template-columns:1fr}
  .scale{grid-template-columns:repeat(2,1fr)}
  .guide dl{grid-template-columns:1fr}
}
"""

out = "<style>\n:root{" + LIGHT + "\n  box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);color-scheme:light;}\n" \
    + "@media (prefers-color-scheme:dark){:root:not([data-theme=\"light\"]){" + DARK + "}}\n" \
    + ":root[data-theme=\"dark\"]{" + DARK + "}\n" + CSS + "</style>\n"
(root / "apps-script" / "Styles.html").write_text(out, encoding="utf-8")
print("Styles.html", len(out.splitlines()), "lines")
