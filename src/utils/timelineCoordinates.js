/**
 * Converts a timeline time to its horizontal pixel position, accounting for
 * the visible pre-pull section shifting the whole timeline to the right.
 * @param {number} time - Time in seconds; negative values fall within the pre-pull section
 * @param {number} prepullVisibleSeconds - Seconds of pre-pull time currently visible on the timeline
 * @param {number} pixelsPerSecond - Current horizontal scale of the timeline
 * @returns {number} - Horizontal pixel offset from the timeline's left edge (excludes label width)
 */
export function timeToX(time, prepullVisibleSeconds, pixelsPerSecond) {
  return (time + prepullVisibleSeconds) * pixelsPerSecond;
}
