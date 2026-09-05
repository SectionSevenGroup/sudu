from pathlib import Path
import re,hashlib
R=Path(__file__).resolve().parents[1]
if "bindToolTheme" in (R/'stack/stack.js').read_text():
 print('Tool footer patch already present')
 raise SystemExit(0)
def write(f,s): (R/f).write_text(s)
def change(f,a,b):
 p=R/f;s=p.read_text();assert a in s,(f,a);p.write_text(s.replace(a,b))
for f,key in [('stack/stack.css','stack'),('play/blocks/massing.css','massing')]:
 p=R/f;s=p.read_text()
 s=s.replace(f'--{key}-paper: #f3f1ea;',f'--{key}-paper: var(--ground, #F3F1EA);')
 s=s.replace(f'--{key}-ink: #24231f;',f'--{key}-ink: var(--ink, #171613);')
 s=s.replace(f'--{key}-accent: #ef5b2a;',f'--{key}-accent: var(--accent, #C0431F);')
 for rgb,token in [('36, 35, 31',f'--{key}-ink'),('243, 241, 234',f'--{key}-paper')]:
  s=re.sub(r'rgba\('+re.escape(rgb)+r',\s*([.\d]+)\)',lambda m:f'color-mix(in srgb, var({token}) {float(m[1])*100:g}%, transparent)',s)
 s=s.replace('color: #111;',f'color: var(--{key}-ink);').replace('border-bottom-color: #111;',f'border-bottom-color: var(--{key}-ink);')
 if key=='massing':
  s=re.sub(r'#suduBar,\nhtml.dm #suduBar \{.*?\}\n\n','',s,flags=re.S)
 p.write_text(s)
# Bind existing materials only, preserving camera, geometry and game physics.
change('stack/stack.js',"import { blockTilt", "import { bindToolTheme } from '/js/tool-theme.js';\nimport { blockTilt")
change('stack/stack.js','  function setInstruction(text) {','''  const unbindToolTheme = bindToolTheme({
    scenes: [scene],
    paper: [faceMaterial],
    ink: [edgeMaterial, hoverMaterial, ghostMaterial, placementMaterial],
    onChange: colours => tutorial?.setAccent(colours.accent)
  });

  function setInstruction(text) {''')
change('stack/stack.js','    tutorial?.dispose();\n    world.free();','    tutorial?.dispose();\n    unbindToolTheme();\n    world.free();')
change('stack/tutorial3d.js','  const ACCENT = 0xef5b2a;',"  let cueAccent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#C0431F';")
change('stack/tutorial3d.js','      color: ACCENT,','      color: cueAccent,')
change('stack/tutorial3d.js','    stop: onPointer,','''    setAccent(colour) {
      cueAccent = colour;
      if (!activeCue) return;
      activeCue.faceMaterial.color.set(colour);
      activeCue.arrows.materials.forEach(material => material.color.set(colour));
    },
    stop: onPointer,''')
p=R/'play/blocks/massing.js';p.write_text("import { bindToolTheme } from '/js/tool-theme.js';\n"+p.read_text())
change('play/blocks/massing.js','  function pieceFamily(name) {','''  // GridHelper's original vertex colours were dark. Use the same token as
  // other linework rather than multiplying two dark colours together.
  grid.material.vertexColors = false;
  grid.material.needsUpdate = true;
  const unbindToolTheme = bindToolTheme({
    scenes: [scene],
    paper: [faceMaterial, floorMaterial],
    ink: [edgeMaterial, hoverMaterial, ghostMaterial, challengePreviewEdgeMaterial,
      challengePreviewFaceMaterial, grid.material],
    accent: [selectedMaterial, heldMaterial, snapMaterial, challengeGuideMaterial]
  });

  function pieceFamily(name) {''')
change('play/blocks/massing.js','    challengePreviewRenderer?.dispose();','    unbindToolTheme();\n    challengePreviewRenderer?.dispose();')
for file,tool in [('play/stack.html','stack'),('play/blocks/index.html','blocks'),('sketch/index.html','sketch')]:
 p=R/file;s=p.read_text();s=s.replace('class="sudu-tool-page"',f'class="sudu-tool-page" data-sudu-tool="{tool}"')
 if tool!='sketch':
  s=s.replace('  <link rel="stylesheet" href="/css/fonts.css">','  <link rel="stylesheet" href="/css/fonts.css">\n  <link rel="stylesheet" href="/css/tokens.css">')
 p.write_text(s)
# Update module imports and only these page assets, without touching the main site.
def sha(f):return hashlib.sha256((R/f).read_bytes()).hexdigest()[:8]
for f in ['stack/stack.js','play/blocks/massing.js']:
 p=R/f;s=p.read_text().replace("'/js/tool-theme.js'",f"'/js/tool-theme.js?v={sha('js/tool-theme.js')}'")
 if f.startswith('stack'):
  s=re.sub(r"'./tutorial3d.js(?:\?v=[^']+)?'",f"'./tutorial3d.js?v={sha('stack/tutorial3d.js')}'",s)
 p.write_text(s)
for f in ['play/stack.html','play/blocks/index.html','sketch/index.html']:
 p=R/f;s=p.read_text()
 s=re.sub(r'((?:src|href)=")(/[^"?]+\.(?:js|css))(?:\?v=[^"]+)?(")',lambda m: m[1]+m[2]+'?v='+sha(m[2].lstrip('/'))+m[3],s)
 p.write_text(s)
