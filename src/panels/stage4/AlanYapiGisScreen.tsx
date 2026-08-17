import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import * as THREE from "three";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { useStore } from "../../engine/core/store";
import { getMaterial } from "../../data/materials";
import { roomAreaM2 } from "../../engine/drawing/render2d";

type TkgmParcelFeature = {
  type: "Feature";
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
  properties: {
    ilAd?: string;
    ilceAd?: string;
    mahalleAd?: string;
    adaNo?: string;
    parselNo?: string;
    alan?: string;
    nitelik?: string;
    pafta?: string;
    [key: string]: unknown;
  };
};

type EmptyFeatureCollection = {
  type: "FeatureCollection";
  features: [];
};

const EMPTY_GEOJSON: EmptyFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

const primaryBtn: CSSProperties = {
  background: "var(--primary-blue)",
  color: "#ffffff",
  border: "none",
  borderRadius: 8,
  padding: "9px 16px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

const secondaryBtn: CSSProperties = {
  background: "#1e293b",
  color: "#e2e8f0",
  border: "1px solid #334155",
  borderRadius: 8,
  padding: "8px 14px",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

function escapeXml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

const TKGM_API = "/tkgm-api";

async function getTkgmParcel(
  lat: number,
  lon: number
): Promise<TkgmParcelFeature> {
  const url =
    `${TKGM_API}/parsel/` +
    `${encodeURIComponent(lat)}/` +
    `${encodeURIComponent(lon)}/`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`TKGM API HTTP ${response.status}`);
  }

  const data = await response.json();

  if (
    !data ||
    data.type !== "Feature" ||
    !data.geometry ||
    !data.geometry.type ||
    !data.geometry.coordinates
  ) {
    throw new Error(
      data?.Message ||
      "TKGM bu koordinatta geçerli bir parsel döndürmedi."
    );
  }

  return data as TkgmParcelFeature;
}

type ThreeLayerState = {
  map: maplibregl.Map | null;
  renderer: THREE.WebGLRenderer | null;
  scene: THREE.Scene | null;
  camera: THREE.Camera | null;
  root: THREE.Group | null;
  origin: [number, number];
  visible: boolean;

  rebuild: (
    pages: any[],
    floorMaterials: any,
    showBuilding: boolean
  ) => void;

  setOrigin: (lat: number, lon: number) => void;
};

function disposeObject(object: THREE.Object3D) {
  object.traverse((child: THREE.Object3D) => {
    const mesh = child as THREE.Mesh;

    if (mesh.geometry) {
      mesh.geometry.dispose();
    }

    if (mesh.material) {
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];

      materials.forEach((material) => {
        material.dispose();
      });
    }
  });
}

