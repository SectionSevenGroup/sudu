// Physical state shared by the tower and its ledger. No DOM or render sampling.
export function blockTilt(rotation) {
  // Angle of the local up axis to world up. Course yaw is not a tilt.
  return Math.acos(Math.max(-1, Math.min(1,
    1 - 2 * (rotation.x * rotation.x + rotation.z * rotation.z)
  )));
}

export function createCollapseMonitor({ holdSeconds = .65, fallDrop = .78 } = {}) {
  const homes = new Map();
  let armed = false;
  let elapsed = 0;
  let ended = false;

  return {
    reset() {
      homes.clear();
      armed = false;
      elapsed = 0;
      ended = false;
    },
    arm(blocks) {
      if (armed || ended) return;
      blocks.forEach(block => homes.set(block, block.body.translation().y));
      armed = true;
      return true;
    },
    placed(block, height) {
      homes.set(block, height);
    },
    step(blocks, heldBlock, delta) {
      if (!armed || ended) return null;
      let fallenBlocks = 0;
      let floorBlocks = 0;
      let deepestDrop = 0;
      for (const block of blocks) {
        // Deliberately carried/dropped pieces are not structural failures.
        // A merely carryable piece may have fallen with the tower: count it.
        if (block === heldBlock || block.free || !homes.has(block)) continue;
        const homeY = homes.get(block);
        const y = block.body.translation().y;
        const drop = homeY - y;
        deepestDrop = Math.max(deepestDrop, drop);
        if (drop >= fallDrop) fallenBlocks++;
        if (homeY > 1 && y <= .62) floorBlocks++;
      }
      const failed = fallenBlocks >= 2 || floorBlocks >= 2;
      elapsed = failed ? elapsed + delta : 0;
      if (elapsed < holdSeconds) return null;
      ended = true;
      return { fallenBlocks, floorBlocks, deepestDrop };
    }
  };
}
