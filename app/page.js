import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen text-center p-8">
      <div className="max-w-2xl">
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-white mb-6">
          Create Your Own Meme Videos
        </h1>
        <p className="text-lg md:text-xl text-gray-300 mb-10">
          Combine any image with text-to-speech to generate a classic-style time
          card video. Upload a picture or choose a preset, type your message,
          and let the magic happen.
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