function createThreeBuildingLayer(
  originLat: number,
  originLon: number
): ThreeLayerState & {
  id: string;
  type: "custom";
  renderingMode: "3d";

  onAdd: (
    map: maplibregl.Map,
    gl: WebGLRenderingContext | WebGL2RenderingContext
  ) => void;

  onRemove: () => void;

  render: (
    gl: WebGLRenderingContext | WebGL2RenderingContext,
    args: any
  ) => void;
} {
  const layer: any = {
    id: "bilcad-building-3d",
    type: "custom",
    renderingMode: "3d",

    map: null,
    renderer: null,
    scene: null,
    camera: null,
    root: null,

    origin: [originLat, originLon] as [number, number],

    visible: true,

    rebuild: () => { },
    setOrigin: () => { },

    onAdd(
      map: maplibregl.Map,
      gl: WebGLRenderingContext | WebGL2RenderingContext
    ) {
      this.map = map;

      this.camera = new THREE.Camera();
      this.scene = new THREE.Scene();

      /*
       * MapLibre + Three.js koordinat dönüşümü.
       *
       * MapLibre tarafında:
       *   X = doğu
       *   Y = yukarı
       *   Z = kuzey
       *
       * Three.js footprint:
       *   X = doğu
       *   Y = yükseklik
       *   Z = kuzey
       */
      this.scene.rotateX(Math.PI / 2);
      this.scene.scale.multiply(
        new THREE.Vector3(1, 1, -1)
      );

      const ambient = new THREE.AmbientLight(
        0xffffff,
        1.7
      );

      this.scene.add(ambient);

      const keyLight = new THREE.DirectionalLight(
        0xffffff,
        2.0
      );

      keyLight.position.set(100, 180, 80);
      this.scene.add(keyLight);

      const fillLight = new THREE.DirectionalLight(
        0x9ecbff,
        0.7
      );

      fillLight.position.set(-100, 80, -100);
      this.scene.add(fillLight);

      this.root = new THREE.Group();
      this.scene.add(this.root);

      /*
       * MapLibre kendi WebGL context'ini kullanıyoruz.
       */
      this.renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl as WebGLRenderingContext,
        antialias: true,
      });

      this.renderer.autoClear = false;
      this.renderer.setPixelRatio(1);

      /*
       * Bina geometrisini yeniden oluştur.
       */
      this.rebuild = (
        pages: any[],
        floorMaterials: any,
        showBuilding: boolean
      ) => {
        if (!this.root) return;

        /*
         * Önce eski geometrileri tamamen temizle.
         */
        while (this.root.children.length > 0) {
          const child = this.root.children[0];

          disposeObject(child);

          this.root.remove(child);
        }

        this.visible = showBuilding;

        if (!showBuilding) {
          this.map?.triggerRepaint();
          return;
        }

        let hasRoomMesh = false;

        pages.forEach((page) => {
          if (!page?.visible) return;

          const baseZcm = Number(
            page.kotElevationCm ?? 0
          );

          const rooms = Object.values(
            page.drawing?.rooms ?? {}
          );

          const corners =
            page.drawing?.corners ?? {};

          rooms.forEach((room: any) => {
            if (
              !room?.cornerLoop ||
              room.cornerLoop.length < 3
            ) {
              return;
            }

            const shape = new THREE.Shape();

            let firstPoint:
              | { x: number; y: number }
              | null = null;

            let validPointCount = 0;

            room.cornerLoop.forEach(
              (cId: string, index: number) => {
                const c = corners[cId];

                if (!c) return;

                /*
                 * Uygulama çizim koordinatlarını cm kabul ediyoruz.
                 */
                const x =
                  Number(c.x ?? 0) / 100;

                const y =
                  Number(c.y ?? 0) / 100;

                if (index === 0) {
                  shape.moveTo(x, y);

                  firstPoint = {
                    x,
                    y,
                  };
                } else {
                  shape.lineTo(x, y);
                }

                validPointCount += 1;
              }
            );

            if (
              validPointCount < 3 ||
              !firstPoint
            ) {
              return;
            }

            shape.lineTo(
              firstPoint.x,
              firstPoint.y
            );

            const heightM = Math.max(
              Number(room.height ?? 270) / 100,
              0.1
            );

            const geometry =
              new THREE.ExtrudeGeometry(
                shape,
                {
                  depth: heightM,
                  bevelEnabled: false,
                  steps: 1,
                  curveSegments: 1,
                }
              );

            /*
             * XY footprint -> XZ footprint
             * Extrude Z -> yükseklik Y
             */
            geometry.rotateX(-Math.PI / 2);
            geometry.computeVertexNormals();

            const materialData = getMaterial(
              floorMaterials,
              room.zeminMalzemesi
            );

            const materialColor =
              materialData?.color ?? 0x38bdf8;

            const meshMaterial =
              new THREE.MeshStandardMaterial({
                color: materialColor,
                roughness: 0.62,
                metalness: 0.08,
              });

            const mesh = new THREE.Mesh(
              geometry,
              meshMaterial
            );

            /*
             * Kot cm -> metre
             */
            mesh.position.y =
              baseZcm / 100;

            this.root?.add(mesh);

            hasRoomMesh = true;
          });
        });

        /*
         * Uygulamada henüz oda/çizim geometrisi yoksa
         * küçük bir demo bina göster.
         */
        if (!hasRoomMesh) {
          const b1 = new THREE.Mesh(
            new THREE.BoxGeometry(
              16,
              8.5,
              12
            ),
            new THREE.MeshStandardMaterial({
              color: 0x5b3bb8,
              roughness: 0.5,
              metalness: 0.08,
            })
          );

          b1.position.y = 4.25;

          const b2 = new THREE.Mesh(
            new THREE.BoxGeometry(
              10,
              3,
              8
            ),
            new THREE.MeshStandardMaterial({
              color: 0x198fc5,
              roughness: 0.45,
              metalness: 0.08,
            })
          );

          b2.position.y = 10;

          this.root.add(b1, b2);
        }

        this.map?.triggerRepaint();
      };

      /*
       * Bina origin koordinatını değiştir.
       */
      this.setOrigin = (
        lat: number,
        lon: number
      ) => {
        this.origin = [lat, lon];

        this.map?.triggerRepaint();
      };
    },

    onRemove() {
      if (this.root) {
        disposeObject(this.root);
      }

      this.renderer?.dispose();

      this.root = null;
      this.scene = null;
      this.camera = null;
      this.renderer = null;
      this.map = null;
    },

    render(
      _gl: WebGLRenderingContext | WebGL2RenderingContext,
      args: any
    ) {
      if (
        !this.map ||
        !this.renderer ||
        !this.scene ||
        !this.camera ||
        !this.root ||
        !this.visible
      ) {
        return;
      }

      const [lat, lon] = this.origin;

      /*
       * Gerçek coğrafi origin -> Web Mercator.
       */
      const mercator =
        maplibregl.MercatorCoordinate.fromLngLat(
          [lon, lat],
          0
        );

      /*
       * Metre -> Web Mercator birim dönüşümü.
       */
      const meterScale =
        mercator.meterInMercatorCoordinateUnits();

      const modelMatrix =
        new THREE.Matrix4()
          .makeTranslation(
            mercator.x,
            mercator.y,
            mercator.z
          )
          .scale(
            new THREE.Vector3(
              meterScale,
              -meterScale,
              meterScale
            )
          );

      const projectionMatrix =
        new THREE.Matrix4().fromArray(
          args.defaultProjectionData.mainMatrix
        );

      this.camera.projectionMatrix =
        projectionMatrix.multiply(
          modelMatrix
        );

      /*
       * MapLibre state'ini bozmadan Three.js çiz.
       */
      this.renderer.resetState();

      this.renderer.render(
        this.scene,
        this.camera
      );

      this.map.triggerRepaint();
    },
  };

  return layer;
}

