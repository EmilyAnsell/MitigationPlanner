export default function Dialog({ isDialogOpen, onCloseDialog }) {
  return (
    <>
      {isDialogOpen ? (
        <>
          <div
            className="fixed inset-0 bg-black/50"
            onClick={onCloseDialog}
          ></div>
          <div className="fixed p-6 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl left-1/2 top-1/2">
            <button
              className="px-3 py-1 bg-blue-600 rounded hover:bg-blue-700"
              onClick={onCloseDialog}
            >
              Close
            </button>
          </div>
        </>
      ) : null}
    </>
  );
}
