export const DialogFooter = ({ content, buttonList = [] }) => {
  return (
    <div className="flex justify-end gap-2 mt-4">
      {content}
      {buttonList.map((button) => (
        <button
          key={button.label}
          className="px-3 py-1 bg-blue-600 rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
          onClick={button.onClick}
        >
          {button.label}
        </button>
      ))}
    </div>
  );
};
