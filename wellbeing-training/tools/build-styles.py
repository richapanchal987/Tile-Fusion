#!/usr/bin/env python3
"""Builds apps-script/Styles.html.

Every colour is a CSS variable with a light and a dark value, defined once here and written into both the
automatic (prefers-color-scheme) and the manual ([data-theme]) dark blocks so they cannot drift apart.
Run from the wellbeing-training folder:  python3 tools/build-styles.py
"""
import pathlib
root = pathlib.Path(__file__).resolve().parent.parent

LIGHT = """
  --bg:#F2F5F4;--surface:#FFFFFF;--sunk:#E8EEEC;--ink:#1C2B36;--muted:#55656D;--line:#D3DDDA;
  --teal:#1F5E5A;--teal-soft:#DCEAE6;--amber:#85550F;--amber-soft:#F6EBD6;--red:#A9443A;--red-soft:#F5E0DC;--green:#2B6F48;--green-soft:#DCEFE2;
  --p1:#1F5E5A;--p2:#3B5BA5;--p3:#85550F;--p4:#7A4A8C;
  --hero-a:#D5E8E3;--hero-b:#FFFFFF;--cloud:rgba(255,255,255,.55);--sun:#F2B84B;
  --leaf1:#2B6F48;--leaf2:#4A9468;--stem:#2B6F48;--soil:#B9A58A;--pot:#C9806A;--bloom:#D9776A;--bloom2:#E7B04A;
  --shadow:0 1px 2px rgba(20,40,40,.06),0 8px 24px rgba(20,40,40,.07);--shadow-up:0 2px 4px rgba(20,40,40,.08),0 14px 30px rgba(20,40,40,.12);
  --glow-a:rgba(31,94,90,.13);--glow-b:rgba(133,85,15,.10);
"""
DARK = """
  --bg:#11181C;--surface:#182227;--sunk:#0E1417;--ink:#E3EBE9;--muted:#9AABB0;--line:#2A3940;
  --teal:#7CC4BA;--teal-soft:#1C3532;--amber:#E3AE55;--amber-soft:#382C17;--red:#E68C80;--red-soft:#3A2220;--green:#82CC9F;--green-soft:#1B3325;
  --p1:#7CC4BA;--p2:#9DB4F0;--p3:#E3AE55;--p4:#D2A6E0;
  --hero-a:#1C3532;--hero-b:#182227;--cloud:rgba(255,255,255,.07);--sun:#E3AE55;
  --leaf1:#82CC9F;--leaf2:#5FB07F;--stem:#6FBF8E;--soil:#5A4C3A;--pot:#B5705B;--bloom:#F09A8E;--bloom2:#F2C46B;
  --shadow:0 1px 2px rgba(0,0,0,.4),0 8px 24px rgba(0,0,0,.35);--shadow-up:0 2px 4px rgba(0,0,0,.5),0 14px 30px rgba(0,0,0,.5);
  --glow-a:rgba(124,196,186,.10);--glow-b:rgba(227,174,85,.06);
  color-scheme:dark;
"""

