# STACK Mouse Physics Specification

STACK treats the pointer as a hand contacting a physical block, not as a generic object manipulator.

## Core interaction principle

The surface and exact point that the player grabs determine which force directions are available and how much authority the pointer has.

### End face

An end-face grip primarily controls motion along the block's long axis.

- Strong in/out authority for extraction and reinsertion.
- Very limited lateral authority.
- Very limited vertical authority.
- Off-centre end grabs may create small yaw or rocking because force is applied at the actual grip point.
- The small secondary motion should come from real torque and contact response, not a visual wobble animation.

### Long side

A side grip primarily controls motion across the block width.

- Stronger lateral nudge authority.
- Weak longitudinal authority.
- Very limited vertical authority.
- A side grip should feel useful for testing or correcting a piece, not like a second extraction handle.

### Top face

A top grip is for testing and wiggling a block.

- Moderate horizontal authority in both principal horizontal directions.
- Almost no direct vertical authority.
- Downward pointer motion must not turn into a hydraulic press on the tower.
- Small vertical changes may still occur naturally through rocking, gaps, rotation and collision geometry.

### Edges and corners

Grip behaviour blends continuously between END, SIDE and TOP.

There must be no abrupt invisible threshold where moving a few pixels changes the interaction mode. Edge/corner grabs combine weighted surface authority and naturally generate more torque because they are farther from the rigid-body centre.

## Force application

- Capture the actual 3D hit point at pointer down.
- Store that grip point in block-local coordinates.
- Reconstruct the world-space grip point from the body's current pose every physics step.
- Compute the spring/damper error at the grip point.
- Resolve the error along the block's current local long, side and up axes.
- Weight the available force in each axis by the grip surface profile.
- Apply impulse at the actual grip point where the physics API permits it.
- If direct impulse-at-point support is unavailable, reproduce the same result using centre impulse plus torque impulse.

This makes subtle yaw, rocking and lateral movement emerge physically from an off-centre grab.

## Intact block manipulation

An intact block remains a dynamic rigid body throughout manipulation.

The pointer does not teleport it, lock its rotation, disable collisions or overwrite its transform. It applies bounded physical impulses and the surrounding tower decides how much movement is possible.

Force caps and error caps prevent fast pointer movement from storing arbitrary spring energy.

## Extraction

A block becomes genuinely extracted only when its displacement from its original course clears the supporting tower footprint.

- Clearance is measured from the block's stored home position and home long axis.
- Partial extraction does not reset the reference position.
- Re-grabbing a partially extracted block still knows where its original course is.
- Pulling outward and pushing inward are equally valid physical gestures.
- Automatic transition into carry mode is reserved primarily for an end-face extraction, where that handoff is intuitive.
- A block detached by side/top manipulation becomes re-grabbable, but does not unexpectedly jump into carry while the player is still testing it.

## Detached / loose pieces

A block is considered detached when it is clearly extracted, has fallen away from its original course, or is lying on the ground away from its home position.

Detached blocks may be clicked on any visible face and picked up into carry mode.

## Carry

Carry mode exists only after a block is physically free.

- The body becomes kinematic while held so a loose piece can be transported in 3D.
- Carry speed is capped so the held block cannot act as an infinite-mass battering ram.
- Camera zoom is disabled during an active grip/carry so changing projection cannot corrupt the hand/block relationship.
- Right mouse remains reserved for forced orbit when no block is actively held.

## Assisted top placement

Top placement is intentionally easier than extraction.

The challenge of STACK is choosing and extracting a viable block without destabilising the tower. It is not precision 3D CAD alignment after the block is already free.

- A faint outline indicates the next legal slot on the top course whenever a loose/carryable block exists.
- The player only needs to lift the free block into a generous capture volume around that slot.
- Inside the capture volume, position and orientation are progressively magnetised toward the correct alternating course and slot.
- The magnetism must be strong enough that the player clearly feels the intended placement, without snapping a distant block across the scene.
- Release inside the accepted placement region completes the placement.
- On release, the block returns to dynamic physics slightly above the target with small bounded residual velocity so it settles physically rather than being permanently teleported/frozen into place.
- A missed release away from the capture region simply leaves the block free and re-grabbable.
- The placement guide becomes visually stronger while the held block is inside the capture region.

## Friction and fit

Difficulty should come primarily from gravity, course loading and imperfect contact geometry rather than artificially sticky blocks.

Target deterministic friction distribution:

- approximately 30% loose: coefficient 0.08–0.20
- approximately 60% normal: coefficient 0.22–0.42
- approximately 10% tight: coefficient 0.44–0.58

Small dimensional, yaw, density and damping variation remain. Lower blocks naturally become harder to move because they carry more normal load from the courses above.

## Placement state update

Once a block has been placed on top:

- update its course index;
- update its home position;
- update its home long axis;
- clear free/carryable state;
- treat it exactly like any other tower block for future extraction.

## Pointer lifecycle safety

No browser event may leave a block in an impossible interaction state.

- Pointer up: finish grip/carry normally.
- Pointer cancel: safely release/drop the block.
- Resize during interaction: release active manipulation before recalculating camera geometry.
- Visibility/tab change: release pointer capture and return carried pieces to dynamic physics.
- Reset: clear all active pointer and carry state before rebuilding the world.

## Camera conflict rules

- Left drag on a block manipulates the block.
- Left drag on empty space orbits the camera.
- Right drag forces orbit, even when the pointer starts above a block, unless a block is already actively held.
- Wheel/trackpad zoom is ignored during active manipulation.

## Acceptance feel

A good interaction pass should allow the following without special knowledge:

1. Grab the centre of an end and pull mostly straight out.
2. Grab near the edge of that end and see a small natural yaw as the block resists.
3. Re-grab a half-extracted piece and push it back into its original course.
4. Grab the middle of a long side and nudge the piece sideways without easily extracting it lengthwise.
5. Grab the top and test/wiggle the block without being able to drive it downward through the tower.
6. Pull a block fully free, continue holding, lift toward the top target and feel it align automatically.
7. Release in the top capture region and watch the block settle naturally into its new course.
8. Miss the placement area, drop the block, click it again and recover it.
9. Orbit and zoom normally when not holding anything.
10. Reset at any time without a frozen or orphaned body.
