import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const script = await readFile(new URL('../js/sketch.js', import.meta.url), 'utf8');
function state() {
  const s = {
    WORLD_WIDTH:1792, WORLD_HEIGHT:1344, WORLD_DOTS_X:64, WORLD_DOTS_Y:48,
    GRID_SPACING:28, GRID_STEP:14, DOT_FEET:2, camera:{scale:1},
    tool:'shape', shapeKind:'rectangle', shapeFilled:false, shapeBulge:0.5,
    objects:[], active:null, selectedIndex:-1, spaceHeld:false, resizeDrag:null, moveDrag:null,
    pointers:new Map(), allowedTypes:['shape', 'line'], activeFloor:'main',
    canvas:{setPointerCapture(){}, hasPointerCapture(){return false;}},
    trackPaperPointer(){}, closeMobilePanels(){}, render(){}, setHint(){}, syncShapeControls(){},
    activeLayerState:()=>({locked:false}), clone:v=>JSON.parse(JSON.stringify(v)),
    makeObjectId:type=>type+'-test', ensureObjectId:o=>o,
    clamp:(n,a,b)=>Math.max(a,Math.min(b,n)), pointFromEvent:e=>e.point,
    movePan:()=>false, endPan:()=>false, gesture:null, undoStack:[], redoStack:[],
    closeNoteComposer(){}, scheduleSave(){}, updateActions(){}, updateStencilPanel(){}, toolHints:{edit:''}
  };
  s.remember=previous=>{s.undoStack.push(previous);s.redoStack.length=0;};
  s.setObjects=next=>{s.objects=next;};
  s.objectById=id=>s.objects.find(o=>o.id===id);
  s.visibleObjectsForFloor=()=>s.objects;
  for (const name of ['px','shapeEnd','shapeCurve','shapeCurvePoint','shapePoints','drawShape','drawObject',
    'objectBounds','objectAnchors','isResizableObject','measurementText','formatFeet','screenDistance',
    'onPointerDown','onPointerMove','onPointerUp','moveResize','moveSelected','wallSegments',
    'segmentForHost','attachOpening','openingFromClick','resolvedOpening','distanceToSegment','hitObject',
    'cleanObjects','selectedShape','changeShapeStyle','reverseShapeArc','undo','redo']) {
    const start=script.indexOf('  function '+name+'('), end=script.indexOf('\n  function ',start+1);
    assert.ok(start>=0 && end>start,name);
    runInNewContext(script.slice(start,end),s);
  }
  return s;
}
const point=(x,y)=>({x:x/128,y:y/96});
const event=(x,y)=>({point:point(x,y),button:0,pointerId:1,pointerType:'mouse'});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function shape(s,kind,filled=false,a=[10,10],b=[22,18]) {
  s.tool='shape';s.shapeKind=kind;s.shapeFilled=filled;s.resizeDrag=null;s.moveDrag=null;
  s.onPointerDown(event(...a));s.onPointerMove(event(...b));s.onPointerUp(event(...b));
  return s.objects.at(-1);
}

test('all four shapes draw, persist and undo/redo; square and circle are physically equal sided',()=>{
  for(const kind of ['square','rectangle','circle','arc']) for(const filled of [false,true]) {
    const s=state(), o=shape(s,kind,filled);
    assert.equal(o.kind,kind);assert.equal(o.filled,filled);
    const saved=JSON.stringify(o);assert.equal(JSON.stringify(s.cleanObjects([JSON.parse(saved)])[0]),saved);
    if(['square','circle'].includes(kind)) near((o.end.x-o.start.x)*1792,(o.end.y-o.start.y)*1344);
    s.undo();assert.equal(s.objects.length,0);s.redo();assert.equal(JSON.stringify(s.objects[0]),saved);
  }
  const s=state();
  assert.equal(s.cleanObjects([{type:'shape',kind:'circle',start:{x:null,y:0},end:point(3,3)}]).length,0);
  shape(s,'rectangle',false,[4,4],[4,10]);assert.equal(s.objects.length,0);
});

