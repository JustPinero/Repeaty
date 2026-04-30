import { useFeedback, type FeedbackInput } from './useFeedback';

type Props = FeedbackInput;

export function FeedbackPanel(props: Props) {
  const { text, isLoading } = useFeedback(props);
  if (isLoading) return <p className="text-sm text-stone-500">Thinking…</p>;
  if (!text) return null;
  return (
    <p
      role="status"
      className="rounded border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700"
    >
      {text}
    </p>
  );
}
