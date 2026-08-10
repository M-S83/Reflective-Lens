import sys, pathlib
sys.path.insert(0, "/tmp")
from render import shot

W, H = 1080, 1350
HERE = pathlib.Path(".").resolve()

BASE = """
<style>
  html,body{margin:0;padding:0;background:#22272b}
  .c{width:%dpx;height:%dpx;background:#22272b;color:#edebe4;box-sizing:border-box;
     font-family:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
     padding:88px 80px 76px;display:flex;flex-direction:column;justify-content:space-between}
  .serif{font-family:"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,serif}
  .top{display:flex;align-items:center;gap:20px}
  .word{font-size:33px;letter-spacing:-.01em}.word b{font-weight:600}
  .rule{height:1px;background:#3f474d}
  .foot{display:flex;justify-content:space-between;align-items:center;font-size:27px;color:#93a3ac}
  .foot .u{color:#8fb3cc}
  .y{color:#e3c567}.d{color:#93a3ac}.b{color:#8fb3cc}
  h1{margin:0;font-weight:600;letter-spacing:-.025em}
</style>
""" % (W, H)

MARK = ('<svg width="58" height="58" viewBox="0 0 40 40" fill="none">'
        '<circle cx="15" cy="20" r="11.5" fill="#e3c567"/>'
        '<circle cx="25" cy="20" r="11.5" stroke="#edebe4" stroke-width="2.6"/></svg>')

def page(inner, name):
    html = BASE + '<div class="c">' + inner + '</div>'
    p = HERE / f"_wa_{name}.html"
    p.write_text(html)
    shot(str(p), f"wa-{name}.png", W, H)

head = f'<div class="top">{MARK}<div class="word serif">Reflective <b>Lens</b></div></div>'
foot = ('<div><div class="rule" style="margin-bottom:28px"></div>'
        '<div class="foot"><span>It never marks you.</span>'
        '<span class="u">reflectivelens.co.uk</span></div></div>')

# ---- 1. The ask -------------------------------------------------------------
page(f'''
  <div>
    {head}
    <h1 class="serif" style="font-size:132px;line-height:.98;margin-top:88px">
      Five coaches wanted.
    </h1>
    <div style="font-size:40px;line-height:1.4;color:#93a3ac;margin-top:48px">
      We have built a reflection app for grassroots coaches, and we need five
      people to use it properly and tell us where it falls over.
    </div>
  </div>
  <div>
    <div class="rule" style="margin-bottom:40px"></div>
    <div class="serif b" style="font-size:92px;line-height:1;font-weight:600">Free for life</div>
    <div class="d" style="font-size:38px;line-height:1.35;margin-top:20px">
      for the five who help us build it
    </div>
    <div class="rule" style="margin:44px 0 28px"></div>
    <div class="foot"><span>It never marks you.</span>
      <span class="u">reflectivelens.co.uk</span></div>
  </div>
''', "1-ask")

# ---- 2. The proof: the yellow rule, shown rather than claimed ---------------
page(f'''
  <div>
    {head}
    <h1 class="serif" style="font-size:96px;line-height:1.02;margin-top:64px">
      Your own words, given back <span class="y">organised</span>.
    </h1>
  </div>
  <div style="background:#2b3136;border:1px solid #3f474d;border-radius:6px;padding:44px 42px;margin:44px 0">
    <div style="font-size:24px;letter-spacing:.16em;text-transform:uppercase;color:#93a3ac;font-weight:600">What went well</div>
    <div class="serif y" style="font-size:37px;line-height:1.45;margin-top:16px">
      You said he showed excellent technique at times.
    </div>
    <div style="font-size:24px;letter-spacing:.16em;text-transform:uppercase;color:#93a3ac;font-weight:600;margin-top:38px">Noted for next</div>
    <div class="serif y" style="font-size:37px;line-height:1.45;margin-top:16px">
      You said you would run it at the weekend instead.
    </div>
    <div style="font-size:24px;letter-spacing:.16em;text-transform:uppercase;color:#93a3ac;font-weight:600;margin-top:38px">Looking back</div>
    <div class="d" style="font-size:33px;line-height:1.45;margin-top:16px">
      What would you do differently, if anything?
    </div>
  </div>
  <div>
    <div style="font-size:33px;line-height:1.4;color:#edebe4;margin-bottom:30px">
      Everything in <span class="y">yellow</span> is something you said.
      Everything in grey is the app.
    </div>
    {foot}
  </div>
''', "2-proof")

# ---- 3. What it takes ------------------------------------------------------
page(f'''
  <div>
    {head}
    <h1 class="serif" style="font-size:112px;line-height:1.0;margin-top:76px">
      A minute after training.
    </h1>
  </div>
  <div style="display:flex;flex-direction:column;gap:40px;margin:30px 0">
    <div>
      <div class="serif y" style="font-size:52px;line-height:1">01</div>
      <div style="font-size:36px;line-height:1.4;margin-top:10px">Talk to it in the car park, in your own words.</div>
    </div>
    <div class="rule"></div>
    <div>
      <div class="serif y" style="font-size:52px;line-height:1">02</div>
      <div style="font-size:36px;line-height:1.4;margin-top:10px">It tidies what you said and keeps track of what keeps coming up.</div>
    </div>
    <div class="rule"></div>
    <div>
      <div class="serif y" style="font-size:52px;line-height:1">03</div>
      <div style="font-size:36px;line-height:1.4;margin-top:10px">It asks you a question worth sitting with. It never tells you what to do.</div>
    </div>
  </div>
  {foot}
''', "3-how")
