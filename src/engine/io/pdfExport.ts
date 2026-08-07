// 2D planı PDF olarak dışa aktarma. Aynı render2d.ts çizim fonksiyonlarını
// çevrimdışı bir canvas üzerinde tam kapsamda (tüm çizim sığacak şekilde)
// çalıştırıp tek bir görüntü olarak PDF'e gömer.

import type { FloorVariantData } from "../../data/model";
import { getRoomType, type RoomTypeConfig } from "../../data/roomTypes";
import {
  drawComponent,
  drawCornerHandle,
  drawDimension,
  drawFloorComponent,
  drawGrid,
  drawRoom,
  drawTextAnnotations,
  drawWall,
  type View2D,
} from "../drawing/render2d";

const PX_PER_CM = 3; // baskı kalitesi için 2D canvas'tan daha yüksek çözünürlük

export async function exportVariantAsPdf(variant: FloorVariantData, roomTypes: RoomTypeConfig[], floorName: string) {
  const corners = Object.values(variant.corners);
  if (corners.length === 0) {
    window.alert("Dışa aktarılacak bir çizim yok — önce duvar çizin.");
    return;
  }

  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const minX = Math.min(...xs) - 100;
  const maxX = Math.max(...xs) + 100;
  const minY = Math.min(...ys) - 100;
  const maxY = Math.max(...ys) + 100;
  const widthCm = Math.max(100, maxX - minX);
  const heightCm = Math.max(100, maxY - minY);

  const canvasW = Math.round(widthCm * PX_PER_CM);
  const canvasH = Math.round(heightCm * PX_PER_CM);
  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const view: View2D = {
    pxPerCm: PX_PER_CM,
    pan: { x: -minX * PX_PER_CM, y: -minY * PX_PER_CM },
    width: canvasW,
    height: canvasH,
  };

  drawGrid(ctx, view);

  for (const room of Object.values(variant.rooms)) {
    drawRoom(ctx, view, room, variant.corners, getRoomType(roomTypes, room.typeId), false);
  }

  for (const wall of Object.values(variant.walls)) {
    const a = variant.corners[wall.a];
    const b = variant.corners[wall.b];
    if (!a || !b) continue;
    drawWall(ctx, view, wall, a, b, false, false);
    drawDimension(ctx, view, a, b);
  }

  for (const comp of Object.values(variant.components)) {
    if (comp.konum.kind === "zemin") {
      const width = Number(comp.oznitelikler["genislik"] ?? 60);
      const depth = Number(comp.oznitelikler["derinlik"] ?? 60);
      drawFloorComponent(ctx, view, comp, comp.konum, comp.konum.rotationDeg, width, depth, false);
      continue;
    }
    const wall = variant.walls[comp.konum.duvarId];
    if (!wall) continue;
    const a = variant.corners[wall.a];
    const b = variant.corners[wall.b];
    if (!a || !b) continue;
    const width = Number(comp.oznitelikler["genislik"] ?? 80);
    drawComponent(ctx, view, comp, a, b, wall.thickness, width, comp.konum.offsetCm, false);
  }

  drawTextAnnotations(ctx, view, variant);

  for (const corner of Object.values(variant.corners)) {
    drawCornerHandle(ctx, view, corner, false, false);
  }

  const imgData = canvas.toDataURL("image/png");
  const orientation = canvasW >= canvasH ? "landscape" : "portrait";
  const { default: jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation, unit: "px", format: [canvasW, canvasH] });
  pdf.addImage(imgData, "PNG", 0, 0, canvasW, canvasH);
  pdf.save(`bilcad-${floorName.replace(/\s+/g, "_")}.pdf`);
}
