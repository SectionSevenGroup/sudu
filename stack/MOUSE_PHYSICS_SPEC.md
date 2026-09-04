# STACK / Mouse + Grip Physics Specification

Status: implementation authority for mouse manipulation prototype
Date: 30 August 2026
Implementation: first face-aware grip pass active on PR #19

## Intent

The mouse represents a hand contacting a particular part of a wooden block. Selecting a block must not grant unconstrained control of the whole rigid body.

The point and surface that the visitor touches determine the directions in which meaningful force can be applied. Rapier remains responsible for the resulting motion, friction, collision, rotation and instability.

The interaction should therefore feel like touching a real block rather than dragging a 3D UI object.

## 1. Governing rule

**Grip surface -> plausible force directions -> rigid-body response.**

Never fake a secondary movement solely as animation if the same effect can arise from a small real force applied through the selected point.

For intact/tower blocks, user input is force-based and the block remains dynamic.

Detached/free blocks may enter the existing assisted carry state.

## 2. End-face grip

Primary intent: pull or push the block along its long axis.

Behaviour:

- strong force authority along the long axis;
- both outward and inward motion are allowed;
- only weak lateral authority;
- essentially no direct vertical authority;
- force is applied through the actual selected point, so an off-centre grip can create a small real yaw/rocking response;
- neighbouring blocks and friction remain free to resist, deflect or bind the selected block.

The visual result may therefore include a little lateral motion or rotation, but that movement must be produced physically rather than by cosmetic offset.

A block that clears the tower axially while held from an end may transition into carry.

## 3. Long-side grip

Primary intent: nudge the block sideways.

Behaviour:

- strong force authority across the block width;
- weak authority along its long axis;
- essentially no direct vertical authority;
- an off-centre side grip may naturally introduce yaw;
- lateral movement remains subject to compression from neighbouring blocks and load from above.

A side grip must not behave like an extraction handle. If lateral motion happens to dislodge a block completely, it becomes carryable after release/re-grab rather than automatically teleporting into carry.

## 4. Top-face grip

Primary intent: test/wiggle/rock the block.

Behaviour:

- moderate horizontal authority in both local horizontal axes;
- no meaningful user-driven downward force;
- only extremely small upward compliance, if any;
- vertical movement should arise mainly from real contact geometry, rocking, gaps and gravity;
- force applied away from the centre should naturally create small pitch/roll/yaw responses.

Dragging downward on screen must not allow the visitor to artificially compress the whole tower through the selected block.

## 5. Bottom face

An intact tower block's underside is normally inaccessible.

If a bottom face is visible because the block is already detached/fallen, use detached-piece carry behaviour rather than inventing a separate manipulation mode.

## 6. Edge + corner grips

Do not use hard pixel boundaries between end/side/top behaviour.

Near an edge or corner, calculate continuous weights for END / SIDE / TOP based on the actual local hit position.

Examples:

- end + side edge -> mostly axial pull with more lateral compliance;
- end + top edge -> axial pull with slightly more rocking;
- top + side edge -> horizontal wiggle biased sideways;
- corner -> blended low-authority manipulation.

The same point should remain stable for the duration of the grip. Do not reclassify the face every frame.

## 7. Actual grip point

Store the selected point in block-local coordinates at pointer-down.

At every physics step:

1. transform that local point by the current rigid-body pose;
2. find the error between that physical grip point and the mouse target point;
3. decompose the error into the block's current local long / side / up axes;
4. limit each component according to END / SIDE / TOP grip weights;
5. apply the resulting impulse **at the physical grip point**.

This makes small rotation/rocking a consequence of moment arm rather than a visual trick.

If `applyImpulseAtPoint` is unavailable, apply the linear impulse at the centre plus the equivalent `r x impulse` torque impulse.

## 8. Force limits

Mouse distance is not unlimited force.

Each axis uses:

- bounded spring error;
- velocity damping;
- a strict maximum force;
- lower authority for secondary directions.

A large/fast mouse gesture therefore increases intent only up to a physical cap. It must not launch a loaded block across the scene.

Initial target hierarchy:

- END axial force: highest;
- SIDE lateral force: medium;
- TOP horizontal wiggle: lower;
- secondary END/SIDE cross-axis force: low;
- direct vertical force: near zero.

Exact constants are tuning values, not game rules.

## 9. Friction + fit remain authoritative

Loose / normal / tight variation remains physical.

The grip model must not make every block equally movable.

A user may:

- test a block from the top and feel little movement;
- nudge it from the side;
- pull the end and discover that it is loose;
- find another block genuinely bound by load/friction.

