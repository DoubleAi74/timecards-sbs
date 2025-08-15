import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen text-center p-8 bg-[url('/background.jpg')] bg-cover bg-center bg-no-repeat">
      {/* The change is in the line below */}
      <div className="max-w-2xl bg-slate-800/80 bg-opacity-30 rounded-md p-8">
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-white mb-6">
          Create Your custon Spongebob time cards
        </h1>
        <p className="text-lg md:text-xl text-gray-300 mb-10">
          Customise the text and choose bacground image to generate a classic
          sponebob style time card with the authentic voiceover.
        </p>
        <Link href="/spongebob-generator">
          <span className="bg-gradient-to-r from-blue-600 to-blue-800 text-white font-bold py-4 px-10 rounded-xl text-xl hover:from-blue-700 hover:to-blue-900 transition-all duration-300 ease-in-out transform hover:scale-105">
            Get Started
          </span>
        </Link>
      </div>
    </main>
  );
}
