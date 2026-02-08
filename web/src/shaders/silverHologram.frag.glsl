// Silver hologram sweep overlay – band moves left to right, regular and slow
precision mediump float;
uniform float u_time;
uniform vec2 u_resolution;
varying vec2 v_uv;

void main() {
  // Cycle ~8s: sweep over first ~45% (3.6s), then pause
  float cycle = 8.0;
  float t = mod(u_time, cycle) / cycle;
  float sweepEnd = 0.45;
  float bandCenter;
  float alpha;
  if (t <= sweepEnd) {
    bandCenter = t / sweepEnd;
    float dist = abs(v_uv.x - bandCenter);
    float bandWidth = 0.2;
    alpha = 1.0 - smoothstep(0.0, bandWidth, dist);
    alpha *= 0.42;
  } else {
    alpha = 0.0;
  }

  vec3 silver = vec3(0.92, 0.94, 0.98);
  gl_FragColor = vec4(silver, alpha);
}