export default function AlanYapiGisScreen() {
  const setWorkflowStage = useStore(
    (s) => s.setWorkflowStage
  );

  const pages = useStore((s) => s.pages);
  const parsel = useStore((s) => s.parsel);
  const building = useStore((s) => s.building);
  const floorMaterials = useStore(
    (s) => s.floorMaterials
  );
  const pushToast = useStore(
    (s) => s.pushToast
  );

  /*
   * Varsayılan konum:
   * Samsun / İlkadım / Derebahçe
   */
  const [lat, setLat] = useState(41.26035);
  const [lon, setLon] = useState(36.32905);
  const [zoomLevel, setZoomLevel] = useState(18);

  const [tkgmParcel, setTkgmParcel] =
    useState<TkgmParcelFeature | null>(null);

  const [tkgmLoading, setTkgmLoading] =
    useState(false);

  const [tkgmError, setTkgmError] =
    useState<string | null>(null);

  const [
    showParselBoundary,
    setShowParselBoundary,
  ] = useState(true);

  const [
    showBuilding3D,
    setShowBuilding3D,
  ] = useState(true);

  const [mapOpacity, setMapOpacity] =
    useState(0.95);

  const mapMountRef =
    useRef<HTMLDivElement>(null);

  const mapRef =
    useRef<maplibregl.Map | null>(null);

  const threeLayerRef =
    useRef<
      ReturnType<
        typeof createThreeBuildingLayer
      > | null
    >(null);

  /*
   * MapLibre hazır olduğunda true olacak.
   *
   * Böylece React state'i ile MapLibre lifecycle
   * birbirine karışmıyor.
   */
  const [mapReady, setMapReady] =
    useState(false);

  /*
   * Toplam kat alanı.
   */
  const totalFloorAreaM2 = pages.reduce(
    (acc, p) => {
      return (
        acc +
        Object.values(
          p.drawing?.rooms ?? {}
        ).reduce(
          (
            rAcc: number,
            r: any
          ) => {
            return (
              rAcc +
              (r.manuelAlanM2 ??
                roomAreaM2(
                  r,
                  p.drawing?.corners ?? {}
                ))
            );
          },
          0
        )
      );
    },
    0
  );

  /*
   * Zemin kat.
   */
  const zeminPage =
    pages.find(
      (p) => p.id === "zemin_kat"
    ) ?? pages[0];

  /*
   * Taban alanı.
   */
  const tabanAlaniM2 = zeminPage
    ? Object.values(
      zeminPage.drawing?.rooms ?? {}
    ).reduce(
      (
        rAcc: number,
        r: any
      ) =>
        rAcc +
        (r.manuelAlanM2 ??
          roomAreaM2(
            r,
            zeminPage.drawing?.corners ??
            {}
          )),
      0
    )
    : 0;

  /*
   * Store'daki parsel alanı.
   * Store'da yoksa geçici fallback.
   */
  const parselM2 =
    parsel?.areaM2 ?? 5000;

  const taksOran =
    parselM2 > 0
      ? (
        tabanAlaniM2 /
        parselM2
      ).toFixed(3)
      : "0.000";

  const kaksOran =
    parselM2 > 0
      ? (
        totalFloorAreaM2 /
        parselM2
      ).toFixed(3)
      : "0.000";

  /*
   * ----------------------------------------------------
   * TKGM PARSEL SORGUSU
   * ----------------------------------------------------
   */
  useEffect(() => {
    let cancelled = false;

    async function loadParcel() {
      setTkgmLoading(true);
      setTkgmError(null);

      try {
        const feature =
          await getTkgmParcel(
            lat,
            lon
          );

        if (cancelled) return;

        setTkgmParcel(feature);

        console.log(
          "TKGM GERÇEK PARSEL:",
          feature
        );
      } catch (error) {
        if (cancelled) return;

        const message =
          error instanceof Error
            ? error.message
            : "TKGM parseli alınamadı.";

        setTkgmParcel(null);
        setTkgmError(message);

        console.error(
          "TKGM PARSEL HATASI:",
          error
        );
      } finally {
        if (!cancelled) {
          setTkgmLoading(false);
        }
      }
    }

    loadParcel();

    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  /*
   * ----------------------------------------------------
   * MAP INIT
   * ----------------------------------------------------
   *
   * Harita yalnızca bir kez oluşturulur.
   */
  useEffect(() => {
    const container =
      mapMountRef.current;

    if (!container) return;

    /*
     * Aynı component lifecycle içinde ikinci kez
     * harita oluşturulmasını engelle.
     */
    if (mapRef.current) {
      return;
    }

    const map =
      new maplibregl.Map({
        container,

        style: {
          version: 8,

          sources: {
            "raster-base": {
              type: "raster",
              tiles: [
                "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
              ],
              tileSize: 256,
              minzoom: 0,
              maxzoom: 18,
              attribution:
                "Tiles © Esri",
            },
          },

          layers: [
            {
              id: "background",
              type: "background",

              paint: {
                "background-color":
                  "#0f172a",
              },
            },

            {
              id: "raster-base",
              type: "raster",
              source: "raster-base",

              paint: {
                "raster-opacity":
                  mapOpacity,

                "raster-fade-duration": 0,
              },
            },
          ],
        } as any,

        center: [
          lon,
          lat,
        ],

        zoom: zoomLevel,

        pitch: 52,

        bearing: 0,

        maxPitch: 75,

        minZoom: 3,

        maxZoom: 23,

        attributionControl: {
          compact: true,
        },

        canvasContextAttributes: {
          antialias: true,
        },
      });

    mapRef.current = map;

    map.addControl(
      new maplibregl.NavigationControl(
        {
          visualizePitch: true,
          showCompass: true,
          showZoom: true,
        }
      ),
      "top-right"
    );

    /*
     * Harita yüklendi.
     */
    const handleLoad = () => {
      /*
       * ----------------------------------------------
       * PARSEL SOURCE
       * ----------------------------------------------
       */
      if (
        !map.getSource(
          "parcel-source"
        )
      ) {
        map.addSource(
          "parcel-source",
          {
            type: "geojson",
            data:
              tkgmParcel ??
              EMPTY_GEOJSON,
          } as any
        );
      }

      /*
       * ----------------------------------------------
       * PARSEL FILL
       * ----------------------------------------------
       */
      if (
        !map.getLayer(
          "parcel-fill"
        )
      ) {
        map.addLayer({
          id: "parcel-fill",
          type: "fill",
          source: "parcel-source",

          paint: {
            "fill-color":
              "#eab308",

            "fill-opacity":
              0.09,
          },
        } as any);
      }

      /*
       * ----------------------------------------------
       * PARSEL LINE
       * ----------------------------------------------
       */
      if (
        !map.getLayer(
          "parcel-line"
        )
      ) {
        map.addLayer({
          id: "parcel-line",
          type: "line",
          source: "parcel-source",

          paint: {
            "line-color":
              "#facc15",

            "line-width":
              2.5,

            "line-opacity":
              0.95,
          },
        } as any);
      }

      /*
       * ----------------------------------------------
       * THREE.JS BUILDING
       * ----------------------------------------------
       */
      const threeLayer =
        createThreeBuildingLayer(
          lat,
          lon
        );

      threeLayerRef.current =
        threeLayer;

      /*
       * Layer daha önce eklenmediyse ekle.
       */
      if (
        !map.getLayer(
          "bilcad-building-3d"
        )
      ) {
        map.addLayer(
          threeLayer as any
        );
      }

      /*
       * İlk bina oluşturma.
       */
      threeLayer.rebuild(
        pages,
        floorMaterials,
        showBuilding3D
      );

      /*
       * Map hazır.
       */
      setMapReady(true);

      /*
       * İlk görünüm.
       */
      map.resize();

      map.triggerRepaint();
    };

    const handleZoomEnd = () => {
      const currentZoom =
        map.getZoom();

      setZoomLevel(
        Math.round(currentZoom)
      );
    };

    map.on(
      "load",
      handleLoad
    );

    map.on(
      "zoomend",
      handleZoomEnd
    );

    /*
     * Container boyutu değişirse haritayı yeniden ölç.
     */
    const resizeObserver =
      new ResizeObserver(() => {
        map.resize();
      });

    resizeObserver.observe(
      container
    );

    return () => {
      resizeObserver.disconnect();

      map.off(
        "load",
        handleLoad
      );

      map.off(
        "zoomend",
        handleZoomEnd
      );

      /*
       * MapLibre custom layer'ın onRemove'u
       * burada çağrılacaktır.
       */
      map.remove();

      threeLayerRef.current =
        null;

      mapRef.current = null;

      setMapReady(false);
    };

    // Harita sadece mount'ta oluşturulur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * ----------------------------------------------------
   * MAP OPACITY
   * ----------------------------------------------------
   */
  useEffect(() => {
    const map =
      mapRef.current;

    if (
      !map ||
      !map.isStyleLoaded()
    ) {
      return;
    }

    if (
      map.getLayer(
        "raster-base"
      )
    ) {
      map.setPaintProperty(
        "raster-base",
        "raster-opacity",
        mapOpacity
      );
    }
  }, [mapOpacity]);

  /*
   * ----------------------------------------------------
   * TKGM PARSELİ MAPLIBRE'A AKTAR
   * ----------------------------------------------------
   */
  useEffect(() => {
    const map =
      mapRef.current;

    if (
      !map ||
      !mapReady ||
      !map.isStyleLoaded()
    ) {
      return;
    }

    const source =
      map.getSource(
        "parcel-source"
      ) as
      | maplibregl.GeoJSONSource
      | undefined;

    if (source) {
      source.setData(
        tkgmParcel ??
        EMPTY_GEOJSON
      );
    }

    const visibility =
      showParselBoundary
        ? "visible"
        : "none";

    if (
      map.getLayer(
        "parcel-line"
      )
    ) {
      map.setLayoutProperty(
        "parcel-line",
        "visibility",
        visibility
      );
    }

    if (
      map.getLayer(
        "parcel-fill"
      )
    ) {
      map.setLayoutProperty(
        "parcel-fill",
        "visibility",
        visibility
      );
    }
  }, [
    tkgmParcel,
    showParselBoundary,
    mapReady,
  ]);

  /*
   * ----------------------------------------------------
   * THREE.JS MODEL REBUILD
   * ----------------------------------------------------
   */
  useEffect(() => {
    if (
      !mapReady ||
      !threeLayerRef.current
    ) {
      return;
    }

    threeLayerRef.current.rebuild(
      pages,
      floorMaterials,
      showBuilding3D
    );
  }, [
    pages,
    floorMaterials,
    showBuilding3D,
    mapReady,
  ]);

  /*
   * ----------------------------------------------------
   * ORIGIN / HARİTA KONUMU SENKRONİZASYONU
   * ----------------------------------------------------
   */
  useEffect(() => {
    const map =
      mapRef.current;

    /*
     * Three.js layer hazırsa origin'i güncelle.
     */
    threeLayerRef.current?.setOrigin(
      lat,
      lon
    );

    if (!map) return;

    /*
     * MapLibre haritası mevcut konumdan
     * farklıysa konuma taşı.
     */
    const currentCenter =
      map.getCenter();

    const lonDifference =
      Math.abs(
        currentCenter.lng -
        lon
      );

    const latDifference =
      Math.abs(
        currentCenter.lat -
        lat
      );

    /*
     * Çok küçük farklarda gereksiz
     * easeTo çağrısı yapma.
     */
    if (
      lonDifference < 0.0000001 &&
      latDifference < 0.0000001
    ) {
      return;
    }

    map.easeTo({
      center: [
        lon,
        lat,
      ],
      duration: 500,
    });
  }, [lat, lon]);

  /*
   * ----------------------------------------------------
   * LAT CHANGE
   * ----------------------------------------------------
   */
  const handleLatChange = (
    value: string
  ) => {
    const next =
      Number.parseFloat(
        value
      );

    if (!Number.isFinite(next)) {
      return;
    }

    setLat(
      Math.max(
        -85,
        Math.min(85, next)
      )
    );
  };

  /*
   * ----------------------------------------------------
   * LON CHANGE
   * ----------------------------------------------------
   */
  const handleLonChange = (
    value: string
  ) => {
    const next =
      Number.parseFloat(
        value
      );

    if (!Number.isFinite(next)) {
      return;
    }

    setLon(
      Math.max(
        -180,
        Math.min(180, next)
      )
    );
  };

  /*
   * ----------------------------------------------------
   * ZOOM CHANGE
   * ----------------------------------------------------
   */
  const handleZoomChange = (
    value: string
  ) => {
    const next =
      Number.parseInt(
        value,
        10
      );

    if (!Number.isFinite(next)) {
      return;
    }

    const safeZoom =
      Math.max(
        3,
        Math.min(
          23,
          next
        )
      );

    setZoomLevel(
      safeZoom
    );

    mapRef.current?.easeTo({
      zoom: safeZoom,
      duration: 350,
    });
  };

  /*
   * ----------------------------------------------------
   * GO TO LOCATION
   * ----------------------------------------------------
   */
  const handleGoToLocation =
    () => {
      mapRef.current?.flyTo({
        center: [
          lon,
          lat,
        ],

        zoom:
          zoomLevel,

        pitch: 52,

        bearing: 0,

        duration: 900,
      });
    };

  /*
   * ----------------------------------------------------
   * CITYGML EXPORT
   * ----------------------------------------------------
   */
  const handleExportCityGML =
    () => {
      const safeName =
        escapeXml(
          building?.name ||
          "TKGM_Bina_Modeli"
        );

      const xml =
        `<?xml version="1.0" encoding="UTF-8"?>
<CityModel
  xmlns="http://www.opengis.net/citygml/2.0"
  xmlns:bldg="http://www.opengis.net/citygml/building/2.0"
  xmlns:gml="http://www.opengis.net/gml">

  <gml:name>${safeName}</gml:name>

  <cityObjectMember>
    <bldg:Building gml:id="Bldg_${Date.now()}">

      <bldg:class>
        Commercial/Residential
      </bldg:class>

      <bldg:function>
        1000
      </bldg:function>

      <bldg:roofType>
        Flat
      </bldg:roofType>

      <bldg:measuredHeight uom="m">
        11.60
      </bldg:measuredHeight>

      <bldg:storeysAboveGround>
        ${pages.length}
      </bldg:storeysAboveGround>

    </bldg:Building>
  </cityObjectMember>

</CityModel>`;

      const blob =
        new Blob(
          [xml],
          {
            type:
              "application/xml;charset=utf-8",
          }
        );

      const url =
        URL.createObjectURL(
          blob
        );

      const a =
        document.createElement(
          "a"
        );

      a.href = url;

      a.download =
        `bilCAD_CityGML_${Date.now()}.gml`;

      document.body.appendChild(
        a
      );

      a.click();

      a.remove();

      URL.revokeObjectURL(
        url
      );

      pushToast(
        "CityGML metadata dosyası başarıyla indirildi.",
        "basari"
      );
    };

  /*
   * ----------------------------------------------------
   * GEOJSON EXPORT
   * ----------------------------------------------------
   */
  const handleExportGeoJSON =
    () => {
      const geoJson =
        tkgmParcel;

      const featureCollection =
        geoJson
          ? {
            type:
              "FeatureCollection",
            features: [
              {
                ...geoJson,

                properties: {
                  ...geoJson.properties,

                  alanM2:
                    parselM2,
                },
              },
            ],
          }
          : {
            type:
              "FeatureCollection",
            features: [],
          };

      const blob =
        new Blob(
          [
            JSON.stringify(
              featureCollection,
              null,
              2
            ),
          ],
          {
            type:
              "application/geo+json;charset=utf-8",
          }
        );

      const url =
        URL.createObjectURL(
          blob
        );

      const a =
        document.createElement(
          "a"
        );

      a.href = url;

      a.download =
        `TKGM_Parsel_GeoJSON_${Date.now()}.geojson`;

      document.body.appendChild(
        a
      );

      a.click();

      a.remove();

      URL.revokeObjectURL(
        url
      );

      pushToast(
        tkgmParcel
          ? "TKGM Parsel GeoJSON dosyası indirildi."
          : "TKGM parseli bulunamadığı için boş GeoJSON oluşturuldu.",
        "basari"
      );
    };

  return (
    <div
      style={{
        display: "flex",
        flex: 1,
        height: "100%",
        background: "#0f172a",
        color: "#f8fafc",
        overflow: "hidden",
      }}
    >
      {/* =====================================================
          SOL PANEL
          ===================================================== */}
      <aside
        style={{
          width: "360px",
          background: "#0f172a",
          borderRight:
            "1px solid #1e293b",
          display: "flex",
          flexDirection: "column",
          padding: "16px",
          gap: "14px",
          overflowY: "auto",
          flexShrink: 0,
        }}
      >
        {/* HEADER */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent:
              "space-between",
          }}
        >
          <div>
            <h3
              style={{
                fontSize: "16px",
                fontWeight: 700,
                margin: 0,
                color: "#38bdf8",
              }}
            >
              🗺️ Alan / Yapı
              Bilgileri
            </h3>

            <span
              style={{
                fontSize: "11.5px",
                color: "#94a3b8",
              }}
            >
              Gerçek GIS Haritası
              & CityGML 3D Analiz
            </span>
          </div>

          <button
            style={secondaryBtn}
            onClick={() =>
              setWorkflowStage(
                "3d"
              )
            }
          >
            3B Görünüm ›
          </button>
        </div>

        {/* =====================================================
            PARSEL
            ===================================================== */}
        <div
          style={{
            background: "#1e293b",
            border:
              "1px solid #334155",
            borderRadius: "10px",
            padding: "14px",
          }}
        >
          <div
            style={{
              fontSize: "13px",
              fontWeight: 700,
              color: "#f8fafc",
              marginBottom: "10px",
              display: "flex",
              justifyContent:
                "space-between",
              alignItems: "center",
            }}
          >
            <span>
              🏛️ TKGM Parsel
              Bilgileri
            </span>

            <span
              style={{
                fontSize: "10.5px",
                background:
                  "#0284c7",
                color: "#fff",
                padding:
                  "2px 6px",
                borderRadius: "4px",
              }}
            >
              GIS
            </span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "1fr 1fr",
              gap: "8px",
              fontSize: "12px",
              color: "#cbd5e1",
            }}
          >
            {tkgmLoading && (
              <div
                style={{
                  gridColumn:
                    "span 2",
                  color:
                    "#38bdf8",
                  fontStyle:
                    "italic",
                }}
              >
                ⏳ TKGM parsel
                verisi
                sorgulanıyor...
              </div>
            )}

            {tkgmError && (
              <div
                style={{
                  gridColumn:
                    "span 2",
                  color:
                    "#ef4444",
                  fontSize:
                    "11px",
                }}
              >
                ⚠️ {tkgmError}
              </div>
            )}

            <div>
              İl:{" "}
              <strong
                style={{
                  color: "#fff",
                }}
              >
                {tkgmParcel
                  ?.properties
                  ?.ilAd ||
                  "Samsun"}
              </strong>
            </div>

            <div>
              İlçe:{" "}
              <strong
                style={{
                  color: "#fff",
                }}
              >
                {tkgmParcel
                  ?.properties
                  ?.ilceAd ||
                  "İlkadım"}
              </strong>
            </div>

            <div>
              Mahalle:{" "}
              <strong
                style={{
                  color: "#fff",
                }}
              >
                {tkgmParcel
                  ?.properties
                  ?.mahalleAd ||
                  "Derebahçe"}
              </strong>
            </div>

            <div>
              Pafta:{" "}
              <strong
                style={{
                  color: "#fff",
                }}
              >
                {tkgmParcel
                  ?.properties
                  ?.pafta ||
                  "-"}
              </strong>
            </div>

            <div>
              Ada:{" "}
              <strong
                style={{
                  color:
                    "#38bdf8",
                }}
              >
                {tkgmParcel
                  ?.properties
                  ?.adaNo ||
                  "3921"}
              </strong>
            </div>

            <div>
              Parsel:{" "}
              <strong
                style={{
                  color:
                    "#38bdf8",
                }}
              >
                {tkgmParcel
                  ?.properties
                  ?.parselNo ||
                  "13"}
              </strong>
            </div>

            <div
              style={{
                gridColumn:
                  "span 2",
              }}
            >
              Parsel Alanı:{" "}
              <strong
                style={{
                  color:
                    "#22c55e",
                }}
              >
                {tkgmParcel
                  ?.properties
                  ?.alan
                  ? `${tkgmParcel.properties.alan} m²`
                  : `${parselM2.toLocaleString()} m²`}
              </strong>
            </div>

            <div
              style={{
                gridColumn:
                  "span 2",
              }}
            >
              Nitelik:{" "}
              <strong
                style={{
                  color:
                    "#f59e0b",
                }}
              >
                {tkgmParcel
                  ?.properties
                  ?.nitelik ||
                  "Arsa"}
              </strong>
            </div>
          </div>
        </div>

        {/* =====================================================
            KONUM
            ===================================================== */}
        <div
          style={{
            background: "#1e293b",
            border:
              "1px solid #334155",
            borderRadius: "10px",
            padding: "14px",
          }}
        >
          <div
            style={{
              fontSize: "13px",
              fontWeight: 700,
              color: "#f8fafc",
              marginBottom: "10px",
            }}
          >
            📍 Coğrafi Konum
          </div>

          <div
            style={{
              display: "flex",
              flexDirection:
                "column",
              gap: "8px",
              fontSize: "12px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent:
                  "space-between",
                alignItems:
                  "center",
              }}
            >
              <span>
                Enlem (Lat /
                EPSG:4326):
              </span>

              <input
                type="number"
                step="0.000001"
                value={lat}
                onChange={(e) =>
                  handleLatChange(
                    e.target.value
                  )
                }
                style={{
                  width: "110px",
                  background:
                    "#0f172a",
                  border:
                    "1px solid #334155",
                  color: "#fff",
                  borderRadius:
                    "4px",
                  padding:
                    "5px 6px",
                }}
              />
            </div>

            <div
              style={{
                display: "flex",
                justifyContent:
                  "space-between",
                alignItems:
                  "center",
              }}
            >
              <span>
                Boylam (Lon /
                EPSG:4326):
              </span>

              <input
                type="number"
                step="0.000001"
                value={lon}
                onChange={(e) =>
                  handleLonChange(
                    e.target.value
                  )
                }
                style={{
                  width: "110px",
                  background:
                    "#0f172a",
                  border:
                    "1px solid #334155",
                  color: "#fff",
                  borderRadius:
                    "4px",
                  padding:
                    "5px 6px",
                }}
              />
            </div>

            <div
              style={{
                display: "flex",
                justifyContent:
                  "space-between",
                alignItems:
                  "center",
              }}
            >
              <span>
                Zoom Seviyesi:
              </span>

              <select
                value={zoomLevel}
                onChange={(e) =>
                  handleZoomChange(
                    e.target.value
                  )
                }
                style={{
                  background:
                    "#0f172a",
                  border:
                    "1px solid #334155",
                  color: "#fff",
                  borderRadius:
                    "4px",
                  padding:
                    "5px 6px",
                }}
              >
                <option value={16}>
                  16
                </option>

                <option value={17}>
                  17
                </option>

                <option value={18}>
                  18
                </option>

                <option value={19}>
                  19
                </option>

                <option value={20}>
                  20
                </option>

                <option value={21}>
                  21
                </option>
              </select>
            </div>

            <button
              style={{
                ...secondaryBtn,
                justifyContent:
                  "center",
                width: "100%",
              }}
              onClick={
                handleGoToLocation
              }
            >
              📍 Konuma Git
            </button>

            <div
              style={{
                background:
                  "#0f172a",
                padding: "8px",
                borderRadius:
                  "6px",
                fontSize: "11px",
                color: "#94a3b8",
              }}
            >
              Harita motoru:{" "}
              <strong
                style={{
                  color:
                    "#38bdf8",
                }}
              >
                MapLibre GL +
                Web Mercator
              </strong>
            </div>
          </div>
        </div>

        {/* =====================================================
            ANALİZ
            ===================================================== */}
        <div
          style={{
            background: "#1e293b",
            border:
              "1px solid #334155",
            borderRadius: "10px",
            padding: "14px",
          }}
        >
          <div
            style={{
              fontSize: "13px",
              fontWeight: 700,
              color: "#f8fafc",
              marginBottom: "10px",
              display: "flex",
              justifyContent:
                "space-between",
            }}
          >
            <span>
              🏢 İmar & Yapı
              Analizi
            </span>

            <span
              style={{
                fontSize: "10.5px",
                background:
                  "#16a34a",
                color: "#fff",
                padding:
                  "2px 6px",
                borderRadius: "4px",
              }}
            >
              Uygun
            </span>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection:
                "column",
              gap: "6px",
              fontSize: "12px",
              color: "#cbd5e1",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent:
                  "space-between",
              }}
            >
              <span>
                Taban Alanı
                (TAB):
              </span>

              <strong
                style={{
                  color: "#fff",
                }}
              >
                {tabanAlaniM2.toFixed(
                  2
                )}{" "}
                m²
              </strong>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent:
                  "space-between",
              }}
            >
              <span>
                TAKS Oranı:
              </span>

              <strong
                style={{
                  color:
                    parseFloat(
                      taksOran
                    ) <= 0.35
                      ? "#22c55e"
                      : "#ef4444",
                }}
              >
                {taksOran} / 0.350
              </strong>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent:
                  "space-between",
              }}
            >
              <span>
                Toplam Yapı
                Alanı:
              </span>

              <strong
                style={{
                  color: "#fff",
                }}
              >
                {totalFloorAreaM2.toFixed(
                  2
                )}{" "}
                m²
              </strong>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent:
                  "space-between",
              }}
            >
              <span>
                KAKS / EMSAL:
              </span>

              <strong
                style={{
                  color:
                    "#38bdf8",
                }}
              >
                {kaksOran} / 1.500
              </strong>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent:
                  "space-between",
              }}
            >
              <span>
                Bina
                Yüksekliği:
              </span>

              <strong
                style={{
                  color: "#fff",
                }}
              >
                11.60 m
              </strong>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent:
                  "space-between",
              }}
            >
              <span>
                3D Motor:
              </span>

              <strong
                style={{
                  color:
                    "#eab308",
                }}
              >
                Three.js Custom
                Layer
              </strong>
            </div>
          </div>
        </div>

        {/* =====================================================
            EXPORT
            ===================================================== */}
        <div
          style={{
            background: "#1e293b",
            border:
              "1px solid #334155",
            borderRadius: "10px",
            padding: "14px",
            display: "flex",
            flexDirection:
              "column",
            gap: "8px",
          }}
        >
          <div
            style={{
              fontSize: "13px",
              fontWeight: 700,
              color: "#f8fafc",
              marginBottom: "4px",
            }}
          >
            📥 GIS & 3D Veri
            İhraç
          </div>

          <button
            style={primaryBtn}
            onClick={
              handleExportCityGML
            }
          >
            🏛️ CityGML Metadata
            İndir (.gml)
          </button>

          <button
            style={secondaryBtn}
            onClick={
              handleExportGeoJSON
            }
          >
            🗺️ Parsel GeoJSON
            İndir
          </button>
        </div>
      </aside>

      {/* =====================================================
          SAĞ HARİTA
          ===================================================== */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection:
            "column",
          position: "relative",
          overflow: "hidden",
          minWidth: 0,
        }}
      >
        {/* ===================================================
            ÜST KONTROL BAR
            =================================================== */}
        <div
          style={{
            position: "absolute",
            top: "16px",
            left: "16px",
            right: "16px",
            zIndex: 10,
            background:
              "rgba(15, 23, 42, 0.88)",
            backdropFilter:
              "blur(8px)",
            border:
              "1px solid #334155",
            borderRadius: "10px",
            padding:
              "10px 14px",
            display: "flex",
            alignItems:
              "center",
            justifyContent:
              "space-between",
            gap: "12px",
            boxShadow:
              "0 8px 20px rgba(0,0,0,0.3)",
            flexWrap:
              "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems:
                "center",
              gap: "7px",
              flexWrap:
                "wrap",
            }}
          >
            <span
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color:
                  "#38bdf8",
              }}
            >
              🌐 TKGM Kadastro
              Servisi
              Entegrasyonu
            </span>

            {!mapReady && (
              <span
                style={{
                  fontSize:
                    "10px",
                  color:
                    "#f59e0b",
                }}
              >
                Harita
                hazırlanıyor...
              </span>
            )}
          </div>

          <div
            style={{
              display: "flex",
              alignItems:
                "center",
              gap: "12px",
              flexWrap:
                "wrap",
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems:
                  "center",
                gap: "6px",
                fontSize: "12px",
                cursor:
                  "pointer",
                color:
                  "#e2e8f0",
              }}
            >
              <input
                type="checkbox"
                checked={
                  showParselBoundary
                }
                onChange={(e) =>
                  setShowParselBoundary(
                    e.target
                      .checked
                  )
                }
                style={{
                  accentColor:
                    "#eab308",
                }}
              />

              <span>
                🟨 Parsel
              </span>
            </label>

            <label
              style={{
                display: "flex",
                alignItems:
                  "center",
                gap: "6px",
                fontSize: "12px",
                cursor:
                  "pointer",
                color:
                  "#e2e8f0",
              }}
            >
              <input
                type="checkbox"
                checked={
                  showBuilding3D
                }
                onChange={(e) =>
                  setShowBuilding3D(
                    e.target
                      .checked
                  )
                }
                style={{
                  accentColor:
                    "#38bdf8",
                }}
              />

              <span>
                🏢 3B Bina
              </span>
            </label>

            <div
              style={{
                display: "flex",
                alignItems:
                  "center",
                gap: "6px",
                fontSize: "12px",
              }}
            >
              <span>
                Opaklık:
              </span>

              <input
                type="range"
                min="0.2"
                max="1"
                step="0.05"
                value={
                  mapOpacity
                }
                onChange={(e) =>
                  setMapOpacity(
                    Number.parseFloat(
                      e.target
                        .value
                    )
                  )
                }
                style={{
                  width: "70px",
                  cursor:
                    "pointer",
                }}
              />
            </div>
          </div>
        </div>

        {/* ===================================================
            MAPLIBRE CONTAINER
            =================================================== */}
        <div
          ref={mapMountRef}
          style={{
            width: "100%",
            height: "100%",
            position: "relative",
            background:
              "#0f172a",
          }}
        />

        {/* ===================================================
            ALT BİLGİ
            =================================================== */}
        <div
          style={{
            position: "absolute",
            left: 16,
            bottom: 16,
            zIndex: 5,
            maxWidth: 390,
            padding:
              "8px 10px",
            borderRadius: 8,
            background:
              "rgba(15,23,42,.82)",
            border:
              "1px solid rgba(148,163,184,.25)",
            color:
              "#cbd5e1",
            fontSize: 11,
            lineHeight: 1.35,
            pointerEvents:
              "none",
          }}
        >
          <strong
            style={{
              color:
                "#38bdf8",
            }}
          >
            Gerçek GIS
            haritası
          </strong>{" "}
          MapLibre tarafından
          viewport'a göre
          yükleniyor.

          <br />

          {tkgmParcel ? (
            <>
              TKGM parsel
              polygonu gerçek
              kadastro
              geometrisi olarak
              gösteriliyor.
            </>
          ) : (
            <>
              TKGM parsel
              geometrisi henüz
              alınamadı.
            </>
          )}
        </div>
      </main>
    </div>
  );
}