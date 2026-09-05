import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
const trim = createRequire(import.meta.url)('../js/sketch-trim.js');
const script = await readFile(new URL('../js/sketch.js', import.meta.url), 'utf8');
const circle = (x,y,r)=>({edge:0,closed:true,curve:{x,y,radius:r,angle:0,sweep:2*Math.PI}});
const line = (x,y,xx,yy)=>({edge:0,a:{x,y},b:{x:xx,y:yy}});
const near = (a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const point = (x,y)=>({x:x/128,y:y/96});
const event = (x,y,type='mouse')=>({point:point(x,y),button:0,pointerId:1,pointerType:type});
function state() {
  let serial=0;
  const s={trimGeometry:trim, WORLD_WIDTH:1792,WORLD_HEIGHT:1344,WORLD_DOTS_X:64,WORLD_DOTS_Y:48,
    GRID_SPACING:28,GRID_STEP:14,DOT_FEET:2,camera:{scale:1},objects:[],active:null,activeFloor:'main',
    trimPreview:null,trimPress:null,wallChain:null,wallPress:null,wallMode:'single',tool:'trim',
    selectedIndex:-1,resizeDrag:null,moveDrag:null,spaceHeld:false,gesture:null,pointers:new Map(),
    rulerState:{visible:false},allowedTypes:['line','shape','room'],undoStack:[],redoStack:[],
    clone:v=>JSON.parse(JSON.stringify(v)),clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),
    canvas:{setPointerCapture(){},hasPointerCapture(){return false;}},
    makeObjectId:()=>`o-${++serial}`,ensureObjectId:o=>o,
    render(){},closeMobilePanels(){},trackPaperPointer(){},movePan:()=>false,endPan:()=>false,
    scheduleSave(){},updateActions(){},updateStencilPanel(){},closeNoteComposer(){},
    setHint:t=>s.hint=t,pointFromEvent:e=>e.point,pointerScreen:e=>({x:e.point.x*1792,y:e.point.y*1344})};
  s.layer={locked:false,visible:true,objects:s.objects};
  s.activeLayerState=()=>s.layer;
  s.activeFloorState=()=>({layers:[s.layer]});
  s.visibleObjectsForFloor=()=>s.objects;
  s.objectById=id=>s.objects.find(o=>o.id===id);
  s.remember=old=>{s.undoStack.push(old);s.redoStack.length=0;};
  s.setObjects=next=>{s.objects=next;s.layer.objects=next;};
  const names=['px','shapeCurve','shapeCurvePoint','shapePoints','shapeEnd','screenDistance',
    'wallPaths','traceWallPath','drawCutWall','cutWallSegments','findTrim','sameTrim','beginTrim','moveTrim','finishTrim','trimHasOpening','openingIntersectsPart','openingCrossesCut',
    'beginWall','continueWall','finishWall','onPointerDown','onPointerMove','onPointerUp',
    'wallSegments','hitObject','distanceToSegment','cleanObjects','undo','redo',
    'segmentForHost','resolvedOpening','attachOpening','openingFromClick','measurementText','formatFeet'];
  for (const name of names) {
    const start=script.indexOf('  function '+name+'('),end=script.indexOf('\n  function ',start+1);
    assert.ok(start>=0 && end>start,name);runInNewContext(script.slice(start,end),s);
  }
  return s;
}

