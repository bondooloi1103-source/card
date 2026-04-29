import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { CATEGORIES } from '@/lib/figuresData';
import StoryPlayer from '@/components/StoryPlayer';
import { takeLeadership, releaseLeadership } from '@/lib/cardVideoLeader';
import { useLang } from '@/lib/i18n';
import ARLaunchButton from '@/components/ARLaunchButton';

// Generate a canvas texture for the card face
function makeCardCanvas(figure, side, cat) {
  const W = 512, H = 768;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const color = cat?.color || '#8B1A1A';

  if (side === 'front') {
    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#0e1117');
    grad.addColorStop(1, '#1a1f2e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Border
    ctx.strokeStyle = '#D4A843';
    ctx.lineWidth = 8;
    ctx.strokeRect(16, 16, W - 32, H - 32);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(28, 28, W - 56, H - 56);

    // Top card label
    ctx.fillStyle = '#D4A843';
    ctx.font = 'bold 26px serif';
    ctx.textAlign = 'center';
    ctx.fillText(figure.card || '', W / 2, 68);

    // Portrait area
    const portraitY = 90;
    const portraitH = 340;
    ctx.fillStyle = color + '33';
    ctx.fillRect(40, portraitY, W - 80, portraitH);

    // If image loaded — will be applied later
    ctx.fillStyle = '#D4A843';
    ctx.font = '120px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(figure.ico || '👑', W / 2, portraitY + portraitH / 2);

    // Divider
    ctx.strokeStyle = '#D4A843';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, portraitY + portraitH + 16);
    ctx.lineTo(W - 40, portraitY + portraitH + 16);
    ctx.stroke();

    // Name
    ctx.fillStyle = '#EDE8D5';
    ctx.font = 'bold 32px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(figure.name || '', W / 2, portraitY + portraitH + 60);

    // Years
    ctx.fillStyle = '#D4A843';
    ctx.font = '22px sans-serif';
    ctx.fillText(figure.yrs || '', W / 2, portraitY + portraitH + 94);

    // Role (wrap)
    ctx.fillStyle = '#aaa';
    ctx.font = '20px sans-serif';
    const role = figure.role || '';
    if (role.length > 28) {
      ctx.fillText(role.slice(0, 28), W / 2, portraitY + portraitH + 124);
      ctx.fillText(role.slice(28), W / 2, portraitY + portraitH + 150);
    } else {
      ctx.fillText(role, W / 2, portraitY + portraitH + 124);
    }

    // Category badge
    ctx.fillStyle = color;
    const badgeY = H - 80;
    ctx.beginPath();
    ctx.roundRect(W / 2 - 80, badgeY - 22, 160, 36, 18);
    ctx.fill();
    ctx.fillStyle = 'white';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText((cat?.ico || '') + ' ' + (cat?.label || ''), W / 2, badgeY + 2);

  } else {
    // BACK SIDE
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#1a0a0a');
    grad.addColorStop(1, '#0a0e1a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  return canvas;
}

export default function Card3D({ figure, onClick, index = 0 }) {
  const wrapperRef = useRef(null);
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cardRef = useRef(null);
  const isDraggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const rotationRef = useRef({ x: 0.1, y: 0 });
  const targetRotRef = useRef({ x: 0.1, y: 0 });
  const isFlippedRef = useRef(false);
  const animFrameRef = useRef(null);
  const videoElRef = useRef(null);
  const videoTexRef = useRef(null);
  const overlayVisibleRef = useRef(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [hint, setHint] = useState(true);
  const [isRenderable, setIsRenderable] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [isMostlyInView, setIsMostlyInView] = useState(false);
  const [videoState, setVideoState] = useState(() => figure.back_video_url ? 'ready' : 'no_video');
  const [muted, setMuted] = useState(false);
  const [activeCueText, setActiveCueText] = useState('');
  const [overlayVisible, setOverlayVisible] = useState(false);
  const cat = CATEGORIES[figure.cat];
  const { t } = useLang();

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      setIsInView(entry.isIntersecting);
      setIsMostlyInView(entry.intersectionRatio >= 0.3);
    }, { rootMargin: '100px', threshold: [0, 0.3] });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Initialize videoState based on figure.back_video_url
  useEffect(() => {
    setVideoState(figure.back_video_url ? 'ready' : 'no_video');
  }, [figure.back_video_url]);

  useEffect(() => {
    if (isInView) {
      // Add staggered delay to avoid freezing UI
      const timer = setTimeout(() => {
        setIsRenderable(true);
      }, (index % 10) * 50); // staggered but bounded delay
      return () => clearTimeout(timer);
    } else {
      setIsRenderable(false);
    }
  }, [isInView, index]);

  useEffect(() => {
    if (!isRenderable) return;
    const container = mountRef.current;
    if (!container) return;

    const W = container.clientWidth;
    const H = container.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    camera.position.z = 3.2;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(2, 3, 4);
    scene.add(dirLight);
    const rimLight = new THREE.DirectionalLight(0xD4A843, 0.4);
    rimLight.position.set(-3, -1, -2);
    scene.add(rimLight);

    // Card geometry (poker card ratio)
    const CARD_W = 1.4, CARD_H = 2.0, CARD_DEPTH = 0.03;
    const geo = new THREE.BoxGeometry(CARD_W, CARD_H, CARD_DEPTH, 1, 1, 1);

    // Front texture from canvas
    const frontCanvas = makeCardCanvas(figure, 'front', cat);
    const frontTex = new THREE.CanvasTexture(frontCanvas);
    frontTex.colorSpace = THREE.SRGBColorSpace;

    // If figure has an image, draw it onto front canvas then update texture
    if (figure.front_img) {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const ctx = frontCanvas.getContext('2d');
        const portraitY = 90, portraitH = 340;
        ctx.drawImage(img, 40, portraitY, 432, portraitH);
        frontTex.needsUpdate = true;
      };
      img.src = figure.front_img;
    }

    const backCanvas = makeCardCanvas(figure, 'back', cat);
    const backTex = new THREE.CanvasTexture(backCanvas);
    backTex.colorSpace = THREE.SRGBColorSpace;

    // Edge / side material
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.5 });
    // Gold border edge
    const goldEdge = new THREE.MeshStandardMaterial({ color: 0xD4A843, roughness: 0.3, metalness: 0.6 });

    const materials = [
      goldEdge,           // +X
      goldEdge,           // -X
      goldEdge,           // +Y
      goldEdge,           // -Y
      new THREE.MeshStandardMaterial({ map: frontTex, roughness: 0.2 }), // front
      new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.2 }),  // back
    ];

    if (figure.back_img) {
      new THREE.TextureLoader().load(figure.back_img, (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        materials[5].map = texture;
        materials[5].needsUpdate = true;
      }, undefined, (err) => {
        console.warn('Could not load custom back_img:', err);
      });
    }

    const card = new THREE.Mesh(geo, materials);
    scene.add(card);
    cardRef.current = card;

    // Particle shimmer
    const partGeo = new THREE.BufferGeometry();
    const count = 40;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 3;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 4;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 1.5;
    }
    partGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const partMat = new THREE.PointsMaterial({ color: 0xD4A843, size: 0.015, transparent: true, opacity: 0.5 });
    const particles = new THREE.Points(partGeo, partMat);
    scene.add(particles);

    // Animate
    let t = 0;
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      t += 0.01;

      // Lerp rotation
      rotationRef.current.x += (targetRotRef.current.x - rotationRef.current.x) * 0.08;
      rotationRef.current.y += (targetRotRef.current.y - rotationRef.current.y) * 0.08;

      card.rotation.x = rotationRef.current.x;
      card.rotation.y = rotationRef.current.y;

      // Idle float when not dragging
      if (!isDraggingRef.current) {
        card.position.y = Math.sin(t * 0.8) * 0.04;
      }

      particles.rotation.y = t * 0.1;

      // Overlay visibility: show overlay when back face is centered and not dragging.
      const showingBack =
        Math.abs(((card.rotation.y % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI) < 0.20;
      const nextVisible = showingBack && !isDraggingRef.current;
      if (nextVisible !== overlayVisibleRef.current) {
        overlayVisibleRef.current = nextVisible;
        setOverlayVisible(nextVisible);
      }

      renderer.render(scene, camera);
    };
    animate();

    // Resize
    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(animFrameRef.current);
      renderer.dispose();
      renderer.forceContextLoss();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      const videoEl = videoElRef.current;
      if (videoEl) {
        videoEl.pause();
        videoEl.removeAttribute('src');
        try { videoEl.load(); } catch { /* ignore */ }
        if (videoEl.parentNode) videoEl.parentNode.removeChild(videoEl);
        videoElRef.current = null;
      }
      if (videoTexRef.current) {
        videoTexRef.current.dispose();
        videoTexRef.current = null;
      }
      releaseLeadership(figure.fig_id);
    };
  }, [figure, isRenderable]);

  // Tear down video when card scrolls mostly out of view (< 30% visible)
  useEffect(() => {
    if (isMostlyInView) return;
    const videoEl = videoElRef.current;
    if (videoEl) {
      videoEl.pause();
      videoEl.removeAttribute('src');
      try { videoEl.load(); } catch { /* ignore */ }
      if (videoEl.parentNode) videoEl.parentNode.removeChild(videoEl);
      videoElRef.current = null;
    }
    if (videoTexRef.current) {
      videoTexRef.current.dispose();
      videoTexRef.current = null;
    }
    releaseLeadership(figure.fig_id);
    setVideoState(figure.back_video_url ? 'ready' : 'no_video');
  }, [isMostlyInView, figure.back_video_url, figure.fig_id]);

  // Mouse drag handlers
  const onMouseDown = (e) => {
    isDraggingRef.current = true;
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
    setHint(false);
  };
  const onMouseMove = (e) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - lastMouseRef.current.x;
    const dy = e.clientY - lastMouseRef.current.y;
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
    targetRotRef.current.y += dx * 0.012;
    targetRotRef.current.x += dy * 0.012;
    targetRotRef.current.x = Math.max(-1.2, Math.min(1.2, targetRotRef.current.x));
  };
  const onMouseUp = () => { isDraggingRef.current = false; };

  // Touch drag handlers
  const onTouchStart = (e) => {
    isDraggingRef.current = true;
    lastMouseRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    setHint(false);
  };
  const onTouchMove = (e) => {
    if (!isDraggingRef.current) return;
    const dx = e.touches[0].clientX - lastMouseRef.current.x;
    const dy = e.touches[0].clientY - lastMouseRef.current.y;
    lastMouseRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    targetRotRef.current.y += dx * 0.012;
    targetRotRef.current.x += dy * 0.012;
    targetRotRef.current.x = Math.max(-1.2, Math.min(1.2, targetRotRef.current.x));
    e.preventDefault();
  };
  const onTouchEnd = () => { isDraggingRef.current = false; };

  const playVideo = () => {
    if (!figure.back_video_url) return;
    let videoEl = videoElRef.current;
    if (!videoEl) {
      videoEl = document.createElement('video');
      videoEl.setAttribute('data-card-video', '');
      videoEl.setAttribute('crossorigin', 'anonymous');
      videoEl.setAttribute('playsinline', '');
      videoEl.preload = 'metadata';
      videoEl.style.display = 'none';
      videoEl.src = figure.back_video_url;
      if (figure.back_captions_url) {
        const track = document.createElement('track');
        track.kind = 'captions';
        track.src = figure.back_captions_url;
        track.default = true;
        videoEl.appendChild(track);
      }
      document.body.appendChild(videoEl);
      videoElRef.current = videoEl;

      videoEl.addEventListener('ended', () => {
        setVideoState('ended');
        releaseLeadership(figure.fig_id);
      });

      if (videoEl.textTracks && videoEl.textTracks[0]) {
        videoEl.textTracks[0].mode = 'hidden';
        videoEl.textTracks[0].oncuechange = () => {
          const cues = videoEl.textTracks[0].activeCues;
          const text = cues && cues.length
            ? Array.from(cues).map((c) => c.text).join(' ')
            : '';
          setActiveCueText(text);
        };
      }

      const tex = new THREE.VideoTexture(videoEl);
      tex.colorSpace = THREE.SRGBColorSpace;
      videoTexRef.current = tex;
      const card = cardRef.current;
      if (card && card.material[5]) {
        card.material[5].map = tex;
        card.material[5].needsUpdate = true;
      }
    } else {
      videoEl.currentTime = 0;
    }
    takeLeadership(figure.fig_id, () => {
      videoEl.pause();
      setVideoState('ended');
    });
    videoEl.muted = muted;
    videoEl.play().catch(() => { /* user gesture missing or codec issue */ });
    setVideoState('playing');
  };

  const flipCard = () => {
    const flipped = !isFlippedRef.current;
    isFlippedRef.current = flipped;
    setIsFlipped(flipped);
    targetRotRef.current.y = flipped ? Math.PI : 0;
    targetRotRef.current.x = 0.1;
    setHint(false);
  };

  const resetView = () => {
    isFlippedRef.current = false;
    setIsFlipped(false);
    targetRotRef.current = { x: 0.1, y: 0 };
  };

  return (
    <div className="relative flex flex-col items-center select-none" ref={wrapperRef}>
      <div className="absolute top-2 right-2 z-10">
        <ARLaunchButton figId={figure.fig_id} variant="compact" />
      </div>
      {/* 3D Canvas */}
      {!isRenderable ? (
        <div
          className="w-full flex items-center justify-center bg-muted/10 animate-pulse"
          style={{ height: '340px' }}
        >
          <div className="w-8 h-8 rounded-full border-4 border-t-gold border-border animate-spin"></div>
        </div>
      ) : (
        <div
          ref={mountRef}
          className="w-full cursor-grab active:cursor-grabbing"
          style={{ height: '340px', touchAction: 'none' }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        />
      )}

      {/* Video overlay */}
      {figure.back_video_url && overlayVisible && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center" style={{ height: '340px', top: 0 }}>
          {videoState === 'ready' && (
            <button
              type="button"
              data-testid="card-video-play"
              onClick={playVideo}
              className="pointer-events-auto w-16 h-16 rounded-full bg-black/60 border-2 border-gold flex items-center justify-center hover:bg-black/80 transition-all"
              aria-label={t('card.video.play')}
            >
              <span className="text-3xl text-gold">▶</span>
            </button>
          )}
          {videoState === 'ended' && (
            <button
              type="button"
              data-testid="card-video-replay"
              onClick={playVideo}
              className="pointer-events-auto w-16 h-16 rounded-full bg-black/60 border-2 border-gold flex items-center justify-center hover:bg-black/80 transition-all"
              aria-label={t('card.video.replay')}
            >
              <span className="text-3xl text-gold">↻</span>
            </button>
          )}
          {videoState === 'playing' && (
            <>
              <button
                type="button"
                data-testid="card-video-mute"
                onClick={() => {
                  const v = videoElRef.current;
                  if (!v) return;
                  v.muted = !v.muted;
                  setMuted(v.muted);
                }}
                className="pointer-events-auto absolute bottom-2 right-2 w-9 h-9 rounded-full bg-black/60 border border-gold flex items-center justify-center hover:bg-black/80"
                aria-label={muted ? t('card.video.unmute') : t('card.video.mute')}
              >
                <span className="text-sm text-gold">{muted ? '🔇' : '🔊'}</span>
              </button>
              {muted && activeCueText && (
                <div className="absolute bottom-12 left-2 right-2 px-2 py-1 bg-black/70 text-white text-xs font-body text-center rounded">
                  {activeCueText}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-2 mt-2 pb-1 flex-wrap justify-center">
        <button
          onClick={flipCard}
          className="px-3 py-1.5 bg-card border border-border rounded-full text-xs font-body text-muted-foreground hover:text-foreground hover:border-gold transition-all"
        >
          {isFlipped ? '◀ Нүүр' : 'Ар ▶'}
        </button>
        <button
          onClick={resetView}
          className="px-3 py-1.5 bg-card border border-border rounded-full text-xs font-body text-muted-foreground hover:text-foreground hover:border-gold transition-all"
        >
          ↺ Дахин
        </button>
        <StoryPlayer figure={figure} variant="button" />
        <button
          onClick={() => onClick(figure)}
          className="px-3 py-1.5 bg-crimson/90 hover:bg-crimson text-white rounded-full text-xs font-body transition-all"
        >
          Дэлгэрэнгүй
        </button>
      </div>

      {/* Drag hint */}
      {hint && (
        <p className="text-[10px] text-muted-foreground font-body mt-1 animate-pulse">
          ⟵ хулганаар эргүүлнэ үү ⟶
        </p>
      )}
    </div>
  );
}