// RED-phase stub — empty form. GREEN replaces with name input + validation.
type Props = {
  initialValue?: string;
  onNext: (displayName: string) => void;
};

export function Step1Name(_props: Props) {
  return <form aria-label="Step 1: your name"><p>placeholder</p></form>;
}