test('two overlapping circles yield exact crossings and complete removable arcs across the seam',()=>{
  const a=circle(0,0,10),b=circle(10,0,10),hits=trim.intersections(a,b);
  assert.equal(hits.length,2);hits.forEach(p=>{near(p.x,5);near(Math.abs(p.y),Math.sqrt(75));});
  const chosen=trim.nearest([a,b],{x:10,y:0},0.1);
  assert.equal(chosen.path,a);assert.ok(chosen.to>1);
  near(chosen.to-chosen.from,1/3);
  a.cuts=trim.addCut(a,chosen.from,chosen.to);
  assert.equal(trim.visible(a,0),false);assert.equal(trim.visible(a,0.5),true);
  near(trim.ranges(a).reduce((n,r)=>n+r[1]-r[0],0),2/3);
  const other=trim.nearest([a,b],{x:0,y:0},0.1);
  assert.equal(other.path,b);assert.ok(other.to-other.from<0.5);
});
test('line, arc and circle crossings respect arc extent and ignore tangency and coincidence',()=>{
  const c=circle(0,0,10),l=line(-20,0,20,0);
  assert.equal(trim.intersections(c,l).length,2);
  assert.equal(trim.intersections(c,line(-20,10,20,10)).length,0);
  assert.equal(trim.intersections(c,circle(20,0,10)).length,0);
  assert.equal(trim.intersections(c,circle(0,0,10)).length,0);
  const arc={edge:0,curve:{...c.curve,sweep:Math.PI}};
  const arcHits=trim.intersections(arc,line(0,-20,0,20));assert.equal(arcHits.length,1);near(arcHits[0].y,10);
  const crossing=trim.intersections(line(0,0,20,20),line(0,20,20,0));near(crossing[0].x,10);
  assert.equal(trim.intersections(line(0,0,1,1),line(2,0,2,5)).length,0);
});
test('a trim previews, commits one undo step, survives save and leaves removed sections unselectable',()=>{
  const s=state();s.objects.push({id:'a',type:'line',start:point(10,20),end:point(40,20)},
    {id:'b',type:'line',start:point(20,10),end:point(20,30)},
    {id:'c',type:'line',start:point(30,10),end:point(30,30)});
  s.onPointerDown(event(25,20));assert.ok(s.trimPreview);assert.equal(s.undoStack.length,0);
  s.onPointerUp(event(25,20));assert.equal(s.undoStack.length,1);
  const cut=s.objects[0];assert.equal(cut.cuts.length,1);near(cut.cuts[0].from,1/3);near(cut.cuts[0].to,2/3);
  assert.equal(s.hitObject(cut,point(25,20)),false);assert.equal(s.hitObject(cut,point(15,20)),true);
  const saved=JSON.stringify(cut);assert.equal(JSON.stringify(s.cleanObjects([JSON.parse(saved)])[0]),saved);
  s.undo();assert.equal(s.objects[0].cuts,undefined);s.redo();assert.equal(s.objects[0].cuts.length,1);
  assert.equal(s.wallSegments().filter(p=>p.hostId==='a').length,2);
});
test('touch needs a preview tap, drags do not cut and locks prevent changes',()=>{
  const s=state();s.objects.push({id:'a',type:'line',start:point(10,20),end:point(40,20)});
  s.beginTrim(event(25,20,'touch'));s.finishTrim(event(25,20,'touch'));assert.equal(s.undoStack.length,0);
  s.beginTrim(event(25,20,'touch'));s.moveTrim(event(28,20,'touch'));s.finishTrim(event(28,20,'touch'));assert.equal(s.undoStack.length,0);
  s.beginTrim(event(25,20,'touch'));s.finishTrim(event(25,20,'touch'));assert.equal(s.undoStack.length,1);
  s.undo();s.layer.locked=true;s.onPointerDown(event(25,20));s.onPointerUp(event(25,20));assert.equal(s.objects[0].cuts,undefined);
  s.layer.locked=false;s.layer.visible=false;assert.equal(s.findTrim(point(25,20)),null);
});
test('hosted openings block cuts through themselves but not cuts elsewhere',()=>{
  const s=state(),host={id:'a',type:'line',start:point(10,20),end:point(40,20)};s.objects.push(host);
  s.objects.push({id:'door',type:'door',hostId:'a',hostEdge:0,position:0.5,lengthDots:1.5});
  const path=s.wallPaths(host)[0];assert.equal(s.trimHasOpening({path,from:0.4,to:0.6}),true);
  assert.equal(s.trimHasOpening({path,from:0,to:0.2}),false);
  s.beginTrim(event(15,20));s.finishTrim(event(15,20));assert.equal(s.undoStack.length,0);assert.match(s.hint,/door\/window/);
});
test('all Wall methods use existing editable geometry and Continuous joins exact corners',()=>{
  for(const mode of ['single','box','arc','circle']) {
    const s=state();s.tool='wall';s.wallMode=mode;
    s.onPointerDown(event(10,10));s.onPointerMove(event(20,18));s.onPointerUp(event(20,18));
    assert.equal(s.objects.length,1);assert.equal(s.objects[0].type,mode==='single'?'line':mode==='box'?'room':'shape');
    if(mode==='circle')near((s.objects[0].end.x-s.objects[0].start.x)*1792,(s.objects[0].end.y-s.objects[0].start.y)*1344);
  }
  const s=state();s.tool='wall';s.wallMode='continuous';
  for(const p of [[10,10],[20,10],[20,20],[10,10]]) {s.onPointerDown(event(...p));s.onPointerUp(event(...p));}
  assert.equal(s.objects.length,3);assert.equal(s.wallChain,null);assert.equal(s.active,null);
  assert.deepEqual(s.objects[0].end,s.objects[1].start);assert.deepEqual(s.objects[2].end,s.objects[0].start);
  assert.equal(s.undoStack.length,3);s.undo();assert.equal(s.objects.length,2);
});
test('cut curves remain true curves in renderer/export and cuts sanitise on import',()=>{
  const s=state(),o={id:'c',type:'shape',kind:'circle',start:point(10,10),end:point(30,30),cuts:[{edge:0,from:0.2,to:0.4}]};
  const calls=[],ctx={beginPath(){},moveTo(){},lineTo(){},ellipse(...args){calls.push(args);},stroke(){}};
  s.drawCutWall(ctx,o,1792,1344);assert.equal(calls.length,2);calls.flat().forEach(v=>assert.ok(typeof v==='boolean'||Number.isFinite(v)));
  const clean=s.cleanObjects([{...o,cuts:[null,{edge:0,from:-1,to:4},{edge:0,from:0.2,to:0.4}]}])[0];assert.equal(clean.cuts.length,1);
});

