export const DialogHeader = ({ content }) => {
  return content !== undefined ? (
    <h3 className="justify-start mb-4 text-xl font-semibold">{content}</h3>
  ) : null;
};
