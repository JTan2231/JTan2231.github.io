(() => {
  'use strict';

  const site = document.querySelector('.site');
  const panel = document.getElementById('project-display');
  const surface = panel.querySelector('.screen-surface');
  const canvas = panel.querySelector('.screen-canvas');
  const title = panel.querySelector('.project-title');
  const link = panel.querySelector('.project-link');
  const description = panel.querySelector('.project-description');
  const status = document.getElementById('project-status');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const compact = matchMedia('(max-width: 520px)');
  const appearance = matchMedia('(prefers-color-scheme: dark)');
  const effects = { curvature: .15, rolling: .85, static: .57, period: 6.5, wear: .8, letterGrit: .75 };
  const projects = new Map();
  const source = document.createElement('canvas');
  source.width = 960;
  source.height = 820;
  const textContext = source.getContext('2d');
  const titleArea = { left: 140, top: 132, right: 400, bottom: 213 };
  let active = null;
  let renderer = null;
  let frameId = 0;
  let lastFrame = 0;
  let elapsed = 0;
  let inView = false;
  let reveal = null;
  let tone = 1;
  let base = .11;

  const vertexShader = `
    attribute vec2 a_position;
    attribute vec2 a_uv;
    uniform float u_bulge, u_aspect;
    varying vec2 v_uv;
    void main() {
      float x = a_position.x;
      float y = a_position.y;
      float z = u_bulge * (2.0 - x*x - y*y);
      float distance = 3.7 - z;
      gl_Position = vec4(x * 1.19 * 2.67 / u_aspect, y * 2.67, distance * .1, distance);
      v_uv = a_uv;
    }
  `;
  const fragmentShader = `
 precision highp float;
 varying vec2 v_uv;
 uniform sampler2D u_texture;
 uniform float u_scan,u_time,u_roll,u_noise,u_period,u_tone,u_wear,u_base,u_letterGrit;
 float hash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
 void main(){
   vec2 p=abs(v_uv*2.0-1.0)-vec2(.83,.81);
   float sd=length(max(p,0.0))+min(max(p.x,p.y),0.0)-.17;
   float mask=1.0-smoothstep(-.006,.006,sd);
   if(mask<.005)discard;
   float rollY=fract(u_time/u_period+.32)*1.4-.2;
   float dy=v_uv.y-rollY;
   float band=exp(-dy*dy/.0064)*u_roll;
   float trailing=exp(-(dy-.065)*(dy-.065)/.0012)*u_roll;
   float tick=floor(u_time*16.0);
   float rowNoise=hash(vec2(floor(v_uv.y*300.),tick));
   float cycle=fract(u_time/4.8);
   float burst=smoothstep(.86,.90,cycle)*(1.0-smoothstep(.97,1.0,cycle));
   float trackingY=.5+hash(vec2(floor(u_time/4.8),19.))*.32;
   float trackDistance=(v_uv.y-trackingY)/.013;
   float tracking=exp(-trackDistance*trackDistance)*burst*u_wear;
   vec2 sampleUV=v_uv;
   sampleUV.x+=sin(v_uv.y*95.0+u_time*6.0)*band*.0022;
   sampleUV.x+=(rowNoise-.5)*.0018*u_wear+tracking*.009;
   vec2 coarseUV=(floor(sampleUV*vec2(520.,360.))+.5)/vec2(520.,360.);
   sampleUV=mix(sampleUV,coarseUV,u_wear*.65);
   vec3 sharp=texture2D(u_texture,sampleUV).rgb;
   vec3 smear=texture2D(u_texture,sampleUV-vec2(.0022,0.)).rgb*.24
             +texture2D(u_texture,sampleUV+vec2(.0022,0.)).rgb*.24
             +sharp*.52;
   vec3 ghost=texture2D(u_texture,sampleUV-vec2(.0065,.0008)).rgb;
   vec3 c=mix(sharp,smear,u_wear*.78);
   c=mix(c,ghost,u_wear*.095);
   vec3 bloom=(texture2D(u_texture,sampleUV+vec2(.0045,.0025)).rgb
             +texture2D(u_texture,sampleUV-vec2(.0045,.0025)).rgb)*.5;
   c+=max(vec3(0.),(bloom-vec3(u_base))*u_tone)*u_tone*u_wear*.12;
   float raster=.5+.5*sin(v_uv.y*300.*6.283185);
   c=mix(c,vec3(u_base),u_scan*(1.-raster)*(.10+.23*u_wear));
   float inkMask=smoothstep(.045,.34,(sharp.r-u_base)*u_tone);
   float letterFleck=hash(floor(sampleUV*vec2(620.,510.))+vec2(83.,11.));
   float wornPatches=smoothstep(.84,.97,letterFleck)*.62;
   float unevenPhosphor=.88+.16*hash(floor(sampleUV*vec2(240.,310.))+vec2(4.,19.));
   vec3 wornInk=vec3(u_base)+(c-vec3(u_base))*unevenPhosphor*(1.-wornPatches);
   c=mix(c,wornInk,inkMask*u_letterGrit);
   c+=vec3((band*.080-trailing*.030)*u_tone);
   float grain=hash(floor(v_uv*vec2(360.,300.))+vec2(tick*17.,tick*31.));
   float fineGrain=hash(floor(v_uv*vec2(720.,600.))+vec2(tick*11.,tick*7.));
   c+=vec3(((grain-.5)*.20+(fineGrain-.5)*.07)*u_noise);
   c+=vec3((rowNoise-.5)*.045*u_noise);
   float specks=step(.988,grain)-step(grain,.012);
   c+=vec3(specks*.11*u_noise);
   c+=vec3((grain-.35)*tracking*.18);
   float rim=exp(-abs(sd+.010)*200.0);
   c+=vec3(rim*.105);
   float edge=pow(abs(v_uv.x-.5)*2.0,6.0)+pow(abs(v_uv.y-.5)*2.0,6.0);
   c=mix(c,vec3(u_base*.7),clamp(edge,0.,1.)*(.08+.13*u_wear));
   gl_FragColor=vec4(c,mask);
 }`;

  function createRenderer() {
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: true });
    // Safari can return a context whose drawing buffer could not be allocated.
    if (!gl || gl.isContextLost() || !textContext ||
        gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return null;
    const shaders = [];
    const buffers = [];
    let program;
    let texture;
    try {
      for (const [type, code] of [[gl.VERTEX_SHADER, vertexShader], [gl.FRAGMENT_SHADER, fragmentShader]]) {
        const shader = gl.createShader(type);
        shaders.push(shader);
        gl.shaderSource(shader, code);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      }
      program = gl.createProgram();
      shaders.forEach(shader => gl.attachShader(program, shader));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);

      const positions = [];
      const coordinates = [];
      const columns = 42;
      const rows = 36;
      function vertex(column, row) {
        positions.push(column / columns * 2 - 1, 1 - row / rows * 2);
        coordinates.push(column / columns, row / rows);
      }
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          vertex(column, row); vertex(column + 1, row); vertex(column, row + 1);
          vertex(column + 1, row); vertex(column + 1, row + 1); vertex(column, row + 1);
        }
      }
      for (const [name, data] of [['a_position', positions], ['a_uv', coordinates]]) {
        const buffer = gl.createBuffer();
        buffers.push(buffer);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
        const location = gl.getAttribLocation(program, name);
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
      }
      texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);
      const uniforms = {};
      for (const name of ['bulge', 'aspect', 'scan', 'time', 'roll', 'noise', 'period', 'tone', 'wear', 'base', 'letterGrit']) {
        uniforms[name] = gl.getUniformLocation(program, 'u_' + name);
      }
      const set = (name, value) => gl.uniform1f(uniforms[name], value);
      return {
        upload() {
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        },
        resize(width, height) {
          const ratio = Math.min(devicePixelRatio || 1, 2);
          const pixelWidth = Math.round(width * ratio);
          const pixelHeight = Math.round(height * ratio);
          if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
          if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
          if (gl.isContextLost() ||
              gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return false;
          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.useProgram(program);
          set('aspect', width / height);
          return true;
        },
        paint() {
          if (gl.isContextLost()) return false;
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.useProgram(program);
          set('bulge', effects.curvature);
          set('scan', 1);
          set('time', reducedMotion.matches ? 0 : elapsed);
          set('roll', reducedMotion.matches ? 0 : effects.rolling);
          set('noise', effects.static);
          set('period', effects.period);
          set('tone', tone);
          set('wear', effects.wear);
          set('base', base);
          set('letterGrit', effects.letterGrit);
          gl.drawArrays(gl.TRIANGLES, 0, positions.length / 2);
          return !gl.isContextLost();
        }
      };
    } catch (error) {
      buffers.forEach(buffer => gl.deleteBuffer(buffer));
      if (texture) gl.deleteTexture(texture);
      if (program) gl.deleteProgram(program);
      console.warn('CRT rendering unavailable; using the text display.', error);
      return null;
    } finally {
      shaders.forEach(shader => gl.deleteShader(shader));
    }
  }

  function buildText() {
    if (!active || !renderer) return;
    const style = getComputedStyle(document.documentElement);
    const background = style.getPropertyValue('--glass').trim();
    const foreground = style.getPropertyValue('--phosphor').trim();
    tone = parseInt(foreground.slice(1, 3), 16) > 128 ? 1 : -1;
    base = parseInt(background.slice(1, 3), 16) / 255;
    const ctx = textContext;
    ctx.clearRect(0, 0, 960, 820);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, 960, 820);
    const glare = ctx.createRadialGradient(410, 170, 20, 410, 270, 640);
    glare.addColorStop(0, 'rgba(255,255,255,.045)');
    glare.addColorStop(1, 'rgba(0,0,0,.065)');
    ctx.fillStyle = glare;
    ctx.fillRect(0, 0, 960, 820);
    ctx.fillStyle = foreground;
    ctx.font = '400 60px Arial, sans-serif';
    ctx.textBaseline = 'top';
    ctx.shadowColor = foreground;
    ctx.shadowBlur = tone > 0 ? 3 : 0;
    ctx.fillText(active.name, 140, 135);
    const titleWidth = ctx.measureText(active.name).width;
    titleArea.right = 140 + titleWidth;
    ctx.globalAlpha = .4;
    ctx.fillRect(140, 205, titleWidth, 1.3);
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.font = '400 40px Arial, sans-serif';
    let line = '';
    let y = 272;
    for (const word of active.description.split(' ')) {
      const next = line ? line + ' ' + word : word;
      if (ctx.measureText(next).width > 650 && line) {
        ctx.fillText(line, 140, y);
        y += 64;
        line = word;
      } else {
        line = next;
      }
    }
    ctx.fillText(line, 140, y);
    renderer.upload();
  }

  // The real link occupies the same projected area as the title drawn on glass.
  function projectPoint(u, v, width, height) {
    const x = u * 2 - 1;
    const y = 1 - v * 2;
    const z = effects.curvature * (2 - x*x - y*y);
    const distance = 3.7 - z;
    return {
      x: (x * 1.19 * 2.67 / (width / height) / distance + 1) * width / 2,
      y: (1 - y * 2.67 / distance) * height / 2
    };
  }

  function draw() {
    if (!active) return;
    const rendered = !!renderer && !compact.matches;
    surface.classList.toggle('is-rendered', rendered);
    canvas.hidden = !rendered;
    if (!rendered) {
      title.removeAttribute('style');
      return;
    }
    const width = surface.clientWidth;
    const height = surface.clientHeight;
    if (!width || !height) return;
    if (!renderer.resize(width, height) || !renderer.paint()) {
      useTextDisplay();
      return;
    }
    const points = [[titleArea.left, titleArea.top], [titleArea.right, titleArea.top],
      [titleArea.left, titleArea.bottom], [titleArea.right, titleArea.bottom]]
      .map(([x, y]) => projectPoint(x / 960, y / 820, width, height));
    const left = Math.min(...points.map(point => point.x));
    const top = Math.min(...points.map(point => point.y));
    title.style.left = left + 'px';
    title.style.top = top + 'px';
    title.style.width = Math.max(...points.map(point => point.x)) - left + 'px';
    title.style.height = Math.max(...points.map(point => point.y)) - top + 'px';
  }

  function stopEffects() {
    cancelAnimationFrame(frameId);
    frameId = 0;
    lastFrame = 0;
    site.dataset.effectsPaused = 'true';
  }

  function useTextDisplay() {
    stopEffects();
    renderer = null;
    draw();
    startEffects();
  }

  function startEffects() {
    stopEffects();
    if (!active || reducedMotion.matches || document.hidden || !inView) return;
    site.dataset.effectsPaused = 'false';
    if (!renderer || compact.matches) return;
    function frame(now) {
      if (!active || document.hidden || !inView || reducedMotion.matches) { stopEffects(); return; }
      if (!lastFrame) lastFrame = now;
      const delta = now - lastFrame;
      if (delta >= 1000 / 30) {
        elapsed += Math.min(delta, 100) / 1000;
        lastFrame = now;
        if (!renderer.paint()) { useTextDisplay(); return; }
      }
      frameId = requestAnimationFrame(frame);
    }
    frameId = requestAnimationFrame(frame);
  }

  function close(returnFocus = true) {
    const previous = active;
    reveal?.cancel();
    stopEffects();
    active = null;
    panel.hidden = true;
    site.dataset.open = 'false';
    projects.forEach(project => project.button.setAttribute('aria-expanded', 'false'));
    status.textContent = '';
    if (returnFocus) previous?.button.focus();
  }

  function open(project) {
    if (active === project) { close(false); return; }
    reveal?.cancel();
    active = project;
    link.textContent = project.name;
    link.href = project.url;
    description.textContent = project.description;
    panel.hidden = false;
    site.dataset.open = 'true';
    projects.forEach(item => item.button.setAttribute('aria-expanded', String(item === project)));
    buildText();
    draw();
    startEffects();
    status.textContent = project.name + ' description opened.';
    if (!reducedMotion.matches) {
      reveal = panel.animate([
        { opacity: 0, transform: 'translateX(-30px) scale(.90,.96)', filter: 'blur(6px)' },
        { opacity: .7, offset: .52, transform: 'translateX(3px) scale(1.008)', filter: 'blur(.7px)' },
        { opacity: 1, transform: 'none', filter: 'blur(0)' }
      ], { duration: 540, easing: 'cubic-bezier(.18,.7,.2,1)' });
    }
  }

  // Keep ordinary links in the HTML so navigation also works without JavaScript.
  document.querySelectorAll('a[data-project]').forEach(anchor => {
    const project = { name: anchor.querySelector('.project-name').textContent,
      url: anchor.href, description: anchor.dataset.description };
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'project-trigger';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', panel.id);
    button.append(...anchor.childNodes);
    project.button = button;
    projects.set(anchor.dataset.project, project);
    button.addEventListener('click', () => open(project));
    anchor.replaceWith(button);
  });

  const grain = document.createElement('canvas');
  grain.width = grain.height = 64;
  const grainContext = grain.getContext('2d');
  if (grainContext) {
    const pixels = grainContext.createImageData(64, 64);
    let seed = 2841;
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = seed >>> 24;
      pixels.data[i + 3] = 85;
    }
    grainContext.putImageData(pixels, 0, 0);
    site.style.setProperty('--grain-image', 'url(' + grain.toDataURL() + ')');
  }

  renderer = createRenderer();
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && active) { event.preventDefault(); close(); }
  });
  new ResizeObserver(draw).observe(surface);
  new IntersectionObserver(entries => {
    inView = entries[0].isIntersecting;
    startEffects();
  }).observe(panel);
  compact.addEventListener('change', () => { draw(); startEffects(); });
  reducedMotion.addEventListener('change', () => { reveal?.cancel(); draw(); startEffects(); });
  appearance.addEventListener('change', () => { buildText(); draw(); });
  document.addEventListener('visibilitychange', startEffects);
  // Keep the readable CSS display for this page visit after a GPU failure.
  // Recreating the same failing renderer can otherwise blink indefinitely.
  canvas.addEventListener('webglcontextlost', useTextDisplay);
  stopEffects();
})();
