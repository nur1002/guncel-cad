import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { useStore } from "../engine/core/store";
import { roomAreaM2 } from "../engine/drawing/render2d";
import { dist } from "../engine/drawing/geometry";
import { getMaterial } from "../data/materials";
import type { Corner, FloorVariantData, PlacedComponent, Wall, WallPlacement } from "../data/model";

const toThree = (p: { x: number; y: number }) => ({ x: p.x, z: -p.y });

const EYE_HEIGHT_CM = 165;
const MOVE_SPEED_CM_S = 220;
const DEFAULT_WALL_HEIGHT = 270;

function isWallPlaced(c: PlacedComponent): c is PlacedComponent & { konum: WallPlacement } {
  return c.konum.kind === "duvar";
}

interface CollisionWall {
  a: Corner;
  b: Corner;
  thickness: number;
  doorIntervals: [number, number][];
}

export default function View3D() {
  const mountRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const labelElsRef = useRef<Map<string, HTMLDivElement>>(new Map());

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const orbitRef = useRef<OrbitControls | null>(null);
  const pointerLockRef = useRef<PointerLockControls | null>(null);
  const buildingGroupRef = useRef<THREE.Group | null>(null);
  const wallsForCollisionRef = useRef<CollisionWall[]>([]);
  const playerPosRef = useRef({ x: 0, y: 0 });
  const keysRef = useRef<Record<string, boolean>>({});
  const activeFloorBaseZRef = useRef(0);

  const showCeiling = useStore((s) => s.showCeiling);
  const toggleCeiling = useStore((s) => s.toggleCeiling);
  const wallMaterials = useStore((s) => s.wallMaterials);
  const floorMaterials = useStore((s) => s.floorMaterials);
  const pages = useStore((s) => s.pages);
  const activePageId = useStore((s) => s.activePageId);
  const setActivePageId = useStore((s) => s.setActivePageId);
  const togglePageVisible = useStore((s) => s.togglePageVisible);
  const parsel = useStore((s) => s.parsel);
  const currentPage = pages.find((p) => p.id === activePageId) || pages[0];
  const variant = currentPage.drawing;
  const pushToast = useStore((s) => s.pushToast);

  const [sayfaBilgileriOpen, setSayfaBilgileriOpen] = useState(true);

  // 3D Portal State
  // Gerçek nesne seçimi (raycasting) — "Seçili Eleman" kartı artık statik değil.
  const [selectedElement, setSelectedElement] = useState<{ pageId: string; roomId: string } | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  // Basitleştirilmiş kesit (§ "tam gelişigüzel düzlem yerine tek yatay kesme"):
  // açıkken belirtilen dünya Y yüksekliğinin ÜSTÜ kesilir (çatı/tavan kaldırılmış gibi).
  const [sectionCutOn, setSectionCutOn] = useState(false);
  const [sectionCutHeightCm, setSectionCutHeightCm] = useState(300);
  const clippingPlaneRef = useRef(new THREE.Plane(new THREE.Vector3(0, -1, 0), 300));
  // animate() döngüsü store dışı yerel state'i doğrudan okuyamaz (kapanma/closure
  // sorunu) — bu yüzden en güncel değer bir ref'te aynalanır (fpsMode'un
  // useStore.getState() ile her frame taze okunması gibi aynı mantık).
  const sectionCutOnRef = useRef(false);
  const sectionCutHeightRef = useRef(300);
  useEffect(() => {
    sectionCutOnRef.current = sectionCutOn;
    sectionCutHeightRef.current = sectionCutHeightCm;
  }, [sectionCutOn, sectionCutHeightCm]);

  // --- Three.js Scene Setup ---
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#CBD5E1");
    sceneRef.current = scene;

    // --- Ground CAD / GIS Pixelated Grid Map ---
    const gridSize = 30000;
    const gridDivisions = 300; // 100cm (1m) grid squares
    const gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0x475569, 0x94a3b8);
    gridHelper.position.y = -0.5;
    scene.add(gridHelper);

    // Pixelated Map Tile texture ground plane
    const groundCanvas = document.createElement("canvas");
    groundCanvas.width = 64;
    groundCanvas.height = 64;
    const gctx = groundCanvas.getContext("2d");
    if (gctx) {
      gctx.fillStyle = "#cbd5e1";
      gctx.fillRect(0, 0, 64, 64);
      // Checkered pixel tiles
      gctx.fillStyle = "#b0c4de";
      gctx.fillRect(0, 0, 32, 32);
      gctx.fillRect(32, 32, 32, 32);
      // Pixelated grid lines
      gctx.strokeStyle = "#64748b";
      gctx.lineWidth = 1;
      gctx.strokeRect(0, 0, 64, 64);
    }
    const groundTexture = new THREE.CanvasTexture(groundCanvas);
    groundTexture.wrapS = THREE.RepeatWrapping;
    groundTexture.wrapT = THREE.RepeatWrapping;
    groundTexture.repeat.set(300, 300);
    groundTexture.magFilter = THREE.NearestFilter;
    groundTexture.minFilter = THREE.NearestFilter;

    const groundGeo = new THREE.PlaneGeometry(gridSize, gridSize);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = new THREE.MeshStandardMaterial({
      map: groundTexture,
      roughness: 0.8,
      metalness: 0.1,
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.position.y = -1;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    const camera = new THREE.PerspectiveCamera(55, mount.clientWidth / mount.clientHeight, 1, 50000);
    camera.position.set(900, 950, 900);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x666666, 1.2);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(600, 1200, 400);
    dir.castShadow = true;
    scene.add(dir);

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.target.set(0, 0, 0);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.05;
    orbit.update();
    orbitRef.current = orbit;

    const pointerLock = new PointerLockControls(camera, renderer.domElement);
    pointerLockRef.current = pointerLock;

    let raf = 0;
    let lastT = performance.now();
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;

      if (useStore.getState().fpsMode) {
        stepFpsMovement(dt);
      } else {
        orbit.update();
      }
      updateLabelOverlay();

      const plane = clippingPlaneRef.current;
      plane.constant = sectionCutHeightRef.current;
      renderer.clippingPlanes = sectionCutOnRef.current ? [plane] : [];

      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    const onKeyDown = (e: KeyboardEvent) => (keysRef.current[e.code] = true);
    const onKeyUp = (e: KeyboardEvent) => (keysRef.current[e.code] = false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // Gerçek nesne seçimi: tıklanan ekran noktasından ışın gönderip hangi
    // odanın zemin mesh'ine değdiğini bulur (§ "sahte statik kart değil").
    let downPos: { x: number; y: number } | null = null;
    const onPointerDownCanvas = (e: PointerEvent) => {
      downPos = { x: e.clientX, y: e.clientY };
    };
    const onPointerUpCanvas = (e: PointerEvent) => {
      if (!downPos || Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 4) return; // sürükleme/orbit ile karışmasın
      const buildingGroup = buildingGroupRef.current;
      if (!buildingGroup) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycasterRef.current.setFromCamera(ndc, camera);
      const hits = raycasterRef.current.intersectObjects(buildingGroup.children, false);
      const roomHit = hits.find((h) => h.object.userData?.entityType === "room");
      if (roomHit) {
        setSelectedElement({ pageId: roomHit.object.userData.pageId, roomId: roomHit.object.userData.roomId });
      } else {
        setSelectedElement(null);
      }
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDownCanvas);
    renderer.domElement.addEventListener("pointerup", onPointerUpCanvas);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      renderer.domElement.removeEventListener("pointerdown", onPointerDownCanvas);
      renderer.domElement.removeEventListener("pointerup", onPointerUpCanvas);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stepFpsMovement(dt: number) {
    const camera = cameraRef.current;
    const pointerLock = pointerLockRef.current;
    if (!camera || !pointerLock) return;
    const keys = keysRef.current;
    const speed = MOVE_SPEED_CM_S * dt;

    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).negate();

    let moveX = 0;
    let moveZ = 0;
    if (keys["KeyW"] || keys["ArrowUp"]) {
      moveX += forward.x;
      moveZ += forward.z;
    }
    if (keys["KeyS"] || keys["ArrowDown"]) {
      moveX -= forward.x;
      moveZ -= forward.z;
    }
    if (keys["KeyD"] || keys["ArrowRight"]) {
      moveX += right.x;
      moveZ += right.z;
    }
    if (keys["KeyA"] || keys["ArrowLeft"]) {
      moveX -= right.x;
      moveZ -= right.z;
    }
    const len = Math.hypot(moveX, moveZ);
    if (len < 1e-6) return;
    moveX = (moveX / len) * speed;
    moveZ = (moveZ / len) * speed;

    const dWorldX = moveX;
    const dWorldY = -moveZ;

    const pos = playerPosRef.current;
    const candidate = { x: pos.x + dWorldX, y: pos.y + dWorldY };
    playerPosRef.current = candidate;
    const t3 = toThree(candidate);
    camera.position.set(t3.x, activeFloorBaseZRef.current + EYE_HEIGHT_CM, t3.z);
  }

  function updateLabelOverlay() {
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    if (!camera || !renderer) return;
    const size = renderer.getSize(new THREE.Vector2());
    labelElsRef.current.forEach((el) => {
      const worldPos = (el as unknown as { _worldPos?: THREE.Vector3 })._worldPos;
      if (!worldPos) return;
      const proj = worldPos.clone().project(camera);
      const behind = proj.z > 1;
      const x = (proj.x * 0.5 + 0.5) * size.x;
      const y = (-proj.y * 0.5 + 0.5) * size.y;
      el.style.display = behind ? "none" : "block";
      el.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
    });
  }

  // --- Geometry Construction ---
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (buildingGroupRef.current) {
      scene.remove(buildingGroupRef.current);
      disposeGroup(buildingGroupRef.current);
    }
    const overlay = overlayRef.current;
    labelElsRef.current.forEach((el) => el.remove());
    labelElsRef.current.clear();

    const group = new THREE.Group();
    let activeCollision: CollisionWall[] = [];

    // Kat ayrımı / tavan mantığı: bina her zaman katman katman gerçekçi görünmeli —
    // alt katların tavanı HER ZAMAN kapalı (üstündeki kata bakınca içini görmemeli,
    // gerçek bir kat döşemesi/ayrım çizgisi olmalı). Sadece en üstteki İÇİ DOLU
    // (en az bir oda/duvar çizilmiş) görünür kat tavansız kalır ki içine bakılabilsin;
    // henüz boş olan (kullanıcının daha çizmediği) üstteki placeholder sayfalar bu
    // hesaba katılmaz — yoksa altında dolu bir kat varken o hep kapalı görünürdü.
    // Kullanıcı yeni bir kata çizim yapmaya başladığında eski en üst kat otomatik
    // kapanır, yeni eklenen kat açık olur.
    const visiblePages = pages.filter((p) => p.visible);
    const nonEmptyVisiblePages = visiblePages.filter(
      (p) => Object.keys(p.drawing.rooms).length > 0 || Object.keys(p.drawing.walls).length > 0
    );
    const topmostSource = nonEmptyVisiblePages.length > 0 ? nonEmptyVisiblePages : visiblePages;
    const topmostKot = topmostSource.length > 0 ? Math.max(...topmostSource.map((p) => p.kotElevationCm)) : null;

    for (const page of pages) {
      if (!page.visible) continue;
      const isActive = page.id === activePageId;
      const isTopmost = page.kotElevationCm === topmostKot;
      const pageShowCeiling = isTopmost ? showCeiling : true;
      const baseZ = page.kotElevationCm;
      const { collisionWalls } = buildFloorMeshes(
        group,
        page.drawing,
        baseZ,
        wallMaterials,
        floorMaterials,
        pageShowCeiling,
        overlay,
        labelElsRef.current,
        isActive,
        page.heightCm,
        page.id
      );
      if (isActive) {
        activeCollision = collisionWalls;
        activeFloorBaseZRef.current = baseZ;
      }
    }
    wallsForCollisionRef.current = activeCollision;

    scene.add(group);
    buildingGroupRef.current = group;
  }, [variant, pages, activePageId, wallMaterials, floorMaterials, showCeiling]);

  // Zoom controls
  const handleZoom = (delta: number) => {
    if (!cameraRef.current || !orbitRef.current) return;
    const camera = cameraRef.current;
    const target = orbitRef.current.target;
    const dir = new THREE.Vector3().subVectors(camera.position, target);
    dir.multiplyScalar(delta);
    camera.position.addVectors(target, dir);
  };

  const resetCamera = () => {
    if (!cameraRef.current || !orbitRef.current) return;
    cameraRef.current.position.set(900, 950, 900);
    orbitRef.current.target.set(0, 0, 0);
    orbitRef.current.update();
  };

  // İsimli kamera görünümleri (§ "GÖRÜNÜMLER" sekme şeridi):
  // Parsel ve bina boyutuna oranla ideal orta yakınlıkta kamera mesafe seti.
  const buildingSpan = Math.max(1200, Math.min(parsel.widthCm * 0.32, parsel.lengthCm * 0.32, 2200));
  const heightCenter = 150; // 3D binanın dikey merkez kotu (~1.5m)
  const CAMERA_PRESETS: Record<string, { pos: [number, number, number]; target: [number, number, number] }> = {
    "3D İzometrik": { pos: [buildingSpan * 0.85, buildingSpan * 0.8, buildingSpan * 0.85], target: [0, heightCenter, 0] },
    "3D Perspektif": { pos: [buildingSpan * 0.65, buildingSpan * 0.45, buildingSpan * 1.0], target: [0, heightCenter, 0] },
    "Üstten": { pos: [0, buildingSpan * 1.4, 0.01], target: [0, 0, 0] },
    "Önden": { pos: [0, heightCenter + 50, buildingSpan * 0.95], target: [0, heightCenter, 0] },
    "Arka Görünüm": { pos: [0, heightCenter + 50, -buildingSpan * 0.95], target: [0, heightCenter, 0] },
    "Sol Görünüm": { pos: [-buildingSpan * 0.95, heightCenter + 50, 0], target: [0, heightCenter, 0] },
    "Sağ Görünüm": { pos: [buildingSpan * 0.95, heightCenter + 50, 0], target: [0, heightCenter, 0] },
  };
  const [activeView, setActiveView] = useState("3D İzometrik");
  const applyCameraPreset = (name: string) => {
    const preset = CAMERA_PRESETS[name];
    if (!preset || !cameraRef.current || !orbitRef.current) return;
    cameraRef.current.position.set(...preset.pos);
    orbitRef.current.target.set(...preset.target);
    orbitRef.current.update();
    setActiveView(name);
  };

  return (
    <div className="portal3d-container">
      {/* Sub-Header Bar (Parsel, Modeli Güncelle) */}
      <div className="portal3d-subheader">
        <div className="subheader-left">
          <div className="select-pill-wrapper">
            <span>Parsel: {parsel ? `${parsel.areaM2} m²` : "5000 m²"}</span>
          </div>
          <button className="btn-refresh-model" onClick={() => pushToast("Model güncellendi.", "basari")}>
            🔄 Modeli Güncelle
          </button>
        </div>
      </div>

      {/* GÖRÜNÜMLER: isimli sabit kamera açıları — gerçekten camera.position/target değiştirir */}
      <div className="pro-pagetabs">
        {Object.keys(CAMERA_PRESETS).map((name) => (
          <div
            key={name}
            className={`pro-pagetab ${activeView === name ? "pro-pagetab--active" : ""}`}
            onClick={() => applyCameraPreset(name)}
          >
            {name}
          </div>
        ))}
      </div>

      {/* Main 3D Workspace */}
      <div className="portal3d-body">
        {/* Left Sidebar (Bina Bilgileri, Sayfa Bilgileri, Seçili Eleman) */}
        <aside className="portal3d-left-sidebar">
          {/* Bina Bilgileri */}
          <div className="portal3d-info-card">
            <div className="info-card-header">
              <h4>Bina Bilgileri</h4>
            </div>
            <div className="info-card-body">
              <div className="info-row">
                <span>Ada: <strong>124</strong></span>
                <span>Parsel: <strong>5</strong></span>
              </div>
              <div className="info-row">
                <span>Kat Sayısı: <strong>3</strong></span>
              </div>
              <div className="info-row">
                <span>Toplam Alan: <strong>480 m²</strong></span>
              </div>
            </div>
          </div>

          {/* Sayfa Bilgileri (Açılır-Kapanır Kat Görünürlük Paneli) */}
          <div className="portal3d-info-card">
            <div
              className="info-card-header"
              style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
              onClick={() => setSayfaBilgileriOpen((v) => !v)}
            >
              <h4>Sayfa Bilgileri (Katlar)</h4>
              <span style={{ fontSize: "12px", color: "#94a3b8" }}>{sayfaBilgileriOpen ? "▲" : "▼"}</span>
            </div>
            {sayfaBilgileriOpen && (
              <div className="info-card-body">
                {pages.map((p) => (
                  <div
                    key={p.id}
                    className={`floor-radio-item ${p.id === activePageId ? "floor-radio-item--active" : ""}`}
                    onClick={() => setActivePageId(p.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "8px 10px",
                      borderRadius: "6px",
                      background: p.visible
                        ? p.id === activePageId
                          ? "#0284c7"
                          : "#1e293b"
                        : "#090f1d",
                      border: `1px solid ${
                        p.visible
                          ? p.id === activePageId
                            ? "#38bdf8"
                            : "#334155"
                          : "#1e293b"
                      }`,
                      opacity: p.visible ? 1 : 0.45,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {/* Yuvarlak Açılır/Kapanır (Tik / Boşluk) Butonu */}
                    <div
                      title={p.visible ? "Katı 3B'de Gizle" : "Katı 3B'de Göster"}
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePageVisible(p.id);
                      }}
                      style={{
                        width: "18px",
                        height: "18px",
                        borderRadius: "50%",
                        border: `2px solid ${p.visible ? "#38bdf8" : "#64748b"}`,
                        background: p.visible ? "#0284c7" : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#ffffff",
                        fontSize: "11px",
                        fontWeight: "bold",
                        flexShrink: 0,
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {p.visible ? "✓" : ""}
                    </div>

                    {/* Kat Adı ve Kot Bilgisi */}
                    <span
                      style={{
                        fontSize: "12px",
                        color: p.visible ? "#f8fafc" : "#64748b",
                        fontWeight: p.id === activePageId ? "600" : "400",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        flex: 1,
                      }}
                      title={`${p.name} (Kot: ${(p.kotElevationCm / 100).toFixed(2)}m)`}
                    >
                      {p.name} (Kot: {(p.kotElevationCm / 100).toFixed(2)}m)
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Seçili Eleman */}
          <div className="portal3d-info-card">
            <div className="info-card-header">
              <h4>Seçili Eleman</h4>
            </div>
            <div className="info-card-body">
              {(() => {
                if (!selectedElement) {
                  return <div className="info-row" style={{ color: "#94a3b8" }}>Bir mekâna tıklayın.</div>;
                }
                const selPage = pages.find((p) => p.id === selectedElement.pageId);
                const room = selPage?.drawing.rooms[selectedElement.roomId];
                if (!selPage || !room) {
                  return <div className="info-row" style={{ color: "#94a3b8" }}>Mekân bulunamadı.</div>;
                }
                const area = room.manuelAlanM2 ?? roomAreaM2(room, selPage.drawing.corners);
                const floorMat = getMaterial(floorMaterials, room.zeminMalzemesi);
                return (
                  <>
                    <div className="element-spec-row"><span>Mekân Adı:</span> <strong>{room.name}</strong></div>
                    <div className="element-spec-row"><span>Alan:</span> <strong>{area.toFixed(2)} m²</strong></div>
                    <div className="element-spec-row"><span>Kat:</span> <strong>{selPage.name}</strong></div>
                    <div className="element-spec-row"><span>Kot:</span> <strong>{(selPage.kotElevationCm / 100).toFixed(2)} m</strong></div>
                    <div className="element-spec-row"><span>Yükseklik:</span> <strong>{room.height} cm</strong></div>
                    <div className="element-spec-row"><span>Zemin Kaplama:</span> <strong>{floorMat.label}</strong></div>
                  </>
                );
              })()}
            </div>
          </div>
        </aside>

        {/* Center 3D Canvas Container */}
        <div className="portal3d-canvas-wrapper">
          <div ref={mountRef} className="view3d-canvas-mount" />
          <div ref={overlayRef} className="view3d-label-overlay" />

          {/* Top-Left 3D Orientation Compass Cube (Gizmo) */}
          <div className="compass-cube-gizmo" onClick={resetCamera} title="3D Yön Küpü (360° Sürükle)">
            <div className="cube-inner">
              <span className="cube-text">&lt; 360° &gt;</span>
            </div>
          </div>

          {/* Top-Right Quick Action Buttons (Home, Zoom, Target) */}
          <div className="canvas-top-right-tools">
            <button
              className="canvas-tool-btn"
              title={showCeiling ? "Bu katın tavanını gizle (içini gör)" : "Bu katın tavanını göster"}
              onClick={toggleCeiling}
              style={showCeiling ? { background: "#2563eb", color: "#fff" } : undefined}
            >
              {showCeiling ? "🏠" : "🛖"}
            </button>
            <button className="canvas-tool-btn" title="Ana Görünüme Sıfırla" onClick={resetCamera}>
              ⌂
            </button>
            <button className="canvas-tool-btn" title="Yakınlaş" onClick={() => handleZoom(0.85)}>
              +
            </button>
            <button className="canvas-tool-btn" title="Uzaklaş" onClick={() => handleZoom(1.15)}>
              −
            </button>
            <button className="canvas-tool-btn" title="Merkezle" onClick={resetCamera}>
              🎯
            </button>
            <button
              className="canvas-tool-btn"
              title={sectionCutOn ? "Kesiti Kapat" : "Kesit Al (belirtilen yüksekliğin üstünü keser)"}
              onClick={() => setSectionCutOn((v) => !v)}
              style={sectionCutOn ? { background: "#2563eb", color: "#fff" } : undefined}
            >
              ✂
            </button>
          </div>
          {sectionCutOn && (
            <div
              style={{
                position: "absolute",
                top: 56,
                right: 12,
                background: "rgba(255,255,255,0.95)",
                border: "1px solid #cbd5e1",
                borderRadius: 8,
                padding: "8px 10px",
                fontSize: 11,
                color: "#334155",
                zIndex: 5,
                minWidth: 160,
              }}
            >
              <div style={{ marginBottom: 4 }}>Kesit Yüksekliği: {sectionCutHeightCm} cm</div>
              <input
                type="range"
                min={0}
                max={600}
                step={10}
                value={sectionCutHeightCm}
                onChange={(e) => setSectionCutHeightCm(Number(e.target.value))}
                style={{ width: "100%" }}
              />
            </div>
          )}

          {/* Bottom-Center Controls Bar (Döndür, Yaklaş, Kaydır, Uzaklaş) */}
          <div className="canvas-bottom-center-bar">
            <button className="bottom-bar-action" onClick={resetCamera}>
              <span>🎲</span> Döndür
            </button>
            <button className="bottom-bar-action" onClick={() => handleZoom(0.85)}>
              <span>📏</span> Yaklaş
            </button>
            <button className="bottom-bar-action">
              <span>✋</span> Kaydır
            </button>
            <button className="bottom-bar-action" onClick={() => handleZoom(1.15)}>
              <span>🔍</span> Uzaklaş
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function wallHeightFor(wallId: string, variant: FloorVariantData, defaultH = 280) {
  for (const room of Object.values(variant.rooms)) {
    if (room.wallLoop.includes(wallId) && room.height > 50) return room.height;
  }
  return defaultH;
}

const FLOOR_THICKNESS_CM = 8;
const CEILING_THICKNESS_CM = 10;
const STRUCTURAL_SLAB_THICKNESS_CM = 15;
const STRUCTURAL_SLAB_COLOR = 0x9a978c;

function buildFloorMeshes(
  group: THREE.Group,
  variant: FloorVariantData,
  baseZ: number,
  wallMaterials: ReturnType<typeof useStore.getState>["wallMaterials"],
  floorMaterials: ReturnType<typeof useStore.getState>["floorMaterials"],
  showCeiling: boolean,
  overlay: HTMLDivElement | null,
  labelEls: Map<string, HTMLDivElement>,
  showLabels: boolean,
  pageHeightCm = 280,
  pageId = ""
): { collisionWalls: CollisionWall[]; heightCm: number } {
  const wallCollision: CollisionWall[] = [];
  for (const wall of Object.values(variant.walls) as Wall[]) {
    const a = variant.corners[wall.a];
    const b = variant.corners[wall.b];
    if (!a || !b) continue;

    const wallLen = dist(a, b);
    const height = wallHeightFor(wall.id, variant, pageHeightCm);
    const rotY = Math.atan2(b.y - a.y, b.x - a.x);
    const dirX = wallLen > 0 ? (b.x - a.x) / wallLen : 1;
    const dirY = wallLen > 0 ? (b.y - a.y) / wallLen : 0;
    const wallColor =
      wall.source === "auto-detected" ? "#c1652f" : getMaterial(wallMaterials, wall.malzeme).color;
    const wallMat = new THREE.MeshStandardMaterial({ color: wallColor });

    const addWallBox = (s0: number, s1: number, y0: number, y1: number, material: THREE.Material = wallMat) => {
      const segLen = s1 - s0;
      if (segLen < 0.5 || y1 - y0 < 0.5 || wallLen < 1) return;
      const geo = new THREE.BoxGeometry(segLen, y1 - y0, wall.thickness);
      const mesh = new THREE.Mesh(geo, material);
      const midAlong = (s0 + s1) / 2;
      const midWorld = { x: a.x + dirX * midAlong, y: a.y + dirY * midAlong };
      const t3 = toThree(midWorld);
      mesh.position.set(t3.x, baseZ + y0 + (y1 - y0) / 2, t3.z);
      mesh.rotation.y = rotY;
      group.add(mesh);
    };

    const isBalconyWall =
      wall.malzeme === "korkuluk" ||
      Object.values(variant.rooms).some(
        (r) => (r.typeId === "balkon" || r.name.toLowerCase().includes("balkon")) && r.wallLoop.includes(wall.id)
      );

    if (isBalconyWall) {
      // 3B Açık Balkon Korkuluğu (90 cm metal korkuluk + barlar)
      const railingHeight = 90;
      const railMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.2 });
      const glassMat = new THREE.MeshStandardMaterial({ color: 0xbae6fd, transparent: true, opacity: 0.45 });

      const midWorld = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const t3 = toThree(midWorld);

      // Cam / Bar dolgu paneli
      const panelGeo = new THREE.BoxGeometry(wallLen * 0.98, railingHeight - 15, Math.max(3, wall.thickness * 0.3));
      const panel = new THREE.Mesh(panelGeo, glassMat);
      panel.position.set(t3.x, baseZ + 10 + (railingHeight - 15) / 2, t3.z);
      panel.rotation.y = rotY;
      group.add(panel);

      // Üst Küpeşte BARI
      const topBarGeo = new THREE.BoxGeometry(wallLen, 6, Math.max(6, wall.thickness * 0.6));
      const topBar = new THREE.Mesh(topBarGeo, railMat);
      topBar.position.set(t3.x, baseZ + railingHeight - 3, t3.z);
      topBar.rotation.y = rotY;
      group.add(topBar);

      // Alt Süpürgelik BARI
      const botBarGeo = new THREE.BoxGeometry(wallLen, 4, Math.max(5, wall.thickness * 0.5));
      const botBar = new THREE.Mesh(botBarGeo, railMat);
      botBar.position.set(t3.x, baseZ + 8, t3.z);
      botBar.rotation.y = rotY;
      group.add(botBar);

      // Dikey Korkuluk Dikmeleri (Her 45 cm'de bir dikme)
      const numPosts = Math.max(2, Math.floor(wallLen / 45));
      for (let i = 0; i <= numPosts; i++) {
        const offsetAlong = (i * wallLen) / numPosts;
        const postPt = { x: a.x + dirX * offsetAlong, y: a.y + dirY * offsetAlong };
        const pt3 = toThree(postPt);
        const postGeo = new THREE.BoxGeometry(4, railingHeight, 4);
        const postMesh = new THREE.Mesh(postGeo, railMat);
        postMesh.position.set(pt3.x, baseZ + railingHeight / 2, pt3.z);
        group.add(postMesh);
      }
      continue;
    }

    const allWallComponents = Object.values(variant.components)
      .filter(isWallPlaced)
      .filter((c) => c.konum.duvarId === wall.id);
    const openingSpans = allWallComponents
      .filter((c) => c.tip === "kapi" || c.tip === "pencere")
      .map((c) => {
        const width = Number(c.oznitelikler["genislik"] ?? 80);
        return {
          comp: c,
          start: Math.max(0, c.konum.offsetCm - width / 2),
          end: Math.min(wallLen, c.konum.offsetCm + width / 2),
        };
      })
      .sort((x, y) => x.start - y.start);

    let cursor = 0;
    const solidIntervals: [number, number][] = [];
    for (const span of openingSpans) {
      if (span.start > cursor) solidIntervals.push([cursor, span.start]);
      cursor = Math.max(cursor, span.end);
    }
    if (cursor < wallLen) solidIntervals.push([cursor, wallLen]);
    for (const [s0, s1] of solidIntervals) addWallBox(s0, s1, 0, height);

    const doorIntervals: [number, number][] = [];

    for (const span of openingSpans) {
      const { comp } = span;
      const segLen = span.end - span.start;
      if (segLen < 0.5) continue;
      const midAlong = (span.start + span.end) / 2;
      const midWorld = { x: a.x + dirX * midAlong, y: a.y + dirY * midAlong };
      const t3 = toThree(midWorld);
      const compHeight = Math.min(Number(comp.oznitelikler["yukseklik"] ?? (comp.tip === "kapi" ? 210 : 120)), height);

      if (comp.tip === "kapi") {
        doorIntervals.push([span.start, span.end]);
        if (compHeight < height) addWallBox(span.start, span.end, compHeight, height);
        const leafMat = new THREE.MeshStandardMaterial({ color: 0x8a5a34 });
        const leafGeo = new THREE.BoxGeometry(segLen * 0.98, compHeight, Math.max(wall.thickness * 0.9, 4));
        const leaf = new THREE.Mesh(leafGeo, leafMat);
        leaf.position.set(t3.x, baseZ + compHeight / 2, t3.z);
        leaf.rotation.y = rotY;
        group.add(leaf);
      } else {
        const sill = Math.min(Number(comp.oznitelikler["yukseklik_zeminden"] ?? 90), height);
        const windowTop = Math.min(sill + compHeight, height);
        if (sill > 0) addWallBox(span.start, span.end, 0, sill);
        if (windowTop < height) addWallBox(span.start, span.end, windowTop, height);
        const glassH = Math.max(1, windowTop - sill);
        const centerY = baseZ + sill + glassH / 2;
        const frameDepth = wall.thickness * 0.95;
        const openW = segLen * 0.99;

        const frameMat = new THREE.MeshStandardMaterial({ color: 0xe8e4dc });
        const barT = Math.max(4, Math.min(8, segLen * 0.06, glassH * 0.08));
        const addFrameBar = (w: number, h: number, offX: number, offY: number) => {
          const barGeo = new THREE.BoxGeometry(w, h, frameDepth);
          const bar = new THREE.Mesh(barGeo, frameMat);
          bar.position.set(t3.x + dirX * offX, centerY + offY, t3.z + -dirY * offX);
          bar.rotation.y = rotY;
          group.add(bar);
        };
        addFrameBar(openW, barT, 0, glassH / 2 - barT / 2);
        addFrameBar(openW, barT, 0, -glassH / 2 + barT / 2);
        addFrameBar(barT, glassH, -openW / 2 + barT / 2, 0);
        addFrameBar(barT, glassH, openW / 2 - barT / 2, 0);

        const glassMat = new THREE.MeshStandardMaterial({
          color: 0x9fc4d8,
          transparent: true,
          opacity: 0.45,
          side: THREE.DoubleSide,
        });
        const glassGeo = new THREE.BoxGeometry(
          Math.max(1, openW - barT * 2),
          Math.max(1, glassH - barT * 2),
          Math.max(1.5, wall.thickness * 0.15)
        );
        const glass = new THREE.Mesh(glassGeo, glassMat);
        glass.position.set(t3.x, centerY, t3.z);
        glass.rotation.y = rotY;
        group.add(glass);
      }
    }
    wallCollision.push({ a, b, thickness: wall.thickness, doorIntervals });
  }

  let maxRoomHeight = 0;
  for (const room of Object.values(variant.rooms)) {
    const poly = room.cornerLoop.map((id) => variant.corners[id]).filter(Boolean) as Corner[];
    if (poly.length < 3) continue;
    const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x, p.y)));

    const floorMaterial = getMaterial(floorMaterials, room.zeminMalzemesi);
    const floorGeo = new THREE.ExtrudeGeometry(shape, { depth: FLOOR_THICKNESS_CM, bevelEnabled: false });
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(floorMaterial.color) });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.y = baseZ - FLOOR_THICKNESS_CM;
    // Raycasting seçimi için: gerçek "Seçili Eleman" panelinin hangi odaya
    // tıklandığını bilmesi gerekiyor (§ "sahte statik kart değil").
    floorMesh.userData = { entityType: "room", roomId: room.id, pageId };
    group.add(floorMesh);

    const slabGeo = new THREE.ExtrudeGeometry(shape, { depth: STRUCTURAL_SLAB_THICKNESS_CM, bevelEnabled: false });
    slabGeo.rotateX(-Math.PI / 2);
    const slabMat = new THREE.MeshStandardMaterial({ color: STRUCTURAL_SLAB_COLOR, roughness: 0.95 });
    const slabMesh = new THREE.Mesh(slabGeo, slabMat);
    slabMesh.position.y = baseZ - FLOOR_THICKNESS_CM - STRUCTURAL_SLAB_THICKNESS_CM;
    group.add(slabMesh);

    if (showCeiling) {
      const ceilGeo = new THREE.ExtrudeGeometry(shape, { depth: CEILING_THICKNESS_CM, bevelEnabled: false });
      ceilGeo.rotateX(-Math.PI / 2);
      const ceilMat = new THREE.MeshStandardMaterial({
        color: 0xe6e2d8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.55,
      });
      const ceilMesh = new THREE.Mesh(ceilGeo, ceilMat);
      ceilMesh.position.y = baseZ + room.height;
      group.add(ceilMesh);
    }

    maxRoomHeight = Math.max(maxRoomHeight, room.height);

    if (showLabels && overlay) {
      const areaM2 = roomAreaM2(room, variant.corners);
      const centroid = poly.reduce((acc, p) => ({ x: acc.x + p.x / poly.length, y: acc.y + p.y / poly.length }), { x: 0, y: 0 });
      const t3 = toThree(centroid);
      const el = document.createElement("div");
      el.className = "room-label-3d";
      el.innerHTML = `<div class="room-label-3d-name">${room.name}</div><div class="room-label-3d-h">H=${room.height} cm</div><div class="room-label-3d-s">S=${areaM2.toFixed(2)} m²</div>`;
      (el as unknown as { _worldPos?: THREE.Vector3 })._worldPos = new THREE.Vector3(t3.x, baseZ + room.height + 40, t3.z);
      overlay.appendChild(el);
      labelEls.set(room.id, el);
    }
  }

  for (const comp of Object.values(variant.components)) {
    if (comp.konum.kind !== "zemin") continue;
    const width = Number(comp.oznitelikler["genislik"] ?? 60);
    const depth = Number(comp.oznitelikler["derinlik"] ?? 60);
    const objectHeight = Number(comp.oznitelikler["yukseklik"] ?? 45);
    const t3 = toThree(comp.konum);
    const rotationY = (-comp.konum.rotationDeg * Math.PI) / 180;

    if (comp.altTip === "merdiven") {
      const steps = 14;
      const stepDepth = depth / steps;
      const stepHeight = objectHeight / steps;
      const stairMat = new THREE.MeshStandardMaterial({ color: 0xb0a89c });
      const stairGroup = new THREE.Group();
      for (let i = 0; i < steps; i++) {
        const stepGeo = new THREE.BoxGeometry(width, stepHeight, stepDepth);
        const stepMesh = new THREE.Mesh(stepGeo, stairMat);
        stepMesh.position.set(0, stepHeight / 2 + i * stepHeight, -depth / 2 + stepDepth / 2 + i * stepDepth);
        stairGroup.add(stepMesh);
      }
      stairGroup.position.set(t3.x, baseZ, t3.z);
      stairGroup.rotation.y = rotationY;
      group.add(stairGroup);
      continue;
    }

    const isLight = comp.tip === "aydinlatma";
    const objH = isLight ? 8 : objectHeight;
    const geo = new THREE.BoxGeometry(width, objH, depth);
    const mat = new THREE.MeshStandardMaterial({ color: isLight ? 0xf5e6a8 : comp.altTip === "asansor" ? 0x7a8085 : 0x9c7a52 });
    const mesh = new THREE.Mesh(geo, mat);
    const mountY =
      comp.oznitelikler["yukseklik_zeminden"] !== undefined
        ? Number(comp.oznitelikler["yukseklik_zeminden"])
        : objH / 2 + 1;
    mesh.position.set(t3.x, baseZ + mountY, t3.z);
    mesh.rotation.y = rotationY;
    group.add(mesh);
  }

  return { collisionWalls: wallCollision, heightCm: maxRoomHeight > 0 ? maxRoomHeight : DEFAULT_WALL_HEIGHT };
}

function disposeGroup(group: THREE.Group) {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else obj.material.dispose();
    }
  });
}