test('shape dimensions measure world feet and circle/segment areas, not bounding-box areas',()=>{
  const s=state();
  assert.equal(s.measurementText(shape(s,'rectangle')),'X  12′\nY  8′\nArea  96 ft²');
  assert.equal(s.measurementText(shape(s,'circle')),'Diameter  12′\nArea  113.1 ft²');
  const arc=shape(s,'arc',true,[10,10],[22,10]);
  assert.equal(s.measurementText(arc),'Radius  6′\nArc  18′ 10″\nArea  56.5 ft²');
});

test('arc bend and reverse preserve endpoints; circle resize and boundary moves preserve proportions',()=>{
  const s=state(), o=shape(s,'arc',false,[20,20],[40,20]);
  assert.equal(s.objectAnchors(o).length,3);
  s.resizeDrag={index:0,handle:'bend'};s.moveResize(event(30,24));
  near(o.bulge,0.2);near(s.shapeCurvePoint(s.shapeCurve(o),0.5).y,24/96);
  s.tool='edit';s.selectedIndex=0;s.reverseShapeArc();near(o.bulge,-0.2);
  near(s.shapeCurvePoint(s.shapeCurve(o),0).x,20/128);near(s.shapeCurvePoint(s.shapeCurve(o),1).x,40/128);
  const circle=shape(s,'circle');
  s.resizeDrag={index:1,opposite:point(10,10)};s.moveResize(event(30,13));
  near((circle.end.x-circle.start.x)*1792,(circle.end.y-circle.start.y)*1344);
  s.moveDrag={index:1,start:point(10,10),original:s.clone(circle)};s.moveSelected(event(127,95));
  near((circle.end.x-circle.start.x)*1792,(circle.end.y-circle.start.y)*1344);
  assert.ok(circle.end.x<=1 && circle.end.y<=1);
});

test('outline selection leaves centres empty; solid selection and style changes are undoable',()=>{
  for(const kind of ['square','rectangle','circle','arc']) {
    const s=state(), o=shape(s,kind,false,[20,20],[40,40]);
    const p=kind==='arc'?s.shapeCurvePoint(s.shapeCurve(o),0.5):point(30,20);
    assert.equal(s.hitObject(o,p),true);
    if(kind!=='arc') assert.equal(s.hitObject(o,point(30,30)),false);
    s.tool='edit';s.selectedIndex=0;s.changeShapeStyle(true);assert.equal(o.filled,true);
    if(kind!=='arc') assert.equal(s.hitObject(o,point(30,30)),true);
    s.undo();assert.equal(s.objects[0].filled,false);
  }
});

test('openings attach to straight and curved shape walls and follow resizing',()=>{
  for(const kind of ['square','rectangle','circle','arc']) {
    const s=state(), o=shape(s,kind,false,[20,20],[40,40]);
    o.id='host';
    const p=['circle','arc'].includes(kind)?s.shapeCurvePoint(s.shapeCurve(o),0.3):point(30,20);
    const door=s.openingFromClick('door',p,false);s.attachOpening(door,p);
    assert.equal(door.hostId,'host');
    const before=s.resolvedOpening(door);
    o.start.x+=0.05;o.end.x+=0.05;
    const after=s.resolvedOpening(door);
    near(after.start.x-before.start.x,0.05);near(after.end.x-before.end.x,0.05);
    assert.ok(Math.hypot((after.end.x-after.start.x)*128,(after.end.y-after.start.y)*96)>2.8);
  }
});

test('screen/export paths are finite, fills follow theme ink and ghosts never fill',()=>{
  for(const [paper,ink] of [['#F3F1EA','#171613'],['#121110','#F5F3EC'],['#C0431F','#F5F3EC']]) {
    const s=state();s.INK=ink;s.PAPER=paper;
    for(const kind of ['square','rectangle','circle','arc']) for(const filled of [false,true]) {
      const o=shape(s,kind,filled);let fills=0,depth=0;
      const target={save(){depth++;},restore(){depth--;},fill(){fills++;assert.equal(this.fillStyle,ink);}};
      for(const method of ['beginPath','closePath','stroke','rect','ellipse']) target[method]=(...args)=>args.forEach(v=>{if(typeof v==='number')assert.ok(Number.isFinite(v));});
      s.drawObject(target,o,3584,2688);assert.equal(depth,0);assert.equal(fills,filled?1:0);
      fills=0;s.drawShape(target,o,1792,1344,true);assert.equal(fills,0);
    }
  }
});