CSS = """
*,*::before,*::after{box-sizing:inherit}
html{scroll-behavior:smooth}
body{margin:0;color:var(--ink);font:15px/1.55 'Public Sans',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
  background:radial-gradient(900px 420px at 92% -8%,var(--glow-a),transparent 70%),radial-gradient(760px 360px at -6% 2%,var(--glow-b),transparent 70%),var(--bg);background-attachment:fixed}
h1,h2,h3{font-family:'Literata',Georgia,'Times New Roman',serif;font-weight:600;margin:0;line-height:1.2}
h1{font-size:clamp(28px,4.4vw,38px)} h2{font-size:21px} h3{font-size:17px}
h4{margin:0;font-size:13px;font-weight:600;color:var(--muted)}
p{margin:0}
a{color:var(--teal)}
button,input,select,textarea{font:inherit;color:inherit}
select{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:5px 8px}
input[type=checkbox]{accent-color:var(--teal)}
:focus-visible{outline:2px solid var(--teal);outline-offset:2px}
.muted{color:var(--muted)} .hint{font-size:12.5px;color:var(--muted)}
.ic{flex:0 0 auto;vertical-align:-3px}

/* ---- header ---- */
.top{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--surface) 88%,transparent);backdrop-filter:saturate(1.4) blur(10px);-webkit-backdrop-filter:saturate(1.4) blur(10px);border-bottom:1px solid var(--line)}
.top::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;background:linear-gradient(90deg,var(--p1),var(--p2),var(--p3),var(--p4));opacity:.75}
.top-in{max-width:1180px;margin:0 auto;padding:10px 20px;display:flex;gap:12px 20px;align-items:center;flex-wrap:wrap}
.brand{margin-right:auto;display:flex;align-items:center;gap:11px;font-family:'Literata',Georgia,serif;font-weight:600;font-size:17px;line-height:1.25}
.brand small{display:block;font-family:'Public Sans',system-ui,sans-serif;font-weight:400;font-size:12.5px;color:var(--muted)}
.logo{width:36px;height:36px;border-radius:11px;background:linear-gradient(145deg,var(--teal),color-mix(in srgb,var(--teal) 55%,var(--p2)));display:grid;place-items:center;color:var(--surface);box-shadow:var(--shadow)}
.tabs{display:flex;gap:2px;flex-wrap:wrap}
.tab{border:0;background:none;padding:8px 13px;border-radius:999px;font-weight:500;color:var(--muted);cursor:pointer;transition:background .2s,color .2s}
.tab:hover{color:var(--ink);background:var(--sunk)}
.tab[aria-current="page"]{background:var(--teal-soft);color:var(--teal)}
.tab .count{display:inline-block;min-width:20px;padding:0 6px;margin-left:4px;border-radius:10px;background:var(--amber-soft);color:var(--amber);font-size:12px;text-align:center}
.who-chip{font-size:13px;color:var(--muted)}
.proto{max-width:1180px;margin:0 auto;padding:12px 20px 0;display:flex;gap:8px 16px;flex-wrap:wrap;align-items:center;font-size:13px;color:var(--muted)}
.proto select{padding:5px 10px;border:1px solid var(--line);border-radius:8px;background:var(--surface)}
.linkbtn{border:0;background:none;padding:0;color:var(--teal);text-decoration:underline;cursor:pointer;font-size:inherit}
main{max-width:1180px;margin:0 auto;padding:8px 20px 64px}

/* ---- hero ---- */
.hero2{position:relative;overflow:hidden;margin-top:18px;border-radius:22px;border:1px solid var(--line);background:linear-gradient(135deg,var(--hero-a),var(--hero-b) 62%);box-shadow:var(--shadow);
  display:grid;grid-template-columns:minmax(0,1.5fr) minmax(150px,200px) minmax(250px,1fr);gap:20px 26px;align-items:center;padding:26px 28px}
.hero-bg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.hero-bg .cloud{fill:var(--cloud);animation:drift 38s linear infinite}
.hero-bg .cloud.c2{animation-duration:52s;animation-delay:-20s}
.hero-bg .cloud.c3{animation-duration:46s;animation-delay:-8s}
.hero-bg .sun{fill:var(--sun);opacity:.45;animation:breathe 7s ease-in-out infinite;transform-origin:center;transform-box:fill-box}
.hero2>*:not(.hero-bg){position:relative}
.eyebrow{font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--teal);margin-bottom:6px}
.hero-sub{margin-top:8px;color:var(--ink);opacity:.85;max-width:44ch}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.chip{font-size:13px;padding:3px 11px;border-radius:999px;background:color-mix(in srgb,var(--surface) 72%,transparent);color:var(--muted);border:1px solid var(--line)}
.chip.good{background:var(--green-soft);color:var(--green);border-color:transparent} .chip.warn{background:var(--amber-soft);color:var(--amber);border-color:transparent} .chip.bad{background:var(--red-soft);color:var(--red);border-color:transparent}
.growth{text-align:center}
.growth .plant{width:100%;max-width:190px;height:auto;display:block;margin:0 auto}
.growth .cap{font-size:13px;font-weight:600;color:var(--ink)}
.growth .sub{font-size:12px;color:var(--muted)}
.ready{border-radius:16px;padding:16px 18px;border:1px solid transparent;display:grid;gap:8px;box-shadow:var(--shadow)}
.ready h2{font-size:19px;display:flex;gap:8px;align-items:center}
.ready p{font-size:14px;color:var(--ink);opacity:.9}
.ready.notcleared{background:var(--red-soft);color:var(--red)}
.ready.supervised{background:var(--amber-soft);color:var(--amber)}
.ready.independent{background:var(--green-soft);color:var(--green)}
.ready input[type=text]{background:var(--surface)}
.hero-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}

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
.node.full .dot span{background:var(--pc);color:var(--surface)}
.node.sel .dot{box-shadow:0 0 0 3px var(--bg),0 0 0 5px var(--ink)}
.node.here .dot::after{content:"";position:absolute;inset:-5px;border-radius:50%;border:2px solid var(--pc);animation:ping 2.4s ease-out infinite}
.node .cl{font-size:12px;font-weight:600;color:var(--pc);min-height:16px;white-space:nowrap}
.node .cd{font-size:11.5px;color:var(--muted);white-space:nowrap}
.node .now{font-size:11px;font-weight:600;color:var(--teal);background:var(--teal-soft);border-radius:999px;padding:0 8px}
.gatemark{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:6px;padding:0 6px;position:relative;z-index:1}
.gatemark .bar{width:16px;height:46px;border-radius:5px;background:var(--amber-soft);border:2px solid var(--amber);display:grid;place-items:center;color:var(--amber)}
.gatemark.open .bar{background:var(--green-soft);border-color:var(--green);color:var(--green);animation:glow 3s ease-in-out infinite}
.gatemark span{font-size:11.5px;line-height:1.25;color:var(--amber);text-align:center;max-width:84px}
.gatemark.open span{color:var(--green)}

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
.ttopic .ic{color:var(--pc)}
.pills{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.pill{font-size:12.5px;padding:2px 10px;border-radius:999px;background:var(--sunk);color:var(--muted);white-space:nowrap;display:inline-flex;gap:5px;align-items:center}
.pill .ic{width:13px;height:13px}
.pill.gate{background:var(--amber-soft);color:var(--amber)}
.pill.s-progress{background:var(--teal-soft);color:var(--teal)}
.pill.s-submitted{background:var(--amber-soft);color:var(--amber)}
.pill.s-complete,.pill.s-exempt{background:var(--green-soft);color:var(--green)}
.pill.s-partial{background:var(--amber-soft);color:var(--amber)}
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
.btn{border:1px solid var(--teal);background:var(--teal);color:var(--surface);padding:8px 15px;border-radius:10px;font-weight:600;cursor:pointer;transition:transform .12s,box-shadow .2s,opacity .2s}
.btn:hover{box-shadow:var(--shadow)} .btn:active{transform:translateY(1px)}
.btn.ghost{background:transparent;color:var(--teal)}
.btn.danger{border-color:var(--red);color:var(--red);background:transparent}
.btn.small{padding:5px 11px;font-size:13px}
.note{border-left:3px solid var(--line);padding:7px 12px;background:var(--sunk);border-radius:0 10px 10px 0;font-size:14px;white-space:pre-line}
.note.red{border-color:var(--red)} .note.green{border-color:var(--green)} .note.amber{border-color:var(--amber)}
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
.filepick input:focus-visible+label{outline:2px solid var(--teal);outline-offset:2px}

aside .card,.card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:16px;margin-bottom:14px;box-shadow:var(--shadow)}
.card h3{display:flex;gap:8px;align-items:center;margin-bottom:10px}
.meter{margin-bottom:14px}
.meter .lab{display:flex;justify-content:space-between;font-size:14px;margin-bottom:6px}
.meter .lab b{font-variant-numeric:tabular-nums}
.track{height:10px;border-radius:5px;background:var(--sunk);overflow:hidden}
.track i{display:block;height:100%;border-radius:5px;background:linear-gradient(90deg,var(--teal),color-mix(in srgb,var(--teal) 60%,var(--p2)));transform-origin:left}
.gl{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:7px;font-size:14px}
.gl li{display:grid;grid-template-columns:18px 1fr;gap:8px;align-items:start}
.gl .ic2{width:14px;height:14px;border-radius:50%;margin-top:4px;border:2px solid var(--line)}
.gl .pass .ic2{background:var(--green);border-color:var(--green)}
.gl .attention .ic2{background:var(--red);border-color:var(--red)}
.gl .open .ic2{border-color:var(--amber)}
.gl small{display:block;color:var(--muted);font-size:12.5px}
aside details>summary{cursor:pointer;font-weight:600;font-family:'Literata',Georgia,serif;font-size:17px}
.nextup{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.nextup button{width:100%;text-align:left;border:1px solid var(--line);background:var(--bg);border-radius:12px;padding:9px 12px;cursor:pointer;display:grid;grid-template-columns:auto 1fr;gap:2px 10px;align-items:center;transition:border-color .2s,transform .15s}
.nextup button:hover{border-color:var(--teal);transform:translateX(2px)}
.nextup .ic{color:var(--pc,var(--teal))}
.nextup b{font-weight:600} .nextup small{grid-column:2;color:var(--muted);font-size:12.5px}

/* ---- since you last visited ---- */
.changes{margin:18px 0 0;border-radius:18px;border:1px solid var(--line);background:var(--surface);box-shadow:var(--shadow);padding:14px 18px;display:grid;gap:8px}
.changes .hd{display:flex;justify-content:space-between;align-items:center;gap:12px}
.changes ul{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.changes li{display:flex;gap:10px;align-items:flex-start;font-size:14.5px}
.changes .badge{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;flex:0 0 auto}
.changes .good .badge{background:var(--green-soft);color:var(--green)}
.changes .warn .badge{background:var(--amber-soft);color:var(--amber)}
.changes .bad .badge{background:var(--red-soft);color:var(--red)}
.changes .star .badge{background:var(--teal-soft);color:var(--teal)}

/* ---- reviews, team, tiles ---- */
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin:18px 0 8px}
.tile{display:flex;gap:14px;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:14px 16px;box-shadow:var(--shadow)}
.tile .ti{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;background:var(--teal-soft);color:var(--teal);flex:0 0 auto}
.tile.amber .ti{background:var(--amber-soft);color:var(--amber)} .tile.green .ti{background:var(--green-soft);color:var(--green)} .tile.red .ti{background:var(--red-soft);color:var(--red)}
.tile .tn{font-family:'Literata',Georgia,serif;font-size:28px;font-weight:600;line-height:1;font-variant-numeric:tabular-nums}
.tile .tl{font-size:13px;color:var(--muted)}
.rv{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:18px;margin-bottom:14px;display:grid;gap:12px;box-shadow:var(--shadow)}
.rvhead{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start}
.rvwho{display:flex;gap:12px;align-items:center}
.avatar{width:42px;height:42px;border-radius:50%;background:linear-gradient(145deg,var(--teal-soft),color-mix(in srgb,var(--teal-soft) 60%,var(--p2)));color:var(--teal);display:grid;place-items:center;font-weight:600;font-size:14px;flex:0 0 auto}
.who{font-family:'Literata',Georgia,serif;font-weight:600;font-size:18px;line-height:1.2}
.rvchips{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 16px}
.chipbtn{border:1px solid var(--line);background:var(--surface);color:var(--ink);padding:6px 12px;border-radius:999px;cursor:pointer;font-size:14px;transition:border-color .2s}
.chipbtn:hover{border-color:var(--teal)}
.chipbtn b{margin-left:4px;color:var(--amber)}
.chipbtn.on{border-color:var(--teal);background:var(--teal-soft);color:var(--teal)}
.chipbtn.on b{color:var(--teal)}
.assessform{display:grid;gap:12px;border-top:1px solid var(--line);padding-top:14px}
fieldset{border:0;padding:0;margin:0;min-width:0}
legend{padding:0;margin-bottom:6px}
.scale{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.seg{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:6px}
.scale input,.seg input{position:absolute;opacity:0;pointer-events:none}
.scale label,.seg label{border:1px solid var(--line);border-radius:10px;padding:8px;cursor:pointer;font-size:13px;text-align:center;background:var(--bg);display:block;transition:border-color .15s,background .15s}
.scale label:hover,.seg label:hover{border-color:var(--teal)}
.scale label b{display:block;font-size:17px}
.scale input:checked+label,.seg input:checked+label{border-color:var(--teal);background:var(--teal-soft);color:var(--teal)}
.scale input:focus-visible+label,.seg input:focus-visible+label{outline:2px solid var(--teal);outline-offset:2px}
.empty{padding:34px 20px;text-align:center;border:1px dashed var(--line);border-radius:18px;color:var(--muted);display:grid;gap:10px;justify-items:center;background:color-mix(in srgb,var(--surface) 55%,transparent)}
.empty .ea{width:132px;height:auto}
.empty h3{color:var(--ink)}
.lede{max-width:68ch;margin:16px 0 8px;color:var(--muted)}
.tablewrap{overflow-x:auto;background:var(--surface);border:1px solid var(--line);border-radius:16px;margin-bottom:18px;box-shadow:var(--shadow)}
table{border-collapse:collapse;width:100%;min-width:820px;font-size:14px}
table.team{min-width:1060px}
table.team td,table.team th{white-space:nowrap}
th,td{text-align:left;padding:12px 14px;border-bottom:1px solid var(--line);vertical-align:middle}
th{font-weight:600;color:var(--muted);font-size:13px}
tr:last-child td{border-bottom:0}
td.num{font-variant-numeric:tabular-nums}
.mini{display:flex;gap:8px;align-items:center;min-width:110px}
.mini .t{flex:1;height:7px;border-radius:4px;background:var(--sunk);overflow:hidden}
.mini .t i{display:block;height:100%;border-radius:4px;background:var(--teal)}
.mini b{font-weight:600;font-size:13px;width:38px;text-align:right}
.rbadge{font-size:12.5px;padding:3px 10px;border-radius:999px;white-space:nowrap}
.rbadge.notcleared{background:var(--red-soft);color:var(--red)}
.rbadge.supervised{background:var(--amber-soft);color:var(--amber)}
.rbadge.independent{background:var(--green-soft);color:var(--green)}
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

/* ---- the plant: every colour is a theme variable ---- */
.plant .soil{fill:var(--soil)} .plant .pot{fill:var(--pot)} .plant .stem{stroke:var(--stem);fill:none;stroke-linecap:round}
.plant .leaf{fill:var(--leaf1)} .plant .leaf.b{fill:var(--leaf2)}
.plant .petal{fill:var(--bloom)} .plant .petal.b{fill:var(--bloom2)} .plant .core{fill:var(--bloom2)} .plant .core.b{fill:var(--bloom)}
.plant .seed{fill:var(--soil);stroke:var(--stem);stroke-width:2}
.plant .sway{animation:sway 6s ease-in-out infinite}
.plant .leaf,.plant .petal,.plant .core{transform-box:fill-box;transform-origin:0% 60%}
.plant .petal,.plant .core{transform-origin:50% 50%}
.ea .blob{fill:var(--teal-soft)} .ea .line{stroke:var(--teal);fill:none;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
.ea .acc{fill:var(--amber-soft);stroke:var(--amber);stroke-width:2} .ea .floaty{animation:floaty 4.5s ease-in-out infinite}
.ea .draw{stroke-dasharray:120;stroke-dashoffset:120;animation:draw 1.1s .3s ease-out forwards}

/* ---- motion (all of it switched off for people who ask for less) ---- */
@keyframes sway{0%,100%{transform:rotate(-1.8deg)}50%{transform:rotate(1.8deg)}}
@keyframes pop{from{opacity:0;transform:scale(.2)}to{opacity:1;transform:scale(1)}}
@keyframes drift{from{transform:translateX(-12%)}to{transform:translateX(112%)}}
@keyframes breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
@keyframes ping{0%{transform:scale(.9);opacity:.9}80%,100%{transform:scale(1.35);opacity:0}}
@keyframes glow{0%,100%{box-shadow:0 0 0 0 transparent}50%{box-shadow:0 0 0 5px color-mix(in srgb,var(--green) 22%,transparent)}}
@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes floaty{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes draw{to{stroke-dashoffset:0}}
body.intro .plant .leaf,body.intro .plant .petal,body.intro .plant .core{animation:pop .6s cubic-bezier(.2,1.4,.4,1) both;animation-delay:calc(var(--i,0) * 90ms + .2s)}
body.intro .track i{animation:grow .9s cubic-bezier(.2,.8,.2,1) both}
body.intro .task,body.intro .tile,body.intro .rv,body.intro .card,body.intro .changes{animation:fadeUp .5s ease both}
body.intro .task:nth-child(2),body.intro .tile:nth-child(2){animation-delay:.05s} body.intro .task:nth-child(3),body.intro .tile:nth-child(3){animation-delay:.1s}
body.intro .task:nth-child(4),body.intro .tile:nth-child(4){animation-delay:.15s} body.intro .task:nth-child(n+5){animation-delay:.2s}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}

@media (max-width:900px){
  .hero2{grid-template-columns:1fr;padding:22px 20px}
  .growth{order:-1}
  .growth .plant{max-width:150px}
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
