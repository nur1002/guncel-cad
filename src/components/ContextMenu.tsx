// Genel amaçlı bağlam menüsü (§4.3). Duvara özel sabit kodlanmaz; hangi nesne
// tipine tıklandıysa o tipin eylem listesi verilerek yeniden kullanılır.

export interface ContextMenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface ContextMenuProps {
  x: number; // ekran koordinatı (canvas kapsayıcısına göre)
  y: number;
  title?: string;
  items: ContextMenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, title, items, onClose }: ContextMenuProps) {
  return (
    <>
      <div className="context-menu-backdrop" onPointerDown={onClose} />
      <div className="context-menu" style={{ left: x, top: y }}>
        {title && <div className="context-menu-title">{title}</div>}
        {items.map((item, i) => (
          <button
            key={i}
            className={`context-menu-item ${item.danger ? "context-menu-item--danger" : ""}`}
            disabled={item.disabled}
            onClick={() => {
              item.onSelect();
              onClose();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}
