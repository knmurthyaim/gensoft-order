export default function Modal({ title, children, onClose, wide = true }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={"modal" + (wide ? " wide" : "")}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}
