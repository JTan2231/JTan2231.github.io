(() => {
  'use strict';

  const site = document.querySelector('.site');
  const panel = document.getElementById('project-display');
  const surface = site.querySelector('.screen-surface');
  const content = surface.querySelector('.screen-content');
  const main = content.querySelector('main');
  const canvas = surface.querySelector('.screen-canvas');
  const link = panel.querySelector('.project-link');
  const description = panel.querySelector('.project-description');
  const status = document.getElementById('project-status');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const compact = matchMedia('(max-width: 520px)');
  const effects = { curvature: .15, rolling: .85, static: .57, period: 4.6, wear: .75, letterGrit: .65 };
  const projects = new Map();
  const words = new WeakMap();
  const visitedViews = new WeakSet();
  const source = document.createElement('canvas');
  const textContext = source.getContext('2d');
  let controls = [];
  let controlBounds = [];
  let textRuns = [];
  let screenWidth = 0;
  let screenHeight = 0;
  let depth = 0;
  let transitionFrame = 0;
  let active = null;
  let renderer = null;
  let frameId = 0;
  let lastFrame = 0;
  let elapsed = 0;
  let inView = false;
  let base = .11;
  let typingFrame = 0;
  let typingWords = [];

  function revealWord(word, count) {
    if (word.visible === count) return;
    word.visible = count;
    if (!count) {
      word.element.style.clipPath = 'inset(0 100% 0 0)';
    } else if (count === word.characters.length) {
      word.element.style.clipPath = '';
    } else {
      const range = document.createRange();
      range.setStart(word.element.firstChild, 0);
      range.setEnd(word.element.firstChild, word.characters.slice(0, count).join('').length);
      const width = word.element.getBoundingClientRect().width;
      const remaining = width ? 100 * (1 - range.getBoundingClientRect().width / width) : 0;
      word.element.style.clipPath = `inset(-4px ${remaining}% -6px -4px)`;
    }
  }

  function finishTyping() {
    cancelAnimationFrame(typingFrame);
    typingFrame = 0;
    typingWords.forEach(word => revealWord(word, word.characters.length));
    typingWords = [];
  }

  function startTyping(root, view = root) {
    finishTyping();
    // Keep complete text in the DOM, with its final layout and accessible names.
    // Only its visual reveal changes, in the same reading order as the HTML.
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      if (!walker.currentNode.parentElement.closest('.typing-word')) nodes.push(walker.currentNode);
    }
    for (const node of nodes) {
      const fragment = document.createDocumentFragment();
      for (const part of node.textContent.match(/\s+|\S+/g) || []) {
        if (/^\s+$/.test(part)) {
          fragment.append(document.createTextNode(part));
          continue;
        }
        const element = document.createElement('span');
        element.className = 'typing-word';
        element.textContent = part;
        const characters = Array.from(part);
        words.set(element, { element, characters, visible: characters.length });
        fragment.append(element);
      }
      node.replaceWith(fragment);
    }
    if (visitedViews.has(view)) return;
    visitedViews.add(view);
    if (reducedMotion.matches) return;
    typingWords = [...root.querySelectorAll('.typing-word')].map(element => words.get(element));
    let length = 0;
    for (const word of typingWords) {
      word.start = length;
      length += word.characters.length + 1;
      revealWord(word, 0);
    }
    const started = performance.now();
    let previous = -1;
    function frame(now) {
      const count = Math.floor((now - started) / 20);
      if (count !== previous) {
        typingWords.forEach(word => revealWord(word,
          Math.max(0, Math.min(word.characters.length, count - word.start))));
        paintScene();
        previous = count;
      }
      if (count < length) typingFrame = requestAnimationFrame(frame);
      else finishTyping();
    }
    typingFrame = requestAnimationFrame(frame);
  }

  const vertexShader = `
    attribute vec2 a_position;
    attribute vec2 a_uv;
    uniform float u_bulge;
    varying vec2 v_uv;
    void main() {
      float x = a_position.x;
      float y = a_position.y;
      float z = u_bulge * (2.0 - x*x - y*y);
      float distance = 3.7 - z;
      gl_Position = vec4(x * 3.4, y * 3.4, distance * .1, distance);
      v_uv = a_uv;
    }
  `;
  const fragmentShader = `
 precision highp float;
 varying vec2 v_uv;
 uniform sampler2D u_texture;
 uniform vec2 u_density;
 uniform float u_scan,u_time,u_roll,u_noise,u_period,u_wear,u_base,u_letterGrit;
 float hash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
 void main(){
   // Fade the entire screen into the page before reaching the mesh boundary.
   vec2 p=abs(v_uv*2.0-1.0)-vec2(.59,.58);
   float sd=length(max(p,0.0))+min(max(p.x,p.y),0.0)-.40;
   float mask=smoothstep(0.0,.14,-sd);
   if(mask<=0.0)discard;
   float rollY=1.2-fract(u_time/u_period+.32)*1.4;
   // Tilt the light three degrees, independent of the screen's aspect ratio.
   float rollSlope=.052408*(440.*u_density.x)/(374.*u_density.y);
   float dy=v_uv.y-rollY+(v_uv.x-.5)*rollSlope;
   float band=exp(-dy*dy/.0064)*u_roll;
   float trailing=exp(-(dy-.065)*(dy-.065)/.0012)*u_roll;
   float tick=floor(u_time*16.0);
   float rowNoise=hash(vec2(floor(v_uv.y*300.*u_density.y),tick));
   float cycle=fract(u_time/4.8);
   float burst=smoothstep(.86,.90,cycle)*(1.0-smoothstep(.97,1.0,cycle));
   float trackingY=.5+hash(vec2(floor(u_time/4.8),19.))*.32;
   float trackDistance=(v_uv.y-trackingY)/.013;
   float tracking=exp(-trackDistance*trackDistance)*burst*u_wear;
   vec2 sampleUV=v_uv;
   sampleUV.x+=((rowNoise-.5)*.0018*u_wear+tracking*.009)/u_density.x;
   vec2 samples=vec2(520.,360.)*u_density;
   vec2 coarseUV=(floor(sampleUV*samples)+.5)/samples;
   sampleUV=mix(sampleUV,coarseUV,u_wear*.65);
   vec3 sharp=texture2D(u_texture,sampleUV).rgb;
   vec3 smear=texture2D(u_texture,sampleUV-vec2(.0022,0.)/u_density).rgb*.24
             +texture2D(u_texture,sampleUV+vec2(.0022,0.)/u_density).rgb*.24
             +sharp*.52;
   vec3 ghost=texture2D(u_texture,sampleUV-vec2(.0065,.0008)/u_density).rgb;
   vec3 c=mix(sharp,smear,u_wear*.78);
   c=mix(c,ghost,u_wear*.095);
   vec3 bloom=(texture2D(u_texture,sampleUV+vec2(.0045,.0025)/u_density).rgb
             +texture2D(u_texture,sampleUV-vec2(.0045,.0025)/u_density).rgb)*.5;
   c+=max(vec3(0.),bloom-vec3(u_base))*u_wear*.12;
   float raster=.5+.5*sin(v_uv.y*300.*u_density.y*6.283185);
   c=mix(c,vec3(u_base),u_scan*(1.-raster)*(.10+.23*u_wear));
   float inkMask=smoothstep(.045,.34,sharp.r-u_base);
   float letterFleck=hash(floor(sampleUV*vec2(620.,510.)*u_density)+vec2(83.,11.));
   float wornPatches=smoothstep(.84,.97,letterFleck)*.62;
   float unevenPhosphor=.88+.16*hash(floor(sampleUV*vec2(240.,310.)*u_density)+vec2(4.,19.));
   vec3 wornInk=vec3(u_base)+(c-vec3(u_base))*unevenPhosphor*(1.-wornPatches);
   c=mix(c,wornInk,inkMask*u_letterGrit);
   // Keep the rolling light on the glass without displacing or relighting the ink.
   c+=vec3((band*.080-trailing*.030)*(1.-inkMask));
   float grain=hash(floor(v_uv*vec2(360.,300.)*u_density)+vec2(tick*17.,tick*31.));
   float fineGrain=hash(floor(v_uv*vec2(720.,600.)*u_density)+vec2(tick*11.,tick*7.));
   c+=vec3(((grain-.5)*.20+(fineGrain-.5)*.07)*u_noise);
   c+=vec3((rowNoise-.5)*.045*u_noise);
   float specks=step(.988,grain)-step(grain,.012);
   c+=vec3(specks*.11*u_noise);
   c+=vec3((grain-.35)*tracking*.18);
   float edge=pow(abs(v_uv.x-.5)*2.0,6.0)+pow(abs(v_uv.y-.5)*2.0,6.0);
   c=mix(c,vec3(u_base*.7),clamp(edge,0.,1.)*(.08+.13*u_wear));
   // An inset shadow follows the curved glass and darkens the finished image,
   // including static and rolling highlights, all the way to black at the edge.
   c*=smoothstep(0.0,.24,-sd);
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
      for (const name of ['bulge', 'density', 'scan', 'time', 'roll', 'noise', 'period', 'wear', 'base', 'letterGrit']) {
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
          // Keep the original grain, scanline, and lettering wear at the same pixel scale.
          gl.uniform2f(uniforms.density, width / 440, height / 374);
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

  function plane(detail) {
    return detail
      ? { scale: 900 / (900 - (1 - depth) * 60), opacity: Math.max(0, (depth - .18) / .82) }
      : { scale: 900 / (900 + depth * 180), opacity: 1 - depth * .8 };
  }

  function fadedColor(color, opacity) {
    const [red, green, blue, alpha = 1] = color.match(/[\d.]+/g).map(Number);
    return `rgba(${red}, ${green}, ${blue}, ${alpha * opacity})`;
  }

  function buildText() {
    const style = getComputedStyle(document.documentElement);
    const background = style.getPropertyValue('--glass').trim();
    base = parseInt(background.slice(1, 3), 16) / 255;
    const ctx = textContext;
    ctx.setTransform(source.width / screenWidth, 0, 0, source.height / screenHeight, 0, 0);
    ctx.clearRect(0, 0, screenWidth, screenHeight);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, screenWidth, screenHeight);
    const glare = ctx.createRadialGradient(screenWidth * .43, screenHeight * .21, 0,
      screenWidth * .43, screenHeight * .33, Math.max(screenWidth, screenHeight) * .67);
    glare.addColorStop(0, 'rgba(255,255,255,.045)');
    glare.addColorStop(1, 'rgba(0,0,0,.065)');
    ctx.fillStyle = glare;
    ctx.fillRect(0, 0, screenWidth, screenHeight);
    ctx.textBaseline = 'alphabetic';
    for (const run of textRuns) {
      const text = run.word ? run.word.characters.slice(0, run.word.visible).join('') : run.text;
      if (!text) continue;
      const { scale, opacity } = plane(run.detail);
      ctx.save();
      ctx.translate(screenWidth / 2, screenHeight / 2);
      ctx.scale(scale, scale);
      ctx.translate(-screenWidth / 2, -screenHeight / 2);
      ctx.font = run.font;
      ctx.letterSpacing = run.spacing;
      // Safari ignores globalAlpha for text with a blurred shadow. Fade both
      // colors explicitly so the lettering and its glow recede together.
      ctx.fillStyle = fadedColor(run.color, opacity);
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 1.2;
      ctx.fillText(text, run.x, run.y);
      ctx.shadowBlur = 0;
      if (run.underline) {
        ctx.fillStyle = fadedColor(run.color, opacity * .6);
        const width = text === run.text ? run.width : ctx.measureText(text).width;
        ctx.fillRect(run.x, run.y + 5, width, 1);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    renderer.upload();
  }

  function projectPoint(x, y) {
    const u = x / screenWidth * 2 - 1;
    const v = 1 - y / screenHeight * 2;
    const distance = 3.7 - effects.curvature * (2 - u*u - v*v);
    return {
      x: (u * 3.4 / distance + 1) * screenWidth / 2,
      y: (1 - v * 3.4 / distance) * screenHeight / 2
    };
  }

  function draw() {
    // Measure ordinary HTML first; it also remains the complete fallback display.
    surface.classList.remove('is-rendered');
    controls.forEach(control => { control.style.transform = ''; });
    const rendered = !!renderer && !compact.matches;
    canvas.hidden = !rendered;
    if (!rendered) return;
    screenWidth = surface.clientWidth;
    screenHeight = surface.clientHeight;
    if (!screenWidth || !screenHeight) return;
    if (!renderer.resize(screenWidth, screenHeight)) { useTextDisplay(); return; }
    const ratio = Math.min(devicePixelRatio || 1, 2);
    source.width = Math.round(screenWidth * ratio);
    source.height = Math.round(screenHeight * ratio);
    const origin = surface.getBoundingClientRect();
    content.classList.add('is-measuring');
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    textRuns = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const element = node.parentElement;
      if (element.closest('[hidden]')) continue;
      const style = getComputedStyle(element);
      const word = words.get(element);
      const decoration = word ? getComputedStyle(element.parentElement) : style;
      const size = parseFloat(style.fontSize);
      textContext.font = style.font;
      const metrics = textContext.measureText('Mg');
      const ascent = metrics.fontBoundingBoxAscent ?? size * .9;
      const descent = metrics.fontBoundingBoxDescent ?? size * .22;
      for (const match of node.textContent.matchAll(/\S+/g)) {
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        const rect = range.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        textRuns.push({ text: match[0], font: style.font,
          spacing: style.letterSpacing === 'normal' ? '0px' : style.letterSpacing,
          color: style.color, x: rect.left - origin.left,
          y: rect.top - origin.top + (rect.height - ascent - descent) / 2 + ascent,
          width: rect.width, underline: decoration.textDecorationLine.includes('underline'), word,
          detail: panel.contains(element) });
      }
    }
    controlBounds = controls.filter(control => !control.closest('[hidden]')).map(control => {
      const rect = control.getBoundingClientRect();
      return { control, x: rect.left - origin.left, y: rect.top - origin.top,
        width: rect.width, height: rect.height, detail: panel.contains(control) };
    });
    content.classList.remove('is-measuring');
    paintScene();
    if (renderer) surface.classList.add('is-rendered');
  }

  function paintScene() {
    site.style.setProperty('--depth', depth);
    if (!renderer || compact.matches) return;
    // Match native hit targets to both the plane's depth and the curved glass.
    for (const bounds of controlBounds) {
      const { control, width: originalWidth, height: originalHeight } = bounds;
      if (!originalWidth || !originalHeight) continue;
      const { scale } = plane(bounds.detail);
      const x = screenWidth / 2 + (bounds.x - screenWidth / 2) * scale;
      const y = screenHeight / 2 + (bounds.y - screenHeight / 2) * scale;
      const points = [[x, y], [x + originalWidth * scale, y], [x, y + originalHeight * scale],
        [x + originalWidth * scale, y + originalHeight * scale]].map(([left, top]) => projectPoint(left, top));
      const left = Math.min(...points.map(point => point.x));
      const top = Math.min(...points.map(point => point.y));
      const width = Math.max(...points.map(point => point.x)) - left;
      const height = Math.max(...points.map(point => point.y)) - top;
      control.style.transformOrigin = 'top left';
      control.style.transform = `translate(${(left - x) / scale}px, ${(top - y) / scale}px) scale(${width / (originalWidth * scale)}, ${height / (originalHeight * scale)})`;
    }
    buildText();
    if (!renderer.paint()) useTextDisplay();
  }

  function movePlanes(target) {
    cancelAnimationFrame(transitionFrame);
    transitionFrame = 0;
    const from = depth;
    const started = performance.now();
    const duration = reducedMotion.matches ? 0 : 520 * Math.abs(target - from);
    function frame(now) {
      const progress = duration ? Math.min(1, (now - started) / duration) : 1;
      depth = from + (target - from) * (1 - Math.pow(1 - progress, 3));
      paintScene();
      if (progress < 1) {
        transitionFrame = requestAnimationFrame(frame);
      } else {
        transitionFrame = 0;
        if (!target) panel.hidden = true;
        draw();
      }
    }
    frame(started);
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
    if (reducedMotion.matches || document.hidden || !inView) return;
    site.dataset.effectsPaused = 'false';
    if (!renderer || compact.matches) return;
    function frame(now) {
      if (document.hidden || !inView || reducedMotion.matches) { stopEffects(); return; }
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
    active = null;
    main.inert = false;
    panel.inert = true;
    site.dataset.open = 'false';
    projects.forEach(project => project.button.setAttribute('aria-expanded', 'false'));
    status.textContent = '';
    startTyping(main);
    if (returnFocus) previous?.button.focus({ preventScroll: true });
    draw();
    movePlanes(0);
  }

  function open(project) {
    if (active === project) { close(false); return; }
    active = project;
    link.textContent = project.name;
    link.href = project.url;
    description.textContent = project.description;
    panel.hidden = false;
    panel.inert = false;
    main.inert = true;
    site.dataset.open = 'true';
    projects.forEach(item => item.button.setAttribute('aria-expanded', String(item === project)));
    startTyping(panel, project);
    draw();
    movePlanes(1);
    startEffects();
    link.focus({ preventScroll: true });
    status.textContent = project.name + ' description opened.';
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

  panel.querySelector('.project-close').addEventListener('click', () => close());
  controls = [...content.querySelectorAll('a, button')];
  controls.forEach(control => {
    control.addEventListener('pointerenter', draw);
    control.addEventListener('pointerleave', draw);
  });
  content.addEventListener('focusin', draw);
  content.addEventListener('focusout', draw);

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
  }).observe(surface);
  compact.addEventListener('change', () => { draw(); startEffects(); });
  reducedMotion.addEventListener('change', () => { finishTyping(); movePlanes(active ? 1 : 0); startEffects(); });
  document.addEventListener('visibilitychange', startEffects);
  // Keep the readable CSS display for this page visit after a GPU failure.
  // Recreating the same failing renderer can otherwise blink indefinitely.
  canvas.addEventListener('webglcontextlost', useTextDisplay);
  startTyping(main);
  draw();
  stopEffects();
})();
