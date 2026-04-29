type Props = {
  displayName: string | null;
};

export function PeatyGreeting({ displayName }: Props) {
  const greeting = displayName ? `Hi, ${displayName}!` : 'Hi there!';
  return (
    <section className="flex flex-col items-center text-center">
      <img
        src="/peaty/peat-start.jpg"
        alt="Peaty the parrot waving hello"
        width={192}
        height={192}
        className="rounded-full shadow-md"
      />
      <h2 className="mt-4 text-2xl font-semibold">{greeting}</h2>
      <p className="mt-1 text-stone-600">I&apos;m Peaty. Ready to learn?</p>
    </section>
  );
}
