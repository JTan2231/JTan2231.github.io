(() => {
  'use strict';

  const site = document.querySelector('.site');
  const panel = document.getElementById('project-display');
  const surface = site.querySelector('.screen-surface');
  const content = surface.querySelector('.screen-content');
  const main = content.querySelector('main');
  const canvas = surface.querySelector('.screen-canvas');
  const video = surface.querySelector('.project-video');
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
  const textLayers = [main, panel].map(root => {
    const image = document.createElement('canvas');
    return { root, image, context: image.getContext('2d'), bounds: null, dirty: true };
  });
  const patch = document.createElement('canvas');
  const patchContext = patch.getContext('2d');
  const maxRenderPixels = 1920 * 1080;
  let patchBounds = null;
  let layoutDirty = true;
  let decorationsDirty = true;
  let sceneDirty = true;
  let geometryDirty = true;
  let controls = [];
  let controlBounds = [];
  let textRuns = [];
  let screenWidth = 0;
  let screenHeight = 0;
  let depth = 0;
  let transition = null;
  let active = null;
  let renderer = null;
  let frameId = 0;
  let nextFrame = 0;
  let lastTick = 0;
  let elapsed = 0;
  let inView = false;
  let base = .11;
  let typing = null;
  let typingWords = [];
  let videoFade = { from: 0, to: 0, started: 0 };
  let videoPauseTimer = 0;
  let videoFrameId = 0;
  let videoDirty = true;

  function watchVideoFrames() {
    if (!video.requestVideoFrameCallback || videoFrameId || video.paused || document.hidden || !inView) return;
    videoFrameId = video.requestVideoFrameCallback(() => {
      videoFrameId = 0;
      videoDirty = true;
      watchVideoFrames();
    });
  }

  function stopVideoFrames() {
    if (videoFrameId) video.cancelVideoFrameCallback(videoFrameId);
    videoFrameId = 0;
  }

  video.addEventListener('playing', watchVideoFrames);
  video.addEventListener('pause', stopVideoFrames);
  video.addEventListener('emptied', () => { stopVideoFrames(); videoDirty = true; });
  video.addEventListener('loadeddata', () => { videoDirty = true; });
  video.addEventListener('seeked', () => { videoDirty = true; });

  function videoAmount() {
    if (reducedMotion.matches) return 0;
    const duration = videoFade.to ? 2200 : 850;
    const progress = Math.min(1, (performance.now() - videoFade.started) / duration);
    const eased = videoFade.to ? progress * progress * (3 - 2 * progress) : 1 - Math.pow(1 - progress, 3);
    return videoFade.from + (videoFade.to - videoFade.from) * eased;
  }

  function fadeVideo(visible) {
    const target = visible ? 1 : 0;
    if (videoFade.to === target) return;
    videoFade = { from: videoAmount(), to: target, started: performance.now() };
    surface.classList.toggle('has-video', visible);
  }

  function syncVideo() {
    clearTimeout(videoPauseTimer);
    if (!active?.video || reducedMotion.matches) {
      fadeVideo(false);
      if (reducedMotion.matches || document.hidden || !inView) video.pause();
      else videoPauseTimer = setTimeout(() => video.pause(), 850);
      return;
    }
    if (document.hidden || !inView) { video.pause(); return; }
    const requestedSource = active.video;
    if (video.getAttribute('src') !== requestedSource) {
      // Withhold the source entirely until selection; preload is only a hint.
      fadeVideo(false);
      video.src = requestedSource;
      video.load();
    }
    video.play().then(() => {
      // play() also resolves when reopening during the fade-out, while the
      // video is still playing and will not emit another playing event.
      if (active?.video === requestedSource && !reducedMotion.matches && !document.hidden && inView) {
        fadeVideo(true);
      }
    }).catch(() => {
      if (video.getAttribute('src') === requestedSource && video.paused) fadeVideo(false);
    });
  }

  video.addEventListener('error', () => fadeVideo(false));

  function revealWord(word, count) {
    if (word.visible === count) return;
    word.visible = count;
    textLayers[word.detail ? 1 : 0].dirty = true;
    sceneDirty = true;
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
    typing = null;
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
        words.set(element, { element, characters, visible: characters.length, detail: root === panel });
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
    typing = { started: performance.now(), length, previous: -1 };
    requestRender();
  }

  function updateTyping(now) {
    if (!typing) return;
    const count = Math.floor((now - typing.started) / 20);
    if (count !== typing.previous) {
      typingWords.forEach(word => revealWord(word,
        Math.max(0, Math.min(word.characters.length, count - word.start))));
      typing.previous = count;
    }
    if (count >= typing.length) finishTyping();
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
 uniform sampler2D u_video;
 uniform vec2 u_videoScale;
 uniform float u_videoFade;
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
   float inkMask=smoothstep(.045,.34,sharp.r-u_base);
   // The moving image shares the glass curvature and tracking distortion.
   // Keep the lettering bright while the footage stays below the static.
   if(u_videoFade>0.){
     vec2 videoUV=(sampleUV-.5)*u_videoScale+.5;
     vec3 footage=texture2D(u_video,videoUV).rgb*.6
                 +texture2D(u_video,videoUV-vec2(.0022,0.)).rgb*.2
                 +texture2D(u_video,videoUV+vec2(.0022,0.)).rgb*.2;
     float luminance=dot(footage,vec3(.2126,.7152,.0722));
     luminance=clamp((luminance-.5)*1.25+.5,0.,1.)*.85;
     c+=vec3((luminance-u_base)*u_videoFade*(1.-inkMask));
   }
   float raster=.5+.5*sin(v_uv.y*300.*u_density.y*6.283185);
   c=mix(c,vec3(u_base),u_scan*(1.-raster)*(.10+.23*u_wear));
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
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false, depth: false });
    // Safari can return a context whose drawing buffer could not be allocated.
    if (!gl || gl.isContextLost() || !textContext || !patchContext || textLayers.some(layer => !layer.context) ||
        gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return null;
    const shaders = [];
    const buffers = [];
    let program;
    let texture;
    let videoTexture;
    let uploadedVideoFrame = -1;
    let uploadedVideoSource = '';
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
      videoTexture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, videoTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
        new Uint8Array([0, 0, 0, 255]));
      gl.uniform1i(gl.getUniformLocation(program, 'u_video'), 1);
      gl.activeTexture(gl.TEXTURE0);
      const uniforms = {};
      for (const name of ['bulge', 'density', 'scan', 'time', 'roll', 'noise', 'period', 'wear', 'base', 'letterGrit', 'videoScale', 'videoFade']) {
        uniforms[name] = gl.getUniformLocation(program, 'u_' + name);
      }
      const set = (name, value) => gl.uniform1f(uniforms[name], value);
      return {
        uploadBackground() {
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        },
        uploadText() {
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texSubImage2D(gl.TEXTURE_2D, 0, patchBounds.x, patchBounds.y,
            gl.RGBA, gl.UNSIGNED_BYTE, patch);
        },
        resize(width, height) {
          // Bound the full-screen fragment work, including on large/high-DPI displays.
          const ratio = Math.min(devicePixelRatio || 1, 1.5, Math.sqrt(maxRenderPixels / (width * height)));
          const pixelWidth = Math.max(1, Math.floor(width * ratio));
          const pixelHeight = Math.max(1, Math.floor(height * ratio));
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
          const amount = videoAmount();
          const ready = video.readyState >= 2 && video.videoWidth > 0;
          // Older browsers can use the decoded-frame counter. Both bundled
          // montages are 24fps, which also bounds the final clock-based fallback.
          const decodedFrame = video.requestVideoFrameCallback ? 0 :
            (video.getVideoPlaybackQuality?.().totalVideoFrames ?? Math.floor(video.currentTime * 24));
          if (amount > 0 && ready &&
              (videoDirty || uploadedVideoFrame !== decodedFrame || uploadedVideoSource !== video.currentSrc)) {
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, videoTexture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
            gl.activeTexture(gl.TEXTURE0);
            videoDirty = false;
            uploadedVideoFrame = decodedFrame;
            uploadedVideoSource = video.currentSrc;
          }
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
          set('videoFade', ready ? amount * .21 : 0);
          const videoAspect = ready ? video.videoWidth / video.videoHeight : 1;
          const screenAspect = screenWidth / screenHeight;
          gl.uniform2f(uniforms.videoScale, Math.min(1, screenAspect / videoAspect),
            Math.min(1, videoAspect / screenAspect));
          gl.drawArrays(gl.TRIANGLES, 0, positions.length / 2);
          return !gl.isContextLost();
        }
      };
    } catch (error) {
      buffers.forEach(buffer => gl.deleteBuffer(buffer));
      if (texture) gl.deleteTexture(texture);
      if (videoTexture) gl.deleteTexture(videoTexture);
      if (program) gl.deleteProgram(program);
      console.warn('CRT rendering unavailable; using the text display.', error);
      return null;
    } finally {
      shaders.forEach(shader => gl.deleteShader(shader));
    }
  }

  function plane(detail) {
    return detail
      ? { scale: 900 / (900 - (1 - depth) * 60), opacity: Math.max(0, Math.min(1, (depth - .18) / .82)) }
      : { scale: 900 / (900 + depth * 180), opacity: 1 - depth * .8 };
  }

  function prepareTextLayers() {
    const ratioX = source.width / screenWidth;
    const ratioY = source.height / screenHeight;
    const regions = [];
    textLayers.forEach((layer, index) => {
      const runs = textRuns.filter(run => Number(run.detail) === index);
      layer.dirty = true;
      layer.bounds = null;
      if (!runs.length) return;
      // Include the glow, glyph overhang, and underlines before scaling a plane.
      const x = Math.floor((Math.min(...runs.map(run => run.x)) - 8) * ratioX);
      const y = Math.floor((Math.min(...runs.map(run => run.top)) - 8) * ratioY);
      const right = Math.ceil((Math.max(...runs.map(run => run.x + run.width)) + 8) * ratioX);
      const bottom = Math.ceil((Math.max(...runs.map(run => run.bottom)) + 8) * ratioY);
      layer.bounds = { x, y, width: right - x, height: bottom - y };
      if (layer.image.width !== right - x) layer.image.width = right - x;
      if (layer.image.height !== bottom - y) layer.image.height = bottom - y;
      // The depth animation is monotonic: its two endpoints cover every frame.
      for (const scale of index ? [1, 900 / 840] : [900 / 1080, 1]) {
        regions.push({
          left: source.width / 2 + (x - source.width / 2) * scale,
          top: source.height / 2 + (y - source.height / 2) * scale,
          right: source.width / 2 + (right - source.width / 2) * scale,
          bottom: source.height / 2 + (bottom - source.height / 2) * scale
        });
      }
    });
    patchBounds = null;
    if (!regions.length) return;
    const x = Math.max(0, Math.floor(Math.min(...regions.map(region => region.left))) - 2);
    const y = Math.max(0, Math.floor(Math.min(...regions.map(region => region.top))) - 2);
    const right = Math.min(source.width, Math.ceil(Math.max(...regions.map(region => region.right))) + 2);
    const bottom = Math.min(source.height, Math.ceil(Math.max(...regions.map(region => region.bottom))) + 2);
    if (right <= x || bottom <= y) return;
    patchBounds = { x, y, width: right - x, height: bottom - y };
    if (patch.width !== patchBounds.width) patch.width = patchBounds.width;
    if (patch.height !== patchBounds.height) patch.height = patchBounds.height;
  }

  function buildBackground() {
    const style = getComputedStyle(document.documentElement);
    const background = style.getPropertyValue('--glass').trim();
    base = parseInt(background.slice(1, 3), 16) / 255;
    const ctx = textContext;
    ctx.setTransform(source.width / screenWidth, 0, 0, source.height / screenHeight, 0, 0);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, screenWidth, screenHeight);
    const glare = ctx.createRadialGradient(screenWidth * .43, screenHeight * .21, 0,
      screenWidth * .43, screenHeight * .33, Math.max(screenWidth, screenHeight) * .67);
    glare.addColorStop(0, 'rgba(255,255,255,.045)');
    glare.addColorStop(1, 'rgba(0,0,0,.065)');
    ctx.fillStyle = glare;
    ctx.fillRect(0, 0, screenWidth, screenHeight);
    // Also clears any text left outside the new crop after a layout change.
    renderer.uploadBackground();
  }

  function buildText() {
    if (!patchBounds) return;
    textLayers.forEach((layer, index) => {
      if (!layer.bounds || !layer.dirty) return;
      const ctx = layer.context;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, layer.image.width, layer.image.height);
      ctx.setTransform(source.width / screenWidth, 0, 0, source.height / screenHeight,
        -layer.bounds.x, -layer.bounds.y);
      ctx.textBaseline = 'alphabetic';
      for (const run of textRuns) {
        if (Number(run.detail) !== index) continue;
        const text = run.word ? run.word.characters.slice(0, run.word.visible).join('') : run.text;
        if (!text) continue;
        ctx.font = run.font;
        ctx.letterSpacing = run.spacing;
        ctx.fillStyle = run.color;
        ctx.shadowColor = run.color;
        ctx.shadowBlur = 1.2;
        ctx.fillText(text, run.x, run.y);
        ctx.shadowBlur = 0;
        if (run.underline) {
          ctx.globalAlpha = .6;
          const width = text === run.text ? run.width : ctx.measureText(text).width;
          ctx.fillRect(run.x, run.y + 5, width, 1);
          ctx.globalAlpha = 1;
        }
      }
      layer.dirty = false;
    });
    const ctx = patchContext;
    const { x, y, width, height } = patchBounds;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(source, x, y, width, height, 0, 0, width, height);
    textLayers.forEach((layer, index) => {
      if (!layer.bounds) return;
      const { scale, opacity } = plane(index === 1);
      if (!opacity) return;
      ctx.setTransform(scale, 0, 0, scale,
        (1 - scale) * source.width / 2 - x, (1 - scale) * source.height / 2 - y);
      ctx.globalAlpha = opacity;
      ctx.drawImage(layer.image, layer.bounds.x, layer.bounds.y);
    });
    // Only the text region changes; the rest of the GPU texture stays cached.
    renderer.uploadText();
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
    layoutDirty = true;
    requestRender();
  }

  function measureScene() {
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
    if (source.width !== canvas.width) source.width = canvas.width;
    if (source.height !== canvas.height) source.height = canvas.height;
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
          color: style.color, normalColor: style.color, x: rect.left - origin.left,
          y: rect.top - origin.top + (rect.height - ascent - descent) / 2 + ascent,
          top: rect.top - origin.top, bottom: rect.bottom - origin.top,
          width: rect.width, underline: decoration.textDecorationLine.includes('underline'), word,
          control: element.closest('a, button'), projectName: !!element.closest('.project-name'),
          detail: panel.contains(element) });
      }
    }
    controlBounds = controls.filter(control => !control.closest('[hidden]')).map(control => {
      const rect = control.getBoundingClientRect();
      return { control, x: rect.left - origin.left, y: rect.top - origin.top,
        width: rect.width, height: rect.height, detail: panel.contains(control) };
    });
    content.classList.remove('is-measuring');
    prepareTextLayers();
    buildBackground();
    decorationsDirty = sceneDirty = geometryDirty = true;
    surface.classList.add('is-rendered');
  }

  function updateDecorations() {
    const style = getComputedStyle(document.documentElement);
    const muted = style.getPropertyValue('--muted').trim();
    const phosphor = style.getPropertyValue('--phosphor').trim();
    for (const run of textRuns) {
      if (!run.control) continue;
      const hovered = run.control.matches(':hover');
      const focused = run.control.matches(':focus-visible');
      const closeControl = run.control.classList.contains('project-close');
      const underline = run.projectName
        ? hovered || focused || run.control.getAttribute('aria-expanded') === 'true'
        : closeControl ? focused : run.control.classList.contains('project-link');
      const color = closeControl ? (hovered ? phosphor : muted) : run.normalColor;
      if (run.underline === underline && run.color === color) continue;
      run.underline = underline;
      run.color = color;
      textLayers[run.detail ? 1 : 0].dirty = true;
      sceneDirty = true;
    }
  }

  function decorate() {
    decorationsDirty = true;
    requestRender();
  }

  function positionControls() {
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
  }

  function movePlanes(target) {
    transition = { from: depth, target, started: performance.now(),
      duration: reducedMotion.matches ? 0 : 520 * Math.abs(target - depth) };
    requestRender();
  }

  function updateTransition(now) {
    if (!transition) return;
    const { from, target, started, duration } = transition;
    const progress = duration ? Math.max(0, Math.min(1, (now - started) / duration)) : 1;
    depth = from + (target - from) * (1 - Math.pow(1 - progress, 3));
    geometryDirty = sceneDirty = true;
    if (progress === 1) {
      transition = null;
      if (!target) {
        panel.hidden = true;
        layoutDirty = true;
      }
    }
  }

  function stopEffects() {
    cancelAnimationFrame(frameId);
    frameId = 0;
    nextFrame = lastTick = 0;
    site.dataset.effectsPaused = 'true';
  }

  function useTextDisplay() {
    stopEffects();
    renderer = null;
    surface.classList.remove('is-rendered');
    canvas.hidden = true;
    controls.forEach(control => { control.style.transform = ''; });
    draw();
    startEffects();
  }

  function startEffects() {
    stopEffects();
    syncVideo();
    site.dataset.effectsPaused = String(reducedMotion.matches || document.hidden || !inView);
    requestRender();
  }

  function requestRender() {
    if (!frameId && !document.hidden && inView) frameId = requestAnimationFrame(renderFrame);
  }

  function renderFrame(now) {
    frameId = 0;
    if (document.hidden || !inView) return;
    const rendered = !!renderer && !compact.matches;
    const interval = 1000 / (rendered ? 30 : 60);
    if (nextFrame && now + .1 < nextFrame) { requestRender(); return; }
    // Retain the deadline remainder instead of drifting below the target rate.
    nextFrame = nextFrame ? now + interval - Math.max(0, now - nextFrame) % interval : now + interval;
    if (lastTick && !reducedMotion.matches) elapsed += (now - lastTick) / 1000;
    lastTick = now;
    updateTyping(now);
    updateTransition(now);
    if (layoutDirty) {
      layoutDirty = false;
      measureScene();
    }
    if (decorationsDirty) {
      decorationsDirty = false;
      if (renderer && !compact.matches) updateDecorations();
    }
    if (geometryDirty) {
      geometryDirty = false;
      positionControls();
    }
    if (sceneDirty) {
      sceneDirty = false;
      if (renderer && !compact.matches) buildText();
    }
    if (renderer && !compact.matches && screenWidth && screenHeight) {
      if (!renderer.paint()) { useTextDisplay(); return; }
    }
    if (typing || transition || layoutDirty || sceneDirty ||
        (renderer && !compact.matches && !reducedMotion.matches)) requestRender();
    else nextFrame = lastTick = 0;
  }

  function close(returnFocus = true) {
    const previous = active;
    active = null;
    syncVideo();
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
      url: anchor.href, description: anchor.dataset.description, video: anchor.dataset.video };
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
    control.addEventListener('pointerenter', decorate);
    control.addEventListener('pointerleave', decorate);
  });
  content.addEventListener('focusin', decorate);
  content.addEventListener('focusout', decorate);

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
})();