Opening gaps elsewhere must continue to alter behaviour naturally through the rigid-body simulation.

## 10. Partial extraction + re-grab

Re-grabbing never resets the block's physical home reference.

If an exposed end is selected, pushing it inward must work immediately from the actual selected point.

A partially extracted block remains a normal dynamic tower block until genuinely clear.

No early kinematic handoff while it is still touching neighbouring courses.

## 11. Detached/free pieces

Once clearly detached:

- clicking any visible surface may pick it up;
- it enters assisted carry;
- carry must preserve enough inertia/physical consequence to feel like an object, not a cursor icon;
- carry speed is capped to avoid an effectively infinite-mass kinematic projectile.

## 12. Carry + placement

Near the next top slot:

- orientation assistance may increase progressively;
- position assistance may bias toward the legal slot;
- release must return the block to dynamic physics slightly above/near the intended pose;
- do not zero all physical character by teleporting and freezing it exactly in place;
- a gentle release should settle quietly;
- a poor/heavy release may move neighbouring blocks or fail.

## 13. Camera conflict

Gesture routing stays raycast-first:

- left-drag block -> manipulate block;
- left-drag empty space -> orbit;
- right-drag anywhere -> force orbit.

While a block is actively gripped/carrying:

- wheel/trackpad zoom input is ignored;
- orbit does not move;
- camera projection therefore cannot change underneath the grip and cause a jump.

## 14. Pointer + lifecycle edge cases

Must handle:

- pointerup;
- pointercancel;
- pointer leaving canvas while captured;
- browser/tab visibility change;
- reset during/after interaction;
- resize during an active interaction;
- right-click orbit without context menu;
- rapid click/re-grab of a moving block.

On cancellation/visibility loss:

- release pointer capture;
- clear drag/orbit CSS state;
- return a carried kinematic block to a safe dynamic/free state;
- never leave a block frozen in mid-air.

Reset must clear interaction state before rebuilding the world.

## 15. Release velocity

For intact END/SIDE/TOP manipulation, the block retains the velocity produced by the solver. Do not add a mouse-throw impulse on release.

For carried pieces, retain a bounded fraction of actual carry velocity on release so dropping/placing feels physical.

Clamp pathological carry release speeds.

## 16. No cosmetic cheating

Allowed:

- real tiny yaw from off-centre force;
- real rocking against neighbouring blocks;
- real vertical rise from a corner riding over another surface;
- real rebound/contact response.

Avoid:

- manually translating the render mesh independently of the rigid body;
- fake wiggle animation;
- visual offsets that do not exist in Rapier;
- snapping the rigid body while still embedded in the tower.

## 17. Mouse QA matrix

### End centre

- pull out;
- stop;
- push back in;
- movement remains primarily axial.

### End near edge

- pull axially;
- small genuine yaw/lateral compliance appears;
- no large sideways dragging.

### Side centre

- left/right mouse motion nudges sideways;
- axial extraction authority is weak.

### Side near end

- blended side/end behaviour;
- no abrupt interaction-mode switch.

### Top centre

- horizontal mouse movement tests/wiggles the block;
- dragging down does not compress it vertically.

### Top near corner

- block can rock slightly through real moment arm;
- no cartoon wobble.

### Tight block

- mouse can build intent only to force cap;
- neighbouring tower reacts physically;
- no huge stored spring release.

### Loose block

- gives more readily under the same grip;
- remains governed by friction/load rather than a scripted loose animation.

### Partial extraction

- re-grab exposed end;
- push inward cleanly;
- no centre/grab-point jump.

### Carry

- pick detached piece from floor;
- move through scene;
- accidental tower contact has bounded consequences;
- no off-screen launches from ordinary mouse speed.

### Placement

- approach top target;
- assistance is perceptible but restrained;
- release returns to dynamic physics;
- imperfect placement remains possible.

### Camera

- right-drag orbits even over block;
- empty-space left-drag orbits;
- wheel zoom does not alter camera while a block is held.

## 18. Acceptance condition

The user should be able to infer the interaction from the object itself:

- grab the end -> pull/push;
- grab the side -> nudge sideways;
- grab the top -> test/wiggle;
- free the piece -> lift/place.

The block should never feel like a generic draggable 3D object.

## 19. Prototype gate

The face-aware grip model is not considered approved merely because it compiles or deploys. It requires direct mouse testing of the QA matrix above on the Netlify preview. The first pass should be tuned by feel before any further game systems, sound or visual embellishment are added.