export default function Dialog({ isDialogOpen, onCloseDialog }) {
  return (
    <>
      {isDialogOpen ? (
        <>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={onCloseDialog}
          >
            <div
              className="fixed p-6 bg-gray-800 rounded-lg shadow-xl "
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="px-3 py-1 bg-blue-600 rounded hover:bg-blue-700"
                onClick={onCloseDialog}
              >
                Close
              </button>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
