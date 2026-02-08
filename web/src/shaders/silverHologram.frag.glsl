// Silver hologram sweep overlay – band runs back and forth (hin und her), then pause
precision mediump float;
uniform float u_time;
uniform vec2 u_resolution;
varying vec2 v_uv;

void main() {
  // Cycle ~8s: sweep back-and-forth over first ~45% (3.6s), then pause
  float cycle = 8.0;
  float t = mod(u_time, cycle) / cycle;
  float sweepEnd = 0.45;
  float alpha;
  if (t <= sweepEnd) {
    float phase = t / sweepEnd;
    // Triangle: 0 -> 1 -> 0 (left to right, then right to left)
    float bandCenter = phase < 0.5 ? (phase * 2.0) : (2.0 - phase * 2.0);
    float dist = abs(v_uv.x - bandCenter);
    float bandWidth = 0.28;
    alpha = 1.0 - smoothstep(0.0, bandWidth, dist);
    alpha *= 0.72;
  } else {
    alpha = 0.0;
  }

  vec3 silver = vec3(0.96, 0.97, 1.0);
  gl_FragColor = vec4(silver, alpha);
}
