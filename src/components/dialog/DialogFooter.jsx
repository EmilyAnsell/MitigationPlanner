const BUTTON_VARIANT_CLASSES = {
  primary: "bg-blue-600 hover:bg-blue-700 focus:ring-blue-400",
  secondary: "bg-gray-600 hover:bg-gray-700 focus:ring-gray-400",
  danger: "bg-red-600 hover:bg-red-700 focus:ring-red-400",
};

export const DialogFooter = ({ content, buttonList = [] }) => {
  return (
    <div className="flex justify-end gap-2 mt-4">
      {content}
      {buttonList.map((button) => (
        <button
          key={button.label}
          className={`px-3 py-1 rounded focus:outline-none focus:ring-2 ${BUTTON_VARIANT_CLASSES[button.variant] ?? BUTTON_VARIANT_CLASSES.primary}`}
          onClick={button.onClick}
        >
          {button.label}
        </button>
      ))}
    </div>
  );
};