test('new openings preserve original host positions on surviving pieces and reject gaps',()=>{
  const s=state(),host={id:'wall',type:'line',start:point(10,20),end:point(50,20),cuts:[{edge:0,from:0.25,to:0.75}]};
  s.objects.push(host);
  const door=s.openingFromClick('door',point(46,20),false);s.attachOpening(door);
  near(door.position,0.9);assert.equal(s.openingCrossesCut(door),false);
  const resolved=s.resolvedOpening(door);near((resolved.start.x+resolved.end.x)/2,46/128);
  door.position=0.76;assert.equal(s.openingCrossesCut(door),true);
});

test('circle cuts retain identity, render length instead of a false enclosed area, and support the next cut',()=>{
  const s=state(),a={id:'a',type:'shape',kind:'circle',filled:false,start:point(10,10),end:point(30,30)},
    b={id:'b',type:'shape',kind:'circle',filled:false,start:point(20,10),end:point(40,30)};
  s.objects.push(a,b);
  s.beginTrim(event(30,20));s.finishTrim(event(30,20));assert.equal(a.cuts.length,2);assert.equal(a.kind,'circle');
  assert.match(s.measurementText(a),/^Remaining wall/);assert.equal(s.hitObject(a,point(30,20)),false);
  s.beginTrim(event(20,20));s.finishTrim(event(20,20));assert.equal(b.cuts.length,1);
  const saved=JSON.stringify(s.objects);s.setObjects(s.cleanObjects(JSON.parse(saved)));assert.equal(JSON.stringify(s.objects),saved);
  s.undo();assert.equal(s.objects[1].cuts,undefined);assert.equal(s.objects[0].cuts.length,2);
});
