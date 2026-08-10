import sys, pathlib
sys.path.insert(0, "/tmp")
from render import shot

W, H = 1080, 1350
HERE = pathlib.Path(".").resolve()

# The phone screen is laid out at a real phone's width (390 CSS px) using the
# app's OWN compiled stylesheet, then scaled up. So the type, the spacing and
# every colour are the app's, not an impression of it. Scaling rather than
# widening matters: laying the app out at 700px would give tablet proportions
# and tiny type, which is what makes a mockup look like a mockup.
PHONE_W, PHONE_H, SCALE = 390, 566, 1.60

SCREEN = """
<div class="app">
  <header class="topbar">
    <svg class="brandmark" viewBox="0 0 40 40" fill="none">
      <circle cx="15" cy="20" r="11.5" fill="var(--yours)"/>
      <circle cx="25" cy="20" r="11.5" stroke="var(--ink)" stroke-width="2.6"/>
    </svg>
    <div><div class="eyebrow">Training - Thursday</div><h1 class="serif">Your session back</h1></div>
  </header>
  <div class="screen stack" style="padding-bottom:16px">
    <div class="card md">
      <h2>What went well</h2>
      <ul><li>You said the keeper started three moves calmly and the centre backs split well.</li></ul>
      <h2>What got in the way</h2>
      <ul><li>You said they went long instead of playing out, three times.</li></ul>
      <h2>Noted for next</h2>
      <ul><li>You said you would give them a picture of where the spare man is.</li></ul>
      <h2>Looking back</h2>
      <p>What would you do differently, if anything?</p>
    </div>
  </div>
</div>
"""

html = f"""
<link rel="stylesheet" href="app.css">
<style>
  html,body{{margin:0;padding:0;background:#22272b}}
  .c{{width:{W}px;height:{H}px;background:#22272b;color:#edebe4;box-sizing:border-box;
     font-family:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
     padding:76px 80px 70px;display:flex;flex-direction:column;justify-content:space-between}}
  .serifm{{font-family:"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,serif}}
  .top{{display:flex;align-items:center;gap:20px}}
  .word{{font-size:31px;letter-spacing:-.01em}} .word b{{font-weight:600}}
  .rule{{height:1px;background:#3f474d}}
  .foot{{display:flex;justify-content:space-between;align-items:center;font-size:26px;color:#93a3ac}}
  .foot .u{{color:#8fb3cc}}
  .y{{color:#e3c567}}
  h1.big{{margin:0;font-weight:600;letter-spacing:-.022em;font-size:74px;line-height:1.03}}

  /* The device. A drawn edge rather than a glossy render, because a shadow and
     a highlight would be the first thing in this whole brand to pretend at
     depth. */
  .device{{width:{int(PHONE_W*SCALE)}px;height:{int(PHONE_H*SCALE)}px;margin:0 auto;
    border:10px solid #11161a;border-radius:52px;overflow:hidden;background:#22272b;position:relative}}
  .viewport{{width:{PHONE_W}px;height:{PHONE_H}px;transform:scale({SCALE});transform-origin:top left}}
</style>
<div class="c">
  <div>
    <div class="top">
      <svg width="54" height="54" viewBox="0 0 40 40" fill="none">
        <circle cx="15" cy="20" r="11.5" fill="#e3c567"/>
        <circle cx="25" cy="20" r="11.5" stroke="#edebe4" stroke-width="2.6"/>
      </svg>
      <div class="word serifm">Reflective <b>Lens</b></div>
    </div>
  </div>

  <div class="device"><div class="viewport">{SCREEN}</div></div>

  <div>
    <div class="serifm" style="font-size:46px;line-height:1.25;margin-bottom:18px">
      This is what comes back.
    </div>
    <div style="font-size:31px;line-height:1.4;margin-bottom:26px;color:#93a3ac">
      Everything in <span class="y">yellow</span> is something you said.
      Everything in grey is the app.
    </div>
    <div class="rule" style="margin-bottom:24px"></div>
    <div class="foot"><span>It never marks you.</span><span class="u">reflectivelens.co.uk</span></div>
  </div>
</div>
"""
p = HERE / "_wa2.html"; p.write_text(html)
shot(str(p), "wa-2-proof.png", W, H)
