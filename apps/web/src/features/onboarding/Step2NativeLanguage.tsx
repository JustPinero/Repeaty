// RED-phase stub — empty form. GREEN replaces with native-language select.
type Props = {
  initialValue?: string;
  onNext: (languageCode: string) => void;
  onBack: () => void;
};

export function Step2NativeLanguage(_props: Props) {
  return <form aria-label="Step 2: your native language"><p>placeholder</p></form>;
}
