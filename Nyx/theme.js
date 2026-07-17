(function nyxtails() {
  if (!Spicetify?.Platform || !Spicetify?.Platform?.History?.listen) {
    setTimeout(nyxtails, 100);
    return;
  }

  const IMGBB_API_KEY = "b62c9bf34f238dd09b38aff7b903db25";
  const IMGBB_UPLOAD_URL = "https://api.imgbb.com/1/upload";
  const FILE_SIZE_LIMIT_MB = 2;
  const IMGBB_MAX_SIZE_MB = 32;

  const defImage = "https://nyxtails.com/bg.mp4";
  let startImage = localStorage.getItem("nyxtails:startupBg") || defImage;

  let ZOOM_BASE = 1.01;
  let ZOOM_MAX = 1.05;

  async function uploadToImgBB(file) {
    const formData = new FormData();
    formData.append("key", IMGBB_API_KEY);
    formData.append("image", file);

    try {
      const response = await fetch(IMGBB_UPLOAD_URL, {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error?.message || "Upload failed");
      }

      return {
        success: true,
        url: result.data.url
      };
    } catch (error) {
      console.error("[NYXTAILS] ImgBB upload error:", error);
      return { success: false, error: error.message };
    }
  }

  function isVideoUrl(url) {
    return /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(url || "") ||
      (url && url.startsWith('data:video/'));
  }

  const toggleInfo = [
    { id: "HideNowPlayingSidebar", name: "Hide Right Sidebar", defVal: false }
  ];

  const sliders = [
    { id: "blur", name: "Blur", min: 0, max: 50, step: 1, defVal: 0, suffix: "px" },
    { id: "cont", name: "Contrast", min: 0, max: 200, step: 2, defVal: 132, suffix: "%" },
    { id: "satu", name: "Saturation", min: 0, max: 200, step: 2, defVal: 140, suffix: "%" },
    { id: "bright", name: "Brightness", min: 0, max: 200, step: 2, defVal: 98, suffix: "%" },
    { id: "sharp", name: "Sharpness", min: 0, max: 10, step: 0.1, defVal: 0, suffix: "" },
  ];

  (function sidebar() {
    if (localStorage.getItem("Nyxtails Sidebar Activated")) return;
    const parsedObject = JSON.parse(localStorage.getItem("spicetify-exp-features"));
    let reload = false;
    const features = [
      "enableYLXSidebar", "enableRightSidebar", "enableRightSidebarTransitionAnimations",
      "enableRightSidebarLyrics", "enableRightSidebarExtractedColors", "enablePanelSizeCoordination",
    ];

    for (const feature of features) {
      if (!parsedObject?.[feature]) continue;
      if (!parsedObject?.[feature]?.value) {
        parsedObject[feature].value = true;
        reload = true;
      }
    }

    localStorage.setItem("spicetify-exp-features", JSON.stringify(parsedObject));
    localStorage.setItem("Nyxtails Sidebar Activated", true);
    if (reload) window.location.reload();
  })();

  let nyxtailsAudioSegments = null;
  let nyxtailsAudioLoudnessMin = -60;
  let nyxtailsAudioLoudnessMax = 0;
  let nyxtailsCurrentTempo = 120;
  let nyxtailsZoomInterval = 10;
  let nyxtailsSmoothedZoom = ZOOM_BASE;

  async function loadAudioAnalysisForCurrentTrack() {
    nyxtailsAudioSegments = null;
    nyxtailsCurrentTempo = 120;
    try {
      const uri = Spicetify?.Player?.data?.track?.uri;
      if (!uri) return;

      const trackId = uri.split(":").pop();
      try {
        const data = await Spicetify.CosmosAsync.get('https://api.spotify.com/v1/audio-analysis/' + trackId);
        if (data && data.segments && data.segments.length) {
          nyxtailsAudioSegments = data.segments;
          const loudnessValues = nyxtailsAudioSegments.map((s) => s.loudness_max || s.loudness_start || -60);
          nyxtailsAudioLoudnessMin = Math.min(...loudnessValues);
          nyxtailsAudioLoudnessMax = Math.max(...loudnessValues);
          return;
        }
      } catch (_) { }

      const fData = await Spicetify.CosmosAsync.get(`https://api.spotify.com/v1/audio-features/${trackId}`);
      if (fData?.tempo) {
        nyxtailsCurrentTempo = fData.tempo;
      }
    } catch (e) { }
  }

  function currentBassEnergy(progressMs) {
    if (nyxtailsAudioSegments) {
      const t = progressMs / 1000;
      let seg = nyxtailsAudioSegments[0];
      for (let i = 0; i < nyxtailsAudioSegments.length; i++) {
        if (nyxtailsAudioSegments[i].start <= t) seg = nyxtailsAudioSegments[i];
        else break;
      }
      const range = nyxtailsAudioLoudnessMax - nyxtailsAudioLoudnessMin || 1;
      return Math.min(1, Math.max(0, (seg.loudness_max - nyxtailsAudioLoudnessMin) / range));
    }

    const beatInterval = 60000 / nyxtailsCurrentTempo;
    const phase = (progressMs % beatInterval) / beatInterval;
    return Math.pow(Math.max(0, Math.cos(phase * Math.PI)), 4);
  }

  function startBpmReactiveBgZoom(videoEl = null) {
    if (nyxtailsZoomInterval) clearInterval(nyxtailsZoomInterval);
    nyxtailsSmoothedZoom = ZOOM_BASE;

    const SPEED_MIN = 0.1;
    const SPEED_MAX = 4;
    let nyxtailsSmoothedSpeed = SPEED_MIN;

    nyxtailsZoomInterval = setInterval(() => {
      if (!Spicetify?.Player?.isPlaying?.()) {
        const targetZoom = ZOOM_BASE;
        nyxtailsSmoothedZoom += (targetZoom - nyxtailsSmoothedZoom) * 0.02;
        document.documentElement.style.setProperty("--nyxtails-bg-zoom", nyxtailsSmoothedZoom.toFixed(4));
        if (videoEl) {
          try { videoEl.playbackRate = SPEED_MIN; } catch (e) { }
          videoEl.style.transform = `scale(${nyxtailsSmoothedZoom.toFixed(4)})`;
        }
        return;
      }

      const progressMs = Spicetify.Player.getProgress();
      const energy = currentBassEnergy(progressMs);
      const targetZoom = ZOOM_BASE + (ZOOM_MAX - ZOOM_BASE) * energy;

      nyxtailsSmoothedZoom += (targetZoom - nyxtailsSmoothedZoom) * 0.3;
      document.documentElement.style.setProperty("--nyxtails-bg-zoom", nyxtailsSmoothedZoom.toFixed(4));

      if (videoEl && videoEl.isConnected) {
        const targetSpeed = SPEED_MIN + (SPEED_MAX - SPEED_MIN) * energy;

        if (targetSpeed > nyxtailsSmoothedSpeed) {
          nyxtailsSmoothedSpeed += (targetSpeed - nyxtailsSmoothedSpeed) * 0.95;
        } else {
          nyxtailsSmoothedSpeed += (targetSpeed - nyxtailsSmoothedSpeed) * 0.05;
        }

        const newSpeed = Math.min(SPEED_MAX, Math.max(SPEED_MIN, nyxtailsSmoothedSpeed));

        try {
          if (Math.abs(videoEl.playbackRate - newSpeed) > 0.02) {
            videoEl.playbackRate = newSpeed;
          }
        } catch (e) { }

        videoEl.style.transform = `scale(${nyxtailsSmoothedZoom.toFixed(4)})`;
      }
    }, 100);
  }

  function stopBpmReactiveBgZoom() {
    if (nyxtailsZoomInterval) clearInterval(nyxtailsZoomInterval);
    nyxtailsZoomInterval = null;
    document.documentElement.style.setProperty("--nyxtails-bg-zoom", "1");
  }

  function watchPlayerForAudioAnalysis() {
    if (!Spicetify?.Player?.addEventListener) {
      setTimeout(watchPlayerForAudioAnalysis, 300);
      return;
    }
    Spicetify.Player.addEventListener("songchange", loadAudioAnalysisForCurrentTrack);
    loadAudioAnalysisForCurrentTrack();
  }
  watchPlayerForAudioAnalysis();

  function loadSliders() {
    sliders.forEach((opt) => {
      const val = localStorage.getItem(`${opt.id}Amount`) || opt.defVal;
      document.documentElement.style.setProperty(`--${opt.id}`, `${val}${opt.suffix || ""}`);
    });
  }

  function setAccentColor(color) {
    document.querySelector(":root").style.setProperty("--spice-button", color);
    document.querySelector(":root").style.setProperty("--spice-button-active", color);
    document.querySelector(":root").style.setProperty("--spice-accent", color);
  }

  async function applyBackground() {
    let videoEl = document.getElementById("nyxtails-bg-video");
    if (videoEl) videoEl.remove();
    document.documentElement.classList.remove("nyxtails-bg-is-video");

    if (isVideoUrl(startImage)) {
      document.documentElement.classList.add("nyxtails-bg-is-video");
      videoEl = document.createElement("video");
      videoEl.id = "nyxtails-bg-video";
      videoEl.autoplay = true;
      videoEl.muted = true;
      videoEl.loop = true;
      videoEl.playsInline = true;

      videoEl.style.position = 'fixed';
      videoEl.style.top = '0';
      videoEl.style.left = '0';
      videoEl.style.width = '100vw';
      videoEl.style.height = '100vh';
      videoEl.style.objectFit = 'cover';
      videoEl.style.zIndex = '0';
      videoEl.style.pointerEvents = 'none';
      videoEl.style.transformOrigin = 'center center';

      videoEl.src = startImage;

      const topContainer = document.querySelector(".Root__top-container");
      if (topContainer) {
        topContainer.prepend(videoEl);
      } else {
        document.body.prepend(videoEl);
      }

      videoEl.play().catch(e => console.warn("Nyxtails: Video failed to autoplay", e));
      startBpmReactiveBgZoom(videoEl);
    } else {
      document.documentElement.style.setProperty("--image_url", `url("${startImage}")`);
      startBpmReactiveBgZoom(null);
    }

    setAccentColor(localStorage.getItem("CustomColor") || "#ffc0ea");
  }

  function loadToggles() {
    const hideSidebar = JSON.parse(localStorage.getItem("HideNowPlayingSidebar"));
    if (hideSidebar) {
      document.body.classList.add("__nyxtails_hidenowplayingsidebar");
    } else {
      document.body.classList.remove("__nyxtails_hidenowplayingsidebar");
    }
  }

  loadSliders();
  loadToggles();
  applyBackground();

  if (window.navigator.userAgent.indexOf("Win") !== -1)
    document.body.classList.add("windows");
  galaxyFade();

  function scrollToTop() {
    const element = document.querySelector(".main-entityHeader-container");
    if (element) element.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest(".main-entityHeader-topbarTitle")) scrollToTop();
  });

  function updateZoomVariable() {
    let prevOuterWidth = window.outerWidth;
    let prevInnerWidth = window.innerWidth;
    let prevRatio = window.devicePixelRatio;

    function calculateAndApplyZoom() {
      const newOuterWidth = window.outerWidth;
      const newInnerWidth = window.innerWidth;
      const newRatio = window.devicePixelRatio;

      if (prevOuterWidth <= 160 || prevRatio !== newRatio || prevOuterWidth !== newOuterWidth || prevInnerWidth !== newInnerWidth) {
        const zoomFactor = newOuterWidth / newInnerWidth || 1;
        document.documentElement.style.setProperty("--zoom", zoomFactor);
        prevOuterWidth = newOuterWidth;
        prevInnerWidth = newInnerWidth;
        prevRatio = newRatio;
      }
    }
    calculateAndApplyZoom();
    window.addEventListener("resize", calculateAndApplyZoom);
  }
  updateZoomVariable();

  function waitForElement(elements, func, timeout = 100) {
    const queries = elements.map((element) => document.querySelector(element));
    if (queries.every((a) => a)) {
      func(queries);
    } else if (timeout > 0) {
      setTimeout(waitForElement, 300, elements, func, timeout - 1);
    }
  }

  waitForElement([".Root__globalNav"], (element) => {
    const isCenteredGlobalNav = Spicetify.Platform.version >= "1.2.46.462";
    let addedClass = "control-nav";
    if (element?.[0]?.classList.contains("Root__globalNav"))
      addedClass = isCenteredGlobalNav ? "global-nav-centered" : "global-nav";
    document.body.classList.add(addedClass);
  }, 10000);

  function galaxyFade() {
    const setupFade = (selector, onScrollCallback) => {
      waitForElement([selector], ([scrollNode]) => {
        let ticking = false;
        scrollNode.addEventListener("scroll", () => {
          if (!ticking) {
            window.requestAnimationFrame(() => {
              onScrollCallback(scrollNode);
              ticking = false;
            });
            ticking = true;
          }
        });
        onScrollCallback(scrollNode);
      });
    };
    const applyArtistFade = (scrollNode) => {
      const scrollValue = scrollNode.scrollTop;
      const fadeValue = Math.max(0, (-0.3 * scrollValue + 100) / 100);
      document.documentElement.style.setProperty("--artist-fade", fadeValue);
    };
    setupFade(".Root__main-view [data-overlayscrollbars-viewport]", (scrollNode) => { applyArtistFade(scrollNode); });
  }

  function createTopbarButton() {
    if (!Spicetify?.Topbar?.Button) {
      setTimeout(createTopbarButton, 300);
      return;
    }

    const homeEdit = new Spicetify.Topbar.Button("Nyxtails Settings", "edit", () => {
      const content = document.createElement("div");
      content.id = "nyxtails-settings-container";
      content.innerHTML = `
      <style>
        /* Force Spicetify Modal to be larger */

        
        #nyxtails-settings-container {
          padding: 30px;
          color: #fff;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          width: 100%;
          box-sizing: border-box;
        }
        .nyxtails-header {
          display: flex;
          align-items: center;
          gap: 20px;
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .nyxtails-header img, .nyxtails-header video {
          width: 120px;
          height: 120px;
          border-radius: 15px;
          object-fit: cover;
          box-shadow: 0 8px 25px rgba(0,0,0,0.4);
          background: #000;
        }
        .nyxtails-tabs {
          display: flex;
          gap: 10px;
          margin-bottom: 25px;
          background: rgba(255,255,255,0.05);
          padding: 6px;
          border-radius: 12px;
        }
        .nyxtails-tab {
          flex: 1;
          padding: 12px;
          border: none;
          background: transparent;
          color: #aaa;
          cursor: pointer;
          border-radius: 10px;
          font-weight: 700;
          transition: all 0.2s;
          font-size: 1rem;
        }
        .nyxtails-tab.active {
          background: var(--spice-button);
          color: #000;
        }
        .nyxtails-section {
          margin-bottom: 25px;
          background: rgba(255,255,255,0.04);
          padding: 25px;
          border-radius: 15px;
        }
        .nyxtails-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        .nyxtails-row:last-child { margin-bottom: 0; }
        .nyxtails-label { font-size: 1rem; font-weight: 600; }
        .nyxtails-input {
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.1);
          color: #fff;
          padding: 12px 16px;
          border-radius: 10px;
          width: 100%;
          outline: none;
          font-size: 0.95rem;
        }
        .nyxtails-slider {
          width: 100%;
          height: 8px;
          background: rgba(255,255,255,0.1);
          border-radius: 4px;
          appearance: none;
          outline: none;
          margin: 15px 0;
        }
        .nyxtails-slider::-webkit-slider-thumb {
          appearance: none;
          width: 22px;
          height: 22px;
          background: #fff;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 0 8px rgba(0,0,0,0.6);
        }
        .nyxtails-toggle {
          width: 50px;
          height: 26px;
          background: rgba(255,255,255,0.1);
          border-radius: 13px;
          position: relative;
          cursor: pointer;
          transition: 0.3s;
        }
        .nyxtails-toggle.active { background: var(--spice-button); }
        .nyxtails-toggle::after {
          content: '';
          position: absolute;
          width: 20px;
          height: 20px;
          background: #fff;
          border-radius: 50%;
          top: 3px;
          left: 3px;
          transition: 0.3s;
        }
        .nyxtails-toggle.active::after { left: 27px; }
        .nyxtails-btn {
          padding: 16px;
          border-radius: 12px;
          border: none;
          cursor: pointer;
          font-weight: 800;
          transition: all 0.2s;
          font-size: 1rem;
        }
        .nyxtails-btn-primary { background: var(--spice-button); color: #000; }
        .nyxtails-btn-secondary { background: #ea5d5d; color: #fff; }
        .nyxtails-btn:hover { transform: scale(1.03); filter: brightness(1.1); }
      </style>
      <div class="nyxtails-header">
        <div id="nyxtails-preview-container"></div>
        <div>
          <h2 style="margin:0; font-size: 1.8rem;">Nyxtails</h2>
          <p style="margin:5px 0 0 0; opacity: 0.7; font-size: 0.95rem;">Panel and Visual Settings</p>
        </div>
      </div>
      
      <div class="nyxtails-tabs">
        <button class="nyxtails-tab active" data-tab="url">🌐 URL</button>
        <button class="nyxtails-tab" data-tab="file">📁 File</button>
        <button class="nyxtails-tab" data-tab="base64">📝 Base64</button>
      </div>

      <div id="tab-url" class="nyxtails-tab-content">
        <input type="text" id="nyxtails-url-input" class="nyxtails-input" placeholder="https://example.com/background.jpg">
        <p style="font-size:0.85rem; opacity:0.6; margin-top:10px">The link of uploaded files will be saved here automatically.</p>
      </div>

      <div id="tab-file" class="nyxtails-tab-content" style="display:none">
        <button class="nyxtails-btn nyxtails-btn-primary" id="nyxtails-file-btn" style="width:100%">Select File from Computer</button>
        <div id="nyxtails-file-status" style="margin-top:15px; font-size:0.95rem; text-align:center; font-weight:600"></div>
      </div>

      <div id="tab-base64" class="nyxtails-tab-content" style="display:none">
        <textarea id="nyxtails-base64-input" class="nyxtails-input" style="height:120px; resize:none" placeholder="data:image..."></textarea>
      </div>

      <div class="nyxtails-section" style="margin-top:25px">
        <div class="nyxtails-row">
          <span class="nyxtails-label">Accent Color</span>
          <input type="color" id="nyxtails-color-input" style="background:none; border:none; width:50px; height:50px; cursor:pointer">
        </div>
        ${toggleInfo.map(t => `
          <div class="nyxtails-row">
            <span class="nyxtails-label">${t.name}</span>
            <div class="nyxtails-toggle" id="toggle-${t.id}"></div>
          </div>
        `).join('')}
      </div>

      <div class="nyxtails-section">
        ${sliders.map(s => `
          <div class="nyxtails-row" style="flex-direction:column; align-items:flex-start; gap:6px">
            <div style="display:flex; justify-content:space-between; width:100%">
              <span class="nyxtails-label">${s.name}</span>
              <span class="nyxtails-label" id="val-${s.id}">${localStorage.getItem(s.id + "Amount") || s.defVal}${s.suffix || ""}</span>
            </div>
            <input type="range" class="nyxtails-slider" id="slider-${s.id}" min="${s.min}" max="${s.max}" step="${s.step}" value="${localStorage.getItem(s.id + "Amount") || s.defVal}">
          </div>
        `).join('')}
      </div>

      <div style="display:flex; gap:15px; margin-top:10px">
        <button class="nyxtails-btn nyxtails-btn-secondary" id="nyxtails-reset" style="flex:1">Reset</button>
        <button class="nyxtails-btn nyxtails-btn-primary" id="nyxtails-save" style="flex:2">Save Settings</button>
      </div>
      `;

      let pendingData = null;
      let currentMode = 'url';

      const previewContainer = content.querySelector("#nyxtails-preview-container");
      const urlInput = content.querySelector("#nyxtails-url-input");
      const base64Input = content.querySelector("#nyxtails-base64-input");

      function updatePreview(path) {
        previewContainer.innerHTML = '';
        if (isVideoUrl(path)) {
          const v = document.createElement("video");
          v.src = path; v.autoplay = true; v.muted = true; v.loop = true;
          previewContainer.append(v);
        } else {
          const img = document.createElement("img");
          img.src = path;
          previewContainer.append(img);
        }
      }
      updatePreview(startImage);

      content.querySelectorAll(".nyxtails-tab").forEach(tab => {
        tab.onclick = () => {
          content.querySelectorAll(".nyxtails-tab").forEach(t => t.classList.remove("active"));
          tab.classList.add("active");
          currentMode = tab.dataset.tab;
          content.querySelectorAll(".nyxtails-tab-content").forEach(c => c.style.display = 'none');
          content.querySelector(`#tab-${currentMode}`).style.display = 'block';
        };
      });

      urlInput.value = startImage.startsWith('data:') ? "" : startImage;
      urlInput.oninput = () => { pendingData = null; updatePreview(urlInput.value); };

      if (startImage.startsWith('data:')) base64Input.value = startImage;
      base64Input.oninput = () => { pendingData = base64Input.value; updatePreview(pendingData); };

      const fileBtn = content.querySelector("#nyxtails-file-btn");
      const fileStatus = content.querySelector("#nyxtails-file-status");
      fileBtn.onclick = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*,video/mp4,video/webm';
        input.onchange = async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          const sizeMB = file.size / (1024 * 1024);
          if (sizeMB > IMGBB_MAX_SIZE_MB) {
            Spicetify.showNotification("File is too large!", true);
            return;
          }
          if (sizeMB > FILE_SIZE_LIMIT_MB) {
            fileStatus.textContent = "📤 Uploading to server...";
            fileStatus.style.color = "var(--spice-button)";
            const res = await uploadToImgBB(file);
            if (res.success) {
              pendingData = res.url;
              urlInput.value = res.url;
              updatePreview(pendingData);
              fileStatus.textContent = "✅ Uploaded to Cloud!";
              fileStatus.style.color = "#4ade80";
              Spicetify.showNotification("✅ File uploaded successfully!");
            } else {
              fileStatus.textContent = "❌ Upload error!";
              fileStatus.style.color = "#ea5d5d";
            }
          } else {
            const reader = new FileReader();
            reader.onload = (ev) => {
              pendingData = ev.target.result;
              updatePreview(pendingData);
              fileStatus.textContent = "✅ Ready (Local)";
              fileStatus.style.color = "#4ade80";
            };
            reader.readAsDataURL(file);
          }
        };
        input.click();
      };

      toggleInfo.forEach(t => {
        const el = content.querySelector(`#toggle-${t.id}`);
        let state = JSON.parse(localStorage.getItem(t.id)) ?? t.defVal;
        el.classList.toggle("active", state);
        el.onclick = () => { state = !state; el.classList.toggle("active", state); };
      });

      sliders.forEach(s => {
        const el = content.querySelector(`#slider-${s.id}`);
        const valEl = content.querySelector(`#val-${s.id}`);
        el.oninput = () => {
          valEl.textContent = `${el.value}${s.suffix || ""}`;
          document.documentElement.style.setProperty(`--${s.id}`, `${el.value}${s.suffix || ""}`);
        };
      });

      content.querySelector("#nyxtails-color-input").value = localStorage.getItem("CustomColor") || "#ffc0ea";

      content.querySelector("#nyxtails-reset").onclick = () => {
        localStorage.removeItem("nyxtails:startupBg");
        localStorage.removeItem("CustomColor");
        toggleInfo.forEach(t => localStorage.removeItem(t.id));
        sliders.forEach(s => localStorage.removeItem(`${s.id}Amount`));
        window.location.reload();
      };

      content.querySelector("#nyxtails-save").onclick = async () => {
        if (currentMode === 'url') startImage = urlInput.value || defImage;
        else if (pendingData) startImage = pendingData;

        localStorage.setItem("nyxtails:startupBg", startImage);
        localStorage.setItem("CustomColor", content.querySelector("#nyxtails-color-input").value);

        toggleInfo.forEach(t => {
          const state = content.querySelector(`#toggle-${t.id}`).classList.contains("active");
          localStorage.setItem(t.id, state);
        });

        sliders.forEach(s => {
          localStorage.setItem(`${s.id}Amount`, content.querySelector(`#slider-${s.id}`).value);
        });

        loadSliders();
        loadToggles();
        await applyBackground();
        Spicetify.showNotification("✅ Nyxtails settings saved!");
      };

      Spicetify.PopupModal.display({ title: "🎨 Nyxtails Customization", content });
    });
  }

  createTopbarButton();

  // Vinyl Spin Control While Playing Music
  function updateVinylSpin() {
    const isPlaying = Spicetify.Player.isPlaying();
    const widgetArt = document.querySelector(".main-nowPlayingWidget-coverArt");
    const sidebarArt = document.querySelector(".main-nowPlayingView-coverArt");

    if (widgetArt) widgetArt.classList.toggle("nyxtails-spinning", isPlaying);
    if (sidebarArt) sidebarArt.classList.toggle("nyxtails-spinning", isPlaying);
  }
  // Listen to Music Events
  Spicetify.Player.addEventListener("onplaypause", updateVinylSpin);
  Spicetify.Player.addEventListener("songchange", () => setTimeout(updateVinylSpin, 200));

  // Check vinyls if DOM updates on page change
  const observer = new MutationObserver(updateVinylSpin);
  observer.observe(document.body, { childList: true, subtree: true });

  (function createMainViewToggle() {
    const STORAGE_KEY = "nyxtails:mainViewHidden";
    let isHidden = JSON.parse(localStorage.getItem(STORAGE_KEY)) || false;
    const PLUS_ICON = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2H9v5a1 1 0 1 1-2 0V9H2a1 1 0 1 1 0-2h5V2a1 1 0 0 1 1-1z"/></svg>';
    const MINUS_ICON = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 7a1 1 0 0 1 1-1h10a1 1 0 1 1 0 2H3a1 1 0 1 1-2 0V9H2a1 1 0 1 1 0-2h5V2a1 1 0 0 1 1-1z"/></svg>';

    function applyState() {
      const mainView = document.querySelector(".Root__main-view");
      if (!mainView) return;
      mainView.style.opacity = isHidden ? "0" : "1";
      mainView.style.pointerEvents = isHidden ? "none" : "auto";
    }

    waitForElement([".Root__main-view"], ([mainView]) => { applyState(); });

    const toggleBtn = new Spicetify.Topbar.Button(
      "Background Mode",
      isHidden ? MINUS_ICON : PLUS_ICON,
      () => {
        isHidden = !isHidden;
        localStorage.setItem(STORAGE_KEY, isHidden);
        applyState();
        toggleBtn.element.querySelector("svg").outerHTML = isHidden ? MINUS_ICON : PLUS_ICON;
      }
    );
    toggleBtn.element.classList.add("nyxtails-bg-toggle-btn");
  })();

})();