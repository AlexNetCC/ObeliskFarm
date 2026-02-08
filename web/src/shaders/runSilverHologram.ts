/**
 * WebGL runner for the silver hologram fragment shader.
 * Renders a single fullscreen quad; blend with the DOM for overlay effect.
 */
import silverHologramVert from "./silverHologram.vert.glsl?raw";
import silverHologramFrag from "./silverHologram.frag.glsl?raw";

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function createSilverHologramGL(canvas: HTMLCanvasElement): { draw: (time: number) => void; destroy: () => void } | null {
  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false });
  if (!gl) return null;

  const vert = compileShader(gl, gl.VERTEX_SHADER, silverHologramVert);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, silverHologramFrag);
  if (!vert || !frag) {
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    return null;
  }

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }

  gl.deleteShader(vert);
  gl.deleteShader(frag);

  const positionLoc = gl.getAttribLocation(program, "a_position");
  const timeLoc = gl.getUniformLocation(program, "u_time");
  const resolutionLoc = gl.getUniformLocation(program, "u_resolution");

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

  const g = gl;
  function draw(time: number) {
    const w = canvas.width;
    const h = canvas.height;
    if (w <= 0 || h <= 0) return;

    g.viewport(0, 0, w, h);
    g.useProgram(program);
    g.enable(g.BLEND);
    g.blendFunc(g.SRC_ALPHA, g.ONE_MINUS_SRC_ALPHA);
    g.uniform1f(timeLoc!, time * 0.001);
    g.uniform2f(resolutionLoc!, w, h);
    g.bindBuffer(g.ARRAY_BUFFER, buffer);
    g.enableVertexAttribArray(positionLoc);
    g.vertexAttribPointer(positionLoc, 2, g.FLOAT, false, 0, 0);
    g.drawArrays(g.TRIANGLES, 0, 6);
  }

  function destroy() {
    g.deleteProgram(program);
    g.deleteBuffer(buffer);
  }

  return { draw, destroy };
}
