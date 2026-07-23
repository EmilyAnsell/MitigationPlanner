export const DialogHeader = ({
  content = "Header - what is this dialog box?",
}) => {
  return (
    <h3 className="justify-start mb-4 text-xl font-semibold">{content}</h3>
  );
};
